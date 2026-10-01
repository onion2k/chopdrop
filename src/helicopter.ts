/**
 * The player's machine: an arcade helicopter, flown with a stick of three
 * axes and nothing else. It climbs with the lift held, settles into a
 * gentle sink with it let go and comes down fast with it pushed down, and
 * lands; flies forward and back along its heading and turns; tilts into
 * what it does, for the eye; and spins its rotor. It is not a body to the physics, and
 * it is kept inside the world's edge by its own reach, at any height.
 *
 * Its height is absolute, above the sea, and it is held between the ground
 * under it and the ceiling. The ground is handed in, a bounds and a height
 * at every point, so nothing here knows what the island is. The land it
 * flies over can rise: a helicopter low over a hill is set down on the
 * slope that meets it, has no thrust there, and has to lift to get over.
 * Without it the game has nothing a player can do, and nothing the camera,
 * the scene or the fuzzer could follow.
 */

/** What the player is asking for, each from −1 to 1: forward and back, turning left (+) and right, up (+) and down. */
export interface Controls {
  forward: number;
  turn: number;
  lift: number;
}

/** Nothing asked for: a gentle sink in the air until it lands, and rest on the ground. */
export const IDLE: Readonly<Controls> = { forward: 0, turn: 0, lift: 0 };

/** A rectangle on the ground, in world units. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * What it flies over: the world's edge, and the height of what it can stand
 * on at every point (land, water or a pad), which must not allocate, since
 * it is asked for several times a frame.
 */
export interface Ground {
  bounds: Bounds;
  heightAt(x: number, y: number): number;
}

/** Where it starts: a place on the ground, landed, and which way it faces. */
export interface Start {
  x: number;
  y: number;
  yaw: number;
}

const ROTOR_RADIUS = 4.4;

/**
 * How it flies, and how big it is. Units are world units, seconds and
 * radians; the rates are per second. These are starting values, to be
 * tuned by flying it.
 */
export const HELICOPTER = {
  /** Where it starts when it is not told: landed, facing north. The game starts it on the home pad. */
  start: { x: 0, y: -18, yaw: Math.PI / 2 },
  /** Top speed forward along the heading, and backing. */
  maxSpeed: 26,
  backSpeed: 8,
  /** How fast it gets to the speed asked for. */
  accel: 16,
  /** How fast it slows with nothing asked: the speed falls by this share of itself a second. */
  drag: 1.6,
  /** How fast a drift across the heading dies away, the same way. */
  sideDrag: 3,
  /** How fast it slides to a stop on the ground, the same way. */
  groundFriction: 8,
  /** The fastest it turns, and how quickly the turn follows the stick. */
  turnRate: 1.9,
  turnEase: 6,
  /** The fastest it climbs or sinks, how fast it gets there, and the highest it can climb to: above the sea, and above every peak. */
  climbSpeed: 12,
  climbAccel: 16,
  ceiling: 220,
  /**
   * How fast it sinks with the lift let go, a third of the climb, and how gently it settles into that sink, so
   * letting go is a settle and not a drop: from a hover it is sinking at the full rate in a second.
   */
  sinkSpeed: 4,
  sinkEase: 4,
  /** The most it tilts nose-down or nose-up, and banks; and how quickly the tilt follows. */
  maxPitch: 0.28,
  maxRoll: 0.35,
  tiltEase: 5,
  /** The rotor's speed on the ground at rest, and otherwise; how quickly it changes; and the tail rotor's speed against it. */
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
  /** How far its middle stays from the world's edge: the rotor's reach, and a margin, so the blades never leave the world. */
  reach: ROTOR_RADIUS + 0.5,
  /**
   * How far its skids reach from its middle, each way. It stands on the
   * highest of the ground under the middle and under the four corners of
   * this, so it never settles with its belly in a slope, and it tilts to
   * the slope across it.
   */
  footprint: 1.8,
};

/**
 * The lift that holds its height: lift runs on one line from the climb at 1, through the sink at 0, to the way down
 * at −1, and crosses still air a quarter of the way up. A touch stick can hold it; keys can only tap at it.
 */
export const HOVER_LIFT = HELICOPTER.sinkSpeed / (HELICOPTER.climbSpeed + HELICOPTER.sinkSpeed);

export class Helicopter {
  /** Where it is: x and y across the ground, and z the height of its skids' base above the sea. */
  x = 0;
  y = 0;
  z = 0;
  /** The height of the ground it stands on here: the most of the ground under its middle and under its skids. It never goes lower. */
  floor = 0;
  /** Which way it faces: 0 is +x, and it grows turning left. */
  yaw = 0;
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
  /** Where its middle may go: the ground's edge, drawn in by its reach. */
  readonly bounds: Bounds;
  private readonly ground: Ground;

  /** On `ground`, landed where `start` says. */
  constructor(ground: Ground, start: Start = HELICOPTER.start) {
    const r = HELICOPTER.reach;
    const edge = ground.bounds;
    this.ground = ground;
    this.bounds = { minX: edge.minX + r, minY: edge.minY + r, maxX: edge.maxX - r, maxY: edge.maxY - r };
    this.place(start.x, start.y, 0, start.yaw);
  }

  /** Whether it is on the ground. */
  get landed(): boolean {
    return this.z === this.floor;
  }

  /** How high its skids are above the ground it stands on. */
  get height(): number {
    return this.z - this.floor;
  }

  /** How fast it is going across the ground. */
  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** The tail rotor's angle, which turns with the main rotor's. */
  get tailRotor(): number {
    return wrapTurn(this.rotor * HELICOPTER.tailRotorRatio);
  }

