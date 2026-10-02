/**
 * The course in the page, flown by the keys and by touch as a player flies it: begun by flying between the towers,
 * then under the bridge, the bridge missed by going over its deck and gone back for, its deck struck and knocked back
 * off, the words and the arrow for the opening wanted, and the clock running from the towers and stopping as the skids
 * touch the pad it ends on. The helicopter is set before each opening through the test API, a short way off; what it does from there
 * is the controls'.
 */
import { expect, test, type Page } from '@playwright/test';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import type { Gate } from '../src/mission';
import { fingers, finish, leverTravel, start, watch } from './game';

const state = (page: Page) => page.evaluate(() => window.game!.state());
const step = (page: Page, frames: number) => page.evaluate((n) => window.game!.step(n), frames);
/** The openings of the level being flown. */
const gatesOf = async (page: Page) => (await state(page)).mission.steps.filter((s): s is Gate => s.kind === 'gate');

/** The helicopter set `back` before `gate` on its axis, its middle `up` over the opening's, facing it. */
async function before(page: Page, gate: Gate, back: number, up = 0) {
  await page.evaluate(
    ([g, b, u, middle]) => {
      const game = window.game!;
      const [x, y] = [g.x - Math.cos(g.yaw) * b, g.y - Math.sin(g.yaw) * b];
      game.teleport(x, y, g.z + u - middle - game.floorAt(x, y), g.yaw);
    },
    [gate, back, up, HELICOPTER.size.middle] as const,
  );
}

/** How far the helicopter is along `gate`'s axis from its face: less than nothing before it, more beyond. */
async function along(page: Page, gate: Gate) {
  const { x, y } = (await state(page)).helicopter;
  return (x - gate.x) * Math.cos(gate.yaw) + (y - gate.y) * Math.sin(gate.yaw);
}

/** W held for `frames` frames, the hover lift held with it so the height is kept. */
async function forward(page: Page, frames: number) {
  await page.keyboard.down('w');
  await step(page, frames);
  await page.keyboard.up('w');
}

test('the course by the keys: begun between the towers, the bridge gone over and struck, under it, and the landing', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await page.evaluate(() => window.game!.play('under-and-between'));
  await step(page, 1);
  // put at the start, nothing begun: the hint, and no clock
  expect((await state(page)).mission.level).toBeNull();
  await expect(page.locator('#hud .hint')).toBeVisible();
  await step(page, 60);
  expect((await state(page)).mission.level).toBeNull();

  // between the towers, thirty back with W held: that begins the course
  await page.keyboard.down('w');
  for (let f = 0; f < 300 && !(await state(page)).mission.level; f += 5) await step(page, 5);
  await page.keyboard.up('w');
  expect(await page.evaluate(() => window.game!.events())).toEqual([
    'started under-and-between',
    'through between the towers',
  ]);
  const [towers, bridge] = await gatesOf(page);
  expect([towers.label, bridge.label]).toEqual(['between the towers', 'under the bridge']);
  await expect(page.locator('#hud .goal')).toHaveText('Fly under the bridge');
  await expect(page.locator('#hud .hint')).toBeHidden();
  await step(page, 60);
  await expect(page.locator('#hud .clock')).toHaveText(/^0:0[1-9]$/);

  // over the bridge's deck and on past it: still the one wanted, and the arrow turned back to it
  const deck = (await page.evaluate(() => window.game!.content().structures)).find((b) => b.kind === 'deck')!;
  const over = deck.z + deck.height + HELICOPTER.size.rotorRadius + 3 - bridge.z + HELICOPTER.size.middle;
  await before(page, bridge, 20, over);
  await forward(page, 120);
  expect(await along(page, bridge)).toBeGreaterThan(10);
  expect((await state(page)).mission.next).toBe(1);
  await expect(page.locator('#hud .goal')).toHaveText('Fly under the bridge');
  const turned = await page
    .locator('#hud .arrow')
    .evaluate((el: HTMLElement) => Number(/-?\d+/.exec(el.style.transform)![0]));
  expect(Math.abs(turned), 'the arrow points back to it').toBeGreaterThan(90);

  // the deck struck: flown at its side from fifteen short, the middle two over its top, so that sinking as it comes,
  // with nothing but W held, it meets the side; knocked back off it, never inside it, and not passed
  await before(page, bridge, 15, deck.z + deck.height + 2 - bridge.z);
  await page.keyboard.down('w');
  let last = await along(page, bridge);
  let furthest = last;
  let knocked = false;
  for (let f = 0; f < 120; f += 5) {
    await step(page, 5);
    const now = await along(page, bridge);
    if (now < last - 0.05) knocked = true;
    furthest = Math.max(furthest, now);
    last = now;
    expect(await page.evaluate(() => window.game!.invariants()), `frame ${f}`).toEqual([]);
  }
  await page.keyboard.up('w');
  expect(knocked, 'knocked back off the deck').toBe(true);
  expect(furthest, 'and never under it').toBeLessThan(-deck.width / 2);
  expect((await state(page)).mission.next).toBe(1);

  // and under it
  await before(page, bridge, 20);
  await forward(page, 120);
  expect(await page.evaluate(() => window.game!.events())).toEqual(['through under the bridge']);
  await expect(page.locator('#hud .goal')).toHaveText('Fly through ring 1 of 3');

  // the rest flown, and the clock stops as the skids touch the pad it ends on
  await finish(page);
  const end = await state(page);
  expect([end.screen, end.mission.level]).toEqual(['flying', null]);
  await expect(page.locator('#hud .toast h2')).toHaveText('Course complete!');
  const told = await page.evaluate(() => window.game!.events());
  expect(told.slice(0, 4)).toEqual(['passed 1 3', 'passed 2 3', 'passed 3 3', 'landed 6']);
  expect(told[4]).toMatch(/^finished under-and-between \d+\.\d\d best$/);
  await step(page, 120);
  expect((await state(page)).last).toEqual(end.last);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('between the towers by touch, which begins the course: the lever at its stop and the stick pushed', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => window.game!.play('under-and-between'));
    await step(page, 1);
    await expect(page.locator('#hud .hint')).toBeVisible();
    const travel = await leverTravel(page);
    const hand = await fingers(page);
    // the right thumb sets the lever at its stop, and the left pushes the stick straight up
    await hand.down(2, 330, 680);
    await hand.move(2, 330, 680 - (HOVER_LIFT * travel) / 2);
    expect((await state(page)).input.lever).toBe(HOVER_LIFT);
    await hand.down(1, 100, 690);
    await hand.move(1, 100, 610);
    for (let f = 0; f < 300 && !(await state(page)).mission.level; f += 5) await step(page, 5);
    await hand.up(1);
    await hand.up(2);
    expect(await page.evaluate(() => window.game!.events())).toEqual([
      'started under-and-between',
      'through between the towers',
    ]);
    await expect(page.locator('#hud .goal')).toHaveText('Fly under the bridge');
    expect(problems).toEqual([]);
  });
});
