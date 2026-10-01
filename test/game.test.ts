import { describe, expect, it, vi } from 'vitest';
import { COLS, FLOOR, ORIGIN_X, ORIGIN_Y, ROWS, TILE, WALL } from '../src/arena';
import { seeded } from '../src/random';
import { DT, newGame } from './helpers';

describe('the game', () => {
  it('is a floor walled in by rock, the wall one tile thick and nothing inside it', () => {
    const { game } = newGame();
    const { solid } = game;
    expect(solid.length).toBe(COLS * ROWS);
    for (let ty = 0; ty < ROWS; ty++)
      for (let tx = 0; tx < COLS; tx++) {
        const edge = tx < WALL || ty < WALL || tx >= COLS - WALL || ty >= ROWS - WALL;
        expect(solid[ty * COLS + tx], `tile ${tx},${ty}`).toBe(edge ? 1 : 0);
      }
    // the floor's edge is where the rock starts, in world units
    expect(FLOOR.minX).toBe(ORIGIN_X + WALL * TILE);
    expect(FLOOR.maxY).toBe(ORIGIN_Y + (ROWS - WALL) * TILE);
  });

  it('keeps its own time, a step at a time', () => {
    const { game } = newGame();
    for (let f = 0; f < 90; f++) game.step(DT);
    expect(game.t).toBeCloseTo(1.5, 12);
  });

  it('takes its chance from the seed it is given, and never from Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    try {
      const { game } = newGame(5);
      for (let f = 0; f < 60; f++) game.step(DT);
      const reference = seeded(5);
      for (let k = 0; k < 5; k++) expect(game.random()).toBe(reference());
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
