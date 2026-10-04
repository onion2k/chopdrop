/**
 * What the fire tests and pictures share: the bucket put out and the tank filled as a player fills it, by letting the
 * bucket down into the water over the fire's run, a hover over a patch at a height a drop reaches from, and the scenes the pictures are taken of, each one
 * set up through the test API so that the browser tests, the pictures and the check that a picture is the same on every
 * page just booted all draw the same thing. Every move is flown through `fly`, so the game does what it does for keys,
 * and nothing is set that a player could not do. The particles move only as a frame is drawn, so each is stepped with
 * `stepDrawn`. The game must be paused.
 */
import type { Page } from '@playwright/test';
import { FIRES, theIsland } from '../src/arena';
import { PATCH, treesOnPatches } from '../src/fire';
import { TREE_STRIDE } from '../src/island';
import { HOVER_LIFT } from '../src/helicopter';
import { DROP, SCOOP } from '../src/water';

/** The fires, by the place of each. */
export const WEST = FIRES[0];
export const SOUTH = FIRES[1];
export const NORTH = FIRES[2];

/**
 * A patch on the east edge of the west fire, which a drop from over it puts out seven of the ten lit patches by (the ones
 * within the splash of it), so three burn on and seven are burnt: the fire as a picture shows it part way through.
 */
export const EDGE = WEST.patches[4];

/** A patch on the west edge of the west fire, which a drop from over it puts out five of the ten lit patches by, and leaves five burning. */
export const HALF = WEST.patches[9];

/** The frames a pour takes, and a few more: a drop held over its patch for this many has poured out. */
export const POUR_FRAMES = Math.ceil(DROP.pour * 60) + 4;

/** A height over the ground at which a drop reaches and the bucket's line clears the treetops. */
export const DROP_HEIGHT = DROP.high - 3;

/** The height over the ground the bucket is flown to a fire at: well inside the drop's window of 40 m, with the line clear of the treetops. */
export const FLY_HEIGHT = 30;

/** The trees on every fire's patches, found here as the game finds them, to hold what the page draws to. */
const found = treesOnPatches(FIRES, { trees: theIsland().trees, stride: TREE_STRIDE, count: theIsland().treeCount });

/**
 * How many trees should be drawn burnt for the fires as they stand (each as the test API gives it: its patches as numbers),
 * and the pool for them: every tree on a patch that burns or is out, against every tree on any patch.
 */
export function burntTrees(fires: readonly { patches: number[] }[]): { burnt: number; pool: number } {
  let burnt = 0;
  let p = 0;
  for (const fire of fires)
    for (const state of fire.patches) {
      if (state !== PATCH.unburnt) burnt += found.first[p + 1] - found.first[p];
      p++;
    }
  return { burnt, pool: found.tree.length };
}

/** The way the chase scene looks from: the helicopter hovers this far round from the fire, whichever way the wind is blowing. */
const DRIFT = 0.9 + Math.PI / 2;

/** `frames` frames played and drawn, so the particles move with the game. */
export function settle(page: Page, frames: number) {
  return page.evaluate((n) => window.game!.stepDrawn(n), frames);
}

/** The camera parked looking at (x, y) from `radius` away and `polar` down, from `azimuth` round, a frame drawn. */
export function lookAt(page: Page, p: { x: number; y: number }, radius: number, polar: number, azimuth = -2.2) {
  return page.evaluate(
    ([x, y, radius, polar, azimuth]) => {
      const g = window.game!;
      g.look(x, y, { azimuth, polar, radius });
      g.stepDrawn(1);
    },
    [p.x, p.y, radius, polar, azimuth] as const,
  );
}

/**
 * The tank filled, done as a player does it: the bucket put out (by the key B, as a player puts it), the helicopter put
 * at the start of the fire's run hovering over the water, which it holds, the bucket dipped in it, until the fill has
 * filled the tank (the most frames it is given are ten seconds), and then let go. Says how many frames it took, or −1 if
 * it never filled, and leaves the helicopter where it filled and the bucket out. With `share`, it stops when the fill is
 * that share of the way; with `begin`, the fire's level is begun first, as a drop would have begun it.
 */
export async function scoop(page: Page, id = WEST.id, share = 1, begin = false): Promise<number> {
  await page.evaluate(() => window.game!.bucket(true));
  return page.evaluate(
    ([id, hover, share, time, begin]) => {
      const g = window.game!;
      g.play(id);
      if (begin) g.begin(id);
      g.fly(0, 0, hover);
      let frames = 0;
      const done = () => (share < 1 ? g.state().tank.filling >= share * time : g.state().tank.full);
      while (!done() && frames < 600) {
        g.stepDrawn(1);
        frames++;
      }
      if (share >= 1) g.release();
      return done() ? frames : -1;
    },
    [id, HOVER_LIFT, share, SCOOP.time, begin] as const,
  );
}

