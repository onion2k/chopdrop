/**
 * The structures collected, in the page: a pair of towers flown through by the keys is told, shown in a toast, and
 * drawn with its gold collar; flown through again, round, or crossed by a teleport it is not told again; a reload keeps
 * it collected, drawn and ticked in the panel; a save from before there were structures loads with none; and on a phone
 * one is flown through by touch and the panel's list is one column. The helicopter is set a short way before each
 * opening through the test API, and what it does from there is the controls'. Stepped, never waited on.
 */
import { expect, test, type Page } from '@playwright/test';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import type { Gate } from '../src/mission';
import { fingers, leverTravel, ready, start, watch } from './game';

/** The towers these tests fly through, which stand clear of every level's way, so nothing but a collection is told. */
const ID = 'lakeside-towers';
const NAME = 'the lakeside towers';
const WORDS = `Collected ${NAME} · 1 of 7`;

const state = (page: Page) => page.evaluate(() => window.game!.state());
const step = (page: Page, frames: number) => page.evaluate((n) => window.game!.step(n), frames);
const events = (page: Page) => page.evaluate(() => window.game!.events());
const opening = async (page: Page, id = ID): Promise<Gate> =>
  (await page.evaluate(() => window.game!.content().collectibles)).find((c) => c.id === id)!.opening;

/** The helicopter set `back` before `gate` on its axis, facing it, or on the far side facing back through it, at its height. */
async function before(page: Page, gate: Gate, back: number, reverse = false, aside = 0) {
  await page.evaluate(
    ([g, b, rev, side, middle]) => {
      const game = window.game!;
      const yaw = g.yaw + (rev ? Math.PI : 0);
      const [x, y] = [g.x - Math.cos(yaw) * b - Math.sin(yaw) * side, g.y - Math.sin(yaw) * b + Math.cos(yaw) * side];
      game.teleport(x, y, g.z - middle - game.floorAt(x, y), yaw);
    },
    [gate, back, reverse, aside, HELICOPTER.size.middle] as const,
  );
}

/** W held, five frames at a time, until `done` or `limit` frames have gone, with the rules checked as it goes. */
async function fly(page: Page, done: () => Promise<boolean>, limit = 300) {
  await page.keyboard.down('w');
  for (let f = 0; f < limit && !(await done()); f += 5) {
    await step(page, 5);
    expect(await page.evaluate(() => window.game!.invariants()), `frame ${f}`).toEqual([]);
  }
  await page.keyboard.up('w');
}

/** The towers flown through by the keys from `back` short of them. */
async function through(page: Page, back = 25, reverse = false) {
  await before(page, await opening(page), back, reverse);
  await fly(page, async () => (await state(page)).collected.includes(ID));
}

test('flown through by the keys: told, shown in a toast, drawn with its collar; and through again, round, or across by a teleport, nothing', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await step(page, 1);
  const gate = await opening(page);
  expect((await state(page)).collected).toEqual([]);
  expect((await state(page)).gold, 'no gold on anything').toBe(0);
  await expect(page.locator('#hud .toast')).toBeHidden();

  // round it first: past the outside of the pair, the whole way along its axis and a long way aside, nothing
  await before(page, gate, 30, false, 45);
  await fly(page, () => Promise.resolve(false), 120);
  expect(await events(page)).toEqual([]);
  // and across it by a teleport, from one side of its opening to the other, which is no flight
  await before(page, gate, 20);
  await step(page, 2);
  await before(page, gate, -20);
  await step(page, 30);
  expect(await events(page)).toEqual([]);
  expect((await state(page)).collected).toEqual([]);

  // through it, W held: the one event, the toast and the collar
  await through(page);
  expect(await events(page)).toEqual([`collected ${ID} 1 7`]);
  expect((await state(page)).collected).toEqual([ID]);
  await step(page, 1);
  const flown = await state(page);
  expect(flown.toast).toBe(WORDS);
  expect(flown.gold, 'a collar on each tower').toBe(2);
  const toast = page.locator('#hud .toast');
  await expect(toast).toBeVisible();
  await expect(toast.locator('h2')).toHaveText('Collected');
  await expect(toast.locator('.t')).toHaveText(`${NAME} · 1 of 7`);
  await expect(page.locator('#hud .hint')).toBeHidden();

  // the toast goes of itself after three seconds of game time
  await step(page, 150);
  await expect(toast).toBeVisible();
  await step(page, 40);
  expect((await state(page)).toast).toBeNull();
  await expect(toast).toBeHidden();
  await expect(page.locator('#hud .hint')).toBeVisible();

  // through it again, the same way and the other, nothing: no event, no toast, the same two collars
  await through(page);
  await through(page, 25, true);
  await step(page, 30);
  expect(await events(page)).toEqual([]);
  const again = await state(page);
  expect([again.collected, again.toast, again.gold]).toEqual([[ID], null, 2]);
  await expect(toast).toBeHidden();
  expect(problems).toEqual([]);
});

