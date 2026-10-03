/**
 * The autopilot, which the gates play the game through: it must fly the level to the end, from the start and from
 * wherever a player might leave the helicopter, without breaking a rule, or every figure read through it says more
 * about it than about the game.
 */
import { describe, expect, it } from 'vitest';
import { COLLECTIBLES, FIRES, LEVELS, PACKAGES, RESCUE_SPOTS, STRUCTURES } from '../src/arena';
import { Autopilot, FIGHT, PILOT } from '../src/autopilot';
import { FIND } from '../src/finds';
import { Game } from '../src/game';
import { HELICOPTER } from '../src/helicopter';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DROP, SCOOP } from '../src/water';
import { DT } from './helpers';
import { sweep } from './slow';

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

/**
 * How long a level begun where it need not be, from some awkward place, is allowed: 150 s, and for a fire 600, since a fire
 * begun at once is already spreading while the helicopter flies to its water, and a far one needs scoop after scoop.
 */
function within(id: string): number {
  return LEVELS.find((l) => l.id === id)?.kind === 'fire' ? 600 : 150;
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
      // the far fire takes seven scoops and 410 s from home
      const took = flown(game, id === 'north-wood-fire' ? 450 : 180, knocks, pilot);
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

  it.each(sweep(['first-delivery', 'ring-trial', 'under-and-between']))(
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

  it.each(sweep(['ring-trial', 'up-the-valley']))(
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

  it.each(sweep(LEVELS.map((level) => level.id)))(
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
        expect(flown(game, within(id), undefined, pilot), `from ${x}, ${y}, ${z} up`).not.toBeNull();
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

describe('the autopilot among the structures', () => {
  const lakeside = COLLECTIBLES.find((c) => c.id === 'lakeside-towers')!;

  it('threads the lakeside towers on the ring trial, not slowing and swerving round one, as a careful player would', () => {
    const { game, pilot } = told('ring-trial');
    let nearest = Infinity;
    let knocks = 0;
    for (let f = 0; f < 60 * 120 && game.last === null; f++) {
      pilot.step(DT);
      if (game.solids.touched) knocks++;
      const h = game.helicopter;
      for (const block of lakeside.blocks) nearest = Math.min(nearest, game.solids.gapTo(block, h.x, h.y, h.z));
    }
    expect(game.last?.id).toBe('ring-trial');
    expect(game.collection.has('lakeside-towers')).toBe(true);
    expect(knocks).toBe(0);
    // between them, the rotor's reach at least the margin it keeps from every block clear of both
    expect(nearest).toBeGreaterThanOrEqual(PILOT.margin);
    // and by its own clock it is held up by them no more than 0.3 s: the same trial with the pair taken away
    const bare = new Game({ random: seeded(1), structures: STRUCTURES.filter((b) => !lakeside.blocks.includes(b)) });
    const barePilot = new Autopilot(bare);
    barePilot.wanted = 'ring-trial';
    for (let f = 0; f < 60 * 120 && bare.last === null; f++) barePilot.step(DT);
    expect(Math.abs(game.last!.seconds - bare.last!.seconds)).toBeLessThan(0.3);
  });

  it('flies a way through the middle of a gap as it is, and goes round a tower the way would cross outside the opening', () => {
    // a game whose levels have no rings, so that no ring is solid and only the towers can be in the way
    const game = new Game({ random: seeded(1), levels: LEVELS.filter((l) => l.steps[0].kind === 'pickup') });
    const pilot = new Autopilot(game);
    const detour = (
      pilot as unknown as {
        detour(wanted: null, tx: number, ty: number, want: number): boolean;
        via: { x: number; y: number };
      }
    ).detour.bind(pilot);
    const via = (pilot as unknown as { via: { x: number; y: number } }).via;
    const o = lakeside.opening;
    const [ax, ay] = [Math.cos(o.yaw), Math.sin(o.yaw)];
    const at = (back: number, across: number): [number, number] => [
      o.x + ax * back - ay * across,
      o.y + ay * back + ax * across,
    ];
    const heli = game.helicopter;
    const height = o.z - HELICOPTER.size.middle;
    const [x, y] = at(-25, 0);
    heli.place(x, y, height, o.yaw);
    // through the gap's middle to the far side: nothing is in the way
    expect(detour(null, ...at(25, 0), height)).toBe(false);
    // through a tower itself, the way crossing the plane outside the opening: round it, well to the side
    const through = at(25, o.width + 6);
    expect(detour(null, ...through, height)).toBe(true);
    expect(Math.hypot(via.x - o.x, via.y - o.y)).toBeGreaterThan(o.width / 2 + 3);
  });

  it('refuses by name a structure it is told that the game does not have', () => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    expect(pilot.collect).toBeNull();
    expect(() => (pilot.collect = 'the-moon')).toThrow(/no such structure: the-moon/);
    expect(pilot.collect).toBeNull();
    pilot.collect = 'gorge-bridge';
    expect(pilot.collect).toBe('gorge-bridge');
    pilot.collect = null;
    expect(pilot.collect).toBeNull();
  });

  it.each(COLLECTIBLES.map((c) => c.id))('flies from home through the opening of %s, touching nothing', (id) => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    pilot.collect = id;
    let knocks = 0;
    for (let f = 0; f < 60 * 240 && !game.collection.has(id); f++) {
      pilot.step(DT);
      if (game.solids.touched) knocks++;
      const broken = checkInvariants(game);
      if (broken.length) throw new Error(`at ${game.t.toFixed(2)} s: ${broken.join('; ')}`);
    }
    expect(game.collection.has(id)).toBe(true);
    expect(knocks).toBe(0);
  });

  it('goes through it from whichever side is nearer', () => {
    const c = COLLECTIBLES.find((k) => k.id === 'shoulder-towers')!;
    for (const side of [-1, 1]) {
      const game = new Game({ random: seeded(1) });
      const pilot = new Autopilot(game);
      pilot.collect = c.id;
      const [ax, ay] = [Math.cos(c.opening.yaw), Math.sin(c.opening.yaw)];
      game.helicopter.place(c.opening.x + ax * 40 * side, c.opening.y + ay * 40 * side, c.opening.z - 6, 0);
      const was = { x: game.helicopter.x, y: game.helicopter.y };
      let farthest = 0;
      for (let f = 0; f < 60 * 60 && !game.collection.has(c.id); f++) {
        pilot.step(DT);
        farthest = Math.max(farthest, Math.hypot(game.helicopter.x - was.x, game.helicopter.y - was.y));
      }
      expect(game.collection.has(c.id), `from side ${side}`).toBe(true);
      // never flew round to the far side to come back through: it went straight on through, some 40 and a little
      expect(farthest, `from side ${side}`).toBeLessThan(140);
    }
  });

  it('puts the level first: with a level going, or told one, it does not go for the structure', () => {
    const { game, pilot } = told('first-delivery');
    pilot.collect = 'gorge-bridge';
    expect(flown(game, 90, undefined, pilot)).not.toBeNull();
    expect(game.last!.id).toBe('first-delivery');
    expect(game.collection.has('gorge-bridge')).toBe(false);
    // then, with nothing more asked of it, the structure
    pilot.wanted = null;
    for (let f = 0; f < 60 * 240 && !game.collection.has('gorge-bridge'); f++) pilot.step(DT);
    expect(game.collection.has('gorge-bridge')).toBe(true);
  });

  it('asks for nothing once the structure is collected', () => {
    const game = new Game({
      random: seeded(1),
      progress: new Progress(memoryStore('{"best":{},"collected":["gorge-bridge"]}')),
    });
    const pilot = new Autopilot(game);
    pilot.collect = 'gorge-bridge';
    expect(pilot.drive()).toEqual({ forward: 0, turn: 0, lift: 0 });
  });
});

describe('the autopilot and the packages', () => {
  /** The longest it may take from home to land by any one, in seconds: the slowest takes some 56, to the one 417 m off over the gorge. */
  const LIMIT = 90;

  it('refuses by name a package it is told that the game does not have', () => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    expect(pilot.find).toBeNull();
    expect(() => (pilot.find = 'the-moon')).toThrow(/no such package: the-moon/);
    expect(pilot.find).toBeNull();
    pilot.find = 'east-wood';
    expect(pilot.find).toBe('east-wood');
    expect(() => (pilot.find = 'the-moon')).toThrow(/no such package: the-moon/);
    expect(pilot.find).toBe('east-wood');
    pilot.find = null;
    expect(pilot.find).toBeNull();
  });

  it.each(PACKAGES.map((p) => p.id))('flies from home to land by %s, touching nothing, in time', (id) => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    pilot.find = id;
    let knocks = 0;
    for (let f = 0; f < 60 * LIMIT && !game.finds.has(id); f++) {
      pilot.step(DT);
      if (game.solids.touched) knocks++;
      const broken = checkInvariants(game);
      if (broken.length) throw new Error(`at ${game.t.toFixed(2)} s: ${broken.join('; ')}`);
    }
    expect(game.finds.has(id)).toBe(true);
    expect(knocks).toBe(0);
    // it found only the one it was sent to, which is no other on the way
    expect(game.finds.count).toBeGreaterThanOrEqual(1);
  });

  it('comes down on the clearing, with no trunk near it, and finds it landed within reach', () => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    const p = PACKAGES.find((k) => k.id === 'east-wood')!;
    pilot.find = p.id;
    for (let f = 0; f < 60 * LIMIT && !game.finds.has(p.id); f++) pilot.step(DT);
    expect(game.helicopter.landed).toBe(true);
    expect(Math.hypot(game.helicopter.x - p.x, game.helicopter.y - p.y)).toBeLessThan(FIND.reach);
  });

  it('puts the level first: with a level going, or told one, it does not go for the package', () => {
    const { game, pilot } = told('first-delivery');
    pilot.find = 'east-wood';
    expect(flown(game, 90, undefined, pilot)).not.toBeNull();
    expect(game.last!.id).toBe('first-delivery');
    expect(game.finds.has('east-wood')).toBe(false);
    pilot.wanted = null;
    for (let f = 0; f < 60 * LIMIT && !game.finds.has('east-wood'); f++) pilot.step(DT);
    expect(game.finds.has('east-wood')).toBe(true);
  });

  it('puts a structure first: it collects the one it is told, and then goes for the package', () => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    pilot.collect = 'gorge-bridge';
    pilot.find = 'west-shore-wood';
    for (let f = 0; f < 60 * 240 && !game.collection.has('gorge-bridge'); f++) pilot.step(DT);
    expect(game.collection.has('gorge-bridge')).toBe(true);
    expect(game.finds.has('west-shore-wood')).toBe(false);
    for (let f = 0; f < 60 * 240 && !game.finds.has('west-shore-wood'); f++) pilot.step(DT);
    expect(game.finds.has('west-shore-wood')).toBe(true);
  });

  it('asks for nothing once the package is found', () => {
    const game = new Game({
      random: seeded(1),
      progress: new Progress(memoryStore('{"best":{},"found":["east-wood"]}')),
    });
    const pilot = new Autopilot(game);
    pilot.find = 'east-wood';
    expect(pilot.drive()).toEqual({ forward: 0, turn: 0, lift: 0 });
  });

  it('gets out from under the gorge bridge after collecting it, and lands by a package on the far side', () => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    pilot.collect = 'gorge-bridge';
    for (let f = 0; f < 60 * 240 && !game.collection.has('gorge-bridge'); f++) pilot.step(DT);
    pilot.collect = null;
    pilot.find = 'east-wood';
    let knocks = 0;
    for (let f = 0; f < 60 * LIMIT && !game.finds.has('east-wood'); f++) {
      pilot.step(DT);
      if (game.solids.touched) knocks++;
    }
    expect(game.finds.has('east-wood')).toBe(true);
    expect(knocks).toBe(0);
  });

  describe('from under a deck, or from any structure just collected', () => {
    const { middle, rotorRadius } = HELICOPTER.size;
    const decks = STRUCTURES.filter((b) => b.kind === 'deck');
    /**
     * Flown to land by `id`, never stuck; and, unless `grazes`, touching nothing. A route from one structure to a far
     * package may brush a start ring on its way, which is the ring detour's to put right and is no jam, so those only
     * have to land.
     */
    const lands = (game: Game, pilot: Autopilot, id: string, grazes = false) => {
      pilot.find = id;
      let knocks = 0;
      for (let f = 0; f < 60 * LIMIT && !game.finds.has(id); f++) {
        pilot.step(DT);
        if (game.solids.touched) knocks++;
      }
      expect(game.finds.has(id)).toBe(true);
      if (!grazes) expect(knocks).toBe(0);
    };

    it.each(sweep(decks.flatMap((b) => PACKAGES.map((p) => [b.name, p.id] as const))))(
      'from under %s, lands by %s',
      (name, id) => {
        const block = decks.find((k) => k.name === name)!;
        const game = new Game({ random: seeded(1) });
        // its middle under the block's middle, with the rotor clear of the underside by the margin
        game.helicopter.place(block.x, block.y, block.z - middle - rotorRadius - PILOT.margin - 1, 0);
        lands(game, new Autopilot(game), id);
      },
    );

    it.each(sweep(COLLECTIBLES.flatMap((c) => PACKAGES.map((p) => [c.id, p.id] as const))))(
      'just after collecting %s, lands by %s',
      (cid, id) => {
        const game = new Game({ random: seeded(1) });
        const pilot = new Autopilot(game);
        pilot.collect = cid;
        for (let f = 0; f < 60 * 240 && !game.collection.has(cid); f++) pilot.step(DT);
        pilot.collect = null;
        lands(game, pilot, id, true);
      },
    );
  });
});

