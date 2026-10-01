/**
 * The trees sorted into squares, on the island's own trees: a tree missing from its square, or in two, is a tree the
 * wash or the camera never finds, and nothing else would say so.
 */
import { describe, expect, it } from 'vitest';
import { theIsland } from '../src/arena';
import { TREE_STRIDE } from '../src/island';
import { TreeGrid } from '../src/tree-grid';

const island = theIsland();
const from = { trees: island.trees, stride: TREE_STRIDE, count: island.treeCount, bounds: island.bounds };

describe('the tree grid', () => {
  it('holds every tree once, in the square it stands in', () => {
    const grid = new TreeGrid(from, 16);
    const seen = new Uint8Array(island.treeCount);
    expect(grid.cellStart[grid.cols * grid.rows]).toBe(island.treeCount);
    for (let j = 0; j < grid.rows; j++) {
      for (let i = 0; i < grid.cols; i++) {
        const c = grid.at(i, j);
        for (let n = grid.cellStart[c]; n < grid.cellStart[c + 1]; n++) {
          const t = grid.cellTrees[n];
          seen[t]++;
          const x = island.trees[t * TREE_STRIDE + 1],
            y = island.trees[t * TREE_STRIDE + 2];
          expect([grid.col(x), grid.row(y)], `tree ${t}`).toEqual([i, j]);
          expect(x).toBeGreaterThanOrEqual(island.bounds.minX + i * 16);
          expect(x).toBeLessThan(island.bounds.minX + (i + 1) * 16);
        }
      }
    }
    expect(seen.every((n) => n === 1)).toBe(true);
  });

  it('covers the world with squares of the size asked, and holds a point past its edge to the edge', () => {
    const grid = new TreeGrid(from, 16);
    const { minX, minY, maxX, maxY } = island.bounds;
    expect(grid.cols).toBe(Math.ceil((maxX - minX) / 16));
    expect(grid.rows).toBe(Math.ceil((maxY - minY) / 16));
    expect([grid.col(minX - 100), grid.row(minY - 100)]).toEqual([0, 0]);
    expect([grid.col(maxX + 100), grid.row(maxY + 100)]).toEqual([grid.cols - 1, grid.rows - 1]);
    expect(grid.at(grid.cols - 1, grid.rows - 1)).toBe(grid.cols * grid.rows - 1);
  });

  it('holds no trees when handed none', () => {
    const grid = new TreeGrid({ ...from, count: 0 }, 16);
    expect(grid.cellTrees).toHaveLength(0);
    expect(grid.cellStart.every((n) => n === 0)).toBe(true);
  });
});
