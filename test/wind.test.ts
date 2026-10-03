/**
 * The island's wind, headless: one wind for everything, brisk, gusting over seconds and turning once round in six
 * minutes, a pure function of the game's time so that the same time blows the same wind on every run, and written into a
 * record made once so that asking for it makes nothing.
 */
import { describe, expect, it } from 'vitest';
import { WIND, windAt, windSpeed, windYaw, type Wind } from '../src/wind';

const at = (t: number): Wind => windAt(t, { x: 0, y: 0 });

describe('the wind', () => {
  it('says its numbers once: 6 m/s, gusting 35% over 7 s and 15% over 2.3 s, turning once round in 6 minutes', () => {
    expect(WIND.speed).toBe(6);
    expect(WIND.gusts.map((g) => [g.share, g.period])).toEqual([
      [0.35, 7],
      [0.15, 2.3],
    ]);
    expect(WIND.turn).toBe(360);
  });

  it('blows at 6 m/s as the game begins, in the direction it begins in', () => {
    const w = at(0);
    expect(Math.hypot(w.x, w.y)).toBeCloseTo(6, 9);
    expect(Math.atan2(w.y, w.x)).toBeCloseTo(WIND.yaw, 9);
  });

  it('keeps its speed within the gusts and reaches nearly the whole of them: 3 to 9 m/s', () => {
    let low = Infinity,
      high = -Infinity;
    for (let t = 0; t < 1800; t += 0.05) {
      const s = windSpeed(t);
      low = Math.min(low, s);
      high = Math.max(high, s);
    }
    expect(low).toBeGreaterThanOrEqual(WIND.speed * (1 - 0.5) - 1e-9);
    expect(high).toBeLessThanOrEqual(WIND.speed * (1 + 0.5) + 1e-9);
    expect(low).toBeLessThan(3.3);
    expect(high).toBeGreaterThan(8.7);
  });

  it('gusts over its two periods: the same again after 161 s, which is whole periods of both, and not after a half of the slow one', () => {
    // 161 s is 23 periods of the slow gust and 70 of the quick, so both are over again
    expect(windSpeed(5 + 161)).toBeCloseTo(windSpeed(5), 9);
    expect(windSpeed(5 + 3.5)).not.toBeCloseTo(windSpeed(5), 1);
  });

  it('turns once round in six minutes: the same way again at 360 s, the opposite at 180, a quarter at 90', () => {
    const yaw = (t: number) => windYaw(t);
    expect(yaw(360) - yaw(0)).toBeCloseTo(2 * Math.PI, 9);
    expect(yaw(180) - yaw(0)).toBeCloseTo(Math.PI, 9);
    expect(yaw(90) - yaw(0)).toBeCloseTo(Math.PI / 2, 9);
    // and the vector blows that way, whatever the gust is doing
    for (const t of [0, 13, 90, 180.5, 271, 359]) {
      const w = at(t);
      const turned = Math.atan2(w.y, w.x) - windYaw(t);
      expect(Math.cos(turned)).toBeCloseTo(1, 9);
    }
  });

  it('is the same for the same time, whatever times were asked before', () => {
    const a = at(123.456);
    at(7);
    at(9999);
    const b = at(123.456);
    expect(b).toEqual(a);
    expect(windAt(123.456, { x: 5, y: 5 })).toEqual(a);
  });

  it('is written into the record handed in, and that is the record returned, so that nothing is made', () => {
    const out: Wind = { x: 0, y: 0 };
    expect(windAt(10, out)).toBe(out);
    expect(out.x).not.toBe(0);
  });

  it('is calm of no time and of no number: a time that is not a number blows as time nought', () => {
    expect(at(NaN)).toEqual(at(0));
    expect(at(-Infinity)).toEqual(at(0));
  });
});
