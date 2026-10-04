/**
 * The water the helicopter carries: a tank filled by skimming low and fast over open water, and emptied by a drop on
 * a fire. Open water is a lake or the sea by the island's own maps, and never a river, which is too narrow to skim;
 * the scoop and the drop are windows in where the helicopter is, held here as pure helpers so that the game, the
 * rules and the tests ask the same question. Without it there is nothing to put a fire out with.
 *
 * The tank is the helicopter's and not a level's: it is kept through a level begun, finished or given up.
 */
/**
 * The water the helicopter carries: a tank filled by putting the bucket into open water for a while, and emptied by a
 * drop on a fire. Open water is a lake or the sea by the island's own maps, and never a river, which is too narrow to
 * fill a bucket in; every water, a river too, is one the helicopter holds a hover over and never lands on. The fill and the drop are
 * windows in where the helicopter and its bucket are, held here as pure helpers so that the game, the rules and the
 * tests ask the same question. Without it there is nothing to put a fire out with, and a helicopter could be landed
 * in a lake.
 *
 * The tank is the helicopter's and not a level's: it is kept through a level begun, finished or given up, and through
 * the bucket being taken in.
 */
import { SEA, type Island } from './island';
import type { GroundAt, Lander, Point3 } from './mission';

/**
 * What fills the tank: the bucket put out, with its bottom under the surface of open water, for `time` seconds, at any
 * speed. Leaving the water starts the fill over.
 */
export const SCOOP = { time: 2 };

/**
 * What empties it, and how. A drop starts with the bucket out and a full tank, the helicopter's middle within `over` of
 * a burning patch across and its skids within `high` of the ground under it (high enough that the bucket's line clears
 * the treetops). Then it pours for `pour` seconds, the tank empty from the first step, and on every step of the pour each
 * burning patch within `splash` of the helicopter's middle goes out, whatever the helicopter does meanwhile. It starts
 * only over the flames, and not at the fire's edge, so that the pour is spent sweeping the fire and not the grass beside it.
 */
export const DROP = { high: 40, over: 5, splash: 16, pour: 0.9 };

/** The level of the water where there is none: nothing is within reach of it, and a comparison with it is false. */
export const NO_WATER = -Infinity;

/**
 * How far over the water's surface the ground is taken to be still dry: the ground under open water is its surface to
 * within a rounding of the grid's floats, and a beach in a square of the shallows is higher than that.
 */
const WET = 0.01;

/**
 * Whether (x, y) is on a beach and not on the water, though the island's maps say its square is water: the ground there
 * is above the water's own level. The one rule for open water and for every water, so a bucket is never filled from a
 * beach and a helicopter is never held in the air over one.
 */
function beach(heightAt: GroundAt, level: number, x: number, y: number): boolean {
  return heightAt(x, y) > level + WET;
}

/**
 * Whether a drop from `h` starts over `patch`: its middle within `DROP.over` across of it, and its skids within
 * `DROP.high` of the ground under the helicopter (which the bucket hangs over), not the ground under the patch.
 */
export function inDrop(
  h: Readonly<Pick<Lander, 'x' | 'y' | 'z'>>,
  patch: Readonly<Point3>,
  groundAt: GroundAt,
): boolean {
  if (Math.hypot(h.x - patch.x, h.y - patch.y) > DROP.over) return false;
  return h.z - groundAt(h.x, h.y) <= DROP.high;
}

export class Tank {
  /** Whether it is full: one fill makes it so, and one drop empties it. */
  full = false;
  /** The seconds of the fill so far, from 0 to short of `SCOOP.time`; 0 while the tank is full. */
  filling = 0;

  /**
   * One step of `dt` seconds with `submerged` whether the bucket is out and in open water: fills while it is, starts
   * again if it leaves, and says whether it has just filled. A full tank is not filled further.
   */
  step(dt: number, submerged: boolean): boolean {
    if (this.full) {
      this.filling = 0;
      return false;
    }
    if (!submerged) {
      this.filling = 0;
      return false;
    }
    this.filling += dt;
    if (this.filling < SCOOP.time) return false;
    this.filling = 0;
    this.full = true;
    return true;
  }

