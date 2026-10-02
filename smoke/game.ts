/**
 * What the smoke tests share: starting the game in a page and waiting until
 * it is ready, and watching the page for errors. The game opens flying free,
 * landed on the home pad with nothing going and no panel up, and `start`
 * leaves it so: a test that wants a level begins it as a player does, by
 * landing on a crate or flying through a start, or through `begin`, and one
 * that wants to stand at a level's start asks for `play`. Where a test wants
 * the helicopter anywhere else on
 * the island it asks for through `teleport`, with a height above the ground,
 * and for the pads and the edges through `content`. Everything else a test
 * does goes through `window.game`, the game's test API (`src/debug.ts`),
 * whose types these tests compile against. A test's save is handed in here,
 * written before the page's own scripts run, in the test's own fresh browser
 * and never over the player's.
 */
import { expect, type Page } from '@playwright/test';
import type { GameApi } from '../src/debug';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';

declare global {
  interface Window {
    game?: GameApi;
  }
}

/**
 * A wood to hover low in, for the trees in the downwash: a clearing six across among broadleaf, pine, poplar and
 * bush, on flat ground well away from any pad. It was found by looking for one, and each test that uses it checks
 * that the trees are still there, so an island made again otherwise says so and does not pass with nothing to bow.
 */
export const WOOD = { x: 116, y: -280 };

/** Errors on the page, and requests that failed, collected as they happen. */
export function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  return problems;
}

/** The key the game keeps its save under, given out with the first save. */
export const SAVE_KEY = 'chopdrop-save-v1';

/**
 * The game in the page, and ready. `seed` makes chance the same from before
 * the game is built, and `paused` stops it before a frame of its own has
 * run, so everything after is the test's own stepping. `save` is what the
 * player has done, as the game writes it, or a string to be kept as it is,
 * written once before the page first loads, so a reload reads what the game
 * wrote since. Nothing is begun: the game is flying free.
 */
export async function start(
  page: Page,
  options: { seed?: number; paused?: boolean; save?: { best: Record<string, number> } | string } = {},
) {
  const { seed, paused, save } = options;
  if (save !== undefined)
    await page.addInitScript(
      ({ key, json }) => {
        if (sessionStorage.getItem('chopdrop-test-saved')) return;
        localStorage.setItem(key, json);
        sessionStorage.setItem('chopdrop-test-saved', '1');
      },
      { key: SAVE_KEY, json: typeof save === 'string' ? save : JSON.stringify(save) },
    );
  const query = new URLSearchParams();
  if (seed !== undefined) query.set('seed', String(seed));
  if (paused) query.set('paused', '1');
  await page.goto(query.size ? `/?${query.toString()}` : '/');
  await ready(page);
}

/** The pads each delivery is picked up from and set down on, by their place in the island's list, by level. */
export const DELIVERIES: Record<string, { pickup: number; drop: number }> = {
  'first-delivery': { pickup: 4, drop: 1 },
  'over-the-water': { pickup: 3, drop: 2 },
  'over-the-range': { pickup: 7, drop: 5 },
  'mountain-drop': { pickup: 2, drop: 6 },
};

/** Wait until the game is booted and its frame loop running, or say what the boot screen was stuck on. */
export async function ready(page: Page) {
  try {
    await expect.poll(() => page.evaluate(() => window.game?.ready ?? false), { timeout: 60_000 }).toBe(true);
    await expect(page.locator('#boot')).toHaveClass(/gone/);
  } catch {
    throw new Error(`the game did not boot: ${await page.locator('#bootMsg').textContent()}`);
  }
}

/**
 * The standard view, which every picture and the perf gate's frame are taken from: the game stepped three seconds from
 * the start, then the camera parked above the home pad, a little to the side, and one more frame drawn. The game must
 * be paused, so that the steps are the test's own.
 */
export async function standardView(page: Page) {
  await page.evaluate(() => {
    const g = window.game!;
    g.step(180);
    const { home } = g.content();
    g.look(home.x, home.y, { azimuth: 0.9, polar: 0.95, radius: 90 });
    g.step(1);
  });
}

/**
 * Fingers on the glass, as a phone has them: real touches through Chromium's touch protocol, several at once, which
 * the page sees as pointer events from fingers. Each call sends every finger still down, as a touch screen does, and
 * waits for the page's next frame: Chromium hands a moving finger to the page on its next animation frame and not
 * when it moves, so a read straight after a move saw the lever one move behind.
 */
export async function fingers(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const down = new Map<number, { x: number; y: number }>();
  const send = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel') => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...down].map(([id, { x, y }]) => ({ id, x, y })),
    });
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
  };
  return {
    async down(id: number, x: number, y: number) {
      down.set(id, { x, y });
      await send('touchStart');
    },
    /** Moved to (x, y) in `steps` even steps, as a thumb slides. */
    async move(id: number, x: number, y: number, steps = 4) {
      const from = down.get(id)!;
      for (let k = 1; k <= steps; k++) {
        down.set(id, { x: from.x + ((x - from.x) * k) / steps, y: from.y + ((y - from.y) * k) / steps });
        await send('touchMove');
      }
    },
    /**
     * Lifted. Chromium lifts every finger on a touch end, so one lifted while others stay down is sent as the fingers
     * still down, and it lifts whichever is missing; the last is a touch end.
     */
    async up(id: number) {
      down.delete(id);
      await send(down.size > 0 ? 'touchMove' : 'touchEnd');
    },
    /** Every finger taken away by the browser, as it does for a gesture of its own. */
    async cancel() {
      down.clear();
      await send('touchCancel');
    },
  };
}

/** The touch lever's travel on the page, from its top to its bottom, in CSS pixels: half of it is a lift of one. */
export function leverTravel(page: Page): Promise<number> {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>('#touch .track')!;
    const handle = document.querySelector<HTMLElement>('#touch .handle')!;
    return track.clientHeight - handle.offsetHeight;
  });
}

/**
 * The level going, finished as a player finishes it: each step still to do, in turn, landed on its pad and waited on,
 * or lined up a short way before its ring or its opening at its height and flown through. The game must be paused.
 */
export async function finish(page: Page) {
  await page.evaluate(
    ([middle, hover]) => {
      const g = window.game!;
      const pads = g.content().pads;
      const { steps, next } = g.state().mission;
      for (const step of steps.slice(next)) {
        if (step.kind === 'ring' || step.kind === 'gate') {
          const [ax, ay] = [Math.cos(step.yaw), Math.sin(step.yaw)];
          const [x, y] = [step.x - ax * 12, step.y - ay * 12];
          g.teleport(x, y, step.z - middle - g.floorAt(x, y), step.yaw);
          g.fly(1, 0, hover);
          g.step(90);
          g.release();
        } else {
          g.teleport(pads[step.pad].x, pads[step.pad].y, 0);
          g.step(100);
        }
      }
    },
    [HELICOPTER.size.middle, HOVER_LIFT],
  );
}