/**
 * Hovering at `height` over the ground at (x, y), held, and facing `yaw`, for `frames` frames drawn: a full tank over a
 * burning patch within the drop's reach empties itself there.
 */
export async function hoverOver(page: Page, x: number, y: number, height = DROP_HEIGHT, yaw = 0.9, frames = 2) {
  await page.evaluate(
    ([x, y, height, yaw, frames, hover]) => {
      const g = window.game!;
      g.chase();
      g.teleport(x, y, height, yaw);
      g.fly(0, 0, hover);
      g.stepDrawn(frames);
      g.release();
    },
    [x, y, height, yaw, frames, HOVER_LIFT] as const,
  );
}

/** The helicopter put back on the home pad, out of the picture, with the fire level it left going and its tank empty. */
export function sendHome(page: Page) {
  return page.evaluate(() => {
    const g = window.game!;
    const { home } = g.content();
    g.teleport(home.x, home.y, 0, home.yaw);
  });
}

/** The fire as a picture of it from afar shows it: the camera over the west wood, and the smoke let tower. */
export async function sceneFar(page: Page) {
  await lookAt(page, WEST, 230, 1.15);
  await settle(page, 600);
}

/** Flames over glowing ground and burnt: a drop over the fire's east edge poured out, the helicopter gone, and the camera over the wood. */
export async function sceneNear(page: Page) {
  await settle(page, 600);
  await scoop(page);
  await hoverOver(page, EDGE.x, EDGE.y, DROP_HEIGHT, 0.9, POUR_FRAMES);
  await sendHome(page);
  await lookAt(page, WEST, 60, 0.95, -1.6);
  await settle(page, 240);
}

/** The helicopter hovering 22 m upwind of the fire, facing it, its wash on the smoke: the chase camera behind it. */
export async function sceneChase(page: Page) {
  const d = -22;
  const [x, y] = [WEST.x + Math.cos(DRIFT) * d, WEST.y + Math.sin(DRIFT) * d];
  await settle(page, 600);
  await hoverOver(page, x, y, 20, Math.atan2(WEST.y - y, WEST.x - x), 300);
  await settle(page, 120);
}

/**
 * The west fire half put out, as the picture of the burnt trees shows it: a drop over its west edge poured out, the
 * helicopter gone, and the camera low and close among the trees, so the black poles stand against the flames behind them.
 */
export async function sceneBurnt(page: Page) {
  await settle(page, 600);
  await scoop(page);
  await hoverOver(page, HALF.x, HALF.y, FLY_HEIGHT, 0.9, POUR_FRAMES);
  await sendHome(page);
  await lookAt(page, { x: WEST.x + 2, y: WEST.y }, 34, 1.3, -1.3);
  await settle(page, 240);
}

/**
 * The drop poured from 30 m as the bucket is flown over the flames: the helicopter 40 m off the fire's middle, flown through
 * it at full speed, half a second into the pour, so the curtain of water falls from the bucket as it trails along; the
 * camera parked to the side and low, to see it reach the ground.
 */
export async function scenePour(page: Page) {
  await settle(page, 600);
  await scoop(page);
  await flyAt(page, WEST, 40, FLY_HEIGHT);
  await page.evaluate(() => {
    const g = window.game!;
    for (let f = 0; f < 240 && g.state().pour <= 0; f++) g.stepDrawn(1);
    g.stepDrawn(27);
    const h = g.state().helicopter;
    g.look(h.x, h.y, { azimuth: -2.2, polar: 1.05, radius: 90 });
    g.stepDrawn(1);
  });
}

/**
 * A drop part way, the helicopter held over the fire's edge at the most a drop is let go from: the spray falling from the
 * bucket and the mist where it lands, half a second into the pour, the camera parked close and to the side.
 */
export async function sceneDrop(page: Page) {
  await settle(page, 600);
  await scoop(page);
  await hoverOver(page, EDGE.x, EDGE.y, DROP_HEIGHT, 0.9, 30);
  await lookAt(page, EDGE, 70, 1.0, -2.2);
}

/** The helicopter hovering over the lake with the fire level begun and the bucket half filled: the bucket dipped in the water, the loader and the badge. */
export async function sceneFilling(page: Page) {
  await settle(page, 600);
  await scoop(page, WEST.id, 0.5, true);
  await settle(page, 1);
}

