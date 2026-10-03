/**
 * The rescues in the page: the walker in the western wood rescued by landing beside them, the loader "The walker climbs
 * aboard" filling while the helicopter stays down, then told started and boarded, the person gone from the ground and
 * the bar saying where they are to be flown; hovering over them, which does nothing; a boarding broken off by lifting
 * off, which empties the loader; the end on the home pad, with the toast and the best kept; the sailor in the boat off the
 * east beach winched up by holding the window over the sea, the boat there until they are aboard and the rope drawn; a
 * person left alone while another level goes; and a boarding by touch on a phone, the loader in view. The helicopter is
 * put beside or over the person through the test API, and what it does from there is the controls'. Stepped, never waited on.
 */
import { expect, test, type Page } from '@playwright/test';
import { HOVER_LIFT } from '../src/helicopter';
import { BOARD, WINCH } from '../src/mission';
import { fingers, finish, leverTravel, start, watch } from './game';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const step = (page: Page, frames: number) => page.evaluate((n) => window.game!.step(n), frames);
const events = (page: Page) => page.evaluate(() => window.game!.events());
const WOOD = 'wood-rescue';
const BOAT = 'boat-rescue';
const BOARDING = 'The walker climbs aboard';

/** A person's place, as the game says it. */
const person = async (page: Page, id: string) =>
  (await page.evaluate(() => window.game!.content().rescues)).find((r) => r.id === id)!;
const walker = (page: Page) => person(page, WOOD);

/**
 * The window held by the keys for `frames` frames: a helicopter with nothing held hangs where it is, so Space and Shift
 * are pressed in turn, a short beat each, to nudge it up and down as a player's thumbs do, and the window is ten metres
 * tall. The rules are checked as it goes, and
 * the height it kept is told, so a test can say it was held in the window and not by luck at one end.
 */
async function holdByKeys(page: Page, frames: number, beat = 6) {
  let lowest = Infinity;
  let highest = -Infinity;
  for (let f = 0; f < frames; f += 2 * beat) {
    await page.keyboard.down('Space');
    await step(page, beat);
    await page.keyboard.up('Space');
    await page.keyboard.down('Shift');
    await step(page, beat);
    await page.keyboard.up('Shift');
    const { height } = (await state(page)).helicopter;
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
    expect(await page.evaluate(() => window.game!.invariants()), `frame ${f}`).toEqual([]);
  }
  return { lowest, highest };
}

/** The helicopter over the person of `id`, `up` over the ground there, nothing held, the camera behind it. */
async function over(page: Page, id = WOOD, up = 10) {
  const w = await person(page, id);
  await page.evaluate(
    ([x, y, up]) => {
      const g = window.game!;
      g.release();
      g.teleport(x, y, up, 0);
    },
    [w.x, w.y, up] as const,
  );
}

test('the walker rescued by landing beside them: the loader fills while it stays down, the smoke goes, then the level begins', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await step(page, 1);
  // nothing going: three people waiting, each with their smoke, no rope and no loader, and the walker is landed beside, not winched
  const before = await state(page);
  expect([before.people, before.smoke, before.rope, before.boats]).toEqual([3, 3, false, 1]);
  expect(before.board).toEqual({ spot: null, share: 0 });
  expect((await walker(page)).by).toBe('land');
  await expect(page.locator('#hud .loader')).toBeHidden();
  await expect(page.locator('#hud .hint')).toBeVisible();

  // put down beside the walker, which staying begins
  await page.evaluate((id) => window.game!.play(id), WOOD);
  await step(page, 1);
  expect((await state(page)).helicopter.landed).toBe(true);
  await step(page, Math.round((BOARD.hold / 2) * 60));
  const mid = await state(page);
  expect(mid.mission.level, 'not begun yet').toBeNull();
  expect(mid.board.spot).toBe(WOOD);
  expect(mid.board.share).toBeGreaterThan(0.3);
  expect(mid.board.share).toBeLessThan(0.7);
  expect(mid.winch).toEqual({ spot: null, share: 0 });
  // the loader, filling, with who it is for; no rope, the person still on the ground
  const loader = page.locator('#hud .loader');
  await expect(loader).toBeVisible();
  await expect(loader.locator('.what')).toHaveText(BOARDING);
  await expect(loader).toHaveAttribute('data-kind', 'board');
  const filled = await loader.locator('.fill').evaluate((el: SVGElement) => parseFloat(el.style.strokeDasharray));
  expect(filled / (2 * Math.PI * 11)).toBeCloseTo(mid.board.share, 1);
  expect([mid.rope, mid.smoke, mid.people]).toEqual([false, 3, 3]);

  // stayed to the end of the hold: begun and boarded, told in that order, and the person aboard
  await step(page, Math.round(BOARD.hold * 60));
  expect(await events(page)).toEqual([`started ${WOOD}`, `boarded ${WOOD}`]);
  await step(page, 1);
  const going = await state(page);
  expect(going.mission.level).toBe(WOOD);
  expect(going.mission.next).toBe(1);
  expect([going.rope, going.smoke, going.people], 'the person gone from the ground').toEqual([false, 2, 2]);
  expect(going.board).toEqual({ spot: null, share: 0 });
  await expect(loader).toBeHidden();
  await expect(page.locator('#hud .goal')).toHaveText('Fly the walker to the home pad');
  await expect(page.locator('#hud .hint')).toBeHidden();
  // the clock runs from the boarding, in game time
  const t0 = going.mission.time;
  await step(page, 60);
  expect((await state(page)).mission.time).toBeGreaterThan(t0 + 0.9);
  await expect(page.locator('#hud .clock')).toHaveText(/^0:0\d$/);
  expect(problems).toEqual([]);
});

