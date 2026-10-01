import { describe, expect, it } from 'vitest';
import { FLOOR } from '../src/arena';
import { Sled } from '../src/sled';
import { DT } from './helpers';

describe('the sled', () => {
  it('speeds up along its heading, turns, and coasts to a stop', () => {
    const s = new Sled();
    s.yaw = 0;
    s.x = s.y = 0;
    for (let f = 0; f < 60; f++) s.step(DT, { throttle: 1, steer: 0 });
    expect(s.x).toBeGreaterThan(4);
    expect(Math.abs(s.y)).toBeLessThan(1e-6);
    for (let f = 0; f < 30; f++) s.step(DT, { throttle: 1, steer: 1 });
    expect(s.yaw).toBeGreaterThan(0.5);
    for (let f = 0; f < 120; f++) s.step(DT, { throttle: 0, steer: 0 });
    expect(Math.abs(s.speed)).toBeLessThan(0.1);
  });

  it('is held on the floor, stopped against the edge', () => {
    const s = new Sled();
    s.yaw = 0;
    s.x = s.y = 0;
    for (let f = 0; f < 600; f++) s.step(DT, { throttle: 1, steer: 0 });
    expect(s.x).toBeLessThan(FLOOR.maxX);
    expect(s.x).toBeGreaterThan(FLOOR.maxX - 8);
    expect(s.speed).toBe(0);
  });
});
