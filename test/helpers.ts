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
import { treeSize } from '../src/meshes';
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
      top: TREE_KINDS.map((kind) => treeSize(kind).top),
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

/**
 * Each kind's height, spread and the most it leans in play, in the order of `TREE_KINDS`, as the game hands the canopy
 * them: read off a game built once, since the camera's tests ask for them every frame they step, and a game built for
 * each was most of what those tests cost.
 */
let kinds: readonly CanopyKind[] | undefined;
export function canopyKinds(): readonly CanopyKind[] {
  return (kinds ??= islandCanopy().kinds);
}

/** What the camera keeps out of on the island, as the game builds it. */
export function islandCanopy(): Canopy {
  return new Game({ random: seeded(1) }).crown;
}

/** The pads of a level's steps, in order: where its parcels wait and where they are wanted. */
export function padsOf(level: Level): number[] {
  return level.steps.flatMap((step) => ('pad' in step ? [step.pad] : []));
}

/** A place on the island and the level of the water it is over, or for dry land the height of the ground. */
export interface Spot {
  x: number;
  y: number;
  level: number;
}

/**
 * Water of each kind and a beach, found from the island's own maps and not from anything the game says of its water:
 * a lake's middle, the open sea at the grid's corner, the widest part of a river that is no lake's or sea's, and a
 * beach, a square of the sea's shallows whose ground is well above its water, where the helicopter must still land.
 */
let spotsFound: { lake: Spot; sea: Spot; river: Spot; beach: Spot } | undefined;
export function waterSpots(): { lake: Spot; sea: Spot; river: Spot; beach: Spot } {
  if (spotsFound) return spotsFound;
  const island = theIsland();
  const { terrain, sea, lakes, rivers, ground } = island;
  const across = terrain.cols - 1;
  const squareAt = (x: number, y: number) =>
    Math.floor((y - terrain.originY) / terrain.cell) * across + Math.floor((x - terrain.originX) / terrain.cell);
  const lakeSquares = new Set(lakes.flatMap((lake) => Array.from(lake.squares)));
  let river: Spot = { x: 0, y: 0, level: 0 };
  let widest = 0;
  for (const { points } of rivers)
    // a point well inside a run, not at its ends where it meets a lake or the sea
    for (let k = 8; k < points.length - 8; k += 4) {
      const sq = squareAt(points[k], points[k + 1]);
      if (lakeSquares.has(sq) || sea[sq] !== 0) continue;
      if (points[k + 3] > widest) {
        widest = points[k + 3];
        river = { x: points[k], y: points[k + 1], level: points[k + 2] };
      }
    }
  let beach: Spot = { x: 0, y: 0, level: 0 };
  let found = false;
  for (let sq = 0; sq < sea.length && !found; sq++) {
    if (sea[sq] === 0) continue;
    const x = terrain.originX + ((sq % across) + 0.5) * terrain.cell,
      y = terrain.originY + (Math.floor(sq / across) + 0.5) * terrain.cell;
    if (ground.heightAt(x, y) > island.seaLevel + 0.4 && ground.heightAt(x, y) < island.seaLevel + 2) {
      beach = { x, y, level: ground.heightAt(x, y) };
      found = true;
    }
  }
  const [lake] = lakes;
  return (spotsFound = {
    lake: { x: lake.x, y: lake.y, level: lake.level },
    sea: { x: island.bounds.minX + 20, y: island.bounds.minY + 20, level: island.seaLevel },
    river,
    beach,
  });
}
