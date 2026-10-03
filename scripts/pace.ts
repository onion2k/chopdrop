/**
 * How the game paces, played by the autopilot: how many game minutes it
 * takes to fly each level to its end, from home, told the level by name and
 * flying to its start first, over a few seeds, each held to a baseline both
 * ways. The figure is the level's own clock, from its first step done to its
 * end, and not the flight to its start. Quicker is as much a change as slower: a parcel that
 * loads itself is a bug the same as one that never will, and a level made
 * shorter than it was is a level changed.
 *
 * Nothing in the game draws on chance yet, so every seed flies a level the
 * same way and gives the same figure; the seeds are there for when something
 * does, a parcel's pads or the weather, and the median then keeps one odd
 * run from moving it.
 *
 * `pace-check.ts` runs it: `npm run pace` for the figures, `npm run
 * pace:check` to hold them, `-- --update` to write the baseline again.
 */
import { Autopilot } from '../src/autopilot';
import { Game } from '../src/game';
import { seeded } from '../src/random';

const DT = 1 / 60;
/** The cap is on the game's clock from home, flight to the start included: the far fire is put out 410 s in (6.8 min), so seven and a half. */
export const CHECK = { seeds: [1, 2, 3, 4], capMinutes: 7.5 };
/**
 * How far a figure may move from the baseline, as a share of it, before the check fails. The autopilot flies the
 * same way every run and on every seed, so the figure does not wobble at all, and anything that moves it (a quicker
 * helicopter, a longer wait on the pad) is a change to be written down: a fifth, the template's, let a helicopter
 * half as fast again through, at a tenth.
 */
export const TOLERANCE = 0.02;

export interface PaceRun {
  level: string;
  seed: number;
  /** Game minutes on the level's own clock, or the cap if it never got there. */
  minutes: number;
  finished: boolean;
}

/**
 * One game from a seed, from home, the autopilot told the level named `level`: it flies to the level's start and does it,
 * until the game says that level is done or the time is up. The minutes are the level's own clock.
 */
export function paceRun(level: string, seed: number, capMinutes = CHECK.capMinutes): PaceRun {
  const game = new Game({ random: seeded(seed) });
  const pilot = new Autopilot(game);
  pilot.wanted = level;
  const frames = capMinutes * 3600;
  for (let f = 0; f < frames; f++) {
    pilot.step(DT);
    if (game.last?.id === level) return { level, seed, minutes: round(game.last.seconds / 60), finished: true };
  }
  return { level, seed, minutes: capMinutes, finished: false };
}

/** Every level the game has, by its name, in order. */
export function levels(): string[] {
  return new Game().levels.map((level) => level.id);
}

/** What is wrong with the figures against the baseline: a level moved, one with no figure kept, and one kept that is gone. */
export function compare(baseline: Record<string, number>, figures: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [level, now] of Object.entries(figures)) {
    const was = baseline[level] as number | undefined;
    if (was === undefined) out.push(`${level} has no figure in the baseline`);
    else if (moved(was, now)) out.push(`${level} moved: ${was} -> ${now} min`);
  }
  for (const level of Object.keys(baseline))
    if (!(level in figures)) out.push(`${level} is in the baseline and is not a level`);
  return out;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** Whether a figure has moved from its baseline beyond the tolerance, either way. */
export function moved(was: number, now: number, tolerance = TOLERANCE): boolean {
  return Math.abs(now - was) > Math.abs(was) * tolerance;
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}
