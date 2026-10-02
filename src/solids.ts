/**
 * What the helicopter cannot fly into: the blocks that stand on the island
 * in every level, the bridge's deck and the towers, and the tube of every
 * ring that is drawn, a torus about its opening. The helicopter is
 * a ball for this, the rotor's reach about its middle, which is rough but
 * fair: what a player sees strike a ring or a tower is the rotor. A ball that
 * has run into one is pushed back out to just touching it, and the speed it
 * had into it turned back at a third, so it is knocked back and carries on,
 * and is never left inside. Without it a ring or a tower would be a picture
 * the helicopter flew through.
 *
 * The blocks are handed in once and kept; the rings are the ones drawn, set
 * when a level begins or ends, into room made once for as many as there may be.
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

/**
 * A block that stands on the island: its foot's middle at (x, y, z), turned to `yaw`, `length` along that, `width`
 * across it and `height` up from its foot; `name` is what it is, as a rule broken says it: "the bridge"; and `kind`
 * which sort of thing it is, which the solids do not care about and the scene paints it by.
 */
export interface Block {
  name: string;
  kind: 'deck' | 'abutment' | 'tower';
  x: number;
  y: number;
  z: number;
  yaw: number;
  length: number;
  width: number;
  height: number;
}

/** The size of what is knocked: how far its middle is above where it stands, and its reach about its middle. */
export interface Size {
  middle: number;
  radius: number;
}

export class Solids {
  /** The rings, as many as there are of them and room for no more, written over when a level begins or ends. */
  private readonly held: Ring[] = [];
  /** Whether the last body pushed touched anything: for the fuzzer to count the knocks it has made. */
  touched = false;

  constructor(
    private readonly size: Size,
    /** What stands on the island in every level, kept as it is handed in. */
    readonly blocks: readonly Block[] = [],
  ) {}

  /** How many rings there are. */
  get count(): number {
    return this.held.length;
  }

  /** The rings that are solid now, in the order they were set: what the pilot goes round. Not to be written to. */
  get rings(): readonly Ring[] {
    return this.held;
  }

  /** The rings that are solid now, those of the level going and every start ring; more than the room made is refused. The blocks stay. */
  set(rings: readonly Ring[]): void {
    if (rings.length > RINGS.capacity)
      throw new Error(`${rings.length} rings, and there is room for ${RINGS.capacity}`);
    this.held.length = 0;
    for (const ring of rings) this.held.push(ring);
  }

  /**
   * `body` pushed out of anything it has run into, to just touching it, and the speed it had into it turned back at
   * `SOLID.bounce`; whether it touched anything. Nothing is made: it runs every step.
   */
  collide(body: Body): boolean {
    let touched = false;
    for (const ring of this.held) touched = this.knock(body, this.fromTube(ring, body)) || touched;
    for (const block of this.blocks) touched = this.knock(body, this.fromBlock(block, body)) || touched;
    this.touched = touched;
    return touched;
  }

  /**
   * How far `body` is inside whatever it is deepest in, and what that is: "ring 2 of 6", or a block's name; nothing
   * and "" where it is in none. For the invariants.
   */
  inside(body: Readonly<Body>): { depth: number; what: string } {
    let depth = 0,
      what = '';
    this.held.forEach((ring, k) => {
      const deep = -this.fromTube(ring, body).gap;
      if (deep > depth) [depth, what] = [deep, `ring ${k + 1} of ${this.held.length}`];
    });
    for (const block of this.blocks) {
      const deep = -this.fromBlock(block, body).gap;
      if (deep > depth) [depth, what] = [deep, block.name];
    }
    return { depth, what };
  }

  /** How far the reach of a body standing at (x, y, z) would be from touching `block`: less than nothing inside it. */
  gapTo(block: Block, x: number, y: number, z: number): number {
    const probe = this.probe;
    probe.x = x;
    probe.y = y;
    probe.z = z;
    return this.fromBlock(block, probe).gap;
  }

