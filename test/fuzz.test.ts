/** The monkey itself: it gets about, and a clean seed is clean. `npm run fuzz` is the long form. */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';

describe('the fuzzer', () => {
  it('plays a seed through without breaking a rule, and does everything a player can', () => {
    const r = fuzz(1, 1500);
    expect(r.failure, JSON.stringify(r.failure)).toBe(null);
    expect(r.happened.banked, 'the monkey banks something').toBeGreaterThan(0);
    for (const action of ['drive', 'stop', 'teleport', 'aim', 'reload'])
      expect(r.done[action], action).toBeGreaterThan(0);
  });

  it('plays the same way twice from a seed', () => {
    expect(fuzz(2, 600)).toEqual(fuzz(2, 600));
  });
});
