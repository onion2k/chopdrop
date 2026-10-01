/**
 * What the smoke tests share: starting the game in a page and waiting until
 * it is ready, and watching the page for errors. The game starts with the
 * helicopter landed on the home pad, so a test begins there: where it wants
 * to be anywhere else on the island it asks for through `teleport`, with a
 * height above the ground, and for the pads and the edges through `content`. Everything else a test does
 * goes through `window.game`, the game's test API (`src/debug.ts`), whose
 * types these tests compile against. When the game has a save again, a test
 * hands one in here, written before the page's own scripts run, and never
 * over the player's: the first commit shows how.
 */
import { expect, type Page } from '@playwright/test';
import type { GameApi } from '../src/debug';

declare global {
  interface Window {
    game?: GameApi;
  }
}

/**
 * A wood to hover low in, for the trees in the downwash: a clearing six across among broadleaf, pine, poplar and
 * bush, on flat ground well away from any pad. It was found by looking for one, and each test that uses it checks
 * that the trees are still there, so an island made again otherwise says so and does not pass with nothing to bow.
 */
export const WOOD = { x: 116, y: -280 };

/** Errors on the page, and requests that failed, collected as they happen. */
export function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  return problems;
}

/**
 * The game in the page, and ready. `seed` makes chance the same from before
 * the game is built, and `paused` stops it before a frame of its own has
 * run, so everything after is the test's own stepping.
 */
export async function start(page: Page, options: { seed?: number; paused?: boolean } = {}) {
  const { seed, paused } = options;
  const query = new URLSearchParams();
  if (seed !== undefined) query.set('seed', String(seed));
  if (paused) query.set('paused', '1');
  await page.goto(query.size ? `/?${query.toString()}` : '/');
  await ready(page);
}

/** Wait until the game is booted and its frame loop running, or say what the boot screen was stuck on. */
export async function ready(page: Page) {
  try {
    await expect.poll(() => page.evaluate(() => window.game?.ready ?? false), { timeout: 60_000 }).toBe(true);
    await expect(page.locator('#boot')).toHaveClass(/gone/);
  } catch {
    throw new Error(`the game did not boot: ${await page.locator('#bootMsg').textContent()}`);
  }
}

/**
 * The standard view, which every picture and the perf gate's frame are taken from: the game stepped three seconds from
 * the start, then the camera parked above the home pad, a little to the side, and one more frame drawn. The game must
 * be paused, so that the steps are the test's own.
 */
export async function standardView(page: Page) {
  await page.evaluate(() => {
    const g = window.game!;
    g.step(180);
    const { home } = g.content();
    g.look(home.x, home.y, { azimuth: 0.9, polar: 0.95, radius: 90 });
    g.step(1);
  });
}
