/**
 * The levels in the page: the list the game opens on, which levels it lets
 * a player fly, the card at the end of one going on to the next, and the save
 * that remembers what was done, worked as a player works them, by key, by
 * click and by tap. The levels are finished here by setting the helicopter
 * down on each pad through the test API; the play-through flies them.
 */
import { expect, test, type Page } from '@playwright/test';
import { SAVE_KEY, fingers, leverTravel, start, watch } from './game';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const step = (page: Page, frames: number) => page.evaluate((n) => window.game!.step(n), frames);

/** The level being flown, finished as a player finishes it: lifted off, then landed on each step's pad and waited on. */
async function finish(page: Page) {
  await page.evaluate(() => {
    const g = window.game!;
    g.fly(0, 0, 1);
    g.step(30);
    g.release();
    const pads = g.content().pads;
    for (const { pad } of g.state().mission.steps) {
      g.teleport(pads[pad].x, pads[pad].y, 0);
      g.step(100);
    }
  });
}

/** Each tile in the list as it reads: its standing, whether it is picked, and the best time on it. */
function tiles(page: Page) {
  return page.locator('#levels .lv').evaluateAll((all) =>
    all.map((el) => ({
      name: el.querySelector('.name')!.textContent,
      standing: ['locked', 'open', 'done'].find((s) => el.classList.contains(s)),
      picked: el.classList.contains('picked'),
      best: el.querySelector<HTMLElement>('.best')!.hidden ? '' : el.querySelector('.best')!.textContent,
    })),
  );
}

test('opens on the list over the island, the game held behind it, and flies the level picked by Enter', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, list: true });
  await expect(page.locator('#levels')).toBeVisible();
  expect(await tiles(page)).toEqual([
    { name: 'First delivery', standing: 'open', picked: true, best: '' },
    { name: 'Over the water', standing: 'locked', picked: false, best: '' },
    { name: 'Over the range', standing: 'locked', picked: false, best: '' },
    { name: 'Mountain drop', standing: 'locked', picked: false, best: '' },
  ]);
  await expect(page.locator('#levels .go')).toHaveText('Fly level 1 · First delivery');
  await expect(page.locator('#hud .top')).toBeHidden();
  // held: stepped, nothing moves, not even the clock
  const t = (await state(page)).t;
  await step(page, 60);
  expect([(await state(page)).t, (await state(page)).screen]).toEqual([t, 'levels']);

  await page.keyboard.press('Enter');
  await step(page, 1);
  const s = await state(page);
  expect([s.screen, s.mission.level]).toEqual(['flying', 'first-delivery']);
  expect(s.t).toBeCloseTo(t + 1 / 60, 9);
  await expect(page.locator('#levels')).toBeHidden();
  await expect(page.locator('#hud .goal')).toHaveText('Pick up the parcel at the meadow pad');
  expect(problems).toEqual([]);
});

test('lets no locked level be flown, by click or by key, and picks any other by either', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, list: true, save: { best: { 'first-delivery': 40.5 } } });
  expect((await tiles(page)).map((t) => [t.standing, t.picked, t.best])).toEqual([
    ['done', false, '0:40'],
    ['open', true, ''],
    ['locked', false, ''],
    ['locked', false, ''],
  ]);
  // a locked tile clicked, and the arrows run past the last open one: still the second picked
  await page.locator('#levels .lv').nth(3).click({ force: true });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect((await tiles(page)).map((t) => t.picked)).toEqual([false, true, false, false]);
  // back to the first, done, by key, and on to it again by a click
  await page.keyboard.press('ArrowLeft');
  expect((await tiles(page)).map((t) => t.picked)).toEqual([true, false, false, false]);
  await page.locator('#levels .lv').nth(1).click();
  await expect(page.locator('#levels .go')).toHaveText('Fly level 2 · Over the water');
  await page.locator('#levels .go').click();
  await step(page, 1);
  expect((await state(page)).mission.level).toBe('over-the-water');
  await expect(page.locator('#hud .goal')).toHaveText('Pick up the parcel at the rivermouth pad');
  expect(problems).toEqual([]);
});

