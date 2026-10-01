/**
 * The wash under the rotor, on its own: which way it blows at a point and how hard, from a helicopter put by hand.
 * The trees take it as it is worked out here, so a wash blowing inward, or felt from the ceiling, is caught here
 * before any tree is looked at.
 */
import { describe, expect, it } from 'vitest';
import { DOWNWASH, washAt, washStrength, type Wash, type WashSource } from '../src/downwash';
import { HELICOPTER } from '../src/helicopter';

const { reach, column, full, depth, floor } = DOWNWASH;
const { mastTop } = HELICOPTER.size;

/** A helicopter with its middle over the origin, its hub `hub` above ground at height 0, its rotor at `rotorSpeed`. */
const over = (hub: number, rotorSpeed: number = HELICOPTER.rotorFull): WashSource => ({
  x: 0,
  y: 0,
  z: hub - mastTop,
  rotorSpeed,
});

const at = (source: WashSource, x: number, y: number, z = 0): Wash => washAt(source, x, y, z, { x: 0, y: 0, down: 0 });
const across = (w: Wash) => Math.hypot(w.x, w.y);

describe('the downwash', () => {
  it('is nothing from a rotor idling on the ground, and all there is from one at full speed', () => {
    expect(washStrength(HELICOPTER.rotorIdle)).toBe(0);
    expect(washStrength(HELICOPTER.rotorFull)).toBe(1);
    expect(at(over(mastTop, HELICOPTER.rotorIdle), 8, 0)).toEqual({ x: 0, y: 0, down: 0 });
  });

  it('grows with the rotor, from where it is first felt', () => {
    let last = 0;
    for (let speed = HELICOPTER.rotorIdle; speed <= HELICOPTER.rotorFull; speed += 2) {
      const s = washStrength(speed);
      expect(s).toBeGreaterThanOrEqual(last);
      if (s > 0) expect(s).toBeGreaterThanOrEqual(floor);
      last = s;
    }
    expect(across(at(over(6, 20), 8, 0))).toBeLessThan(across(at(over(6, 32), 8, 0)));
  });

  it('blows outward from under the hub, across the ground, whichever way the point is', () => {
    const source = over(6);
    for (const [x, y] of [
      [10, 0],
      [0, 10],
      [-7, -7],
      [3, -12],
      [-15, 4],
    ]) {
      const w = at(source, x, y);
      const d = Math.hypot(x, y);
      expect(across(w), `${x},${y}`).toBeGreaterThan(0);
      // the push points the way the point lies from under the hub, and no other
      expect((w.x * x + w.y * y) / (d * across(w)), `${x},${y}`).toBeCloseTo(1, 6);
    }
  });

  it('blows down and not aside straight under the hub, and more out than down beyond the disc', () => {
    const under = at(over(6), 0, 0);
    expect(under.x).toBe(0);
    expect(under.y).toBe(0);
    expect(under.down).toBeGreaterThan(0.9);
    const beyond = at(over(6), 2 * column, 0);
    expect(across(beyond)).toBeGreaterThan(beyond.down);
  });

  it('is strongest just past the disc, and fades to nothing at its reach', () => {
    const source = over(6);
    const push = (d: number) => across(at(source, d, 0));
    expect(push(column)).toBeGreaterThan(push(column / 2));
    expect(push(column)).toBeGreaterThan(push(2 * column));
    expect(push(2 * column)).toBeGreaterThan(push(reach - 2));
    expect(push(reach - 2)).toBeGreaterThan(0);
    expect(at(source, reach, 0)).toEqual({ x: 0, y: 0, down: 0 });
    expect(at(source, 0, reach + 5)).toEqual({ x: 0, y: 0, down: 0 });
  });

  it('is felt fully with the hub low, weaker higher up, and not at all past its depth', () => {
    const push = (hub: number) => across(at(over(hub), 2 * column, 0));
    expect(push(full)).toBeCloseTo(push(mastTop), 9);
    expect(push(full + 5)).toBeLessThan(push(full));
    expect(push(depth - 2)).toBeLessThan(push(full + 5));
    expect(push(depth - 2)).toBeGreaterThan(0);
    expect(push(depth)).toBe(0);
    expect(at(over(HELICOPTER.ceiling), 0, 0)).toEqual({ x: 0, y: 0, down: 0 });
  });

  it('measures the height from the ground at the point, so a point up a slope is nearer the hub', () => {
    const source = over(depth - 1);
    expect(across(at(source, 2 * column, 0, 0))).toBeLessThan(across(at(source, 2 * column, 0, 10)));
  });

  it('writes into the wash it is handed and makes none', () => {
    const out: Wash = { x: 5, y: 5, down: 5 };
    expect(washAt(over(6), 8, 0, 0, out)).toBe(out);
  });
});
