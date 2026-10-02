/**
 * What the game looks like, held to pictures taken before. Every other check
 * is on what the game does; nothing until now noticed a palette gone muddy,
 * a light lost, or the sea drawn over the land.
 *
 * Each scene is set through the test API with chance seeded from before the
 * game is built, the game paused, the camera parked by hand, and a fixed
 * number of frames stepped, so the same machine draws the same pixels every
 * run. The pictures are in `smoke/screens/`. They are this machine's GPU:
 * another one will draw them a little differently, so the pictures are not
 * worth arguing with from elsewhere.
 *
 *   npm run look               the scenes against the pictures
 *   npm run look:update        the pictures written again, after a change meant to alter them
 *
 * A failure leaves the picture, what was drawn and the difference in
 * `test-results/`. Look at all three before deciding which is right.
 */
import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../src/arena';
import { CHASE } from '../src/chase';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import type { Gate, Ring } from '../src/mission';
import { DELIVERIES, WOOD, fingers, leverTravel, standardView, start, watch } from './game';

/**
 * How far the pictures may differ before it is a change and not the GPU: not a pixel whose colour is off by more
 * than 0.02, Playwright's own measure of a colour's difference. Drawn on thirty pages just booted, ten of them with
 * every core at other work, the arena matched its picture to the pixel even at a threshold of 0, so there is no
 * drift here to allow for. Playwright leaves out a pixel it takes for the edge of a shape smoothed: four such
 * differed, byte for byte, between the picture and one written again two weeks and six renderer versions later. The five-hundredth of the pixels it used to forgive was 2,048 of them, and a button
 * over the island is 701. A game that draws more (grass, particles, fog) measures its own drift the same way,
 * before it chooses: `/gate-moved` says how.
 */
const TOLERANCE = { maxDiffPixels: 0, threshold: 0.02 };

/** The corner that counts the milliseconds a frame takes is different every run, and says nothing about the look. */
async function hideStats(page: Page) {
  await page.locator('#stats').evaluate((el: HTMLElement) => (el.hidden = true));
}

/**
 * The delivery `id` begun as a player begins it, landed on its crate for as long as it takes to load, and then the
 * parcel carried `along` the way to the pad it is wanted on, flying level at it.
 */
async function carrying(page: Page, id = 'first-delivery', along = 0.45) {
  const { pickup, drop } = DELIVERIES[id];
  await page.evaluate(
    ([pickup, drop, hover, share]) => {
      const g = window.game!;
      const [a, b] = [g.content().pads[pickup], g.content().pads[drop]];
      g.teleport(a.x, a.y, 0, 0);
      g.step(100);
      const yaw = Math.atan2(b.y - a.y, b.x - a.x);
      g.teleport(a.x + share * (b.x - a.x), a.y + share * (b.y - a.y), 30, yaw);
      g.fly(1, 0, hover);
      g.step(50);
      g.release();
    },
    [pickup, drop, HOVER_LIFT, along] as const,
  );
}

/**
 * A level of rings or openings under way: the level `id` flown, its rings and openings before the one at `n` flown
 * through by lining up on each, the first of them beginning it, and the helicopter `back` before that one on its axis, at its height, flying at it;
 * the camera behind it.
 */
async function openingAhead(page: Page, id: string, n: number, back: number) {
  const openings = LEVELS.find((l) => l.id === id)!.steps.filter(
    (s): s is Ring | Gate => s.kind === 'ring' || s.kind === 'gate',
  );
  await page.evaluate(
    ([level, openings, n, b, middle, hover]) => {
      const g = window.game!;
      g.play(level);
      g.fly(0, 0, 1);
      g.step(30);
      const before = (k: number, d: number) => {
        const r = openings[k];
        const [x, y] = [r.x - Math.cos(r.yaw) * d, r.y - Math.sin(r.yaw) * d];
        g.teleport(x, y, r.z - middle - g.floorAt(x, y), r.yaw);
      };
      for (let k = 0; k < n; k++) {
        before(k, 12);
        g.fly(1, 0, hover);
        g.step(90);
      }
      before(n, b);
      g.fly(0.6, 0, hover);
      g.step(40);
      g.release();
    },
    [id, openings, n, back, HELICOPTER.size.middle, HOVER_LIFT] as const,
  );
}

