/**
 * What the game costs a player, held to a budget and to what it cost
 * before: how long it takes to boot, what a frame costs to draw at the
 * standard view, and how much is downloaded. The budget is what a good
 * browser game may cost at all; the baseline is what this one cost at the
 * last commit, so a step toward the budget is noticed as much as a step
 * over it.
 *
 *   npm run perf               the figures, held to smoke/perf-baseline.json and the budget
 *   npm run perf:update        the baseline written again, after a change meant to move it
 *
 * The boot and the frame are this machine's, headless on its own GPU, and
 * both wobble from run to run; the tolerances were set by running it several
 * times first, and the frame is the least of many samples. The download is
 * the built bundle, gzipped, and does not wobble at all, so it is held to the
 * byte. How each is judged is in `judging.ts`, with its tests.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { LEVELS } from '../src/arena';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import type { Ring } from '../src/mission';
import { COLLECTIBLES, PACKAGES } from '../src/arena';
import { SLOW_CLIMB, WOOD, standardView, start, watch } from './game';
import { DROP_HEIGHT, EDGE, WEST, hoverOver, sceneSpray, scoop, settle } from './fire';
import { moved as hasMoved, type Figures } from './judging';

const BASELINE = 'smoke/perf-baseline.json';
/** What the game may cost at all, on this machine, whatever it cost before. */
export const BUDGET = { bootMs: 3000, frameMs: 8, bundleBytes: 400 * 1024 };

/** The built game's download: every script and stylesheet in dist/, gzipped, in bytes. */
function bundleBytes(): number {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'silent'], { stdio: 'ignore' });
  const dir = 'dist/assets';
  let bytes = 0;
  for (const f of readdirSync(dir)) {
    if (!/\.(js|css)$/.test(f)) continue;
    if (!statSync(join(dir, f)).isFile()) continue;
    bytes += gzipSync(readFileSync(join(dir, f))).length;
  }
  return bytes;
}

test('boots, draws and downloads within budget, and as it did before', async ({ page }, info) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  const bundle = bundleBytes();
  await start(page, { seed: 11, paused: true });
  const boot = await page.evaluate(() => window.game!.bootMs);
  // the standard view: the island settled, seen from the look picture's camera
  await standardView(page);
  // the first measuring on a page just booted: it keeps the GPU drawing for a quarter of a second before it times
  const frame = await page.evaluate(() => window.game!.measureFrame());
  // the view a player has: told, not held, since it moves with the flight and has no baseline to be held to
  const chaseFrame = await page.evaluate(async () => {
    const g = window.game!;
    g.chase();
    g.step(1);
    return g.measureFrame(50);
  });
  const chaseMs = Math.round(chaseFrame * 1000) / 1000;
  info.annotations.push({ type: 'perf-chase', description: `${chaseMs} ms, not held to the baseline or the budget` });
  console.log(`perf: chase view frame ${chaseMs} ms (not held)`);
  // hovering low in a wood, the trees round it bowed: the frame that writes the trees as well as drawing them
  const washFrame = await page.evaluate(
    async ([w, hover]) => {
      const g = window.game!;
      g.teleport(w.x, w.y, 4, 0);
      g.fly(0, 0, hover);
      g.step(150);
      g.release();
      return g.measureFrame(50);
    },
    [WOOD, HOVER_LIFT] as const,
  );
  const washMs = Math.round(washFrame * 1000) / 1000;
  info.annotations.push({ type: 'perf-downwash', description: `${washMs} ms, not held to the baseline or the budget` });
  console.log(`perf: downwash view frame ${washMs} ms (not held)`);
  // a start: the trial's first ring with its flag, the other start in the distance and crates on pads, as a player sees
  // them from the chase camera; the frame the free-roam marks add to, told and not held
  const trial = LEVELS.find((l) => l.id === 'ring-trial')!.steps[0] as Ring;
  const startFrame = await page.evaluate(
    async ([r, middle]) => {
      const g = window.game!;
      const [x, y] = [r.x - Math.cos(r.yaw) * 45, r.y - Math.sin(r.yaw) * 45];
      g.teleport(x, y, r.z - middle - g.floorAt(x, y), r.yaw);
      g.chase();
      g.step(1);
      return g.measureFrame(50);
    },
    [trial, HELICOPTER.size.middle] as const,
  );
  const startMs = Math.round(startFrame * 1000) / 1000;
  info.annotations.push({ type: 'perf-start', description: `${startMs} ms, not held to the baseline or the budget` });
  console.log(`perf: start view frame ${startMs} ms (not held)`);
  const now: Figures = { bootMs: Math.round(boot), frameMs: Math.round(frame * 1000) / 1000, bundleBytes: bundle };
  info.annotations.push({ type: 'perf', description: JSON.stringify(now) });
  console.log(
    `perf: boot ${now.bootMs} ms, frame ${now.frameMs} ms, download ${now.bundleBytes} bytes (${(now.bundleBytes / 1024).toFixed(1)} kB)`,
  );

  if (process.env.PERF_UPDATE) {
    writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
    console.log('perf baseline written');
  } else {
    let baseline: Partial<Figures> = {};
    try {
      baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Partial<Figures>;
    } catch {
      throw new Error('no baseline: run npm run perf:update first');
    }
    const moved: string[] = [];
    for (const key of ['bootMs', 'frameMs', 'bundleBytes'] as const) {
      const was = baseline[key];
      if (was === undefined) {
        moved.push(`${key} ${now[key]} (not in the baseline)`);
        continue;
      }
      const out = hasMoved(key, was, now[key]);
      console.log(`  ${key}: ${was} -> ${now[key]} (${out ? 'MOVED' : 'within tolerance'})`);
      if (out) moved.push(`${key} ${was} -> ${now[key]}`);
    }
    expect(moved, 'moved from the baseline: if that was meant, npm run perf:update, and say why').toEqual([]);
  }
  expect(now.bootMs, 'boot within budget').toBeLessThanOrEqual(BUDGET.bootMs);
  expect(now.frameMs, 'frame within budget').toBeLessThanOrEqual(BUDGET.frameMs);
  expect(now.bundleBytes, 'download within budget').toBeLessThanOrEqual(BUDGET.bundleBytes);
  expect(problems).toEqual([]);
});

