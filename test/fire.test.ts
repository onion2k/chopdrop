/**
 * A fire's patches, each unburnt, burning or out: where it starts, how it spreads while its level is going and not
 * before, what a drop puts out, and how it is lit again once it has been left. Held on a small fire laid out here, so
 * each edge is on a number, and on the three the island has.
 */
import { describe, expect, it } from 'vitest';
import { FIRES, type FirePlace } from '../src/arena';
import { FIRE, Fire, PATCH, SPREAD, treesOnPatches } from '../src/fire';
import { TREE_STRIDE } from '../src/island';
import { theIsland } from '../src/arena';
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
  it('says its numbers once: a patch catches every 15 s from one 9 m off, a fire left is lit again after 3 s, and a bucket out begins its level within 60 m', () => {
    expect(SPREAD).toEqual({ every: 15, reach: 9 });
    expect(FIRE).toEqual({ relight: 3, near: 60 });
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
    it('catches one more patch every 15 s: none at 14.9, one at 15.1, two at 30.2', () => {
      const fire = laid([0, 8, 16, 24, 32], 1);
      run(fire, 14.9, true);
      expect(fire.burning).toBe(1);
      run(fire, 0.2, true);
      expect(fire.burning).toBe(2);
      run(fire, 14.7, true);
      expect(fire.burning).toBe(2);
      run(fire, 0.4, true);
      expect(fire.burning).toBe(3);
    });

    it('catches the first unburnt patch in the list that is within 9 m of one burning, which is not the nearest', () => {
      // C is first in the list after the lit two, too far to catch; D then E are both 8 off B, and D comes first
      const fire = laid([0, 8, 0, 16, 8], 2, [0, 0, 40, 0, 8]);
      run(fire, 15.1, true);
      expect(states(fire)).toEqual([1, 1, 0, 1, 0]);
      run(fire, 15, true);
      expect(states(fire)).toEqual([1, 1, 0, 1, 1]);
    });

    it('reaches 9 m and not 9.1', () => {
      const near = laid([0, 9], 1);
      run(near, 15.1, true);
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
      run(fire, 31, true);
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

    it('starts its clock from the level, not from the fire: a fire going later waits its 15 s from then', () => {
      const fire = laid([0, 8, 16], 1);
      run(fire, 30, false);
      run(fire, 14.9, true);
      expect(fire.burning).toBe(1);
      run(fire, 0.2, true);
      expect(fire.burning).toBe(2);
    });

    it('starts the clock again if the level is left and begun again', () => {
      const fire = laid([0, 8, 16], 1);
      run(fire, 14, true);
      run(fire, 0.1, false);
      run(fire, 14, true);
      expect(fire.burning).toBe(1);
    });
  });

  describe('a drop', () => {
    it('puts out every burning patch within the splash and says how many: 15.9 in, 16.1 out', () => {
      const b = laid([0], 1);
      expect(b.douse(15.9, 0)).toBe(1);
      expect(b.burning).toBe(0);
      const c = laid([0], 1);
      expect(c.douse(16.1, 0)).toBe(0);
      expect(c.burning).toBe(1);
      expect(DROP.splash).toBe(16);
    });

    it('puts out all the burning patches in reach and no others', () => {
      const fire = laid([0, 8, 16, 24, 40], 5);
      // from x = 8: 0, 8, 16 and 24 are within 16 (24 at exactly 16); 40 is at 32
      expect(fire.douse(8, 0)).toBe(4);
      expect(states(fire)).toEqual([2, 2, 2, 2, 1]);
      expect(fire.burning).toBe(1);
    });

    it('leaves unburnt patches unburnt, and out ones as they are', () => {
      const fire = laid([0, 8, 16], 1);
      expect(fire.douse(8, 0)).toBe(1);
      expect(states(fire)).toEqual([PATCH.out, PATCH.unburnt, PATCH.unburnt]);
      expect(fire.douse(0, 0)).toBe(0);
      expect(states(fire)).toEqual([PATCH.out, PATCH.unburnt, PATCH.unburnt]);
    });

    it('finds the middle of the patches that burn, their mean, and none when none burns', () => {
      const fire = laid([0, 8, 16, 60], 4, [0, 0, 6, 12]);
      const out = { x: 0, y: 0, z: 9 };
      expect(fire.burningMiddle(out)).toBe(true);
      expect([out.x, out.y]).toEqual([21, 4.5]);
      // a patch that is out, or not alight, is no part of it
      fire.douse(60, 12);
      expect(fire.burningMiddle(out)).toBe(true);
      expect([out.x, out.y]).toEqual([8, 2]);
      const some = laid([0, 8, 16], 3);
      some.douse(8, 0);
      expect(some.burning).toBe(0);
      out.x = 99;
      expect(some.burningMiddle(out)).toBe(false);
      expect(out.x, 'untouched when none burns').toBe(99);
    });

    it('takes the height of the middle as the mean of the heights of the patches, written in place', () => {
      const place: FirePlace = {
        id: 'sloped',
        name: 'Sloped',
        x: 0,
        y: 0,
        patches: [
          { x: 0, y: 0, z: 10 },
          { x: 8, y: 0, z: 20 },
        ],
        lit: 2,
        run: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, z: 0 },
      };
      const out = { x: 0, y: 0, z: 0 };
      new Fire(place).burningMiddle(out);
      expect([out.x, out.y, out.z]).toEqual([4, 0, 15]);
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
      run(fire, 15.1, true);
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
      run(fire, 15.1, true);
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
      run(fire, 14, true);
      fire.relight();
      run(fire, 14, true);
      expect(fire.burning).toBe(1);
    });
  });
});

