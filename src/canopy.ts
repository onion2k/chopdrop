/**
 * What the camera keeps over in a wood: at any point, the height of the highest crown that is over it, each crown as it
 * stands now. A tree at rest is its crown where it was planted; a tree the downwash is bowing is leaned as far as it is
 * leaned this very step, which carries it out from its trunk the farther up it is, so that its top is over the point
 * only where the lean has put it there. Nothing where no crown is. Built once from the trees as numbers, how tall each
 * kind stands and how far it spreads at each height, and the trees that are moving; it is a `Heights`, as the ground is.
 * Without it, a helicopter set down in a wood leaves the camera inside a crown, and the screen green.
 *
 * It is the crowns and no more. A surface falling away from each crown at a slope was tried first, for the camera to
 * ease over: on steep land a tree's slope either stopped short in a step (a palm on a cliff lifted the camera eleven in
 * a frame at the cliff's foot) or hung over the hillside below it for forty and more, lifting the camera far from any
 * crown. The camera looks ahead along its way instead, which is the camera's business.
 *
 * A canopy built with no moving trees and a kind that has a `lean` and no profile is the flight's: each crown held to
 * its top wherever it could reach leaned that far, which the autopilot reads and has always read. The camera's is the
 * other, since a crown that must be kept out of at the most a tree can lean, when trees now lean further than they are
 * tall, would keep the camera high over every wood there is.
 */
import type { Heights } from './chase';
import { TreeGrid, type GridTrees } from './tree-grid';

/**
 * How tall a kind of tree stands, how far its crown spreads and how far its top can lean, as a share of its height, and
 * how far it spreads in each equal band of its height, the lowest first. A kind with no profile is taken to spread as far
 * at its top as at its foot, so its crown is held to its top at every point it could reach with its lean.
 */
export interface CanopyKind {
  top: number;
  radius: number;
  lean: number;
  profile?: readonly number[];
}

/** The trees that are moving, as the sway keeps them: how many, which, and how far each is leaned each way, as a share of its height. */
export interface Moving {
  count: number;
  tree: ArrayLike<number>;
  leanX: ArrayLike<number>;
  leanY: ArrayLike<number>;
  slot(tree: number): number;
}

/** The size of the squares the trees are sorted into. */
const CELL = 16;
/** A centimetre, over what a crown spreads, so that a vertex on the very edge of its band is in it whatever the rounding. */
export const SLACK = 0.01;

export class Canopy implements Heights {
  /** The trees sorted into squares, so those near a point are found without looking at the rest. */
  readonly grid: TreeGrid;
  /** The farthest any crown reaches from its trunk, leaned, at the largest tree on the island. */
  private readonly reach: number;

  constructor(
    readonly trees: GridTrees,
    readonly kinds: readonly CanopyKind[],
    private readonly moving?: Moving,
  ) {
    this.grid = new TreeGrid(trees, CELL);
    let scale = 0;
    for (let t = 0; t < trees.count; t++) scale = Math.max(scale, trees.trees[t * trees.stride + 5]);
    let most = 0;
    for (const k of kinds) most = Math.max(most, this.spread(k, 1));
    this.reach = most * scale;
  }

  /** The top of the highest crown over (x, y), or −Infinity where no crown is. Allocates nothing. */
  heightAt(x: number, y: number): number {
    const { grid, kinds, reach, moving } = this;
    const { trees, stride } = this.trees;
    let best = -Infinity;
    const i1 = grid.col(x + reach),
      j1 = grid.row(y + reach);
    for (let j = grid.row(y - reach); j <= j1; j++) {
      for (let i = grid.col(x - reach); i <= i1; i++) {
        const c = grid.at(i, j);
        for (let n = grid.cellStart[c]; n < grid.cellStart[c + 1]; n++) {
          const t = grid.cellTrees[n];
          // a tree that is moving is leaned, and found below with the others that are
          if (moving && moving.slot(t) >= 0) continue;
          const o = t * stride;
          const kind = kinds[trees[o]];
          const s = trees[o + 5];
          const d = Math.hypot(trees[o + 1] - x, trees[o + 2] - y);
          if (d > this.spread(kind, s) + SLACK) continue;
          const profile = kind.profile;
          if (!profile) {
            const top = trees[o + 3] + kind.top * s;
            if (top > best) best = top;
            continue;
          }
          // a leaned tree has its crown over a point out from its trunk only part of the way up, where the lean has
          // carried it that far: the highest band whose leaned spread reaches the point, taken to the top of the band
          const bands = profile.length;
          for (let b = bands - 1; b >= 0; b--) {
            const up = ((b + 1) / bands) * kind.top;
            if (d > (profile[b] + kind.lean * up) * s + SLACK) continue;
            const top = trees[o + 3] + up * s;
            if (top > best) best = top;
            break;
          }
        }
      }
    }
    if (moving) {
      for (let k = 0; k < moving.count; k++) {
        const o = moving.tree[k] * stride;
        const kind = kinds[trees[o]];
        const profile = kind.profile;
        if (!profile) continue;
        const s = trees[o + 5];
        const lx = moving.leanX[k],
          ly = moving.leanY[k];
        const bands = profile.length;
        const band = (kind.top / bands) * Math.hypot(lx, ly);
        // a crown is not further from where it was planted than its spread and its lean carry it
        if (Math.hypot(trees[o + 1] - x, trees[o + 2] - y) > (kind.radius + Math.hypot(lx, ly) * kind.top) * s + SLACK)
          continue;
        for (let b = bands - 1; b >= 0; b--) {
          const up = ((b + 1) / bands) * kind.top * s;
          const top = trees[o + 3] + up;
          if (top <= best) break;
          // the band's middle carried out by the lean, its spread and the lean across the band's own height
          if (Math.hypot(trees[o + 1] + lx * up - x, trees[o + 2] + ly * up - y) <= (profile[b] + band) * s + SLACK) {
            best = top;
            break;
          }
        }
      }
    }
    return best;
  }

  /** How far a crown of a kind at a scale reaches from its trunk: its spread, and its top leaned as far as it leans. */
  private spread(kind: CanopyKind, scale: number): number {
    return (kind.radius + kind.lean * kind.top) * scale;
  }
}