test('hovering over the walker, low or high, does nothing: only landing beside them is a rescue', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  // held in the middle of the winch's old window over them, for far longer than a boarding or a winch takes
  await over(page);
  const kept = await holdByKeys(page, 300);
  expect(kept.lowest).toBeGreaterThanOrEqual(WINCH.low);
  const held = await state(page);
  expect(held.mission.level).toBeNull();
  expect([held.board, held.winch]).toEqual([
    { spot: null, share: 0 },
    { spot: null, share: 0 },
  ]);
  expect([held.rope, held.smoke, held.people]).toEqual([false, 3, 3]);
  expect(await events(page)).toEqual([]);
  await expect(page.locator('#hud .loader')).toBeHidden();
  // and low, a few metres up, held still
  await over(page, WOOD, 4);
  await page.evaluate((hover) => window.game!.fly(0, 0, hover), HOVER_LIFT);
  await step(page, Math.ceil((BOARD.hold + 2) * 60));
  expect((await state(page)).mission.level).toBeNull();
  expect(await events(page)).toEqual([]);
  await page.evaluate(() => window.game!.release());
  expect(problems).toEqual([]);
});

test('the boarding broken off part way, by lifting off: the loader empty, the person still waiting, and it starts again', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await page.evaluate((id) => window.game!.play(id), WOOD);
  await step(page, Math.round(BOARD.hold * 0.6 * 60));
  const part = await state(page);
  expect(part.board.spot).toBe(WOOD);
  expect(part.board.share).toBeGreaterThan(0.4);
  await expect(page.locator('#hud .loader')).toBeVisible();

  // lifted off: the boarding runs back
  await page.evaluate(() => window.game!.fly(0, 0, 1));
  await step(page, 40);
  await page.evaluate(() => window.game!.release());
  const broken = await state(page);
  expect(broken.helicopter.landed).toBe(false);
  expect(broken.board).toEqual({ spot: null, share: 0 });
  expect(broken.mission.level).toBeNull();
  expect([broken.smoke, broken.people], 'the person is still waiting').toEqual([3, 3]);
  await expect(page.locator('#hud .loader')).toBeHidden();
  expect(await events(page)).toEqual([]);

  // set down beside them again: it starts from nothing, not from where it was
  await page.evaluate((id) => window.game!.play(id), WOOD);
  await step(page, 30);
  const again = await state(page);
  expect(again.board.spot).toBe(WOOD);
  expect(again.board.share).toBeLessThan(0.25);
  expect(problems).toEqual([]);
});

test('the end on the home pad: the toast "Rescued!" with the time, and the best kept', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  // begun beside the walker: begun on the home pad it would end on the first step
  await page.evaluate((id) => window.game!.play(id), WOOD);
  await step(page, Math.round((BOARD.hold + 1) * 60));
  await events(page);
  await expect(page.locator('#hud .goal')).toHaveText('Fly the walker to the home pad');
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
  await expect(row.locator('.where')).toHaveText('Land beside the walker in the western wood');
  await expect(row.locator('.best')).toHaveText(/^\d:\d\d$/);
  expect(problems).toEqual([]);
});

test('the sailor winched up from the boat by holding the window over the sea: the boat there, the rope out, the loader in the winch’s words', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await step(page, 1);
  const sailor = await person(page, BOAT);
  expect([sailor.by, sailor.who, sailor.where]).toEqual(['winch', 'the sailor', 'off the east beach']);
  expect(sailor.yaw).toBe(3);
  expect((await state(page)).boats).toBe(1);

  // brought over the boat, hovering in the window over the sea, and held there a while
  await over(page, BOAT);
  const kept = await holdByKeys(page, 84);
  expect(kept.lowest, 'held above the window’s foot').toBeGreaterThanOrEqual(WINCH.low);
  expect(kept.highest, 'and under its top').toBeLessThanOrEqual(WINCH.high);
  const mid = await state(page);
  expect(mid.mission.level, 'not begun yet').toBeNull();
  expect(mid.winch.spot).toBe(BOAT);
  expect(mid.winch.share).toBeGreaterThan(0.3);
  expect(mid.winch.share).toBeLessThan(0.7);
  const loader = page.locator('#hud .loader');
  await expect(loader).toBeVisible();
  await expect(loader.locator('.what')).toHaveText('Winching up the sailor');
  // the rope out, the sailor off the boat and the boat still there under the rope
  expect([mid.rope, mid.smoke, mid.people, mid.boats]).toEqual([true, 2, 2, 1]);

  // held to the end of the hold: begun and winched, the sailor aboard, and the boat left on the sea empty
  await holdByKeys(page, 120);
  expect(await events(page)).toEqual([`started ${BOAT}`, `winched ${BOAT}`]);
  await step(page, 1);
  const going = await state(page);
  expect(going.mission.level).toBe(BOAT);
  expect([going.rope, going.smoke, going.people, going.boats]).toEqual([false, 2, 2, 1]);
  await expect(loader).toBeHidden();
  await expect(page.locator('#hud .goal')).toHaveText('Fly the sailor to the home pad');
  await page.evaluate(() => window.game!.release());
  expect(problems).toEqual([]);
});