  /**
   * The height it would stand at with its middle at (x, y): the highest of
   * the ground there and at the four corners of its footprint, so a
   * helicopter on a slope rests on its uphill skids. The same rule for
   * the flight, the invariants and the fuzzer.
   */
  floorAt(x: number, y: number): number {
    const g = this.ground;
    const f = HELICOPTER.footprint;
    return Math.max(
      g.heightAt(x, y),
      g.heightAt(x - f, y - f),
      g.heightAt(x + f, y - f),
      g.heightAt(x - f, y + f),
      g.heightAt(x + f, y + f),
    );
  }

  /** One step of `dt` seconds, flown so. Allocates nothing: it runs every frame. */
  step(dt: number, controls: Readonly<Controls>): void {
    const H = HELICOPTER;
    const forward = clamp(controls.forward, -1, 1);
    const turn = clamp(controls.turn, -1, 1);
    const lift = clamp(controls.lift, -1, 1);

    // the rotor idles only when it is resting on the ground, and winds up the moment the player asks to leave it
    const rotorTarget = this.landed && lift <= 0 ? H.rotorIdle : H.rotorFull;
    this.rotorSpeed += (rotorTarget - this.rotorSpeed) * (1 - Math.exp(-H.rotorEase * dt));
    this.rotor = wrapTurn(this.rotor + this.rotorSpeed * dt);

    // up and down: the climb follows the stick along one line, from the climb at 1 through the sink at nothing to the
    // way down at −1, and the ground and the ceiling are hard stops
    const climb =
      lift >= 0
        ? -H.sinkSpeed + lift * (H.climbSpeed + H.sinkSpeed)
        : -H.sinkSpeed + lift * (H.climbSpeed - H.sinkSpeed);
    // settling into a sink no faster than the sink is eased gently, so letting go is a settle and not a drop; braking
    // a climb, and coming down faster than the sink, are as quick as they ever were
    const settling = climb < 0 && climb >= -H.sinkSpeed && this.vz <= 0;
    this.vz = moveToward(this.vz, climb, (settling ? H.sinkEase : H.climbAccel) * dt);
    this.z += this.vz * dt;
    if (this.z <= this.floor) {
      this.z = this.floor;
      this.vz = 0;
    } else if (this.z >= H.ceiling) {
      this.z = H.ceiling;
      if (this.vz > 0) this.vz = 0;
    }

    const tiltK = 1 - Math.exp(-H.tiltEase * dt);
    const grounded = this.z === this.floor;
    if (grounded) {
      // the skids are down: no thrust and no turning, only a slide that dies away, and a lean to the slope
      this.yawRate = 0;
      const slide = Math.exp(-H.groundFriction * dt);
      this.vx *= slide;
      this.vy *= slide;
      this.pitch += (this.slopePitch() - this.pitch) * tiltK;
      this.roll += (this.slopeRoll() - this.roll) * tiltK;
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

    // the ground where it has got to: skids down they follow it, and in the air land that has risen to meet it sets it on the slope
    this.floor = this.floorAt(this.x, this.y);
    if (grounded) this.z = this.floor;
    else if (this.z < this.floor) {
      this.z = this.floor;
      if (this.vz < 0) this.vz = 0;
    }

    if (!grounded) {
      const banking = Math.min(1, this.speed / (0.5 * H.maxSpeed));
      this.pitch += (H.maxPitch * forward - this.pitch) * tiltK;
      this.roll += (-H.maxRoll * (this.yawRate / H.turnRate) * banking - this.roll) * tiltK;
    }
  }

  /**
   * Put somewhere, kept inside the bounds and between the ground and the
   * ceiling, stopped and level, or leaning to the slope if it is on the
   * ground. `z` is a height above the sea.
   */
  place(x: number, y: number, z: number, yaw: number): void {
    const b = this.bounds;
    this.x = clamp(x, b.minX, b.maxX);
    this.y = clamp(y, b.minY, b.maxY);
    this.floor = this.floorAt(this.x, this.y);
    this.z = clamp(z, this.floor, HELICOPTER.ceiling);
    this.yaw = wrapYaw(yaw);
    this.vx = this.vy = this.vz = 0;
    this.yawRate = 0;
    this.pitch = this.landed ? this.slopePitch() : 0;
    this.roll = this.landed ? this.slopeRoll() : 0;
  }

  /** Put `height` above the ground at (x, y), as `place` otherwise: for a caller who knows how high, and not where the land is. */
  placeAbove(x: number, y: number, height: number, yaw: number): void {
    const b = this.bounds;
    const px = clamp(x, b.minX, b.maxX);
    const py = clamp(y, b.minY, b.maxY);
    this.place(px, py, this.floorAt(px, py) + height, yaw);
  }

  /** The nose-down tilt that lays it along the slope under it, along its heading: nose up where the land rises ahead. */
  private slopePitch(): number {
    const c = Math.cos(this.yaw) * HELICOPTER.footprint;
    const s = Math.sin(this.yaw) * HELICOPTER.footprint;
    const g = this.ground;
    const rise = (g.heightAt(this.x + c, this.y + s) - g.heightAt(this.x - c, this.y - s)) / (2 * HELICOPTER.footprint);
    return clamp(-Math.atan(rise), -HELICOPTER.maxPitch, HELICOPTER.maxPitch);
  }

  /** The bank that lays it along the slope under it, across its heading: the left side up where the land rises to the left. */
  private slopeRoll(): number {
    const c = Math.cos(this.yaw) * HELICOPTER.footprint;
    const s = Math.sin(this.yaw) * HELICOPTER.footprint;
    const g = this.ground;
    const rise = (g.heightAt(this.x - s, this.y + c) - g.heightAt(this.x + s, this.y - c)) / (2 * HELICOPTER.footprint);
    return clamp(Math.atan(rise), -HELICOPTER.maxRoll, HELICOPTER.maxRoll);
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
