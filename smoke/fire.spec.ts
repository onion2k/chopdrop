/**
 * Water bombing in the page: the bucket put out by its key and let down onto the west lake, with the loader "Filling the
 * bucket" filling in blue, the badge going from an orange ring to full and the bucket hanging dipped, then with water in it;
 * the bucket, full, taken to the fire (the words "Take the bucket to the fire" when shown the way), which begins its level on
 * arrival within 60 m with the tank still full; the drop falling over the flames from 30 m, pouring for a second along the
 * way as spray, and putting the patches out, one or two buckets, with the bar saying "Fly over the flames to drop · n
 * burning" with the bucket full and "Hover low over the water to fill the bucket" with it empty, the trees on the burning and
 * burnt patches drawn black and bare and whole again once it is lit again; then the autopilot putting it out, the toast "Fire
 * out!", its time on the panel and the fire lit again after; and the bucket put out and filled by touch on a phone. The
 * renderer refuses none of the bursts the effects ask of it, throughout. The helicopter is flown through `fly` and by real
 * fingers, and the particles move as frames are drawn: stepped with `stepDrawn`, never waited on.
 */
import { expect, test, type Page } from '@playwright/test';
import { FIRE } from '../src/fire';
import { HOVER_LIFT } from '../src/helicopter';
import { DROP, SCOOP } from '../src/water';
import { fingers, leverTravel, start, watch } from './game';
import {
  FLY_HEIGHT,
  LAKE,
  WEST,
  burntTrees,
  flyAt,
  hoverOver,
  refill,
  sceneAfar,
  sceneSpray,
  scoop,
  settle,
  smokePixels,
} from './fire';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const events = (page: Page) => page.evaluate(() => window.game!.events());
const goal = (page: Page) => page.locator('#hud .goal');

/** The loader's fill, as a share of its ring. */
const filled = (page: Page) =>
  page
    .locator('#hud .loader .fill')
    .evaluate((el: SVGElement) => parseFloat(el.style.strokeDasharray) / (2 * Math.PI * 11));

