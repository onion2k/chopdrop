/**
 * A fire's patches, each unburnt, burning or out: where it starts, how it spreads while its level is going and not
 * before, what a drop puts out, and how it is lit again once it has been left. Held on a small fire laid out here, so
 * each edge is on a number, and on the three the island has.
 */
import { describe, expect, it } from 'vitest';
import { FIRES, type FirePlace } from '../src/arena';
import { FIRE, Fire, PATCH, SPREAD } from '../src/fire';
import { DROP } from '../src/water';
import { DT } from './helpers';

/** A fire laid along x: patches at the given x, y = 0, the first `lit` burning. */
function laid(xs: readonly number[], lit: number, ys: readonly number[] = []): Fire {
  const place: FirePlace = {
    id: 'test-fire',
    name: 'Test fire',
    x: 0,
    y: 0,
    patches: xs.map((x, k) => ({ x, y: ys[k] ?? 0, z: 0 })),
    lit,
    run: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, z: 0 },
  };
  return new Fire(place);
}

/** The fire stepped `seconds` of game, going or not. */
function run(fire: Fire, seconds: number, going: boolean) {
  for (let f = 0, n = Math.round(seconds / DT); f < n; f++) fire.step(DT, going);
}
const states = (fire: Fire) => [...fire.states];

describe('a fire', () => {
  it('says its numbers once: a patch catches every 8 s from one 9 m off, and a fire left is lit again after 3 s', () => {
    expect(SPREAD).toEqual({ every: 8, reach: 9 });
    expect(FIRE).toEqual({ relight: 3 });
  });

  it('starts with the first `lit` patches burning and the rest unburnt', () => {
    const fire = laid([0, 8, 16, 24], 2);
    expect(states(fire)).toEqual([PATCH.burning, PATCH.burning, PATCH.unburnt, PATCH.unburnt]);
    expect(fire.burning).toBe(2);
  });

  it('starts the three the island has with their six lit, and nothing out', () => {
    for (const place of FIRES) {
      const fire = new Fire(place);
      expect(fire.burning, place.id).toBe(place.lit);
      expect(fire.states.filter((s) => s === PATCH.out).length).toBe(0);
      expect(fire.states.length).toBe(place.patches.length);
    }
  });

  it('holds its states in a typed array made once, whatever happens to it', () => {
    const fire = laid([0, 8, 16], 1);
    const array = fire.states;
    run(fire, 7, true);
    fire.douse(0, 0);
    run(fire, 4, false);
    fire.relight();
    expect(fire.states).toBe(array);
    expect(array).toBeInstanceOf(Uint8Array);
  });

  describe('spreading', () => {
    it('catches one more patch every 8 s: none at 7.9, one at 8.1, two at 16.1', () => {
      const fire = laid([0, 8, 16, 24, 32], 1);
      run(fire, 7.9, true);
      expect(fire.burning).toBe(1);
      run(fire, 0.2, true);
      expect(fire.burning).toBe(2);
      run(fire, 7.9, true);
      expect(fire.burning).toBe(2);
      run(fire, 0.2, true);
      expect(fire.burning).toBe(3);
    });

    it('catches the first unburnt patch in the list that is within 9 m of one burning, which is not the nearest', () => {
      // C is first in the list after the lit two, too far to catch; D then E are both 8 off B, and D comes first
      const fire = laid([0, 8, 0, 16, 8], 2, [0, 0, 40, 0, 8]);
      run(fire, 8.1, true);
      expect(states(fire)).toEqual([1, 1, 0, 1, 0]);
      run(fire, 8, true);
      expect(states(fire)).toEqual([1, 1, 0, 1, 1]);
    });

    it('reaches 9 m and not 9.1', () => {
      const near = laid([0, 9], 1);
      run(near, 8.1, true);
      expect(near.burning).toBe(2);
      const far = laid([0, 9.1], 1);
      run(far, 30, true);
      expect(far.burning).toBe(1);
    });

    it('never goes past its own patches: with all burning, it stays so, and a patch too far from any never catches', () => {
      const fire = laid([0, 8, 16, 100], 1);
      run(fire, 60, true);
      expect(states(fire)).toEqual([1, 1, 1, 0]);
      const all = laid([0, 8], 2);
      run(all, 30, true);
      expect(all.burning).toBe(2);
    });

    it('never lights a patch that is out again, though one burns beside it', () => {
      const fire = laid([0, 8, 40], 2);
      // A is out and B is burning, a patch beside it
      expect(fire.douse(-11, 0)).toBe(1);
      expect(states(fire)).toEqual([PATCH.out, PATCH.burning, PATCH.unburnt]);
      run(fire, 16.5, true);
      expect(states(fire)).toEqual([PATCH.out, PATCH.burning, PATCH.unburnt]);
    });

    it('does not spread while its level is not going, however long, before or after a drop', () => {
      const fire = laid([0, 8, 16, 24], 1);
      run(fire, 2.9, false);
      expect(fire.burning).toBe(1);
      // a fire left alone and not going stays as it is, though it is never lit again either
      run(fire, 60, false);
      expect(fire.burning).toBe(1);
    });

    it('starts its clock from the level, not from the fire: a fire going later waits its 8 s from then', () => {
      const fire = laid([0, 8, 16], 1);
      run(fire, 30, false);
      run(fire, 7.9, true);
      expect(fire.burning).toBe(1);
      run(fire, 0.2, true);
      expect(fire.burning).toBe(2);
    });

    it('starts the clock again if the level is left and begun again', () => {
      const fire = laid([0, 8, 16], 1);
      run(fire, 7, true);
      run(fire, 0.1, false);
      run(fire, 7, true);
      expect(fire.burning).toBe(1);
    });
  });

  describe('a drop', () => {
    it('puts out every burning patch within the splash and says how many: 11.9 in, 12.1 out', () => {
      const b = laid([0], 1);
      expect(b.douse(11.9, 0)).toBe(1);
      expect(b.burning).toBe(0);
      const c = laid([0], 1);
      expect(c.douse(12.1, 0)).toBe(0);
      expect(c.burning).toBe(1);
      expect(DROP.splash).toBe(12);
    });

    it('puts out all the burning patches in reach and no others', () => {
      const fire = laid([0, 8, 16, 24, 40], 5);
      // from x = 8: 0, 8, 16 are within 12; 24 is at 16 and 40 at 32
      expect(fire.douse(8, 0)).toBe(3);
      expect(states(fire)).toEqual([2, 2, 2, 1, 1]);
      expect(fire.burning).toBe(2);
    });

    it('leaves unburnt patches unburnt, and out ones as they are', () => {
      const fire = laid([0, 8, 16], 1);
      expect(fire.douse(8, 0)).toBe(1);
      expect(states(fire)).toEqual([PATCH.out, PATCH.unburnt, PATCH.unburnt]);
      expect(fire.douse(0, 0)).toBe(0);
      expect(states(fire)).toEqual([PATCH.out, PATCH.unburnt, PATCH.unburnt]);
    });

    it('finds the burning patch a drop on would put out the most, the first in the list of two as good, and none when none burns', () => {
      // 0, 8 and 16 are all within 12 of 8, so a drop on 8 puts out three, and on 0 or 16 two
      const fire = laid([0, 8, 16, 60], 4);
      const out = { x: 0, y: 0, z: 9 };
      expect(fire.bestDrop(out)).toBe(true);
      expect([out.x, out.y]).toEqual([8, 0]);
      // 8 and 0 are as good as each other, with the rest out of the way: the first in the list
      const pair = laid([8, 0, 60], 2);
      expect(pair.bestDrop(out)).toBe(true);
      expect([out.x, out.y]).toEqual([8, 0]);
      // a patch that is out counts for nothing, and a fire with none burning has none to drop on
      const some = laid([0, 8, 16], 3);
      some.douse(8, 0);
      expect(some.burning).toBe(0);
      expect(some.bestDrop(out)).toBe(false);
    });

    it('finds the nearest burning patch, and says none when none burns', () => {
      const fire = laid([0, 8, 30], 3);
      const out = { x: 0, y: 0, z: 9 };
      expect(fire.nearestBurning(26, 3, out)).toBe(true);
      expect([out.x, out.y]).toEqual([30, 0]);
      fire.douse(30, 0);
      expect(fire.nearestBurning(26, 3, out)).toBe(true);
      expect([out.x, out.y]).toEqual([8, 0]);
      fire.douse(0, 0);
      expect(fire.nearestBurning(26, 3, out)).toBe(false);
    });
  });

  describe('lit again', () => {
    it('goes back to its start 3 s after its last change, when it is not going: not at 2.9, at 3.1', () => {
      const fire = laid([0, 8, 40], 2);
      fire.douse(-11, 0);
      run(fire, 2.9, false);
      expect(states(fire)).toEqual([PATCH.out, PATCH.burning, PATCH.unburnt]);
      run(fire, 0.2, false);
      expect(states(fire)).toEqual([PATCH.burning, PATCH.burning, PATCH.unburnt]);
      expect(fire.burning).toBe(2);
      expect(fire.atStart).toBe(true);
    });

    it('counts from the last change, so a second drop puts the wait back', () => {
      const fire = laid([0, 8, 40], 2);
      fire.douse(-11, 0);
      run(fire, 2, false);
      fire.douse(8, 0);
      run(fire, 2, false);
      expect(fire.burning).toBe(0);
      run(fire, 1.2, false);
      expect(fire.burning).toBe(2);
    });

    it('is not lit again while its level is going, however long it is left', () => {
      const fire = laid([0, 8], 2);
      fire.douse(-11, 0);
      run(fire, 2.5, true);
      expect(fire.burning).toBe(1);
      expect(fire.states[0]).toBe(PATCH.out);
    });

    it('waits from the level being left, not from the last change: a fire quiet for longer while going is not lit again at once', () => {
      const fire = laid([0, 8, 16], 1);
      run(fire, 8.1, true);
      run(fire, 7, true);
      expect(fire.quiet).toBe(0);
      expect(fire.burning).toBe(2);
      run(fire, FIRE.relight - 0.1, false);
      expect(fire.burning).toBe(2);
      run(fire, 0.2, false);
      expect(states(fire)).toEqual([1, 0, 0]);
    });

    it('puts back what spread, as well as what was put out, once its level is left', () => {
      const fire = laid([0, 8, 16], 1);
      run(fire, 8.1, true);
      expect(fire.burning).toBe(2);
      run(fire, 2.9, false);
      expect(fire.burning).toBe(2);
      run(fire, 0.2, false);
      expect(states(fire)).toEqual([1, 0, 0]);
    });

    it('is lit again by `relight` at once, and does nothing to a fire that is at its start', () => {
      const fire = laid([0, 8], 1);
      fire.douse(0, 0);
      fire.relight();
      expect(states(fire)).toEqual([1, 0]);
      expect(fire.burning).toBe(1);
      expect(fire.atStart).toBe(true);
      fire.relight();
      expect(states(fire)).toEqual([1, 0]);
    });

    it('starts a relit fire spreading from its beginning, with the clock and the wait put back', () => {
      const fire = laid([0, 8, 16], 1);
      run(fire, 7, true);
      fire.relight();
      run(fire, 7, true);
      expect(fire.burning).toBe(1);
    });
  });
});
