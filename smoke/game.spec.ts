/**
 * The game as a player gets it: served by Vite, run in Chromium on the real
 * GPU, with a fresh save each test. What the unit tests cannot reach — the
 * renderer, the keyboard, the frame loop, the page — checked for the things
 * that would make it plainly broken: an error, a black screen, a sled that
 * does not move, a save that does not come back.
 */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { start, watch } from './game';

/** How many frames the page draws in a second. */
function framesInASecond(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const began = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - began < 1000) requestAnimationFrame(tick);
          else resolve(n);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** How much a screenshot has in it: the spread of its brightness, and the share of it that is not near black. */
function content(png: Buffer) {
  const img = PNG.sync.read(png);
  let sum = 0,
    sq = 0,
    lit = 0;
  const n = img.width * img.height;
  for (let i = 0; i < img.data.length; i += 4) {
    const y = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
    sum += y;
    sq += y * y;
    if (y > 40) lit++;
  }
  const mean = sum / n;
  return { spread: Math.sqrt(sq / n - mean * mean), lit: lit / n };
}

test('boots with no errors and draws the arena', async ({ page }, info) => {
  const problems = watch(page);
  await start(page);
  expect(await framesInASecond(page)).toBeGreaterThan(20);
  const state = await page.evaluate(() => window.game!.state());
  expect(state.live, 'balls on the floor').toBeGreaterThan(0);
  const shot = await page.screenshot();
  await info.attach('arena', { body: shot, contentType: 'image/png' });
  const c = content(shot);
  expect(c.lit, 'share of the screen lit').toBeGreaterThan(0.2);
  expect(c.spread, 'variety in the picture').toBeGreaterThan(20);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('drives the sled by the keyboard', async ({ page }) => {
  const problems = watch(page);
  await start(page);
  const before = await page.evaluate(() => window.game!.state().sled);
  await page.keyboard.down('w');
  await expect
    .poll(() => page.evaluate(() => window.game!.state().sled.y), { timeout: 5000 })
    .toBeGreaterThan(before.y + 5);
  await page.keyboard.down('a');
  await expect
    .poll(() => page.evaluate(() => window.game!.state().sled.yaw), { timeout: 5000 })
    .toBeGreaterThan(before.yaw + 0.3);
  await page.keyboard.up('a');
  await page.keyboard.up('w');
  expect(problems).toEqual([]);
});

test('keeps the bank across a reload', async ({ page }) => {
  const problems = watch(page);
  await start(page);
  const before = await page.evaluate(() => {
    const g = window.game!;
    g.pause();
    g.deposit(123);
    g.step(1);
    g.save();
    return g.state();
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.game?.ready ?? false), { timeout: 60_000 }).toBe(true);
  const after = await page.evaluate(() => window.game!.state());
  expect(after.bank).toBe(before.bank);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

  test('boots, and nothing is wider than the screen', async ({ page }, info) => {
    const problems = watch(page);
    await start(page);
    await expect(page.locator('#bank')).toBeVisible();
    await info.attach('phone', { body: await page.screenshot(), contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
    expect(problems).toEqual([]);
  });
});
