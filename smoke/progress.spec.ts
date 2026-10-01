/**
 * The play-through: every level flown to the end in the page, the real thing
 * in Chromium on the GPU, by the autopilot through the test API, with every
 * rule that must always hold checked as it goes, and each one after the
 * first reached by the card's "Next level" as a player reaches it. It is what
 * a player can finish, finished: the objective at the start of each, the
 * parcel loaded and the words changing, the card at the end with the time,
 * the levels opening one by one, and, after the last, the list with every
 * level done. Nothing else plays a whole level in the page.
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

/** The words for where the parcel waits and where it is wanted, at the pads of a level. */
const SITES: Record<string, [string, string]> = {
  'first-delivery': ['meadow', 'hilltop'],
  'over-the-water': ['rivermouth', 'lakeside'],
  'over-the-range': ['meadow', 'beach'],
  'mountain-drop': ['lakeside', 'shoulder'],
};

test('every level, played to the end in turn, each opened by the one before', async ({ page }, info) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, list: true, save: { best: {} } });
  const state = () => page.evaluate(() => window.game!.state());
  const levels = await page.evaluate(() => window.game!.levels());
  expect(levels.map((level) => level.standing)).toEqual(['open', ...levels.slice(1).map(() => 'locked')]);
  await page.locator('#levels .go').click();

  for (const [k, level] of levels.entries()) {
    const [from, to] = SITES[level.id];
    await page.evaluate(() => window.game!.step(1));
    expect((await state()).mission.level, `level ${k + 1}`).toBe(level.id);
    await expect(page.locator('#hud .goal')).toHaveText(`Pick up the parcel at the ${from} pad`);
    await page.evaluate(() => window.game!.autopilot(true));
    // to the pad the parcel waits on, and loaded
    for (let f = 0; f < 7200 && (await state()).mission.next === 0; f += 300) await play(page, 300);
    expect((await state()).mission.carrying, `${level.id}: the parcel loaded`).toBe(true);
    await expect(page.locator('#hud .goal')).toHaveText(`Deliver it to the ${to} pad`);
    if (k === 0) await info.attach('carrying', { body: await page.screenshot(), contentType: 'image/png' });
    // to the pad it is wanted on, and delivered
    for (let f = 0; f < 7200 && (await state()).mission.next === 1; f += 300) await play(page, 300);
    const end = await state();
    expect(end.mission.done, `${level.id}: delivered`).toBe(true);
    await page.evaluate(() => window.game!.autopilot(false));
    const [pickup, drop] = end.mission.steps.map((step) => step.pad);
    const told = await page.evaluate(() => window.game!.events());
    expect(told.slice(0, 2)).toEqual([`loaded ${pickup}`, `delivered ${drop}`]);
    expect(told[2]).toMatch(new RegExp(`^finished ${level.id} \\d+\\.\\d\\d best$`));
    expect(told).toHaveLength(3);
    await expect(page.locator('#hud .card h2')).toHaveText('Delivered!');
    await expect(page.locator('#hud .time')).toHaveText(/^in \d:\d\d$/);
    await expect(page.locator('#hud .card .best')).toHaveText('★ New best');
    const after = levels[k + 1] as (typeof levels)[number] | undefined;
    if (after) {
      // the next level is open, and the card goes on to it
      expect((await page.evaluate(() => window.game!.levels()))[k + 1].standing).toBe('open');
      await expect(page.locator('#hud .card .next')).toHaveText(`Next level: ${after.name}`);
      await page.locator('#hud .card .next').click();
    } else {
      // the last: no way on but round, and the list with every level done
      await info.attach('the last delivered', { body: await page.screenshot(), contentType: 'image/png' });
      await expect(page.locator('#hud .card .next')).toBeHidden();
      await page.locator('#hud .card .list').click();
    }
  }
  await expect(page.locator('#levels .sub')).toHaveText(`All ${levels.length} done · fly any again`);
  const done = await page.evaluate(() => window.game!.levels());
  expect(done.every((level) => level.standing === 'done' && level.best !== null)).toBe(true);
  expect(Object.keys((await page.evaluate(() => window.game!.save())).best)).toEqual(levels.map((level) => level.id));

  // flown again from the list: home, landed, the parcel waiting, and the rules still holding
  await page.locator('#levels .go').click();
  await play(page, 60);
  const again = await state();
  expect(again.mission).toMatchObject({ level: 'first-delivery', next: 0, time: 0, started: false });
  expect(again.helicopter.landed).toBe(true);
  expect(problems).toEqual([]);
});
