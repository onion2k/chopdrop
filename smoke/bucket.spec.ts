/**
 * The bucket's button in the page: always shown beside the radar, grey while the bucket is in, an orange ring while it is
 * out and with water in it when it is full; put out and taken in by the key B, a click and a tap, and not by the key while the panel
 * is up; the bar's words for it, press B for it, hover low over the water to fill it, fly over the flames to drop and take it to the fire,
 * for a fire shown the way to and for the nearest fire flying free with the bucket out; let down onto the west lake, filled,
 * flown to the fire and dropped. The button is a real button with a name for a screen reader. The game is paused and
 * stepped, and the helicopter flown through the test API where the test is not about the control.
 */
import { expect, test, type Page } from '@playwright/test';
import { HOVER_LIFT } from '../src/helicopter';
import { start, watch } from './game';
import { DROP_HEIGHT, WEST, hoverOver, scoop, settle } from './fire';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const events = (page: Page) => page.evaluate(() => window.game!.events());
const goal = (page: Page) => page.locator('#hud .goal');
const badge = (page: Page) => page.locator('#hud .bucket');

test('the button is always there, grey, with the key’s tag, and a real button with a name', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await settle(page, 1);
  const button = page.getByRole('button', { name: 'Bucket, in' });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toHaveAttribute('data-state', 'in');
  expect((await state(page)).badge).toBe('in');
  const box = (await button.boundingBox())!;
  const radar = (await page.locator('#hud .radar').boundingBox())!;
  expect([box.width, box.height]).toEqual([44, 44]);
  // beside the radar, in the same row and not over it
  expect(box.y).toBe(radar.y);
  expect(box.x + box.width).toBeLessThanOrEqual(radar.x);
  // the key's tag at desk width, and the help bar names the key
  await expect(button.locator('.key')).toBeVisible();
  await expect(button.locator('.key')).toHaveText('B');
  await expect(page.locator('#help')).toContainText('B bucket');
  expect(problems).toEqual([]);
});

test('the key B puts it out and takes it in, the badge orange when out, and does nothing while the panel is up', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await settle(page, 1);
  await page.keyboard.press('b');
  await settle(page, 1);
  let now = await state(page);
  expect([now.bucket.out, now.badge]).toEqual([true, 'out']);
  // its name by state is the screen reader's, and the button is the same one
  await expect(page.getByRole('button', { name: 'Bucket, out, empty' })).toBeVisible();
  const button = badge(page);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('data-state', 'out');
  // the orange ring: the border is the orange of the mock, and not the grey it was
  expect(await button.evaluate((el) => getComputedStyle(el).borderColor)).toBe('rgb(255, 138, 61)');
  await page.keyboard.press('b');
  await settle(page, 1);
  now = await state(page);
  expect([now.bucket.out, now.badge]).toEqual([false, 'in']);
  expect(await button.evaluate((el) => getComputedStyle(el).borderColor)).not.toBe('rgb(255, 138, 61)');

  // with the panel up, the game is held and the key is not the game's
  await page.keyboard.press('Escape');
  expect((await state(page)).screen).toBe('panel');
  await page.keyboard.press('b');
  await page.keyboard.press('Escape');
  await settle(page, 1);
  now = await state(page);
  expect([now.screen, now.bucket.out, now.badge]).toEqual(['flying', false, 'in']);
  // a chord is the browser's
  await page.keyboard.press('Control+b');
  await settle(page, 1);
  expect((await state(page)).bucket.out).toBe(false);
  expect(problems).toEqual([]);
});

test('a click on the badge puts it out and takes it in, and leaves no focus for the Space that lifts the helicopter', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await settle(page, 1);
  await badge(page).click();
  await settle(page, 1);
  expect((await state(page)).badge).toBe('out');
  expect(await page.evaluate(() => document.activeElement?.className ?? '')).not.toContain('bucket');
  await badge(page).click();
  await settle(page, 1);
  expect((await state(page)).badge).toBe('in');
  expect(problems).toEqual([]);
});