/**
 * The helicopter hovering beside the west tower, facing straight away from it, its look point `out` from the tower's
 * middle and at half its height, so the tower is behind it and its camera.
 */
async function besideTower(page: Page, out: number) {
  await page.evaluate(
    ([out, hover, lookUp]) => {
      const g = window.game!;
      g.play('under-and-between');
      const tower = g.content().structures.find((b) => b.name === 'the west tower')!;
      const [x, y] = [tower.x + out * Math.cos(tower.yaw), tower.y + out * Math.sin(tower.yaw)];
      g.teleport(x, y, tower.z + tower.height / 2 - lookUp - g.floorAt(x, y), tower.yaw);
      g.fly(0, 0, hover);
      g.step(60);
      g.release();
    },
    [out, HOVER_LIFT, CHASE.lookUp] as const,
  );
}

/** Two levels done, so the panel shows rows with a time and rows without. */
const TWO_DONE = { best: { 'first-delivery': 41.2, 'ring-trial': 33.5 } };

/**
 * The parcel taken from the meadow pad to the hilltop pad and delivered, the toast up: begun by landing on the crate,
 * flown for about half a minute, and set down facing past where the crate stood, so the toast has a time that reads as
 * a delivery and not a blink.
 */
async function delivered(page: Page) {
  const { pickup, drop } = DELIVERIES['first-delivery'];
  await page.evaluate(
    ([pickup, drop, hover]) => {
      const g = window.game!;
      const pads = g.content().pads;
      g.teleport(pads[pickup].x, pads[pickup].y, 0, 0);
      g.step(100);
      g.teleport(pads[pickup].x, pads[pickup].y, 10, 0);
      g.fly(0, 0, hover);
      g.step(2100);
      g.release();
      g.teleport(pads[drop].x, pads[drop].y, 0, pads[drop].yaw + 0.5);
      g.step(100);
    },
    [pickup, drop, HOVER_LIFT] as const,
  );
  await expect(page.locator('#hud .toast')).toBeVisible();
}

/** The first ring of the ring trial, and of the valley: what a start is flown through. */
const TRIAL = LEVELS.find((l) => l.id === 'ring-trial')!.steps[0] as Ring;
const TOWERS_GATE = LEVELS.find((l) => l.id === 'under-and-between')!.steps[0] as Gate;

/**
 * The helicopter hovering `back` before the opening at (x, y, z) facing `yaw`, its middle `up` over the opening's and
 * `aside` to one side, flying slowly at it for half a second: the chase camera behind it, nothing begun.
 */
async function before(
  page: Page,
  o: { x: number; y: number; z: number; yaw: number },
  back: number,
  up = 0,
  aside = 0,
) {
  await page.evaluate(
    ([o, back, up, aside, middle]) => {
      const g = window.game!;
      const [x, y] = [
        o.x - Math.cos(o.yaw) * back - Math.sin(o.yaw) * aside,
        o.y - Math.sin(o.yaw) * back + Math.cos(o.yaw) * aside,
      ];
      g.chase();
      g.teleport(x, y, o.z + up - middle - g.floorAt(x, y), o.yaw);
      g.fly(0.6, 0, 0.53);
      g.step(30);
      g.release();
    },
    [o, back, up, aside, HELICOPTER.size.middle] as const,
  );
}

