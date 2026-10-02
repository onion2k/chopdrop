/**
 * Free flight in the page: the game opens flying free with a hint in the bar and nothing going, a level begins when
 * the helicopter does its first step (landing on a crate and waiting while it loads), the toast tells the end and goes
 * after three seconds of game time, a level that ends on a pad with another's crate begins nothing until the helicopter
 * has lifted off and landed again, and a level can be given up. Flown by key and by touch with the game paused and
 * stepped, never on a timeout. The panel is `panel.spec.ts`'s, and the rings and the openings are flown in
 * `rings.spec.ts` and `course.spec.ts`.
 */
import { expect, test, type Page } from '@playwright/test';
import { DELIVERIES, start, watch } from './game';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const step = (page: Page, frames: number) => page.evaluate((n) => window.game!.step(n), frames);
const events = (page: Page) => page.evaluate(() => window.game!.events());

/** Over a pad, ten up, and down onto it with Shift held until the skids touch. */
async function landOn(page: Page, pad: number, from = 10) {
  const p = (await page.evaluate(() => window.game!.content().pads))[pad];
  await page.evaluate(([p, h]) => window.game!.teleport(p.x, p.y, h, 0), [p, from] as const);
  await page.keyboard.down('Shift');
  for (let f = 0; f < 300 && !(await state(page)).helicopter.landed; f += 10) await step(page, 10);
  await page.keyboard.up('Shift');
  expect((await state(page)).helicopter.landed, `landed on pad ${pad}`).toBe(true);
}

/** How many lines of text the bar is: its height over a line of its own text. */
const barHeight = (page: Page) => page.locator('#hud .bar').evaluate((el) => el.getBoundingClientRect().height);

test('opens flying free: the hint in the bar, no arrow, distance or clock, nothing going, and all seven levels to fly', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await step(page, 1);
  const s = await state(page);
  expect(s.mission.level).toBeNull();
  expect(s.guided).toBeNull();
  expect(s.screen).toBe('flying');
  expect(s.toast).toBeNull();
  await expect(page.locator('#hud .hint')).toBeVisible();
  await expect(page.locator('#hud .hint')).toHaveText('Land on a crate or fly a start');
  for (const gone of ['.arrow', '.goal', '.far', '.clock', '.loader'])
    await expect(page.locator(`#hud ${gone}`)).toBeHidden();
  const levels = await page.evaluate(() => window.game!.levels());
  expect(levels).toHaveLength(7);
  expect(levels.every((l) => l.best === null)).toBe(true);
  // one line of words
  expect(await barHeight(page), 'the bar is one line').toBeLessThan(44);
  expect(problems).toEqual([]);
});

test('lands on a crate by key: the loader fills, then the level begins, the HUD names the drop pad and the clock reads 0:00', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  const { pickup, drop } = DELIVERIES['first-delivery'];
  await landOn(page, pickup);
  // part way through the load: the loader shows, with nothing begun
  await step(page, 45);
  let s = await state(page);
  expect(s.mission.level).toBeNull();
  expect(s.mission.loading).toBeGreaterThan(0.5);
  await expect(page.locator('#hud .loader')).toBeVisible();
  await expect(page.locator('#hud .loader .what')).toHaveText('Loading the parcel');
  await expect(page.locator('#hud .hint')).toBeVisible();
  // lifted off before it is done: it empties, and nothing has begun
  await page.keyboard.down('Space');
  await step(page, 20);
  await page.keyboard.up('Space');
  expect((await state(page)).mission.loading).toBe(0);
  await expect(page.locator('#hud .loader')).toBeHidden();
  expect(await events(page)).toEqual([]);

  // set down again and waited on: it begins, told, and then the parcel loaded
  await page.keyboard.down('Shift');
  for (let f = 0; f < 300 && !(await state(page)).helicopter.landed; f += 10) await step(page, 10);
  await page.keyboard.up('Shift');
  for (let f = 0; f < 200 && !(await state(page)).mission.level; f++) await step(page, 1);
  s = await state(page);
  expect(s.mission.level).toBe('first-delivery');
  expect(s.mission.carrying).toBe(true);
  expect(await events(page)).toEqual(['started first-delivery', `loaded ${pickup}`]);
  await expect(page.locator('#hud .goal')).toHaveText('Deliver it to the hilltop pad');
  await expect(page.locator('#hud .clock')).toHaveText('0:00');
  await expect(page.locator('#hud .hint')).toBeHidden();
  await expect(page.locator('#hud .loader')).toBeHidden();
  expect(s.helicopter.landed).toBe(true);
  expect(drop).toBe(1);
  expect(problems).toEqual([]);
});

