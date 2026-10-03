/**
 * The tank and the water it is filled from and emptied on, held to its edges on numbers: the bucket put out, its bottom
 * under the surface of open water, for 2 s fills it, at any speed; open water is a lake or the sea, and never a river;
 * every water, a river too, is one the helicopter holds a hover over and never lands on; and a drop is the
 * helicopter's middle within the splash across of a burning patch with the bucket out and full, its skids within 25 m
 * of the ground. Without these the player could fill a bucket on a river or with it stowed, land in a lake, or drop
 * from the clouds.
 */
import { describe, expect, it } from 'vitest';
import { FIRES, LEVELS, theIsland } from '../src/arena';
import { BUCKET, bucketInWater } from '../src/bucket';
import { Fire } from '../src/fire';
import { Game } from '../src/game';
import { HOVER_LIFT, HOVER_OVER_WATER } from '../src/helicopter';
import { seeded } from '../src/random';
import { DROP, NO_WATER, OpenWater, SCOOP, Tank, Waters, inDrop, watersOf } from '../src/water';
import { DT, waterSpots } from './helpers';

const island = theIsland();
const water = new OpenWater(island);
const across = island.terrain.cols - 1;
const squareAt = (x: number, y: number) =>
  Math.floor((y - island.terrain.originY) / island.terrain.cell) * across +
  Math.floor((x - island.terrain.originX) / island.terrain.cell);

