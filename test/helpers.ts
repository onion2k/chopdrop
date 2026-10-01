/**
 * What the tests share: a new game in memory, from a seed; grounds for a helicopter to be flown over without the
 * island; and a sway over the island's trees, with the thickest wood on it to try it in.
 */
import { TREE_GIVE, TREE_KINDS, theIsland } from '../src/arena';
import { DOWNWASH } from '../src/downwash';
import { Game } from '../src/game';
import type { Ground } from '../src/helicopter';
import { TREE_STRIDE } from '../src/island';
import { seeded } from '../src/random';
import { Sway } from '../src/sway';

export const DT = 1 / 60;

export function newGame(seed = 1) {
  return { game: new Game({ random: seeded(seed) }) };
}

/** Ground that is level at `height` over a square 200 across, big enough to fly about on and still meet its edge. */
export function flatGround(height = 0): Ground {
  return landscape(() => height);
}

/** Ground of any shape, given by its height at a point, over the same square as `flatGround`. */
export function landscape(heightAt: (x: number, y: number) => number): Ground {
  return { bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 }, heightAt };
}

/** A sway over the island's own trees, as the game makes one, with room for `capacity` if told. */
export function islandSway(capacity?: number): Sway {
  const island = theIsland();
  return new Sway(
    {
      trees: island.trees,
      stride: TREE_STRIDE,
      count: island.treeCount,
      bounds: island.bounds,
      give: TREE_KINDS.map((kind) => TREE_GIVE[kind]),
    },
    capacity,
  );
}

let densest: { x: number; y: number; trees: number } | undefined;

/**
 * The thickest wood on the island: the tree with the most others within the downwash's reach of it, counted from
 * the trees themselves and not by the sway, so a sway that finds too few is caught.
 */
export function thickestWood(): { x: number; y: number; trees: number } {
  if (densest) return densest;
  const { trees, treeCount } = theIsland();
  const reach2 = DOWNWASH.reach * DOWNWASH.reach;
  let best = { x: 0, y: 0, trees: -1 };
  for (let a = 0; a < treeCount; a++) {
    const ax = trees[a * TREE_STRIDE + 1],
      ay = trees[a * TREE_STRIDE + 2];
    let n = 0;
    for (let b = 0; b < treeCount; b++) {
      const dx = trees[b * TREE_STRIDE + 1] - ax,
        dy = trees[b * TREE_STRIDE + 2] - ay;
      if (dx * dx + dy * dy < reach2) n++;
    }
    if (n > best.trees) best = { x: ax, y: ay, trees: n };
  }
  return (densest = best);
}