test('a view at a pair of towers with all seven structures collected: the frame told, not held', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, {
    seed: 11,
    paused: true,
    save: { best: {}, collected: COLLECTIBLES.map((c) => c.id) },
  });
  const gate = COLLECTIBLES.find((c) => c.id === 'shoulder-towers')!.opening;
  const gold = await page.evaluate(
    async ([g, middle]) => {
      const game = window.game!;
      const [x, y] = [g.x - Math.cos(g.yaw) * 70, g.y - Math.sin(g.yaw) * 70];
      game.teleport(x, y, g.z + 8 - middle - game.floorAt(x, y), g.yaw);
      game.chase();
      game.step(1);
      return { gold: game.state().gold, ms: await game.measureFrame(50) };
    },
    [gate, HELICOPTER.size.middle] as const,
  );
  // every tower and every rail has its gold, so the pool is written in full and is in the frame
  expect(gold.gold).toBe(
    COLLECTIBLES.flatMap((c) => c.blocks).reduce((n, b) => n + (b.kind === 'tower' ? 1 : b.kind === 'deck' ? 2 : 0), 0),
  );
  const ms = Math.round(gold.ms * 1000) / 1000;
  info.annotations.push({ type: 'perf-collected', description: `${ms} ms, not held to the baseline or the budget` });
  console.log(`perf: collected view frame ${ms} ms (not held)`);
  expect(problems).toEqual([]);
});