describe('the fill', () => {
  it('says its time once: 2 s, and nothing of how high or how fast, which no longer matter', () => {
    expect(SCOOP).toEqual({ time: 2 });
  });

  it('is the bucket in the water when its bottom is under the surface: 0.1 over is out, 0.1 under is in', () => {
    expect(bucketInWater(30 + 0.1, 30)).toBe(false);
    expect(bucketInWater(30, 30)).toBe(false);
    expect(bucketInWater(30 - 0.1, 30)).toBe(true);
    expect(bucketInWater(30 - 0.1, NO_WATER)).toBe(false);
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
  const fill = (tank: Tank, seconds: number, submerged = true) => {
    let filled = false;
    for (let f = 0, n = Math.round(seconds / DT); f < n; f++) filled = tank.step(DT, submerged) || filled;
    return filled;
  };

  it('starts empty and not filling', () => {
    const tank = new Tank();
    expect([tank.full, tank.filling]).toEqual([false, 0]);
  });

  it('fills after 2 s in the water: not at 1.9, full at 2.1, and says so once', () => {
    const tank = new Tank();
    expect(fill(tank, 1.9)).toBe(false);
    expect(tank.full).toBe(false);
    expect(tank.filling).toBeCloseTo(1.9, 6);
    expect(fill(tank, 0.2)).toBe(true);
    expect(tank.full).toBe(true);
    expect(tank.filling).toBe(0);
    // full, it says nothing more of it however long it is held in the water
    expect(fill(tank, 3)).toBe(false);
    expect(tank.full).toBe(true);
  });

  it('keeps filling short of the time, so the gauge never reads a full fill', () => {
    const tank = new Tank();
    for (let f = 0; f < 119; f++) tank.step(DT, true);
    expect(tank.filling).toBeLessThan(SCOOP.time);
    expect(tank.full).toBe(false);
  });

  it('starts again when the bucket leaves the water, and the 1.5 s before is not remembered', () => {
    const tank = new Tank();
    fill(tank, 1.5);
    expect(tank.filling).toBeGreaterThan(1.4);
    fill(tank, 0.1, false);
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

describe('the bucket in the water, in the game', () => {
  const spots = waterSpots();
  const { lake, river } = spots;
  const NONE = { forward: 0, turn: 0, lift: HOVER_LIFT };

  /** A game with the helicopter hovering at `z` over (x, y), the bucket out or in. */
  function hovering(x: number, y: number, z: number, out: boolean) {
    const game = new Game({ random: seeded(1) });
    game.setBucket(out);
    game.helicopter.place(x, y, z, 0);
    return game;
  }
  const hold = (game: Game, seconds: number) => {
    for (let f = 0, n = Math.round(seconds / DT); f < n; f++) game.step(DT, NONE);
  };
  /** The height at which the bucket's bottom is `by` over the surface of the water at `level`. */
  const bottomAt = (level: number, by: number) => level + BUCKET.line + BUCKET.height + by;

  it('is in, to begin with, and is put out and taken in and toggled, whatever is going', () => {
    const game = new Game({ random: seeded(1) });
    expect(game.bucket.out).toBe(false);
    game.setBucket(true);
    expect(game.bucket.out).toBe(true);
    game.toggleBucket();
    expect(game.bucket.out).toBe(false);
    game.toggleBucket();
    expect(game.bucket.out).toBe(true);
    game.begin('first-delivery');
    expect(game.bucket.out).toBe(true);
    game.abandon();
    game.begin(FIRES[0].id);
    game.home();
    expect(game.bucket.out).toBe(true);
    game.setBucket(false);
    game.begin('ring-trial');
    expect(game.bucket.out).toBe(false);
  });

  it('fills after 2 s with the bucket out and in a lake: not at 1.9 s, full at 2.1 s, told once', () => {
    const told: string[] = [];
    const game = new Game({ random: seeded(1), events: { scooped: () => told.push('scooped') } });
    game.setBucket(true);
    game.helicopter.place(lake.x, lake.y, lake.level + HOVER_OVER_WATER, 0);
    hold(game, 1.9);
    expect(game.tank.full).toBe(false);
    expect(game.tank.filling).toBeGreaterThan(1.8);
    hold(game, 0.2);
    expect(game.tank.full).toBe(true);
    expect(told).toEqual(['scooped']);
    hold(game, 3);
    expect(told).toEqual(['scooped']);
  });

  it('fills at any speed, a hover or a skim, since it is only the bucket in the water', () => {
    for (const speed of [0, 10]) {
      const game = hovering(lake.x, lake.y, lake.level + HOVER_OVER_WATER, true);
      game.helicopter.vx = speed;
      for (let f = 0; f < 130 && !game.tank.full; f++) game.step(DT, { ...NONE, forward: speed > 0 ? 0.4 : 0 });
      expect(game.tank.full, `at ${speed}`).toBe(true);
    }
  });

  it('has its bottom at the surface to within 0.1: 0.1 over never fills, 0.1 under fills', () => {
    const over = hovering(lake.x, lake.y, bottomAt(lake.level, 0.1), true);
    hold(over, 6);
    expect([over.tank.filling, over.tank.full]).toEqual([0, false]);
    const under = hovering(lake.x, lake.y, bottomAt(lake.level, -0.1), true);
    hold(under, 2.1);
    expect(under.tank.full).toBe(true);
  });

  it('starts the fill again when the bucket is lifted out of the water', () => {
    const game = hovering(lake.x, lake.y, lake.level + HOVER_OVER_WATER, true);
    hold(game, 1.5);
    expect(game.tank.filling).toBeGreaterThan(1.4);
    game.helicopter.place(lake.x, lake.y, bottomAt(lake.level, 5), 0);
    hold(game, 0.1);
    expect(game.tank.filling).toBe(0);
    game.helicopter.place(lake.x, lake.y, lake.level + HOVER_OVER_WATER, 0);
    hold(game, 1.9);
    expect(game.tank.full).toBe(false);
  });

  it('is never filled with the bucket in', () => {
    const game = hovering(lake.x, lake.y, lake.level + HOVER_OVER_WATER, false);
    hold(game, 10);
    expect([game.tank.filling, game.tank.full]).toEqual([0, false]);
  });

  it('is taken in part way, and the fill is lost; a full bucket taken in keeps its water', () => {
    const game = hovering(lake.x, lake.y, lake.level + HOVER_OVER_WATER, true);
    hold(game, 1);
    game.setBucket(false);
    hold(game, 0.1);
    expect(game.tank.filling).toBe(0);
    game.setBucket(true);
    hold(game, 2.1);
    expect(game.tank.full).toBe(true);
    game.setBucket(false);
    hold(game, 1);
    expect(game.tank.full).toBe(true);
  });

  it('is never filled from a river, with the bucket out and in it', () => {
    const game = hovering(river.x, river.y, river.level + HOVER_OVER_WATER, true);
    hold(game, 10);
    expect(game.helicopter.overWater).toBe(true);
    expect([game.tank.filling, game.tank.full]).toEqual([0, false]);
  });

  it('is filled by a helicopter let down onto a lake, whose hover has the bucket in it, which the line of 5 m shortens to', () => {
    const game = new Game({ random: seeded(1) });
    game.setBucket(true);
    game.helicopter.placeAbove(lake.x, lake.y, 40, 0);
    for (let f = 0; f < 60 * 12; f++) game.step(DT, { forward: 0, turn: 0, lift: -1 });
    expect(game.helicopter.z).toBeCloseTo(lake.level + HOVER_OVER_WATER, 3);
    const b = game.bucket;
    expect(b.hung).toBe(true);
    expect(b.bottom).toBeLessThan(lake.level);
    expect(game.tank.full).toBe(true);
  });

  it('is never filled with the bucket stowed on land, whatever is under it', () => {
    const game = new Game({ random: seeded(1) });
    game.setBucket(true);
    hold(game, 5);
    expect([game.tank.filling, game.tank.full]).toEqual([0, false]);
  });

  it('is dropped only with the bucket out and full', () => {
    const [p] = FIRES[0].patches;
    const drops: string[] = [];
    const game = new Game({ random: seeded(1), events: { dropped: (fire) => drops.push(fire) } });
    game.tank.full = true;
    game.helicopter.place(p.x, p.y, p.z + 15, 0);
    hold(game, 0.5);
    expect([game.tank.full, drops]).toEqual([true, []]);
    game.setBucket(true);
    hold(game, 0.1);
    expect([game.tank.full, drops]).toEqual([false, [FIRES[0].id]]);
  });

  it('begins a fire level by the first drop that hits, with the bucket out', () => {
    const [p] = FIRES[0].patches;
    const game = new Game({ random: seeded(1) });
    game.setBucket(true);
    game.tank.full = true;
    game.helicopter.place(p.x, p.y, p.z + 15, 0);
    hold(game, 0.1);
    expect(game.mission.level?.id).toBe(FIRES[0].id);
  });

  it('is read by the game as the bucket in the water, one rule for the fill and the scene: hung and bottom under the surface', () => {
    const game = hovering(lake.x, lake.y, lake.level + HOVER_OVER_WATER, true);
    hold(game, 0.1);
    expect(game.bucket.hung).toBe(true);
    expect(bucketInWater(game.bucket.bottom, game.water.surfaceAt(lake.x, lake.y))).toBe(true);
  });

  it('has a level to drop on for each fire', () => {
    expect(LEVELS.filter((l) => l.kind === 'fire')).toHaveLength(FIRES.length);
  });
});

describe('every water, a river too', () => {
  const waters = watersOf(island);
  const spots = waterSpots();

  it('is mapped once an island, as open water is, and the same map for every game', () => {
    expect(watersOf(island)).toBe(waters);
    expect(new Game().waters).toBe(waters);
    expect(waters).toBeInstanceOf(Waters);
  });

  it('is a lake, the sea or a river at its own level: a river at its surface, which the open water leaves out', () => {
    expect(waters.levelAt(spots.lake.x, spots.lake.y)).toBeCloseTo(spots.lake.level, 4);
    expect(waters.levelAt(spots.sea.x, spots.sea.y)).toBe(island.seaLevel);
    const { x, y, level } = spots.river;
    expect(waters.levelAt(x, y)).toBeCloseTo(level, 1);
    expect(water.levelAt(x, y)).toBe(NO_WATER);
  });

  it('reads a river by its half width, the fourth float of each point: the squares whose middles are within it are water, and the square of every point is, for the narrowest too', () => {
    const { cell, originX, originY } = island.terrain;
    let tried = 0;
    for (const { points } of island.rivers)
      for (let k = 0; k < points.length; k += 4) {
        const [px, py, half] = [points[k], points[k + 1], points[k + 3]];
        expect(waters.levelAt(px, py), `river at ${px.toFixed(0)}`).not.toBe(NO_WATER);
        // the middles of the squares round it, a half width out at the most (and a little in, since the width moves along a run)
        const span = Math.ceil(half / cell) + 1;
        for (let dj = -span; dj <= span; dj++)
          for (let di = -span; di <= span; di++) {
            const mx = originX + (Math.floor((px - originX) / cell) + di + 0.5) * cell,
              my = originY + (Math.floor((py - originY) / cell) + dj + 0.5) * cell;
            if (Math.hypot(mx - px, my - py) > half * 0.5) continue;
            expect(waters.levelAt(mx, my), `${half.toFixed(1)} wide at ${px.toFixed(0)}, ${py.toFixed(0)}`).not.toBe(
              NO_WATER,
            );
          }
        tried++;
      }
    expect(tried).toBeGreaterThan(50);
  });

  it('is nothing on dry land, and not beyond the grid', () => {
    const home = island.pads[0];
    expect(waters.levelAt(home.x, home.y)).toBe(NO_WATER);
    expect(waters.surfaceAt(home.x, home.y)).toBe(NO_WATER);
    expect(waters.levelAt(1e6, 0)).toBe(NO_WATER);
    expect(waters.surfaceAt(0, -1e6)).toBe(NO_WATER);
  });

  it('is never under a pad: a pad is dry land, and so are its rim and a helicopter landed on it', () => {
    for (const pad of island.pads)
      for (const [dx, dy] of [
        [0, 0],
        [pad.radius, 0],
        [-pad.radius, 0],
        [0, pad.radius],
        [0, -pad.radius],
      ])
        expect(waters.surfaceAt(pad.x + dx, pad.y + dy), `pad at ${pad.x.toFixed(0)}`).toBe(NO_WATER);
  });

  it('is told a beach from water by the island: a square of the shallows whose ground is above its water is dry', () => {
    const { beach } = spots;
    expect(island.sea[squareAt(beach.x, beach.y)]).not.toBe(0);
    expect(waters.levelAt(beach.x, beach.y)).toBe(island.seaLevel);
    expect(waters.surfaceAt(beach.x, beach.y)).toBe(NO_WATER);
    expect(water.surfaceAt(beach.x, beach.y)).toBe(NO_WATER);
    // and the sea beside it is water
    expect(waters.surfaceAt(spots.sea.x, spots.sea.y)).toBe(island.seaLevel);
    expect(water.surfaceAt(spots.sea.x, spots.sea.y)).toBe(island.seaLevel);
  });

  it('has a lake as the open water has it', () => {
    for (const lake of island.lakes) expect(waters.surfaceAt(lake.x, lake.y)).toBeCloseTo(lake.level, 4);
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
