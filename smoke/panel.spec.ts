/**
 * The panel in the page: the game opens flying free with no panel up, Esc or the corner button brings it up over the
 * island and holds the game behind it, each level is a row with its best time and where it starts, "Show the way"
 * points the arrow at a start and "Abandon" gives up the level going, and the save that remembers what was done. All
 * worked as a player works them, by key, by click and by tap, with the game paused and stepped.
 */
import { expect, test, type Page } from '@playwright/test';
import { SAVE_KEY, fingers, finish, start, watch } from './game';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const step = (page: Page, frames: number) => page.evaluate((n) => window.game!.step(n), frames);

/** Each row in the panel as it reads: its name, best time, where it starts, whether it is going and what its button says. */
function rows(page: Page) {
  return page.locator('#panel .row').evaluateAll((all) =>
    all.map((el) => ({
      name: el.querySelector('.label')!.textContent,
      best: el.querySelector<HTMLElement>('.best')!.hidden ? '' : el.querySelector('.best')!.textContent,
      where: el.querySelector('.where')!.textContent,
      going: el.classList.contains('going'),
      button: el.querySelector('button')!.textContent,
    })),
  );
}

const NAMES = [
  'First delivery',
  'Ring trial',
  'Over the water',
  'Over the range',
  'Up the valley',
  'Mountain drop',
  'Under and between',
  'Wood rescue',
  'Beach rescue',
  'Ledge rescue',
];
const WHERE = [
  'Land on the meadow pad',
  'Fly through the first ring, by the lakeside pad',
  'Land on the rivermouth pad',
  'Land on the meadow pad',
  'Fly through the first ring, by the meadow pad',
  'Land on the lakeside pad',
  'Fly between the towers',
  'Winch up the walker in the western wood',
  'Winch up the stranded swimmer on the east beach',
  'Winch up the climber on the southern ledge',
];

test('opens flying free, with no panel up, and Esc brings it over the island and holds the game behind it', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await step(page, 1);
  const free = await state(page);
  expect([free.screen, free.mission.level, free.guided]).toEqual(['flying', null, null]);
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('#hud .to-levels')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains('listing'))).toBe(true);
  expect(await page.evaluate(() => window.game!.state().screen)).toBe('panel');
  // the first row's button has the focus, so Tab and Enter work
  expect(await page.evaluate(() => document.activeElement === document.querySelector('#panel .row button'))).toBe(true);
  await expect(page.locator('#panel h1')).toHaveText('Chopdrop');
  // held: stepped, nothing moves, not even the clock
  const t = (await state(page)).t;
  await step(page, 60);
  expect([(await state(page)).t, (await state(page)).screen]).toEqual([t, 'panel']);

  // Esc again carries on from where it was held
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel')).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains('listing'))).toBe(false);
  await step(page, 1);
  const after = await state(page);
  expect([after.screen, after.t]).toEqual(['flying', expect.closeTo(t + 1 / 60, 9)]);
  expect(problems).toEqual([]);
});

test('is opened by the corner button and closed by its cross, and holds a flight where it was', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await page.evaluate(() => {
    const g = window.game!;
    g.fly(1, 0.3, 1);
    g.step(90);
  });
  const before = await state(page);
  await page.locator('#hud .to-levels').click();
  await expect(page.locator('#panel')).toBeVisible();
  await step(page, 60);
  expect((await state(page)).helicopter, 'held where it was').toEqual(before.helicopter);
  await page.locator('#panel .close').click();
  await expect(page.locator('#panel')).toBeHidden();
  expect((await state(page)).screen).toBe('flying');
  await step(page, 1);
  expect((await state(page)).t).toBeCloseTo(before.t + 1 / 60, 9);
  expect(problems).toEqual([]);
});

test('lists all ten levels with their best times from a save, where each starts, and how many are done', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: { 'first-delivery': 40.5, 'ring-trial': 33.2 } } });
  await page.keyboard.press('Escape');
  const seen = await rows(page);
  expect(seen.map((r) => r.name)).toEqual(NAMES);
  expect(seen.map((r) => r.where)).toEqual(WHERE);
  expect(seen.map((r) => r.best)).toEqual(['0:40', '0:33', '', '', '', '', '', '', '', '']);
  expect(seen.map((r) => r.button)).toEqual(NAMES.map(() => 'Show the way'));
  expect(seen.some((r) => r.going)).toBe(false);
  await expect(page.locator('#panel .sub')).toHaveText('2 of 10 done · land on a crate or fly a start, anywhere');
  expect(await page.evaluate(() => window.game!.levels().map((l) => l.best !== null))).toEqual([
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  // the three rescues wear their kind's label, with its small figure, and no other level wears one
  await expect(page.locator('#panel .row .kind')).toHaveCount(3);
  await expect(page.locator('#panel .row.rescue .kind')).toHaveText(['Rescue', 'Rescue', 'Rescue']);
  await expect(page.locator('#panel .row.rescue .kind svg')).toHaveCount(3);
  expect(problems).toEqual([]);
});

