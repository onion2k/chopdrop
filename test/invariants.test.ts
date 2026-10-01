import { describe, expect, it } from 'vitest';
import { ORIGIN_X, ORIGIN_Y } from '../src/arena';
import { checkInvariants } from '../src/invariants';
import { newGame, settle } from './helpers';

describe('what must always hold', () => {
  it('holds of a new game', () => {
    const { game } = newGame();
    settle(game);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a ball in the rock, a ball that is not a number, and a bank that is', () => {
    const { game } = newGame();
    settle(game);
    const slot = [...Array(game.world.count).keys()].find((i) => game.world.alive[i])!;
    const x = game.world.x[slot];
    game.world.x[slot] = ORIGIN_X + 1;
    game.world.y[slot] = ORIGIN_Y + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/in the rock/);
    game.world.x[slot] = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/not a number/);
    game.world.x[slot] = x;
    game.progress.save.bank = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/the bank is -1/);
  });

  it('reports a floor short of balls, and a sled off the floor', () => {
    const { game } = newGame();
    settle(game);
    const slot = [...Array(game.world.count).keys()].find((i) => game.world.alive[i])!;
    game.world.remove(slot);
    expect(checkInvariants(game).join('\n')).toMatch(/balls/);
    game.sled.x = 1e4;
    expect(checkInvariants(game).join('\n')).toMatch(/off the floor/);
  });
});
