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
import { COLLECTIBLES, FIRES, LEVELS, PACKAGES } from '../src/arena';
import { CHASE } from '../src/chase';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import type { Gate, Ring } from '../src/mission';
import { DELIVERIES, SLOW_CLIMB, WOOD, fingers, leverTravel, standardView, start, watch } from './game';
import {
  sceneAfar,
  sceneChase,
  sceneDrop,
  sceneFar,
  sceneGoing,
  sceneNear,
  sceneFilling,
  sceneSpray,
  scoop,
  settle,
} from './fire';
import { windYaw } from '../src/wind';

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
      const tower = g.content().structures.find((b) => b.name === "the shoulder towers' west tower")!;
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
    ([o, back, up, aside, middle, climb]) => {
      const g = window.game!;
      const [x, y] = [
        o.x - Math.cos(o.yaw) * back - Math.sin(o.yaw) * aside,
        o.y - Math.sin(o.yaw) * back + Math.cos(o.yaw) * aside,
      ];
      g.chase();
      g.teleport(x, y, o.z + up - middle - g.floorAt(x, y), o.yaw);
      g.fly(0.6, 0, climb);
      g.step(30);
      g.release();
    },
    [o, back, up, aside, HELICOPTER.size.middle, SLOW_CLIMB] as const,
  );
}

/** The opening of the structure named `id`, which a picture is framed by. */
const openingOf = (id: string) => COLLECTIBLES.find((c) => c.id === id)!.opening;

/** The structures a picture of the collected look has collected: a pair, a bridge and a pair, as the mock showed them. */
const SOME = { best: {}, collected: ['shoulder-towers', 'gorge-bridge', 'lakeside-towers'] };

/**
 * The towers `id` flown through from 25 short of their opening by the controls, until they are collected, the toast up;
 * and the camera then parked over them, `radius` away, so the collar that has just gone on is in the picture with the
 * toast, which the chase camera, with the helicopter between the towers, does not show.
 */
async function collecting(page: Page, id: string, radius = 140) {
  const gate = openingOf(id);
  await before(page, gate, 25);
  await page.evaluate(
    ([id, hover, x, y, radius]) => {
      const g = window.game!;
      g.fly(1, 0, hover);
      for (let f = 0; f < 300 && !g.state().collected.includes(id); f += 5) g.step(5);
      g.release();
      g.look(x, y, { azimuth: -2.3, polar: 1.1, radius });
      g.step(1);
    },
    [id, HOVER_LIFT, gate.x, gate.y, radius] as const,
  );
  await expect(page.locator('#hud .toast h2')).toHaveText('Collected');
}

/** The package in a wood by a lake, which a clearing is pictured at, and the three a panel's dots are filled for. */
const INLAND = PACKAGES.find((p) => p.id === 'lake-east-wood')!;
const THREE_FOUND = ['west-shore-wood', 'north-gorge-wood', 'east-wood'];

/** The corner the radar's badge is in, which the pictures of it are cut to: a clear look at it and what is behind it. */
const CORNER = { x: 1040, y: 0, width: 240, height: 120 };

/** The camera parked looking at a package from `radius` away and `polar` down, from `azimuth` round, a frame drawn. */
async function lookAtPackage(page: Page, p: { x: number; y: number }, radius: number, polar: number, azimuth = -2.2) {
  await page.evaluate(
    ([x, y, radius, polar, azimuth]) => {
      const g = window.game!;
      g.look(x, y, { azimuth, polar, radius });
      g.step(1);
    },
    [p.x, p.y, radius, polar, azimuth] as const,
  );
}

/**
 * The helicopter hovering `back` from a package and `up` over the ground there, facing it, the chase camera behind it.
 * Held at the hover while it is stepped on to `ring` frames after a ping, so that the badge shows a ring part way out;
 * 0 leaves it where it hovered, and the lift let go.
 */
