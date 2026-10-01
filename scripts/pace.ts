/**
 * How the game paces, played by the autopilot: how many game minutes it
 * takes to deliver the first level, over a few seeds, held to a baseline
 * both ways. Quicker is as much a change as slower: a parcel that loads
 * itself is a bug the same as one that never will.
 *
 * Nothing in the game draws on chance yet, so every seed flies the same
 * level the same way and gives the same figure; the seeds are there for
 * when something does, a parcel's pads or the weather, and the median
 * then keeps one odd run from moving it.
 *

 * `pace-check.ts` runs it: `npm run pace` for the figures, `npm run
 * pace:check` to hold them, `-- --update` to write the baseline again.
 *
 * The figure is a median over the seeds, so one odd run does not move it
 * once the seeds differ, and the tolerance is set out below.
 */
import { Autopilot } from '../src/autopilot';
import { Game } from '../src/game';
import { seeded } from '../src/random';

const DT = 1 / 60;
export const CHECK = { seeds: [1, 2, 3, 4], capMinutes: 3 };
/**
 * How far the figure may move from the baseline, as a share of it, before the check fails. The autopilot flies the
 * same way every run and on every seed, so the figure does not wobble at all, and anything that moves it (a quicker
 * helicopter, a longer wait on the pad) is a change to be written down: a fifth, the template's, let a helicopter
 * half as fast again through, at a tenth.
 */
export const TOLERANCE = 0.02;

export interface PaceRun {
  seed: number;
  /** Game minutes to deliver the first level, or the cap if it never did. */
  minutes: number;
  finished: boolean;
}

/** One game from a seed, flown until the parcel is delivered or the time is up. */
export function paceRun(seed: number, capMinutes = CHECK.capMinutes): PaceRun {
  const game = new Game({ random: seeded(seed) });
  const pilot = new Autopilot(game);
  const frames = capMinutes * 3600;
  for (let f = 0; f < frames; f++) {
    pilot.step(DT);
    if (game.delivery.stage === 'delivered') return { seed, minutes: round(game.t / 60), finished: true };
  }
  return { seed, minutes: capMinutes, finished: false };
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
