/**
 * The solids, on their own: a ring's tube as a torus the helicopter cannot enter. A body touching one is pushed out
 * to just touching, and the speed it had into the tube turned back at a third, so it is knocked back and carries on;
 * a body clear of every tube, in an opening or beside it, is left alone; and none is ever left inside, from any side.
 */
import { describe, expect, it } from 'vitest';
import { HELICOPTER } from '../src/helicopter';
import { RING, RINGS, type Ring } from '../src/mission';
import { seeded as randomFor } from '../src/random';
import { SOLID, Solids, type Block, type Body } from '../src/solids';

const MIDDLE = HELICOPTER.size.middle;
const RADIUS = HELICOPTER.size.rotorRadius;
/** A ring of opening 8 high over the island, facing +x: its tube's centre line is a circle of 8.8 in the y-z plane. */
const RING_AT: Ring = { kind: 'ring', x: 0, y: 0, z: 100, yaw: 0, opening: 8 };
const LINE = RING_AT.opening + RING.tube;
const TOUCH = RING.tube + RADIUS;

/** A body whose middle is at (x, y, z), going at (vx, vy, vz). */
const body = (x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): Body => ({ x, y, z: z - MIDDLE, vx, vy, vz });
/** How far a body's middle is from the ring's tube, from the tube's centre line. */
const fromTube = (b: Body, ring = RING_AT) => {
  const mz = b.z + MIDDLE;
  const along = (b.x - ring.x) * Math.cos(ring.yaw) + (b.y - ring.y) * Math.sin(ring.yaw);
  const across = -(b.x - ring.x) * Math.sin(ring.yaw) + (b.y - ring.y) * Math.cos(ring.yaw);
  return Math.hypot(along, Math.hypot(across, mz - ring.z) - (ring.opening + RING.tube));
};
const solids = () => {
  const s = new Solids({ middle: MIDDLE, radius: RADIUS });
  s.set([RING_AT]);
  return s;
};

describe('the solids', () => {
  it('leave alone a body in an opening, beside a ring, or far from it', () => {
    const s = solids();
    for (const b of [body(0, 0, 100, 20, 0, 0), body(0, 1, 102, 26, 0, 0), body(0, 15, 100), body(-40, 0, 100)]) {
      const was = { ...b };
      expect(s.collide(b)).toBe(false);
      expect(b).toEqual(was);
    }
  });

  it('push a body out of a tube to just touching it', () => {
    const s = solids();
    // its middle on the tube's top, inside it
    const b = body(0, 0, 100 + LINE + 1);
    expect(s.collide(b)).toBe(true);
    expect(fromTube(b)).toBeCloseTo(TOUCH, 9);
    expect(b.z + MIDDLE).toBeGreaterThan(100 + LINE + 1);
  });

  it(`knock a body back at ${SOLID.bounce.toFixed(2)} of its speed into the tube, and leave its speed along it`, () => {
    const s = solids();
    // coming down onto the top of the tube at 10, and going along the ring's axis at 5
    const b = body(0, 0, 100 + LINE + TOUCH - 0.5, 5, 0, -10);
    s.collide(b);
    expect(b.vz).toBeCloseTo(10 * SOLID.bounce, 9);
    expect(b.vx).toBeCloseTo(5, 9);
    // and one going away from the tube already is not slowed
    const leaving = body(0, 0, 100 + LINE + TOUCH - 0.5, 0, 0, 3);
    s.collide(leaving);
    expect(leaving.vz).toBeCloseTo(3, 9);
  });

  it('never leave a body inside, wherever about the ring it is and however it is going', () => {
    const s = solids();
    const random = randomFor(3);
    let touched = 0;
    for (let n = 0; n < 5000; n++) {
      // anywhere within reach of the tube: round the ring, either side of it, in or out
      const round = random() * Math.PI * 2;
      const tilt = random() * Math.PI * 2;
      const reach = random() * TOUCH;
      const from = LINE + Math.cos(tilt) * reach;
      const b = body(
        Math.sin(tilt) * reach,
        Math.cos(round) * from,
        100 + Math.sin(round) * from,
        (random() - 0.5) * 60,
        (random() - 0.5) * 60,
        (random() - 0.5) * 30,
      );
      if (s.collide(b)) touched++;
      expect(fromTube(b)).toBeGreaterThanOrEqual(TOUCH - 1e-9);
    }
    expect(touched).toBeGreaterThan(4000);
  });

  it('hold the rings of a level, turned as they face, and none for a level with none', () => {
    const s = new Solids({ middle: MIDDLE, radius: RADIUS });
    const turned: Ring = { ...RING_AT, x: 50, y: 50, yaw: 1 };
    s.set([RING_AT, turned]);
    expect(s.count).toBe(2);
    // the turned ring's top, inside its tube, is pushed out of it
    const b = body(50, 50, 100 + LINE);
    expect(s.collide(b)).toBe(true);
    expect(fromTube(b, turned)).toBeCloseTo(TOUCH, 9);
    s.set([]);
    expect(s.count).toBe(0);
    expect(s.collide(body(0, 0, 100 + LINE))).toBe(false);
  });

  it(`hold at most ${RINGS.capacity} rings, as many as a level may have, and refuse more by name`, () => {
    const s = new Solids({ middle: MIDDLE, radius: RADIUS });
    const many = Array.from({ length: RINGS.capacity + 1 }, (_, k) => ({ ...RING_AT, x: k * 40 }));
    s.set(many.slice(0, RINGS.capacity));
    expect(s.count).toBe(RINGS.capacity);
    expect(() => s.set(many)).toThrow(/13 rings, and there is room for 12/);
  });
});

