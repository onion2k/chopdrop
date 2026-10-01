/** The pace gate's arithmetic: what it holds, and how it decides a figure has moved. */
import { describe, expect, it } from 'vitest';
import { median, moved, paceRun } from '../scripts/pace';

describe('the pace gate', () => {
  it('takes the median, so one odd run does not move the figure', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 100])).toBe(2.5);
  });

  it('holds a figure both ways, quicker as much as slower', () => {
    expect(moved(10, 10.1)).toBe(false);
    expect(moved(10, 10.3)).toBe(true);
    expect(moved(10, 9.7)).toBe(true);
  });

  it('gives the same figure on every seed, which is why it is held so close', () => {
    expect(new Set([1, 2, 3, 4].map((seed) => paceRun(seed).minutes)).size).toBe(1);
  });

  it('times the first level delivered, in game minutes', () => {
    const run = paceRun(1);
    expect(run.finished).toBe(true);
    expect(run.minutes).toBeGreaterThan(0.3);
    expect(run.minutes).toBeLessThan(1);
  });

  it('gives up at the cap, and says so', () => {
    const run = paceRun(1, 0.05);
    expect(run.finished).toBe(false);
    expect(run.minutes).toBe(0.05);
  });
});
