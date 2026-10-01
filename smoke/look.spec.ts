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
import { WOOD, standardView, start, watch } from './game';

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
    const bowed = await page.evaluate((w) => {
      const g = window.game!;
      g.teleport(w.x, w.y, 4, 0);
      g.look(w.x, w.y, { azimuth: -Math.PI / 2, polar: 0.9, radius: 44 });
      g.step(150);
      return g.sway().count;
    }, WOOD);
    expect(bowed, 'trees bowed in the picture').toBeGreaterThan(20);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('downwash.png', TOLERANCE);
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
