/**
 * The hidden packages, in the page: a helicopter let down beside one by the keys finds it, with the event, the toast
 * and the crate gone; one let down 20 m away finds nothing; the radar's badge is quiet beyond 100 m of every package,
 * heard within it, and its pings come faster the nearer the package is; a reload keeps what is found, in the save, the
 * crates and the panel's dots; a save from before there were packages loads with none, and one with a name the game
 * lacks keeps it uncounted; and on a phone one is found by touch with the badge in view at the top right. The helicopter
 * is set a short way from the package through the test API, and what it does from there is the controls'. Stepped,
 * never waited on.
 */
import { expect, test, type Page } from '@playwright/test';
import { RADAR, radarInterval } from '../src/finds';
import { RADAR_RING, RADAR_STEPS } from '../src/hud';
import { HOVER_LIFT } from '../src/helicopter';
import { fingers, ready, start, watch } from './game';

/** The package these tests find: its nearest neighbour is 130 m and more from where a helicopter let down by it lands. */
const ID = 'east-wood';
const WORDS = 'Package found · 1 of 10';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const step = (page: Page, frames: number) => page.evaluate((n) => window.game!.step(n), frames);
const events = (page: Page) => page.evaluate(() => window.game!.events());
const place = async (page: Page, id = ID) =>
  (await page.evaluate(() => window.game!.content().packages)).find((p) => p.id === id)!;

/** The helicopter `aside` metres from a package along the x axis and `up` over the ground there, hovering, nothing held. */
async function hoverBeside(page: Page, id: string, aside: number, up: number) {
  const p = await place(page, id);
  await page.evaluate(
    ([x, y, up]) => {
      const g = window.game!;
      g.teleport(x, y, up, 0);
      g.release();
    },
    [p.x + aside, p.y, up] as const,
  );
}

/** Frames of five stepped until `done` or `limit` frames have gone, the rules checked as it goes. */
async function until(page: Page, done: () => Promise<boolean>, limit = 600) {
  for (let f = 0; f < limit && !(await done()); f += 5) {
    await step(page, 5);
    expect(await page.evaluate(() => window.game!.invariants()), `frame ${f}`).toEqual([]);
  }
}

/** Stepped a frame at a time until a ping falls due on a step, which is the one the page last drew. */
async function pinged(page: Page, limit = 300) {
  for (let f = 0; f < limit && !(await state(page)).radar.pinged; f++) await step(page, 1);
  expect((await state(page)).radar.pinged, 'a ping fell due').toBe(true);
}

/** Let down by the keys: Shift held, which is down on the lever, until the skids are on the ground. */
async function letDown(page: Page) {
  await page.keyboard.down('Shift');
  await until(page, async () => (await state(page)).helicopter.landed);
  await page.keyboard.up('Shift');
}

test('let down within 15 m of a package by the keys: told, shown in a toast, the crate gone and the radar quiet; 20 m away, nothing', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await step(page, 1);
  expect((await state(page)).found).toEqual([]);
  expect((await state(page)).crates, 'a crate on each place').toBe(10);
  await expect(page.locator('#hud .toast')).toBeHidden();

  // 20 m away: let down on the ground, and nothing
  await hoverBeside(page, ID, 20, 12);
  await letDown(page);
  expect((await state(page)).helicopter.landed).toBe(true);
  await step(page, 60);
  expect(await events(page)).toEqual([]);
  const away = await state(page);
  expect([away.found, away.crates, away.toast]).toEqual([[], 10, null]);

  // within 15: hovering right over it finds nothing, and the skids down beside it find it at once
  await hoverBeside(page, ID, 10, 14);
  await step(page, 20);
  expect((await state(page)).helicopter.landed).toBe(false);
  expect(await events(page)).toEqual([]);
  await letDown(page);
  expect(await events(page)).toEqual([`found ${ID} 1 10`]);
  await step(page, 1);
  const found = await state(page);
  expect(found.found).toEqual([ID]);
  expect(found.toast).toBe(WORDS);
  expect(found.crates, 'the crate is gone').toBe(9);
  expect(found.radar.nearest, 'no other package is in range').toBe(-1);
  expect(found.radar.badge).toBe('quiet');
  await expect(page.locator('#hud .radar')).toHaveAttribute('data-state', 'quiet');
  const toast = page.locator('#hud .toast');
  await expect(toast).toBeVisible();
  await expect(toast.locator('h2')).toHaveText('Package found');
  await expect(toast.locator('.t')).toHaveText('1 of 10');

  // the toast goes of itself after three seconds of game time
  await step(page, 150);
  await expect(toast).toBeVisible();
  await step(page, 40);
  expect((await state(page)).toast).toBeNull();
  await expect(toast).toBeHidden();

  // set down again where it was: found once, so nothing is told again
  await hoverBeside(page, ID, 5, 14);
  await letDown(page);
  await step(page, 30);
  expect(await events(page)).toEqual([]);
  expect((await state(page)).found).toEqual([ID]);
  expect(problems).toEqual([]);
});

