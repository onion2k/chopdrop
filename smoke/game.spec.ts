/**
 * The game as a player gets it: served by Vite, run in Chromium on the real
 * GPU. What the unit tests cannot reach — the renderer, the frame loop, the
 * page — checked for the things that would make it plainly broken: an
 * error, a black screen, a clock the tests cannot stop and step, keys that
 * do not fly the helicopter, a camera that loses it. Each thing a player can
 * do or keep gets a test here as it is built.
 */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { CHASE } from '../src/chase';
import { DOWNWASH } from '../src/downwash';
import { WOOD, start, watch } from './game';

/** How many frames the page draws in a second. */
function framesInASecond(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const began = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - began < 1000) requestAnimationFrame(tick);
          else resolve(n);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** How much a screenshot has in it: the spread of its brightness, and the share of it that is not near black. */
function content(png: Buffer) {
  const img = PNG.sync.read(png);
  let sum = 0,
    sq = 0,
    lit = 0;
  const n = img.width * img.height;
  for (let i = 0; i < img.data.length; i += 4) {
    const y = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
    sum += y;
    sq += y * y;
    if (y > 40) lit++;
  }
  const mean = sum / n;
  return { spread: Math.sqrt(sq / n - mean * mean), lit: lit / n };
}

test('boots with no errors and draws the island', async ({ page }, info) => {
  const problems = watch(page);
  await start(page);
  expect(await framesInASecond(page)).toBeGreaterThan(20);
  const shot = await page.screenshot();
  await info.attach('island', { body: shot, contentType: 'image/png' });
  const c = content(shot);
  expect(c.lit, 'share of the screen lit').toBeGreaterThan(0.2);
  expect(c.spread, 'variety in the picture').toBeGreaterThan(20);
  expect(problems).toEqual([]);
});

test('stops where it was built, steps exactly as told, and goes on again', async ({ page }) => {
  // every picture and every figure the gates hold is taken this way, so it is held here first
  const problems = watch(page);
  await start(page, { paused: true });
  const built = await page.evaluate(() => window.game!.state());
  expect(built.t).toBe(0);
  expect(built.frame).toBe(0);
  expect(built.paused).toBe(true);
  const stepped = await page.evaluate(() => {
    window.game!.step(30);
    return window.game!.state();
  });
  expect(stepped.frame, 'a frame a step').toBe(30);
  expect(stepped.t, 'a sixtieth of a second a frame').toBeCloseTo(0.5, 9);
  // paused, the page goes on drawing and the game does not move
  await framesInASecond(page);
  expect(await page.evaluate(() => window.game!.state().frame)).toBe(30);
  await page.evaluate(() => window.game!.resume());
  await expect.poll(() => page.evaluate(() => window.game!.state().frame), { timeout: 5000 }).toBeGreaterThan(40);
  expect(problems).toEqual([]);
});

test('flies by the keyboard', async ({ page }) => {
  // real key events, but the frames are the test's: nothing here waits on a clock
  const problems = watch(page);
  await start(page, { paused: true });
  const state = () => page.evaluate(() => window.game!.state().helicopter);
  const step = (frames: number) => page.evaluate((n) => window.game!.step(n), frames);

  const built = await state();
  expect(built.landed, 'starts landed').toBe(true);
  expect(built.height, 'on the ground').toBe(0);
  const home = await page.evaluate(() => window.game!.content().home);
  expect(built.x, 'on the home pad').toBe(home.x);
  expect(built.y).toBe(home.y);
  expect(built.z, 'on the top of the pad').toBeCloseTo(home.z, 3);

  await page.keyboard.down('Space');
  await step(60);
  await page.keyboard.up('Space');
  const climbed = await state();
  expect(climbed.height, 'Space climbs').toBeGreaterThan(3);

  await page.keyboard.down('w');
  await step(60);
  await page.keyboard.up('w');
  const flown = await state();
  const along = (flown.x - climbed.x) * Math.cos(climbed.yaw) + (flown.y - climbed.y) * Math.sin(climbed.yaw);
  expect(along, 'W moves it along its heading').toBeGreaterThan(5);

  await page.keyboard.down('a');
  await step(30);
  await page.keyboard.up('a');
  const turned = await state();
  expect(turned.yaw - flown.yaw, 'A turns it left').toBeGreaterThan(0.3);

  await page.keyboard.down('Shift');
  let landed = turned.landed;
  for (let frames = 0; !landed && frames < 400; frames += 50) {
    await step(50);
    landed = (await state()).landed;
  }
  await page.keyboard.up('Shift');
  expect(landed, 'Shift brings it down to the ground').toBe(true);
  expect(problems).toEqual([]);
});

