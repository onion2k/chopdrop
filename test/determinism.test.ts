/**
 * The same seed gives the same game, twice over. Everything that holds the
 * game to a figure rests on that; where it fails, those figures wander for
 * reasons nobody can see.
 */
import { describe, expect, it } from 'vitest';
import { hashGame, playTwice } from '../scripts/determinism';
import { DT, newGame } from './helpers';

describe('the same seed gives the same game', () => {
  it('plays out the same, twice from a seed, all the way down to the last ball', () => {
    const run = playTwice({ seed: 3, frames: 1200, every: 100 });
    expect(run.diverged, run.note).toBe(null);
    expect(run.checkpoints.length).toBe(12);
  });

  it('hashes what a game is, so anything moved shows', () => {
    const drive = { throttle: 1, steer: 0.2 };
    const one = newGame(5).game;
    const two = newGame(5).game;
    for (let f = 0; f < 60; f++) {
      one.step(DT, drive);
      two.step(DT, drive);
    }
    const hash = hashGame(one);
    expect(hashGame(two)).toBe(hash);
    // a ball nudged by a thousandth, the sled a shade round, a ball banked: all different games
    one.world.x[0] += 0.001;
    expect(hashGame(one)).not.toBe(hash);
    one.world.x[0] -= 0.001;
    expect(hashGame(one)).toBe(hash);
    one.sled.yaw += 1e-6;
    expect(hashGame(one)).not.toBe(hash);
    one.sled.yaw -= 1e-6;
    one.progress.deposit(1);
    expect(hashGame(one)).not.toBe(hash);
  });

  it('says where two runs first parted, when they do', () => {
    let frame = 0;
    const run = playTwice({
      seed: 4,
      frames: 400,
      every: 100,
      // a second run that nudges a ball part way through: the check must catch it, and say when
      meddle: (game, pass) => {
        if (pass === 1 && ++frame === 250) game.world.x[0] += 0.01;
      },
    });
    expect(run.diverged).toBe(300);
    expect(run.note).toMatch(/parted by frame 300/);
  });
});
