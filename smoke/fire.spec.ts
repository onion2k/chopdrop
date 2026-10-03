/**
 * Water bombing in the page: the tank filled by skimming the west lake along its run, with the loader "Scooping"
 * filling in blue, the badge going from an outline to full and the bucket hanging with water in it; the fire flown to and
 * the water dropped on a burning patch at a height a drop reaches, which begins the level, pours as spray and leaves
 * burnt ground, with the bar saying "Put out the fire · n burning" with the tank full and "Scoop water" with it empty;
 * then the autopilot putting it out, the toast "Fire out!", its time on the panel and the fire lit again after; and a
 * scoop by touch on a phone. The renderer refuses none of the bursts the effects ask of it, throughout. The helicopter is
 * flown through `fly` and by real fingers, and the particles move as frames are drawn: stepped with `stepDrawn`, never waited on.
 */
import { expect, test, type Page } from '@playwright/test';
import { HOVER_LIFT } from '../src/helicopter';
import { SCOOP } from '../src/water';
import { fingers, leverTravel, start, watch } from './game';
import { DROP_HEIGHT, LAKE, WEST, hoverOver, sceneAfar, sceneSpray, scoop, settle, smokePixels } from './fire';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const events = (page: Page) => page.evaluate(() => window.game!.events());
const goal = (page: Page) => page.locator('#hud .goal');

/** The loader's fill, as a share of its ring. */
const filled = (page: Page) =>
  page
    .locator('#hud .loader .fill')
    .evaluate((el: SVGElement) => parseFloat(el.style.strokeDasharray) / (2 * Math.PI * 11));

test('skimming the lake along its run fills the tank: the loader "Scooping" in blue, the badge full, the bucket hung with water', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await settle(page, 1);
  // nothing to do with water: no badge, no bucket, no loader
  const before = await state(page);
  expect([before.badge, before.bucket.hung, before.tank.full]).toEqual(['none', false, false]);
  await expect(page.locator('#hud .loader')).toBeHidden();
  await expect(page.locator('#hud .tank')).toBeHidden();

  // put at the start of the run, low over the water, and flown along it
  await page.evaluate(
    ([id, hover]) => {
      const g = window.game!;
      g.play(id);
      g.fly(1, 0, hover);
    },
    [WEST.id, HOVER_LIFT] as const,
  );
  const fills: number[] = [];
  for (let f = 0; f < 600 && !(await state(page)).tank.full; f++) {
    await settle(page, 1);
    const s = await state(page);
    if (s.tank.filling > 0 && f % 20 === 0) fills.push(await filled(page));
    if (s.tank.filling > 0.9 && fills.length > 1) break;
  }
  // part way: the loader names the scoop, in blue and filling; the badge an outline; the bucket hangs, dipped in the water
  const part = await state(page);
  expect(part.tank.filling).toBeGreaterThan(0.5);
  expect(part.tank.full).toBe(false);
  const loader = page.locator('#hud .loader');
  await expect(loader).toBeVisible();
  await expect(loader.locator('.what')).toHaveText('Scooping');
  await expect(loader).toHaveAttribute('data-kind', 'scoop');
  expect(await filled(page)).toBeCloseTo(part.tank.filling / SCOOP.time, 1);
  expect(fills.length).toBeGreaterThan(1);
  expect(fills).toEqual([...fills].sort((a, b) => a - b));
  expect(part.badge).toBe('empty');
  await expect(page.locator('#hud .tank')).toHaveAttribute('data-state', 'empty');
  expect(part.bucket).toMatchObject({ hung: true, full: false });
  // dipped: the line is short, the bucket under the skids and in the water
  expect(part.bucket.line).toBeLessThan(2.5);

  // on to full: told scooped, the loader gone, the badge full and the bucket's water at its rim
  for (let f = 0; f < 300 && !(await state(page)).tank.full; f++) await settle(page, 1);
  await page.evaluate(() => window.game!.release());
  await settle(page, 1);
  expect(await events(page)).toEqual(['scooped']);
  const full = await state(page);
  expect([full.tank.full, full.badge]).toEqual([true, 'full']);
  expect(full.bucket).toMatchObject({ hung: true, full: true });
  await expect(loader).toBeHidden();
  await expect(page.locator('#hud .tank')).toHaveAttribute('data-state', 'full');
  expect(full.particles.refused).toBe(0);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('stepDrawn draws every frame so the particles move with the game, where step draws only the last', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await page.evaluate(() => window.game!.look(-353, -108, { azimuth: -2.2, polar: 1.15, radius: 230 }));
  await page.evaluate(() => window.game!.step(300));
  const stepped = (await state(page)).particles;
  await page.evaluate(() => window.game!.stepDrawn(300));
  const drawn = (await state(page)).particles;
  // a frame's worth of fire after a few hundred frames not drawn, and the whole column after as many drawn
  expect(stepped.live).toBeLessThan(150);
  expect(drawn.live).toBeGreaterThan(900);
  expect(drawn.refused).toBe(0);
  expect(problems).toEqual([]);
});

