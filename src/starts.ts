/**
 * What begins a level while nothing is going: whether the helicopter has just done a level's first step. A delivery
 * begins when it is landed on its pickup pad for as long as the parcel takes to load, and a trial or a course when
 * the helicopter's middle flies through its first ring or opening the way it faces, by the same rule a mission passes
 * the rest of its rings by, and a rescue when it has hovered in the window over its person for as long as the winch
 * takes, by the same rule a mission winches by, or a rescue by landing when it has stayed landed within reach of its
 * person for as long as the boarding takes, by the same rule a mission boards by, and a fire when the helicopter comes
 * within `FIRE.near` of a patch of it that burns with the bucket out (which the game tells it, as it knows the bucket). A level that has just ended on a pad begins nothing from it until the helicopter has
 * lifted off, or one delivery would begin the next from the pad it ended on. Without it the game would have to be
 * told a level, and a player could not find one by flying.
 */
import { FIRE } from './fire';
import { HELICOPTER } from './helicopter';
import type { Pad } from './island';
import {
  crossed,
  inWindow,
  loadFor,
  onBoard,
  onPad,
  type Board,
  type GroundAt,
  type FireWatch,
  type Gate,
  type Lander,
  type Level,
  type Point3,
  type Ring,
  type Winch,
} from './mission';

/** A watch that knows no fire, for starts handed none: nothing is ever near a patch that burns. */
const NO_FIRES: FireWatch = { burning: () => 0, nearest: () => false };

export class Starts {
  /** The seconds it has stood on a pickup pad not blocked, the parcel loading, hovered in a rescue's window, the winch running, or stayed landed beside a person, the boarding running; 0 otherwise. */
  loading = 0;
  /** The level whose person the winch is running for, while it runs (`loading` is then its seconds); null otherwise, and for a pad's load. */
  winching: Level | null = null;
  /** The level whose person is climbing aboard, while they do (`loading` is then its seconds); null otherwise. */
  boarding: Level | null = null;
  /** The pad a level ended on (by its place in the island's list), where nothing starts until it lifts off; −1 for none. */
  blocked = -1;
  /**
   * The fire whose level has just ended or been given up, by its id, which begins nothing until the bucket is taken in or
   * the helicopter has come past `FIRE.near` of a patch of it alight; '' for none. A fire is lit again a few seconds
   * after it goes out, and a helicopter still over it with the bucket out would be thrown into it again, or could never
   * give it up. The fire's own pad, so to speak.
   */
  spent = '';
  /**
   * The level that begins from each pad, by the pad's place in the island's list: the first level, in order, whose
   * first step is a pickup there; null for a pad nothing begins from. Built once.
   */
  private readonly byPad: (Level | null)[];
  /** The levels that begin at an opening, each with the opening: those whose first step is a ring or a gate. Built once. */
  private readonly openings: { level: Level; opening: Ring | Gate }[] = [];
  /** The levels that begin with a person winched up, each with the person: those whose first step is a winch. Built once. */
  private readonly winches: { level: Level; winch: Winch }[] = [];
  /** The levels that begin with a person boarding, each with the person: those whose first step is a board. Built once. */
  private readonly boards: { level: Level; person: Board }[] = [];
  /** The levels that begin with an arrival at a fire, each with the fire's id: those whose first step is an arrival. Built once. */
  private readonly arrivals: { level: Level; fire: string }[] = [];
  /** The nearest burning patch of a fire to the helicopter, written in place, so watching for an arrival makes nothing each step. */
  private readonly patch: Point3 = { x: 0, y: 0, z: 0 };
  /** Where the helicopter's middle was at the last step, which an opening is passed by moving from; none until it has been seen. */
  private readonly was: Point3 = { x: 0, y: 0, z: 0 };
  /** Where the helicopter's middle is now, written in place, so watching an opening makes nothing each step. */
  private readonly here: Point3 = { x: 0, y: 0, z: 0 };
  private seen = false;

  constructor(
    private readonly pads: readonly Pad[],
    levels: readonly Level[],
    private readonly groundAt: GroundAt = () => 0,
    private readonly fires: FireWatch = NO_FIRES,
  ) {
    this.byPad = pads.map(() => null);
    for (const level of levels) {
      const first = level.steps[0];
      if (first.kind === 'pickup') this.byPad[first.pad] ??= level;
      else if (first.kind === 'winch') this.winches.push({ level, winch: first });
      else if (first.kind === 'board') this.boards.push({ level, person: first });
      else if (first.kind === 'arrive') this.arrivals.push({ level, fire: first.fire });
      else if (first.kind === 'ring' || first.kind === 'gate') this.openings.push({ level, opening: first });
    }
  }

  /**
   * One step: the level whose first step it has just done, or null. `bucketOut` is whether the player has the bucket out,
   * which is what coming to a fire is done with: a bucket in begins nothing, however near. Makes nothing.
   */
  step(dt: number, h: Readonly<Lander>, bucketOut = false): Level | null {
    // lifting off clears the pad a level ended on
    if (!h.landed) this.blocked = -1;
    // a fire rested from is let go once the bucket is in, or the helicopter is clear of it while it burns: with none
    // alight there is no telling how far off it is, and it stays rested until it is lit again
    if (this.spent && (!bucketOut || this.clearOf(this.spent, h))) this.spent = '';
    this.winching = null;
    this.boarding = null;
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
    // a fire: come to with the bucket out, which is done at once and has nothing to load. The first of the levels, in order,
    // whose fire has a patch burning within reach
    if (bucketOut)
      for (const { level, fire } of this.arrivals) if (fire !== this.spent && this.near(fire, h)) return level;
    // a person: hovered over in the window for a full hold, which a pad has no say in
    for (const { level, winch } of this.winches)
      if (inWindow(h, winch, this.groundAt)) {
        this.loading += dt;
        if (this.loading < loadFor(winch)) {
          this.winching = level;
          return null;
        }
        this.loading = 0;
        return level;
      }
    // a person to board: landed beside them for a full hold, and never hovered over
    for (const { level, person } of this.boards)
      if (onBoard(h, person)) {
        this.loading += dt;
        if (this.loading < loadFor(person)) {
          this.boarding = level;
          return null;
        }
        this.loading = 0;
        return level;
      }
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
    if (this.loading < loadFor(this.byPad[pad]!.steps[0])) return null;
    this.loading = 0;
    return this.byPad[pad];
  }

  /** Whether a patch of the fire named `id` that burns is within `FIRE.near` of the helicopter's middle. Makes nothing. */
  private near(id: string, h: Readonly<Lander>): boolean {
    return (
      this.fires.nearest(id, h.x, h.y, this.patch) && Math.hypot(this.patch.x - h.x, this.patch.y - h.y) <= FIRE.near
    );
  }

  /** Whether the fire named `id` burns and the helicopter is further than `FIRE.near` from every patch of it that does. Makes nothing. */
  private clearOf(id: string, h: Readonly<Lander>): boolean {
    return (
      this.fires.nearest(id, h.x, h.y, this.patch) && Math.hypot(this.patch.x - h.x, this.patch.y - h.y) > FIRE.near
    );
  }

  /** Nothing loading, nothing blocked, and no last position, so the next move is never taken for a crossing. */
  reset(): void {
    this.loading = 0;
    this.winching = null;
    this.boarding = null;
    this.blocked = -1;
    this.spent = '';
    this.seen = false;
  }
}
