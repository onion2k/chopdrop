/**
 * The player's machine: a sled, driven with a throttle and a steer, that
 * shoves whatever is in front of it. It is a box to the physics and a box to
 * the eye, and it is kept on the floor by the floor's edge rather than by
 * the rock, so a ball always fits between it and the wall.
 */
import { FLOOR, KIND_RADIUS } from './arena';
import type { Pusher } from './physics';

export interface Drive {
  throttle: number;
  steer: number;
}

/** How it moves, and how big it is: half-length along, half-width across, half-height up. */
export const SLED = { maxSpeed: 12, accel: 16, drag: 4, turnRate: 2.2, half: [2.2, 1.6, 1.0] as const };
/** How far the sled's middle stays from the floor's edge: its own reach, and a ball's width past that. */
const MARGIN = Math.hypot(SLED.half[0], SLED.half[1]) + Math.max(...KIND_RADIUS) * 2 + 0.5;

export class Sled {
  x = 0;
  y = -22;
  yaw = Math.PI / 2;
  speed = 0;
  yawRate = 0;

  step(dt: number, drive: Drive) {
    const throttle = Math.max(-1, Math.min(1, drive.throttle)),
      steer = Math.max(-1, Math.min(1, drive.steer));
    const want = throttle * SLED.maxSpeed;
    // toward what the throttle asks, and coasting to a stop when it asks nothing
    if (throttle) this.speed += Math.max(-SLED.accel * dt, Math.min(SLED.accel * dt, want - this.speed));
    else this.speed *= Math.max(0, 1 - SLED.drag * dt);
    this.yawRate = steer * SLED.turnRate;
    this.yaw += this.yawRate * dt;
    this.x += Math.cos(this.yaw) * this.speed * dt;
    this.y += Math.sin(this.yaw) * this.speed * dt;
    // held on the floor: stopped against its edge, not slid along it
    const x = Math.max(FLOOR.minX + MARGIN, Math.min(FLOOR.maxX - MARGIN, this.x)),
      y = Math.max(FLOOR.minY + MARGIN, Math.min(FLOOR.maxY - MARGIN, this.y));
    if (x !== this.x || y !== this.y) this.speed = 0;
    this.x = x;
    this.y = y;
  }

  /** The box the physics shoves with, written into `out` so nothing is made each frame. */
  pusher(out: Pusher): Pusher {
    out.x = this.x;
    out.y = this.y;
    out.z = SLED.half[2];
    out.yaw = this.yaw;
    out.hx = SLED.half[0];
    out.hy = SLED.half[1];
    out.hz = SLED.half[2];
    out.vx = Math.cos(this.yaw) * this.speed;
    out.vy = Math.sin(this.yaw) * this.speed;
    out.spin = this.yawRate;
    out.px = this.x;
    out.py = this.y;
    out.owner = 0;
    return out;
  }
}
