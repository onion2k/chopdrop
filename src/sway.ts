/**
 * The trees in the helicopter's downwash: each one the wash reaches leans
 * away from under the hub, is pressed down a little right under it, and
 * flutters while the wash is on it; when the wash goes, it springs back
 * upright, swinging past it once or twice. Only the trees that are moving
 * are kept, in a pool sized once, and each is let go the moment it is still
 * and the wash is off it. The rest stand as they were built.
 *
 * It is stepped with the game, on its fixed step and its clock, and draws on
 * no chance, so the same flight bows the same trees the same way every run.
 * It is handed the trees as numbers and how much each kind gives; what a
 * tree looks like is the scene's, which leans it by what is here. Without it
 * the island would stand stock still under a helicopter hovering over it.
 */
import { DOWNWASH, washAt, washStrength, type Wash, type WashSource } from './downwash';
import { TreeGrid, type GridTrees } from './tree-grid';

/** How a tree takes the wash. A lean is how far its top moves across the ground, as a share of its height. */
export const SWAY = {
  /**
   * The most trees that may be moving at once: more than three times the most seen, 150, flying low through the
   * thickest wood at top speed every way across it. A test holds the most seen to two thirds of this.
   */
  capacity: 512,
  /** How far a tree that gives one leans in the wash at its strongest, and how far it is pressed down under the hub. */
  lean: 0.18,
  squash: 0.08,
  /** How much the wash flutters, as a share of it, and how fast. */
  flutter: 0.25,
  flutterHz: 3,
  /** How fast a tree springs back, and how little it is held, so that it swings past upright once or twice. */
  hz: 1,
  damping: 0.25,
  /** How little a tree may lean and swing, all told, as a share of its height, to be still: a centimetre and a half on the tallest. */
  still: 1e-3,
  /** The size of the squares the trees are sorted into, so those near the helicopter are found without looking at the rest. */
  cell: 16,
};

/** The trees a sway is handed: `stride` floats a tree (kind, x, y, z, yaw, scale, …), the world's edge, and how much each kind gives, by its index. */
export interface SwayTrees extends GridTrees {
  give: readonly number[];
}

export class Sway {
  /** The most trees it keeps moving at once. */
  readonly capacity: number;
  /** How many are moving now: the first `count` of each pool. */
  count = 0;
  /** Which tree each place in the pool holds. */
  readonly tree: Int32Array;
  /** Each moving tree's lean, each way across the ground, and how far it is pressed down, as shares of its height. */
  readonly leanX: Float32Array;
  readonly leanY: Float32Array;
  readonly squash: Float32Array;
  /** How fast each is leaning and being pressed, a second. */
  readonly leanXRate: Float32Array;
  readonly leanYRate: Float32Array;
  readonly squashRate: Float32Array;
  /**
   * The most a tree can lean or be pressed. The wash asks at most `lean` (or `squash`) times the most a kind gives,
   * beaten up by the flutter; a spring held as lightly as this one carries what it is asked to at most 2.6 times
   * over, however the asking swings (the sum of its impulse response, coth(πζ / 2√(1 − ζ²)), at ζ of a quarter).
   * Past that, the spring has come apart.
   */
  readonly maxLean: number;
  readonly maxSquash: number;
  /** How many trees the wash reached when there was no room for them in the pool, all told: none, on this island. */
  missed = 0;
  /** The wash it was last stepped in, copied: what each tree it holds was held for, whatever has moved since. */
  readonly source: WashSource = { x: 0, y: 0, z: 0, rotorSpeed: 0 };
  private readonly slots: Int32Array;
  /** The trees sorted into squares of `SWAY.cell`, so those in the wash are found without looking at the rest. */
  private readonly grid: TreeGrid;
  /** The wash at a tree, written into and read back, so a step makes none. */
  private readonly wash: Wash = { x: 0, y: 0, down: 0 };

  constructor(
    readonly trees: SwayTrees,
    capacity = SWAY.capacity,
  ) {
    this.capacity = capacity;
    this.tree = new Int32Array(capacity);
    this.leanX = new Float32Array(capacity);
    this.leanY = new Float32Array(capacity);
    this.squash = new Float32Array(capacity);
    this.leanXRate = new Float32Array(capacity);
    this.leanYRate = new Float32Array(capacity);
    this.squashRate = new Float32Array(capacity);
    const most = Math.max(...trees.give);
    this.maxLean = SPRING_GAIN * SWAY.lean * most * (1 + SIDE * SWAY.flutter + SWAY.flutter);
    this.maxSquash = SPRING_GAIN * SWAY.squash * most * (1 + SWAY.flutter);
    this.slots = new Int32Array(trees.count).fill(-1);
    this.grid = new TreeGrid(trees, SWAY.cell);
  }

  /** Where in the pool a tree is, or −1 if it is standing still. */
  slot(tree: number): number {
    return this.slots[tree];
  }

  /**
   * Whether the tree in a place in the pool has all but stopped: its lean and press, and how far it would swing on
   * how fast it is going, all told, under `SWAY.still`.
   */
  still(slot: number): boolean {
    const swing =
      (Math.abs(this.leanXRate[slot]) + Math.abs(this.leanYRate[slot]) + Math.abs(this.squashRate[slot])) / OMEGA;
    return Math.abs(this.leanX[slot]) + Math.abs(this.leanY[slot]) + Math.abs(this.squash[slot]) + swing < SWAY.still;
  }

