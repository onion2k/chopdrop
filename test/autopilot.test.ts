/**
 * The autopilot, which the gates play the game through: it must fly the level to the end, from the start and from
 * wherever a player might leave the helicopter, without breaking a rule, or every figure read through it says more
 * about it than about the game.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { Game } from '../src/game';
import { HELICOPTER } from '../src/helicopter';
import { checkInvariants } from '../src/invariants';
import { seeded } from '../src/random';
import { DT } from './helpers';

/**
 * Flown by the autopilot until the level is done or `seconds` have gone, every frame checked; the seconds it took, or
 * null. `knocks`, if handed, counts the frames it touched a solid.
 */
function flown(game: Game, seconds: number, knocks?: { count: number }): number | null {
  const pilot = new Autopilot(game);
  const from = game.t;
  for (let f = 0, n = Math.round(seconds / DT); f < n; f++) {
    pilot.step(DT);
    if (knocks && game.solids.touched) knocks.count++;
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

  it.each(LEVELS.map((level) => level.id))(
    'flies %s from the start to the end, inside two minutes, touching nothing on the way',
    (id) => {
      const game = new Game({ random: seeded(1) });
      game.play(id);
      const knocks = { count: 0 };
      const took = flown(game, 120, knocks);
      expect(took).not.toBeNull();
      expect(game.mission.level.id).toBe(id);
      // a careful player flies clear of the rings and the bridge and the towers, and so does the pilot the gates fly
      expect(knocks.count).toBe(0);
    },
  );

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

  it.each(['ring-trial', 'up-the-valley'])(
    'finishes %s from wherever a player might leave it: high, low, beyond the course, in front of a ring and inside one',
    (id) => {
      // over the sea, on a hill above the rings, in front of the first, in the middle of the second's opening, at the
      // top of the valley and in the last ring of it
      const places: [number, number, number][] = [
        [0, 0, 150],
        [-300, 200, 3],
        [130, 0, 40],
        [95, -40, 43.5 - HELICOPTER.size.middle],
        [-40, 300, 90],
        [5, 341, 107 - HELICOPTER.size.middle],
      ];
      for (const [x, y, z] of places) {
        const game = new Game({ random: seeded(1) });
        game.play(id);
        game.helicopter.place(x, y, z, 1);
        expect(flown(game, 150), `from ${x}, ${y}, ${z} up`).not.toBeNull();
      }
    },
  );

  it.each(LEVELS.map((level) => level.id))(
    'finishes %s from under the bridge and beside it, where it must come out before it climbs',
    (id) => {
      // over the water under the deck, beside each abutment under its ends, and on the bank under the north end
      const places: [number, number, number][] = [
        [-16, 337, 79],
        [-8, 330, 79],
        [-25, 345, 82],
      ];
      for (const [x, y, z] of places) {
        const game = new Game({ random: seeded(1) });
        game.play(id);
        game.helicopter.place(x, y, z, 1);
        expect(flown(game, 150), `from ${x}, ${y}, ${z} up`).not.toBeNull();
      }
    },
  );

  it('finishes the course from wherever a player might leave it: under a ring on the ground, at the towers, in the gorge', () => {
    const course = LEVELS.find((level) => level.kind === 'course')!;
    const rings = course.steps.filter((step) => step.kind === 'ring');
    const places: [number, number, number][] = [
      // landed under each ring, with only a little room to rise before the tube
      ...rings.map(({ x, y }): [number, number, number] => [x, y, 0]),
      [0, 0, 150],
      [-300, 200, 3],
      [-40, 320, 75],
      [-120, 225, 90],
      [40, 380, 140],
      [-200, 400, 60],
      [10, 345, 95],
    ];
    for (const [x, y, z] of places) {
      const game = new Game({ random: seeded(1) });
      game.play(course.id);
      // on the ground where it is asked to be at no height, else at the height asked over the sea
      if (z === 0) game.helicopter.placeAbove(x, y, 0, 1);
      else game.helicopter.place(x, y, z, 1);
      expect(flown(game, 150), `from ${x}, ${y}, ${z} up`).not.toBeNull();
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