/** The tank full with the fire level begun, the helicopter 60 from the fire facing it: the bar, the arrow and the badge. */
export async function sceneGoing(page: Page) {
  await settle(page, 600);
  await scoop(page);
  await page.evaluate((id) => window.game!.begin(id), WEST.id);
  const yaw = 0.9;
  await hoverOver(page, WEST.x - Math.cos(yaw) * 60, WEST.y - Math.sin(yaw) * 60, 26, yaw, 30);
  await settle(page, 1);
}

/** The middle of the west fire's run over its lake: open water under it, at the run's own level. */
export const LAKE = {
  x: (WEST.run.from.x + WEST.run.to.x) / 2,
  y: (WEST.run.from.y + WEST.run.to.y) / 2,
  z: WEST.run.z,
  yaw: Math.atan2(WEST.run.to.y - WEST.run.from.y, WEST.run.to.x - WEST.run.from.x),
};

/**
 * The helicopter hovering `height` over the west lake (its skids over the water's face), the chase camera behind it, held
 * for `frames` frames drawn so the rotor's spray has been thrown up and is in the air.
 */
export async function sceneSpray(page: Page, height = 3, frames = 120) {
  await page.evaluate(
    ([x, y, yaw, height, frames, hover]) => {
      const g = window.game!;
      g.chase();
      g.teleport(x, y, height, yaw);
      g.fly(0, 0, hover);
      g.stepDrawn(frames);
      g.release();
    },
    [LAKE.x, LAKE.y, LAKE.yaw, height, frames, HOVER_LIFT] as const,
  );
}

/** The west fire from `off` metres east of it, the chase camera facing it from 40 m up, the smoke let tower for ten seconds drawn. */
export async function sceneAfar(page: Page, off = 450) {
  await page.evaluate(
    ([x, y, off, hover]) => {
      const g = window.game!;
      g.chase();
      g.teleport(x + off, y, 40, Math.PI);
      g.fly(0, 0, hover);
      g.stepDrawn(600);
    },
    [WEST.x, WEST.y, off, HOVER_LIFT] as const,
  );
}

/**
 * How many pixels of the picture `png` are smoke, in `area`: grey, which neither the sky, the sea nor a wood is, so a
 * pixel is smoke when no channel of it is more than `grey` over another and it is neither black nor white. Counted in
 * the page, which decodes the picture as it draws it.
 */
export function smokePixels(
  page: Page,
  png: Buffer,
  area: { x0: number; x1: number; y0: number; y1: number },
  grey = 30,
): Promise<number> {
  return page.evaluate(
    async ([data, area, grey]) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const c = canvas.getContext('2d')!;
      c.drawImage(bitmap, 0, 0);
      const { data: px } = c.getImageData(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0);
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        const top = Math.max(px[i], px[i + 1], px[i + 2]);
        if (top - Math.min(px[i], px[i + 1], px[i + 2]) <= grey && top > 30 && top < 235) n++;
      }
      return n;
    },
    [png.toString('base64'), area, grey] as const,
  );
}

/**
 * The helicopter put `off` metres from (x, y) on the way it faces, `height` over the ground, and flown at it at full speed
 * with the height held: the controls stay as they are until released, and the test steps the frames.
 */
export async function flyAt(page: Page, at: { x: number; y: number }, off: number, height: number) {
  await page.evaluate(
    ([x, y, off, height, hover]) => {
      const g = window.game!;
      const yaw = 0.9;
      g.chase();
      g.teleport(x - Math.cos(yaw) * off, y - Math.sin(yaw) * off, height, yaw);
      g.fly(0, 0, hover);
      g.stepDrawn(2);
      g.fly(1, 0, hover);
    },
    [at.x, at.y, off, height, HOVER_LIFT] as const,
  );
}

/**
 * The tank filled again with a level going, as a player does it between two drops: the helicopter put hovering over the
 * lake's run, which holds it, with the bucket let down until the tank is full. Says how many frames it took, or −1.
 */
export function refill(page: Page): Promise<number> {
  return page.evaluate(
    ([x, y, yaw, hover]) => {
      const g = window.game!;
      g.teleport(x, y, 0, yaw);
      g.fly(0, 0, hover);
      let frames = 0;
      while (!g.state().tank.full && frames < 600) {
        g.stepDrawn(1);
        frames++;
      }
      g.release();
      return g.state().tank.full ? frames : -1;
    },
    [LAKE.x, LAKE.y, LAKE.yaw, HOVER_LIFT] as const,
  );
}