  /** Emptied, by a drop. */
  drop(): void {
    this.full = false;
    this.filling = 0;
  }
}

/** What the maps of water are built from: the island's lakes and sea and the ground that is the surface of its water. */
type WaterIsland = Pick<Island, 'terrain' | 'sea' | 'lakes' | 'seaLevel' | 'ground'>;

/**
 * The level of each square of the grid that is open water: a lake's square at its level, a square of the sea at the
 * sea's, and `NO_WATER` for the rest. Said once, for the open water and for the map of every water that is built on it.
 */
function openLevels({ sea, lakes, seaLevel }: Pick<Island, 'sea' | 'lakes' | 'seaLevel'>): Float32Array {
  const levels = new Float32Array(sea.length).fill(NO_WATER);
  for (let sq = 0; sq < sea.length; sq++) if (sea[sq] !== SEA.dry) levels[sq] = seaLevel;
  for (const lake of lakes) for (const sq of lake.squares) levels[sq] = lake.level;
  return levels;
}

/**
 * Where the open water is, by the island's maps, a level a square: a lake's square at its level, a square of the sea at
 * the sea's, and `NO_WATER` for the rest, rivers included. Built once; asking makes nothing.
 */
export class OpenWater {
  protected readonly levels: Float32Array;
  protected readonly across: number;
  protected readonly originX: number;
  protected readonly originY: number;
  protected readonly cell: number;
  /** The height of what is under a point, to tell a beach from the water: the island's ground, bound once. */
  protected readonly heightAt: GroundAt;

  constructor(island: WaterIsland) {
    const { terrain, ground } = island;
    this.across = terrain.cols - 1;
    this.originX = terrain.originX;
    this.originY = terrain.originY;
    this.cell = terrain.cell;
    this.levels = openLevels(island);
    this.heightAt = ground.heightAt.bind(ground);
  }

  /** The level of the open water at (x, y), or `NO_WATER`; beyond the grid there is none. Makes nothing. */
  levelAt(x: number, y: number): number {
    const sq = this.squareAt(x, y);
    return sq < 0 ? NO_WATER : this.levels[sq];
  }

  /**
   * The level of the open water's surface at (x, y), or `NO_WATER`: as `levelAt`, but a beach in a square of the
   * shallows, whose ground is above the water, is dry. What a bucket is lowered into. Makes nothing.
   */
  surfaceAt(x: number, y: number): number {
    const level = this.levelAt(x, y);
    return level !== NO_WATER && !beach(this.heightAt, level, x, y) ? level : NO_WATER;
  }

  /** The place of the square (x, y) is in, or −1 beyond the grid. Makes nothing. */
  protected squareAt(x: number, y: number): number {
    const i = Math.floor((x - this.originX) / this.cell),
      j = Math.floor((y - this.originY) / this.cell);
    if (i < 0 || j < 0 || i >= this.across || j >= this.across) return -1;
    return j * this.across + i;
  }

  /**
   * The middle of the open water's nearest square to (x, y) written into `out`, at its level; false if there is none.
   * Looked for ring by ring of squares round the one it is over, as far as a square of water can be nearer than the
   * nearest found. Makes nothing.
   */
  nearest(x: number, y: number, out: Point3): boolean {
    const { across, cell, originX, originY, levels } = this;
    const ci = Math.min(across - 1, Math.max(0, Math.floor((x - originX) / cell))),
      cj = Math.min(across - 1, Math.max(0, Math.floor((y - originY) / cell)));
    let best = Infinity;
    for (let r = 0; r < across; r++) {
      // a square r rings out is at least (r - 1) squares away, so once that is past the best nothing nearer is left
      if ((r - 1) * cell > best) break;
      for (let j = cj - r; j <= cj + r; j++) {
        if (j < 0 || j >= across) continue;
        const edge = j === cj - r || j === cj + r;
        for (let i = ci - r; i <= ci + r; i += edge || r === 0 ? 1 : 2 * r) {
          if (i < 0 || i >= across) continue;
          const level = levels[j * across + i];
          if (level === NO_WATER) continue;
          const mx = originX + (i + 0.5) * cell,
            my = originY + (j + 0.5) * cell;
          const d = Math.hypot(mx - x, my - y);
          if (d >= best) continue;
          best = d;
          out.x = mx;
          out.y = my;
          out.z = level;
        }
      }
    }
    return best < Infinity;
  }
}