test('a view over a wood with a package in it, and the radar badge pulsing: the frames told, not held', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  const pack = PACKAGES.find((p) => p.id === 'lake-east-wood')!;
  // the chase camera behind the helicopter hovering 40 m short of the crate, which is in view: the frame with the crate
  // pool in it, and the radar hearing it
  const wood = await page.evaluate(
    async ([p, hover]) => {
      const g = window.game!;
      const yaw = 0.9;
      g.chase();
      g.teleport(p.x - Math.cos(yaw) * 40, p.y - Math.sin(yaw) * 40, 22, yaw);
      g.fly(0, 0, hover);
      g.step(40);
      g.release();
      return { crates: g.state().crates, badge: g.state().radar.badge, ms: await g.measureFrame(50) };
    },
    [pack, HOVER_LIFT] as const,
  );
  expect(wood.crates).toBe(10);
  expect(wood.badge).toBe('heard');
  const woodMs = Math.round(wood.ms * 1000) / 1000;
  info.annotations.push({ type: 'perf-package', description: `${woodMs} ms, not held to the baseline or the budget` });
  console.log(`perf: wood with a package view frame ${woodMs} ms (not held)`);
  // the badge pulsing: the page's own frame, stepped and drawn with its HUD, timed one at a time at 95 m from the crate,
  // where a ring lives about three quarters of the time and the rest is quiet between them, and told apart by whether
  // a ring was out on that frame; the same place and view throughout, so the difference is what the badge's writes cost
  // the page's thread, and the GPU's frame is the same in both
  const timed = await page.evaluate(
    ([p, hover]) => {
      const g = window.game!;
      const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      g.teleport(p.x + 95, p.y, 25, 0);
      g.chase();
      g.fly(0, 0, hover);
      g.step(60);
      const ring: number[] = [],
        idle: number[] = [];
      for (let f = 0; f < 1200; f++) {
        const t = performance.now();
        g.step(1);
        const ms = performance.now() - t;
        (g.state().radar.step > 0 ? ring : idle).push(ms);
      }
      g.release();
      return { ring: median(ring), idle: median(idle), rings: ring.length, idles: idle.length };
    },
    [pack, HOVER_LIFT] as const,
  );
  expect(timed.rings, 'frames with a ring out').toBeGreaterThan(100);
  expect(timed.idles, 'frames between rings').toBeGreaterThan(100);
  const [ringMs, idleMs] = [timed.ring, timed.idle].map((v) => Math.round(v * 1000) / 1000);
  info.annotations.push({
    type: 'perf-badge',
    description: `${ringMs} ms a stepped frame with a ring out, ${idleMs} ms between rings, not held`,
  });
  console.log(
    `perf: badge pulsing, a stepped frame ${ringMs} ms with a ring out, ${idleMs} ms between rings (not held)`,
  );
  expect(problems).toEqual([]);
});

test('a view over the western wood with a person and smoke in it, and the winch out: the frames told, not held', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  // the chase camera behind the helicopter hovering short of the walker, who and whose smoke are in view
  const waiting = await page.evaluate(
    async ([hover]) => {
      const g = window.game!;
      const w = g.content().rescues.find((r) => r.id === 'wood-rescue')!;
      const yaw = 0.9;
      g.chase();
      g.teleport(w.x - Math.cos(yaw) * 40, w.y - Math.sin(yaw) * 40, 22, yaw);
      g.fly(0, 0, hover);
      g.step(40);
      g.release();
      const s = g.state();
      return { people: s.people, smoke: s.smoke, rope: s.rope, ms: await g.measureFrame(50) };
    },
    [HOVER_LIFT] as const,
  );
  expect([waiting.people, waiting.smoke, waiting.rope]).toEqual([3, 3, false]);
  // the winch part way: the rope written every frame, the person on it, and the smoke out
  const winching = await page.evaluate(
    async ([hover]) => {
      const g = window.game!;
      const w = g.content().rescues.find((r) => r.id === 'wood-rescue')!;
      g.teleport(w.x, w.y, 10, 0.9);
      g.fly(0, 0, hover);
      g.step(90);
      g.release();
      const s = g.state();
      return { rope: s.rope, smoke: s.smoke, share: s.winch.share, ms: await g.measureFrame(50) };
    },
    [HOVER_LIFT] as const,
  );
  expect([winching.rope, winching.smoke]).toEqual([true, 2]);
  const [waitMs, winchMs] = [waiting.ms, winching.ms].map((v) => Math.round(v * 1000) / 1000);
  info.annotations.push({
    type: 'perf-rescue',
    description: `${waitMs} ms waiting, ${winchMs} ms winching, not held to the baseline or the budget`,
  });
  console.log(`perf: rescue view frame ${waitMs} ms waiting, ${winchMs} ms winching (not held)`);
  expect(problems).toEqual([]);
});