test('landing near the boat does nothing: the sailor is winched, and there is no ground to land on', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  const sailor = await person(page, BOAT);
  // let down onto the sea beside the boat: it hovers over the water and is never landed, so nothing boards
  await page.evaluate(
    ([x, y]) => {
      const g = window.game!;
      g.release();
      g.teleport(x + 6, y, 20, 0);
    },
    [sailor.x, sailor.y] as const,
  );
  await page.evaluate(() => window.game!.fly(0, 0, 0));
  await step(page, Math.ceil((BOARD.hold + 3) * 60));
  const now = await state(page);
  expect(now.helicopter).toMatchObject({ overWater: true, landed: false });
  expect([now.mission.level, now.board.spot]).toEqual([null, null]);
  expect(await events(page)).toEqual([]);
  await page.evaluate(() => window.game!.release());
  expect(problems).toEqual([]);
});

test('the flare is particles: they rise while the person waits and stop when the boarding is done, and are lit again after the level ends', async ({
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
  // boarded: the level begins and the person is aboard, so their flare is out
  await page.evaluate((id) => window.game!.play(id), WOOD);
  await page.evaluate(() => window.game!.stepDrawn(Math.round((3 + 1) * 60)));
  expect((await state(page)).mission.level).toBe(WOOD);
  await page.evaluate(([x, y]) => window.game!.look(x, y, { azimuth: -2.2, polar: 1.15, radius: 120 }), [
    w.x,
    w.y,
  ] as const);
  const aboard = await flares(60);
  expect(aboard.lit).toBe(2);
  expect(aboard.born, 'none is born for a person aboard').toBe(0);
  // given up: they are back on the ground, and the flare is lit again
  await page.evaluate(() => window.game!.abandon());
  const back = await flares(120);
  expect(back.lit).toBe(3);
  expect(back.born).toBeGreaterThan(30);
  expect((await state(page)).particles.refused).toBe(0);
  expect(problems).toEqual([]);
});

test('landing beside a person while another level goes does nothing', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await page.evaluate(() => window.game!.begin('first-delivery'));
  await events(page);
  const w = await walker(page);
  // put down beside the walker, and left there for far longer than the boarding takes
  await page.evaluate(
    ([x, y]) => {
      const g = window.game!;
      g.release();
      g.teleport(x + 6, y, 0, 0);
    },
    [w.x, w.y] as const,
  );
  await step(page, Math.ceil((BOARD.hold + 1) * 60));
  const held = await state(page);
  expect(held.mission.level).toBe('first-delivery');
  expect(held.board).toEqual({ spot: null, share: 0 });
  expect([held.rope, held.smoke, held.people], 'nobody is lifted, and the smoke still rises').toEqual([false, 3, 3]);
  expect(await events(page)).toEqual([]);
  await expect(page.locator('#hud .loader')).toBeHidden();
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the walker boarded by touch: set down beside them, the loader is in view, and nothing is held', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate((id) => window.game!.play(id), WOOD);
    await step(page, 80);
    const mid = await state(page);
    expect(mid.board.spot).toBe(WOOD);
    expect(mid.board.share).toBeGreaterThan(0.3);
    const loader = page.locator('#hud .loader');
    await expect(loader).toBeVisible();
    await expect(loader.locator('.what')).toHaveText(BOARDING);
    const box = (await loader.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(0);
    await step(page, 120);
    expect(await events(page)).toEqual([`started ${WOOD}`, `boarded ${WOOD}`]);
    await step(page, 1);
    await expect(page.locator('#hud .goal')).toHaveText('Fly the walker to the home pad');
    expect(problems).toEqual([]);
  });

  test('the sailor winched by touch: the lever at its stop holds the window over the sea, and the loader is in view', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate((id) => window.game!.play(id), BOAT);
    await step(page, 1);
    const travel = await leverTravel(page);
    const hand = await fingers(page);
    await hand.down(2, 330, 680);
    await hand.move(2, 330, 680 - (HOVER_LIFT * travel) / 2);
    expect((await state(page)).input.lever).toBe(HOVER_LIFT);
    await step(page, 80);
    const mid = await state(page);
    expect(mid.winch.spot).toBe(BOAT);
    const loader = page.locator('#hud .loader');
    await expect(loader).toBeVisible();
    await expect(loader.locator('.what')).toHaveText('Winching up the sailor');
    const box = (await loader.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await step(page, 120);
    await hand.up(2);
    expect(await events(page)).toEqual([`started ${BOAT}`, `winched ${BOAT}`]);
    expect(problems).toEqual([]);
  });
});