async function hoverBy(page: Page, p: { x: number; y: number }, back: number, up: number, ring = 0) {
  await page.evaluate(
    ([x, y, back, up, ring, hover]) => {
      const g = window.game!;
      const yaw = 0.9;
      g.chase();
      g.teleport(x - Math.cos(yaw) * back, y - Math.sin(yaw) * back, up, yaw);
      g.fly(0, 0, hover);
      g.step(40);
      if (ring > 0) {
        for (let f = 0; f < 600 && !g.state().radar.pinged; f++) g.step(1);
        g.step(ring);
      }
      g.release();
    },
    [p.x, p.y, back, up, ring, HOVER_LIFT] as const,
  );
}

/** The helicopter let down on the ground 6 m from a package, by the lift held down, and the camera parked over the place. */
async function findingPackage(page: Page, p: { x: number; y: number }, radius = 50) {
  await page.evaluate(
    ([x, y, radius]) => {
      const g = window.game!;
      g.teleport(x - 6, y, 8, 0);
      g.fly(0, 0, -1);
      for (let f = 0; f < 300 && !g.state().helicopter.landed; f += 5) g.step(5);
      g.release();
      g.look(x, y, { azimuth: -2.2, polar: 1.0, radius });
      g.step(1);
    },
    [p.x, p.y, radius] as const,
  );
  await expect(page.locator('#hud .toast h2')).toHaveText('Package found');
}

/** The walker's place, in the western wood: where the smoke rises and the winch is held. */
const WALKER = 'wood-rescue';

/** The camera parked looking at the walker's place from `azimuth` round and `polar` down, `radius` away. */
async function lookAtWalker(page: Page, radius: number, polar: number, azimuth: number) {
  await page.evaluate(
    ([id, radius, polar, azimuth]) => {
      const g = window.game!;
      const w = g.content().rescues.find((r) => r.id === id)!;
      g.look(w.x, w.y, { azimuth, polar, radius });
      g.step(1);
    },
    [WALKER, radius, polar, azimuth] as const,
  );
}

/**
 * The helicopter `back` from the walker's place along the way it faces and `up` over the ground, hovering still, facing
 * the walker, the camera behind it; and, with `hold`, held in the window over them for that many frames first so that
 * the winch is part way, or the level begun.
 */
async function overWalker(page: Page, back: number, up: number, aside = 0, yaw = 0.9) {
  await page.evaluate(
    ([id, back, up, aside, yaw, hover]) => {
      const g = window.game!;
      const w = g.content().rescues.find((r) => r.id === id)!;
      g.chase();
      // `aside` to the left of the way it faces, so the person is not behind the helicopter from the camera
      const [x, y] = [
        w.x - Math.cos(yaw) * back - Math.sin(yaw) * aside,
        w.y - Math.sin(yaw) * back + Math.cos(yaw) * aside,
      ];
      g.teleport(x, y, up, yaw);
      g.fly(0, 0, hover);
      g.step(45);
      g.release();
    },
    [WALKER, back, up, aside, yaw, HOVER_LIFT] as const,
  );
}

/** The sailor in the boat off the east beach: where the boat sits and the winch is held. */
const SAILOR = 'boat-rescue';

/** The sailor half way up the rope: the window held over the boat for 1.5 s, the loader half full, nothing begun. */
async function winching(page: Page) {
  await page.evaluate(
    ([id, hover]) => {
      const g = window.game!;
      const w = g.content().rescues.find((r) => r.id === id)!;
      g.teleport(w.x, w.y, 10, 0.9);
      g.fly(0, 0, hover);
      g.step(90);
      g.release();
    },
    [SAILOR, HOVER_LIFT] as const,
  );
  const now = await page.evaluate(() => window.game!.state());
  expect(now.winch.spot).toBe(SAILOR);
  expect(now.winch.share).toBeCloseTo(0.5, 1);
}

