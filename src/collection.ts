/**
 * The structures collected: a bridge or a pair of towers is collected the first time the helicopter's middle flies
 * through its opening, either way, by the same rule a mission passes a ring by (`crossed`), so that a teleport across
 * it is not a crossing, and whatever else is going. What is collected is kept in the save, by name, so a reload finds
 * it collected. Without it a player has nothing to count of the structures they have flown through, and nothing keeps
 * what they have done to them from one visit to the next.
 */
import type { Collectible } from './arena';
import { HELICOPTER } from './helicopter';
import { crossed, type Gate, type Lander, type Point3 } from './mission';
import type { Progress } from './progress';

export class Collection {
  /**
   * How many of the game's own collectibles are collected: those the save brought and those collected since. A name
   * the save brought that the game does not have is kept in the save but is not counted.
   */
  count = 0;
  /** The names the save brought with it, which the game need not have: a later game's save has some it does not know. */
  readonly brought: ReadonlySet<string>;
  /** Each collectible's opening facing the way it does, and the same turned about, so it is crossed either way. Built once. */
  private readonly openings: { id: string; ahead: Gate; behind: Gate }[];
  /** Where the helicopter's middle was at the last step, which an opening is crossed by moving from; none until it has been seen. */
  private readonly was: Point3 = { x: 0, y: 0, z: 0 };
  /** Where the helicopter's middle is now, written in place, so watching the openings makes nothing each step. */
  private readonly here: Point3 = { x: 0, y: 0, z: 0 };
  private seen = false;

  constructor(
    /** The structures there are, in the order they win a tie. */
    readonly collectibles: readonly Collectible[],
    private readonly progress: Progress,
  ) {
    this.openings = collectibles.map(({ id, opening }) => ({
      id,
      ahead: opening,
      behind: { ...opening, yaw: opening.yaw + Math.PI },
    }));
    this.brought = new Set(progress.collected);
    this.count = collectibles.filter((c) => this.has(c.id)).length;
  }

  /** The names collected, in the order they were. */
  get ids(): readonly string[] {
    return this.progress.collected;
  }

  /** Whether the structure named `id` is collected. */
  has(id: string): boolean {
    return this.progress.collected.includes(id);
  }

  /**
   * One step: the structure whose opening the helicopter's middle has just flown through for the first time, or null.
   * Of two crossed in one step the first in the list is collected, and the other when it is crossed again. Makes nothing.
   */
  step(h: Readonly<Lander>): Collectible | null {
    const now = this.here;
    now.x = h.x;
    now.y = h.y;
    now.z = h.z + HELICOPTER.size.middle;
    let found = -1;
    if (this.seen)
      for (let k = 0; k < this.openings.length; k++) {
        const o = this.openings[k];
        if (this.has(o.id)) continue;
        if (crossed(o.ahead, this.was, now) || crossed(o.behind, this.was, now)) {
          found = k;
          break;
        }
      }
    this.was.x = now.x;
    this.was.y = now.y;
    this.was.z = now.z;
    this.seen = true;
    if (found < 0) return null;
    const c = this.collectibles[found];
    this.progress.collect(c.id);
    this.count++;
    return c;
  }

  /** No last position, so the next step is never taken for a crossing: after the helicopter has been put somewhere. */
  reset(): void {
    this.seen = false;
  }
}
