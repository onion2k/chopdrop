/**
 * How the game paces, played by the autopilot: how many game minutes it
 * takes to bank a number of balls, over a few seeds, held to a baseline
 * both ways. Quicker is as much a change as slower: a ball that banks
 * itself is a bug the same as one that will not go in.
 *

 * `pace-check.ts` runs it: `npm run pace` for the figures, `npm run
 * pace:check` to hold them, `-- --update` to write the baseline again.
 *
 * The figure is a median over the seeds, so one odd run does not move it,
 * and the tolerance is a fifth: wide enough for the autopilot's own
 * wobble, which was measured before the tolerance was chosen, and tight
 * enough to catch a ball made twice as easy to push.
 */
import { Autopilot } from '../src/autopilot';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

const DT = 1 / 60;
export const CHECK = { seeds: [1, 2, 3, 4], balls: 10, capMinutes: 6 };
/** How far the figure may move from the baseline, as a share of it, before the check fails. */
export const TOLERANCE = 0.2;

export interface PaceRun {
  seed: number;
  /** Game minutes to bank the balls, or the cap if it never did. */
  minutes: number;
  finished: boolean;
}

/** One game from a seed, played until the balls are banked or the time is up. */
export function paceRun(seed: number, balls = CHECK.balls, capMinutes = CHECK.capMinutes): PaceRun {
  const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed) });
  const pilot = new Autopilot(game);
  const frames = capMinutes * 3600;
  for (let f = 0; f < frames; f++) {
    pilot.step(DT);
    if (game.progress.save.banked >= balls) return { seed, minutes: round(game.t / 60), finished: true };
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
