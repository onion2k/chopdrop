import { describe, expect, it, vi } from 'vitest';
import { theIsland } from '../src/arena';
import { Game } from '../src/game';
import { HELICOPTER } from '../src/helicopter';
import { seeded } from '../src/random';
import { DT, newGame } from './helpers';

describe('the game', () => {
  it('is the island, the one it is handed or else the one island, and the same one to every game', () => {
    const { game } = newGame();
    expect(game.island).toBe(theIsland());
    expect(newGame(2).game.island).toBe(game.island);
    const other = { ...theIsland() };
    expect(new Game({ island: other, random: seeded(1) }).island).toBe(other);
  });

  it('starts the helicopter landed on the home pad, facing as the pad does', () => {
    const { game } = newGame();
    const home = game.island.pads[0];
    const h = game.helicopter;
    expect([h.x, h.y, h.yaw]).toEqual([home.x, home.y, home.yaw]);
    // the pad's top is the ground under it, held in single precision, and it is flat wide enough to stand on whole
    expect(h.floor).toBeCloseTo(home.z, 4);
    expect(h.landed).toBe(true);
    expect(h.height).toBe(0);
  });

  it('keeps the helicopter inside the island, drawn in by its reach', () => {
    const { game } = newGame();
    const { bounds } = game.island;
    const r = HELICOPTER.reach;
    expect(game.helicopter.bounds).toEqual({
      minX: bounds.minX + r,
      minY: bounds.minY + r,
      maxX: bounds.maxX - r,
      maxY: bounds.maxY - r,
    });
  });

  it('lets the helicopter rest on the pad, and lift off it, and come down on the land it is over', () => {
    const { game } = newGame();
    const h = game.helicopter;
    const pad = game.island.pads[0];
    for (let f = 0; f < 120; f++) game.step(DT);
    expect(h.landed).toBe(true);
    expect(h.z).toBeCloseTo(pad.z, 4);
    for (let f = 0; f < 90; f++) game.step(DT, { forward: 0, turn: 0, lift: 1 });
    expect(h.height).toBeGreaterThan(8);
    for (let f = 0; f < 240; f++) game.step(DT, { forward: 0, turn: 0, lift: -1 });
    expect(h.landed).toBe(true);
    expect(h.z).toBe(h.floor);
    expect(h.floor).toBeCloseTo(pad.z, 4);
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
