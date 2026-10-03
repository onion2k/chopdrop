/**
 * A level as it is flown: a list of steps done in order, and the time from
 * the level's beginning to the last step kept. A level begins with its first
 * step already done, since doing that step is what began it; the rest are
 * done here. A parcel is picked up by landing on its pad and staying while it
 * is loaded, and set down on another the same way; a ring or an opening is
 * passed by flying the helicopter's middle through it the way it faces, in
 * its turn; a person is winched up by hovering in a window low over them for a while; and a landing is done as
 * the skids touch the pad. With nothing
 * going there is nothing to do, and the mission reads as nothing. What
 * happens is told through the events it is handed; how it is drawn and put
 * into words is the page's. Without it there is nothing on the island to do.
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

/**
 * How a person is winched up: the helicopter's middle within `reach` across of them, and its skids between `low` and
 * `high` over the ground, held for `hold` seconds. Too low and the rotor is in the trees, too high and the rope will not
 * reach, so the window is where the helicopter must be, and the hold is how long.
 */
export const WINCH = { reach: 5, low: 5, high: 15, hold: 3 };

/** How high over the ground the middle of the window is: where a pilot who means to winch someone holds the helicopter. */
export const WINCH_MIDDLE = (WINCH.low + WINCH.high) / 2;

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
 * "under the bridge". `flags`, where there are any, are where the chequered flags that mark it as a start stand, each at
 * the foot of its pole: the opening is a start only if it is a level's first step, and it is the level's content that
 * says where its flags go, since an opening between two towers has no top of its own to stand one on.
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
  flags?: readonly { x: number; y: number; z: number }[];
}

/**
 * A person to be winched up at (x, y), `z` being the ground there; `who` is what the words call them ("the walker")
 * and `where` the place ("in the western wood"). It is done by holding the helicopter in the window over them.
 */
export interface Winch {
  kind: 'winch';
  x: number;
  y: number;
  z: number;
  who: string;
  where: string;
}

/**
 * What a level asks for, a step at a time: a parcel picked up from a pad, or set down on one, by its place in the
 * island's list; a ring or an opening flown through; a person winched up; or a pad landed on, which is done the moment
 * the skids touch it.
 */
export type Step =
  { kind: 'pickup'; pad: number } | { kind: 'drop'; pad: number } | { kind: 'land'; pad: number } | Ring | Gate | Winch;

/**
 * How long a step's loader takes to fill, in seconds: a parcel's load, or a winch's hold. It is said once, so that the
 * mission, the starts and the rules they are held to all read the same limit.
 */
export function loadFor(step: Step): number {
  return step.kind === 'winch' ? WINCH.hold : DELIVERY.load;
}

/**
 * What sort of level it is, as the list of levels names it: parcels to deliver, rings to fly through, a course of
 * openings and rings flown round to a landing, or a person to winch up and fly home.
 */
export type LevelKind = 'delivery' | 'rings' | 'course' | 'rescue';

export interface Level {
  /** What it is known by in the save: a name, never its place in the list, so a level slotted in before it changes nothing. */
  id: string;
  name: string;
  kind: LevelKind;
  /** What it asks for, in order. Its first step is where it begins: the helicopter doing that step is what starts it. */
  steps: readonly Step[];
}

/** A point in the world. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * What a mission tells as it happens: a level begun or abandoned, by its name; a parcel loaded on a pad, one
 * delivered to a pad, a person winched up (by the level's name), a ring passed (which of how many, counting from one), an opening flown through (by where it is),
 * a pad landed on, and the level done, with its time.
 */
