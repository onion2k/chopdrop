/**
 * A long game played through, watching the things that must not keep
 * growing: the trees moving in the downwash, the best times kept, the rings
 * that are solid, and the heap. The autopilot flies the levels in turn
 * from home, and the first again after the last.
 *
 * A map that is added to and never emptied does not throw, break a rule, or
 * move any gate's figure. It shows up an hour into a game as a machine that
 * has slowed to a crawl, on somebody else's computer. Nothing else here would
 * ever see it: the fuzzer plays 4,000 frames and the pace gate stops at a few
 * minutes.
 *
 * Every size is held two ways: under a ceiling that says what it could ever
 * reasonably be, and, where marked `steady`, not still climbing by the end —
 * the last third of the run against the middle third, so a size that fills
 * up early and settles is left alone, and one that creeps all the way
 * through is not. A new list, map or cache in the game gets a line in
 * `WATCH` and a reading in `sizes`.
 */
import { COLLECTIBLES, LEVELS } from '../src/arena';
import type { Game } from '../src/game';
import { RINGS } from '../src/mission';
import { SAVE } from '../src/progress';
import { SWAY } from '../src/sway';
import { flight } from './determinism';

/**
 * What is watched, and how. Every size has a ceiling: what it could ever
 * reasonably be, not a guess at what the game does now, so tuning does not
 * move it and a leak cannot hide under it.
 */
export const WATCH: Partial<Record<string, { ceiling: number; steady?: boolean }>> = {
  // the pool the moving trees are kept in has room for this many and no more; the most seen is 150
  'trees moving': { ceiling: SWAY.capacity },
  // a time for each level the game has, and those a save brought with it, which is cut short at its own limit
  'best times kept': { ceiling: LEVELS.length + SAVE.kept },
  // a name for each structure the game has, and those a save brought with it, which is cut short at its own limit
  'structures collected': { ceiling: COLLECTIBLES.length + SAVE.kept },
  // the rings that are solid are written over each time a level begins or ends, into room made once for this many
  'rings solid': { ceiling: RINGS.capacity },
  // the catch-all for what is leaking and has no name here; noisy, so it is given a lot of room
  'heap MB': { ceiling: 300, steady: true },
};

/** Every size worth watching, read off a game as it stands. */
export function sizes(game: Game): Record<string, number> {
  return {
    'trees moving': game.sway.count,
    'best times kept': game.progress.best.size,
    'structures collected': game.progress.collected.length,
    'rings solid': game.solids.count,
    // the heap and the memory behind typed arrays, which Node keeps apart from it: a pool kept for ever is in the second
    'heap MB': Math.round((process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers) / 1e5) / 10,
  };
}

/**
 * Whether a size is still climbing at the end: the last third of the run
 * against the middle third. `share` and `slack` are what it may drift by
 * without counting, as a share and as a number, so a small size wobbling by
 * one or two is not a leak.
 */
export function grew(series: number[], share = 0.15, slack = 3): boolean {
  if (series.length < 6) return false;
  const third = Math.floor(series.length / 3);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const middle = mean(series.slice(third, third * 2));
  const last = mean(series.slice(-third));
  return last > middle * (1 + share) + slack;
}

/** What is wrong with a run's sizes: over a ceiling, or still growing at the end. */
export function trouble(samples: Record<string, number[]>): string[] {
  const out: string[] = [];
  for (const [key, series] of Object.entries(samples)) {
    const watch = WATCH[key];
    const most = Math.max(...series);
    if (watch && most > watch.ceiling) out.push(`${key} went to ${most}, over its ceiling of ${watch.ceiling}`);
    else if (watch?.steady && grew(series, key === 'heap MB' ? 0.5 : 0.15, key === 'heap MB' ? 20 : 3)) {
      const third = Math.floor(series.length / 3);
      const at = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
      out.push(
        `${key} grew all the way through: ${at(series.slice(0, third))} at the start, ${at(series.slice(third, third * 2))} in the middle, ${at(series.slice(-third))} by the end`,
      );
    }
  }
  return out;
}

export interface LeakOptions {
  seed: number;
  /** Game minutes to play. */
  minutes: number;
}

export interface LeakRun {
  seed: number;
  minutes: number;
  /** Every size, sampled once a game minute. */
  samples: Record<string, number[]>;
  problems: string[];
  /** Real seconds it took. */
  seconds: number;
}

/** Play a long game, sampling the sizes once a game minute, and say what would not stay bounded. */
export function leakRun({ seed, minutes }: LeakOptions): LeakRun {
  const started = performance.now();
  const samples: Record<string, number[]> = {};
  try {
    let f = 0;
    for (const game of flight(seed, minutes * 3600)) {
      if (++f % 3600 === 0) for (const [key, n] of Object.entries(sizes(game))) (samples[key] ??= []).push(n);
    }
    return { seed, minutes, samples, problems: trouble(samples), seconds: (performance.now() - started) / 1000 };
  } catch (err) {
    return {
      seed,
      minutes,
      samples,
      problems: [`seed ${seed}: threw ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`],
      seconds: (performance.now() - started) / 1000,
    };
  }
}