test('keeps a level done, opens the next, and goes on to it from the card; a reload remembers', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await finish(page);
  const done = await state(page);
  expect(done.screen).toBe('card');
  const told = await page.evaluate(() => window.game!.events());
  expect(told.at(-1)).toMatch(/^finished first-delivery \d+\.\d\d best$/);
  const card = page.locator('#hud .card');
  await expect(card.locator('h2')).toHaveText('Delivered!');
  await expect(card.locator('.best')).toHaveText('★ New best');
  await expect(card.locator('.next')).toHaveText('Next level: Over the water');
  await expect(card.locator('.again')).toHaveText('Fly again');
  await expect(card.locator('.list')).toHaveText('Levels');
  const kept = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as { best: Record<string, number> },
    SAVE_KEY,
  );
  expect(Object.keys(kept.best)).toEqual(['first-delivery']);
  expect(kept.best['first-delivery']).toBeCloseTo(done.mission.time, 6);

  // flown again, slower: the best stands, and the card says what it is
  await card.locator('.again').click();
  await step(page, 120);
  await finish(page);
  await expect(card.locator('.best')).toHaveText(/^Best 0:\d\d$/);
  expect((await page.evaluate(() => window.game!.save())).best['first-delivery']).toBeCloseTo(done.mission.time, 6);

  // to the list, where the next is open and picked; and on to it
  await card.locator('.list').click();
  expect((await tiles(page)).map((t) => [t.standing, t.picked])).toEqual([
    ['done', false],
    ['open', true],
    ['locked', false],
    ['locked', false],
  ]);
  await expect(page.locator('#levels .close')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#levels')).toBeVisible();
  await page.locator('#levels .go').click();
  expect((await state(page)).mission.level).toBe('over-the-water');

  // and from the card of that one, straight on by Enter
  await finish(page);
  await expect(card.locator('.next')).toHaveText('Next level: Over the range');
  await page.keyboard.press('Enter');
  await step(page, 1);
  expect([(await state(page)).mission.level, (await state(page)).screen]).toEqual(['over-the-range', 'flying']);

  // a reload reads back what was kept
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.game?.ready ?? false)).toBe(true);
  expect((await tiles(page)).map((t) => [t.standing, t.picked])).toEqual([
    ['done', false],
    ['done', false],
    ['open', true],
    ['locked', false],
  ]);
  expect(problems).toEqual([]);
});

test('goes back to the list mid-flight by Esc or the corner button, and carries on where it was', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await step(page, 1);
  const fresh = await state(page);
  await page.evaluate(() => {
    const g = window.game!;
    g.fly(1, 0.3, 1);
    g.step(90);
  });
  const before = await state(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#levels')).toBeVisible();
  await expect(page.locator('#levels .close')).toBeVisible();
  expect((await tiles(page)).map((t) => t.picked)).toEqual([true, false, false, false]);
  await step(page, 60);
  // held where it was, and Esc again carries on from there
  expect((await state(page)).helicopter).toEqual(before.helicopter);
  await page.keyboard.press('Escape');
  await expect(page.locator('#levels')).toBeHidden();
  await step(page, 1);
  const after = await state(page);
  expect([after.screen, after.mission.level]).toEqual(['flying', 'first-delivery']);
  expect(after.t).toBeCloseTo(before.t + 1 / 60, 9);

  // the corner button, and the list's close button
  await page.locator('#hud .to-levels').click();
  await expect(page.locator('#levels')).toBeVisible();
  await page.locator('#levels .close').click();
  await expect(page.locator('#levels')).toBeHidden();
  expect((await state(page)).screen).toBe('flying');

  // and a level picked from it is flown from the start
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.game!.release());
  await step(page, 1);
  const again = await state(page);
  expect(again.mission).toMatchObject({ level: 'first-delivery', start: 0, next: 0, time: 0, started: false });
  expect(again.helicopter.landed).toBe(true);
  // and the camera is behind it on the pad, as it was when the game began, and not where the flight left it
  expect(again.camera.position.map((v) => +v.toFixed(3))).toEqual(fresh.camera.position.map((v) => +v.toFixed(3)));
  expect(problems).toEqual([]);
});

