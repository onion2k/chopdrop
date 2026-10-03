/**
 * The tank and the water it is filled from and emptied on, held to its edges on numbers: the scoop is the skids within
 * 1.5 m of open water, at 8 m/s or more, for 2 s, and not landed; open water is a lake or the sea, and never a river;
 * and a drop is the helicopter's middle within the splash across of a burning patch and its skids within 25 m of the
 * ground. Without these the player could fill a tank on a river or from a hover, or drop from the clouds.
 */
import { describe, expect, it } from 'vitest';
import { FIRES, theIsland } from '../src/arena';
import { Fire } from '../src/fire';
import { Game } from '../src/game';
import { DROP, NO_WATER, OpenWater, SCOOP, Tank, inDrop, inScoop } from '../src/water';
import { DT } from './helpers';

const island = theIsland();
const water = new OpenWater(island);
const across = island.terrain.cols - 1;
const squareAt = (x: number, y: number) =>
  Math.floor((y - island.terrain.originY) / island.terrain.cell) * across +
  Math.floor((x - island.terrain.originX) / island.terrain.cell);

describe('the scoop window', () => {
  const up = (z: number, landed = false) => ({ z, landed });

  it('says its numbers once: 1.5 m, 8 m/s and 2 s', () => {
    expect(SCOOP).toEqual({ low: 1.5, speed: 8, time: 2 });
  });

  it('is the skids within 1.5 m of the water: 1.4 in, 1.6 out', () => {
    expect(inScoop(up(30 + 1.4), 30, 10)).toBe(true);
    expect(inScoop(up(30 + 1.5), 30, 10)).toBe(true);
    expect(inScoop(up(30 + 1.6), 30, 10)).toBe(false);
    // and at the sea's own level, where the sum is exact
    expect(inScoop(up(1.5), 0, 10)).toBe(true);
    expect(inScoop(up(1.6), 0, 10)).toBe(false);
  });

  it('is 8 m/s or more across the ground: 7.9 out, 8.1 in', () => {
    expect(inScoop(up(1), 0, 7.9)).toBe(false);
    expect(inScoop(up(1), 0, 8)).toBe(true);
    expect(inScoop(up(1), 0, 8.1)).toBe(true);
  });

  it('is not landed, though the skids are within reach of the water and it is fast', () => {
    expect(inScoop(up(0, true), 0, 12)).toBe(false);
  });

  it('is nothing where there is no water', () => {
    expect(inScoop(up(0.5), NO_WATER, 12)).toBe(false);
  });
});

describe('open water', () => {
  const [first] = island.lakes;

  it('is mapped once an island, and every game on that island reads the same map', () => {
    // a game is built by the thousand in the tests, and the map is as big as the island's grid: built again for each,
    // it tripled what a game cost to build and made the camera's tests four times slower
    const one = new Game(),
      two = new Game();
    expect(one.island).toBe(two.island);
    expect(one.water).toBe(two.water);
  });

  it('is a lake, at its level', () => {
    for (const lake of island.lakes)
      expect(water.levelAt(lake.x, lake.y), `lake at ${lake.x}`).toBeCloseTo(lake.level, 4);
  });

  it('is the sea, at the sea level', () => {
    // the grid's corner is open sea, far from any shore
    const { minX, minY } = island.bounds;
    expect(island.sea[squareAt(minX + 20, minY + 20)]).not.toBe(0);
    expect(water.levelAt(minX + 20, minY + 20)).toBe(island.seaLevel);
  });

  it('is not dry land, and not beyond the grid', () => {
    const home = island.pads[0];
    expect(water.levelAt(home.x, home.y)).toBe(NO_WATER);
    expect(water.levelAt(1e6, 0)).toBe(NO_WATER);
    expect(water.levelAt(0, -1e6)).toBe(NO_WATER);
  });

  it('is never a river: every point along a river that is not a lake or the sea has none', () => {
    const lakeSquares = new Set(island.lakes.flatMap((l) => [...l.squares]));
    let tried = 0;
    for (const river of island.rivers)
      for (let k = 0; k < river.points.length; k += 4) {
        const [x, y] = [river.points[k], river.points[k + 1]];
        const sq = squareAt(x, y);
        if (lakeSquares.has(sq) || island.sea[sq] !== 0) continue;
        expect(water.levelAt(x, y), `river at ${x.toFixed(0)}, ${y.toFixed(0)}`).toBe(NO_WATER);
        tried++;
      }
    // there is a river to try, or this holds of nothing
    expect(tried).toBeGreaterThan(50);
  });

  it('finds the nearest, which is open water, and as near as any square of it by looking at them all', () => {
    const out = { x: 0, y: 0, z: 0 };
    for (const [x, y] of [
      [0, 0],
      [-300, 100],
      [200, 200],
      [first.x + 400, first.y],
    ]) {
      expect(water.nearest(x, y, out), `from ${x}, ${y}`).toBe(true);
      expect(Number.isFinite(water.levelAt(out.x, out.y)), 'a point on water').toBe(true);
      expect(out.z).toBe(water.levelAt(out.x, out.y));
      // by looking at every square there is
      const { cell, originX, originY } = island.terrain;
      let best = Infinity;
      for (let sq = 0; sq < island.sea.length; sq++) {
        const cx = originX + ((sq % across) + 0.5) * cell,
          cy = originY + (Math.floor(sq / across) + 0.5) * cell;
        if (!Number.isFinite(water.levelAt(cx, cy))) continue;
        best = Math.min(best, Math.hypot(cx - x, cy - y));
      }
      // the answer is a square's middle, so within a square's diagonal of what the squares' middles say
      expect(Math.hypot(out.x - x, out.y - y), `from ${x}, ${y}`).toBeLessThanOrEqual(best + cell * Math.SQRT2);
    }
  });
});