test('the bucket put out and let down onto the lake fills the tank: the loader "Filling the bucket" in blue, the badge full, the bucket hung with water', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await settle(page, 1);
  // nothing to do with the bucket: it is in, stowed, the badge grey, and no loader
  const before = await state(page);
  expect([before.badge, before.bucket.out, before.bucket.hung, before.tank.full]).toEqual(['in', false, false, false]);
  await expect(page.locator('#hud .loader')).toBeHidden();
  await expect(page.locator('#hud .bucket')).toHaveAttribute('data-state', 'in');

  // the key B puts it out, and the helicopter is put hovering over the water, which it holds
  await page.keyboard.press('b');
  await page.evaluate(
    ([id, hover]) => {
      const g = window.game!;
      g.play(id);
      g.fly(0, 0, hover);
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
  // part way: the loader names the fill, in blue and filling; the badge an orange ring; the bucket hangs, dipped in the water
  const part = await state(page);
  expect(part.tank.filling).toBeGreaterThan(0.5);
  expect(part.tank.full).toBe(false);
  const loader = page.locator('#hud .loader');
  await expect(loader).toBeVisible();
  await expect(loader.locator('.what')).toHaveText('Filling the bucket');
  await expect(loader).toHaveAttribute('data-kind', 'fill');
  expect(await filled(page)).toBeCloseTo(part.tank.filling / SCOOP.time, 1);
  expect(fills.length).toBeGreaterThan(1);
  expect(fills).toEqual([...fills].sort((a, b) => a - b));
  expect(part.badge).toBe('out');
  await expect(page.locator('#hud .bucket')).toHaveAttribute('data-state', 'out');
  expect(part.bucket).toMatchObject({ out: true, hung: true, full: false });
  // dipped: the line is short, the bucket under the skids and in the water
  expect(part.bucket.line).toBeLessThan(2.5);
  expect(part.helicopter).toMatchObject({ overWater: true, landed: false });

  // on to full: told scooped, the loader gone, the badge full and the bucket's water at its rim
  for (let f = 0; f < 300 && !(await state(page)).tank.full; f++) await settle(page, 1);
  await page.evaluate(() => window.game!.release());
  await settle(page, 1);
  expect(await events(page)).toEqual(['scooped']);
  const full = await state(page);
  expect([full.tank.full, full.badge]).toEqual([true, 'full']);
  expect(full.bucket).toMatchObject({ out: true, hung: true, full: true });
  await expect(loader).toBeHidden();
  await expect(page.locator('#hud .bucket')).toHaveAttribute('data-state', 'full');
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
  // a frame's worth of fire after a few hundred frames not drawn, and the whole column after as many drawn (860 at the
  // smoke's honest rate: a thinner smoke than the ten-times-heavy one it was tuned to)
  expect(stepped.live).toBeLessThan(150);
  expect(drawn.live).toBeGreaterThan(600);
  expect(drawn.refused).toBe(0);
  expect(problems).toEqual([]);
});

test('the bucket out, filled and taken to the west fire begins its level on arrival; one or two drops from 30 m through its middle put it out, with its trees burnt', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await settle(page, 600);
  // the fire burns at its start: ten glowing patches and no burnt ground, the three fires all lit
  const lit = await state(page);
  expect(lit.ground).toEqual({ burning: 30, burnt: 0 });
  expect(lit.fires.map((f) => f.burning)).toEqual([10, 10, 10]);
  expect(lit.particles.live).toBeGreaterThan(900);
  // and the trees on the lit patches drawn burnt, out of a pool sized to every tree on any patch
  const trees = burntTrees(lit.fires);
  expect(trees.pool).toBeGreaterThan(60);
  expect(trees.burnt).toBeGreaterThan(30);
  expect(lit.burnt).toEqual({ trees: trees.burnt, pool: trees.pool });

  // with the bucket full and the fire shown the way: the words to take it there, the arrow, and the bucket hung with water
  expect(await scoop(page)).toBeGreaterThan(0);
  await events(page);
  await page.evaluate((id) => window.game!.guide(id), WEST.id);
  await settle(page, 1);
  await expect(goal(page)).toHaveText('Take the bucket to the fire');
  await expect(page.locator('#hud .arrow')).toBeVisible();
  expect((await state(page)).bucket).toMatchObject({ hung: true, full: true });

  // flown at the fire's middle from 120 m off at 30 m up: nothing begins until it is within 60 m, and then it does, on arrival
  await flyAt(page, WEST, 120, FLY_HEIGHT);
  expect((await state(page)).mission.level).toBeNull();
  const told: string[] = [];
  let arrived = -1;
  for (let f = 0; f < 600 && arrived < 0; f++) {
    await settle(page, 1);
    told.push(...(await events(page)));
    if (told.includes(`started ${WEST.id}`)) arrived = f;
  }
  expect(arrived, 'begun on arrival').toBeGreaterThan(0);
  const near = await state(page);
  expect(near.mission.level).toBe(WEST.id);
  // within 60 m of a burning patch when it began (and not much sooner), the tank still full: nothing was dropped to begin it
  const gap = Math.min(
    ...WEST.patches.slice(0, WEST.lit).map((p) => Math.hypot(near.helicopter.x - p.x, near.helicopter.y - p.y)),
  );
  expect(gap).toBeLessThanOrEqual(FIRE.near + 1);
  expect(gap).toBeGreaterThan(FIRE.near - 10);
  expect(told).not.toContain(`dropped ${WEST.id}`);
  await expect(goal(page)).toHaveText(/^Fly over the flames to drop · \d+ burning$/);

  // on over the flames: the drop falls over a burning patch, pours along the way for a second or so, and puts the patches out
  let pouring = 0;
  let spray = 0;
  let dropped = -1;
  for (let f = 0; f < 900 && !told.some((l) => l.startsWith(`doused ${WEST.id}`)); f++) {
    await settle(page, 1);
    const s = await state(page);
    told.push(...(await events(page)));
    if (s.pour > 0) {
      pouring++;
      spray += s.particles.spray;
      if (dropped < 0) dropped = f;
    }
  }
  await page.evaluate(() => window.game!.release());
  const first = told.findIndex((l) => l === `dropped ${WEST.id}`);
  expect(first, 'dropped').toBeGreaterThan(-1);
  // told at the pour's end, with how many it put out in all (a fire put out in the middle of it is told out before)
  const dousing = told.slice(first).find((l) => l.startsWith('doused'));
  expect(dousing).toMatch(new RegExp(`^doused ${WEST.id} \\d+$`));
  const out = Number(dousing!.split(' ')[2]);
  expect(out, 'a pass through the middle puts most of the ten out').toBeGreaterThanOrEqual(6);
  // the pour is `DROP.pour` of game seconds, in frames drawn, and the spray fell for all of it
  expect(Math.abs(pouring - DROP.pour * 60)).toBeLessThanOrEqual(2);
  expect(spray, 'spray poured').toBeGreaterThan(1000);
  expect((await state(page)).pour).toBe(0);

  // a second bucket if the first left some: filled at the lake and flown through what burns, from 30 m
  const finished = () => told.some((l) => l.startsWith('finished'));
  const doused = () => told.filter((l) => l.startsWith(`doused ${WEST.id}`)).length;
  /** Frames played, one at a time, until `done`, collecting what the game tells; the controls are left as they are. */
  const play = async (done: () => boolean, frames: number) => {
    for (let f = 0; f < frames && !done(); f++) {
      await settle(page, 1);
      told.push(...(await events(page)));
    }
  };
  // the fire is put out as the first pour ends, or a patch or two is left, and lit by the spread meanwhile
  await play(finished, 5);
  while (!finished() && doused() < 3) {
    const [before] = [doused()];
    await refill(page);
    const burning = (await state(page)).fires[0];
    const at = WEST.patches.find((_, k) => burning.patches[k] === 1) ?? WEST;
    await flyAt(page, at, 100, FLY_HEIGHT);
    await play(() => finished() || doused() > before, 900);
    await page.evaluate(() => window.game!.release());
  }
  const drops = doused();
  expect(drops, 'one drop or two').toBeLessThanOrEqual(2);
  const done = await state(page);
  expect(told.find((l) => l.startsWith(`fire out`))).toBe(`fire out ${WEST.id}`);
  expect(told.find((l) => l.startsWith('finished'))).toMatch(new RegExp(`^finished ${WEST.id} \\d+\\.\\d\\d best$`));
  expect(done.last).toMatchObject({ id: WEST.id, best: true });
  // the toast, "Fire out!" and the time from the arrival
  await expect(page.locator('#hud .toast h2')).toHaveText('Fire out!');
  await expect(page.locator('#hud .toast .t')).toHaveText(/^\d:\d\d · ★ New best$/);
  expect(done.last!.seconds).toBeGreaterThan(0);
  expect(done.last!.seconds).toBeLessThan(90);
  expect(done.toast).toMatch(/^Fire out! \d:\d\d ★ New best$/);
  // burnt ground where the patches are out, and the trees on every patch that burned or burnt drawn burnt
  expect(done.fires[0].burning).toBe(0);
  const after = burntTrees(done.fires);
  // a patch burning and the same patch out are drawn the same, and a patch that caught on the way would add its trees
  expect(after.burnt).toBeGreaterThanOrEqual(trees.burnt);
  expect(done.burnt).toEqual({ trees: after.burnt, pool: after.pool });
  expect(done.ground.burnt).toBe(done.fires[0].patches.filter((p) => p === 2).length);
  expect(done.particles.refused).toBe(0);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  // lit again at its start once it has been left: the trees on the patches that are not lit are whole again
  await settle(page, 300);
  const relit = await state(page);
  expect(relit.fires[0].burning).toBe(WEST.lit);
  expect(relit.burnt).toEqual({ trees: trees.burnt, pool: trees.pool });
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
  expect(told.find((l) => l.startsWith('finished'))).toMatch(new RegExp(`^finished ${WEST.id} \\d+\\.\\d\\d best$`));
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

  test('the bucket put out by a tap and filled over the lake: the loader and the badge are clear of the bar', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate((id) => window.game!.play(id), WEST.id);
    await settle(page, 1);
    const travel = await leverTravel(page);
    const hand = await fingers(page);
    // the right thumb sets the lever at its stop and stays: the hover over the water is held
    await hand.down(2, 330, 680);
    await hand.move(2, 330, 680 - (HOVER_LIFT * travel) / 2);
    expect((await state(page)).input.lever).toBe(HOVER_LIFT);
    // the badge tapped, which puts the bucket out
    const badge = page.locator('#hud .bucket');
    expect((await state(page)).badge).toBe('in');
    await badge.tap();
    await settle(page, 1);
    expect((await state(page)).badge).toBe('out');
    let seen = false;
    for (let f = 0; f < 400 && !(await state(page)).tank.full; f += 5) {
      await settle(page, 5);
      const s = await state(page);
      if (s.tank.filling > 0.5 && !seen) {
        seen = true;
        const loader = page.locator('#hud .loader');
        await expect(loader.locator('.what')).toHaveText('Filling the bucket');
        const box = (await loader.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
      }
    }
    expect(seen, 'seen filling').toBe(true);
    await hand.up(2);
    await settle(page, 1);
    const s = await state(page);
    expect([s.tank.full, s.badge, s.input.by]).toEqual([true, 'full', 'touch']);
    // the badge is in the corner, under the radar's and clear of the bar and the touch controls
    const box = (await badge.boundingBox())!;
    const radar = (await page.locator('#hud .radar').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(radar.y + radar.height);
    expect([box.width, box.height]).toEqual([44, 44]);
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

/**
 * The west fire's column where it stands against open sky from 450 m: the patch of sky over the fire, above the
 * horizon. The renderer's haze took a particle or a sprite by what lay behind it, the far end of the haze over open
 * sky, and left the column there all but lost (`BEHIND` smoke pixels, measured on a1189c2); hazed by its own distance
 * it stands plain, which is what a player looks for from across the island.
 */
const WEST_SKY = { x0: 520, x1: 760, y0: 0, y1: 170 };
const BEHIND = { pixels: 2 };

test('450 m from the west fire its column stands plain against the sky, hazed by its own distance', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true, save: { best: {} } });
  await sceneAfar(page, 450);
  for (const id of ['#stats', '#hud'])
    await page.locator(id).evaluate((el: HTMLElement) => (el.style.display = 'none'));
  const smoke = await smokePixels(page, await page.screenshot(), WEST_SKY);
  console.log(
    `smoke pixels in the sky over the west fire from 450 m: ${smoke} (hazed by what is behind: ${BEHIND.pixels})`,
  );
  // 13,861 when this was written, against the 2 there were: held at under half of it, and a thousand times the before
  expect(smoke, 'the west column against the sky').toBeGreaterThan(Math.max(6000, 1000 * BEHIND.pixels));
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