/** The walker climbing aboard: set down beside them for half the boarding, the loader half full, nothing begun. */
async function boarding(page: Page) {
  await page.evaluate((id) => {
    const g = window.game!;
    g.play(id);
    g.step(90);
  }, WALKER);
  const now = await page.evaluate(() => window.game!.state());
  expect(now.board.spot).toBe(WALKER);
  expect(now.board.share).toBeCloseTo(0.5, 1);
}

/** The camera parked looking at the boat from `radius` away and `polar` down, from `azimuth` round, a frame drawn. */
async function lookAtBoat(page: Page, radius: number, polar: number, azimuth: number) {
  await page.evaluate(
    ([id, radius, polar, azimuth]) => {
      const g = window.game!;
      const w = g.content().rescues.find((r) => r.id === id)!;
      g.look(w.x, w.y, { azimuth, polar, radius });
      g.step(1);
    },
    [SAILOR, radius, polar, azimuth] as const,
  );
}

/** The bucket in one of its three looks, over the west lake, the corner of the radar and the badge, the game drawn so the badge is as it is drawn. */
async function badgeScene(page: Page, state: 'in' | 'out' | 'full') {
  if (state === 'full') await scoop(page);
  else {
    await page.evaluate(
      ([id, out, hover]) => {
        const g = window.game!;
        g.bucket(out);
        g.play(id);
        g.fly(0, 0, hover);
        g.stepDrawn(2);
        g.release();
      },
      ['west-lake-fire', state === 'out', HOVER_LIFT] as const,
    );
  }
  await settle(page, 2);
  expect((await page.evaluate(() => window.game!.state())).badge).toBe(state);
}

/**
 * The smoke seen side-on to the wind of the moment, as the mock was: the camera `radius` from (x, y) and `polar` down,
 * its azimuth a quarter turn from the way the wind blows, after the game has been drawn for `frames` frames so the smoke
 * has risen. Needs the game paused.
 */
