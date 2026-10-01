/**
 * A delivery: a parcel waiting on one pad and wanted on another. The
 * helicopter lands on the first and stays while the parcel is loaded, flies
 * it to the second and stays while it is unloaded, and the time from its
 * first lift-off to the end is kept. What happens is told through the events
 * it is handed; how it is drawn and put into words is the page's. Without it
 * there is nothing on the island to do.
 */
import type { Pad } from './island';

/** How a delivery is made. */
export const DELIVERY = {
  /** How long the helicopter must stay landed on the pad for the parcel to be loaded, or unloaded, in seconds. */
  load: 1.5,
  /** How near the middle of the pad its middle must be, as a share of the pad's radius: on the slab, and not its edge. */
  onSlab: 0.8,
  /** How far its skids may be from the pad's top and still be on it, and not on the ground beside. */
  onTop: 0.25,
};

/** Where a delivery has got to: the parcel waiting to be picked up, being carried, or delivered. */
export type Stage = 'pickup' | 'carry' | 'delivered';

/** A delivery's pads, by their place in the island's list: where the parcel waits, and where it is wanted. */
export interface Job {
  pickup: number;
  drop: number;
}

/** What a delivery tells as it happens: the parcel loaded on a pad, and delivered to one, with the time it took. */
export interface DeliveryEvents {
  loaded?(pad: number): void;
  delivered?(pad: number, seconds: number): void;
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

export class Delivery {
  /** Where it has got to. */
  stage: Stage = 'pickup';
  /** How long the helicopter has been landed on the pad it is wanted on, in seconds: it starts again if it lifts. */
  ring = 0;
  /** The seconds since the helicopter first lifted off, until the parcel is delivered; then the time it took. */
  time = 0;
  /** Whether the helicopter has lifted off since the start: the clock waits for it. */
  started = false;

  constructor(
    readonly pads: readonly Pad[],
    readonly job: Job,
    private readonly events: DeliveryEvents = {},
  ) {}

  /** The pad the helicopter is wanted on now, or −1 once the parcel is delivered. */
  get target(): number {
    return this.stage === 'pickup' ? this.job.pickup : this.stage === 'carry' ? this.job.drop : -1;
  }

  /** One step of `dt` seconds, with the helicopter where it is now. */
  step(dt: number, h: Readonly<Lander>): void {
    if (this.stage === 'delivered') return;
    if (!h.landed) this.started = true;
    if (this.started) this.time += dt;
    if (!onPad(h, this.pads[this.target])) {
      this.ring = 0;
      return;
    }
    this.ring += dt;
    if (this.ring < DELIVERY.load) return;
    this.ring = 0;
    if (this.stage === 'pickup') {
      this.stage = 'carry';
      this.events.loaded?.(this.job.pickup);
    } else {
      this.stage = 'delivered';
      this.events.delivered?.(this.job.drop, this.time);
    }
  }

  /** Back to the start: the parcel on its pad, the ring empty and the clock waiting. */
  reset(): void {
    this.stage = 'pickup';
    this.ring = 0;
    this.time = 0;
    this.started = false;
  }
}
