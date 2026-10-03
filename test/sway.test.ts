/**
 * The trees in the downwash, on the island's own trees, with the wash's source moved by hand as a helicopter would
 * fly it, and through the game where the rotor's winding up is what is tried. Each acceptance criterion of the
 * feature is a test here: the lean away from the hub, the press straight under it, the trees left alone, the
 * landed helicopter that moves nothing, the trees stood up again and let go, the pool never full, the same flight
 * the same leans.
 */
import { describe, expect, it } from 'vitest';
import { theIsland } from '../src/arena';
import { DOWNWASH, washAt, type Wash, type WashSource } from '../src/downwash';
import { HELICOPTER, IDLE } from '../src/helicopter';
import { checkSway } from '../src/invariants';
import { TREE_STRIDE } from '../src/island';
import { TREE_GIVE, TREE_KINDS } from '../src/arena';
import { treeSize } from '../src/meshes';
import { SWAY, reachedLean, type Sway } from '../src/sway';
import { DT, islandSway, newGame, thickestWood, watchedTrees } from './helpers';

const island = theIsland();
const { trees, treeCount, ground } = island;
const { mastTop } = HELICOPTER.size;
const FULL = HELICOPTER.rotorFull;
const tx = (t: number) => trees[t * TREE_STRIDE + 1];
const ty = (t: number) => trees[t * TREE_STRIDE + 2];
const tz = (t: number) => trees[t * TREE_STRIDE + 3];
const wood = thickestWood();
/** Where the wash is measured on a tree: its foot and the crown's share of its height, from the kind's height and the tree's scale, not from the sway. */
const crownAt = (t: number) =>
  tz(t) + SWAY.crown * treeSize(TREE_KINDS[trees[t * TREE_STRIDE]]).top * trees[t * TREE_STRIDE + 5];

/** A helicopter over (x, y), its skids `height` above the ground there, its rotor at full. */
const hovering = (x: number, y: number, height: number): WashSource => ({
  x,
  y,
  z: ground.heightAt(x, y) + height,
  rotorSpeed: FULL,
});

/** The sway stepped for `seconds` from game time `t`, with `fly` moving the source before each step; the time after. */
function run(sway: Sway, source: WashSource, seconds: number, t = 0, fly?: (s: WashSource) => void): number {
  const frames = Math.round(seconds / DT);
  for (let f = 0; f < frames; f++) {
    fly?.(source);
    t += DT;
    sway.step(DT, source, t);
  }
  return t;
}

/** Each moving tree's lean, averaged over `seconds`, so the flutter is taken out of it. */
function meanLeans(sway: Sway, source: WashSource, seconds: number, t: number): Map<number, [number, number]> {
  const sums = new Map<number, [number, number, number]>();
  const frames = Math.round(seconds / DT);
  for (let f = 0; f < frames; f++) {
    t += DT;
    sway.step(DT, source, t);
    for (let k = 0; k < sway.count; k++) {
      const s = sums.get(sway.tree[k]) ?? [0, 0, 0];
      s[0] += sway.leanX[k];
      s[1] += sway.leanY[k];
      s[2]++;
      sums.set(sway.tree[k], s);
    }
  }
  const means = new Map<number, [number, number]>();
  for (const [t, [x, y, n]] of sums) means.set(t, [x / n, y / n]);
  return means;
}

const wash = (source: WashSource, t: number): Wash => washAt(source, tx(t), ty(t), tz(t), { x: 0, y: 0, down: 0 });
const reached = (source: WashSource, t: number) => {
  const w = wash(source, t);
  return w.x !== 0 || w.y !== 0 || w.down !== 0;
};
const distance = (source: WashSource, t: number) => Math.hypot(tx(t) - source.x, ty(t) - source.y);

/** The longest a tree swings once the wash has gone, to the last of its movement: the spring's own fade, with a second to spare. */
const SETTLE = Math.log((2 * SWAY.lean * 1.4) / SWAY.still) / (SWAY.damping * 2 * Math.PI * SWAY.hz) + 1;

