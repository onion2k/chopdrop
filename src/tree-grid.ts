/**
 * The trees sorted into squares across the island, so the trees near a point
 * are found without looking at the thousands that are not. Built once from
 * the trees as numbers, and never added to. Without it, everything that asks
 * which trees are near (the trees in the downwash, and what the camera keeps
 * over) would walk every tree on the island each frame.
 */
import type { Bounds } from './helicopter';

/** The trees a grid is built from: `stride` floats a tree with x and y at 1 and 2, `count` of them, inside `bounds`. */
export interface GridTrees {
  trees: Float32Array;
  stride: number;
  count: number;
  bounds: Bounds;
}

export class TreeGrid {
  /** How many squares there are across and down. */
  readonly cols: number;
  readonly rows: number;
  /** Square c's trees are `cellTrees` from `cellStart[c]` to `cellStart[c + 1]`, as indices into the trees. */
  readonly cellStart: Uint32Array;
  readonly cellTrees: Uint32Array;
  private readonly minX: number;
  private readonly minY: number;

  /** The trees sorted into squares `cell` across. */
  constructor(
    from: GridTrees,
    readonly cell: number,
  ) {
    const { minX, minY, maxX, maxY } = from.bounds;
    this.minX = minX;
    this.minY = minY;
    this.cols = Math.max(1, Math.ceil((maxX - minX) / cell));
    this.rows = Math.max(1, Math.ceil((maxY - minY) / cell));
    // counted, then filled
    this.cellStart = new Uint32Array(this.cols * this.rows + 1);
    this.cellTrees = new Uint32Array(from.count);
    const cellOf = new Uint32Array(from.count);
    for (let t = 0; t < from.count; t++) {
      const o = t * from.stride;
      cellOf[t] = this.at(this.col(from.trees[o + 1]), this.row(from.trees[o + 2]));
      this.cellStart[cellOf[t] + 1]++;
    }
    for (let c = 0; c < this.cols * this.rows; c++) this.cellStart[c + 1] += this.cellStart[c];
    const fill = this.cellStart.slice(0, -1);
    for (let t = 0; t < from.count; t++) this.cellTrees[fill[cellOf[t]]++] = t;
  }

  /** The column a point across is in, held to the grid. */
  col(x: number): number {
    const i = Math.floor((x - this.minX) / this.cell);
    return i < 0 ? 0 : i >= this.cols ? this.cols - 1 : i;
  }

  /** The row a point down is in, held to the grid. */
  row(y: number): number {
    const j = Math.floor((y - this.minY) / this.cell);
    return j < 0 ? 0 : j >= this.rows ? this.rows - 1 : j;
  }

  /** The square at a column and row. */
  at(i: number, j: number): number {
    return j * this.cols + i;
  }
}
