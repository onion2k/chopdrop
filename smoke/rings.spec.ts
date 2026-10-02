/**
 * The ring trials in the page, flown by the keys and by touch as a player flies them: a ring passed through its
 * opening, one missed and gone back for, one struck and knocked back off, the words and the arrow for the ring wanted,
 * and the clock running from the first lift-off and stopping at the last ring. The helicopter is set before each ring
 * through the test API, a short way off; what it does from there is the controls'.
 */
import { expect, test, type Page } from '@playwright/test';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import type { Ring } from '../src/mission';
import { fingers, finish, leverTravel, start, watch } from './game';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const step = (page: Page, frames: number) => page.evaluate((n) => window.game!.step(n), frames);
/** The rings of the level being flown. */
const ringsOf = async (page: Page) => (await state(page)).mission.steps.filter((s): s is Ring => s.kind === 'ring');

/** The helicopter set `back` before `ring` on its axis, `across` to one side, its middle at the ring's height, facing it. */
async function before(page: Page, ring: Ring, back: number, across = 0) {
  await page.evaluate(
    ([r, b, c, middle]) => {
      const g = window.game!;
      const [ax, ay] = [Math.cos(r.yaw), Math.sin(r.yaw)];
      const [x, y] = [r.x - ax * b - ay * c, r.y - ay * b + ax * c];
      g.teleport(x, y, r.z - middle - g.floorAt(x, y), r.yaw);
    },
    [ring, back, across, HELICOPTER.size.middle] as const,
  );
}

/** How far the helicopter is along `ring`'s axis from its face: less than nothing before it, more beyond. */
async function along(page: Page, ring: Ring) {
  const { x, y } = (await state(page)).helicopter;
  return (x - ring.x) * Math.cos(ring.yaw) + (y - ring.y) * Math.sin(ring.yaw);
}

test('a ring trial by the keys: one passed, one missed and gone back for, one struck, and the clock', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await page.evaluate(() => window.game!.play('ring-trial'));
  await step(page, 1);
  const rings = await ringsOf(page);
  expect(rings).toHaveLength(6);
  await expect(page.locator('#hud .goal')).toHaveText('Fly through ring 1 of 6');
  // the clock waits for the first lift-off, on the pad
  await step(page, 60);
  await expect(page.locator('#hud .clock')).toHaveText('0:00');

  // the first: lined up fifteen short of it, W held, and through
  await before(page, rings[0], 15);
  await page.keyboard.down('w');
  await step(page, 100);
  await page.keyboard.up('w');
  expect(await page.evaluate(() => window.game!.events())).toEqual(['passed 1 6']);
  await expect(page.locator('#hud .goal')).toHaveText('Fly through ring 2 of 6');
  await expect(page.locator('#hud .clock')).toHaveText(/^0:0[1-9]$/);

  // the second, missed: flown past it beside its rim, and still the one wanted, the arrow turned back to it
  await before(page, rings[1], 15, rings[1].opening + 8);
  await page.keyboard.down('w');
  await step(page, 120);
  await page.keyboard.up('w');
  expect(await along(page, rings[1])).toBeGreaterThan(10);
  expect((await state(page)).mission.next).toBe(1);
  await expect(page.locator('#hud .goal')).toHaveText('Fly through ring 2 of 6');
  const turned = await page
    .locator('#hud .arrow')
    .evaluate((el: HTMLElement) => Number(/-?\d+/.exec(el.style.transform)![0]));
  expect(Math.abs(turned), 'the arrow points back to it').toBeGreaterThan(90);
  // and gone back for
  await before(page, rings[1], 15);
  await page.keyboard.down('w');
  await step(page, 100);
  await page.keyboard.up('w');
  expect(await page.evaluate(() => window.game!.events())).toEqual(['passed 2 6']);

  // the third, struck: flown at its tube, knocked back off it, never inside it, and not passed
  await before(page, rings[2], 15, rings[2].opening + 0.8);
  await page.keyboard.down('w');
  let last = await along(page, rings[2]);
  let furthest = last;
  let knocked = false;
  for (let f = 0; f < 120; f += 5) {
    await step(page, 5);
    const now = await along(page, rings[2]);
    if (now < last - 0.05) knocked = true;
    furthest = Math.max(furthest, now);
    last = now;
    expect(await page.evaluate(() => window.game!.invariants()), `frame ${f}`).toEqual([]);
  }
  await page.keyboard.up('w');
  expect(knocked, 'knocked back off the tube').toBe(true);
  expect(furthest, 'and never through it').toBeLessThan(0);
  expect((await state(page)).mission.next).toBe(2);

  // the rest flown, and the clock stops at the last
  await finish(page);
  const end = await state(page);
  expect(end.screen).toBe('card');
  await expect(page.locator('#hud .card h2')).toHaveText('Trial complete!');
  await step(page, 120);
  expect((await state(page)).mission.time).toBe(end.mission.time);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a ring flown through by touch: the lever at its stop and the stick pushed', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => window.game!.play('up-the-valley'));
    await step(page, 1);
    const [first] = await ringsOf(page);
    await before(page, first, 15);
    await step(page, 1);
    const travel = await leverTravel(page);
    const hand = await fingers(page);
    // the right thumb sets the lever at its stop, and the left pushes the stick straight up
    await hand.down(2, 330, 680);
    await hand.move(2, 330, 680 - (HOVER_LIFT * travel) / 2);
    expect((await state(page)).input.lever).toBe(HOVER_LIFT);
    await hand.down(1, 100, 690);
    await hand.move(1, 100, 610);
    await step(page, 100);
    await hand.up(1);
    await hand.up(2);
    expect(await page.evaluate(() => window.game!.events())).toEqual(['passed 1 9']);
    await expect(page.locator('#hud .goal')).toHaveText('Fly through ring 2 of 9');
    expect(problems).toEqual([]);
  });
});