  /**
   * How far the point (x, y, z) is from the nearest block, less than nothing inside one, and endless where there are
   * none: for the camera, which keeps off them. The rings are left out; a tube passing the lens is a thing of a frame.
   */
  distanceAt(x: number, y: number, z: number): number {
    let d = Infinity;
    // a body whose middle is at the point, less its reach
    for (const block of this.blocks) d = Math.min(d, this.gapTo(block, x, y, z - this.size.middle) + this.size.radius);
    return d;
  }

  /** `body` pushed out along `way` by as far as it is past touching, and knocked back; whether it was past touching. */
  private knock(body: Body, way: Readonly<Way>): boolean {
    if (way.gap >= 0) return false;
    body.x -= way.x * way.gap;
    body.y -= way.y * way.gap;
    body.z -= way.z * way.gap;
    const into = body.vx * way.x + body.vy * way.y + body.vz * way.z;
    if (into < 0) {
      const turned = (1 + SOLID.bounce) * into;
      body.vx -= turned * way.x;
      body.vy -= turned * way.y;
      body.vz -= turned * way.z;
    }
    return true;
  }

  /**
   * The way out of `ring`'s tube for `body`, and how far its reach is from touching the tube: less than nothing where
   * it is in it. The nearest point of the tube's centre line is on its circle, the way of the middle across the ring's
   * face: up, where the middle is on the ring's axis, which is in no tube but must still have a way. The way out is
   * from that point to the middle, or along the axis where the middle is on the line itself.
   */
  private fromTube(ring: Ring, body: Readonly<Body>): Readonly<Way> {
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
    w.gap = d - RING.tube - this.size.radius;
    w.x = d > 0 ? nx / d : ax;
    w.y = d > 0 ? ny / d : ay;
    w.z = d > 0 ? nz / d : 0;
    return w;
  }

  /**
   * The way out of `block` for `body`, and how far its reach is from touching it: less than nothing where it is in it.
   * Outside, the way is from the nearest point of the block to the middle; with the middle inside, it is out through
   * the face it is nearest, and the middle is that far further in.
   */
  private fromBlock(block: Block, body: Readonly<Body>): Readonly<Way> {
    const c = Math.cos(block.yaw),
      s = Math.sin(block.yaw);
    const mx = body.x - block.x,
      my = body.y - block.y;
    // in the block's own frame: along it, across it, and up from its foot
    const along = mx * c + my * s,
      across = -mx * s + my * c,
      up = body.z + this.size.middle - block.z;
    const hl = block.length / 2,
      hw = block.width / 2;
    const dx = along - clamp(along, -hl, hl),
      dy = across - clamp(across, -hw, hw),
      dz = up - clamp(up, 0, block.height);
    const out = Math.hypot(dx, dy, dz);
    let lx: number, ly: number, lz: number, d: number;
    if (out > 0) {
      [lx, ly, lz, d] = [dx / out, dy / out, dz / out, out];
    } else {
      // inside: out through the nearest of its six faces
      const faces = [hl - along, along + hl, hw - across, across + hw, block.height - up, up];
      let k = 0;
      for (let f = 1; f < 6; f++) if (faces[f] < faces[k]) k = f;
      lx = k === 0 ? 1 : k === 1 ? -1 : 0;
      ly = k === 2 ? 1 : k === 3 ? -1 : 0;
      lz = k === 4 ? 1 : k === 5 ? -1 : 0;
      d = -faces[k];
    }
    const w = this.way;
    w.gap = d - this.size.radius;
    w.x = lx * c - ly * s;
    w.y = lx * s + ly * c;
    w.z = lz;
    return w;
  }

  /** A body to ask `gapTo` about, kept so that asking makes nothing. */
  private readonly probe: Body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

  /** The way out of a solid, and how far from touching it: worked out into this, so that nothing is made each step. */
  private readonly way: Way = { x: 0, y: 0, z: 0, gap: 0 };
}

/** A way out of a solid, as a unit length, and how far the reach is from touching it: less than nothing inside it. */
interface Way {
  x: number;
  y: number;
  z: number;
  gap: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
