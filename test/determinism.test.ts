/**
 * The determinism check, on its own working parts: the hash sees a change as small as a thousandth, and the check
 * says the frame two runs parted at, so a run that does not repeat itself is found and not just suspected.
 */
import { describe, expect, it } from 'vitest';
import { flight, hashGame, playTwice } from '../scripts/determinism';
import { LEVELS } from '../src/arena';
import { Game } from '../src/game';
import { seeded } from '../src/random';
import { DT } from './helpers';

describe('the determinism check', () => {
  it('plays a seed through the level twice the same way', () => {
    const r = playTwice({ seed: 3, frames: 2400, every: 200 });
    expect(r.diverged, r.note).toBeNull();
    expect(r.checkpoints).toHaveLength(12);
    // and the run got somewhere: the checkpoints are not all one
    expect(new Set(r.checkpoints).size).toBeGreaterThan(6);
  });

  it('flies the levels in turn, each from the start once the one before is done, and the first again after the last', () => {
    const seen: string[] = [];
    let at = '';
    // long enough for all seven, about six minutes of game, and the first begun again
    for (const game of flight(1, 60 * 60 * 7)) {
      if (game.mission.level.id !== at) seen.push((at = game.mission.level.id));
    }
    expect(seen.slice(0, LEVELS.length + 1)).toEqual([...LEVELS.map((level) => level.id), LEVELS[0].id]);
  });

  it('sees which level it is and the best times kept, as well as where the helicopter is', () => {
    const game = () => new Game({ random: seeded(1) });
    const was = hashGame(game());
    const other = game();
    other.play('mountain-drop');
    expect(hashGame(other)).not.toBe(was);
    const kept = game();
    kept.progress.record('first-delivery', 40);
    expect(hashGame(kept)).not.toBe(was);
  });

  it('sees the helicopter moved a thousandth, turned a millionth, a tree leaned, and the ring a hair fuller', () => {
    const game = () => {
      const g = new Game({ random: seeded(1) });
      g.helicopter.placeAbove(-300, -100, 4, 0);
      for (let f = 0; f < 120; f++) g.step(DT, { forward: 0.5, turn: 0, lift: 0.25 });
      return g;
    };
    const was = hashGame(game());
    expect(hashGame(game())).toBe(was);
    const moved = game();
    moved.helicopter.x += 0.001;
    expect(hashGame(moved)).not.toBe(was);
    const turned = game();
    turned.helicopter.yaw += 1e-6;
    expect(hashGame(turned)).not.toBe(was);
    const leaned = game();
    expect(leaned.sway.count).toBeGreaterThan(0);
    leaned.sway.leanX[0] += 1e-6;
    expect(hashGame(leaned)).not.toBe(was);
    const filled = game();
    filled.mission.loading += 1e-6;
    expect(hashGame(filled)).not.toBe(was);
  });

  it('says the frame two runs parted at', () => {
    const r = playTwice({
      seed: 2,
      frames: 900,
      every: 300,
      meddle: (game, pass, frame) => {
        if (pass === 1 && frame === 450) game.helicopter.vx += 0.01;
      },
    });
    expect(r.diverged).toBe(600);
    expect(r.note).toMatch(/parted by frame 600/);
  });
});