  /** One step of `dt` seconds, at game time `t`, in the wash from `source`. Allocates nothing. */
  step(dt: number, source: Readonly<WashSource>, t: number): void {
    this.source.x = source.x;
    this.source.y = source.y;
    this.source.z = source.z;
    this.source.rotorSpeed = source.rotorSpeed;
    if (washStrength(source.rotorSpeed) > 0) this.takeIn(source);
    const { trees, stride, give } = this.trees;
    const w = this.wash;
    const pull = OMEGA * OMEGA;
    const hold = 2 * SWAY.damping * OMEGA;
    const beatAt = 2 * Math.PI * SWAY.flutterHz * t;
    for (let k = 0; k < this.count; k++) {
      const o = this.tree[k] * stride;
      washAt(source, trees[o + 1], trees[o + 2], trees[o + 3], w);
      let toX = 0,
        toY = 0,
        toSquash = 0;
      const blown = w.x !== 0 || w.y !== 0 || w.down !== 0;
      if (blown) {
        // the flutter: the wash beating harder and softer, and shaking the tree a little across it, each tree at its
        // own phase, taken from which way it was planted so no chance is drawn
        const yaw = trees[o + 4];
        const amount = SWAY.lean * give[trees[o]];
        const beat = 1 + SWAY.flutter * Math.sin(beatAt + 3 * yaw);
        const shake = SIDE * SWAY.flutter * Math.hypot(w.x, w.y) * Math.sin(SHAKE * beatAt + 5 * yaw);
        toX = amount * (w.x * beat + shake * Math.cos(yaw));
        toY = amount * (w.y * beat + shake * Math.sin(yaw));
        toSquash = SWAY.squash * give[trees[o]] * w.down * beat;
      }
      // a spring toward that, its speed stepped before its place so it holds steady at this step
      this.leanXRate[k] += (pull * (toX - this.leanX[k]) - hold * this.leanXRate[k]) * dt;
      this.leanYRate[k] += (pull * (toY - this.leanY[k]) - hold * this.leanYRate[k]) * dt;
      this.squashRate[k] += (pull * (toSquash - this.squash[k]) - hold * this.squashRate[k]) * dt;
      this.leanX[k] += this.leanXRate[k] * dt;
      this.leanY[k] += this.leanYRate[k] * dt;
      this.squash[k] += this.squashRate[k] * dt;
      if (!blown && this.still(k)) this.letGo(k--);
    }
  }

  /** Every standing tree the wash reaches now, put in the pool to move, while there is room. */
  private takeIn(source: Readonly<WashSource>): void {
    const { trees, stride } = this.trees;
    const w = this.wash;
    const r = DOWNWASH.reach;
    const grid = this.grid;
    const i0 = grid.col(source.x - r),
      i1 = grid.col(source.x + r);
    const j0 = grid.row(source.y - r),
      j1 = grid.row(source.y + r);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = grid.at(i, j);
        for (let n = grid.cellStart[c]; n < grid.cellStart[c + 1]; n++) {
          const t = grid.cellTrees[n];
          if (this.slots[t] >= 0) continue;
          const o = t * stride;
          washAt(source, trees[o + 1], trees[o + 2], trees[o + 3], w);
          if (w.x === 0 && w.y === 0 && w.down === 0) continue;
          if (this.count === this.capacity) {
            this.missed++;
            continue;
          }
          const k = this.count++;
          this.tree[k] = t;
          this.slots[t] = k;
          this.zero(k);
        }
      }
    }
  }

  /** The tree in place `k` stood up, exactly, and the last in the pool moved into its place. */
  private letGo(k: number): void {
    this.slots[this.tree[k]] = -1;
    const last = --this.count;
    if (k !== last) {
      this.tree[k] = this.tree[last];
      this.slots[this.tree[k]] = k;
      this.leanX[k] = this.leanX[last];
      this.leanY[k] = this.leanY[last];
      this.squash[k] = this.squash[last];
      this.leanXRate[k] = this.leanXRate[last];
      this.leanYRate[k] = this.leanYRate[last];
      this.squashRate[k] = this.squashRate[last];
    }
    this.zero(last);
  }

  private zero(k: number): void {
    this.leanX[k] = this.leanY[k] = this.squash[k] = 0;
    this.leanXRate[k] = this.leanYRate[k] = this.squashRate[k] = 0;
  }
}

/**
 * The most a tree of `give` leans in play, as a share of its height: what the wash asks of it at its strongest,
 * beaten up by the flutter, and carried past that once by the spring's swing, 1.44 times at a damping of a quarter.
 * What keeps clear of a crown keeps this clear of it; a test holds the leans seen to it.
 */
export function reachedLean(give: number): number {
  return SWAY.lean * give * (1 + SIDE * SWAY.flutter + SWAY.flutter) * SWING;
}

/** How far a spring held at `SWAY.damping` carries past what it is asked, once: e^(−πζ / √(1 − ζ²)) over one. */
const SWING = 1 + Math.exp((-Math.PI * SWAY.damping) / Math.sqrt(1 - SWAY.damping * SWAY.damping));

/** How fast a tree springs, in radians a second. */
const OMEGA = 2 * Math.PI * SWAY.hz;
/** How hard the flutter shakes a tree across the wash, against how hard it beats along it, and how much faster. */
const SIDE = 0.6;
const SHAKE = 1.37;
/** The most a spring held at `SWAY.damping` carries what it is asked to, over: see `maxLean`. */
const SPRING_GAIN = 2.6;
