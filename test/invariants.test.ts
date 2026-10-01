import { describe, expect, it } from 'vitest';
import { HELICOPTER } from '../src/helicopter';
import { checkInvariants } from '../src/invariants';
import { DT, newGame } from './helpers';

function flown() {
  const { game } = newGame();
  for (let f = 0; f < 120; f++) game.step(DT, { forward: 1, turn: 0.5, lift: 1 });
  for (let f = 0; f < 60; f++) game.step(DT, { forward: 1, turn: -0.5, lift: -0.2 });
  return game;
}

describe('what must always hold', () => {
  it('holds of a new game, and of one flown a little', () => {
    const { game } = newGame();
    expect(checkInvariants(game)).toEqual([]);
    expect(checkInvariants(flown())).toEqual([]);
  });

  it('reports a field that is not a number', () => {
    const game = flown();
    game.helicopter.vx = NaN;
    game.helicopter.rotor = Infinity;
    expect(checkInvariants(game).join('\n')).toMatch(/not a number.*vx is NaN, rotor is Infinity/);
  });

  it('reports a helicopter out of bounds, and above the ceiling or below the ground', () => {
    const game = flown();
    const h = game.helicopter;
    h.x = h.bounds.maxX + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/out of bounds/);
    h.x = 0;
    h.y = h.bounds.minY - 1;
    expect(checkInvariants(game).join('\n')).toMatch(/out of bounds/);
    h.y = 0;
    h.floor = h.floorAt(h.x, h.y);
    h.z = HELICOPTER.ceiling + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/out of height/);
    h.z = h.floor - 1;
    expect(checkInvariants(game).join('\n')).toMatch(/out of height/);
    h.z = h.floor + 1;
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a helicopter that thinks it stands on other ground than the ground under it', () => {
    const game = flown();
    const h = game.helicopter;
    h.floor += 5;
    h.z += 5;
    expect(checkInvariants(game).join('\n')).toMatch(/standing on the wrong ground/);
  });

  it('reports a helicopter going too fast, along or up', () => {
    const game = flown();
    game.helicopter.vx = HELICOPTER.maxSpeed + 1;
    game.helicopter.vy = 0;
    expect(checkInvariants(game).join('\n')).toMatch(/too fast: /);
    game.helicopter.vx = 0;
    game.helicopter.vz = HELICOPTER.climbSpeed + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/too fast up or down/);
  });

  it('reports a helicopter tilted too far', () => {
    const game = flown();
    game.helicopter.pitch = HELICOPTER.maxPitch + 0.1;
    expect(checkInvariants(game).join('\n')).toMatch(/too steep/);
    game.helicopter.pitch = 0;
    game.helicopter.roll = -HELICOPTER.maxRoll - 0.1;
    expect(checkInvariants(game).join('\n')).toMatch(/too banked/);
  });

  it('reports a helicopter sinking through the ground', () => {
    const { game } = newGame();
    game.helicopter.vz = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/sinking/);
  });

  it('reports a clock that is negative or not a number', () => {
    const { game } = newGame();
    game.t = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/the clock reads -1/);
    game.t = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/the clock reads NaN/);
  });
});
