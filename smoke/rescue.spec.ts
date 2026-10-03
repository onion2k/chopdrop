/**
 * The rescues in the page: the walker in the western wood winched up by holding the window over them with the keys, the
 * loader filling and the rope drawn and the smoke out, then told started and winched, the person gone from the ground
 * and the bar saying where they are to be flown; the winch broken off by climbing out of the window, which empties the
 * loader and puts the smoke back; the end on the home pad, with the toast and the best kept; a person held over while
 * another level goes, which does nothing; and a rescue winched by touch on a phone, the loader in view. The helicopter is
 * put over the person through the test API, and what it does from there is the controls'. Stepped, never waited on.
 */
import { expect, test, type Page } from '@playwright/test';
import { HOVER_LIFT } from '../src/helicopter';
import { WINCH } from '../src/mission';
import { fingers, finish, leverTravel, start, watch } from './game';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const step = (page: Page, frames: number) => page.evaluate((n) => window.game!.step(n), frames);
const events = (page: Page) => page.evaluate(() => window.game!.events());
const WOOD = 'wood-rescue';
const WORDS = 'Winching up the walker';

/** The walker's place, as the game says it. */
const walker = async (page: Page) =>
  (await page.evaluate(() => window.game!.content().rescues)).find((r) => r.id === WOOD)!;

/**
 * The window held by the keys for `frames` frames: Space pressed and let go in turn, since a helicopter with nothing
 * held sinks and one with Space held climbs, and the window is ten metres tall. The rules are checked as it goes, and
 * the height it kept is told, so a test can say it was held in the window and not by luck at one end.
 */
async function holdByKeys(page: Page, frames: number, beat = 6) {
  let lowest = Infinity;
  let highest = -Infinity;
  for (let f = 0; f < frames; f += 2 * beat) {
    await page.keyboard.down('Space');
    await step(page, beat);
    await page.keyboard.up('Space');
    await step(page, beat);
    const { height } = (await state(page)).helicopter;
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
    expect(await page.evaluate(() => window.game!.invariants()), `frame ${f}`).toEqual([]);
  }
  return { lowest, highest };
}

/** The helicopter over the walker, `up` over the ground there, nothing held, the camera behind it. */
async function over(page: Page, up = 10) {
  const w = await walker(page);
  await page.evaluate(
    ([x, y, up]) => {
      const g = window.game!;
      g.release();
      g.teleport(x, y, up, 0);
    },
    [w.x, w.y, up] as const,
  );
}

test('the walker winched up by the keys: the loader fills, the rope is out and the smoke gone, then the level begins', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await step(page, 1);
  // nothing going: three people waiting, each with their smoke, no rope and no loader
  const before = await state(page);
  expect([before.people, before.smoke, before.rope]).toEqual([3, 3, false]);
  expect(before.winch).toEqual({ spot: null, share: 0 });
  await expect(page.locator('#hud .loader')).toBeHidden();
  await expect(page.locator('#hud .hint')).toBeVisible();

  // brought over the walker, hovering in the middle of the window, and held there a while
  await over(page);
  const kept = await holdByKeys(page, 84);
  expect(kept.lowest, 'held above the window\u2019s foot').toBeGreaterThanOrEqual(WINCH.low);
  expect(kept.highest, 'and under its top').toBeLessThanOrEqual(WINCH.high);
  const mid = await state(page);
  expect(mid.mission.level, 'not begun yet').toBeNull();
  expect(mid.winch.spot).toBe(WOOD);
  expect(mid.winch.share).toBeGreaterThan(0.3);
  expect(mid.winch.share).toBeLessThan(0.7);
  expect(mid.winch.share).toBeCloseTo(mid.mission.loading / WINCH.hold, 6);
  // the loader, filling, with who it is for; the rope drawn, the smoke out and the person off the ground
  const loader = page.locator('#hud .loader');
  await expect(loader).toBeVisible();
  await expect(loader.locator('.what')).toHaveText(WORDS);
  const filled = await loader.locator('.fill').evaluate((el: SVGElement) => parseFloat(el.style.strokeDasharray));
  expect(filled / (2 * Math.PI * 11)).toBeCloseTo(mid.winch.share, 1);
  expect([mid.rope, mid.smoke, mid.people]).toEqual([true, 2, 2]);

  // held to the end of the hold: begun and winched, told in that order, and the person aboard
  await holdByKeys(page, 120);
  expect(await events(page)).toEqual([`started ${WOOD}`, `winched ${WOOD}`]);
  await step(page, 1);
  const going = await state(page);
  expect(going.mission.level).toBe(WOOD);
  expect(going.mission.next).toBe(1);
  expect([going.rope, going.smoke, going.people], 'the person gone from the ground, and the rope away').toEqual([
    false,
    2,
    2,
  ]);
  expect(going.winch).toEqual({ spot: null, share: 0 });
  await expect(loader).toBeHidden();
  await expect(page.locator('#hud .goal')).toHaveText('Fly the walker to the home pad');
  await expect(page.locator('#hud .hint')).toBeHidden();
  // the clock runs from the lift-off, in game time
  const t0 = going.mission.time;
  await holdByKeys(page, 60);
  expect((await state(page)).mission.time).toBeGreaterThan(t0 + 0.9);
  await expect(page.locator('#hud .clock')).toHaveText(/^0:0\d$/);
  expect(problems).toEqual([]);
});

