/**
 * The wash under the main rotor: the air it drives down, which spreads out
 * across the ground when it meets it. What it does at a point is worked out
 * here, from where the helicopter is and how fast its rotor turns, and
 * nothing else; what that point is (a tree now, a delivery later) is the
 * caller's. Without it nothing on the island could feel the helicopter go
 * over, and each thing that did would work the air out for itself.
 *
 * It is stepped with nothing and keeps nothing: a sum, asked for as often as
 * it is needed, which allocates nothing.
 */
import { HELICOPTER } from './helicopter';

const RADIUS = HELICOPTER.size.rotorRadius;

/** How the wash spreads and fades. Units are world units, from under the rotor's hub. */
export const DOWNWASH = {
  /** How far out across the ground it is felt. */
  reach: 6 * RADIUS,
  /** Out to here, under the disc, it blows more down than out. */
  column: RADIUS,
  /** How high the hub may be above a point and still blow on it fully, and the height past which it is not felt there. */
  full: 10,
  depth: 30,
  /** The share of its full strength under which it is nothing: an idling rotor's, which is about a thirtieth. */
  floor: 0.1,
};

/** Where the wash comes from: the helicopter's middle, its skids' height above the sea, and how fast its rotor turns. */
export interface WashSource {
  x: number;
  y: number;
  z: number;
  rotorSpeed: number;
}

/**
 * What the wash does at a point: a push across the ground, outward from under the hub (`x`, `y`), and a push down
 * (`down`), each from nothing to one at its strongest.
 */
export interface Wash {
  x: number;
  y: number;
  down: number;
}

/** How strong the wash of a rotor turning at `rotorSpeed` is, from nothing to one: as the square of the speed, as a rotor's thrust is, and nothing under the floor. */
export function washStrength(rotorSpeed: number): number {
  const share = Math.min(1, rotorSpeed / HELICOPTER.rotorFull);
  const strength = share * share;
  return strength < DOWNWASH.floor ? 0 : strength;
}

/** The wash from `source` at the point (x, y) on ground at height `z`, written into `out`, which is returned. */
export function washAt(source: Readonly<WashSource>, x: number, y: number, z: number, out: Wash): Wash {
  out.x = 0;
  out.y = 0;
  out.down = 0;
  const strength = washStrength(source.rotorSpeed);
  if (strength === 0) return out;
  const dx = x - source.x,
    dy = y - source.y;
  const d = Math.hypot(dx, dy);
  const { reach, column, full, depth } = DOWNWASH;
  if (d >= reach) return out;
  // the hub's height over the point: the helicopter's tilt moves it too little to count
  const above = source.z + HELICOPTER.size.mastTop - z;
  const felt = strength * (1 - smooth(full, depth, above));
  if (felt === 0) return out;
  // across the ground: nothing straight under the hub, the most at the disc's edge, and fading to its reach
  const outward = d < column ? smooth(0, column, d) : 1 - smooth(column, reach, d);
  if (d > 0) {
    out.x = (dx / d) * felt * outward;
    out.y = (dy / d) * felt * outward;
  }
  // down: the most straight under the hub, and gone a little past the disc's edge
  out.down = felt * (1 - smooth(0, 1.5 * column, d));
  return out;
}

/** An easing from nothing at `from` to one at `to`, flat at each end, so nothing the wash does starts or stops with a jolt. */
function smooth(from: number, to: number, at: number): number {
  const k = Math.min(1, Math.max(0, (at - from) / (to - from)));
  return k * k * (3 - 2 * k);
}
