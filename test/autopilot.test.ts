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
 * Flown by the autopilot until a level is done (a time kept, `game.last`) or `seconds` have gone, every frame checked;
 * the seconds it took, or null. `knocks`, if handed, counts the frames it touched a solid.
 */
function flown(game: Game, seconds: number, knocks?: { count: number }, pilot = new Autopilot(game)): number | null {
  const before = game.last;
  const from = game.t;
  for (let f = 0, n = Math.round(seconds / DT); f < n; f++) {
    pilot.step(DT);
    if (knocks && game.solids.touched) knocks.count++;
    const broken = checkInvariants(game);
    if (broken.length) throw new Error(`at ${game.t.toFixed(2)} s: ${broken.join('; ')}`);
    if (game.last !== before) return game.t - from;
  }
  return null;
}

/** A game flown from home by a pilot told to do the level `id`. */
function told(id: string, seed = 1) {
  const game = new Game({ random: seeded(seed) });
  const pilot = new Autopilot(game);
  pilot.wanted = id;
  return { game, pilot };
}

describe('the autopilot', () => {
  it('asks for nothing with nothing going and no level told to it, wherever it is', () => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    expect(pilot.wanted).toBeNull();
    expect(pilot.drive()).toEqual({ forward: 0, turn: 0, lift: 0 });
    game.helicopter.placeAbove(-300, 200, 40, 1);
    expect(pilot.drive()).toEqual({ forward: 0, turn: 0, lift: 0 });
  });

  it('refuses by name a level it is told that the game does not have', () => {
    const { pilot } = told('first-delivery');
    expect(() => (pilot.wanted = 'lost-in-the-woods')).toThrow(/no such level: lost-in-the-woods/);
    expect(pilot.wanted).toBe('first-delivery');
    pilot.wanted = null;
    expect(pilot.wanted).toBeNull();
  });

  it.each([1, 2, 3])('flies the first level from home to its end on seed %i, inside a minute and a half', (seed) => {
    const { game, pilot } = told('first-delivery', seed);
    const took = flown(game, 90, undefined, pilot);
    expect(took).not.toBeNull();
    expect(took!).toBeGreaterThan(20);
    expect(took!).toBeLessThan(90);
  });

  it.each(LEVELS.map((level) => level.id))(
    'flies %s from home to its start and on to its end, told it by name, touching nothing on the way',
    (id) => {
      const { game, pilot } = told(id);
      const knocks = { count: 0 };
      const took = flown(game, 180, knocks, pilot);
      expect(took).not.toBeNull();
      expect(game.last!.id).toBe(id);
      // a careful player flies clear of the rings and the bridge and the towers, and so does the pilot the gates fly
      expect(knocks.count).toBe(0);
    },
  );

  it('does the level it is told, and not another: a different one told does a different one', () => {
    for (const id of ['ring-trial', 'over-the-water']) {
      const { game, pilot } = told(id);
      flown(game, 180, undefined, pilot);
      expect(game.last!.id).toBe(id);
    }
  });

  it('asks for nothing once its level is done and it is told nothing more', () => {
    const { game, pilot } = told('first-delivery');
    flown(game, 90, undefined, pilot);
    const done = game.last;
    // told nothing more, it stands still where it is
    pilot.wanted = null;
    expect(pilot.drive()).toEqual({ forward: 0, turn: 0, lift: 0 });
    expect(game.last).toBe(done);
  });

  it('sits still on the pickup pad while the loader fills, and the level begins by it', () => {
    const { game, pilot } = told('first-delivery');
    const pickup = game.island.pads[4];
    game.helicopter.placeAbove(pickup.x, pickup.y, 0, 0);
    expect(pilot.drive()).toEqual({ forward: 0, turn: 0, lift: 0 });
    for (let f = 0; f < 60; f++) pilot.step(DT);
    expect(game.starts.loading).toBeGreaterThan(0.9);
    expect(game.mission.level).toBeNull();
    for (let f = 0; f < 60; f++) pilot.step(DT);
    expect(game.mission.level?.id).toBe('first-delivery');
  });

  it('lifts off a pickup pad that is blocked and comes down on it again, so the level begins', () => {
    const { game, pilot } = told('over-the-water');
    expect(flown(game, 180, undefined, pilot)).not.toBeNull();
    // it ended on pad 2, which the mountain drop is loaded from: told that, it must lift off first
    expect(game.starts.blocked).toBe(2);
    pilot.wanted = 'mountain-drop';
    expect(flown(game, 180, undefined, pilot)).not.toBeNull();
    expect(game.last!.id).toBe('mountain-drop');
  });

  const SEA_PLACES: [number, number, number][] = [
    [0, 0, 200],
    [-300, 200, 3],
    [-110, 300, 60],
    [400, 400, 5],
    [-600, -100, 120],
  ];

  it.each(['first-delivery', 'ring-trial', 'under-and-between'])(
    'does %s told it from wherever a player might leave it: high, low, over the sea and beyond the mountains',
    (id) => {
      const { bounds } = new Game().helicopter;
      for (const [x, y, height] of [...SEA_PLACES, [bounds.maxX - 10, bounds.minY + 10, 20] as const]) {
        const { game, pilot } = told(id);
        game.helicopter.placeAbove(x, y, height, 1);
        expect(flown(game, 240, undefined, pilot), `from ${x}, ${y}, ${height} up`).not.toBeNull();
        expect(game.last!.id).toBe(id);
      }
    },
  );

  it('finishes a level begun from wherever a player might leave it: high, low, over the sea and beyond the mountains', () => {
    const { bounds } = new Game().helicopter;
    const places: [number, number, number][] = [...SEA_PLACES, [bounds.maxX - 10, bounds.minY + 10, 20]];
    for (const [x, y, height] of places) {
      const game = new Game({ random: seeded(1) });
      game.begin('first-delivery');
      game.helicopter.placeAbove(x, y, height, 1);
      expect(flown(game, 150), `from ${x}, ${y}, ${height} up`).not.toBeNull();
    }
  });

  it.each(['ring-trial', 'up-the-valley'])(
    'finishes %s begun, from wherever a player might leave it: high, low, beyond the course, in front of a ring and inside one',
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
        game.begin(id);
        game.helicopter.place(x, y, z, 1);
        expect(flown(game, 150), `from ${x}, ${y}, ${z} up`).not.toBeNull();
      }
    },
  );

  it.each(LEVELS.map((level) => level.id))(
    'finishes %s begun, from under the bridge and beside it, where it must come out before it climbs',
    (id) => {
      // over the water under the deck, beside each abutment under its ends, and on the bank under the north end
      const places: [number, number, number][] = [
        [-16, 337, 79],
        [-8, 330, 79],
        [-25, 345, 82],
      ];
      for (const [x, y, z] of places) {
        // the course's second step is the opening under the bridge itself, which a helicopter pressed up under the deck
        // beside an abutment cannot come at (nor does any player begin it from there), so it is told the course from
        // nothing going, and flies to the opening between the towers first, as it always has from there
        const { game, pilot } = told(id);
        if (id !== 'under-and-between') {
          pilot.wanted = null;
          game.begin(id);
        }
        game.helicopter.place(x, y, z, 1);
        expect(flown(game, 150, undefined, pilot), `from ${x}, ${y}, ${z} up`).not.toBeNull();
      }
    },
  );

  it('finishes the course begun, from wherever a player might leave it: under a ring on the ground, at the towers, in the gorge', () => {
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
      game.begin(course.id);
      // on the ground where it is asked to be at no height, else at the height asked over the sea
      if (z === 0) game.helicopter.placeAbove(x, y, 0, 1);
      else game.helicopter.place(x, y, z, 1);
      expect(flown(game, 150), `from ${x}, ${y}, ${z} up`).not.toBeNull();
    }
  });

  it('carries on from a parcel already on board', () => {
    const game = new Game({ random: seeded(1) });
    const pickup = game.island.pads[4];
    game.helicopter.placeAbove(pickup.x, pickup.y, 0, 0);
    for (let f = 0; f < 120; f++) game.step(DT);
    expect(game.mission.carrying).toBe(true);
    expect(flown(game, 60)).not.toBeNull();
  });

  it('asks for nothing once the parcel is delivered and nothing is told it', () => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    game.begin('first-delivery');
    flown(game, 60, undefined, pilot);
    expect(game.mission.level).toBeNull();
    expect(pilot.drive()).toEqual({ forward: 0, turn: 0, lift: 0 });
  });
});