describe('the solids, as blocks', () => {
  // a tower 6 by 6 and 35 tall, turned half a radian, its foot at (0, 0, 100)
  const TOWER: Block = {
    name: 'the tower',
    kind: 'tower',
    x: 0,
    y: 0,
    z: 100,
    yaw: 0.5,
    length: 6,
    width: 6,
    height: 35,
  };
  const blocks = () => new Solids({ middle: MIDDLE, radius: RADIUS }, [TOWER]);
  /** A body whose middle is at `along`, `across` and `up` in the tower's own frame, going so in the world. */
  const near = (along: number, across: number, up: number, vx = 0, vy = 0, vz = 0) => {
    const [c, s] = [Math.cos(TOWER.yaw), Math.sin(TOWER.yaw)];
    return body(along * c - across * s, along * s + across * c, TOWER.z + up, vx, vy, vz);
  };
  /** How far a body's middle is from the tower, outside it; less than nothing inside it. */
  const fromBlock = (b: Body) => {
    const [c, s] = [Math.cos(TOWER.yaw), Math.sin(TOWER.yaw)];
    const along = b.x * c + b.y * s,
      across = -b.x * s + b.y * c,
      up = b.z + MIDDLE - TOWER.z;
    const dx = Math.max(Math.abs(along) - 3, 0),
      dy = Math.max(Math.abs(across) - 3, 0),
      dz = Math.max(up - 35, -up, 0);
    const outside = Math.hypot(dx, dy, dz);
    return outside > 0 ? outside : -Math.min(3 - Math.abs(along), 3 - Math.abs(across), up, 35 - up);
  };

  it('leave alone a body clear of a block, beside it, over it or off its corner', () => {
    const s = blocks();
    for (const b of [near(3 + RADIUS + 0.5, 0, 10), near(0, 0, 35 + RADIUS + 0.5), near(7, 7, 10), near(-30, 0, 10)]) {
      const was = { ...b };
      expect(s.collide(b)).toBe(false);
      expect(b).toEqual(was);
    }
  });

  it('push a body out of a face to just touching it, and knock it back at a third, its speed along the face kept', () => {
    const s = blocks();
    const [c, si] = [Math.cos(TOWER.yaw), Math.sin(TOWER.yaw)];
    // flying straight at the face at 9 along the tower's axis, and sliding along it at 4
    const b = near(3 + RADIUS - 1, 0, 10, -9 * c - 4 * si, -9 * si + 4 * c, 0);
    expect(s.collide(b)).toBe(true);
    expect(fromBlock(b)).toBeCloseTo(RADIUS, 9);
    expect(b.vx * c + b.vy * si).toBeCloseTo(9 * SOLID.bounce, 9);
    expect(-b.vx * si + b.vy * c).toBeCloseTo(4, 9);
  });

  it('push a body off a corner along the way from the corner to it', () => {
    const s = blocks();
    const b = near(3 + 2, 3 + 2, 10);
    s.collide(b);
    expect(fromBlock(b)).toBeCloseTo(RADIUS, 9);
    const [c, si] = [Math.cos(TOWER.yaw), Math.sin(TOWER.yaw)];
    expect(b.x * c + b.y * si).toBeCloseTo(-b.x * si + b.y * c, 9);
  });

  it('push a body whose middle is inside a block out through the face it is nearest', () => {
    const s = blocks();
    const b = near(0, 2.5, 10);
    s.collide(b);
    expect(fromBlock(b)).toBeCloseTo(RADIUS, 9);
    const [c, si] = [Math.cos(TOWER.yaw), Math.sin(TOWER.yaw)];
    expect(-b.x * si + b.y * c).toBeCloseTo(3 + RADIUS, 9);
  });

  it('never leave a body inside a block, wherever about it it is and however it is going', () => {
    const s = blocks();
    const random = randomFor(5);
    for (let n = 0; n < 5000; n++) {
      const b = near(
        (random() - 0.5) * 2 * (3 + RADIUS),
        (random() - 0.5) * 2 * (3 + RADIUS),
        -RADIUS + random() * (35 + 2 * RADIUS),
        (random() - 0.5) * 60,
        (random() - 0.5) * 60,
        (random() - 0.5) * 30,
      );
      s.collide(b);
      expect(fromBlock(b)).toBeGreaterThanOrEqual(RADIUS - 1e-9);
    }
  });

  it('keep the blocks when a level sets its rings, and say which a body is inside by name', () => {
    const s = blocks();
    // a ring well clear of the tower
    s.set([{ ...RING_AT, x: 60 }]);
    expect(s.count).toBe(1);
    expect(s.collide(near(0, 3 + RADIUS - 1, 10))).toBe(true);
    const deep = near(0, 2, 10);
    expect(s.inside(deep)).toMatchObject({ what: 'the tower' });
    expect(s.inside(deep).depth).toBeGreaterThan(RADIUS);
    expect(s.inside(body(60, 0, 100 + LINE))).toMatchObject({ what: 'ring 1 of 1' });
    expect(s.inside(near(40, 0, 10))).toEqual({ depth: 0, what: '' });
  });

  it('say how far a point is from the nearest block: off a face, off a corner, and less than nothing inside', () => {
    const s = blocks();
    const point = (along: number, across: number, up: number) => {
      const [c, sn] = [Math.cos(TOWER.yaw), Math.sin(TOWER.yaw)];
      return [along * c - across * sn, along * sn + across * c, TOWER.z + up] as const;
    };
    expect(s.distanceAt(...point(3 + 2, 0, 10))).toBeCloseTo(2, 9);
    expect(s.distanceAt(...point(0, 0, 35 + 1.5))).toBeCloseTo(1.5, 9);
    expect(s.distanceAt(...point(3 + 3, 3 + 4, 10))).toBeCloseTo(5, 9);
    expect(s.distanceAt(...point(2, 0, 10))).toBeCloseTo(-1, 9);
    expect(new Solids({ middle: MIDDLE, radius: RADIUS }).distanceAt(0, 0, 0)).toBe(Infinity);
  });
});

describe('the rings the solids hold', () => {
  it('are told back, in order, as the ones set, so what is solid can be asked and gone round', () => {
    const s = new Solids({ middle: MIDDLE, radius: RADIUS });
    expect(s.rings).toEqual([]);
    const second: Ring = { ...RING_AT, x: 40 };
    s.set([RING_AT, second]);
    expect(s.rings).toEqual([RING_AT, second]);
    expect(s.rings[0]).toBe(RING_AT);
    s.set([second]);
    expect(s.rings).toEqual([second]);
    expect(s.count).toBe(1);
  });
});