test('refuses a save it cannot read, saying why, starts afresh, and leaves it be until a level is done', async ({
  page,
}) => {
  const warned: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') warned.push(m.text());
  });
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, list: true, save: '{"best": {"first-delivery": 40' });
  expect(warned.join('\n')).toMatch(/save could not be read \(it is not JSON\)/);
  expect((await page.evaluate(() => window.game!.save())).refused).toBe('it is not JSON');
  expect((await tiles(page)).map((t) => t.standing)).toEqual(['open', 'locked', 'locked', 'locked']);
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe('{"best": {"first-delivery": 40');
  await page.keyboard.press('Enter');
  await finish(page);
  const kept = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as { best: object }, SAVE_KEY);
  expect(Object.keys(kept.best)).toEqual(['first-delivery']);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the list fits the screen in two columns, and a level is picked and flown by taps', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, list: true, save: { best: { 'first-delivery': 40 } } });
    const boxes = await page.locator('#levels .lv').evaluateAll((all) =>
      all.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), right: Math.round(r.right), bottom: Math.round(r.bottom), height: r.height };
      }),
    );
    expect(new Set(boxes.map((b) => b.x)).size, 'two columns').toBe(2);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(390);
      expect(b.height, 'a thumb-sized tile').toBeGreaterThanOrEqual(44);
    }
    const go = (await page.locator('#levels .go').boundingBox())!;
    expect(go.y + go.height).toBeLessThanOrEqual(844);
    expect(go.height).toBeGreaterThanOrEqual(44);

    const hand = await fingers(page);
    const tap = async (selector: string, nth = 0) => {
      const b = (await page.locator(selector).nth(nth).boundingBox())!;
      await hand.down(1, b.x + b.width / 2, b.y + b.height / 2);
      await hand.up(1);
    };
    await tap('#levels .lv', 0);
    await expect(page.locator('#levels .go')).toHaveText('Fly level 1 · First delivery');
    await tap('#levels .go');
    await step(page, 1);
    expect((await state(page)).screen).toBe('flying');
    // the lever, out of sight behind the list until now, measured as it came: slid a quarter of its travel up from
    // the sink, where it starts, it asks for half a climb, and not the whole one a lever measured while hidden gave
    await expect(page.locator('#touch')).toBeVisible();
    const travel = await leverTravel(page);
    const track = (await page.locator('#touch .track').boundingBox())!;
    const handle = (await page.locator('#touch .handle').boundingBox())!;
    const x = track.x + track.width / 2,
      y = handle.y + handle.height / 2;
    await hand.down(2, x, y);
    await hand.move(2, x, y - travel / 4);
    expect((await state(page)).input.lever).toBeCloseTo(0.5, 1);
    await hand.up(2);
    // the corner button is a thumb's size, and clear of the words at the top
    const corner = (await page.locator('#hud .to-levels').boundingBox())!;
    expect(Math.min(corner.width, corner.height)).toBeGreaterThanOrEqual(44);
    const bar = (await page.locator('#hud .bar').boundingBox())!;
    expect(
      corner.x + corner.width <= bar.x || corner.y + corner.height <= bar.y,
      'the corner button clear of the bar',
    ).toBe(true);
    await tap('#hud .to-levels');
    await expect(page.locator('#levels')).toBeVisible();
    await expect(page.locator('#touch')).toBeHidden();
    await tap('#levels .close');
    await expect(page.locator('#levels')).toBeHidden();
    expect(problems).toEqual([]);
  });
});
