/**
 * The autopilot, which the gates play the game through: it must fly the level to the end, from the start and from
 * wherever a player might leave the helicopter, without breaking a rule, or every figure read through it says more
 * about it than about the game.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { seeded } from '../src/random';
import { DT } from './helpers';

/** Flown by the autopilot until the level is done or `seconds` have gone, every frame checked; the seconds it took, or null. */
function flown(game: Game, seconds: number): number | null {
  const pilot = new Autopilot(game);
  const from = game.t;
  for (let f = 0, n = Math.round(seconds / DT); f < n; f++) {
    pilot.step(DT);
    const broken = checkInvariants(game);
    if (broken.length) throw new Error(`at ${game.t.toFixed(2)} s: ${broken.join('; ')}`);
    if (game.mission.done) return game.t - from;
  }
  return null;
}

describe('the autopilot', () => {
  it.each([1, 2, 3])('flies the first level from the start to the end on seed %i, inside a minute', (seed) => {
    const game = new Game({ random: seeded(seed) });
    const took = flown(game, 60);
    expect(took).not.toBeNull();
    expect(took!).toBeGreaterThan(20);
    expect(took!).toBeLessThan(60);
  });

  it('finishes it from wherever a player might leave it: high, low, over the sea and beyond the mountains', () => {
    const { bounds } = new Game().helicopter;
    const places: [number, number, number][] = [
      [0, 0, 200],
      [-300, 200, 3],
      [bounds.maxX - 10, bounds.minY + 10, 20],
      [-110, 300, 60],
      [400, 400, 5],
      [-600, -100, 120],
    ];
    for (const [x, y, height] of places) {
      const game = new Game({ random: seeded(1) });
      game.helicopter.placeAbove(x, y, height, 1);
      expect(flown(game, 150), `from ${x}, ${y}, ${height} up`).not.toBeNull();
    }
  });

  it('carries on from a parcel already on board', () => {
    const game = new Game({ random: seeded(1) });
    const pickup = game.island.pads[game.mission.target];
    game.helicopter.placeAbove(pickup.x, pickup.y, 0, 0);
    for (let f = 0; f < 120; f++) game.step(DT);
    expect(game.mission.carrying).toBe(true);
    expect(flown(game, 60)).not.toBeNull();
  });

  it('asks for nothing once the parcel is delivered, and for nothing on the pad while the ring fills', () => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    const pickup = game.island.pads[game.mission.target];
    game.helicopter.placeAbove(pickup.x, pickup.y, 0, 0);
    expect(pilot.drive()).toEqual({ forward: 0, turn: 0, lift: 0 });
    flown(game, 60);
    expect(pilot.drive()).toEqual({ forward: 0, turn: 0, lift: 0 });
  });
});