/**
 * Every water of the island: open water, and a river too, by the island's maps. A river is read from the island's
 * rivers: each is a run of points, four floats each (x, y, the surface, and half its width), and its water is every
 * square whose middle is within the half width of the run, taken in a segment at a time with the width and the surface
 * between its two points, and never less than a square's half diagonal, so that the narrowest river is still a square
 * wide and no run is stepped over by the grid. Where a square is a lake's or the sea's it keeps that level, and
 * the river's flag. Built once; asking makes nothing.
 *
 * It is what the helicopter's floor is built on: over any of it, a hover. A beach in a square of the shallows is
 * ground, told from the water by the height of the island's ground there; a river square is water whatever the ground,
 * since its banks stand over its surface.
 */
export class Waters extends OpenWater {
  /** Whether a square is a river's, by the same place as the levels. */
  private readonly river: Uint8Array;

  constructor(island: WaterIsland & Pick<Island, 'rivers'>) {
    super(island);
    this.river = new Uint8Array(this.levels.length);
    const { across, cell, originX, originY, levels, river } = this;
    // a segment's squares are reached by their middles, so the reach is the half width or the half diagonal of a square
    const floor = cell * Math.SQRT1_2;
    for (const { points } of island.rivers)
      for (let k = 0; k + 4 < points.length; k += 4) {
        const [ax, ay, az, aw] = [points[k], points[k + 1], points[k + 2], points[k + 3]];
        const [bx, by, bz, bw] = [points[k + 4], points[k + 5], points[k + 6], points[k + 7]];
        const reach = Math.max(aw, bw, floor);
        const abx = bx - ax,
          aby = by - ay;
        const len2 = abx * abx + aby * aby;
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - originX) / cell)),
          i1 = Math.min(across - 1, Math.ceil((Math.max(ax, bx) + reach - originX) / cell)),
          j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - originY) / cell)),
          j1 = Math.min(across - 1, Math.ceil((Math.max(ay, by) + reach - originY) / cell));
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const mx = originX + (i + 0.5) * cell,
              my = originY + (j + 0.5) * cell;
            const t = len2 > 0 ? Math.min(1, Math.max(0, ((mx - ax) * abx + (my - ay) * aby) / len2)) : 0;
            const d = Math.hypot(mx - (ax + t * abx), my - (ay + t * aby));
            if (d > Math.max(aw + t * (bw - aw), floor)) continue;
            const sq = j * across + i;
            river[sq] = 1;
            if (levels[sq] === NO_WATER) levels[sq] = az + t * (bz - az);
          }
      }
  }

  /**
   * The level of the water the helicopter must hover over at (x, y), or `NO_WATER`: a river's square at once, and a
   * lake's or the sea's unless it is a beach. Makes nothing.
   */
  override surfaceAt(x: number, y: number): number {
    const sq = this.squareAt(x, y);
    if (sq < 0) return NO_WATER;
    const level = this.levels[sq];
    if (level === NO_WATER) return NO_WATER;
    return this.river[sq] === 1 || !beach(this.heightAt, level, x, y) ? level : NO_WATER;
  }
}

/**
 * The open water of an island, mapped the first time it is asked for and the same map after: an island never changes,
 * and a game is built by the thousand in the tests, where mapping it again for each tripled what a game cost to build.
 * Held weakly, so an island let go takes its map with it, and nothing is kept for ever.
 */
const mapped = new WeakMap<object, OpenWater>();
export function openWaterOf(island: WaterIsland): OpenWater {
  let water = mapped.get(island);
  if (!water) mapped.set(island, (water = new OpenWater(island)));
  return water;
}

/** Every water of an island, a river too, mapped once as `openWaterOf` maps the open water, and held as weakly. */
const mappedAll = new WeakMap<object, Waters>();
export function watersOf(island: WaterIsland & Pick<Island, 'rivers'>): Waters {
  let waters = mappedAll.get(island);
  if (!waters) mappedAll.set(island, (waters = new Waters(island)));
  return waters;
}
