/**
 * The player's machine: an arcade helicopter, flown with a stick of three
 * axes and nothing else. It climbs, holds its height and lands; flies
 * forward and back along its heading and turns; tilts into what it does,
 * for the eye; and spins its rotor. It is not a body to the physics, and
 * it is kept inside the floor's edge by its own reach, at any height.
 *
 * It is handed the floor's edge rather than reading the arena, so nothing
 * here knows what the arena is. Without it the game has nothing a player
 * can do, and nothing the camera, the scene or the fuzzer could follow.
 */

/** What the player is asking for, each from −1 to 1: forward and back, turning left (+) and right, up (+) and down. */
export interface Controls {
  forward: number;
  turn: number;
  lift: number;
}

/** Nothing asked for: a hover in the air, and rest on the floor. */
export const IDLE: Readonly<Controls> = { forward: 0, turn: 0, lift: 0 };

/** A rectangle on the floor, in world units. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const ROTOR_RADIUS = 4.4;

/**
 * How it flies, and how big it is. Units are world units, seconds and
 * radians; the rates are per second. These are starting values, to be
 * tuned by flying it.
 */
export const HELICOPTER = {
  /** Where it starts: landed, facing north. */
  start: { x: 0, y: -18, yaw: Math.PI / 2 },
  /** Top speed forward along the heading, and backing. */
  maxSpeed: 16,
  backSpeed: 6.4,
  /** How fast it gets to the speed asked for. */
  accel: 14,
  /** How fast it slows with nothing asked: the speed falls by this share of itself a second. */
  drag: 1.6,
  /** How fast a drift across the heading dies away, the same way. */
  sideDrag: 3,
  /** How fast it slides to a stop on the floor, the same way. */
  groundFriction: 8,
  /** The fastest it turns, and how quickly the turn follows the stick. */
  turnRate: 1.9,
  turnEase: 6,
  /** The fastest it climbs or sinks, how fast it gets there, and the most its skids can be above the floor. */
  climbSpeed: 7,
  climbAccel: 12,
  ceiling: 28,
  /** The most it tilts nose-down or nose-up, and banks; and how quickly the tilt follows. */
  maxPitch: 0.28,
  maxRoll: 0.35,
  tiltEase: 5,
  /** The rotor's speed on the floor at rest, and otherwise; how quickly it changes; and the tail rotor's speed against it. */
  rotorIdle: 6,
  rotorFull: 32,
  rotorEase: 2,
  tailRotorRatio: 3,
  /**
   * Its size, in its own frame: x forward, y left, z up, the skids' base at
   * the origin. The scene draws it from these and the bounds are kept by
   * them, so they are said here once.
   */
  size: {
    rotorRadius: ROTOR_RADIUS,
    /** Where the main rotor's hub is, above the origin. */
    mastTop: 3.1,
    /** Where the tail rotor's hub is. */
    tailRotorAt: [-6.2, 0.35, 2.4] as readonly [number, number, number],
    tailRotorRadius: 0.8,
    /** From the skids to the top of the rotor hub, and a little: for the shadow's reach. */
    height: 3.6,
  },
  /** How far its middle stays from the floor's edge: the rotor's reach, and a margin, so the blades never cut the rock. */
  reach: ROTOR_RADIUS + 0.5,
};

export class Helicopter {
  /** Where it is: its skids' base above the floor at height z, 0 when it has landed. */
  x: number = HELICOPTER.start.x;
  y: number = HELICOPTER.start.y;
  z = 0;
  /** Which way it faces: 0 is +x, and it grows turning left. */
  yaw: number = HELICOPTER.start.yaw;
  /** How fast it is going, in the world's axes. */
  vx = 0;
  vy = 0;
  vz = 0;
  /** How fast it is turning, + to the left. */
  yawRate = 0;
  /** How it is tilted, for the eye: pitch + is nose down, roll + is the left side up. */
  pitch = 0;
  roll = 0;
  /** The rotor's angle, kept within a turn, and how fast it is spinning. */
  rotor = 0;
  rotorSpeed: number = HELICOPTER.rotorIdle;
  /** Where its middle may go: the floor handed in, drawn in by its reach. */
  readonly bounds: Bounds;

  constructor(floor: Bounds) {
    const r = HELICOPTER.reach;
    this.bounds = { minX: floor.minX + r, minY: floor.minY + r, maxX: floor.maxX - r, maxY: floor.maxY - r };
  }

  /** Whether it is on the floor. */
  get landed(): boolean {
    return this.z === 0;
  }

  /** How fast it is going across the floor. */
  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** The tail rotor's angle, which turns with the main rotor's. */
  get tailRotor(): number {
    return wrapTurn(this.rotor * HELICOPTER.tailRotorRatio);
  }