test.describe('what it looks like', () => {
  test('the island, from above the home pad', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await standardView(page);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('arena.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the chase camera, a second after the start', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => window.game!.step(60));
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('chase.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('turning in the air', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      const { home } = g.content();
      g.teleport(home.x, home.y, 8, home.yaw);
      g.fly(1, 1, 1);
      g.step(45);
      g.release();
    });
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('turning.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the trees bowed by the downwash, the helicopter hovering low in a wood', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const bowed = await page.evaluate(
      ([w, hover]) => {
        const g = window.game!;
        g.teleport(w.x, w.y, 4, 0);
        g.look(w.x, w.y, { azimuth: -Math.PI / 2, polar: 0.9, radius: 44 });
        // the stick held at the hover, as a touch stick can, so it stays four up and does not sink into the wood
        g.fly(0, 0, hover);
        g.step(150);
        g.release();
        return g.sway().count;
      },
      [WOOD, HOVER_LIFT] as const,
    );
    expect(bowed, 'trees bowed in the picture').toBeGreaterThan(20);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('downwash.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the chase camera over the crowns, the helicopter let down into a clearing in a wood', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const landed = await page.evaluate((w) => {
      const g = window.game!;
      g.teleport(w.x, w.y, 14, 0);
      g.step(420);
      return g.state().helicopter.landed;
    }, WOOD);
    expect(landed, 'set down in the clearing').toBe(true);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('clearing.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('free flight: loading on the crate on the meadow pad, the loader half full', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      const pad = g.content().pads[4];
      g.teleport(pad.x, pad.y, 0, 2.3);
      g.step(45);
    });
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('level-loading.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the first level: the parcel carried toward the hilltop pad, its beacon ahead', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await carrying(page);
    await hideStats(page);
    await expect(page.locator('#hud .goal')).toHaveText('Deliver it to the hilltop pad');
    await expect(page.locator('#view')).toHaveScreenshot('level-carrying.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('delivered on the hilltop pad: the toast alone, the hint hidden under it, the game not held', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await delivered(page);
    await hideStats(page);
    expect((await page.evaluate(() => window.game!.state().toast))!).toMatch(/^Delivered! 0:\d\d ★ New best$/);
    await expect(page.locator('#view')).toHaveScreenshot('toast.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('over the water: the parcel carried out over the lake, toward the lakeside pad', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await carrying(page, 'over-the-water', 0.62);
    await hideStats(page);
    await expect(page.locator('#hud .goal')).toHaveText('Deliver it to the lakeside pad');
    await expect(page.locator('#view')).toHaveScreenshot('level-over-the-water.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the ring trial: the ring wanted lit ahead, the rings after it white, the one passed gone', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await openingAhead(page, 'ring-trial', 1, 45);
    await hideStats(page);
    await expect(page.locator('#hud .goal')).toHaveText('Fly through ring 2 of 6');
    await expect(page.locator('#view')).toHaveScreenshot('rings.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('up the valley: climbing the river to the fourth ring, the rest above it', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await openingAhead(page, 'up-the-valley', 3, 40);
    await hideStats(page);
    await expect(page.locator('#hud .goal')).toHaveText('Fly through ring 4 of 9');
    await expect(page.locator('#view')).toHaveScreenshot('rings-valley.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the course: under the bridge in the gorge, from the chase camera', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await openingAhead(page, 'under-and-between', 1, 45);
    await hideStats(page);
    await expect(page.locator('#hud .goal')).toHaveText('Fly under the bridge');
    await expect(page.locator('#view')).toHaveScreenshot('course-bridge.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the course: before the towers, nothing begun, from the chase camera', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await openingAhead(page, 'under-and-between', 0, 35);
    await hideStats(page);
    await expect(page.locator('#hud .hint')).toBeVisible();
    await expect(page.locator('#view')).toHaveScreenshot('course-towers.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the camera drawn in, a tower between it and the helicopter', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await besideTower(page, 16);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('camera-drawn-in.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the camera looking down, the helicopter backed up to a tower with no room behind it', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await besideTower(page, 9.4);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('camera-over.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('flying free near a start ring: the hint in the bar, and a crate on a pad in view', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate((ring) => {
      // the helicopter hovering beside the trial's first ring, which is seen from the side with its flag, and the lakeside
      // pad and the crate that waits on it beyond, from a camera parked over the meadow
      const g = window.game!;
      g.teleport(ring.x - 30, ring.y, 12, ring.yaw);
      g.look(ring.x + 20, ring.y + 6, { azimuth: -0.8, polar: 1.15, radius: 125 });
      g.fly(0, 0, 0.53);
      g.step(30);
      g.release();
    }, TRIAL);
    await hideStats(page);
    await expect(page.locator('#hud .hint')).toBeVisible();
    await expect(page.locator('#view')).toHaveScreenshot('free.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a start ring with its flag, from the chase camera', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await before(page, TRIAL, 60, 9);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('start-ring.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the towers, a flag on the top of each', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await before(page, TOWERS_GATE, 100, 12);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('start-towers.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('shown the way: the arrow and the distance to the ring trial', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await before(page, TRIAL, 220, 25, 40);
    await page.evaluate(() => {
      window.game!.guide('ring-trial');
      window.game!.step(1);
    });
    await hideStats(page);
    await expect(page.locator('#hud .goal')).toHaveText('To the start · Ring trial');
    await expect(page.locator('#view')).toHaveScreenshot('guided.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the panel over the island dimmed: two done, the third going', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: TWO_DONE });
    await page.evaluate(() => {
      window.game!.begin('over-the-water');
      window.game!.step(60);
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeVisible();
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('panel.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a small thing added to the island is a change', async ({ page }, info) => {
    // while the pictures are being written this would write its own, button and all, over the island's
    test.skip(!['none', 'missing'].includes(info.config.updateSnapshots), 'the pictures are being written');
    // the gate held to itself: a button a fifth the size of a thumb, which a tolerance of a five-hundredth of the
    // pixels let through, and let through four times over in a game copied from here
    await start(page, { seed: 11, paused: true });
    await standardView(page);
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.textContent = 'Go';
      Object.assign(button.style, { position: 'fixed', left: '600px', top: '380px', font: '12px sans-serif' });
      document.body.append(button);
    });
    await hideStats(page);
    let seen = '';
    try {
      await expect(page.locator('#view')).toHaveScreenshot('arena.png', { ...TOLERANCE, timeout: 5000 });
    } catch (e) {
      seen = String(e);
    }
    expect(seen, 'the picture with a button on it matched the picture without').toMatch(/pixels \(ratio/);
  });
});

for (const [name, viewport] of [
  ['upright', { width: 390, height: 844 }],
  ['sideways', { width: 844, height: 390 }],
] as const) {
  test.describe(`on a phone, ${name}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the touch controls in use, the lever at its stop and the stick pushed', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate((w) => window.game!.teleport(w.x - 30, w.y, 7, 0), WOOD);
      await page.evaluate(() => window.game!.step(1));
      const travel = await leverTravel(page);
      const hand = await fingers(page);
      const { width: W, height: H } = viewport;
      // the right thumb sets the lever at its stop and stays; the left pushes the stick forward and a little right
      await hand.down(2, W - 60, H - 160);
      await hand.move(2, W - 60, H - 160 - (HOVER_LIFT * travel) / 2);
      await hand.down(1, 120, H - 150);
      await hand.move(1, 140, H - 190);
      const lever = await page.evaluate(() => {
        window.game!.step(120);
        return window.game!.state().input.lever;
      });
      expect(lever, 'the lever at its stop').toBe(HOVER_LIFT);
      await hideStats(page);
      await expect(page.locator('#view')).toBeVisible();
      await expect(page).toHaveScreenshot(`touch-${name}.png`, TOLERANCE);
      expect(problems).toEqual([]);
    });
  });
}

test.describe('the first level on a phone, upright', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('carrying, and the toast', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await carrying(page);
    await hideStats(page);
    await expect(page).toHaveScreenshot('level-phone-carrying.png', TOLERANCE);
    await page.evaluate(() => window.game!.home());
    await delivered(page);
    await hideStats(page);
    await expect(page).toHaveScreenshot('toast-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('flying free near a start ring, the hint in the bar', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await before(page, TRIAL, 45);
    await hideStats(page);
    await expect(page.locator('#hud .hint')).toBeVisible();
    await expect(page).toHaveScreenshot('free-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the ring trial, the ring wanted lit ahead', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await openingAhead(page, 'ring-trial', 1, 45);
    await hideStats(page);
    await expect(page).toHaveScreenshot('rings-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the course, under the bridge', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await openingAhead(page, 'under-and-between', 1, 30);
    await hideStats(page);
    await expect(page).toHaveScreenshot('course-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the panel, one column of rows', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: TWO_DONE });
    await page.evaluate(() => {
      window.game!.begin('over-the-water');
      window.game!.step(60);
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeVisible();
    await hideStats(page);
    await expect(page).toHaveScreenshot('panel-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });
});
