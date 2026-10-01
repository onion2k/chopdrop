/**
 * The game as a player gets it: served by Vite, run in Chromium on the real
 * GPU. What the unit tests cannot reach — the renderer, the frame loop, the
 * page — checked for the things that would make it plainly broken: an
 * error, a black screen, a clock the tests cannot stop and step. Each thing
 * a player can do or keep gets a test here as it is built.
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
  const shot = await page.screenshot();
  await info.attach('arena', { body: shot, contentType: 'image/png' });
  const c = content(shot);
  expect(c.lit, 'share of the screen lit').toBeGreaterThan(0.2);
  expect(c.spread, 'variety in the picture').toBeGreaterThan(20);
  expect(problems).toEqual([]);
});

test('stops where it was built, steps exactly as told, and goes on again', async ({ page }) => {
  // every picture and every figure the gates hold is taken this way, so it is held here first
  const problems = watch(page);
  await start(page, { paused: true });
  const built = await page.evaluate(() => window.game!.state());
  expect(built).toEqual({ t: 0, frame: 0, paused: true });
  const stepped = await page.evaluate(() => {
    window.game!.step(30);
    return window.game!.state();
  });
  expect(stepped.frame, 'a frame a step').toBe(30);
  expect(stepped.t, 'a sixtieth of a second a frame').toBeCloseTo(0.5, 9);
  // paused, the page goes on drawing and the game does not move
  await framesInASecond(page);
  expect(await page.evaluate(() => window.game!.state().frame)).toBe(30);
  await page.evaluate(() => window.game!.resume());
  await expect.poll(() => page.evaluate(() => window.game!.state().frame), { timeout: 5000 }).toBeGreaterThan(40);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

  test('boots, and nothing is wider than the screen', async ({ page }, info) => {
    const problems = watch(page);
    await start(page);
    await expect(page.locator('#view')).toBeVisible();
    await info.attach('phone', { body: await page.screenshot(), contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
    expect(problems).toEqual([]);
  });
});
