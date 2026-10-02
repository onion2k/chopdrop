/**
 * The play-through: every level flown to the end in the page, the real thing in Chromium on the GPU, by the autopilot
 * through the test API, with every rule that must always hold checked as it goes. The game is flying free from home,
 * and each level in turn is shown the way through the panel (Esc, then that row's "Show the way"), flown to its start by
 * the autopilot told the level, begun there by its first step, and flown on with the HUD's words changing and the
 * events told, to the toast at the end. It is what a player can finish, finished: the objective of each step, the
 * parcel loaded, the rings and the openings flown, and, after the last, the panel with every level's best time.
 * Nothing else plays a whole level in the page.
 */
import { expect, test, type Page } from '@playwright/test';
import { start, watch } from './game';

/** `frames` frames played, the rules checked after each `every` of them; what is broken, if anything. */
async function play(page: Page, frames: number, every = 30) {
  for (let f = 0; f < frames; f += every) {
    const broken = await page.evaluate((n) => {
      window.game!.step(n);
      return window.game!.invariants();
    }, every);
    expect(broken, `at frame ${f + every}`).toEqual([]);
  }
}

/** The words for where the parcel is wanted, at the drop pad of a delivery. */
const DROP_SITES: Record<string, string> = {
  'first-delivery': 'hilltop',
  'over-the-water': 'lakeside',
  'over-the-range': 'beach',
  'mountain-drop': 'shoulder',
};

/** The words for the pad a course ends on. */
const FINISH: Record<string, string> = { 'under-and-between': 'shoulder' };

/** The title the toast has by the kind of level. */
const TITLE: Record<string, string> = {
  delivery: 'Delivered!',
  rings: 'Trial complete!',
  course: 'Course complete!',
};