describe('the tank', () => {
  /** A helicopter 1 m over the water at 10 m/s. */
  const skimming = { z: 1, landed: false, speed: 10 };
  const fill = (tank: Tank, seconds: number, h = skimming, level = 0) => {
    let filled = false;
    for (let f = 0, n = Math.round(seconds / DT); f < n; f++) filled = tank.step(DT, h, level) || filled;
    return filled;
  };

  it('starts empty and not filling', () => {
    const tank = new Tank();
    expect([tank.full, tank.filling]).toEqual([false, 0]);
  });

  it('fills after 2 s in the window: not at 1.9, full at 2.1, and says so once', () => {
    const tank = new Tank();
    expect(fill(tank, 1.9)).toBe(false);
    expect(tank.full).toBe(false);
    expect(tank.filling).toBeCloseTo(1.9, 6);
    expect(fill(tank, 0.2)).toBe(true);
    expect(tank.full).toBe(true);
    expect(tank.filling).toBe(0);
    // full, it says nothing more of it however long it skims
    expect(fill(tank, 3)).toBe(false);
    expect(tank.full).toBe(true);
  });

  it('keeps filling short of the time, so the gauge never reads a full scoop', () => {
    const tank = new Tank();
    for (let f = 0; f < 119; f++) tank.step(DT, skimming, 0);
    expect(tank.filling).toBeLessThan(SCOOP.time);
    expect(tank.full).toBe(false);
  });

  it('starts again if the window is left, at any edge: too high, too slow, landed, or off the water', () => {
    for (const leave of [
      { z: 1.6, landed: false, speed: 10 },
      { z: 1, landed: false, speed: 7.9 },
      { z: 0, landed: true, speed: 10 },
    ]) {
      const tank = new Tank();
      fill(tank, 1.5);
      expect(tank.filling).toBeGreaterThan(1.4);
      fill(tank, 0.1, leave);
      expect(tank.filling, JSON.stringify(leave)).toBe(0);
      // and the 1.5 s before is not remembered: 1.9 more is not enough
      expect(fill(tank, 1.9)).toBe(false);
    }
    const tank = new Tank();
    fill(tank, 1.5);
    for (let f = 0; f < 3; f++) tank.step(DT, skimming, NO_WATER);
    expect(tank.filling).toBe(0);
    expect(fill(tank, 1.9)).toBe(false);
  });

  it('is emptied by a drop, and can be filled again', () => {
    const tank = new Tank();
    fill(tank, 2.1);
    expect(tank.full).toBe(true);
    tank.drop();
    expect([tank.full, tank.filling]).toEqual([false, 0]);
    expect(fill(tank, 2.1)).toBe(true);
  });
});

describe('the drop window', () => {
  const patch = { x: 100, y: 50, z: 40 };
  const flat = () => 40;
  const at = (across: number, up: number) => ({ x: patch.x + across, y: patch.y, z: 40 + up });

  it('says its numbers once: 25 m and 12 m', () => {
    expect(DROP).toEqual({ high: 25, splash: 12 });
  });

  it('is the skids within 25 m of the ground: 24.9 in, 25.1 out', () => {
    expect(inDrop(at(0, 24.9), patch, flat)).toBe(true);
    expect(inDrop(at(0, 25), patch, flat)).toBe(true);
    expect(inDrop(at(0, 25.1), patch, flat)).toBe(false);
  });

  it('is the middle within the splash across of the patch: 11.9 in, 12.1 out', () => {
    expect(inDrop(at(11.9, 10), patch, flat)).toBe(true);
    expect(inDrop(at(12.1, 10), patch, flat)).toBe(false);
    expect(inDrop({ x: patch.x + 8.5, y: patch.y + 8.5, z: 50 }, patch, flat)).toBe(false);
  });

  it('measures the height over the ground under the helicopter, not under the patch', () => {
    const slope = (x: number) => 40 + (x - patch.x);
    expect(inDrop({ x: patch.x + 10, y: patch.y, z: 40 + 10 + 24 }, patch, slope)).toBe(true);
    expect(inDrop({ x: patch.x + 10, y: patch.y, z: 40 + 10 + 26 }, patch, slope)).toBe(false);
  });

  it('is a drop on a fire only where a patch is burning in reach: a burnt one, or none, keeps the water', () => {
    const fire = new Fire(FIRES[0]);
    const [p] = FIRES[0].patches;
    const over = { x: p.x, y: p.y, z: p.z + 10 };
    expect(fire.dropReaches(over, () => p.z)).toBe(true);
    // over ground with no fire
    expect(fire.dropReaches({ x: 0, y: 0, z: 100 }, () => 50)).toBe(false);
    // over a patch that is out
    fire.douse(p.x, p.y);
    expect(fire.dropReaches(over, () => p.z)).toBe(false);
  });
});