  /** One step of `dt` seconds, flown so. Allocates nothing: it runs every frame. */
  step(dt: number, controls: Readonly<Controls>): void {
    const H = HELICOPTER;
    const forward = clamp(controls.forward, -1, 1);
    const turn = clamp(controls.turn, -1, 1);
    const lift = clamp(controls.lift, -1, 1);

    // the rotor idles only when it is resting on the floor, and winds up the moment the player asks to leave it
    const rotorTarget = this.z === 0 && lift <= 0 ? H.rotorIdle : H.rotorFull;
    this.rotorSpeed += (rotorTarget - this.rotorSpeed) * (1 - Math.exp(-H.rotorEase * dt));
    this.rotor = wrapTurn(this.rotor + this.rotorSpeed * dt);

    // up and down: the climb follows the stick, and the floor and the ceiling are hard stops
    this.vz = moveToward(this.vz, lift * H.climbSpeed, H.climbAccel * dt);
    this.z += this.vz * dt;
    if (this.z <= 0) {
      this.z = 0;
      this.vz = 0;
    } else if (this.z >= H.ceiling) {
      this.z = H.ceiling;
      if (this.vz > 0) this.vz = 0;
    }

    const tiltK = 1 - Math.exp(-H.tiltEase * dt);
    if (this.z === 0) {
      // the skids are down: no thrust and no turning, only a slide that dies away
      this.yawRate = 0;
      const slide = Math.exp(-H.groundFriction * dt);
      this.vx *= slide;
      this.vy *= slide;
      this.pitch += (0 - this.pitch) * tiltK;
      this.roll += (0 - this.roll) * tiltK;
    } else {
      this.yawRate += (turn * H.turnRate - this.yawRate) * (1 - Math.exp(-H.turnEase * dt));
      this.yaw = wrapYaw(this.yaw + this.yawRate * dt);

      // the velocity along the heading is the pilot's, and across it only drifts away
      const cos = Math.cos(this.yaw);
      const sin = Math.sin(this.yaw);
      let vf = this.vx * cos + this.vy * sin;
      let vs = -this.vx * sin + this.vy * cos;
      if (forward > 0) vf = moveToward(vf, forward * H.maxSpeed, H.accel * dt);
      else if (forward < 0) vf = moveToward(vf, forward * H.backSpeed, H.accel * dt);
      else vf *= Math.exp(-H.drag * dt);
      vs *= Math.exp(-H.sideDrag * dt);
      this.vx = vf * cos - vs * sin;
      this.vy = vf * sin + vs * cos;
      // a hard turn at full speed swings the heading under the velocity, and must never add to it
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > H.maxSpeed) {
        const scale = H.maxSpeed / speed;
        this.vx *= scale;
        this.vy *= scale;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const b = this.bounds;
    if (this.x < b.minX) {
      this.x = b.minX;
      this.vx = Math.max(this.vx, 0);
    } else if (this.x > b.maxX) {
      this.x = b.maxX;
      this.vx = Math.min(this.vx, 0);
    }
    if (this.y < b.minY) {
      this.y = b.minY;
      this.vy = Math.max(this.vy, 0);
    } else if (this.y > b.maxY) {
      this.y = b.maxY;
      this.vy = Math.min(this.vy, 0);
    }

    if (this.z > 0) {
      const banking = Math.min(1, this.speed / (0.5 * H.maxSpeed));
      this.pitch += (H.maxPitch * forward - this.pitch) * tiltK;
      this.roll += (-H.maxRoll * (this.yawRate / H.turnRate) * banking - this.roll) * tiltK;
    }
  }

  /** Put somewhere, kept inside the bounds and under the ceiling, stopped and level. */
  place(x: number, y: number, z: number, yaw: number): void {
    const b = this.bounds;
    this.x = clamp(x, b.minX, b.maxX);
    this.y = clamp(y, b.minY, b.maxY);
    this.z = clamp(z, 0, HELICOPTER.ceiling);
    this.yaw = wrapYaw(yaw);
    this.vx = this.vy = this.vz = 0;
    this.yawRate = 0;
    this.pitch = 0;
    this.roll = 0;
  }
}

const TAU = Math.PI * 2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** `from` moved toward `to` by at most `by`, and no further than it. */
function moveToward(from: number, to: number, by: number): number {
  return from < to ? Math.min(from + by, to) : Math.max(from - by, to);
}

/** An angle wrapped into [0, 2π). */
function wrapTurn(a: number): number {
  const w = a - TAU * Math.floor(a / TAU);
  return w >= TAU ? 0 : w;
}

/** A heading wrapped into (−π, π]. */
function wrapYaw(a: number): number {
  const w = a - TAU * Math.floor((a + Math.PI) / TAU);
  return w === -Math.PI ? Math.PI : w;
}
