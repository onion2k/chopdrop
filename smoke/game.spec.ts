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
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import { WOOD, fingers, leverTravel, start, watch } from './game';

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

  // nothing held: it settles into a gentle sink
  await step(90);
  const sinking = await state();
  expect(sinking.vz, 'let go, it sinks at the sink speed').toBeCloseTo(-HELICOPTER.sinkSpeed, 6);
  expect(sinking.height).toBeLessThan(turned.height);
  // Space and Shift together cancel, to the sink
  await page.keyboard.down('Space');
  await page.keyboard.down('Shift');
  await step(30);
  await page.keyboard.up('Space');
  await page.keyboard.up('Shift');
  expect((await state()).vz, 'Space and Shift together sink').toBeCloseTo(-HELICOPTER.sinkSpeed, 6);

  await page.keyboard.down('Shift');
  let landed = turned.landed;
  let fastest = 0;
  for (let frames = 0; !landed && frames < 400; frames += 10) {
    await step(10);
    const now = await state();
    landed = now.landed;
    fastest = Math.min(fastest, now.vz);
  }
  await page.keyboard.up('Shift');
  expect(landed, 'Shift brings it down to the ground').toBe(true);
  expect(fastest, 'and faster than it sinks').toBeLessThan(-2 * HELICOPTER.sinkSpeed);

  // up a little, let go, and it comes down by itself and lands
  await page.keyboard.down('Space');
  await step(30);
  await page.keyboard.up('Space');
  expect((await state()).landed).toBe(false);
  landed = false;
  for (let frames = 0; !landed && frames < 600; frames += 30) {
    await step(30);
    landed = (await state()).landed;
  }
  expect(landed, 'let go, it comes down and lands with no key held').toBe(true);
  expect(problems).toEqual([]);
});

test('the trees bow as it comes down into a wood, stand once it lands, and bow again as it climbs away', async ({
  page,
}) => {
  // let go over a wood, it sinks into it, and Space takes it up and away, as a player would
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  const step = (frames: number) => page.evaluate((n) => window.game!.step(n), frames);
  const sway = () => page.evaluate(() => window.game!.sway());
  const heli = () => page.evaluate(() => window.game!.state().helicopter);
  const near = await page.evaluate(([w, r]) => window.game!.treesNear(w.x, w.y, r), [WOOD, DOWNWASH.reach] as const);
  expect(near.length, 'trees round the clearing').toBeGreaterThan(20);
  /** How far the trees moving lean, all told. */
  const bowing = (s: { trees: { lean: [number, number] }[] }) =>
    s.trees.reduce((sum, t) => sum + Math.hypot(t.lean[0], t.lean[1]), 0);

  await page.evaluate((w) => window.game!.teleport(w.x, w.y, 12, 0), WOOD);
  await step(60);
  const high = bowing(await sway());
  // nothing held: it sinks into the wood, and the trees bow further as it comes
  let h = await heli();
  for (let frames = 0; h.height > 4.5 && frames < 300; frames += 10) {
    await step(10);
    h = await heli();
  }
  expect(h.height, 'come down low among the trees').toBeLessThanOrEqual(4.5);
  expect(h.landed).toBe(false);
  const bowed = await sway();
  expect(bowed.count, 'the trees round it moving').toBeGreaterThan(20);
  expect(bowing(bowed), 'bowed further low down than twelve up').toBeGreaterThan(high);
  for (const t of bowed.trees) {
    const [lx, ly] = t.lean;
    if (Math.hypot(lx, ly) < 0.01) continue;
    // every tree that has bowed visibly has bowed away from under the helicopter
    expect(lx * (t.x - h.x) + ly * (t.y - h.y), `tree ${t.index}`).toBeGreaterThan(0);
  }

  // it lands in the clearing, its rotor winds down, and the trees stand again
  for (let frames = 0; !h.landed && frames < 300; frames += 10) {
    await step(10);
    h = await heli();
  }
  expect(h.landed, 'set down in the clearing with no key held').toBe(true);
  // the camera behind it is over the crowns round it, and what it shows is the wood, not the inside of a tree
  await step(60);
  const cam = await page.evaluate(() => window.game!.state().camera.position);
  for (const t of await page.evaluate(([x, y]) => window.game!.treesNear(x, y, 12), [cam[0], cam[1]] as const)) {
    if (Math.hypot(cam[0] - t.x, cam[1] - t.y) < t.spread)
      expect(cam[2], `over the crown of tree ${t.index}`).toBeGreaterThan(t.z + t.height);
  }
  const seen = content(await page.locator('#view').screenshot());
  expect(seen.spread, 'variety in the picture, not a screen of one green').toBeGreaterThan(20);
  let left = (await sway()).count;
  for (let frames = 0; left > 0 && frames < 900; frames += 60) {
    await step(60);
    left = (await sway()).count;
  }
  expect(left, 'every tree stood up again once the rotor idled').toBe(0);

  // Space: the rotor winds up, the trees bow again as it lifts, and stand once it is out of reach
  await page.keyboard.down('Space');
  await step(30);
  expect((await sway()).count, 'bowing again as it lifts off').toBeGreaterThan(20);
  await step(240);
  left = (await sway()).count;
  for (let frames = 0; left > 0 && frames < 900; frames += 60) {
    await step(60);
    left = (await sway()).count;
  }
  await page.keyboard.up('Space');
  expect((await heli()).height).toBeGreaterThan(DOWNWASH.depth);
  expect(left, 'every tree stood up again and let go').toBe(0);
  expect(problems).toEqual([]);
});