test('a level done tells the toast with its time and "New best", for three seconds of game time, and flight carries on', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  const { pickup, drop } = DELIVERIES['first-delivery'];
  const pads = await page.evaluate(() => window.game!.content().pads);
  await page.evaluate((p) => window.game!.teleport(p.x, p.y, 0, p.yaw), pads[pickup]);
  await step(page, 100);
  expect((await state(page)).mission.level).toBe('first-delivery');
  await events(page);
  await landOn(page, drop);
  await step(page, 100);
  const done = await state(page);
  expect(done.mission.level).toBeNull();
  const told = await events(page);
  expect(told[0]).toBe(`delivered ${drop}`);
  expect(told[1]).toMatch(/^finished first-delivery \d+\.\d\d best$/);
  // the toast, under the bar: the title, the time and the best, and the game not held
  const toast = page.locator('#hud .toast');
  await expect(toast).toBeVisible();
  await expect(toast.locator('h2')).toHaveText('Delivered!');
  await expect(toast.locator('.t')).toHaveText(/^0:\d\d · ★ New best$/);
  expect(done.toast).toMatch(/^Delivered! 0:\d\d ★ New best$/);
  expect(done.screen).toBe('flying');
  expect(done.last).toMatchObject({ id: 'first-delivery', best: true });
  // the bar is gone while it shows, so nothing is above it
  await expect(page.locator('#hud .bar')).toBeHidden();
  expect((await page.evaluate(() => window.game!.save())).best['first-delivery']).toBeCloseTo(done.last!.seconds, 6);
  // the bar keeps quiet under the toast: the hint is not shown above it
  await expect(page.locator('#hud .bar')).toBeHidden();

  // shown for three seconds of game time, as the game is stepped, and then gone
  const at = done.t;
  await step(page, 120);
  expect((await state(page)).t).toBeCloseTo(at + 2, 6);
  await expect(toast).toBeVisible();
  expect((await state(page)).toast).not.toBeNull();
  await step(page, 70);
  await expect(toast).toBeHidden();
  expect((await state(page)).toast).toBeNull();
  await expect(page.locator('#hud .bar')).toBeVisible();
  await expect(page.locator('#hud .hint')).toBeVisible();

  // and held game time holds it: up behind the panel it stays as long as it was
  await page.evaluate((p) => window.game!.teleport(p.x, p.y, 0, p.yaw), pads[pickup]);
  await step(page, 100);
  await landOn(page, drop);
  await step(page, 100);
  expect((await state(page)).toast).not.toBeNull();
  await page.keyboard.press('Escape');
  await step(page, 400);
  await page.keyboard.press('Escape');
  await expect(toast).toBeVisible();
  expect(problems).toEqual([]);
});

