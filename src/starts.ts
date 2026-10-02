/**
 * What begins a level while nothing is going: whether the helicopter has just done a level's first step. A delivery
 * begins when it is landed on its pickup pad for as long as the parcel takes to load, and a trial or a course when
 * the helicopter's middle flies through its first ring or opening the way it faces, by the same rule a mission passes
 * the rest of its rings by. A level that has just ended on a pad begins nothing from it until the helicopter has
 * lifted off, or one delivery would begin the next from the pad it ended on. Without it the game would have to be
 * told a level, and a player could not find one by flying.
 */
import { HELICOPTER } from './helicopter';
import type { Pad } from './island';
import { DELIVERY, crossed, onPad, type Gate, type Lander, type Level, type Point3, type Ring } from './mission';

export class Starts {
  /** The seconds it has stood on a pickup pad not blocked, the parcel loading; 0 otherwise. */
  loading = 0;
  /** The pad a level ended on (by its place in the island's list), where nothing starts until it lifts off; −1 for none. */
  blocked = -1;
  /**
   * The level that begins from each pad, by the pad's place in the island's list: the first level, in order, whose
   * first step is a pickup there; null for a pad nothing begins from. Built once.
   */
  private readonly byPad: (Level | null)[];
  /** The levels that begin at an opening, each with the opening: those whose first step is a ring or a gate. Built once. */
  private readonly openings: { level: Level; opening: Ring | Gate }[] = [];
  /** Where the helicopter's middle was at the last step, which an opening is passed by moving from; none until it has been seen. */
  private readonly was: Point3 = { x: 0, y: 0, z: 0 };
  /** Where the helicopter's middle is now, written in place, so watching an opening makes nothing each step. */
  private readonly here: Point3 = { x: 0, y: 0, z: 0 };
  private seen = false;

  constructor(
    private readonly pads: readonly Pad[],
    levels: readonly Level[],
  ) {
    this.byPad = pads.map(() => null);
    for (const level of levels) {
      const first = level.steps[0];
      if (first.kind === 'pickup') this.byPad[first.pad] ??= level;
      else if (first.kind === 'ring' || first.kind === 'gate') this.openings.push({ level, opening: first });
    }
  }

  /** One step: the level whose first step it has just done, or null. Makes nothing. */
  step(dt: number, h: Readonly<Lander>): Level | null {
    // lifting off clears the pad a level ended on
    if (!h.landed) this.blocked = -1;
    const now = this.here;
    now.x = h.x;
    now.y = h.y;
    now.z = h.z + HELICOPTER.size.middle;
    let began: Level | null = null;
    if (this.seen)
      for (const { level, opening } of this.openings)
        if (crossed(opening, this.was, now)) {
          began = level;
          break;
        }
    this.was.x = now.x;
    this.was.y = now.y;
    this.was.z = now.z;
    this.seen = true;
    if (began) return began;
    // a pickup pad: stood on for a full load, and not the one a level has just ended on
    let pad = -1;
    for (let p = 0; p < this.byPad.length; p++)
      if (this.byPad[p] && p !== this.blocked && onPad(h, this.pads[p])) {
        pad = p;
        break;
      }
    if (pad < 0) {
      this.loading = 0;
      return null;
    }
    this.loading += dt;
    if (this.loading < DELIVERY.load) return null;
    this.loading = 0;
    return this.byPad[pad];
  }

  /** Nothing loading, nothing blocked, and no last position, so the next move is never taken for a crossing. */
  reset(): void {
    this.loading = 0;
    this.blocked = -1;
    this.seen = false;
  }
}
