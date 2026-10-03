/**
 * What the camera keeps over, on the island's own trees. It is checked against the trees as they are drawn, crown
 * vertex by crown vertex and leaned as far as a tree leans in play, and not against its own sums, so a canopy that
 * runs under a crown anywhere is caught here before any camera is flown.
 */
import { describe, expect, it } from 'vitest';
import { TREE_KINDS, theIsland } from '../src/arena';
import { Canopy, SLACK } from '../src/canopy';
import { TREE_STRIDE } from '../src/island';
import { TREE_BANDS, treeShape } from '../src/meshes';
import { seeded } from '../src/random';
import { HOVER_LIFT } from '../src/helicopter';
import { DT, canopyKinds, islandCanopy, newGame, thickestWood, watchedTrees } from './helpers';

const island = theIsland();
const { trees, treeCount, ground, bounds } = island;
const canopy = islandCanopy();
const kinds = canopyKinds();
const crowns = TREE_KINDS.map((kind) => treeShape(kind).crown.positions);
/**
 * How far each kind spreads from its axis in each of `TREE_BANDS` equal bands of its height, read off the drawn trunk and
 * crown a triangle at a time: the widest vertex of any triangle that is in the band at all.
 */
const spreads = TREE_KINDS.map((kind) => {
  const shape = treeShape(kind);
  const meshes = [shape.trunk, shape.crown];
  const top = Math.max(
    ...meshes.flatMap((m) => Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[i * 3 + 2])),
  );
  const out = new Array<number>(TREE_BANDS).fill(0);
  for (const m of meshes)
    for (let i = 0; i < m.indices.length; i += 3) {
      const v = [0, 1, 2].map((k) => m.indices[i + k] * 3);
      const zs = v.map((a) => m.positions[a + 2]);
      const wide = Math.max(...v.map((a) => Math.hypot(m.positions[a], m.positions[a + 1])));
      // in every band from the one its lowest vertex is in to the one its highest is in, the very top in the last
      const band = (z: number) => Math.min(TREE_BANDS - 1, Math.floor((z / top) * TREE_BANDS));
      for (let b = band(Math.min(...zs)); b <= band(Math.max(...zs)); b++) out[b] = Math.max(out[b], wide);
    }
  return out;
});

describe('the canopy', () => {
  it('has the flight’s own, which the autopilot reads, as it was before the trees bowed further: no profile, the old lean', () => {
    const { game } = newGame();
    for (const kind of game.canopy.kinds) expect(kind.profile).toBeUndefined();
    // a kind that gives as much as a broadleaf leans 0.364 of its height: 0.18 of a wash taken at its most and beaten up
    expect(game.canopy.kinds[TREE_KINDS.indexOf('broadleaf')].lean).toBeCloseTo(0.364, 3);
    // and the camera's is each crown as it stands, with how it spreads at each height
    for (const kind of game.crown.kinds) {
      expect(kind.lean).toBe(0);
      expect(kind.profile).toHaveLength(TREE_BANDS);
    }
  });

  it('is over every crown, as drawn, at rest', () => {
    let checked = 0;
    for (let t = 0; t < treeCount; t += 23) {
      const o = t * TREE_STRIDE;
      const [kind, x, y, z, yaw, s] = [0, 1, 2, 3, 4, 5].map((k) => trees[o + k]);
      const c = Math.cos(yaw),
        sn = Math.sin(yaw);
      const v = crowns[kind];
      for (let i = 0; i < v.length; i += 3) {
        // placed as the scene places it, turned and sized
        const h = v[i + 2] * s;
        const wx = x + (c * v[i] - sn * v[i + 1]) * s;
        const wy = y + (sn * v[i] + c * v[i + 1]) * s;
        expect(canopy.heightAt(wx, wy), `tree ${t}, vertex ${i / 3}`).toBeGreaterThanOrEqual(z + h - 1e-4);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5_000);
  });

  it('is over every crown, as drawn, of every tree the wash is bowing, leaned as the sway has it, and over no more than it bows', () => {
    // the helicopter hovering low in the thickest wood, the trees round it bowed away and pressed down
    const { game } = newGame();
    const wood = thickestWood();
    game.helicopter.placeAbove(wood.x, wood.y, 3, 0);
    for (let f = 0; f < 150; f++) game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    const { sway } = game;
    expect(sway.count).toBeGreaterThan(40);
    let checked = 0,
      leaned = 0;
    for (let k = 0; k < sway.count; k++) {
      const t = sway.tree[k];
      const o = t * TREE_STRIDE;
      const [kind, x, y, z, yaw, s] = [0, 1, 2, 3, 4, 5].map((n) => trees[o + n]);
      const c = Math.cos(yaw),
        sn = Math.sin(yaw);
      const v = crowns[kind];
      if (Math.hypot(sway.leanX[k], sway.leanY[k]) > 0.1) leaned++;
      for (let i = 0; i < v.length; i += 3) {
        // placed as the scene places it, then leaned from the foot and shortened as the scene leans it
        const h = v[i + 2] * s;
        const wx = x + (c * v[i] - sn * v[i + 1]) * s + sway.leanX[k] * h;
        const wy = y + (sn * v[i] + c * v[i + 1]) * s + sway.leanY[k] * h;
        expect(game.crown.heightAt(wx, wy), `tree ${t}, vertex ${i / 3}`).toBeGreaterThanOrEqual(
          z + h * (1 - sway.squash[k]) - 1e-4,
        );
        checked++;
      }
    }
    expect(leaned, 'trees bowed over a tenth of their height').toBeGreaterThan(20);
    expect(checked).toBeGreaterThan(2_000);
    // a tree bowed does not hold its crown where it was planted: the canopy over its foot is lower than the crown at rest
    // for at least one that has bowed well away
    let moved = 0;
    for (let k = 0; k < sway.count; k++) {
      const o = sway.tree[k] * TREE_STRIDE;
      if (Math.hypot(sway.leanX[k], sway.leanY[k]) < 0.4) continue;
      const rest = canopy.heightAt(trees[o + 1], trees[o + 2]);
      if (game.crown.heightAt(trees[o + 1], trees[o + 2]) < rest) moved++;
    }
    expect(moved).toBeGreaterThan(0);
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
        const { top, lean } = kinds[trees[o]];
        const s = trees[o + 5];
        const d = Math.hypot(trees[o + 1] - x, trees[o + 2] - y);
        // the highest band of the tree's height whose spread, carried out by the lean to the top of the band, reaches
        // the point, the spreads read off the drawn shapes here and not from the kind
        const spread = spreads[trees[o]];
        for (let b = spread.length - 1; b >= 0; b--) {
          const up = ((b + 1) / spread.length) * top;
          if (d <= (spread[b] + lean * up) * s + SLACK) {
            want = Math.max(want, trees[o + 3] + up * s);
            break;
          }
        }
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
