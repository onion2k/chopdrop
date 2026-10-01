/**
 * The bench's arithmetic, apart from the timing itself so that it can be
 * tested without timing anything: how a scenario is timed against the
 * reference, how a figure is judged against the baseline, and whether a
 * scenario did what it is named for. Left in among the timing it was only
 * ever tried by running the bench, and a bench that cannot fail looks the
 * same from there as one that passes.
 */

/**
 * How far a scenario may move from its baseline, either way, before the
 * bench fails: a share of it, and nothing else. Timed as they are now, the
 * two figures wobbled by 2 to 6 in a hundred, highest over lowest, in each
 * of four sets of a dozen or a score of runs, every run a process of its
 * own, on an M4 Pro with two or three of its twelve cores at other work and
 * with six kept busy on purpose; and by 8 over all 64. Fifteen in a hundred
 * is about twice that, and half of the three tenths slower that the bench
 * was seen to fail. With every core kept busy the figures read up to twice
 * what they are: a bench that fails on a machine that busy is run again.
 *
 * It used to be twenty in a hundred and a twentieth of a millisecond as
 * well, which a frame costing a thousandth of one could not reach: a frame
 * made thirty times slower passed.
 */
export const TOLERANCE = 0.15;

export type Verdict = 'slower' | 'faster' | 'within tolerance';

/** Whether a figure has moved from its baseline by more than the tolerance, and which way. */
export function judge(was: number, now: number, tolerance = TOLERANCE): Verdict {
  const change = now / was - 1;
  if (change > tolerance) return 'slower';
  if (change < -tolerance) return 'faster';
  return 'within tolerance';
}

export interface Best {
  /** A run's time against the reference timed beside it: the lowest there was. */
  ratio: number;
  /** That run's time, and the reference it was held to. */
  ms: number;
  ref: number;
}

/**
 * A scenario run `runs` times, each held to the reference timed just before
 * it and just after: the lower of the two, since one held up by something
 * else would make the run look fast. The machine goes faster and slower as
 * it warms and as other work comes and goes, and a reference timed once, at
 * the start, is held against runs timed in another moment altogether; so
 * each run is held to its own. The lowest ratio counts: anything else going
 * on only ever makes a run slower, never faster.
 */
export function bestRatio(runs: number, reference: () => number, run: () => number): Best {
  const best: Best = { ratio: Infinity, ms: 0, ref: 0 };
  for (let k = 0; k < runs; k++) {
    const before = reference();
    const ms = run();
    const ref = Math.min(before, reference());
    if (ms / ref < best.ratio) {
      best.ratio = ms / ref;
      best.ms = ms;
      best.ref = ref;
    }
  }
  return best;
}

/**
 * How far apart two readings of a figure may be and still be taken for the
 * same figure: a third of the tolerance, which is the most one set of runs
 * wobbled by.
 */
export const AGREE = TOLERANCE / 3;

/**
 * The baseline to write from two readings of a figure: the middle of them,
 * or null where they do not agree, and nothing is to be written. A reading
 * taken while the machine is at other work can be a sixth out either way,
 * since the reference and the game do not slow alike; checked against a
 * baseline it is one run to be run again, but written as the baseline it
 * fails every run after it. The first baseline written by this bench was
 * one, and failed nine of the next ten runs with nothing changed.
 */
export function agreed(a: number, b: number, within = AGREE): number | null {
  if (Math.abs(a - b) > Math.min(a, b) * within) return null;
  return (a + b) / 2;
}

/** What a scenario was seen to do: how many frames it ran, and in how many of them a body was awake. */
export interface Seen {
  frames: number;
  awake: number;
}

/**
 * Whether a scenario did what it is named for: a body awake in a share of
 * its frames between the least and the most it says it should be. A floor at
 * rest with a ball rolling on it, or an autopilot that never reached a ball,
 * is timed as steadily as the real thing and holds the game to nothing.
 */
export function did(seen: Seen, share: readonly [number, number]): boolean {
  if (seen.frames <= 0) return false;
  const awake = seen.awake / seen.frames;
  return awake >= share[0] && awake <= share[1];
}