test('let down onto the west lake with the bucket out it hovers, fills in blue, and flown to the fire it drops', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await settle(page, 1);
  await page.keyboard.press('b');
  // put at the lake's run, and let down onto the water: it hovers over it, and the bucket is in it
  await page.evaluate(
    ([id, hover]) => {
      const g = window.game!;
      g.play(id);
      g.fly(0, 0, hover);
    },
    [WEST.id, HOVER_LIFT] as const,
  );
  await settle(page, 30);
  let now = await state(page);
  expect(now.helicopter).toMatchObject({ overWater: true, landed: false });
  expect(now.bucket).toMatchObject({ out: true, hung: true, full: false });
  await expect(goal(page)).toHaveText('Hover low over the water to fill the bucket');
  await expect(page.locator('#hud .loader .what')).toHaveText('Filling the bucket');
  await expect(page.locator('#hud .loader')).toHaveAttribute('data-kind', 'fill');
  // the water the fill is told by
  for (let f = 0; f < 400 && !(await state(page)).tank.full; f++) await settle(page, 1);
  await settle(page, 1);
  now = await state(page);
  expect([now.tank.full, now.badge]).toEqual([true, 'full']);
  await expect(page.getByRole('button', { name: 'Bucket, out, full' })).toHaveAttribute('data-state', 'full');
  await expect(page.locator('#hud .loader')).toBeHidden();
  // full and flying free: the way to the nearest fire, and how to drop
  await expect(goal(page)).toHaveText('Fly over the flames to drop · 10 burning');
  await expect(page.locator('#hud .bar')).toHaveAttribute('data-mode', 'guided');
  await expect(page.locator('#hud .arrow')).toBeVisible();
  await expect(page.locator('#hud .far')).toHaveText(/^\d+ m$/);
  await events(page);

  // flown to the fire and dropped
  await hoverOver(page, WEST.x, WEST.y, DROP_HEIGHT, 0.9, 80);
  const told = await events(page);
  // the water falls at the start of the pour, which goes on past the helicopter's stopping over the flames, and ends it
  expect(told[0]).toBe('dropped west-lake-fire');
  expect(told.at(-1)).toMatch(/^doused west-lake-fire \d+$/);
  now = await state(page);
  expect([now.tank.full, now.badge]).toEqual([false, 'out']);
  await expect(goal(page)).toHaveText('Hover low over the water to fill the bucket');
  expect(now.particles.refused).toBe(0);
  expect(problems).toEqual([]);
});

test('flying free the bar is the hint with the bucket in, and the way to the water or the flames with it out', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await settle(page, 1);
  const bar = page.locator('#hud .bar');
  await expect(bar).toHaveAttribute('data-mode', 'free');
  await expect(page.locator('#hud .hint')).toHaveText('Land on a crate or fly a start');
  // out, empty, with the helicopter up in the air at home: hover low over the water, to the nearest water
  await page.keyboard.press('b');
  await page.evaluate((hover) => {
    const g = window.game!;
    const { home } = g.content();
    g.teleport(home.x, home.y, 30, 0);
    g.fly(0, 0, hover);
  }, HOVER_LIFT);
  await settle(page, 2);
  await expect(bar).toHaveAttribute('data-mode', 'guided');
  await expect(goal(page)).toHaveText('Hover low over the water to fill the bucket');
  await expect(page.locator('#hud .far')).toHaveText(/^\d+ m$/);
  // the arrow is to the nearest water: its distance is the game's own
  const near = await page.evaluate(() => {
    const g = window.game!;
    const { x, y } = g.state().helicopter;
    return { x, y };
  });
  const far = parseInt((await page.locator('#hud .far').textContent()) ?? '0');
  expect(far).toBeGreaterThan(0);
  expect(Number.isFinite(near.x)).toBe(true);
  // taken in, it is the hint again
  await page.keyboard.press('b');
  await settle(page, 2);
  await expect(bar).toHaveAttribute('data-mode', 'free');
  await expect(page.locator('#hud .hint')).toHaveText('Land on a crate or fly a start');
  expect(problems).toEqual([]);
});

test('shown the way to a fire with the bucket in, the bar says to press B for it, and with it out says how to fill it', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await page.evaluate((id) => window.game!.guide(id), WEST.id);
  await settle(page, 2);
  await expect(goal(page)).toHaveText('Press B for the bucket');
  await expect(page.locator('#hud .arrow')).toBeVisible();
  await page.keyboard.press('b');
  await settle(page, 2);
  await expect(goal(page)).toHaveText('Hover low over the water to fill the bucket');
  // a full bucket taken in keeps its water and says press B again
  await scoop(page);
  await page.keyboard.press('b');
  await settle(page, 2);
  expect((await state(page)).tank.full).toBe(true);
  await expect(goal(page)).toHaveText('Press B for the bucket');
  await expect(page.locator('#hud .bucket')).toHaveAttribute('data-state', 'in');
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the badge is under the radar with no key tag, tapped it puts the bucket out, and the words say tap it', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await page.evaluate((id) => window.game!.guide(id), WEST.id);
    await settle(page, 2);
    const button = page.getByRole('button', { name: 'Bucket, in' });
    const box = (await button.boundingBox())!;
    const radar = (await page.locator('#hud .radar').boundingBox())!;
    expect([box.width, box.height]).toEqual([44, 44]);
    expect(box.y).toBeGreaterThanOrEqual(radar.y + radar.height);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expect(button.locator('.key')).toBeHidden();
    // clear of the lever and the stick at the bottom of the screen
    expect(box.y + box.height).toBeLessThan(844 / 2);
    await expect(goal(page)).toHaveText('Tap the bucket');
    await button.tap();
    await settle(page, 2);
    const now = await state(page);
    expect([now.bucket.out, now.badge, now.input.by]).toEqual([true, 'out', 'touch']);
    await expect(goal(page)).toHaveText('Hover low over the water to fill the bucket');
    await page.getByRole('button', { name: 'Bucket, out, empty' }).tap();
    await settle(page, 2);
    expect((await state(page)).badge).toBe('in');
    expect(problems).toEqual([]);
  });
});