test('flown to the fire and dropped on: it begins the level, pours as spray, leaves burnt ground, and the bar follows the tank', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await settle(page, 600);
  // the fire burns at its start: ten glowing patches and no burnt ground, the three fires all lit
  const lit = await state(page);
  expect(lit.ground).toEqual({ burning: 30, burnt: 0 });
  expect(lit.fires.map((f) => f.burning)).toEqual([10, 10, 10]);
  expect(lit.particles.live).toBeGreaterThan(900);

  // with the tank full and the fire shown the way: "To the fire", the arrow, and the bucket hung with water
  expect(await scoop(page)).toBeGreaterThan(0);
  await events(page);
  await page.evaluate((id) => window.game!.guide(id), WEST.id);
  await settle(page, 1);
  await expect(goal(page)).toHaveText('To the fire');
  await expect(page.locator('#hud .arrow')).toBeVisible();
  expect((await state(page)).bucket).toMatchObject({ hung: true, full: true });

  // flown over the fire's middle at a height a drop reaches from: dropped, begun, the spray pouring
  await page.evaluate(
    ([x, y, height, hover]) => {
      const g = window.game!;
      g.chase();
      g.teleport(x, y, height, 0.9);
      g.fly(0, 0, hover);
    },
    [WEST.x, WEST.y, DROP_HEIGHT, HOVER_LIFT] as const,
  );
  let spray = 0;
  let pouring = 0;
  for (let f = 0; f < 40; f++) {
    await settle(page, 1);
    const { particles } = await state(page);
    spray += particles.spray;
    if (particles.spray > 0) pouring++;
  }
  await page.evaluate(() => window.game!.release());
  const told = await events(page);
  expect(told[0]).toBe('dropped west-lake-fire 9');
  expect(told[1]).toBe('started west-lake-fire');
  expect(spray, 'spray poured').toBeGreaterThan(500);
  // a short pour: half a second of frames, and not on after
  expect(pouring).toBeGreaterThanOrEqual(25);
  expect(pouring).toBeLessThanOrEqual(35);
  const after = await state(page);
  expect(after.mission.level).toBe(WEST.id);
  expect(after.tank.full).toBe(false);
  expect([after.fires[0].burning, after.guided]).toEqual([1, null]);
  // burnt ground where nine burned, glowing ground where one does and in the other fires
  expect(after.ground).toEqual({ burning: 21, burnt: 9 });
  expect(after.particles.refused).toBe(0);

  // the bar, the tank empty: "Scoop water", with the way to the nearest water
  await expect(goal(page)).toHaveText('Scoop water');
  await expect(page.locator('#hud .far')).toHaveText(/^\d+ m$/);
  await expect(page.locator('#hud .tank')).toHaveAttribute('data-state', 'empty');
  expect(problems).toEqual([]);
});