test('shows the way: the arrow turns to the start, and the HUD says so, until a level begins', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await step(page, 1);
  await expect(page.locator('#hud .arrow')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('#panel .row').nth(1).locator('button').click();
  // the panel goes, and the game with it carries on
  await expect(page.locator('#panel')).toBeHidden();
  expect((await state(page)).guided).toBe('ring-trial');
  await step(page, 1);
  await expect(page.locator('#hud .goal')).toHaveText('To the start · Ring trial');
  await expect(page.locator('#hud .arrow')).toBeVisible();
  await expect(page.locator('#hud .far')).toHaveText(/^\d+ m$/);
  await expect(page.locator('#hud .clock')).toBeHidden();
  await expect(page.locator('#hud .hint')).toBeHidden();

  // the distance falls as the helicopter is put nearer
  const far = async () => Number((await page.locator('#hud .far').textContent())!.replace(' m', ''));
  const first = await far();
  await page.evaluate(() => {
    const g = window.game!;
    g.play('ring-trial');
    g.step(1);
  });
  expect(await far(), 'nearer once put at the start').toBeLessThan(first);

  // a level begun by anything takes the guide away
  await page.evaluate(() => window.game!.begin('first-delivery'));
  await step(page, 1);
  expect((await state(page)).guided).toBeNull();
  await expect(page.locator('#hud .goal')).toHaveText('Deliver it to the hilltop pad');
  expect(problems).toEqual([]);
});

test('a level going has its row marked, its button says Abandon, and abandoning ends it with no time and its crate back', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  const pads = await page.evaluate(() => window.game!.content().pads);
  // landed on the crate and loaded, as a player begins it
  await page.evaluate((p) => {
    window.game!.teleport(p.x, p.y, 0, p.yaw);
    window.game!.step(100);
  }, pads[4]);
  expect((await state(page)).mission).toMatchObject({ level: 'first-delivery', carrying: true });
  await page.keyboard.press('Escape');
  const seen = await rows(page);
  expect(seen[0]).toMatchObject({ going: true, button: 'Abandon' });
  expect(seen.slice(1).every((r) => !r.going && r.button === 'Show the way')).toBe(true);
  await expect(page.locator('#panel .row.going .now')).toHaveText('· going');
  await page.evaluate(() => window.game!.events());
  await page.locator('#panel .row.going button').click();
  await expect(page.locator('#panel')).toBeHidden();
  const s = await state(page);
  expect([s.mission.level, s.mission.carrying, s.mission.time]).toEqual([null, false, 0]);
  expect(await page.evaluate(() => window.game!.events())).toEqual(['abandoned first-delivery']);
  expect((await page.evaluate(() => window.game!.save())).best).toEqual({});
  await step(page, 1);
  await expect(page.locator('#hud .hint')).toBeVisible();

  // still on the pad it was abandoned on, the crate does not load again at once
  await step(page, 200);
  expect((await state(page)).mission.level).toBeNull();
  // but its crate is back: lifted off and set down again, it begins once more
  await page.evaluate((p) => {
    const g = window.game!;
    g.fly(0, 0, 1);
    g.step(30);
    g.release();
    g.teleport(p.x, p.y, 0, p.yaw);
    g.step(100);
  }, pads[4]);
  expect((await state(page)).mission.level).toBe('first-delivery');
  expect(await page.evaluate(() => window.game!.events())).toEqual(['started first-delivery', 'loaded 4']);
  expect(problems).toEqual([]);
});

