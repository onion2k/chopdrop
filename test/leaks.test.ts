/**
 * What must stay bounded over a long game, and the tool that watches it. The run itself is too long for a unit test
 * (`npm run leaks` does that), so what is tested here is the measuring: that the sizes are read off the game
 * properly, and that the thing which decides what is growing says so when it is, and holds its tongue when it is not.
 */
import { describe, expect, it } from 'vitest';
import { WATCH, grew, leakRun, sizes, trouble } from '../scripts/leaks';
import { SWAY } from '../src/sway';
import { DT, newGame, thickestWood } from './helpers';

describe('what must stay bounded', () => {
  it('reads the sizes off a game, and has a ceiling for every one', () => {
    const { game } = newGame();
    const now = sizes(game);
    for (const key of ['trees moving', 'heap MB']) {
      expect(Object.keys(now), `${key} measured`).toContain(key);
      expect(Number.isFinite(now[key])).toBe(true);
      expect(Object.keys(WATCH), `a ceiling for ${key}`).toContain(key);
    }
    expect(WATCH['trees moving']!.ceiling).toBe(SWAY.capacity);
    // hovering low over a wood, the trees moving are counted
    const wood = thickestWood();
    game.helicopter.placeAbove(wood.x, wood.y, 4, 0);
    for (let f = 0; f < 60; f++) game.step(DT, { forward: 0, turn: 0, lift: 0.25 });
    expect(sizes(game)['trees moving']).toBeGreaterThan(20);
  });

  it('knows a size that grows from one that wanders', () => {
    expect(grew([10, 10, 10, 10, 10, 10, 10, 10, 10])).toBe(false);
    expect(grew([10, 12, 9, 11, 10, 12, 9, 11, 10])).toBe(false);
    expect(grew([0, 20, 40, 60, 50, 50, 50, 50, 50]), 'filled up early and settled').toBe(false);
    expect(grew([10, 20, 30, 40, 50, 60, 70, 80, 90]), 'creeping all the way through').toBe(true);
    expect(grew([1, 2, 3]), 'too short to say').toBe(false);
  });

  it('reports a size over its ceiling, and a steady one still climbing', () => {
    expect(trouble({ 'trees moving': [10, 10, 10] })).toEqual([]);
    expect(trouble({ 'trees moving': [10, 10_000, 10] }).join('\n')).toMatch(/trees moving went to 10000/);
    expect(trouble({ 'heap MB': [10, 40, 70, 100, 130, 160, 190, 220, 250] }).join('\n')).toMatch(/grew all the way/);
  });

  it('plays a short game through, sampling once a game minute', () => {
    const run = leakRun({ seed: 1, minutes: 2 });
    expect(run.problems).toEqual([]);
    expect(run.samples['trees moving']).toHaveLength(2);
    expect(run.samples['heap MB']).toHaveLength(2);
  });
});