test('with the level begun and the tank full, the bar names the fire to put out and how many burn, and the arrow is to the nearest patch', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await settle(page, 1);
  await scoop(page);
  await page.evaluate((id) => window.game!.begin(id), WEST.id);
  await settle(page, 1);
  await expect(goal(page)).toHaveText('Put out the fire · 10 burning');
  await expect(page.locator('#hud .tank')).toHaveAttribute('data-state', 'full');
  await hoverOver(page, WEST.x - 60, WEST.y, 26, 0, 2);
  // the arrow's distance is to the nearest burning patch while the tank is full
  const far = parseInt((await page.locator('#hud .far').textContent()) ?? '0');
  const { x, y } = (await state(page)).helicopter;
  const nearest = Math.min(...WEST.patches.slice(0, 10).map((p) => Math.hypot(p.x - x, p.y - y)));
  expect(Math.abs(far - nearest)).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('then the autopilot puts it out: the toast "Fire out!", the time on the panel, and the fire lit again after', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, save: { best: {} } });
  await settle(page, 60);
  await page.evaluate((id) => window.game!.autopilot(true, id), WEST.id);
  let burning = 10;
  let refused = 0;
  for (let f = 0; f < 36000; f += 30) {
    const broken = await page.evaluate(() => {
      window.game!.stepDrawn(30);
      return window.game!.invariants();
    });
    expect(broken, `at frame ${f}`).toEqual([]);
    const s = await state(page);
    refused = Math.max(refused, s.particles.refused);
    if (s.mission.level === WEST.id) burning = Math.min(burning, s.fires[0].burning);
    if (s.last?.id === WEST.id) break;
  }
  await page.evaluate(() => window.game!.autopilot(false));
  const done = await state(page);
  expect(done.last).toMatchObject({ id: WEST.id, best: true });
  expect(burning).toBeLessThan(10);
  expect(refused, 'the renderer refused none of the bursts').toBe(0);
  const told = await events(page);
  expect(told).toContain('scooped');
  expect(told).toContain(`fire out ${WEST.id}`);
  expect(told.at(-1)).toMatch(new RegExp(`^finished ${WEST.id} \\d+\\.\\d\\d best$`));
  // the toast, and the bar and the bucket put away: nothing is going and the tank is empty
  await expect(page.locator('#hud .toast h2')).toHaveText('Fire out!');
  await expect(page.locator('#hud .toast .t')).toHaveText(/^\d:\d\d · ★ New best$/);
  expect(done.toast).toMatch(/^Fire out! \d:\d\d ★ New best$/);
  expect(done.fires[0].burning).toBe(0);
  expect(done.ground.burning).toBe(20);
  // the time on the panel
  await page.keyboard.press('Escape');
  const row = page.locator('#panel .row.fire').first();
  await expect(row.locator('.label')).toHaveText('Fire by the west lake');
  await expect(row.locator('.best')).toHaveText(/^\d:\d\d$/);
  await page.keyboard.press('Escape');
  // lit again once the toast has gone: ten glowing patches and no burnt ground there
  await page.evaluate(() => window.game!.stepDrawn(300));
  const relit = await state(page);
  expect(relit.fires[0].burning).toBe(10);
  expect(relit.fires[0].patches.filter((p) => p === 1)).toHaveLength(10);
  expect(relit.ground).toEqual({ burning: 30, burnt: 0 });
  expect(relit.particles.refused).toBe(0);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a scoop by touch: the lever holds the skim, the stick runs the lake, and the badge and the loader are clear of the bar', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate((id) => window.game!.play(id), WEST.id);
    await settle(page, 1);
    const travel = await leverTravel(page);
    const hand = await fingers(page);
    // the right thumb sets the lever at its stop and stays; the left pushes the stick straight forward
    await hand.down(2, 330, 680);
    await hand.move(2, 330, 680 - (HOVER_LIFT * travel) / 2);
    expect((await state(page)).input.lever).toBe(HOVER_LIFT);
    await hand.down(1, 120, 680);
    await hand.move(1, 120, 600);
    let seen = false;
    for (let f = 0; f < 400 && !(await state(page)).tank.full; f += 5) {
      await settle(page, 5);
      const s = await state(page);
      if (s.tank.filling > 0.5 && !seen) {
        seen = true;
        const loader = page.locator('#hud .loader');
        await expect(loader.locator('.what')).toHaveText('Scooping');
        const box = (await loader.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
      }
    }
    expect(seen, 'seen scooping').toBe(true);
    await hand.up(1);
    await hand.up(2);
    await settle(page, 1);
    const s = await state(page);
    expect([s.tank.full, s.badge, s.input.by]).toEqual([true, 'full', 'touch']);
    // the tank's badge is in the corner, under the radar's and clear of the bar and the touch controls
    const tank = (await page.locator('#hud .tank').boundingBox())!;
    const radar = (await page.locator('#hud .radar').boundingBox())!;
    expect(tank.x + tank.width).toBeLessThanOrEqual(390);
    expect(tank.y).toBeGreaterThanOrEqual(radar.y + radar.height);
    expect([tank.width, tank.height]).toEqual([44, 44]);
    expect(s.particles.refused).toBe(0);
    expect(problems).toEqual([]);
  });
});

