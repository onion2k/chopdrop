/**
 * A level as it is flown: a list of steps done in order, a parcel picked up
 * from one pad and set down on another, and the time from the first lift-off
 * to the last step kept. The helicopter does a step by landing on its pad and
 * staying while the parcel is loaded or unloaded. What happens is told through
 * the events it is handed; how it is drawn and put into words is the page's.
 * Without it there is nothing on the island to do.
 */
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

/** What a level asks for, a step at a time: a parcel picked up from a pad, or set down on one, by its place in the island's list. */
export type Step = { kind: 'pickup'; pad: number } | { kind: 'drop'; pad: number };

/** What sort of level it is, as the list of levels names it. */
export type LevelKind = 'delivery';

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

/** What a mission tells as it happens: a parcel loaded on a pad, one delivered to a pad, and the level done, with its time. */
export interface MissionEvents {
  loaded?(pad: number): void;
  delivered?(pad: number): void;
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

  /** The pad the helicopter is wanted on now, or −1 once the level is done. */
  get target(): number {
    return this.current?.pad ?? -1;
  }

  /** Where the step being done wants the helicopter, for the arrow and the pilot: the top of its pad; null once all are done. */
  get goal(): Readonly<Point3> | null {
    const s = this.current;
    if (!s) return null;
    const pad = this.pads[s.pad];
    this.wanted.x = pad.x;
    this.wanted.y = pad.y;
    this.wanted.z = pad.z;
    return this.wanted;
  }

  /** Whether a parcel is aboard: one picked up and not yet set down. */
  get carrying(): boolean {
    let aboard = 0;
    for (let k = 0; k < this.next; k++) aboard += this.flying.steps[k].kind === 'pickup' ? 1 : -1;
    return aboard > 0;
  }

  /**
   * The pad a parcel stands on, as it is drawn: the one waiting to be picked up next, or else the last one delivered;
   * −1 where there is none.
   */
  get waiting(): number {
    const { steps } = this.flying;
    if (this.current?.kind === 'pickup') return this.current.pad;
    for (let k = this.next - 1; k >= 0; k--) if (steps[k].kind === 'drop') return steps[k].pad;
    return -1;
  }

  /** One step of `dt` seconds, with the helicopter where it is now. */
  step(dt: number, h: Readonly<Lander>): void {
    const s = this.current;
    if (!s) return;
    if (!h.landed) this.started = true;
    if (this.started) this.time += dt;
    if (!onPad(h, this.pads[s.pad])) {
      this.loading = 0;
      return;
    }
    this.loading += dt;
    if (this.loading < DELIVERY.load) return;
    this.loading = 0;
    this.next++;
    if (s.kind === 'pickup') this.events.loaded?.(s.pad);
    else this.events.delivered?.(s.pad);
    if (this.done) this.events.finished?.(this.time);
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
  }
}