test('every level, shown the way from the panel and flown to the end in turn, with the toasts and then every time', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, save: { best: {} } });
  const state = () => page.evaluate(() => window.game!.state());
  const levels = await page.evaluate(() => window.game!.levels());
  expect(levels.map((level) => level.best)).toEqual(levels.map(() => null));
  expect((await state()).mission.level, 'flying free').toBeNull();
  await page.evaluate(() => window.game!.step(1));
  await expect(page.locator('#hud .hint')).toBeVisible();

  /** Everything the game has told so far in this level, a read at a time. */
  let told: string[] = [];
  const hear = async () => {
    told = told.concat(await page.evaluate(() => window.game!.events()));
  };
  /** Played in thirty-frame steps until `done` holds, the rules checked; false if it never did. */
  const until = async (done: () => Promise<boolean>, limit: number) => {
    for (let f = 0; f < limit; f += 30) {
      if (await done()) return true;
      await play(page, 30);
    }
    return done();
  };

  for (const [k, level] of levels.entries()) {
    // shown the way through the panel, as a player does it
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeVisible();
    const row = page.locator('#panel .row').nth(k);
    await expect(row.locator('.label')).toHaveText(level.name);
    await row.locator('button').click();
    await expect(page.locator('#panel')).toBeHidden();
    await page.evaluate(() => window.game!.step(1));
    expect((await state()).guided, `level ${k + 1} guided`).toBe(level.id);
    await expect(page.locator('#hud .goal')).toHaveText(`To the start · ${level.name}`);
    await expect(page.locator('#hud .arrow')).toBeVisible();
    // the autopilot, told the level, flies from wherever it is to the start, which begins it
    await page.evaluate((id) => window.game!.autopilot(true, id), level.id);
    told = [];
    expect(await until(async () => (await state()).mission.level === level.id, 7200), `${level.id} begun`).toBe(true);
    await hear();
    expect(told[0], `${level.id}: told begun first`).toBe(`started ${level.id}`);
    expect((await state()).guided, 'the guide is gone once it has begun').toBeNull();
    await expect(page.locator('#hud .clock')).toBeVisible();
    await expect(page.locator('#hud .hint')).toBeHidden();

    if (level.kind === 'rings') {
      // each ring in turn, the words following it, and the last ends it
      const of = (await state()).mission.steps.length;
      for (let n = 2; n <= of; n++) {
        await expect(page.locator('#hud .goal')).toHaveText(`Fly through ring ${n} of ${of}`);
        // the last ring passed ends the level, which leaves nothing wanted
        const passed = async () =>
          n === of ? (await state()).mission.level === null : (await state()).mission.next === n;
        expect(await until(passed, 3600), `${level.id}: ring ${n} passed`).toBe(true);
      }
      await until(async () => (await state()).mission.level === null, 600);
      await hear();
      expect(told.slice(1, of + 1)).toEqual(Array.from({ length: of }, (_, r) => `passed ${r + 1} ${of}`));
      expect(told[of + 1]).toMatch(new RegExp(`^finished ${level.id} \\d+\\.\\d\\d best$`));
      expect(told).toHaveLength(of + 2);
    } else if (level.kind === 'course') {
      // each opening, each ring and the landing in turn, the words following them, and the landing ends it
      const { steps } = (await state()).mission;
      const rings = steps.filter((step) => step.kind === 'ring').length;
      const words: string[] = [],
        lines: string[] = [];
      for (const [index, step] of steps.entries()) {
        if (step.kind === 'gate') {
          words.push(`Fly ${step.label}`);
          lines.push(`through ${step.label}`);
        } else if (step.kind === 'ring') {
          const n = steps.filter((s, j) => s.kind === 'ring' && j <= index).length;
          words.push(`Fly through ring ${n} of ${rings}`);
          lines.push(`passed ${n} ${rings}`);
        } else if (step.kind === 'land') {
          words.push(`Land on the ${FINISH[level.id]} pad`);
          lines.push(`landed ${step.pad}`);
        }
      }
      expect(words).toHaveLength(steps.length);
      for (let n = 1; n < words.length; n++) {
        await expect(page.locator('#hud .goal')).toHaveText(words[n]);
        // the landing, the last step, ends the level, which leaves nothing wanted
        const done = async () =>
          n === words.length - 1 ? (await state()).mission.level === null : (await state()).mission.next === n + 1;
        expect(await until(done, 3600), `${level.id}: ${words[n]}`).toBe(true);
      }
      await until(async () => (await state()).mission.level === null, 600);
      await hear();
      expect(told.slice(1, lines.length + 1)).toEqual(lines);
      expect(told[lines.length + 1]).toMatch(new RegExp(`^finished ${level.id} \\d+\\.\\d\\d best$`));
      expect(told).toHaveLength(lines.length + 2);
    } else {
      // loaded on the pickup pad, which began it, and the drop pad wanted
      await expect(page.locator('#hud .goal')).toHaveText(`Deliver it to the ${DROP_SITES[level.id]} pad`);
      expect((await state()).mission.carrying, `${level.id}: the parcel loaded`).toBe(true);
      if (k === 0) await info.attach('carrying', { body: await page.screenshot(), contentType: 'image/png' });
      expect(await until(async () => (await state()).mission.level === null, 7200), `${level.id}: delivered`).toBe(
        true,
      );
      await hear();
      expect(told[0]).toBe(`started ${level.id}`);
      expect(told[1]).toMatch(/^loaded \d$/);
      expect(told[2]).toMatch(/^delivered \d$/);
      expect(told[3]).toMatch(new RegExp(`^finished ${level.id} \\d+\\.\\d\\d best$`));
      expect(told).toHaveLength(4);
    }
    await page.evaluate(() => window.game!.autopilot(false));

    // the toast, with the time and the best, and flight goes on
    const end = await state();
    expect(end.screen).toBe('flying');
    expect(end.mission.level).toBeNull();
    const toast = page.locator('#hud .toast');
    await expect(toast).toBeVisible();
    await expect(toast.locator('h2')).toHaveText(TITLE[level.kind]);
    await expect(toast.locator('.t')).toHaveText(/^\d:\d\d · ★ New best$/);
    expect(end.toast).toMatch(new RegExp(`^${TITLE[level.kind]} \\d:\\d\\d ★ New best$`));
    expect(end.last).toMatchObject({ id: level.id, best: true });
    if (k === levels.length - 1)
      await info.attach('the last done', { body: await page.screenshot(), contentType: 'image/png' });
  }

  // every level has its time in the panel
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel .sub')).toHaveText(
    `${levels.length} of ${levels.length} done · land on a crate or fly a start, anywhere`,
  );
  const bests = await page.locator('#panel .row .best:not([hidden])').allTextContents();
  expect(bests).toHaveLength(levels.length);
  for (const best of bests) expect(best).toMatch(/^\d:\d\d$/);
  const done = await page.evaluate(() => window.game!.levels());
  expect(done.every((level) => level.best !== null)).toBe(true);
  expect(Object.keys((await page.evaluate(() => window.game!.save())).best)).toEqual(levels.map((level) => level.id));
  expect(problems).toEqual([]);
});