test('keeps a level done: the row shows its time, which only a faster run lowers, and a reload remembers', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await page.evaluate(() => window.game!.begin('first-delivery'));
  await finish(page);
  const done = await state(page);
  expect(done.last).toMatchObject({ id: 'first-delivery', best: true });
  const kept = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as { best: Record<string, number> },
    SAVE_KEY,
  );
  expect(Object.keys(kept.best)).toEqual(['first-delivery']);
  expect(kept.best['first-delivery']).toBeCloseTo(done.last!.seconds, 6);

  await page.reload();
  await expect.poll(() => page.evaluate(() => window.game?.ready ?? false)).toBe(true);
  await page.keyboard.press('Escape');
  expect((await rows(page)).map((r) => r.best !== '')).toEqual([
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  await expect(page.locator('#panel .sub')).toHaveText('1 of 10 done · land on a crate or fly a start, anywhere');
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
  await start(page, { seed: 11, paused: true, save: '{"best": {"first-delivery": 40' });
  expect(warned.join('\n')).toMatch(/save could not be read \(it is not JSON\)/);
  expect((await page.evaluate(() => window.game!.save())).refused).toBe('it is not JSON');
  await page.keyboard.press('Escape');
  expect((await rows(page)).every((r) => r.best === '')).toBe(true);
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe('{"best": {"first-delivery": 40');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.game!.begin('first-delivery'));
  await finish(page);
  const kept = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as { best: object }, SAVE_KEY);
  expect(Object.keys(kept.best)).toEqual(['first-delivery']);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the panel is one column that fits the screen, its buttons are taps, and touch is let go behind it', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: { 'first-delivery': 40 } } });
    await step(page, 1);
    const hand = await fingers(page);
    const tap = async (selector: string, nth = 0) => {
      const b = (await page.locator(selector).nth(nth).boundingBox())!;
      await hand.down(9, b.x + b.width / 2, b.y + b.height / 2);
      await hand.up(9);
    };
    // a thumb on the stick, pushed, when the panel comes up
    await hand.down(1, 120, 700);
    await hand.move(1, 120, 620);
    await step(page, 1);
    expect((await state(page)).input.controls.forward).toBe(1);
    // the corner button is a thumb's size, clear of the bar
    const corner = (await page.locator('#hud .to-levels').boundingBox())!;
    expect(Math.min(corner.width, corner.height)).toBeGreaterThanOrEqual(44);
    const bar = (await page.locator('#hud .bar').boundingBox())!;
    expect(corner.x + corner.width <= bar.x || corner.y + corner.height <= bar.y, 'the corner clear of the bar').toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeVisible();
    await expect(page.locator('#touch')).toBeHidden();
    const boxes = await page.locator('#panel .row').evaluateAll((all) =>
      all.map((el) => {
        const r = el.getBoundingClientRect();
        const b = el.querySelector('button')!.getBoundingClientRect();
        return { x: Math.round(r.x), right: Math.round(r.right), button: b.height, buttonRight: b.right };
      }),
    );
    expect(new Set(boxes.map((b) => b.x)).size, 'one column').toBe(1);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(390);
      expect(b.buttonRight).toBeLessThanOrEqual(390);
      expect(b.button, 'a thumb-sized button').toBeGreaterThanOrEqual(40);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // ten rows are taller than the screen, so the sheet scrolls, and the last, a rescue's, comes into view whole
    expect(boxes).toHaveLength(10);
    const sheet = page.locator('#panel .sheet');
    expect(await sheet.evaluate((el) => el.scrollHeight > el.clientHeight), 'the sheet scrolls').toBe(true);
    await page.locator('#panel .row').nth(9).scrollIntoViewIfNeeded();
    const last = (await page.locator('#panel .row').nth(9).boundingBox())!;
    const held = (await sheet.boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(held.y + held.height + 1);
    const kind = (await page.locator('#panel .row').nth(9).locator('.kind').boundingBox())!;
    expect(kind.x + kind.width, 'the label fits the row').toBeLessThanOrEqual(390);
    await sheet.evaluate((el) => (el.scrollTop = 0));
    // closed again, the thumb still on the glass but let go of, so the stick asks for nothing
    await page.keyboard.press('Escape');
    await step(page, 1);
    expect((await state(page)).input.controls.forward, 'touch let go behind the panel').toBe(0);
    await hand.up(1);

    // taps: the corner button opens it, a row's button shows the way, and it goes
    await tap('#hud .to-levels');
    await expect(page.locator('#panel')).toBeVisible();
    await tap('#panel .row button', 4);
    await expect(page.locator('#panel')).toBeHidden();
    expect((await state(page)).guided).toBe('up-the-valley');
    await step(page, 1);
    await tap('#hud .to-levels');
    await tap('#panel .close');
    await expect(page.locator('#panel')).toBeHidden();
    expect(problems).toEqual([]);
  });
});