test('the winch broken off part way, by climbing out of the window: the loader empty, the smoke back, and it starts again', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await over(page);
  await page.evaluate((hover) => window.game!.fly(0, 0, hover), HOVER_LIFT);
  await step(page, 90);
  const part = await state(page);
  expect(part.winch.spot).toBe(WOOD);
  expect(part.winch.share).toBeGreaterThan(0.4);
  expect([part.rope, part.smoke, part.people]).toEqual([true, 2, 2]);
  await expect(page.locator('#hud .loader')).toBeVisible();

  // climbed out of the top of the window: the rope runs back
  await over(page, WINCH.high + 3);
  await page.evaluate((hover) => window.game!.fly(0, 0, hover), HOVER_LIFT);
  await step(page, 2);
  const broken = await state(page);
  expect(broken.winch).toEqual({ spot: null, share: 0 });
  expect(broken.mission.loading).toBe(0);
  expect([broken.rope, broken.smoke, broken.people], 'the smoke is back, the person on the ground').toEqual([
    false,
    3,
    3,
  ]);
  await expect(page.locator('#hud .loader')).toBeHidden();
  expect(await events(page)).toEqual([]);

  // back in the window: it starts from nothing, not from where it was
  await over(page);
  await page.evaluate((hover) => window.game!.fly(0, 0, hover), HOVER_LIFT);
  await step(page, 30);
  const again = await state(page);
  expect(again.winch.spot).toBe(WOOD);
  expect(again.winch.share).toBeLessThan(0.25);
  await page.evaluate(() => window.game!.release());
  expect(problems).toEqual([]);
});

test('the end on the home pad: the toast "Rescued!" with the time, and the best kept', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  // begun in the air over the walker: begun on the home pad it would end on the first step
  await over(page);
  await page.evaluate(() => window.game!.begin('wood-rescue'));
  await events(page);
  await step(page, 1);
  await expect(page.locator('#hud .goal')).toHaveText('Fly the walker to the home pad');
  await step(page, 120);
  await finish(page);
  const end = await state(page);
  expect([end.screen, end.mission.level]).toEqual(['flying', null]);
  expect(end.last).toMatchObject({ id: WOOD, best: true });
  expect(end.toast).toMatch(/^Rescued! \d:\d\d ★ New best$/);
  const toast = page.locator('#hud .toast');
  await expect(toast).toBeVisible();
  await expect(toast.locator('h2')).toHaveText('Rescued!');
  await expect(toast.locator('.t')).toHaveText(/^\d:\d\d · ★ New best$/);
  const told = await events(page);
  expect(told.at(-2)).toBe('landed 0');
  expect(told.at(-1)).toMatch(new RegExp(`^finished ${WOOD} \\d+\\.\\d\\d best$`));
  // kept, and shown in the panel's row, which wears the kind's label
  const save = await page.evaluate(() => window.game!.save());
  expect(save.best[WOOD]).toBeCloseTo(end.last!.seconds, 6);
  await page.keyboard.press('Escape');
  const row = page.locator('#panel .row.rescue').first();
  await expect(row.locator('.label')).toHaveText('Wood rescue');
  await expect(row.locator('.kind')).toHaveText('Rescue');
  await expect(row.locator('.kind svg')).toBeVisible();
  await expect(row.locator('.where')).toHaveText('Winch up the walker in the western wood');
  await expect(row.locator('.best')).toHaveText(/^\d:\d\d$/);
  expect(problems).toEqual([]);
});

