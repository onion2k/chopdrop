/**
 * The game played through in a real browser: a ball put in front of the
 * sled, driven into the hole, banked, and another dropped. Played through
 * the test API with the game paused and stepped a frame at a time, so it is
 * the same every run and waits on no clock — but everything that follows,
 * the physics, the scene, the words on the screen, is the game's own.
 *
 * A feature that a player can reach gets a stage here, and after every
 * stage the game's invariants are checked.
 */
import { expect, test, type Page } from '@playwright/test';
import { start, watch } from './game';

/** Play `frames` frames, and check nothing that must hold has broken. */
async function play(page: Page, frames: number, stage: string) {
  const broken = await page.evaluate((n) => {
    window.game!.step(n);
    return window.game!.invariants();
  }, frames);
  expect(broken, `invariants after ${stage}`).toEqual([]);
}

test('a ball pushed into the hole is banked, and another takes its place', async ({ page }, info) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await play(page, 120, 'settling');
  const { hole, balls } = await page.evaluate(() => window.game!.content());
  // the sled south of the hole facing it, and a ball between the two
  await page.evaluate(
    ([x, y]) => {
      const g = window.game!;
      g.teleport(x, y - 22, Math.PI / 2);
      g.place(g.bodies()[0].slot, x, y - 14, 1);
      g.events();
      g.drive(1, 0);
    },
    [hole.x, hole.y],
  );
  let banked = 0;
  for (let f = 0; f < 600 && !banked; f += 10) {
    await play(page, 10, 'driving at the hole');
    banked = await page.evaluate(() => window.game!.state().banked);
  }
  await page.evaluate(() => window.game!.release());
  expect(banked, 'a ball banked').toBeGreaterThanOrEqual(1);
  const events = await page.evaluate(() => window.game!.events());
  expect(events.some((e) => e.startsWith('banked'))).toBe(true);
  expect(events.some((e) => e.startsWith('dropped'))).toBe(true);
  await play(page, 120, 'the new ball landing');
  expect(await page.evaluate(() => window.game!.state().live), 'the floor keeps its balls').toBe(balls);
  await expect(page.locator('#bank b')).toHaveText(String(banked));
  await info.attach('banked', { body: await page.screenshot(), contentType: 'image/png' });
  expect(problems).toEqual([]);
});
