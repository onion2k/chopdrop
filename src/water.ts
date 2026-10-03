/**
 * The water the helicopter carries: a tank filled by skimming low and fast over open water, and emptied by a drop on
 * a fire. Open water is a lake or the sea by the island's own maps, and never a river, which is too narrow to skim;
 * the scoop and the drop are windows in where the helicopter is, held here as pure helpers so that the game, the
 * rules and the tests ask the same question. Without it there is nothing to put a fire out with.
 *
 * The tank is the helicopter's and not a level's: it is kept through a level begun, finished or given up.
 */
import { SEA, type Island } from './island';
import type { GroundAt, Lander, Point3 } from './mission';

/**
 * What fills the tank: the skids within `low` over open water, not landed, moving at `speed` or more across the ground,
 * for `time` seconds. Leaving the window starts the fill over.
 */
export const SCOOP = { low: 1.5, speed: 8, time: 2 };

/**
 * What empties it: with a full tank, the helicopter's middle within `splash` across of a burning patch and its skids
 * within `high` of the ground under it. Every burning patch within `splash` of the point under the helicopter goes out.
 * High enough that the bucket's line clears the treetops.
 */
export const DROP = { high: 25, splash: 12 };

/** The level of the water where there is none: nothing is within reach of it, and a comparison with it is false. */
export const NO_WATER = -Infinity;

/** Whether a helicopter with its skids at `h.z` is in the scoop's window over water at `waterLevel`, going `speed`. */
export function inScoop(h: Readonly<Pick<Lander, 'z' | 'landed'>>, waterLevel: number, speed: number): boolean {
  if (h.landed) return false;
  return h.z - waterLevel <= SCOOP.low && speed >= SCOOP.speed;
}

/**
 * Whether a drop from `h` reaches `patch`: its middle within the splash across of it, and its skids within `DROP.high`
 * of the ground under the helicopter (which the bucket hangs over), not the ground under the patch.
 */
export function inDrop(
  h: Readonly<Pick<Lander, 'x' | 'y' | 'z'>>,
  patch: Readonly<Point3>,
  groundAt: GroundAt,
): boolean {
  if (Math.hypot(h.x - patch.x, h.y - patch.y) > DROP.splash) return false;
  return h.z - groundAt(h.x, h.y) <= DROP.high;
}

export class Tank {
  /** Whether it is full: one scoop fills it, and one drop empties it. */
  full = false;
  /** The seconds of the scoop so far, from 0 to short of `SCOOP.time`; 0 while the tank is full. */
  filling = 0;

  /**
   * One step of `dt` seconds with the helicopter as it is and `waterLevel` the level of the open water under its
   * middle, or `NO_WATER`: fills while it is in the window, starts again if it leaves it, and says whether it has just
   * filled. A full tank is not filled further.
   */
  step(dt: number, h: Readonly<Pick<Lander, 'z' | 'landed'> & { speed: number }>, waterLevel: number): boolean {
    if (this.full) {
      this.filling = 0;
      return false;
    }
    if (!inScoop(h, waterLevel, h.speed)) {
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

/**
 * Where the open water is, by the island's maps, a level a square: a lake's square at its level, a square of the sea at
 * the sea's, and `NO_WATER` for the rest, rivers included. Built once; asking makes nothing.
 */
export class OpenWater {
  private readonly levels: Float32Array;
  private readonly across: number;
  private readonly originX: number;
  private readonly originY: number;
  private readonly cell: number;

  constructor(island: Pick<Island, 'terrain' | 'sea' | 'lakes' | 'seaLevel'>) {
    const { terrain, sea, lakes, seaLevel } = island;
    this.across = terrain.cols - 1;
    this.originX = terrain.originX;
    this.originY = terrain.originY;
    this.cell = terrain.cell;
    this.levels = new Float32Array(sea.length).fill(NO_WATER);
    for (let sq = 0; sq < sea.length; sq++) if (sea[sq] !== SEA.dry) this.levels[sq] = seaLevel;
    for (const lake of lakes) for (const sq of lake.squares) this.levels[sq] = lake.level;
  }

  /** The level of the open water at (x, y), or `NO_WATER`; beyond the grid there is none. Makes nothing. */
  levelAt(x: number, y: number): number {
    const i = Math.floor((x - this.originX) / this.cell),
      j = Math.floor((y - this.originY) / this.cell);
    if (i < 0 || j < 0 || i >= this.across || j >= this.across) return NO_WATER;
    return this.levels[j * this.across + i];
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
 * The open water of an island, mapped the first time it is asked for and the same map after: an island never changes,
 * and a game is built by the thousand in the tests, where mapping it again for each tripled what a game cost to build.
 * Held weakly, so an island let go takes its map with it, and nothing is kept for ever.
 */
const mapped = new WeakMap<object, OpenWater>();
export function openWaterOf(island: Pick<Island, 'terrain' | 'sea' | 'lakes' | 'seaLevel'>): OpenWater {
  let water = mapped.get(island);
  if (!water) mapped.set(island, (water = new OpenWater(island)));
  return water;
}