test('the radar: quiet at 101 m from every package, heard at 60, and its pings faster at 15 m than at 80', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  const packages = await page.evaluate(() => window.game!.content().packages);
  const bounds = await page.evaluate(() => window.game!.content().bounds);
  expect(RADAR.range).toBe(100);

  /**
   * The helicopter `d` from the package `id`, in whichever direction puts it inside the bounds and no nearer to any other
   * package than that; hovering there with the lift held, and a frame stepped. The radar and the badge as the page says.
   */
  const at = (id: string, d: number) =>
    page.evaluate(
      ([id, d, packages, bounds, hover]) => {
        const g = window.game!;
        const p = packages.find((q) => q.id === id)!;
        for (let k = 0; k < 32; k++) {
          const a = (k / 32) * Math.PI * 2;
          const [x, y] = [p.x + d * Math.cos(a), p.y + d * Math.sin(a)];
          if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
          if (packages.some((q) => q !== p && Math.hypot(q.x - x, q.y - y) < d)) continue;
          g.teleport(x, y, 25, 0);
          g.fly(0, 0, hover);
          g.step(1);
          return g.state().radar;
        }
        throw new Error(`no way to stand ${d} from ${id}`);
      },
      [id, d, packages, bounds, HOVER_LIFT] as const,
    );

  for (const p of packages) {
    const quiet = await at(p.id, 101);
    expect(quiet, `101 m from ${p.id}`).toMatchObject({ nearest: -1, badge: 'quiet', step: 0 });
  }
  await expect(page.locator('#hud .radar')).toHaveAttribute('data-state', 'quiet');
  expect((await at(ID, 100)).nearest, 'heard at the edge').toBeCloseTo(100, 3);
  const heard = await at(ID, 60);
  expect(heard.nearest).toBeCloseTo(60, 3);
  expect(heard.badge).toBe('heard');
  await expect(page.locator('#hud .radar')).toHaveAttribute('data-state', 'heard');

  // pings counted over the same twelve game seconds, nearer faster, and each near the rate the curve says (a ping can only
  // fall on a step, and the first is an interval after the package is heard, so a count may be a ping short or over)
  const pings = (id: string, d: number) =>
    at(id, d).then(() =>
      page.evaluate((frames) => {
        const g = window.game!;
        let n = 0;
        for (let f = 0; f < frames; f++) {
          g.step(1);
          if (g.state().radar.pinged) n++;
        }
        return n;
      }, 720),
    );
  const near = await pings(ID, 15);
  const far = await pings(ID, 80);
  expect(near).toBeGreaterThan(far);
  expect(Math.abs(near - 12 / radarInterval(15))).toBeLessThanOrEqual(2);
  expect(Math.abs(far - 12 / radarInterval(80))).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test("the radar's ring follows game time: begun at a ping, a step further each stretch of the clock, and gone when spent", async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  // 95 m out, where pings are further apart than a ring lives, so each ring has its life to itself
  expect(radarInterval(95)).toBeGreaterThan(RADAR_RING);
  await page.evaluate(
    ([id, hover]) => {
      const g = window.game!;
      const p = g.content().packages.find((q) => q.id === id)!;
      g.teleport(p.x + 95, p.y, 25, 0);
      g.fly(0, 0, hover);
    },
    [ID, HOVER_LIFT] as const,
  );
  await pinged(page);
  const at = async () => (await state(page)).radar;
  expect(await at(), 'a ring begun at the ping').toMatchObject({ pinged: true, badge: 'heard', step: 1 });
  // the same stretch of game time is the same step, however it is stepped
  await step(page, 26);
  expect((await at()).step).toBe(3);
  await step(page, 14);
  expect((await at()).step).toBe(5);
  await step(page, 17);
  expect((await at()).step).toBe(0);
  // the page is written at the step: the ring's opacity is what the step says, and nothing at its end
  const opacities = () =>
    page.locator('#hud .radar .ring').evaluateAll((all) => all.map((el) => +getComputedStyle(el).opacity));
  expect(Math.max(...(await opacities()))).toBe(0);
  await pinged(page);
  expect(Math.max(...(await opacities()))).toBeGreaterThan(0.5);
  expect(RADAR_STEPS).toBeGreaterThan(1);
  expect(problems).toEqual([]);
});