export interface MissionEvents {
  started?(id: string): void;
  abandoned?(id: string): void;
  loaded?(pad: number): void;
  delivered?(pad: number): void;
  winched?(id: string): void;
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

/** The height of the ground at a point, which the winch's window is measured over. */
export type GroundAt = (x: number, y: number) => number;

/** Ground that is level at the sea, for a mission or a start handed none: a test with no island to stand on. */
const FLAT: GroundAt = () => 0;

/**
 * Whether `h` is in the window of `winch`: its middle within `WINCH.reach` across of the person, and its skids between
 * `WINCH.low` and `WINCH.high` over the ground under the helicopter, not under the person. On the slopes the spots
 * stand on the two are within 2 m of each other, and it is what the rope hangs over, so it is said once, here, for the
 * mission, the starts and the rules to share.
 */
export function inWindow(h: Readonly<Lander>, winch: Readonly<Pick<Winch, 'x' | 'y'>>, groundAt: GroundAt): boolean {
  if (Math.hypot(h.x - winch.x, h.y - winch.y) > WINCH.reach) return false;
  const up = h.z - groundAt(h.x, h.y);
  return up >= WINCH.low && up <= WINCH.high;
}

/**
 * Whether a move of the helicopter's middle from `from` to `to` went through `opening`, a ring or a gate: from behind
 * its face to in front of it, crossing inside it (within a ring's radius of its middle, or within a gate's half width
 * to the side and half height up or down), and no further than a step's flight. It is one rule, said once, so that
 * whatever else passes openings passes them exactly as a mission does.
 */
export function crossed(opening: Ring | Gate, from: Readonly<Point3>, to: Readonly<Point3>): boolean {
  const ax = Math.cos(opening.yaw),
    ay = Math.sin(opening.yaw);
  const before = (from.x - opening.x) * ax + (from.y - opening.y) * ay;
  const now = (to.x - opening.x) * ax + (to.y - opening.y) * ay;
  const moved = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (before >= 0 || now < 0 || moved > RING.jump) return false;
  // where the move crossed the face, across it and up from its middle, and whether that is inside the opening
  const t = before / (before - now);
  const cx = from.x + (to.x - from.x) * t - opening.x,
    cy = from.y + (to.y - from.y) * t - opening.y;
  const across = -cx * ay + cy * ax;
  const up = from.z + (to.z - from.z) * t - opening.z;
  if (opening.kind === 'ring') return Math.hypot(across, up) <= opening.opening;
  return Math.abs(across) <= opening.width / 2 && Math.abs(up) <= opening.height / 2;
}

export class Mission {
  /** The step being done, by its place in the level's list; 0 with nothing going, and never 0 with a level going. */
  next = 0;
  /** How long the parcel has been loading or unloading, or the person winching: the seconds the helicopter has been landed on the pad it is wanted on, or in the window over the person, which start again if it leaves. */
  loading = 0;
  /** The seconds since the level began, while it is going; 0 with nothing going. */
  time = 0;
  /** The level going, or null with nothing going. */
  private flying: Level | null = null;
  /** Where the step being done wants the helicopter, written in place by `goal`, so reading it each frame makes nothing. */
  private readonly wanted: Point3 = { x: 0, y: 0, z: 0 };
  /** Where the helicopter's middle was at the last step, which a ring is passed by moving from; none until it has been seen. */
  private readonly was: Point3 = { x: 0, y: 0, z: 0 };
  /** Where the helicopter's middle is now, written in place by `through`, so passing an opening makes nothing each step. */
  private readonly here: Point3 = { x: 0, y: 0, z: 0 };
  private seen = false;

  constructor(
    readonly pads: readonly Pad[],
    private readonly events: MissionEvents = {},
    private readonly groundAt: GroundAt = FLAT,
  ) {}

  /** The level going, or null when nothing is. */
  get level(): Level | null {
    return this.flying;
  }

  /** The step being done, or undefined with nothing going. */
  get current(): Step | undefined {
    return this.flying?.steps[this.next];
  }

  /** The pad the helicopter is wanted on now, or −1 for a ring, an opening or a person, and with nothing going. */
  get target(): number {
    const s = this.current;
    return s && 'pad' in s ? s.pad : -1;
  }

  /**
   * Where the step being done wants the helicopter, for the arrow and the pilot: the top of its pad, or the middle of
   * its ring or its opening, or the person's place; null with nothing going.
   */
  get goal(): Readonly<Point3> | null {
    const s = this.current;
    if (!s) return null;
    const at = 'pad' in s ? this.pads[s.pad] : s;
    this.wanted.x = at.x;
    this.wanted.y = at.y;
    this.wanted.z = at.z;
    return this.wanted;
  }

  /** Which ring is wanted, counting from one; 0 where the step is not a ring, and with nothing going. */
  get ringNumber(): number {
    return this.current?.kind === 'ring' ? this.ringsTo(this.next) : 0;
  }

