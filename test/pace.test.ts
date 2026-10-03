/** The pace gate's arithmetic: what it holds, level by level, and how it decides a figure has moved. */
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { Game } from '../src/game';
import { seeded } from '../src/random';
import { compare, levels, median, moved, paceRun } from '../scripts/pace';

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

  it('times every level the game has, by its name, in order', () => {
    expect(levels()).toEqual(LEVELS.map((level) => level.id));
  });

  it('gives the same figure on every seed, which is why it is held so close', () => {
    expect(new Set([1, 2, 3, 4].map((seed) => paceRun('first-delivery', seed).minutes)).size).toBe(1);
  });

  it('times the level it is asked for flown to its end, in game minutes', () => {
    const first = paceRun('first-delivery', 1);
    expect(first).toMatchObject({ level: 'first-delivery', finished: true });
    // the level's own clock, from its first step done to its end, and not the flight to it: 17 s when it was measured
    expect(first.minutes).toBeCloseTo(17.0 / 60, 1);
    // and over the range takes longer, by what was measured when it was made: 42 s
    const range = paceRun('over-the-range', 1);
    expect(range.finished).toBe(true);
    expect(range.minutes).toBeCloseTo(42.1 / 60, 1);
  });

  it('times a level from home, as the level’s own clock and not the game’s: the flight to its start is not in it', () => {
    const run = paceRun('ring-trial', 1);
    expect(run.finished).toBe(true);
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    pilot.wanted = 'ring-trial';
    for (let f = 0; f < 3 * 3600 && !game.last; f++) pilot.step(1 / 60);
    expect(game.last).not.toBeNull();
    expect(game.t).toBeGreaterThan(game.last!.seconds + 5);
    expect(run.minutes).toBe(Math.round((game.last!.seconds / 60) * 100) / 100);
  });

  it('times a fire level flown to its end, from home, by the drop that begins it and the last that puts it out', () => {
    const run = paceRun('west-lake-fire', 1);
    expect(run).toMatchObject({ level: 'west-lake-fire', finished: true });
    expect(run.minutes).toBeGreaterThan(0);
    expect(run.minutes).toBeLessThan(2);
  });

  it('gives up at the cap, and says so', () => {
    const run = paceRun('first-delivery', 1, 0.05);
    expect(run.finished).toBe(false);
    expect(run.minutes).toBe(0.05);
  });

  it('holds each level to its own figure, and refuses a level it has no figure for, or a figure for no level', () => {
    const was = { 'first-delivery': 0.59, 'over-the-water': 0.88 };
    expect(compare(was, { 'first-delivery': 0.59, 'over-the-water': 0.89 })).toEqual([]);
    expect(compare(was, { 'first-delivery': 0.59, 'over-the-water': 0.95 })).toEqual([
      'over-the-water moved: 0.88 -> 0.95 min',
    ]);
    expect(compare(was, { 'first-delivery': 0.5, 'over-the-water': 0.88 })).toEqual([
      'first-delivery moved: 0.59 -> 0.5 min',
    ]);
    expect(compare(was, { ...was, 'mountain-drop': 1 })).toEqual(['mountain-drop has no figure in the baseline']);
    expect(compare(was, { 'first-delivery': 0.59 })).toEqual(['over-the-water is in the baseline and is not a level']);
  });
});
