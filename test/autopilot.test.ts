/** The autopilot as a measuring instrument: it banks balls, on more than one seed, and does not get stuck. */
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { checkInvariants } from '../src/invariants';
import { DT, newGame } from './helpers';

describe('the autopilot', () => {
  for (const seed of [1, 2, 3]) {
    it(`banks three balls inside two minutes from seed ${seed}, breaking no rule`, () => {
      const { game } = newGame(seed);
      const pilot = new Autopilot(game);
      for (let f = 0; f < 120 * 60 && game.progress.save.banked < 3; f++) pilot.step(DT);
      expect(game.progress.save.banked).toBeGreaterThanOrEqual(3);
      expect(checkInvariants(game)).toEqual([]);
    });
  }
});
