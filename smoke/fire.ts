/**
 * What the fire tests and pictures share: the tank filled as a player fills it, by skimming along the fire's run over
 * the water, a hover over a patch at a height a drop reaches from, and the scenes the pictures are taken of, each one
 * set up through the test API so that the browser tests, the pictures and the check that a picture is the same on every
 * page just booted all draw the same thing. Every move is flown through `fly`, so the game does what it does for keys,
 * and nothing is set that a player could not do. The particles move only as a frame is drawn, so each is stepped with
 * `stepDrawn`. The game must be paused.
 */
import type { Page } from '@playwright/test';
import { FIRES } from '../src/arena';
import { HOVER_LIFT } from '../src/helicopter';
import { DROP, SCOOP } from '../src/water';

/** The fires, by the place of each. */
export const WEST = FIRES[0];
export const SOUTH = FIRES[1];
export const NORTH = FIRES[2];

/**
 * A patch on the east edge of the west fire, which a drop from over it reaches only three of the ten lit patches of, so
 * seven burn on and three are burnt: the fire as a picture shows it part way through.
 */
export const EDGE = WEST.patches[12];

/** A height over the ground at which a drop reaches and the bucket's line clears the treetops. */
export const DROP_HEIGHT = DROP.high - 3;

/** The way the smoke drifts, as `effects.ts` has it: the helicopter upwind of the fire is on the other side of it. */
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
 * The tank filled, flown as a player does it: put at the start of the fire's run low over the water, facing along it,
 * and flown at full speed along the run until the scoop has filled it (the most frames it is given are ten seconds), and
 * then let go. Says how many frames it took, or −1 if it never filled, and leaves the helicopter where the scoop was
 * done. With `share`, it stops when the scoop is that share of the way, with the lever still held; with `begin`, the
 * fire's level is begun first, as a drop would have begun it.
 */
export async function scoop(page: Page, id = WEST.id, share = 1, begin = false): Promise<number> {
  return page.evaluate(
    ([id, hover, share, time, begin]) => {
      const g = window.game!;
      g.play(id);
      if (begin) g.begin(id);
      g.fly(1, 0, hover);
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

/** Flames over glowing ground and burnt: a drop on the fire's edge, the helicopter gone, and the camera over the wood. */
export async function sceneNear(page: Page) {
  await settle(page, 600);
  await scoop(page);
  await hoverOver(page, EDGE.x, EDGE.y, DROP_HEIGHT, 0.9, 2);
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

/** A drop part way: the spray falling from the bucket on the fire's edge, the camera parked to the side. */
export async function sceneDrop(page: Page) {
  await settle(page, 600);
  await scoop(page);
  await hoverOver(page, EDGE.x, EDGE.y, DROP_HEIGHT, 0.9, 14);
  await lookAt(page, EDGE, 75, 1.2, -0.8);
}

/** The helicopter skimming the lake with the fire level begun and the tank half filled: the bucket dipped, the loader and the badge. */
export async function sceneScooping(page: Page) {
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