test('the flare is particles: they rise while the person waits and stop when the winch begins, and come back if it is broken off', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  /** The flare's particles emitted over `frames` frames drawn, and how many flares were lit at the end. */
  const flares = (frames: number) =>
    page.evaluate((n) => {
      const g = window.game!;
      let born = 0;
      for (let f = 0; f < n; f++) {
        g.stepDrawn(1);
        born += g.state().particles.flares;
      }
      return { born, lit: g.state().smoke };
    }, frames);
  // the camera by the walker, so the flare is in range: waiting, the person's flare rises, and no other is near enough
  const w = await walker(page);
  await page.evaluate(([x, y]) => window.game!.look(x, y, { azimuth: -2.2, polar: 1.15, radius: 120 }), [
    w.x,
    w.y,
  ] as const);
  const waiting = await flares(120);
  expect(waiting.lit).toBe(3);
  expect(waiting.born, 'the flare rises while they wait').toBeGreaterThan(30);
  // winched: held in the window, the loader part way; the flare is out
  await over(page);
  await page.evaluate((hover) => window.game!.fly(0, 0, hover), HOVER_LIFT);
  await page.evaluate(() => window.game!.stepDrawn(60));
  const rope = await state(page);
  expect([rope.winch.spot, rope.smoke]).toEqual([WOOD, 2]);
  // from the first frame of the winch on, none is born; the particles already in the air fade on their own
  const winching = await flares(60);
  expect(winching.born, 'none is born while the person is on the rope').toBe(0);
  expect(winching.lit).toBe(2);
  // broken off by climbing out of the window: the flare is lit again
  await page.evaluate(() =>
    window.game!.teleport(window.game!.state().helicopter.x, window.game!.state().helicopter.y, 40),
  );
  const back = await flares(120);
  expect(back.lit).toBe(3);
  expect(back.born).toBeGreaterThan(30);
  await page.evaluate(() => window.game!.release());
  expect((await state(page)).particles.refused).toBe(0);
  expect(problems).toEqual([]);
});

test('holding the window over a person while another level goes does nothing', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await page.evaluate(() => window.game!.begin('first-delivery'));
  await events(page);
  await over(page);
  await page.evaluate((hover) => window.game!.fly(0, 0, hover), HOVER_LIFT);
  await step(page, Math.ceil((WINCH.hold + 1) * 60));
  const held = await state(page);
  expect(held.mission.level).toBe('first-delivery');
  expect(held.winch).toEqual({ spot: null, share: 0 });
  expect([held.rope, held.smoke, held.people], 'nobody is lifted, and the smoke still rises').toEqual([false, 3, 3]);
  expect(await events(page)).toEqual([]);
  await expect(page.locator('#hud .loader')).toBeHidden();
  await page.evaluate(() => window.game!.release());
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the walker winched up by touch: the lever at its stop holds the window, and the loader is in view', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate((id) => window.game!.play(id), WOOD);
    await step(page, 1);
    const travel = await leverTravel(page);
    const hand = await fingers(page);
    await hand.down(2, 330, 680);
    await hand.move(2, 330, 680 - (HOVER_LIFT * travel) / 2);
    expect((await state(page)).input.lever).toBe(HOVER_LIFT);
    await step(page, 80);
    const mid = await state(page);
    expect(mid.winch.spot).toBe(WOOD);
    expect(mid.winch.share).toBeGreaterThan(0.3);
    const loader = page.locator('#hud .loader');
    await expect(loader).toBeVisible();
    await expect(loader.locator('.what')).toHaveText(WORDS);
    const box = (await loader.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(0);
    await step(page, 120);
    await hand.up(2);
    expect(await events(page)).toEqual([`started ${WOOD}`, `winched ${WOOD}`]);
    await step(page, 1);
    await expect(page.locator('#hud .goal')).toHaveText('Fly the walker to the home pad');
    expect(problems).toEqual([]);
  });
});