  /** How many rings the level going has; 0 with nothing going. */
  get ringCount(): number {
    return this.flying ? this.ringsTo(this.flying.steps.length - 1) : 0;
  }

  /** Whether a parcel is aboard: one picked up and not yet set down. */
  get carrying(): boolean {
    if (!this.flying) return false;
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
   * −1 where there is none, and with nothing going.
   */
  get waiting(): number {
    if (!this.flying) return -1;
    const { steps } = this.flying;
    if (this.current?.kind === 'pickup') return this.current.pad;
    for (let k = this.next - 1; k >= 0; k--) {
      const step = steps[k];
      if (step.kind === 'drop') return step.pad;
    }
    return -1;
  }

  /**
   * `level` made the one going, its first step already done: the clock and the loading at nothing, and told started
   * and then that first step's own event. A level already going is abandoned, and told, first. One whose only step is
   * its first is finished at once.
   */
  begin(level: Level): void {
    this.abandon();
    this.flying = level;
    this.next = 1;
    this.loading = 0;
    this.time = 0;
    this.seen = false;
    this.events.started?.(level.id);
    this.tell(level.steps[0]);
    if (this.next >= level.steps.length) this.finish();
  }

  /** Nothing going: told, if a level was. The parcel aboard is put back by there being no level for it to be aboard in. */
  abandon(): void {
    const level = this.flying;
    if (!level) return;
    this.clear();
    this.events.abandoned?.(level.id);
  }

  /** One step of `dt` seconds, with the helicopter where it is now; nothing to do with nothing going. */
  step(dt: number, h: Readonly<Lander>): void {
    const s = this.current;
    if (!s) return;
    this.time += dt;
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
    const here = s.kind === 'winch' ? inWindow(h, s, this.groundAt) : onPad(h, this.pads[s.pad]);
    if (!here) {
      this.loading = 0;
      return;
    }
    this.loading += dt;
    if (this.loading < loadFor(s)) return;
    this.loading = 0;
    this.stepDone(s);
  }

  /** The step `s` done: the next wanted, and told; and if it was the last, the level finished. */
  private stepDone(s: Step): void {
    this.next++;
    this.tell(s);
    if (this.next >= this.flying!.steps.length) this.finish();
  }

  /** The step `s` told as done, the ring counted as the one just passed. */
  private tell(s: Step): void {
    if (s.kind === 'pickup') this.events.loaded?.(s.pad);
    else if (s.kind === 'drop') this.events.delivered?.(s.pad);
    else if (s.kind === 'land') this.events.landed?.(s.pad);
    else if (s.kind === 'winch') this.events.winched?.(this.flying!.id);
    else if (s.kind === 'gate') this.events.through?.(s.label);
    else this.events.passed?.(this.ringsTo(this.next - 1), this.ringCount);
  }

  /** The last step done: the time told while the level is still the one going, so the end can ask which it was, and then nothing going. */
  private finish(): void {
    const seconds = this.time;
    this.events.finished?.(seconds);
    this.clear();
  }

  /** Nothing going, and nothing left over of the level that was. */
  private clear(): void {
    this.flying = null;
    this.next = 0;
    this.loading = 0;
    this.time = 0;
    this.seen = false;
  }

  /** How many of the level's steps up to and including the one at `k` are rings. */
  private ringsTo(k: number): number {
    if (!this.flying) return 0;
    const { steps } = this.flying;
    let n = 0;
    for (let j = 0; j <= k && j < steps.length; j++) if (steps[j].kind === 'ring') n++;
    return n;
  }

  /**
   * Whether the helicopter went through `opening`, a ring or a gate, since the last step: see `crossed`, which is given
   * its middle then and now. Where it is now is remembered either way.
   */
  private through(opening: Ring | Gate, h: Readonly<Lander>): boolean {
    const fresh = !this.seen;
    const now = this.here;
    now.x = h.x;
    now.y = h.y;
    now.z = h.z + HELICOPTER.size.middle;
    const crossing = !fresh && crossed(opening, this.was, now);
    this.remember(h);
    return crossing;
  }

  /** Where the helicopter's middle is now, for the next step to go from. */
  private remember(h: Readonly<Lander>): void {
    this.was.x = h.x;
    this.was.y = h.y;
    this.was.z = h.z + HELICOPTER.size.middle;
    this.seen = true;
  }
}
