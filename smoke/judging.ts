/**
 * How the perf gate judges a figure against its baseline, apart from the
 * browser so that it can be tested without one: see `smoke/perf.spec.ts`.
 * Run only whole, on the GPU, a judgement that lets a change through looks
 * the same as one that passes.
 */

/** The figures the perf gate holds. */
export interface Figures {
  bootMs: number;
  frameMs: number;
  bundleBytes: number;
}

/**
 * How far a figure may move from the baseline, either way, before it is a
 * change: a share, and a slack for a figure too small to share.
 *
 * The frame read 0.171 to 0.178 ms over forty pages just booted, 4% highest
 * over lowest, on an M4 Pro with other sessions at work on it: 15% is
 * between three and four times that, and its slack is a hundredth of a
 * millisecond. The 0.6 ms it had was three times the frame, and let one
 * through at half its baseline and at three times it.
 *
 * The download is held to the byte. The build gives the same bytes every
 * time, so there is no wobble to allow for, and with a tenth allowed three
 * games' downloads crept up a kilobyte at a time until a change that had
 * nothing to do with it tripped the gate. A change that moves it writes the
 * baseline again, and says so.
 */
export const TOLERANCE: Record<keyof Figures, readonly [number, number]> = {
  bootMs: [0.35, 250],
  frameMs: [0.15, 0.01],
  bundleBytes: [0, 0],
};

/** Whether a figure has moved from its baseline by more than its tolerance. */
export function moved(key: keyof Figures, was: number, now: number): boolean {
  const [share, slack] = TOLERANCE[key];
  return Math.abs(now - was) > Math.max(Math.abs(was) * share, slack);
}