test('hovering 3 m over the west lake throws the rotor’s spray up, and over the land beside it does not', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await settle(page, 1);
  expect((await state(page)).particles.wash, 'none while landed at home').toBe(0);
  await sceneSpray(page, 3, 60);
  const over = await state(page);
  expect(over.particles.wash, 'spray thrown up at the last frame drawn').toBeGreaterThan(0);
  expect(over.particles.refused).toBe(0);
  // high over the same water it is none: past the reach of the spray
  await sceneSpray(page, 30, 60);
  expect((await state(page)).particles.wash, 'none from 30 m up').toBe(0);
  // and low over the land, none: the fire's own ground has no open water
  await sceneSpray(page, 3, 60);
  await hoverOver(page, WEST.x, WEST.y, 3, 0.9, 60);
  expect((await state(page)).particles.wash, 'none over land').toBe(0);
  expect(LAKE.z).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

/**
 * How many pixels of smoke are in the upper picture from 450 m: measured on the game before the column was drawn (at
 * b62c135, the same scene, hud hidden) it was `BEFORE`. The renderer's haze takes whatever is drawn over the sky to the
 * colour of the sky, by the depth behind it, so the west fire's column, which stands against sky from here, hardly shows,
 * while the south fire's, against its wood at the picture's right, is plain: what is counted is both.
 */
const BEFORE = { pixels: 10179 };
const SKY = { x0: 0, x1: 1280, y0: 0, y1: 320 };

test('450 m from the west fire the column of smoke is plainly in the picture, over the horizon', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await sceneAfar(page, 450);
  for (const id of ['#stats', '#hud'])
    await page.locator(id).evaluate((el: HTMLElement) => (el.style.display = 'none'));
  // every fire that burns has its column drawn, however far the camera is: three fires of the puffs each
  const column = (await state(page)).particles.sprites;
  expect(column % 3, 'the same puffs for each of three fires').toBe(0);
  expect(column, 'sprites drawn').toBeGreaterThan(0);
  const picture = await page.screenshot();
  const smoke = await smokePixels(page, picture, SKY);
  console.log(`smoke pixels in the upper picture from 450 m: ${smoke} (before the column: ${BEFORE.pixels})`);
  // 36,376 when this was written: three and a half times what there was, and held at twice
  expect(smoke, 'smoke in the upper picture').toBeGreaterThan(2 * BEFORE.pixels);
  expect(problems).toEqual([]);
});

test('the column of smoke is drawn for every fire that burns, from 900 m as from 100', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  const sprites = async () => (await state(page)).particles.sprites;
  await sceneAfar(page, 100);
  const near = await sprites();
  expect(near, 'puffs, a third of them for each fire').toBeGreaterThan(0);
  expect(near % 3).toBe(0);
  await sceneAfar(page, 900);
  expect(await sprites(), 'from 900 m').toBe(near);
  expect((await state(page)).particles.refused).toBe(0);
  expect(problems).toEqual([]);
});
