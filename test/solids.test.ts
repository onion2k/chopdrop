/**
 * The solids, on their own: a ring's tube as a torus the helicopter cannot enter. A body touching one is pushed out
 * to just touching, and the speed it had into the tube turned back at a third, so it is knocked back and carries on;
 * a body clear of every tube, in an opening or beside it, is left alone; and none is ever left inside, from any side.
 */
import { describe, expect, it } from 'vitest';
import { HELICOPTER } from '../src/helicopter';
import { RING, RINGS, type Ring } from '../src/mission';
import { seeded as randomFor } from '../src/random';
import { SOLID, Solids, type Body } from '../src/solids';

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
