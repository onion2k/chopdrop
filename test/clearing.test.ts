/**
 * Ground kept clear of trees, under what stands on the island: the trees whose foot is in a clearing are taken away
 * once every tree is placed, so every other tree is the very tree it was without the clearing, in the same order,
 * and nothing else about the island moves. Without that, a bridge across a wood would have trees through its deck,
 * and clearing one would move every tree on the island.
 */
import { describe, expect, it } from 'vitest';
import { ISLAND } from '../src/arena';
import { TREE_STRIDE, buildIsland, type Clearing } from '../src/island';
import { seeded } from '../src/random';

const build = (clear: readonly Clearing[]) =>
  buildIsland({ ...ISLAND, trees: { ...ISLAND.trees, clear } }, seeded(ISLAND.seed));
const feet = (island: ReturnType<typeof build>) =>
  Array.from({ length: island.treeCount }, (_, t) =>
    Array.from(island.trees.subarray(t * TREE_STRIDE, (t + 1) * TREE_STRIDE)),
  );
/** Whether (x, y) is in the clearing `c`, a rectangle turned by its yaw. */
const within = (c: Clearing, x: number, y: number) => {
  const along = (x - c.x) * Math.cos(c.yaw) + (y - c.y) * Math.sin(c.yaw);
  const across = -(x - c.x) * Math.sin(c.yaw) + (y - c.y) * Math.cos(c.yaw);
  return Math.abs(along) <= c.length / 2 && Math.abs(across) <= c.width / 2;
};

describe('a clearing', () => {
  // a wood south-east of home, and a strip across it turned 0.7
  const square: Clearing = { x: 116, y: -280, yaw: 0, length: 40, width: 30 };
  const turned: Clearing = { x: 60, y: -150, yaw: 0.7, length: 60, width: 12 };
  const none = build([]);
  const cleared = build([square, turned]);

  it('has no tree whose foot is in it, square or turned', () => {
    const inside = feet(cleared).filter(([, x, y]) => within(square, x, y) || within(turned, x, y));
    expect(inside).toEqual([]);
    // and there were trees there to clear
    const were = feet(none).filter(([, x, y]) => within(square, x, y) || within(turned, x, y));
    expect(were.length).toBeGreaterThan(20);
  });

  it('keeps every other tree as it was, in the order it was, and takes no more than it must', () => {
    const outside = feet(none).filter(([, x, y]) => !within(square, x, y) && !within(turned, x, y));
    expect(feet(cleared)).toEqual(outside);
  });

  it('leaves the land, the water and the pads as they were', () => {
    expect(Array.from(cleared.ground.heights)).toEqual(Array.from(none.ground.heights));
    expect(cleared.pads).toEqual(none.pads);
  });
});
