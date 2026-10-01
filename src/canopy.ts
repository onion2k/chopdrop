/**
 * What the camera keeps over in a wood: at any point, the top of the
 * highest tree whose crown is over it, its crown taken as far as it reaches
 * leaning in the wash at its most; nothing where no crown is. Built once
 * from the trees as numbers and how tall each kind stands and how far its
 * crown spreads; it is a `Heights`, as the ground is. Without it, a
 * helicopter set down in a wood leaves the camera inside a crown, and the
 * screen green.
 *
 * It is the crowns and no more. A surface falling away from each crown at
 * a slope was tried first, for the camera to ease over: on steep land a
 * tree's slope either stopped short in a step (a palm on a cliff lifted the
 * camera eleven in a frame at the cliff's foot) or hung over the hillside
 * below it for forty and more, lifting the camera far from any crown. The
 * camera looks ahead along its way instead, which is the camera's business.
 */
import type { Heights } from './chase';
import { TreeGrid, type GridTrees } from './tree-grid';

/** How tall a kind of tree stands, how far its crown spreads and how far its top can lean, as a share of its height. */
export interface CanopyKind {
  top: number;
  radius: number;
  lean: number;
}

/** The size of the squares the trees are sorted into. */
const CELL = 16;

export class Canopy implements Heights {
  /** The trees sorted into squares, so those near a point are found without looking at the rest. */
  readonly grid: TreeGrid;
  /** The farthest any crown reaches from its trunk, leaned, at the largest tree on the island. */
  private readonly reach: number;

  constructor(
    readonly trees: GridTrees,
    readonly kinds: readonly CanopyKind[],
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
    const { grid, kinds, reach } = this;
    const { trees, stride } = this.trees;
    let best = -Infinity;
    const i1 = grid.col(x + reach),
      j1 = grid.row(y + reach);
    for (let j = grid.row(y - reach); j <= j1; j++) {
      for (let i = grid.col(x - reach); i <= i1; i++) {
        const c = grid.at(i, j);
        for (let n = grid.cellStart[c]; n < grid.cellStart[c + 1]; n++) {
          const o = grid.cellTrees[n] * stride;
          const kind = kinds[trees[o]];
          const s = trees[o + 5];
          if (Math.hypot(trees[o + 1] - x, trees[o + 2] - y) > this.spread(kind, s)) continue;
          const top = trees[o + 3] + kind.top * s;
          if (top > best) best = top;
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