test('a view over the west fire, every patch burning and then a drop pouring on it, the flames and smoke at their most: the frames told, not held', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await settle(page, 60);
  // the tank filled and the level begun with it full, the helicopter held well off, so the fire spreads while it waits
  // and the water is kept: ten patches lit at the start, one more every eight seconds, all twenty by a minute and a half
  await scoop(page);
  const yaw = 0.9;
  await page.evaluate(
    ([id, x, y, hover]) => {
      const g = window.game!;
      g.begin(id);
      g.chase();
      g.teleport(x, y, 26, 0.9);
      g.fly(0, 0, hover);
      g.step(5700);
    },
    [WEST.id, WEST.x - Math.cos(yaw) * 70, WEST.y - Math.sin(yaw) * 70, HOVER_LIFT] as const,
  );
  await settle(page, 400);
  const all = await page.evaluate(async () => {
    const g = window.game!;
    const s = g.state();
    return { burning: s.fires[0].burning, full: s.tank.full, live: s.particles.live, ms: await g.measureFrame(50) };
  });
  expect([all.burning, all.full], 'every patch burning, the water still in the tank').toEqual([20, true]);
  // the drop on the fire's edge, and the frame while it pours: the spray and the mist over what is left burning
  await hoverOver(page, EDGE.x, EDGE.y, DROP_HEIGHT, yaw, 3);
  const pouring = await page.evaluate(async (climb) => {
    const g = window.game!;
    const s = g.state();
    g.fly(0, 0, climb);
    return {
      burning: s.fires[0].burning,
      spray: s.particles.spray,
      live: s.particles.live,
      ms: await g.measureFrame(4),
    };
  }, SLOW_CLIMB);
  await page.evaluate(() => window.game!.release());
  expect(pouring.spray, 'a drop pouring').toBeGreaterThan(0);
  expect(pouring.burning, 'part of the fire put out').toBeLessThan(20);
  expect((await page.evaluate(() => window.game!.state())).particles.refused).toBe(0);
  const [allMs, pourMs] = [all.ms, pouring.ms].map((v) => Math.round(v * 1000) / 1000);
  info.annotations.push({
    type: 'perf-fire',
    description: `${allMs} ms with 20 patches burning (${all.live} live), ${pourMs} ms pouring with ${pouring.burning} burning (${pouring.live} live); not held to the baseline or the budget`,
  });
  console.log(
    `perf: fire view frame ${allMs} ms with every patch burning (${all.live} live), ${pourMs} ms with a drop pouring (${pouring.burning} burning, ${pouring.live} live) (not held)`,
  );
  expect(problems).toEqual([]);
});

test('a view hovering 3 m over the west lake with the rotor’s spray thrown up, and one hovering 2 m over a wood with the trees bowed: the frames told, not held', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await settle(page, 60);
  // the spray at its thickest the helicopter can make it over open water: low, the ring and the mist both out
  await sceneSpray(page, 3, 120);
  const sprayed = await page.evaluate(async () => {
    const g = window.game!;
    const s = g.state();
    return {
      wash: s.particles.wash,
      live: s.particles.live,
      refused: s.particles.refused,
      ms: await g.measureFrame(50),
    };
  });
  expect(sprayed.wash, 'the spray thrown up').toBeGreaterThan(0);
  expect(sprayed.refused).toBe(0);
  // the trees bowed: skids two metres over the highest crown of the wood round the clearing, the sway at work
  const bowed = await page.evaluate(
    async ([w, hover]) => {
      const g = window.game!;
      const top = Math.max(...g.treesNear(w.x, w.y, 12).map((t) => t.z + t.height));
      g.chase();
      g.teleport(w.x, w.y, top - g.floorAt(w.x, w.y) + 2, 0);
      g.fly(0, 0, hover);
      g.step(150);
      const moving = g.sway().count;
      const ms = await g.measureFrame(50);
      g.release();
      return { moving, ms };
    },
    [WOOD, HOVER_LIFT] as const,
  );
  expect(bowed.moving, 'trees bowed').toBeGreaterThan(30);
  const [sprayMs, woodMs] = [sprayed.ms, bowed.ms].map((v) => Math.round(v * 1000) / 1000);
  info.annotations.push({
    type: 'perf-spray-wood',
    description: `${sprayMs} ms over the lake with the spray (${sprayed.live} live), ${woodMs} ms over the wood with ${bowed.moving} trees bowed; not held to the baseline or the budget`,
  });
  console.log(
    `perf: spray view frame ${sprayMs} ms (${sprayed.live} live), wood view frame ${woodMs} ms with ${bowed.moving} trees bowed (not held)`,
  );
  expect(problems).toEqual([]);
});
