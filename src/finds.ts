/**
 * The packages found: a hidden package is found the moment the helicopter is landed with its middle within `FIND.reach`
 * of it across the ground, whatever else is going, and what is found is kept in the save by name, so a reload finds it
 * found. The radar is the other half of it: it hears the nearest package not yet found within `RADAR.range`, and its
 * pings come due the faster the nearer that is, on a clock of the game's own time so that a picture of it repeats.
 * Without it a player has nothing to search for, and nothing to say how warm they are.
 */
import type { PackagePlace } from './arena';
import type { Lander } from './mission';
import type { Progress } from './progress';

/** What finds a package: how far from it, across the ground, the helicopter's middle may be when it is landed. */
export const FIND = { reach: 15 };

/**
 * What the radar hears, and how fast it pings. `range` is as far as it hears; `slowest` is the seconds between pings at
 * that edge and `fastest` at the package itself; `ease` bends the line between them, and is the one place the curve's
 * shape is said.
 */
export const RADAR = { range: 100, slowest: 1.2, fastest: 0.15, ease: 0.5 };

/**
 * The seconds between the radar's pings with the nearest package `distance` away, or −1 beyond its range, where it is
 * quiet. The share of the range that is left is taken to the power `ease`, which is under one, so the interval is
 * long for most of the way in and the last 20 m speed it up most, as a meter does that
 * tells you that you are close. Pure, so that the page and the tests read the same curve.
 */
export function radarInterval(distance: number): number {
  if (!(distance >= 0) || distance > RADAR.range) return -1;
  return RADAR.fastest + (RADAR.slowest - RADAR.fastest) * Math.pow(distance / RADAR.range, RADAR.ease);
}

export class Finds {
  /** How many of the game's own packages are found: those the save brought and those found since. */
  count = 0;
  /**
   * The distance to the nearest package not yet found, across the ground, when it is within the radar's range, and −1
   * when none is. Written each step, from where the helicopter was then.
   */
  nearest = -1;
  /** Whether a ping fell due on the last step: the page flashes the radar by it. */
  pinged = false;
  /**
   * The radar's own clock: the game seconds left until its next ping. It runs only while a package is in range, and −1
   * while none is, so that a ping's interval starts from the distance the helicopter is at when it comes into range and
   * again from the distance it is at when each ping falls due.
   */
  until = -1;
  /** Where the helicopter was at the last step, which `nearest` was worked out from. */
  heardX = 0;
  heardY = 0;
  /** The names the save brought with it, which the game need not have: a later game's save has some it does not know. */
  readonly brought: ReadonlySet<string>;

  constructor(
    /** The places there are, in the order they win a tie. */
    readonly places: readonly PackagePlace[],
    private readonly progress: Progress,
  ) {
    this.brought = new Set(progress.found);
    this.count = places.filter((p) => this.has(p.id)).length;
  }

  /** The names found, in the order they were. */
  get ids(): readonly string[] {
    return this.progress.found;
  }

  /** Whether the package named `id` is found. */
  has(id: string): boolean {
    return this.progress.found.includes(id);
  }

  /**
   * One step of `dt` seconds with the helicopter as it is: the package it has just landed by for the first time, or
   * null; then the radar, which hears what is left. Of two in reach the nearer is found, and the other on the next step.
   * Makes nothing.
   */
  step(h: Readonly<Lander>, dt: number): PackagePlace | null {
    const { places } = this;
    let found: PackagePlace | null = null;
    if (h.landed) {
      let least = Infinity;
      for (let k = 0; k < places.length; k++) {
        const p = places[k];
        if (this.has(p.id)) continue;
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (d <= FIND.reach && d < least) {
          least = d;
          found = p;
        }
      }
      if (found) {
        this.progress.find(found.id);
        this.count++;
      }
    }
    let nearest = -1;
    for (let k = 0; k < places.length; k++) {
      const p = places[k];
      if (this.has(p.id)) continue;
      const d = Math.hypot(p.x - h.x, p.y - h.y);
      if (d <= RADAR.range && (nearest < 0 || d < nearest)) nearest = d;
    }
    this.nearest = nearest;
    this.heardX = h.x;
    this.heardY = h.y;
    this.pinged = false;
    if (nearest < 0) this.until = -1;
    else {
      if (this.until < 0) this.until = radarInterval(nearest);
      this.until -= dt;
      if (this.until <= 0) {
        this.pinged = true;
        // the remainder is carried, so the rate is the interval's however the steps fall; never left behind
        this.until += radarInterval(nearest);
        if (this.until <= 0) this.until = radarInterval(nearest);
      }
    }
    return found;
  }
}
