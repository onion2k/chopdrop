/**
 * What the camera keeps over, on the island's own trees. It is checked against the trees as they are drawn, crown
 * vertex by crown vertex and leaned as far as a tree leans in play, and not against its own sums, so a canopy that
 * runs under a crown anywhere is caught here before any camera is flown.
 */
import { describe, expect, it } from 'vitest';
import { TREE_KINDS, theIsland } from '../src/arena';
import { Canopy } from '../src/canopy';
import { TREE_STRIDE } from '../src/island';
import { treeShape } from '../src/meshes';
import { seeded } from '../src/random';
import { canopyKinds, islandCanopy, watchedTrees } from './helpers';

const island = theIsland();
const { trees, treeCount, ground, bounds } = island;
const canopy = islandCanopy();
const kinds = canopyKinds();
const crowns = TREE_KINDS.map((kind) => treeShape(kind).crown.positions);

describe('the canopy', () => {
  it('is over every crown, as drawn, leaned every way as far as a tree leans in play', () => {
    let checked = 0;
    for (let t = 0; t < treeCount; t += 23) {
      const o = t * TREE_STRIDE;
      const [kind, x, y, z, yaw, s] = [0, 1, 2, 3, 4, 5].map((k) => trees[o + k]);
      const lean = kinds[kind].lean;
      const c = Math.cos(yaw),
        sn = Math.sin(yaw);
      const v = crowns[kind];
      for (const [ax, ay] of [
        [0, 0],
        [lean, 0],
        [-lean, 0],
        [0, lean],
        [0, -lean],
      ]) {
        for (let i = 0; i < v.length; i += 3) {
          // placed as the scene places it, turned and sized, then leaned from the foot as the scene leans it
          const h = v[i + 2] * s;
          const wx = x + (c * v[i] - sn * v[i + 1]) * s + ax * h;
          const wy = y + (sn * v[i] + c * v[i + 1]) * s + ay * h;
          expect(canopy.heightAt(wx, wy), `tree ${t}, vertex ${i / 3}`).toBeGreaterThanOrEqual(z + h - 1e-4);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100_000);
  });

  it('is the top of the highest crown over a point, and nothing where no crown is', () => {
    // worked out over every tree on the island, with no squares, so a tree the squares leave out is caught
    const random = seeded(5);
    let over = 0,
      bare = 0;
    for (let k = 0; k < 1500; k++) {
      const x = 116 + (random() - 0.5) * 300,
        y = -280 + (random() - 0.5) * 300;
      let want = -Infinity;
      for (let t = 0; t < treeCount; t++) {
        const o = t * TREE_STRIDE;
        const { top, radius, lean } = kinds[trees[o]];
        const s = trees[o + 5];
        if (Math.hypot(trees[o + 1] - x, trees[o + 2] - y) <= (radius + lean * top) * s)
          want = Math.max(want, trees[o + 3] + top * s);
      }
      expect(canopy.heightAt(x, y), `at ${x.toFixed(1)}, ${y.toFixed(1)}`).toBe(want);
      if (want === -Infinity) bare++;
      else over++;
    }
    expect(over).toBeGreaterThan(300);
    expect(bare).toBeGreaterThan(100);
    expect(canopy.heightAt(bounds.minX, bounds.minY)).toBe(-Infinity);
    expect(canopy.heightAt(bounds.minX - 100, 0)).toBe(-Infinity);
  });

  it('is nothing over the middle of the clearing in the wood, and the trees round it over their feet', () => {
    expect(canopy.heightAt(116, -280)).toBe(-Infinity);
    // a pine 10.4 tall stands 6.5 out from the middle
    let nearest = -1,
      d = Infinity;
    for (let t = 0; t < treeCount; t++) {
      const e = Math.hypot(trees[t * TREE_STRIDE + 1] - 116, trees[t * TREE_STRIDE + 2] + 280);
      if (e < d) [nearest, d] = [t, e];
    }
    const o = nearest * TREE_STRIDE;
    expect(canopy.heightAt(trees[o + 1], trees[o + 2])).toBeGreaterThan(ground.heightAt(116, -280) + 9);
  });

  it('finds the height at a point from the trees whose crowns could reach it, and not from the rest of the island', () => {
    const { trees: watched, looked } = watchedTrees();
    const watchedCanopy = new Canopy({ trees: watched, stride: TREE_STRIDE, count: treeCount, bounds }, kinds);
    // no crown on the island reaches further from its trunk than the widest kind's at the largest tree's size, so a
    // tree in a square that could hold a crown over the point stands no further than that and a square from it
    let scale = 0;
    for (let t = 0; t < treeCount; t++) scale = Math.max(scale, trees[t * TREE_STRIDE + 5]);
    const near = Math.max(...kinds.map((k) => k.radius + k.lean * k.top)) * scale + watchedCanopy.grid.cell;
    const random = seeded(2);
    let most = 0,
      strays = 0,
      looking = 0,
      wrong = 0;
    for (let k = 0; k < 2000; k++) {
      const x = 116 + (random() - 0.5) * 200,
        y = -280 + (random() - 0.5) * 200;
      looked.clear();
      // watched, it gives the answer it gives unwatched
      if (watchedCanopy.heightAt(x, y) !== canopy.heightAt(x, y)) wrong++;
      for (const t of looked)
        if (Math.abs(trees[t * TREE_STRIDE + 1] - x) >= near || Math.abs(trees[t * TREE_STRIDE + 2] - y) >= near)
          strays++;
      most = Math.max(most, looked.size);
      if (looked.size > 0) looking++;
    }
    expect(wrong).toBe(0);
    // most points looked, so what it looked at was watched, and no tree it looked at stood out past the squares round
    // the point
    expect(looking).toBeGreaterThan(1500);
    expect(strays, `trees looked at out past the squares round the point, of ${most} at the most in one go`).toBe(0);
    // so a question costs the few trees round the point, and not the island's thousands
    expect(most).toBeLessThan(treeCount / 10);
  });
});
