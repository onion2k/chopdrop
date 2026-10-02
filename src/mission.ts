/**
 * A level as it is flown: a list of steps done in order, and the time from
 * the first lift-off to the last step kept. A parcel is picked up by landing
 * on its pad and staying while it is loaded, and set down on another the same
 * way; a ring or an opening is passed by flying the helicopter's middle
 * through it the way it faces, in its turn; and a landing is done as the
 * skids touch the pad. What happens is told through the events it
 * is handed; how it is drawn and put into words is the page's. Without it
 * there is nothing on the island to do.
 */
import { HELICOPTER } from './helicopter';
import type { Pad } from './island';

/** How a parcel is loaded and unloaded. */
export const DELIVERY = {
  /** How long the helicopter must stay landed on the pad for the parcel to be loaded, or unloaded, in seconds. */
  load: 1.5,
  /** How near the middle of the pad its middle must be, as a share of the pad's radius: on the slab, and not its edge. */
  onSlab: 0.8,
  /** How far its skids may be from the pad's top and still be on it, and not on the ground beside. */
  onTop: 0.25,
};

/** How a ring is made and passed. */
export const RING = {
  /** The radius of its tube: the solid part, round the opening. */
  tube: 0.8,
  /** The furthest the helicopter's middle can go in a step and still be flying: further is a teleport, which passes nothing. */
  jump: 5,
};

/** How many rings a level may have: what the scene and the solids make room for, once. */
export const RINGS = { capacity: 12 };

/**
 * A ring to fly through, standing upright with its middle at (x, y, z) and facing `yaw`, the way it is to be flown;
 * `opening` is the radius of the hole, inside its tube.
 */
export interface Ring {
  kind: 'ring';
  x: number;
  y: number;
  z: number;
  yaw: number;
  opening: number;
}

/**
 * An opening to fly through, under something or between things, square to the ground with its middle at (x, y, z) and
 * facing `yaw`, `width` across and `height` from its foot to its top; `label` is where it is, as the words say it:
 * "under the bridge".
 */
export interface Gate {
  kind: 'gate';
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
  height: number;
  label: string;
}

/**
 * What a level asks for, a step at a time: a parcel picked up from a pad, or set down on one, by its place in the
 * island's list; a ring or an opening flown through; or a pad landed on, which is done the moment the skids touch it.
 */
export type Step =
  { kind: 'pickup'; pad: number } | { kind: 'drop'; pad: number } | { kind: 'land'; pad: number } | Ring | Gate;

/**
 * What sort of level it is, as the list of levels names it: parcels to deliver, rings to fly through, or a course of
 * openings and rings flown round to a landing.
 */
export type LevelKind = 'delivery' | 'rings' | 'course';

export interface Level {
  /** What it is known by in the save: a name, never its place in the list, so a level slotted in before it changes nothing. */
  id: string;
  name: string;
  kind: LevelKind;
  steps: readonly Step[];
  /** The pad it is flown from, by its place in the island's list: home, unless it names another beside its course. */
  start?: number;
}

/** A point in the world. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * What a mission tells as it happens: a parcel loaded on a pad, one delivered to a pad, a ring passed (which of how
 * many, counting from one), an opening flown through (by where it is), a pad landed on, and the level done, with its
 * time.
 */
export interface MissionEvents {
  loaded?(pad: number): void;
  delivered?(pad: number): void;
  passed?(ring: number, of: number): void;
  through?(label: string): void;
  landed?(pad: number): void;
  finished?(seconds: number): void;
}

/** What it reads of the helicopter: where it is, and whether it is on the ground. */
export interface Lander {
  x: number;
  y: number;
  z: number;
  landed: boolean;
}

/** Whether `h` is landed on `pad`: its middle on the slab, and its skids on the pad's top and not the ground beside. */
export function onPad(h: Readonly<Lander>, pad: Readonly<Pad>): boolean {
  return (
    h.landed &&
    Math.hypot(h.x - pad.x, h.y - pad.y) <= pad.radius * DELIVERY.onSlab &&
    Math.abs(h.z - pad.z) <= DELIVERY.onTop
  );
}

export class Mission {
  /** The step being done, by its place in the level's list; the list's length once the level is done. */
  next = 0;
  /** How long the parcel has been loading or unloading: the seconds the helicopter has been landed on the pad it is wanted on, which start again if it lifts. */
  loading = 0;
  /** The seconds since the helicopter first lifted off, until the last step is done; then the time it took. */
  time = 0;
  /** Whether the helicopter has lifted off since the start: the clock waits for it. */
  started = false;
  /** Where the step being done wants the helicopter, written in place by `goal`, so reading it each frame makes nothing. */
  private readonly wanted: Point3 = { x: 0, y: 0, z: 0 };
  /** Where the helicopter's middle was at the last step, which a ring is passed by moving from; none until it has been seen. */
  private readonly was: Point3 = { x: 0, y: 0, z: 0 };
  private seen = false;

  constructor(
    readonly pads: readonly Pad[],
    private flying: Level,
    private readonly events: MissionEvents = {},
  ) {}

  /** The level being flown. */
  get level(): Level {
    return this.flying;
  }

  /** Whether every step is done. */
  get done(): boolean {
    return this.next >= this.flying.steps.length;
  }

  /** The step being done, or undefined once they all are. */
  get current(): Step | undefined {
    return this.flying.steps[this.next];
  }

