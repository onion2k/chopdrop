/**
 * What the tests share: a new game in memory, from a seed; grounds for a helicopter to be flown over without the
 * island; a sway over the island's trees, with the thickest wood on it to try it in; and the trees watched, to see
 * which of them a step or a question looks at.
 */
import { TREE_GIVE, TREE_KINDS, theIsland } from '../src/arena';
import type { Canopy, CanopyKind } from '../src/canopy';
import { DOWNWASH } from '../src/downwash';
import { Game } from '../src/game';
import type { Ground } from '../src/helicopter';
import type { Level } from '../src/mission';
import { TREE_STRIDE } from '../src/island';
import { seeded } from '../src/random';
import { SWAY, Sway } from '../src/sway';

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

/** A sway over the island's own trees, as the game makes one, with room for `capacity`, read from `trees` if handed them. */
export function islandSway(capacity = SWAY.capacity, trees = theIsland().trees): Sway {
  const island = theIsland();
  return new Sway(
    {
      trees,
      stride: TREE_STRIDE,
      count: island.treeCount,
      bounds: island.bounds,
      give: TREE_KINDS.map((kind) => TREE_GIVE[kind]),
    },
    capacity,
  );
}

/**
 * The island's trees, watched: each tree whose place across is read is put in `looked`. Nothing can tell whether a
 * tree is near a point without reading where it is, so `looked` is the trees a step or a question looked at, found
 * without asking the code that looked. Which trees those are does not depend on what else the machine is doing, as a
 * time does: the sway's step, timed, read 0.138 ms a step under load, past the 0.1 it was held to and near the 0.16 that
 * walking every tree takes on a quiet machine. Each read goes through a function, so it is for counting, never timing.
 */
export function watchedTrees(): { trees: Float32Array; looked: Set<number> } {
  const looked = new Set<number>();
  const trees = new Proxy(theIsland().trees, {
    get(target, key) {
      if (typeof key === 'string') {
        const at = Number(key);
        if (at % TREE_STRIDE === 1) looked.add((at - 1) / TREE_STRIDE);
      }
      return Reflect.get(target, key) as unknown;
    },
  });
  return { trees, looked };
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

/** Each kind's height, spread and the most it leans in play, in the order of `TREE_KINDS`, as the game hands the canopy them. */
export function canopyKinds(): readonly CanopyKind[] {
  return islandCanopy().kinds;
}

/** What the camera keeps over on the island, as the game builds it. */
export function islandCanopy(): Canopy {
  return new Game({ random: seeded(1) }).canopy;
}

/** The pads of a level's steps, in order: where its parcels wait and where they are wanted. */
export function padsOf(level: Level): number[] {
  return level.steps.flatMap((step) => (step.kind === 'ring' ? [] : [step.pad]));
}
