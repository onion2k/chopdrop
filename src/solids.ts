/**
 * What the helicopter cannot fly into: for now the tube of every ring in the
 * level, a torus about its opening. The helicopter is a ball for this, the
 * rotor's reach about its middle, which is rough but fair: what a player sees
 * strike a ring is the rotor. A ball that has run into a tube is pushed back
 * out to just touching it, and the speed it had into the tube turned back at
 * a third, so it is knocked back and carries on, and is never left inside.
 * Without it a ring would be a picture the helicopter flew through.
 *
 * The rings are the level's, set when a level is flown, into room made once
 * for as many as a level may have.
 */
import { RING, RINGS, type Ring } from './mission';

/** How a solid answers a knock. */
export const SOLID = {
  /** The share of the speed into a solid that is turned back off it: a knock, and not a bounce. */
  bounce: 1 / 3,
};

/** What can be knocked: where it stands (its middle is `middle` above that) and how fast it is going. */
export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** The size of what is knocked: how far its middle is above where it stands, and its reach about its middle. */
export interface Size {
  middle: number;
  radius: number;
}

export class Solids {
  /** The rings, as many as there are of them and room for no more, written over when a level is flown. */
  private readonly rings: Ring[] = [];
  /** Whether the last body pushed touched anything: for the fuzzer to count the knocks it has made. */
  touched = false;

  constructor(private readonly size: Size) {}

  /** How many there are. */
  get count(): number {
    return this.rings.length;
  }

  /** The rings of the level being flown; more than a level may have is refused. */
  set(rings: readonly Ring[]): void {
    if (rings.length > RINGS.capacity)
      throw new Error(`${rings.length} rings, and there is room for ${RINGS.capacity}`);
    this.rings.length = 0;
    for (const ring of rings) this.rings.push(ring);
  }

  /**
   * `body` pushed out of any tube it has run into, to just touching it, and the speed it had into the tube turned back
   * at `SOLID.bounce`; whether it touched one. Nothing is made: it runs every step.
   */
  collide(body: Body): boolean {
    const touch = RING.tube + this.size.radius;
    let touched = false;
    for (const ring of this.rings) {
      const n = this.fromTube(ring, body);
      if (n.d >= touch) continue;
      touched = true;
      const push = touch - n.d;
      body.x += n.x * push;
      body.y += n.y * push;
      body.z += n.z * push;
      const into = body.vx * n.x + body.vy * n.y + body.vz * n.z;
      if (into < 0) {
        const turned = (1 + SOLID.bounce) * into;
        body.vx -= turned * n.x;
        body.vy -= turned * n.y;
        body.vz -= turned * n.z;
      }
    }
    this.touched = touched;
    return touched;
  }

  /**
   * How far `body`'s middle is inside the tube it is deepest in, and which ring that is, counting from one: 0 and 0
   * where it is in none. For the invariants.
   */
  inside(body: Readonly<Body>): { depth: number; ring: number } {
    const touch = RING.tube + this.size.radius;
    let depth = 0,
      ring = 0;
    this.rings.forEach((r, k) => {
      const deep = touch - this.fromTube(r, body).d;
      if (deep > depth) {
        depth = deep;
        ring = k + 1;
      }
    });
    return { depth, ring };
  }

  /**
   * How far `body`'s middle is from `ring`'s tube's centre line, and the way out from it, written into one object kept
   * for it. The nearest point of the line is on its circle, the way of the middle across the ring's face: up, where the
   * middle is on the ring's axis, which is in no tube but must still have a way. The way out is from that point to the
   * middle, or along the axis where the middle is on the line itself.
   */
  private fromTube(ring: Ring, body: Readonly<Body>): { x: number; y: number; z: number; d: number } {
    const line = ring.opening + RING.tube;
    const ax = Math.cos(ring.yaw),
      ay = Math.sin(ring.yaw);
    const mx = body.x - ring.x,
      my = body.y - ring.y,
      mz = body.z + this.size.middle - ring.z;
    const along = mx * ax + my * ay;
    const cx = mx - along * ax,
      cy = my - along * ay;
    const out = Math.hypot(cx, cy, mz);
    const nx = mx - (out > 0 ? cx / out : 0) * line,
      ny = my - (out > 0 ? cy / out : 0) * line,
      nz = mz - (out > 0 ? mz / out : 1) * line;
    const d = Math.hypot(nx, ny, nz);
    const w = this.way;
    w.d = d;
    w.x = d > 0 ? nx / d : ax;
    w.y = d > 0 ? ny / d : ay;
    w.z = d > 0 ? nz / d : 0;
    return w;
  }

  /** The way out of a tube, and how far: worked out into this, so that nothing is made each step. */
  private readonly way = { x: 0, y: 0, z: 0, d: 0 };
}