describe('the autopilot and the rescues', () => {
  const ids = RESCUE_SPOTS.map((s) => s.id);

  it.each(ids)(
    'flies %s from home, touching nothing, and winches in the window and does not land on the spot',
    (id) => {
      const { game, pilot } = told(id);
      const spot = RESCUE_SPOTS.find((s) => s.id === id)!;
      const knocks = { count: 0 };
      let landedOnSpot = false;
      let began = -1;
      const before = game.last;
      for (let f = 0; f < 150 * 60 && game.last === before; f++) {
        pilot.step(DT);
        if (game.mission.level && began < 0) began = game.t;
        const h = game.helicopter;
        if (h.landed && Math.hypot(h.x - spot.x, h.y - spot.y) < 20) landedOnSpot = true;
        if (game.solids.touched) knocks.count++;
      }
      expect(game.last?.id).toBe(id);
      expect(began).toBeGreaterThan(0);
      expect(landedOnSpot).toBe(false);
      expect(knocks.count).toBe(0);
      // under a limit: the longest takes about a minute and a half
      expect(game.t).toBeLessThan(150);
    },
  );

  it.each(sweep(ids))(
    'flies %s from three awkward places: high over the sea, low in the west, and in the far corner',
    (id) => {
      const { bounds } = new Game().helicopter;
      for (const [x, y, height] of [
        [0, 0, 200],
        [-300, 200, 3],
        [bounds.maxX - 10, bounds.minY + 10, 20],
      ] as const) {
        const { game, pilot } = told(id);
        game.helicopter.placeAbove(x, y, height, 1);
        expect(flown(game, 240, undefined, pilot), `from ${x}, ${y}, ${height} up`).not.toBeNull();
        expect(game.last!.id).toBe(id);
      }
    },
  );

  it.each(sweep(ids))('finishes %s begun, from where a player might leave it after the winch', (id) => {
    for (const [x, y, height] of [
      [0, 0, 150],
      [-300, 200, 3],
    ] as const) {
      const game = new Game({ random: seeded(1) });
      game.begin(id);
      game.helicopter.placeAbove(x, y, height, 1);
      expect(flown(game, 150), `from ${x}, ${y}, ${height} up`).not.toBeNull();
    }
  });

  it('holds still in the window while the loader fills, ten metres over the ground', () => {
    const { game, pilot } = told('wood-rescue');
    const spot = RESCUE_SPOTS[0];
    game.helicopter.placeAbove(spot.x, spot.y, 10, 0);
    for (let f = 0; f < 60; f++) pilot.step(DT);
    expect(game.starts.loading).toBeGreaterThan(0.9);
    expect(game.mission.level).toBeNull();
    for (let f = 0; f < 180; f++) pilot.step(DT);
    expect(game.mission.level?.id).toBe('wood-rescue');
  });
});