test('the first level: picked up and delivered by key, and flown again by the button and by Enter', async ({
  page,
}) => {
  // set over each pad by the test, and landed on it by Shift and the waiting a player does
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  const step = (frames: number) => page.evaluate((n) => window.game!.step(n), frames);
  const state = () => page.evaluate(() => window.game!.state());
  const pads = await page.evaluate(() => window.game!.content().pads);
  const [pickup, drop] = (await state()).mission.steps.map((step) => step.pad);
  await step(1);
  await expect(page.locator('#hud .goal')).toHaveText('Pick up the parcel at the meadow pad');
  await expect(page.locator('#hud .far')).toHaveText(/^\d+ m$/);
  /** Over a pad, ten up, and down onto it with Shift held until the skids touch. */
  const landOn = async (pad: number) => {
    await page.evaluate((p) => window.game!.teleport(p.x, p.y, 10, 0), pads[pad]);
    await page.keyboard.down('Shift');
    for (let f = 0; f < 300 && !(await state()).helicopter.landed; f += 10) await step(10);
    await page.keyboard.up('Shift');
    expect((await state()).helicopter.landed, `landed on pad ${pad}`).toBe(true);
  };

  // the right pad, waited on: loaded, and told
  await landOn(pickup);
  await step(100);
  let s = await state();
  expect(s.mission.carrying).toBe(true);
  expect(await page.evaluate(() => window.game!.events())).toEqual([`loaded ${pickup}`]);
  await expect(page.locator('#hud .goal')).toHaveText('Deliver it to the hilltop pad');

  // lifted off before the loading is done: it empties, and the wait begins again
  await landOn(drop);
  await step(45);
  expect((await state()).mission.loading).toBeGreaterThan(0.5);
  await expect(page.locator('#hud .loader')).toBeVisible();
  await page.keyboard.down('Space');
  await step(20);
  await page.keyboard.up('Space');
  expect((await state()).mission.loading).toBe(0);
  await expect(page.locator('#hud .loader')).toBeHidden();
  await page.keyboard.down('Shift');
  for (let f = 0; f < 300 && !(await state()).helicopter.landed; f += 10) await step(10);
  await page.keyboard.up('Shift');
  await step(100);
  s = await state();
  expect(s.mission.done).toBe(true);
  const told = await page.evaluate(() => window.game!.events());
  expect(told).toHaveLength(2);
  expect(told[0]).toBe(`delivered ${drop}`);
  expect(told[1]).toMatch(/^finished first-delivery \d+\.\d\d best$/);
  await expect(page.locator('#hud .card h2')).toHaveText('Delivered!');
  await expect(page.locator('#hud .time')).toHaveText(/^in \d+:\d\d$/);

  // flown again by the button: home, landed, the parcel waiting
  await page.locator('#hud .card .again').click();
  await step(1);
  s = await state();
  expect(s.mission).toMatchObject({ next: 0, loading: 0, time: 0, started: false });
  expect(s.helicopter.landed).toBe(true);
  expect([s.helicopter.x, s.helicopter.y]).toEqual([pads[0].x, pads[0].y]);
  await expect(page.locator('#hud .done')).toBeHidden();
  await expect(page.locator('#hud .goal')).toHaveText('Pick up the parcel at the meadow pad');

  // and again, ended by Enter
  await landOn(pickup);
  await step(100);
  await landOn(drop);
  await step(100);
  await expect(page.locator('#hud .done')).toBeVisible();
  await page.keyboard.press('Enter');
  await step(1);
  expect((await state()).mission.next).toBe(0);
  await expect(page.locator('#hud .done')).toBeHidden();
  expect(problems).toEqual([]);
});