/** Trees laid out as the island keeps them: `stride` floats a tree, its place across and down at 1 and 2. */
function planted(places: readonly [number, number][]): { trees: Float32Array; stride: number; count: number } {
  const trees = new Float32Array(places.length * TREE_STRIDE);
  places.forEach(([x, y], k) => {
    trees[k * TREE_STRIDE + 1] = x;
    trees[k * TREE_STRIDE + 2] = y;
  });
  return { trees, stride: TREE_STRIDE, count: places.length };
}

/** The trees on patch `p` of the lists, as indices. */
const on = (found: ReturnType<typeof treesOnPatches>, p: number) =>
  Array.from(found.tree.subarray(found.first[p], found.first[p + 1]));

describe('the trees on a patch', () => {
  const place = (xs: number[]): FirePlace => ({
    id: 'test-fire',
    name: 'Test fire',
    x: 0,
    y: 0,
    patches: xs.map((x) => ({ x, y: 0, z: 0 })),
    lit: 1,
    run: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, z: 0 },
  });

  it('says the square once: a patch’s half is four metres, so patches eight apart tile the ground', () => {
    expect(PATCH.half).toBe(4);
    expect(PATCH.half * 2).toBe(8);
  });

  it('finds the trees whose foot is within the square, four metres each way of the patch’s middle, and no others', () => {
    const found = treesOnPatches(
      [place([0])],
      planted([
        [0, 0],
        [3.9, -3.9],
        [-3.9, 3.9],
        [4.1, 0],
        [0, -4.1],
        [-5, -5],
        [30, 30],
      ]),
    );
    expect(on(found, 0).sort()).toEqual([0, 1, 2]);
  });

  it('puts a tree on a line between two patches on one of them only, and no tree on two', () => {
    // patches 8 apart: a tree at x = 4 is within four metres of both
    const found = treesOnPatches(
      [place([0, 8])],
      planted([
        [4, 0],
        [4, 2],
        [12, 0],
      ]),
    );
    const all = [...on(found, 0), ...on(found, 1)];
    expect(all.sort()).toEqual([0, 1, 2]);
    expect(found.tree).toHaveLength(3);
  });

  it('keeps the trees patch by patch, across fires, as the fires and their patches are in order', () => {
    const fires = [place([0, 8]), place([100])];
    const found = treesOnPatches(
      fires,
      planted([
        [100, 1],
        [0, 1],
        [8, -1],
        [100, -1],
      ]),
    );
    expect(found.first).toHaveLength(4);
    expect(Array.from(found.first)).toEqual([0, 1, 2, 4]);
    expect(on(found, 0)).toEqual([1]);
    expect(on(found, 1)).toEqual([2]);
    expect(on(found, 2).sort()).toEqual([0, 3]);
  });

  it('finds none where there is no fire, and none where no tree stands', () => {
    expect(treesOnPatches([], planted([[0, 0]])).tree).toHaveLength(0);
    expect(treesOnPatches([place([0])], planted([])).tree).toHaveLength(0);
    expect(Array.from(treesOnPatches([], planted([])).first)).toEqual([0]);
  });

  it('finds, on the island, every tree that stands in a patch’s square, worked out here by looking at them all', () => {
    const { trees, treeCount } = theIsland();
    const found = treesOnPatches(FIRES, { trees, stride: TREE_STRIDE, count: treeCount });
    const patches = FIRES.flatMap((f) => f.patches);
    expect(found.first).toHaveLength(patches.length + 1);
    const expected = new Map<number, number>();
    for (let t = 0; t < treeCount; t++) {
      const [x, y] = [trees[t * TREE_STRIDE + 1], trees[t * TREE_STRIDE + 2]];
      const p = patches.findIndex((q) => Math.abs(x - q.x) <= PATCH.half && Math.abs(y - q.y) <= PATCH.half);
      if (p >= 0) expected.set(t, p);
    }
    // a wood is round every fire, so there are trees to burn, and none is on two patches
    expect(expected.size).toBeGreaterThan(60);
    expect(found.tree).toHaveLength(expected.size);
    expect(new Set(found.tree).size).toBe(found.tree.length);
    for (const [t, p] of expected) expect(on(found, p), `tree ${t}`).toContain(t);
    // the island's fires are each in a wood: every fire has some
    FIRES.forEach((f, k) => {
      const [from, to] = [k * 20, k * 20 + f.patches.length];
      expect(found.first[to] - found.first[from], f.id).toBeGreaterThan(5);
    });
  });
});