  /** The pad the helicopter is wanted on now, or −1 for a ring or an opening, and once the level is done. */
  get target(): number {
    const s = this.current;
    return s && s.kind !== 'ring' && s.kind !== 'gate' ? s.pad : -1;
  }

  /**
   * Where the step being done wants the helicopter, for the arrow and the pilot: the top of its pad, or the middle of
   * its ring or its opening; null once all are done.
   */
  get goal(): Readonly<Point3> | null {
    const s = this.current;
    if (!s) return null;
    const at = s.kind === 'ring' || s.kind === 'gate' ? s : this.pads[s.pad];
    this.wanted.x = at.x;
    this.wanted.y = at.y;
    this.wanted.z = at.z;
    return this.wanted;
  }

  /** Which ring is wanted, counting from one; 0 where the step is not a ring. */
  get ringNumber(): number {
    return this.current?.kind === 'ring' ? this.ringsTo(this.next) : 0;
  }

  /** How many rings the level has. */
  get ringCount(): number {
    return this.ringsTo(this.flying.steps.length - 1);
  }

  /** Whether a parcel is aboard: one picked up and not yet set down. */
  get carrying(): boolean {
    let aboard = 0;
    for (let k = 0; k < this.next; k++) {
      const kind = this.flying.steps[k].kind;
      if (kind === 'pickup') aboard++;
      else if (kind === 'drop') aboard--;
    }
    return aboard > 0;
  }

  /**
   * The pad a parcel stands on, as it is drawn: the one waiting to be picked up next, or else the last one delivered;
   * −1 where there is none.
   */
  get waiting(): number {
    const { steps } = this.flying;
    if (this.current?.kind === 'pickup') return this.current.pad;
    for (let k = this.next - 1; k >= 0; k--) {
      const step = steps[k];
      if (step.kind === 'drop') return step.pad;
    }
    return -1;
  }

  /** One step of `dt` seconds, with the helicopter where it is now. */
  step(dt: number, h: Readonly<Lander>): void {
    const s = this.current;
    if (!s) return;
    if (!h.landed) this.started = true;
    if (this.started) this.time += dt;
    if (s.kind === 'ring' || s.kind === 'gate') {
      if (this.through(s, h)) this.stepDone(s);
      return;
    }
    this.remember(h);
    // a landing is done as the skids touch the pad, with no wait
    if (s.kind === 'land') {
      if (onPad(h, this.pads[s.pad])) this.stepDone(s);
      return;
    }
    if (!onPad(h, this.pads[s.pad])) {
      this.loading = 0;
      return;
    }
    this.loading += dt;
    if (this.loading < DELIVERY.load) return;
    this.loading = 0;
    this.stepDone(s);
  }

  /** The step `s` done: the next wanted, and told. */
  private stepDone(s: Step): void {
    this.next++;
    if (s.kind === 'pickup') this.events.loaded?.(s.pad);
    else if (s.kind === 'drop') this.events.delivered?.(s.pad);
    else if (s.kind === 'land') this.events.landed?.(s.pad);
    else if (s.kind === 'gate') this.events.through?.(s.label);
    else this.events.passed?.(this.ringsTo(this.next - 1), this.ringCount);
    if (this.done) this.events.finished?.(this.time);
  }

  /** How many of the level's steps up to and including the one at `k` are rings. */
  private ringsTo(k: number): number {
    const { steps } = this.flying;
    let n = 0;
    for (let j = 0; j <= k && j < steps.length; j++) if (steps[j].kind === 'ring') n++;
    return n;
  }

  /**
   * Whether the helicopter's middle went through `opening`, a ring or a gate, since the last step: from behind its face
   * to in front of it, crossing inside it (within a ring's radius of its middle, or within a gate's half width to the
   * side and half height up or down), and no further than a step's flight. Where it is now is remembered either way.
   */
  private through(opening: Ring | Gate, h: Readonly<Lander>): boolean {
    const x = h.x,
      y = h.y,
      z = h.z + HELICOPTER.size.middle;
    const w = this.was;
    const fresh = !this.seen;
    const ax = Math.cos(opening.yaw),
      ay = Math.sin(opening.yaw);
    const before = (w.x - opening.x) * ax + (w.y - opening.y) * ay;
    const now = (x - opening.x) * ax + (y - opening.y) * ay;
    const moved = Math.hypot(x - w.x, y - w.y, z - w.z);
    this.remember(h);
    if (fresh || before >= 0 || now < 0 || moved > RING.jump) return false;
    // where the move crossed the face, across it and up from its middle, and whether that is inside the opening
    const t = before / (before - now);
    const cx = w.x + (x - w.x) * t - opening.x,
      cy = w.y + (y - w.y) * t - opening.y;
    const across = -cx * ay + cy * ax;
    const up = w.z + (z - w.z) * t - opening.z;
    if (opening.kind === 'ring') return Math.hypot(across, up) <= opening.opening;
    return Math.abs(across) <= opening.width / 2 && Math.abs(up) <= opening.height / 2;
  }

  /** Where the helicopter's middle is now, for the next step to go from. */
  private remember(h: Readonly<Lander>): void {
    this.was.x = h.x;
    this.was.y = h.y;
    this.was.z = h.z + HELICOPTER.size.middle;
    this.seen = true;
  }

  /** `level` flown from the start. */
  play(level: Level): void {
    this.flying = level;
    this.reset();
  }

  /** Back to the start: the first step waiting, nothing loading and the clock waiting. */
  reset(): void {
    this.next = 0;
    this.loading = 0;
    this.time = 0;
    this.started = false;
    this.seen = false;
  }
}