test("a reload keeps it found: the save, the crates gone and the panel's dots", async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await hoverBeside(page, ID, 8, 14);
  await letDown(page);
  expect(await events(page)).toEqual([`found ${ID} 1 10`]);
  await page.reload();
  await ready(page);
  const after = await state(page);
  expect(after.found).toEqual([ID]);
  expect((await page.evaluate(() => window.game!.save())).found).toEqual([ID]);
  // nothing is told for it again and no toast: it was found in the last visit
  await step(page, 1);
  const kept = await state(page);
  expect([kept.toast, kept.crates]).toEqual([null, 9]);
  expect(await events(page)).toEqual([]);
  await expect(page.locator('#hud .toast')).toBeHidden();
  // the panel, shown fresh: one of ten, one dot filled
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel .packs h3')).toHaveText('Packages1 of 10');
  await expect(page.locator('#panel .packs .d')).toHaveCount(10);
  await expect(page.locator('#panel .packs .d.got')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('a save from before there were packages loads with none found: ten crates and a panel at none of ten', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: '{"best":{"first-delivery":41.2}}' });
  await step(page, 1);
  const old = await state(page);
  expect([old.found, old.crates]).toEqual([[], 10]);
  expect((await page.evaluate(() => window.game!.save())).best).toEqual({ 'first-delivery': 41.2 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel .packs h3')).toHaveText('Packages0 of 10');
  await expect(page.locator('#panel .packs .d.got')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('a save with packages in it loads them, a name the game lacks kept and not counted', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {}, found: [ID, 'from-a-later-game'] } });
  await step(page, 1);
  const kept = await state(page);
  expect([kept.found, kept.crates]).toEqual([[ID, 'from-a-later-game'], 9]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel .packs h3')).toHaveText('Packages1 of 10');
  await expect(page.locator('#panel .packs .d.got')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("found by touch: told, the toast on the screen, the badge in view at the top right and clear of the controls, and the panel's line", async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await step(page, 1);
    const p = await place(page);
    // 8 m before it, 12 up, facing it: the left thumb pushes the stick a little and lifts, and the lever, left at the
    // sink, lets the helicopter down
    await page.evaluate(([x, y]) => window.game!.teleport(x - 8, y, 12, 0), [p.x, p.y] as const);
    const hand = await fingers(page);
    await hand.down(1, 100, 690);
    await hand.move(1, 100, 670);
    await step(page, 20);
    await hand.up(1);
    expect((await state(page)).input.by).toBe('touch');
    await until(page, async () => (await state(page)).helicopter.landed);
    expect(await events(page)).toEqual([`found ${ID} 1 10`]);
    await step(page, 1);
    expect((await state(page)).toast).toBe(WORDS);
    expect((await state(page)).crates).toBe(9);
    const toast = (await page.locator('#hud .toast').boundingBox())!;
    expect(toast.x, 'the toast on the screen').toBeGreaterThanOrEqual(0);
    expect(toast.x + toast.width).toBeLessThanOrEqual(390);

    // the badge: in the top right corner, whole, and apart from the toast, the corner button and every touch control
    const badge = (await page.locator('#hud .radar').boundingBox())!;
    expect(badge.width).toBe(44);
    expect(badge.height).toBe(44);
    expect(badge.x + badge.width).toBeGreaterThan(390 - 20);
    expect(badge.x + badge.width).toBeLessThanOrEqual(390);
    expect(badge.y).toBeGreaterThanOrEqual(0);
    expect(badge.y).toBeLessThan(20);
    const apart = (a: { x: number; y: number; width: number; height: number }) =>
      a.x + a.width <= badge.x ||
      badge.x + badge.width <= a.x ||
      a.y + a.height <= badge.y ||
      badge.y + badge.height <= a.y;
    expect(apart(toast), 'clear of the toast').toBe(true);
    expect(apart((await page.locator('#hud .to-levels').boundingBox())!), 'clear of the levels button').toBe(true);
    for (const control of ['#touch .track', '#touch .handle']) {
      const box = await page.locator(control).boundingBox();
      if (box) expect(apart(box), `clear of ${control}`).toBe(true);
    }

    // the panel by its corner button
    await page.locator('#hud .to-levels').tap();
    await expect(page.locator('#panel')).toBeVisible();
    await page.locator('#panel .packs').scrollIntoViewIfNeeded();
    await expect(page.locator('#panel .packs h3')).toHaveText('Packages1 of 10');
    const dots = await page.locator('#panel .packs .dots').boundingBox();
    expect(dots!.x + dots!.width, 'the dots on the screen').toBeLessThanOrEqual(390);
    expect(problems).toEqual([]);
  });
});