test("a level that ends on the next one's crate begins nothing until it lifts off and lands again", async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  const pads = await page.evaluate(() => window.game!.content().pads);
  // over the water ends on pad 2, which is where the mountain drop's crate waits
  const water = DELIVERIES['over-the-water'];
  expect(water.drop).toBe(DELIVERIES['mountain-drop'].pickup);
  await page.evaluate((p) => window.game!.teleport(p.x, p.y, 0, p.yaw), pads[water.pickup]);
  await step(page, 100);
  expect((await state(page)).mission.level).toBe('over-the-water');
  await events(page);
  await page.evaluate((p) => window.game!.teleport(p.x, p.y, 0, p.yaw), pads[water.drop]);
  await step(page, 100);
  let s = await state(page);
  expect([s.mission.level, s.blocked]).toEqual([null, water.drop]);
  expect((await events(page)).at(-1)).toMatch(/^finished over-the-water/);
  // stood there for as long as it likes, nothing begins
  await step(page, 600);
  s = await state(page);
  expect([s.mission.level, s.mission.loading]).toEqual([null, 0]);
  expect(await events(page)).toEqual([]);
  await expect(page.locator('#hud .loader')).toBeHidden();

  // lifted off, and landed again, it begins
  await page.evaluate(() => {
    const g = window.game!;
    g.fly(0, 0, 1);
    g.step(30);
    g.release();
  });
  expect((await state(page)).blocked).toBe(-1);
  await page.evaluate((p) => {
    window.game!.teleport(p.x, p.y, 0, p.yaw);
    window.game!.step(100);
  }, pads[water.drop]);
  s = await state(page);
  expect(s.mission.level).toBe('mountain-drop');
  expect(await events(page)).toEqual(['started mountain-drop', `loaded ${water.drop}`]);
  expect(problems).toEqual([]);
});

test('one level at a time: the crate of another landed on while one goes begins nothing', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  const pads = await page.evaluate(() => window.game!.content().pads);
  await page.evaluate(() => window.game!.begin('first-delivery'));
  await events(page);
  await page.evaluate((p) => {
    window.game!.teleport(p.x, p.y, 0, p.yaw);
    window.game!.step(200);
  }, pads[DELIVERIES['over-the-water'].pickup]);
  const s = await state(page);
  expect([s.mission.level, s.mission.loading]).toEqual(['first-delivery', 0]);
  expect(await events(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test('abandoned from the panel: the hint comes back, the pad it was given up on does not load again at once', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  const { pickup } = DELIVERIES['first-delivery'];
  await landOn(page, pickup);
  await step(page, 100);
  await expect(page.locator('#hud .goal')).toHaveText('Deliver it to the hilltop pad');
  await events(page);
  await page.keyboard.press('Escape');
  await page.locator('#panel .row.going button').click();
  await step(page, 200);
  const s = await state(page);
  expect([s.mission.level, s.mission.carrying, s.mission.loading]).toEqual([null, false, 0]);
  expect(await events(page)).toEqual(['abandoned first-delivery']);
  await expect(page.locator('#hud .hint')).toBeVisible();
  await expect(page.locator('#hud .clock')).toBeHidden();
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the hint fits one line beside the corner button, a crate is landed on by touch, and the toast fits the screen', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await step(page, 1);
    await expect(page.locator('#hud .hint')).toBeVisible();
    expect(await barHeight(page), 'the hint is one line').toBeLessThan(44);
    const bar = (await page.locator('#hud .bar').boundingBox())!;
    const corner = (await page.locator('#hud .to-levels').boundingBox())!;
    expect(bar.x + bar.width).toBeLessThanOrEqual(390 - 8);
    expect(corner.x + corner.width, 'clear of the corner button').toBeLessThanOrEqual(bar.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // the lever starts at the sink: set over a crate, the helicopter settles onto it and the level begins, and ends
    const { pickup, drop } = DELIVERIES['first-delivery'];
    const pads = await page.evaluate(() => window.game!.content().pads);
    await page.evaluate((p) => window.game!.teleport(p.x, p.y, 4, 0), pads[pickup]);
    await step(page, 240);
    expect((await state(page)).input.by).toBe('touch');
    expect((await state(page)).mission.level).toBe('first-delivery');
    expect((await events(page)).slice(0, 2)).toEqual(['started first-delivery', `loaded ${pickup}`]);
    await page.evaluate((p) => window.game!.teleport(p.x, p.y, 4, 0), pads[drop]);
    await step(page, 240);
    expect((await state(page)).mission.level).toBeNull();
    const toast = page.locator('#hud .toast');
    await expect(toast).toBeVisible();
    const box = (await toast.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expect(page.locator('#hud .bar')).toBeHidden();
    expect(problems).toEqual([]);
  });
});