describe('the trees in the downwash', () => {
  it('has a thick wood to be tried in', () => {
    // the densest place a helicopter can hover: what the scale and the pool are measured against
    expect(wood.trees).toBeGreaterThan(40);
  });

  it('leans every tree in reach away from the hub, the nearer the more, and none past the most', () => {
    const sway = islandSway();
    const source = hovering(wood.x, wood.y, 4);
    const t = run(sway, source, 2);
    const means = meanLeans(sway, source, 1, t);
    let inReach = 0;
    const near: number[] = [],
      far: number[] = [];
    for (let tree = 0; tree < treeCount; tree++) {
      const w = wash(source, tree);
      if (Math.hypot(w.x, w.y) < 0.02) continue;
      inReach++;
      const mean = means.get(tree);
      expect(mean, `tree ${tree} in reach is moving`).toBeDefined();
      const [lx, ly] = mean!;
      // it leans away from under the hub, worked out from where the tree and the helicopter are and not from the wash
      const d = distance(source, tree);
      const [ox, oy] = [(tx(tree) - source.x) / d, (ty(tree) - source.y) / d];
      expect((lx * ox + ly * oy) / Math.hypot(lx, ly), `tree ${tree}`).toBeGreaterThan(0.9);
      if (d < DOWNWASH.column * 2) near.push(Math.hypot(lx, ly));
      if (d > DOWNWASH.reach * 0.75) far.push(Math.hypot(lx, ly));
    }
    expect(inReach).toBeGreaterThan(20);
    const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(near.length && far.length).toBeTruthy();
    expect(average(near)).toBeGreaterThan(2 * average(far));
    for (let k = 0; k < sway.count; k++) {
      expect(Math.hypot(sway.leanX[k], sway.leanY[k])).toBeLessThanOrEqual(sway.maxLean);
      expect(Math.abs(sway.squash[k])).toBeLessThanOrEqual(sway.maxSquash);
    }
  });

  it('bows a tree plainly under a helicopter hovering just over the canopy of the thickest wood, and still at ten metres', () => {
    // how far the tree that bends most bows, as a share of its height, flutter averaged out, the skids `over` metres
    // above the top of the crowns there: what a player sees as the trees moving, or as them hardly moving
    const bow = (over: number) => {
      const sway = islandSway();
      const source = hovering(
        wood.x,
        wood.y,
        newGame().game.canopy.heightAt(wood.x, wood.y) - ground.heightAt(wood.x, wood.y) + over,
      );
      const means = meanLeans(sway, source, 1, run(sway, source, 2));
      return Math.max(...[...means.values()].map(([x, y]) => Math.hypot(x, y)));
    };
    const [close, ten] = [bow(2), bow(10)];
    expect(close, 'at 2 m over the canopy').toBeGreaterThanOrEqual(0.3);
    expect(ten, 'at 10 m over the canopy').toBeGreaterThanOrEqual(0.1);
  });

  it('leans them less the higher the helicopter hovers', () => {
    const lean = (height: number) => {
      const sway = islandSway();
      const source = hovering(wood.x, wood.y, height);
      const means = meanLeans(sway, source, 1, run(sway, source, 2));
      let sum = 0;
      for (const [x, y] of means.values()) sum += Math.hypot(x, y);
      return sum;
    };
    const low = lean(3),
      middling = lean(14),
      high = lean(DOWNWASH.depth - 6);
    expect(low).toBeGreaterThan(middling);
    expect(middling).toBeGreaterThan(high);
    expect(high).toBeGreaterThan(0);
  });

  it('presses a tree straight under the hub down, and does not push it aside', () => {
    const tree = 0;
    const source: WashSource = { x: tx(tree), y: ty(tree), z: tz(tree) + 3, rotorSpeed: FULL };
    const sway = islandSway();
    run(sway, source, 2);
    const k = sway.slot(tree);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(sway.leanX[k]).toBe(0);
    expect(sway.leanY[k]).toBe(0);
    expect(sway.squash[k]).toBeGreaterThan(0.02);
  });

  it('leaves alone every tree out of its reach', () => {
    const sway = islandSway();
    const source = hovering(wood.x, wood.y, 4);
    run(sway, source, 2);
    expect(sway.count).toBeGreaterThan(20);
    for (let tree = 0; tree < treeCount; tree++)
      if (distance(source, tree) >= DOWNWASH.reach) expect(sway.slot(tree), `tree ${tree}`).toBe(-1);
  });

  it('moves no tree under a helicopter too high to be felt', () => {
    const sway = islandSway();
    // the highest place the wash is measured at, three quarters up a tree, in reach, so the hub is past the depth from
    // every one
    let top = -Infinity;
    for (let tree = 0; tree < treeCount; tree++)
      if (Math.hypot(tx(tree) - wood.x, ty(tree) - wood.y) < DOWNWASH.reach) top = Math.max(top, crownAt(tree));
    run(sway, { x: wood.x, y: wood.y, z: top + DOWNWASH.depth - mastTop, rotorSpeed: FULL }, 3);
    expect(sway.count).toBe(0);
    // and a little lower, it is felt: the depth is where it stops, not somewhere above it
    const lower = islandSway();
    run(lower, { x: wood.x, y: wood.y, z: top + DOWNWASH.depth - mastTop - 3, rotorSpeed: FULL }, 0.1);
    expect(lower.count).toBeGreaterThan(0);
    run(sway, { x: wood.x, y: wood.y, z: HELICOPTER.ceiling, rotorSpeed: FULL }, 1);
    expect(sway.count).toBe(0);
  });

  it('moves nothing for a helicopter landed with its rotor idling, and leans more as the rotor winds up', () => {
    const { game } = newGame();
    const h = game.helicopter;
    h.place(wood.x, wood.y, 0, 0);
    expect(h.landed).toBe(true);
    for (let f = 0; f < 180; f++) game.step(DT, IDLE);
    expect(h.rotorSpeed).toBeCloseTo(HELICOPTER.rotorIdle, 6);
    expect(game.sway.count).toBe(0);
    const lift = { forward: 0, turn: 0, lift: 1 };
    game.step(DT, lift);
    // a sixtieth of a second into winding up, the rotor is not yet strong enough to be felt
    expect(game.sway.count).toBe(0);
    const total = () => {
      let sum = 0;
      for (let k = 0; k < game.sway.count; k++) sum += Math.hypot(game.sway.leanX[k], game.sway.leanY[k]);
      return sum;
    };
    for (let f = 0; f < 14; f++) game.step(DT, lift);
    const early = total();
    for (let f = 0; f < 30; f++) game.step(DT, lift);
    const later = total();
    expect(early).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(2 * early);
  });

  it('stands every tree up again once the helicopter has flown on, and lets it go', () => {
    const sway = islandSway();
    const source = hovering(wood.x, wood.y, 4);
    let t = run(sway, source, 2);
    const moved = Array.from(sway.tree.subarray(0, sway.count));
    expect(moved.length).toBeGreaterThan(20);
    // flown off at top speed, low, over whatever wood is there, and gone well out of reach of the trees it left
    t = run(sway, source, 3, t, (s) => (s.x += HELICOPTER.maxSpeed * DT));
    run(sway, source, SETTLE, t);
    for (const tree of moved) {
      expect(distance(source, tree)).toBeGreaterThan(DOWNWASH.reach);
      expect(sway.slot(tree), `tree ${tree}`).toBe(-1);
    }
  });

  it('stands them up again once the helicopter has climbed out of reach', () => {
    const sway = islandSway();
    const source = hovering(wood.x, wood.y, 4);
    let t = run(sway, source, 2);
    expect(sway.count).toBeGreaterThan(20);
    t = run(sway, source, 4, t, (s) => (s.z = Math.min(HELICOPTER.ceiling, s.z + HELICOPTER.climbSpeed * DT)));
    run(sway, source, SETTLE, t);
    expect(sway.count).toBe(0);
  });

  it('swings a tree past upright as the wash leaves it, before it settles', () => {
    const sway = islandSway();
    const source = hovering(wood.x, wood.y, 4);
    const t = run(sway, source, 2);
    const means = meanLeans(sway, source, 0.5, t);
    // the tree leaning furthest, and which way
    let tree = -1,
      most = 0;
    for (const [which, [x, y]] of means) if (Math.hypot(x, y) > most) [tree, most] = [which, Math.hypot(x, y)];
    const [ux, uy] = means.get(tree)!.map((v) => v / most);
    let back = 0;
    run(sway, source, SETTLE, t + 0.5, (s) => {
      s.y += HELICOPTER.maxSpeed * DT;
      const k = sway.slot(tree);
      if (k >= 0) back = Math.min(back, sway.leanX[k] * ux + sway.leanY[k] * uy);
    });
    expect(back).toBeLessThan(-0.1 * most);
  });

  it('keeps no more moving than it has room for, flown low at top speed through the thickest wood', () => {
    const sway = islandSway();
    let peak = 0;
    let t = 0;
    /** The most any tree leaned, as a share of the most its kind leans in play. */
    let leanedMost = 0;
    // back and forth through the wood, and round it, skids a metre and a half over the land
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.7, 0.7],
    ]) {
      const source = hovering(wood.x - dx * 100, wood.y - dy * 100, 1.5);
      t = run(sway, source, 200 / HELICOPTER.maxSpeed, t, (s) => {
        s.x += dx * HELICOPTER.maxSpeed * DT;
        s.y += dy * HELICOPTER.maxSpeed * DT;
        s.z = ground.heightAt(s.x, s.y) + 1.5;
        peak = Math.max(peak, sway.count);
        for (let k = 0; k < sway.count; k++) {
          const give = TREE_GIVE[TREE_KINDS[trees[sway.tree[k] * TREE_STRIDE]]];
          leanedMost = Math.max(leanedMost, Math.hypot(sway.leanX[k], sway.leanY[k]) / reachedLean(give));
        }
      });
    }
    expect(sway.missed).toBe(0);
    expect(peak).toBeGreaterThan(wood.trees);
    // and no tree leaned past what keeps clear of a crown allows for, its kind's most in play
    expect(leanedMost).toBeGreaterThan(0.5);
    expect(leanedMost).toBeLessThanOrEqual(1);
    // a third to spare, at the least: the capacity says what it is, and this holds it to that
    expect(peak).toBeLessThan(SWAY.capacity * (2 / 3));
  });

  it('leaves a tree it has no room for standing, and breaks nothing', () => {
    const sway = islandSway(8);
    const source = hovering(wood.x, wood.y, 4);
    run(sway, source, 2);
    expect(sway.count).toBe(8);
    expect(sway.missed).toBeGreaterThan(0);
    expect(checkSway(sway)).toEqual([]);
    let standing = 0;
    for (let tree = 0; tree < treeCount; tree++) if (reached(source, tree) && sway.slot(tree) < 0) standing++;
    expect(standing).toBeGreaterThan(0);
  });

  it('gives the same leans for the same flight', () => {
    const fly = (s: WashSource) => {
      s.x += 9 * DT;
      s.y -= 4 * DT;
    };
    const [a, b] = [islandSway(), islandSway()];
    run(a, hovering(wood.x - 20, wood.y, 3), 4, 0, fly);
    run(b, hovering(wood.x - 20, wood.y, 3), 4, 0, fly);
    expect(a.count).toBeGreaterThan(0);
    expect(b.count).toBe(a.count);
    expect(Array.from(b.tree)).toEqual(Array.from(a.tree));
    expect(Array.from(b.leanX)).toEqual(Array.from(a.leanX));
    expect(Array.from(b.leanY)).toEqual(Array.from(a.leanY));
    expect(Array.from(b.squash)).toEqual(Array.from(a.squash));
  });

  it('is not thrown by the corners of the world', () => {
    const { minX, minY, maxX, maxY } = island.bounds;
    const sway = islandSway();
    for (const [x, y] of [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX - 50, 0],
    ]) {
      const source: WashSource = { x, y, z: 1, rotorSpeed: FULL };
      run(sway, source, 0.5);
      expect(checkSway(sway)).toEqual([]);
    }
    // and the same sway still works in the wood after
    run(sway, hovering(wood.x, wood.y, 4), 0.5);
    expect(sway.count).toBeGreaterThan(20);
  });

  it('looks in a step at the trees near the hub and those already moving, and not at the rest of the island', () => {
    const { trees: watched, looked } = watchedTrees();
    const sway = islandSway(SWAY.capacity, watched);
    const source = hovering(wood.x, wood.y, 4);
    let t = run(sway, source, 1);
    /** As far from the hub, each way, as a tree in a square the wash reaches into can stand. */
    const near = DOWNWASH.reach + SWAY.cell;
    let most = 0,
      strays = 0,
      looking = 0;
    // drifted across the thickest wood, two squares' width, so the squares looked in change under it
    for (let f = 0; f < 600; f++) {
      const moving = new Set(sway.tree.subarray(0, sway.count));
      source.x += 0.05;
      source.z = ground.heightAt(source.x, source.y) + 4;
      t += DT;
      looked.clear();
      sway.step(DT, source, t);
      for (const tree of looked)
        if (!moving.has(tree) && (Math.abs(tx(tree) - source.x) >= near || Math.abs(ty(tree) - source.y) >= near))
          strays++;
      most = Math.max(most, looked.size);
      if (looked.size > 0) looking++;
    }
    expect(sway.count).toBeGreaterThan(20);
    // every step looked, so what it looked at was watched, and no tree it looked at stood out past the squares round
    // the hub unless it was moving already
    expect(looking).toBe(600);
    expect(strays, `trees looked at out past the squares round the hub, of ${most} at the most in one go`).toBe(0);
    // so a step costs the trees near it, even in the thickest wood, and not the island's thousands
    expect(most).toBeGreaterThan(wood.trees);
    expect(most).toBeLessThan(treeCount / 10);
  });
});
