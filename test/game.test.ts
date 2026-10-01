import { describe, expect, it } from 'vitest';
import { BALLS, HOLE } from '../src/arena';
import { checkInvariants } from '../src/invariants';
import { DT, newGame, settle, still } from './helpers';

describe('the game', () => {
  it('starts with its balls on the floor, and nothing that must hold broken', () => {
    const { game } = newGame();
    expect(game.world.live).toBe(BALLS);
    settle(game);
    expect(game.world.live).toBe(BALLS);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('banks a ball down the hole, drops another, and tells of both', () => {
    const { game, told } = newGame(2);
    settle(game);
    const slot = [...Array(game.world.count).keys()].find((i) => game.world.alive[i])!;
    game.world.x[slot] = HOLE.x;
    game.world.y[slot] = HOLE.y;
    game.world.z[slot] = 2;
    game.world.wake(slot);
    settle(game, 180);
    expect(game.progress.bank).toBe(1);
    expect(game.progress.save.banked).toBe(1);
    expect(told.some((t) => t.startsWith('banked'))).toBe(true);
    expect(told.some((t) => t.startsWith('dropped'))).toBe(true);
    expect(game.world.live, 'the floor keeps its balls').toBe(BALLS);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('writes the save when the bank changes, and not before', () => {
    const { game, store } = newGame(3);
    settle(game);
    expect(store.json).toBe(null);
    game.progress.deposit(1);
    game.step(DT, still);
    expect(store.json).toBe(JSON.stringify({ bank: 1, banked: 1 }));
  });

  it('shoves a ball with the sled', () => {
    const { game } = newGame(4);
    settle(game);
    const slot = [...Array(game.world.count).keys()].find((i) => game.world.alive[i])!;
    Object.assign(game.sled, { x: -20, y: 0, yaw: 0, speed: 0 });
    game.world.x[slot] = -12;
    game.world.y[slot] = 0;
    game.world.wake(slot);
    for (let f = 0; f < 90; f++) game.step(DT, { throttle: 1, steer: 0 });
    expect(game.world.x[slot]).toBeGreaterThan(-8);
    expect(checkInvariants(game)).toEqual([]);
  });
});