describe('the autopilot and the fires', () => {
  const ids = FIRES.map((f) => f.id);
  /** The longest a fire level takes from home, in game seconds: the far fire, which needs seven scoops, takes 410. */
  const LIMIT = 450;

  /** A game that counts what it is told of the water, flown by a pilot told the fire level `id`. */
  function bombing(id: string) {
    const counts = { scoops: 0, drops: 0, out: 0 };
    const heights: number[] = [];
    const game: Game = new Game({
      random: seeded(1),
      events: {
        scooped: () => counts.scoops++,
        dropped: () => {
          counts.drops++;
          heights.push(game.helicopter.height);
        },
        fireOut: () => counts.out++,
      },
    });
    const pilot = new Autopilot(game);
    pilot.wanted = id;
    return { game, pilot, counts, heights };
  }

  it.each(ids)(
    'flies %s from home, touching nothing, scooping and dropping until the fire is out, within a limit',
    (id) => {
      const { game, pilot, counts, heights } = bombing(id);
      const knocks = { count: 0 };
      expect(flown(game, LIMIT, knocks, pilot), `${id} done`).not.toBeNull();
      expect(game.last?.id).toBe(id);
      expect(knocks.count).toBe(0);
      expect(counts.out).toBe(1);
      expect(counts.scoops).toBeGreaterThanOrEqual(1);
      expect(counts.drops).toBeGreaterThanOrEqual(1);
      // the water it carried was dropped every time at a height inside the window and clear of the trees
      for (const h of heights) {
        expect(h).toBeLessThanOrEqual(DROP.high);
        expect(h).toBeGreaterThan(17);
      }
      expect(game.t).toBeLessThan(LIMIT);
    },
  );

  it('is begun by its first drop, as a player would, with nothing going until the water falls', () => {
    const { game, pilot } = bombing('west-lake-fire');
    let before = -1;
    for (let f = 0; f < 200 * 60 && game.last === null; f++) {
      pilot.step(DT);
      if (before < 0 && game.mission.level) before = game.t;
    }
    expect(before).toBeGreaterThan(SCOOP.time);
    expect(game.mission.level).toBeNull();
  });

  it.each(ids)('skims %s with the speed and the height held for the whole scoop, along its run', (id) => {
    const { game, pilot } = bombing(id);
    const place = FIRES.find((f) => f.id === id)!;
    const { from, to, z } = place.run;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const [ux, uy] = [(to.x - from.x) / length, (to.y - from.y) / length];
    let scoops = 0;
    let wasFilling = false;
    for (let f = 0; f < 200 * 60 && scoops === 0; f++) {
      pilot.step(DT);
      const h = game.helicopter;
      if (game.tank.filling > 0) {
        wasFilling = true;
        // along the run, within the water and low and fast
        const along = (h.x - from.x) * ux + (h.y - from.y) * uy;
        const off = Math.abs(-(h.x - from.x) * uy + (h.y - from.y) * ux);
        expect(off, 'off the run').toBeLessThan(6);
        expect(along, 'on the run').toBeGreaterThan(-FIGHT.lead - 5);
        expect(along, 'on the run').toBeLessThan(length + FIGHT.lead);
        expect(h.z - z).toBeLessThanOrEqual(SCOOP.low);
      }
      if (game.tank.full) scoops++;
    }
    expect(wasFilling).toBe(true);
    expect(game.tank.full).toBe(true);
    // never lower than the water: it is skimming and not landed on it
    expect(game.helicopter.landed).toBe(false);
  });

  it('comes round again for more water until the fire is out: some fire takes more than one scoop', () => {
    let most = 0;
    for (const id of ids) {
      const { game, pilot, counts } = bombing(id);
      expect(flown(game, LIMIT, undefined, pilot), id).not.toBeNull();
      expect(counts.drops, id).toBe(counts.scoops);
      most = Math.max(most, counts.scoops);
    }
    expect(most).toBeGreaterThan(1);
  });

  it('goes to the nearer end of the run and turns along it: from beyond either end it skims toward the other', () => {
    const place = FIRES[0];
    const { from, to } = place.run;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const [ux, uy] = [(to.x - from.x) / length, (to.y - from.y) / length];
    for (const side of [1, -1]) {
      const { game, pilot } = bombing(place.id);
      const end = side > 0 ? to : from;
      game.helicopter.placeAbove(end.x + ux * side * 50, end.y + uy * side * 50, 60, 0);
      let along = 0;
      for (let f = 0; f < 90 * 60 && !(game.tank.filling > 0.5); f++) pilot.step(DT);
      expect(game.tank.filling, `from the ${side > 0 ? 'far' : 'near'} end`).toBeGreaterThan(0.5);
      along = game.helicopter.vx * ux + game.helicopter.vy * uy;
      expect(Math.sign(along), `skimming ${side > 0 ? 'back' : 'on'} along the run`).toBe(-side);
    }
  });

  it('makes nothing as it flies a fire: the records it writes into are the same objects every step', () => {
    const { game, pilot } = bombing('west-lake-fire');
    const inside = pilot as unknown as Record<string, object>;
    const records = ['line', 'approach', 'patch', 'controls', 'via'].map((k) => inside[k]);
    for (let f = 0; f < 60 * 70; f++) pilot.step(DT);
    expect(game.t).toBeGreaterThan(60);
    ['line', 'approach', 'patch', 'controls', 'via'].forEach((k, i) => expect(inside[k], k).toBe(records[i]));
  });

  it('asks for nothing with the fire out and nothing told it', () => {
    const { game, pilot } = bombing('west-lake-fire');
    expect(flown(game, LIMIT, undefined, pilot)).not.toBeNull();
    pilot.wanted = null;
    expect(pilot.drive()).toEqual({ forward: 0, turn: 0, lift: 0 });
  });

  it.each(sweep(ids))(
    'flies %s from three awkward places: high over the sea, low in the west, and in the far corner',
    (id) => {
      const { bounds } = new Game().helicopter;
      for (const [x, y, height] of [
        [0, 0, 200],
        [-300, 200, 3],
        [bounds.maxX - 10, bounds.minY + 10, 20],
      ] as const) {
        const { game, pilot } = bombing(id);
        game.helicopter.placeAbove(x, y, height, 1);
        expect(flown(game, LIMIT * 1.5, undefined, pilot), `from ${x}, ${y}, ${height} up`).not.toBeNull();
        expect(game.last!.id).toBe(id);
      }
    },
  );

  it.each(sweep(ids))(
    'finishes %s begun, from where a player might leave it: over its trees, on its run, and landed',
    (id) => {
      const place = FIRES.find((f) => f.id === id)!;
      const [p] = place.patches;
      for (const [x, y, height] of [
        [p.x, p.y, 40],
        [place.run.from.x, place.run.from.y, 0],
        [0, 0, 150],
      ] as const) {
        const game = new Game({ random: seeded(1) });
        game.begin(id);
        game.helicopter.placeAbove(x, y, height, 1);
        expect(flown(game, within(id)), `from ${x}, ${y}, ${height} up`).not.toBeNull();
      }
    },
  );
});
