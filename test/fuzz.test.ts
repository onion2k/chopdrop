/** The monkey itself: it gets about, and a clean seed is clean. `npm run fuzz` is the long form. */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';

describe('the fuzzer', () => {
  it('plays a seed through without breaking a rule, and does everything a player can', () => {
    const r = fuzz(1, 4000);
    expect(r.failure, JSON.stringify(r.failure)).toBe(null);
    for (const action of [
      'fly',
      'hover',
      'climb',
      'land',
      'teleport',
      'take off',
      'edge run',
      'hill run',
      'pad landing',
      'forest run',
    ])
      expect(r.done[action], action).toBeGreaterThan(0);
    for (const happening of [
      'took off',
      'landed',
      'met rising land',
      'reached the ceiling',
      'touched the edge',
      'trees swayed',
      'trees settled',
    ])
      expect(r.happened[happening], happening).toBeGreaterThan(0);
  });

  it('plays the same way twice from a seed', () => {
    expect(fuzz(2, 600)).toEqual(fuzz(2, 600));
  });
});