async function sideOn(page: Page, at: { x: number; y: number }, radius: number, polar: number, frames: number) {
  await settle(page, frames);
  const t = await page.evaluate(() => window.game!.state().t);
  const azimuth = windYaw(t) + Math.PI / 2;
  await page.evaluate(
    ([x, y, radius, polar, azimuth]) => {
      const g = window.game!;
      g.look(x, y, { azimuth, polar, radius });
      g.stepDrawn(1);
    },
    [at.x, at.y, radius, polar, azimuth] as const,
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

  test('the helicopter hovering 2 m over the crowns of a wood: the whole wood bowed away under it, the trees plainly moving', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const bowed = await page.evaluate(
      ([w, hover]) => {
        const g = window.game!;
        // the helicopter in the wood beside the clearing, its skids two metres over the highest crown there; the view
        // is parked on the ground beyond it, on the line from the camera through the helicopter, so that it sits in the
        // middle of the picture with the wood bowed round it
        const at = { x: w.x + 14, y: w.y - 10 };
        const top = Math.max(...g.treesNear(at.x, at.y, 12).map((t) => t.z + t.height));
        g.teleport(at.x, at.y, top - g.floorAt(at.x, at.y) + 2, 0);
        const view = { azimuth: -Math.PI / 2, polar: 1.0, radius: 60 };
        const camera = view.radius * Math.cos(view.polar),
          across = view.radius * Math.sin(view.polar);
        const back = ((top + 2 - g.groundAt(at.x, at.y)) / camera) * across;
        g.look(at.x - back * Math.cos(view.azimuth), at.y - back * Math.sin(view.azimuth), view);
        g.fly(0, 0, hover);
        g.step(150);
        g.release();
        return g.sway().count;
      },
      [WOOD, HOVER_LIFT] as const,
    );
    expect(bowed, 'trees bowed in the picture').toBeGreaterThan(30);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('downwash-wood.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the chase camera over the crowns, the helicopter let down into a clearing in a wood', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const landed = await page.evaluate((w) => {
      const g = window.game!;
      g.teleport(w.x, w.y, 14, 0);
      g.fly(0, 0, -1);
      g.step(420);
      g.release();
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
    await page.evaluate(
      ([ring, climb]) => {
        // the helicopter rising beside the trial's first ring, which is seen from the side with its flag, and the lakeside
        // pad and the crate that waits on it beyond, from a camera parked over the meadow
        const g = window.game!;
        g.teleport(ring.x - 30, ring.y, 12, ring.yaw);
        g.look(ring.x + 20, ring.y + 6, { azimuth: -0.8, polar: 1.15, radius: 125 });
        g.fly(0, 0, climb);
        g.step(30);
        g.release();
      },
      [TRIAL, SLOW_CLIMB] as const,
    );
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

  test('the shoulder towers collected: a gold collar round the top of each, from the chase camera', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: SOME });
    await before(page, openingOf('shoulder-towers'), 70, 8);
    await hideStats(page);
    expect((await page.evaluate(() => window.game!.state())).gold).toBe(2 + 2 + 2);
    await expect(page.locator('#view')).toHaveScreenshot('collected-towers.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the gorge bridge collected: both its rails gold', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: SOME });
    await before(page, openingOf('gorge-bridge'), 55, 12);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('collected-bridge.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a pair collected and a pair not, in one view', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: SOME });
    await page.evaluate(() => {
      const g = window.game!;
      g.look(122.9, -21.4, { azimuth: -2.3, polar: 1.1, radius: 140 });
      g.step(1);
    });
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('collected-far.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a structure just collected: the toast over the pair, its collars just on', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await collecting(page, 'lakeside-towers');
    await hideStats(page);
    expect((await page.evaluate(() => window.game!.state())).toast).toBe('Collected the lakeside towers · 1 of 7');
    await expect(page.locator('#view')).toHaveScreenshot('collected-toast.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the panel, a list of the structures under the levels, three ticked', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { ...SOME, best: TWO_DONE.best } });
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel .structures h3')).toHaveText('Structures3 of 7');
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('panel-structures.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a package in its clearing, a weathered blue-grey crate, from a fixed view over the wood', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await lookAtPackage(page, INLAND, 45, 0.85);
    await hideStats(page);
    expect((await page.evaluate(() => window.game!.state())).crates).toBe(10);
    await expect(page.locator('#view')).toHaveScreenshot('package-near.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the chase camera over a wood with a package in view, the radar hearing it', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await hoverBy(page, INLAND, 40, 22);
    await hideStats(page);
    expect((await page.evaluate(() => window.game!.state())).radar.badge).toBe('heard');
    await expect(page.locator('#view')).toHaveScreenshot('package-chase.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test("the radar's badge, quiet: a grey dot with no package within a hundred metres", async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => window.game!.step(60));
    await hideStats(page);
    expect((await page.evaluate(() => window.game!.state())).radar).toMatchObject({ badge: 'quiet', step: 0 });
    await expect(page).toHaveScreenshot('radar-quiet.png', { ...TOLERANCE, clip: CORNER });
    expect(problems).toEqual([]);
  });

  test("the radar's badge, heard: a gold dot and a ring part way out, in game time", async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await hoverBy(page, INLAND, 70, 25, 22);
    await hideStats(page);
    expect((await page.evaluate(() => window.game!.state())).radar).toMatchObject({ badge: 'heard', step: 3 });
    await expect(page).toHaveScreenshot('radar-heard.png', { ...TOLERANCE, clip: CORNER });
    expect(problems).toEqual([]);
  });

  test('a package just found: the toast over the clearing, its crate gone', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await findingPackage(page, INLAND);
    await hideStats(page);
    const found = await page.evaluate(() => window.game!.state());
    expect([found.toast, found.crates]).toEqual(['Package found · 1 of 10', 9]);
    await expect(page.locator('#view')).toHaveScreenshot('found-toast.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test("the panel, the packages' line under the structures, three of ten found", async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { ...SOME, best: TWO_DONE.best, found: THREE_FOUND } });
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel .packs h3')).toHaveText('Packages3 of 10');
    await expect(page.locator('#panel .packs .d.got')).toHaveCount(3);
    await page.locator('#panel .sheet').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('panel-packages.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the west bridge, which was not on the island before, from the chase camera downstream of it', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    // from downstream, facing back up the river: upstream of it the ground rises steeply, into the range
    const gate = openingOf('west-bridge');
    await before(page, { ...gate, yaw: gate.yaw + Math.PI }, 55, 10);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('structure-west-bridge.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the southern towers, a pair that was not on the island before, from the chase camera', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await before(page, openingOf('southern-towers'), 70, 8);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('structure-southern-towers.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a rescue seen from afar: the orange smoke rising over the western wood', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await lookAtWalker(page, 170, 1.15, -2.2);
    // the flare is particles, which move as frames are drawn: long enough for its smoke to reach its top
    await settle(page, 420);
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect([now.people, now.smoke]).toEqual([3, 3]);
    expect(now.particles.live, 'the flare is in the air').toBeGreaterThan(100);
    await expect(page.locator('#view')).toHaveScreenshot('rescue-far.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the walker waiting in the clearing, the smoke behind them, from the chase camera', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await overWalker(page, 10, 6, -8, 1.4);
    await settle(page, 420);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('rescue-waiting.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the walker climbing aboard: set down beside them, the loader half full, from a fixed view that shows them', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await boarding(page);
    await lookAtWalker(page, 20, 1.0, 1.0);
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect([now.rope, now.smoke, now.people, now.helicopter.landed]).toEqual([false, 3, 3, true]);
    await expect(page.locator('#hud .loader .what')).toHaveText('The walker climbs aboard');
    await expect(page.locator('#view')).toHaveScreenshot('rescue-boarding.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the boat seen from afar: an orange inflatable on the sea off the east beach, the sailor waving', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await lookAtBoat(page, 80, 1.2, 3.8);
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect([now.boats, now.people]).toEqual([1, 3]);
    await expect(page.locator('#view')).toHaveScreenshot('boat-far.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the sailor half way up the rope from the boat, the loader half full, from a fixed view that shows them', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await winching(page);
    await lookAtBoat(page, 70, 1.3, 3.0);
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect([now.rope, now.smoke, now.people, now.boats]).toEqual([true, 2, 2, 1]);
    expect(now.particles.flares, 'no flare is born at the sailor').toBe(0);
    await expect(page.locator('#hud .loader .what')).toHaveText('Winching up the sailor');
    await expect(page.locator('#view')).toHaveScreenshot('rescue-winch.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a rescue going: the arrow, the person aboard and the home pad wanted, the clock running', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await overWalker(page, 0, 10);
    await page.evaluate((climb) => {
      window.game!.begin('wood-rescue');
      window.game!.fly(0, 0, climb);
      window.game!.step(200);
      window.game!.release();
    }, SLOW_CLIMB);
    await hideStats(page);
    await expect(page.locator('#hud .goal')).toHaveText('Fly the walker to the home pad');
    await expect(page.locator('#view')).toHaveScreenshot('rescue-going.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a rescue done: the toast "Rescued!" with the time and the best', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await page.evaluate(
      ([id, hover]) => {
        const g = window.game!;
        const w = g.content().rescues.find((r) => r.id === id)!;
        const home = g.content().home;
        g.teleport(w.x, w.y, 10, 0);
        g.begin(id);
        g.fly(0, 0, hover);
        g.step(2400);
        g.release();
        g.teleport(home.x, home.y, 0, home.yaw + 0.5);
        g.step(100);
      },
      [WALKER, HOVER_LIFT] as const,
    );
    await hideStats(page);
    await expect(page.locator('#hud .toast h2')).toHaveText('Rescued!');
    await expect(page.locator('#view')).toHaveScreenshot('rescue-toast.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a fire seen from afar: the dark smoke towering over the west wood, the flare of a rescue beside it', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await sceneFar(page);
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect(now.ground).toEqual({ burning: 30, burnt: 0 });
    expect(now.particles.refused).toBe(0);
    await expect(page.locator('#view')).toHaveScreenshot('fire-far.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a fire from 450 m: the column of smoke over the horizon, the chase camera facing the west fire', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await sceneAfar(page, 450);
    await hideStats(page);
    expect((await page.evaluate(() => window.game!.state())).particles.refused).toBe(0);
    await expect(page.locator('#view')).toHaveScreenshot('fire-from-afar.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('hovering 3 m over the west lake: the ring of spray thrown out from under the rotor, and the mist over the water', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await sceneSpray(page, 3, 120);
    // eight frames more, drawn, and what the rotor threw in them counted: its emitters are in step, so a frame in eight
    // throws none, and the count of the last frame alone says nothing
    const thrown = await page.evaluate(() => {
      const g = window.game!;
      let n = 0;
      for (let f = 0; f < 8; f++) {
        g.stepDrawn(1);
        n += g.state().particles.wash;
      }
      return n;
    });
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect(thrown, 'the rotor throwing the water up').toBeGreaterThan(0);
    expect(now.particles.refused).toBe(0);
    await expect(page.locator('#view')).toHaveScreenshot('spray.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a fire from above: flames over glowing ground, with burnt patches where a drop fell on its edge', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await sceneNear(page);
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect(now.ground, 'seven burn and three are burnt in the west fire, twenty burn in the others').toEqual({
      burning: 27,
      burnt: 3,
    });
    expect(now.particles.refused).toBe(0);
    await expect(page.locator('#view')).toHaveScreenshot('fire-near.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('hovering by the fire, the chase camera behind: the smoke bent away under the rotor', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await sceneChase(page);
    await hideStats(page);
    expect((await page.evaluate(() => window.game!.state())).particles.refused).toBe(0);
    await expect(page.locator('#view')).toHaveScreenshot('fire-chase.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a drop part way: the spray falling from the bucket and the mist where it lands', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await sceneDrop(page);
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect(now.particles.spray, 'the spray is pouring').toBeGreaterThan(0);
    expect(now.bucket).toMatchObject({ hung: true, full: false });
    await expect(page.locator('#view')).toHaveScreenshot('fire-drop.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('hovering over the lake with the bucket out: the bucket dipped, the loader "Filling the bucket" half full, the badge a ring', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await sceneFilling(page);
    // seen from the side and low, so the line is seen going down into the water the bucket has sunk in
    await page.evaluate(() => {
      const g = window.game!;
      const h = g.state().helicopter;
      g.look(h.x, h.y, { azimuth: 0.5, polar: 1.4, radius: 22 });
      g.stepDrawn(1);
    });
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect([now.badge, now.bucket.out, now.bucket.hung, now.tank.full]).toEqual(['out', true, true, false]);
    expect(now.helicopter.overWater).toBe(true);
    await expect(page.locator('#hud .loader .what')).toHaveText('Filling the bucket');
    await expect(page.locator('#view')).toHaveScreenshot('bucket-dipped.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the bucket full and the fire level going: the bar, the arrow and the badge with its water', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await sceneGoing(page);
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect([now.badge, now.bucket.full, now.mission.level]).toEqual(['full', true, 'west-lake-fire']);
    await expect(page.locator('#hud .goal')).toHaveText('Fly low over the flames to drop · 10 burning');
    await expect(page.locator('#view')).toHaveScreenshot('fire-going.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  for (const state of ['in', 'out', 'full'] as const) {
    test(`the bucket's badge, ${state}: ${
      {
        in: 'grey with the key’s tag',
        out: 'an orange ring on a dark orange ground',
        full: 'the same with its water in blue',
      }[state]
    }, beside the radar`, async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, save: { best: {} } });
      await badgeScene(page, state);
      await hideStats(page);
      await expect(page).toHaveScreenshot(`bucket-${state}.png`, { ...TOLERANCE, clip: CORNER });
      expect(problems).toEqual([]);
    });
  }

  test('the smoke of the west fire in the wind, seen side-on from afar: the column leaning and curling, its top ragged', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await page.evaluate(() => window.game!.chase());
    await sideOn(page, FIRES[0], 330, 1.32, 600);
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect(now.particles.refused).toBe(0);
    expect(now.particles.sprites).toBeGreaterThan(0);
    await expect(page.locator('#view')).toHaveScreenshot('wind-fire.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the flare of the walker in the wind, seen side-on: its smoke leaning with the column', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    const w = (await page.evaluate(() => window.game!.content().rescues)).find((r) => r.id === WALKER)!;
    await sideOn(page, w, 90, 1.3, 420);
    await hideStats(page);
    const now = await page.evaluate(() => window.game!.state());
    expect(now.particles.refused).toBe(0);
    expect(now.smoke).toBe(3);
    await expect(page.locator('#view')).toHaveScreenshot('wind-flare.png', TOLERANCE);
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

  test('collected: the toast on the phone, over the pair with its collars', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await collecting(page, 'lakeside-towers');
    await hideStats(page);
    await expect(page).toHaveScreenshot('collected-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the panel, the structures in one column under the levels', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { ...SOME, best: TWO_DONE.best } });
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeVisible();
    await page.locator('#panel .sheet').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await hideStats(page);
    await expect(page).toHaveScreenshot('panel-structures-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test("the panel, the packages' line and its dots under the structures", async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { ...SOME, best: TWO_DONE.best, found: THREE_FOUND } });
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeVisible();
    await page.locator('#panel .sheet').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await hideStats(page);
    await expect(page).toHaveScreenshot('panel-packages-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test("the radar's badge heard, a ring out, at the top right and clear of the touch controls", async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await hoverBy(page, INLAND, 70, 25, 22);
    await hideStats(page);
    expect((await page.evaluate(() => window.game!.state())).radar).toMatchObject({ badge: 'heard', step: 3 });
    await expect(page).toHaveScreenshot('radar-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });
});

test.describe('a rescue on a phone, upright', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the sailor part way up the rope, the loader in view', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await winching(page);
    await hideStats(page);
    await expect(page.locator('#hud .loader .what')).toHaveText('Winching up the sailor');
    await expect(page).toHaveScreenshot('rescue-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the walker climbing aboard, the loader in view', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await boarding(page);
    await hideStats(page);
    await expect(page.locator('#hud .loader .what')).toHaveText('The walker climbs aboard');
    await expect(page).toHaveScreenshot('rescue-boarding-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });
});

test.describe('the bucket on a phone, upright', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  /** The corner under the radar, where the badge is on a phone, and the radar over it: cut to them. */
  const PHONE_CORNER = { x: 270, y: 0, width: 120, height: 130 };
  for (const state of ['in', 'out', 'full'] as const) {
    test(`the badge ${state}, under the radar and clear of the lever, with no key's tag`, async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, save: { best: {} } });
      await badgeScene(page, state);
      await hideStats(page);
      await expect(page.locator('#hud .bucket .key')).toBeHidden();
      await expect(page).toHaveScreenshot(`bucket-${state}-phone.png`, { ...TOLERANCE, clip: PHONE_CORNER });
      expect(problems).toEqual([]);
    });
  }
});

test.describe('a fire on a phone, upright', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the bucket full and the fire going: the bar, the two badges under one another, the touch controls', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: { best: {} } });
    await sceneGoing(page);
    await hideStats(page);
    await expect(page.locator('#hud .goal')).toHaveText('Fly low over the flames to drop · 10 burning');
    await expect(page.locator('#hud .bucket')).toHaveAttribute('data-state', 'full');
    await expect(page).toHaveScreenshot('fire-phone.png', TOLERANCE);
    expect(problems).toEqual([]);
  });
});
