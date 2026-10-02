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
import { WOOD, standardView, start, watch } from './game';
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