test('a mouse on a desk is not a finger: a click leaves it flown by keys, with no touch controls', async ({ page }) => {
  const problems = watch(page);
  await start(page, { paused: true });
  await page.mouse.click(200, 600);
  await page.mouse.down();
  await page.mouse.move(200, 400);
  await page.mouse.up();
  await page.evaluate(() => window.game!.step(1));
  expect((await page.evaluate(() => window.game!.state())).input.by).toBe('keys');
  await expect(page.locator('#touch')).toBeHidden();
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

/** Every part of the touch controls, as boxes on the page, and the screen's size. */
function controlBoxes(page: Page) {
  return page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    boxes: Array.from(
      document.querySelectorAll<HTMLElement>('#touch .base, #touch .knob, #touch .track, #touch .handle'),
    ).map((e) => e.getBoundingClientRect().toJSON() as { left: number; top: number; right: number; bottom: number }),
  }));
}

for (const [name, viewport] of [
  ['upright', { width: 390, height: 844 }],
  ['sideways', { width: 844, height: 390 }],
] as const) {
  test.describe(`flown by touch, ${name}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('two thumbs fly it: the lever climbs, holds at its stop and stays, and the stick flies and turns', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      const step = (frames: number) => page.evaluate((n) => window.game!.step(n), frames);
      const state = () => page.evaluate(() => window.game!.state());
      const W = viewport.width,
        H = viewport.height;
      // a phone shows its controls from the start, all on the screen, and nothing wider than it
      await step(1);
      expect((await state()).input.by, 'flown by touch on a phone').toBe('touch');
      await expect(page.locator('#touch')).toBeVisible();
      const { boxes } = await controlBoxes(page);
      for (const b of boxes) {
        expect(b.left).toBeGreaterThanOrEqual(0);
        expect(b.top).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(W);
        expect(b.bottom).toBeLessThanOrEqual(H);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(W);
      const travel = await leverTravel(page);
      const hand = await fingers(page);

      // the right thumb slides the lever up: it climbs
      const rx = W - 60,
        ry = H - 160;
      await hand.down(2, rx, ry);
      await hand.move(2, rx, ry - travel / 2);
      expect((await state()).input.lever, 'the lever at the top').toBe(1);
      await step(60);
      let s = await state();
      expect(s.helicopter.height, 'climbing').toBeGreaterThan(4);
      // and down to the stop, where it clicks in and the helicopter holds its height, the thumb kept on it
      await hand.move(2, rx, ry - (HOVER_LIFT * travel) / 2 + 3);
      expect((await state()).input.lever, 'clicked into the stop').toBe(HOVER_LIFT);
      await step(90);
      const held = (await state()).helicopter.z;
      await step(60);
      s = await state();
      expect(s.helicopter.z, 'holding its height at the stop').toBeCloseTo(held, 6);

      // the left thumb comes down anywhere on its side and pushes: forward, then left
      const lx = 120,
        ly = H - 150;
      await hand.down(1, lx, ly);
      await step(1);
      expect((await state()).input.controls, 'landing a thumb asks for nothing').toEqual({
        forward: 0,
        turn: 0,
        lift: HOVER_LIFT,
      });
      await hand.move(1, lx, ly - 70);
      await step(30);
      s = await state();
      expect(s.input.controls.forward, 'pushed up flies forward').toBe(1);
      expect(s.helicopter.speed).toBeGreaterThan(5);
      // with both thumbs down, a third finger, and a second on the lever's side, change nothing
      await hand.down(3, lx + 20, 60);
      await hand.down(4, W - 30, 60);
      await hand.move(3, lx + 80, 200);
      await hand.move(4, W - 30, 260);
      await step(1);
      expect((await state()).input.controls).toEqual({ forward: 1, turn: 0, lift: HOVER_LIFT });
      await hand.up(3);
      await hand.up(4);
      // the right thumb lifted, the lever stays where it was left
      await hand.up(2);
      expect((await state()).input.lever, 'the lever stays where it was left').toBe(HOVER_LIFT);
      const yaw = s.helicopter.yaw;
      await hand.move(1, lx - 70, ly);
      await step(30);
      s = await state();
      expect(s.input.controls.turn, 'pushed left turns left').toBe(1);
      expect(s.helicopter.yaw).toBeGreaterThan(yaw + 0.3);
      // lifted, the stick lets go and the lever stays
      await hand.up(1);
      await step(1);
      expect((await state()).input.controls).toEqual({ forward: 0, turn: 0, lift: HOVER_LIFT });
      expect(problems).toEqual([]);
    });

    test('a finger taken away by the browser lets go, and so does the page losing its focus', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      const controls = () =>
        page.evaluate(() => {
          window.game!.step(1);
          return window.game!.state().input.controls;
        });
      const hand = await fingers(page);
      const H = viewport.height;
      await hand.down(1, 120, H - 150);
      await hand.move(1, 120, H - 230);
      expect((await controls()).forward).toBe(1);
      // the browser takes the touch for itself, as it does for a system gesture
      await hand.cancel();
      expect((await controls()).forward, 'let go when the touch is taken away').toBe(0);
      // pushed again, and the page loses its focus
      await hand.down(5, 120, H - 150);
      await hand.move(5, 120, H - 230);
      expect((await controls()).forward).toBe(1);
      await page.evaluate(() => dispatchEvent(new Event('blur')));
      expect((await controls()).forward, 'let go when the page loses its focus').toBe(0);
      expect(problems).toEqual([]);
    });

    test('the first level delivered by letting the lever sink onto each pad, and flown again by a tap', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      const step = (frames: number) => page.evaluate((n) => window.game!.step(n), frames);
      const state = () => page.evaluate(() => window.game!.state());
      const pads = await page.evaluate(() => window.game!.content().pads);
      const [pickup, drop] = (await state()).mission.steps.map((step) => step.pad);
      // the lever starts at the sink: set over a pad, the helicopter settles onto it and the parcel goes on and off
      for (const pad of [pickup, drop]) {
        await page.evaluate((p) => window.game!.teleport(p.x, p.y, 4, 0), pads[pad]);
        await step(240);
      }
      expect((await state()).mission.done).toBe(true);
      const button = page.locator('#hud .card .again');
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.height, 'a thumb-sized button').toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      const hand = await fingers(page);
      await hand.down(9, box.x + box.width / 2, box.y + box.height / 2);
      await hand.up(9);
      await step(1);
      expect((await state()).mission.next).toBe(0);
      await expect(page.locator('#hud .done')).toBeHidden();
      expect(problems).toEqual([]);
    });

    test('a key flies it by keys and hides the controls, and a touch brings them back', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      const state = () => page.evaluate(() => window.game!.state());
      await page.evaluate(() => window.game!.step(1));
      await expect(page.locator('#touch')).toBeVisible();
      await page.keyboard.down('Space');
      await page.evaluate(() => window.game!.step(30));
      await page.keyboard.up('Space');
      let s = await state();
      expect(s.input.by).toBe('keys');
      expect(s.helicopter.landed, 'Space climbs').toBe(false);
      await expect(page.locator('#touch')).toBeHidden();
      const hand = await fingers(page);
      await hand.down(1, 120, viewport.height - 150);
      await hand.up(1);
      await page.evaluate(() => window.game!.step(1));
      s = await state();
      expect(s.input.by).toBe('touch');
      await expect(page.locator('#touch')).toBeVisible();
      expect(problems).toEqual([]);
    });
  });
}
