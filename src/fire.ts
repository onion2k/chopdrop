/**
 * A fire's patches: each is unburnt, burning or out, held in a typed array made once. A fire starts with its first
 * `lit` patches burning. While its level is going it spreads, a patch at a time on a fixed beat and a fixed order, so
 * the same flight gives the same fire; a drop puts out what it reaches; and a fire that is not going and has been
 * changed is lit again at its start a few seconds after its last change, so a fire put out, left, or put out while
 * another level was going is ready to be flown again. Without it there is no fire to fight, and one that is never lit
 * again can be fought once.
 *
 * It knows nothing of the helicopter or the mission: it is told how long has gone, whether its level is going, and
 * where a drop fell. Nothing is made as it runs.
 */
import type { FirePlace } from './arena';
import type { GroundAt, Lander, Point3 } from './mission';
import { DROP, inDrop } from './water';

/** What a patch can be, as the number kept for it. */
export const PATCH = { unburnt: 0, burning: 1, out: 2 } as const;

/**
 * How a fire spreads while its level is going: every `every` seconds the first unburnt patch, in the list's order, that
 * is within `reach` of a burning one catches. A patch that is out never catches again, and nothing catches that is not
 * one of the fire's own.
 */
export const SPREAD = { every: 8, reach: 9 };

/** How long a fire that is not going waits, after its last change, before it is lit again at its start. The page's toast lasts as long. */
export const FIRE = { relight: 3 };

export class Fire {
  /** Each patch's state, one of `PATCH`, in the order of the place's list. Sized once. */
  readonly states: Uint8Array;
  /** How many patches burn now. */
  burning: number;
  /** The seconds since the fire last changed, by a drop or by catching, or since its level was left if that was later: what the wait to be lit again is counted from. 0 while its level is going. */
  quiet = 0;
  /** The seconds since a patch last caught while the level was going, which the spread's beat is counted in. */
  private beat = 0;
  /** Whether it has changed since it was lit at its start, so a fire that has not is never lit again for nothing. */
  private changed = false;

  constructor(readonly place: FirePlace) {
    this.states = new Uint8Array(place.patches.length);
    this.burning = 0;
    this.light();
  }

  /** Its id, which is its level's. */
  get id(): string {
    return this.place.id;
  }

  /** Whether every patch is as it was at the start: the first `lit` burning, the rest unburnt. */
  get atStart(): boolean {
    for (let k = 0; k < this.states.length; k++)
      if (this.states[k] !== (k < this.place.lit ? PATCH.burning : PATCH.unburnt)) return false;
    return true;
  }

  /** One step of `dt` seconds; `going` is whether this fire's level is the one going. Makes nothing. */
  step(dt: number, going: boolean): void {
    // the wait to be lit again is counted from the later of its last change and its level being left, so while the level
    // is going it is held at nothing, and a fire given up long after it last changed is not lit again the moment it is
    if (going) this.quiet = 0;
    else this.quiet += dt;
    if (going) {
      this.beat += dt;
      if (this.beat >= SPREAD.every) {
        this.beat -= SPREAD.every;
        this.spread();
      }
      return;
    }
    // not going: no beat, and a fire left off its start is lit again once it has been quiet long enough
    this.beat = 0;
    if (this.changed && this.quiet >= FIRE.relight) this.relight();
  }

  /** Whether a drop from `h` reaches any patch of this fire that is burning. Makes nothing. */
  dropReaches(h: Readonly<Pick<Lander, 'x' | 'y' | 'z'>>, groundAt: GroundAt): boolean {
    const { patches } = this.place;
    for (let k = 0; k < patches.length; k++)
      if (this.states[k] === PATCH.burning && inDrop(h, patches[k], groundAt)) return true;
    return false;
  }

  /** Every burning patch within the splash of (x, y) put out; how many that was. Makes nothing. */
  douse(x: number, y: number): number {
    const { patches } = this.place;
    let out = 0;
    for (let k = 0; k < patches.length; k++) {
      if (this.states[k] !== PATCH.burning) continue;
      if (Math.hypot(patches[k].x - x, patches[k].y - y) > DROP.splash) continue;
      this.states[k] = PATCH.out;
      out++;
    }
    if (out > 0) this.change(-out);
    return out;
  }

  /** Back to its start at once, and the beat and the wait put back. */
  relight(): void {
    this.light();
  }

  /**
   * The nearest burning patch to (x, y) written into `out`, true; false with none burning and `out` untouched. The
   * arrow and the pilot follow it. Makes nothing.
   */
  nearestBurning(x: number, y: number, out: Point3): boolean {
    const { patches } = this.place;
    let least = Infinity;
    let at = -1;
    for (let k = 0; k < patches.length; k++) {
      if (this.states[k] !== PATCH.burning) continue;
      const d = Math.hypot(patches[k].x - x, patches[k].y - y);
      if (d < least) {
        least = d;
        at = k;
      }
    }
    if (at < 0) return false;
    out.x = patches[at].x;
    out.y = patches[at].y;
    out.z = patches[at].z;
    return true;
  }

  /**
   * The burning patch a drop on would put out the most, written into `out`, true; false with none burning. Of two that
   * would put out as many, the first in the list, so the pilot's aim does not change as it comes in. Makes nothing.
   */
  bestDrop(out: Point3): boolean {
    const { patches } = this.place;
    let most = 0;
    let at = -1;
    for (let k = 0; k < patches.length; k++) {
      if (this.states[k] !== PATCH.burning) continue;
      let n = 0;
      for (let j = 0; j < patches.length; j++) {
        if (this.states[j] !== PATCH.burning) continue;
        if (Math.hypot(patches[j].x - patches[k].x, patches[j].y - patches[k].y) <= DROP.splash) n++;
      }
      if (n > most) {
        most = n;
        at = k;
      }
    }
    if (at < 0) return false;
    out.x = patches[at].x;
    out.y = patches[at].y;
    out.z = patches[at].z;
    return true;
  }

  /** The first unburnt patch in the list within reach of a burning one caught. */
  private spread(): void {
    const { patches } = this.place;
    for (let u = 0; u < patches.length; u++) {
      if (this.states[u] !== PATCH.unburnt) continue;
      for (let b = 0; b < patches.length; b++) {
        if (this.states[b] !== PATCH.burning) continue;
        if (Math.hypot(patches[u].x - patches[b].x, patches[u].y - patches[b].y) > SPREAD.reach) continue;
        this.states[u] = PATCH.burning;
        this.change(1);
        return;
      }
    }
  }

  /** The count moved by `by`, and the wait to be lit again started over. */
  private change(by: number): void {
    this.burning += by;
    this.quiet = 0;
    this.changed = true;
  }

  private light(): void {
    const { lit } = this.place;
    let burning = 0;
    for (let k = 0; k < this.states.length; k++) {
      const alight = k < lit;
      this.states[k] = alight ? PATCH.burning : PATCH.unburnt;
      if (alight) burning++;
    }
    this.burning = burning;
    this.quiet = 0;
    this.beat = 0;
    this.changed = false;
  }
}
