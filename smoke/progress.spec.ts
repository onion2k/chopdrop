/**
 * The play-through: the first level flown to the end in the page, the real
 * thing in Chromium on the GPU, by the autopilot through the test API, with
 * every rule that must always hold checked as it goes. It is what a player
 * can finish, finished: the objective at the start, the parcel loaded and
 * the words changing, the card at the end with the time, and "Fly again"
 * putting it all back. Nothing else plays a whole level in the page.
 */
import { expect, test, type Page } from '@playwright/test';
import { start, watch } from './game';

/** `frames` frames played, the rules checked after each `every` of them; what is broken, if anything. */
async function play(page: Page, frames: number, every = 30) {
  for (let f = 0; f < frames; f += every) {
    const broken = await page.evaluate((n) => {
      window.game!.step(n);
      return window.game!.invariants();
    }, every);
    expect(broken, `at frame ${f + every}`).toEqual([]);
  }
}

test('the first level, played to the end and flown again', async ({ page }, info) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const state = () => page.evaluate(() => window.game!.state());
  await page.evaluate(() => window.game!.step(1));
  await expect(page.locator('#hud .goal')).toHaveText('Pick up the parcel at the meadow pad');

  await page.evaluate(() => window.game!.autopilot(true));
  // to the meadow pad, and loaded
  for (let f = 0; f < 3600 && (await state()).delivery.stage === 'pickup'; f += 300) await play(page, 300);
  expect((await state()).delivery.stage, 'the parcel loaded').toBe('carry');
  await expect(page.locator('#hud .goal')).toHaveText('Deliver it to the hilltop pad');
  await info.attach('carrying', { body: await page.screenshot(), contentType: 'image/png' });
  // to the hilltop pad, and delivered
  for (let f = 0; f < 3600 && (await state()).delivery.stage === 'carry'; f += 300) await play(page, 300);
  const end = await state();
  expect(end.delivery.stage, 'the parcel delivered').toBe('delivered');
  await page.evaluate(() => window.game!.autopilot(false));
  const told = await page.evaluate(() => window.game!.events());
  expect(told[0]).toBe(`loaded ${end.delivery.pickup}`);
  expect(told[1]).toMatch(new RegExp(`^delivered ${end.delivery.drop} `));
  await expect(page.locator('#hud .card h2')).toHaveText('Delivered!');
  await expect(page.locator('#hud .time')).toHaveText(/^in 0:[2-5]\d$/);
  await info.attach('delivered', { body: await page.screenshot(), contentType: 'image/png' });

  // flown again: home, landed, the parcel waiting, and the rules still holding
  await page.locator('#hud .card button').click();
  await play(page, 60);
  const again = await state();
  expect(again.delivery).toMatchObject({ stage: 'pickup', time: 0, started: false });
  expect(again.helicopter.landed).toBe(true);
  await expect(page.locator('#hud .goal')).toHaveText('Pick up the parcel at the meadow pad');
  expect(problems).toEqual([]);
});
