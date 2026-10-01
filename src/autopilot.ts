/**
 * A pilot that flies the level as a careful player would: up clear of the
 * highest ground between it and the pad that is wanted, turned toward it,
 * across at speed, braked to arrive slowly over it, down onto it, and still
 * while the ring fills. It reads only what a player can see (where the
 * helicopter is and the pad that is wanted) and asks only for what a player
 * can ask for, through the same `Controls`. It draws on no chance and keeps
 * no memory beyond the game's, so the same game flown by it is flown the
 * same way twice.
 *
 * The gates play the game through it: the pace of a level, the same game
 * twice, nothing kept for ever over a long play, and the play-through in the
 * page. Without it none of them has anything to time or watch.
 */
import type { Game } from './game';
import { HELICOPTER, HOVER_LIFT, type Controls } from './helicopter';
import { onPad } from './mission';

/** How it flies. Distances are world units, speeds a second. */
export const PILOT = {
  /** How far over the highest ground on its way it cruises, and over the pad it comes to, before it comes down. */
  clear: 18,
  /** How many points along its way it looks at the ground over, to find the highest. */
  look: 24,
  /** The heading it must be within of the pad, in radians, before it pushes forward; and how hard it turns toward it. */
  aimed: 0.35,
  steer: 2.5,
  /** How it comes in: the speed it may have at a distance is what braking at `brake` would shed by the pad. */
  brake: 9,
  /** How near the pad's middle it must be, and how slow, to come down onto it. */
  over: 2.5,
  slow: 1.5,
  /** How hard it holds a height: lift for each unit it is off it, about the lift that holds still. */
  hold: 0.25,
};

export class Autopilot {
  /** The controls it asks for, written in place each step. */
  private readonly controls: Controls = { forward: 0, turn: 0, lift: 0 };

  constructor(readonly game: Game) {}

  /** One step of the game, flown by it. */
  step(dt: number): void {
    this.game.step(dt, this.drive());
  }

  /** What it would ask for now, from where the helicopter is and the pad that is wanted. Nothing is made. */
  drive(): Controls {
    const c = this.controls;
    const { mission, helicopter: h, island } = this.game;
    c.forward = 0;
    c.turn = 0;
    c.lift = 0;
    if (mission.target < 0) return c;
    const pad = island.pads[mission.target];
    // on the pad that is wanted: still, while the ring fills
    if (onPad(h, pad)) return c;

    const dx = pad.x - h.x,
      dy = pad.y - h.y;
    const far = Math.hypot(dx, dy);
    const cruise = this.cruise(pad.x, pad.y, pad.z);
    if (far < PILOT.over && h.speed < PILOT.slow) {
      // over it and all but stopped: straight down onto it
      c.lift = -1;
      return c;
    }

    const heading = Math.atan2(dy, dx);
    const off = wrap(heading - h.yaw);
    c.turn = clamp(off * PILOT.steer, -1, 1);
    // the speed it may have here, to shed by the pad; ahead of that, brake
    const along = h.vx * Math.cos(h.yaw) + h.vy * Math.sin(h.yaw);
    const allowed = Math.min(HELICOPTER.maxSpeed, Math.sqrt(2 * PILOT.brake * Math.max(0, far - PILOT.over / 2)));
    const high = h.z > cruise - PILOT.clear / 2;
    if (Math.abs(off) < PILOT.aimed && high) c.forward = clamp((allowed - along) / 4, -1, 1);
    else if (along > 1) c.forward = -1;
    // up to its cruise and held there, and never lower while it has a way to go
    c.lift = clamp(HOVER_LIFT + (cruise - h.z) * PILOT.hold, -1, 1);
    return c;
  }

  /** How high to cruise to the pad at (x, y, z): over the highest ground between here and it, and over the pad. */
  private cruise(x: number, y: number, z: number): number {
    const { helicopter: h, island } = this.game;
    let top = z;
    for (let k = 0; k <= PILOT.look; k++) {
      const t = k / PILOT.look;
      top = Math.max(top, island.ground.heightAt(h.x + (x - h.x) * t, h.y + (y - h.y) * t));
    }
    return Math.min(HELICOPTER.ceiling, top + PILOT.clear);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** An angle wrapped into (−π, π]. */
function wrap(a: number): number {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}