test("a reload keeps it collected: the save, the collar and the panel's tick", async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await through(page);
  expect(await events(page)).toEqual([`collected ${ID} 1 7`]);
  await page.reload();
  await ready(page);
  expect((await state(page)).collected).toEqual([ID]);
  // nothing is told for it again, and no toast: it was done in the last visit
  await step(page, 1);
  const after = await state(page);
  expect([after.toast, after.gold]).toEqual([null, 2]);
  expect(await events(page)).toEqual([]);
  await expect(page.locator('#hud .toast')).toBeHidden();
  // the panel, shown fresh: one ticked of seven
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel .structures h3')).toHaveText('Structures1 of 7');
  await expect(page.locator('#panel .structures .item')).toHaveCount(7);
  const ticked = await page
    .locator('#panel .structures .item')
    .evaluateAll((all) =>
      all.map((el) => [
        el.querySelector('.what')!.textContent,
        el.classList.contains('got'),
        el.querySelector('.mark')!.textContent,
      ]),
    );
  expect(ticked.filter(([, got]) => got)).toEqual([['lakeside towers', true, '✓']]);
  expect(ticked.filter(([, got]) => !got).every(([, , mark]) => mark === '')).toBe(true);
  expect(ticked.map(([name]) => name)).toEqual([
    'gorge bridge',
    'shoulder towers',
    'west bridge',
    'southern towers',
    'southeastern towers',
    'lakeside towers',
    'eastern towers',
  ]);
  // two columns at a desk's width
  const columns = await page
    .locator('#panel .structures .list')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
  expect(problems).toEqual([]);
});

test('a save from before there were structures loads with none collected, the panel at none of seven', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: '{"best":{"first-delivery":41.2}}' });
  await step(page, 1);
  const old = await state(page);
  expect([old.collected, old.gold]).toEqual([[], 0]);
  expect((await page.evaluate(() => window.game!.save())).best).toEqual({ 'first-delivery': 41.2 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel .structures h3')).toHaveText('Structures0 of 7');
  await expect(page.locator('#panel .structures .item.got')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('a save with structures in it loads them, the panel ticked and the gold drawn, a name the game lacks kept and not counted', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, {
    seed: 11,
    paused: true,
    save: { best: {}, collected: ['gorge-bridge', 'from-a-later-game'] },
  });
  await step(page, 1);
  const kept = await state(page);
  expect([kept.collected, kept.gold]).toEqual([['gorge-bridge', 'from-a-later-game'], 2]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel .structures h3')).toHaveText('Structures1 of 7');
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("through the towers by touch: told, the toast on the screen, and the panel's list in one column", async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await step(page, 1);
    await before(page, await opening(page), 25);
    const travel = await leverTravel(page);
    const hand = await fingers(page);
    // the right thumb sets the lever at its stop, and the left pushes the stick straight up
    await hand.down(2, 330, 680);
    await hand.move(2, 330, 680 - (HOVER_LIFT * travel) / 2);
    await hand.down(1, 100, 690);
    await hand.move(1, 100, 610);
    for (let f = 0; f < 300 && !(await state(page)).collected.length; f += 5) await step(page, 5);
    await hand.up(1);
    await hand.up(2);
    expect(await events(page)).toEqual([`collected ${ID} 1 7`]);
    await step(page, 1);
    expect((await state(page)).toast).toBe(WORDS);
    expect((await state(page)).gold).toBe(2);
    const box = (await page.locator('#hud .toast').boundingBox())!;
    expect(box.x, 'the toast on the screen').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expect(page.locator('#hud .toast .t')).toHaveText(`${NAME} · 1 of 7`);

    // the panel by its corner button: the list in one column, every item the width of the sheet
    await page.locator('#hud .to-levels').tap();
    await expect(page.locator('#panel')).toBeVisible();
    await page.locator('#panel .structures').scrollIntoViewIfNeeded();
    await expect(page.locator('#panel .structures h3')).toHaveText('Structures1 of 7');
    const columns = await page
      .locator('#panel .structures .list')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(1);
    const lefts = await page
      .locator('#panel .structures .item')
      .evaluateAll((all) => all.map((el) => el.getBoundingClientRect().left));
    expect(new Set(lefts).size, 'one left edge').toBe(1);
    expect(problems).toEqual([]);
  });
});