test('the trees bow under the rotor, and stand again when it climbs away', async ({ page }) => {
  // brought down into a wood by Shift, hovered, and taken up and away by Space, as a player would
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  const step = (frames: number) => page.evaluate((n) => window.game!.step(n), frames);
  const sway = () => page.evaluate(() => window.game!.sway());
  const near = await page.evaluate(([w, r]) => window.game!.treesNear(w.x, w.y, r), [WOOD, DOWNWASH.reach] as const);
  expect(near.length, 'trees round the clearing').toBeGreaterThan(20);

  /** How far the trees moving lean, all told. */
  const bowing = (s: { trees: { lean: [number, number] }[] }) =>
    s.trees.reduce((sum, t) => sum + Math.hypot(t.lean[0], t.lean[1]), 0);
  await page.evaluate((w) => window.game!.teleport(w.x, w.y, 12, 0), WOOD);
  await step(120);
  const high = bowing(await sway());
  await page.keyboard.down('Shift');
  await step(40);
  await page.keyboard.up('Shift');
  await step(120);
  const heli = await page.evaluate(() => window.game!.state().helicopter);
  expect(heli.height, 'hovering low among the trees').toBeLessThan(6);
  expect(heli.landed).toBe(false);
  const bowed = await sway();
  expect(bowed.count, 'the trees round it moving').toBeGreaterThan(20);
  expect(bowing(bowed), 'bowed further low down than twelve up').toBeGreaterThan(high);
  for (const t of bowed.trees) {
    const [lx, ly] = t.lean;
    if (Math.hypot(lx, ly) < 0.01) continue;
    // every tree that has bowed visibly has bowed away from under the helicopter
    expect(lx * (t.x - heli.x) + ly * (t.y - heli.y), `tree ${t.index}`).toBeGreaterThan(0);
  }

  await page.keyboard.down('Space');
  await step(240);
  await page.keyboard.up('Space');
  expect((await page.evaluate(() => window.game!.state().helicopter)).height).toBeGreaterThan(DOWNWASH.depth);
  let left = (await sway()).count;
  for (let frames = 0; left > 0 && frames < 900; frames += 60) {
    await step(60);
    left = (await sway()).count;
  }
  expect(left, 'every tree stood up again and let go').toBe(0);
  expect(problems).toEqual([]);
});

test('the chase camera follows, and can be parked and sent back', async ({ page }) => {
  const problems = watch(page);
  await start(page, { paused: true });
  const state = () => page.evaluate(() => window.game!.state());
  /** How far a point is ahead of the helicopter along its heading, and how far above its skids. */
  const ahead = (p: [number, number, number], h: { x: number; y: number; z: number; yaw: number }) =>
    (p[0] - h.x) * Math.cos(h.yaw) + (p[1] - h.y) * Math.sin(h.yaw);

  // over the home pad, which is flat well beyond where the camera sits behind it, so the land does not lift the camera
  const home = await page.evaluate(() => window.game!.content().home);
  await page.evaluate((h) => window.game!.teleport(h.x, h.y, 10, h.yaw), home);
  const placed = await state();
  expect(placed.camera.mode).toBe('chase');
  expect(placed.helicopter.height, 'ten above the pad').toBeCloseTo(10, 2);
  expect(ahead(placed.camera.position, placed.helicopter), 'fifteen behind').toBeCloseTo(-15, 2);
  expect(placed.camera.position[2] - placed.helicopter.z, 'six and a half above').toBeCloseTo(6.5, 2);

  await page.evaluate(() => {
    window.game!.fly(1, 0, 0);
    window.game!.step(60);
  });
  const followed = await state();
  expect(ahead(followed.camera.position, placed.helicopter), 'it has gone forward with it').toBeGreaterThan(
    ahead(placed.camera.position, placed.helicopter),
  );
  const gap = Math.hypot(
    followed.camera.position[0] - followed.helicopter.x,
    followed.camera.position[1] - followed.helicopter.y,
    followed.camera.position[2] - followed.helicopter.z,
  );
  expect(gap, 'close behind, never lost').toBeGreaterThan(8);
  expect(gap).toBeLessThan(30);

  await page.evaluate((h) => window.game!.look(h.x, h.y), home);
  const parked = await state();
  expect(parked.camera.mode).toBe('parked');
  expect(parked.camera.target[2], 'looking at the pad').toBeCloseTo(home.z, 3);

  await page.evaluate(() => window.game!.chase());
  const back = await state();
  expect(back.camera.mode).toBe('chase');
  const { helicopter: h, camera } = back;
  expect(ahead(camera.position, h), 'behind it again').toBeCloseTo(-15, 2);
  expect(camera.position[2] - h.z, 'and above').toBeCloseTo(6.5, 2);

  await page.evaluate(() => window.game!.release());
  expect(problems).toEqual([]);
});

test('the camera stays above the ground it flies over', async ({ page }) => {
  // low over the highest ground there is, with the camera behind it where the land is higher
  const problems = watch(page);
  await start(page, { paused: true });
  const peak = await page.evaluate(() => {
    const g = window.game!;
    const { bounds } = g.content();
    let best = { x: 0, y: 0, z: -Infinity };
    for (let x = bounds.minX; x <= bounds.maxX; x += 24)
      for (let y = bounds.minY; y <= bounds.maxY; y += 24) {
        const z = g.groundAt(x, y);
        if (z > best.z) best = { x, y, z };
      }
    return best;
  });
  const placed = await page.evaluate((p) => {
    const g = window.game!;
    // a few units above the summit, facing away from where the ground falls
    g.teleport(p.x, p.y, 3, 0);
    g.fly(1, 0, 0);
    g.step(120);
    g.release();
    const s = g.state();
    return { camera: s.camera.position, ground: g.groundAt(s.camera.position[0], s.camera.position[1]) };
  }, peak);
  expect(placed.camera[2], 'not under the land').toBeGreaterThanOrEqual(placed.ground + CHASE.minHeight - 1e-6);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

  test('boots, and nothing is wider than the screen', async ({ page }, info) => {
    const problems = watch(page);
    await start(page);
    await expect(page.locator('#view')).toBeVisible();
    await info.attach('phone', { body: await page.screenshot(), contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
    expect(problems).toEqual([]);
  });
});
