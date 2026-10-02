import { describe, expect, it, vi } from 'vitest';
import { LEVELS, theIsland } from '../src/arena';
import { Game } from '../src/game';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import { checkInvariants } from '../src/invariants';
import { DELIVERY, RING, type Level, type Ring } from '../src/mission';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT, newGame } from './helpers';

describe('the game', () => {
  it('is the island, the one it is handed or else the one island, and the same one to every game', () => {
    const { game } = newGame();
    expect(game.island).toBe(theIsland());
    expect(newGame(2).game.island).toBe(game.island);
    const other = { ...theIsland() };
    expect(new Game({ island: other, random: seeded(1) }).island).toBe(other);
  });

  it('starts the helicopter landed on the home pad, facing as the pad does', () => {
    const { game } = newGame();
    const home = game.island.pads[0];
    const h = game.helicopter;
    expect([h.x, h.y, h.yaw]).toEqual([home.x, home.y, home.yaw]);
    // the pad's top is the ground under it, held in single precision, and it is flat wide enough to stand on whole
    expect(h.floor).toBeCloseTo(home.z, 4);
    expect(h.landed).toBe(true);
    expect(h.height).toBe(0);
  });

  it('keeps the helicopter inside the island, drawn in by its reach', () => {
    const { game } = newGame();
    const { bounds } = game.island;
    const r = HELICOPTER.reach;
    expect(game.helicopter.bounds).toEqual({
      minX: bounds.minX + r,
      minY: bounds.minY + r,
      maxX: bounds.maxX - r,
      maxY: bounds.maxY - r,
    });
  });

  it('lets the helicopter rest on the pad, and lift off it, and come down on the land it is over', () => {
    const { game } = newGame();
    const h = game.helicopter;
    const pad = game.island.pads[0];
    for (let f = 0; f < 120; f++) game.step(DT);
    expect(h.landed).toBe(true);
    expect(h.z).toBeCloseTo(pad.z, 4);
    for (let f = 0; f < 90; f++) game.step(DT, { forward: 0, turn: 0, lift: 1 });
    expect(h.height).toBeGreaterThan(8);
    for (let f = 0; f < 240; f++) game.step(DT, { forward: 0, turn: 0, lift: -1 });
    expect(h.landed).toBe(true);
    expect(h.z).toBe(h.floor);
    expect(h.floor).toBeCloseTo(pad.z, 4);
  });

  it('keeps its own time, a step at a time', () => {
    const { game } = newGame();
    for (let f = 0; f < 90; f++) game.step(DT);
    expect(game.t).toBeCloseTo(1.5, 12);
  });

  it('takes its chance from the seed it is given, and never from Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    try {
      const { game } = newGame(5);
      for (let f = 0; f < 60; f++) game.step(DT);
      const reference = seeded(5);
      for (let k = 0; k < 5; k++) expect(game.random()).toBe(reference());
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * The level being flown, finished: lifted off for `airborne` seconds, then set down on each step's pad in turn and
 * waited on. It is for levels of pads alone.
 */
function finish(game: Game, airborne = 1) {
  for (let f = 0, n = Math.round(airborne / DT); f < n; f++) game.step(DT, { forward: 0, turn: 0, lift: 1 });
  for (const step of game.mission.level.steps) {
    if (!('pad' in step)) continue;
    const pad = game.island.pads[step.pad];
    game.helicopter.placeAbove(pad.x, pad.y, 0, pad.yaw);
    for (let f = 0, n = Math.round((DELIVERY.load + 0.1) / DT); f < n; f++) game.step(DT);
  }
}

describe('the levels in play', () => {
  /** A game whose levels' ends are written down as they are told, with its save in memory. */
  const played = (json: string | null = null) => {
    const told: string[] = [];
    const store = memoryStore(json);
    const game = new Game({
      random: seeded(1),
      progress: new Progress(store),
      events: { finished: (id, seconds, best) => told.push(`${id} ${seconds.toFixed(2)}${best ? ' best' : ''}`) },
    });
    return { game, told, store };
  };

  it('has the levels of the arena, and flies the first unless told another', () => {
    const { game } = played();
    expect(game.levels).toBe(LEVELS);
    expect(game.mission.level.id).toBe('first-delivery');
  });

  it('flies the level it is asked for from the start: home, landed, its first step waiting and the clock at nothing', () => {
    const { game } = played();
    for (let f = 0; f < 60; f++) game.step(DT, { forward: 1, turn: 0.5, lift: 1 });
    game.play('over-the-water');
    const h = game.helicopter;
    const home = game.island.pads[0];
    expect([h.x, h.y, h.yaw, h.landed]).toEqual([home.x, home.y, home.yaw, true]);
    expect(game.mission.level.id).toBe('over-the-water');
    expect([game.mission.next, game.mission.loading, game.mission.time, game.mission.started]).toEqual([
      0,
      0,
      0,
      false,
    ]);
    const first = LEVELS.find((level) => level.id === 'over-the-water')!.steps[0];
    expect(game.mission.target).toBe(first.kind === 'pickup' ? first.pad : NaN);
  });

  it('refuses by name a level it does not have', () => {
    const { game } = played();
    expect(() => game.play('lost-in-the-woods')).toThrow(/no such level: lost-in-the-woods/);
    expect(game.mission.level.id).toBe('first-delivery');
  });

  it('knows the level after the one being flown, and that there is none after the last', () => {
    const { game } = played();
    expect(game.nextLevel?.id).toBe('ring-trial');
    game.play('under-and-between');
    expect(game.nextLevel).toBeUndefined();
  });

  it('keeps the time of a level done as its best and saves it, tells it, and keeps it over a slower one', () => {
    const { game, told, store } = played();
    finish(game, 1);
    const first = game.mission.time;
    expect(told).toEqual([`first-delivery ${first.toFixed(2)} best`]);
    expect(JSON.parse(store.json!)).toEqual({ best: { 'first-delivery': first } });
    game.restart();
    finish(game, 3);
    expect(told[1]).toBe(`first-delivery ${game.mission.time.toFixed(2)}`);
    expect(game.progress.best.get('first-delivery')).toBe(first);
    expect(JSON.parse(store.json!)).toEqual({ best: { 'first-delivery': first } });
  });

  it('keeps no time for a level never lifted off from, which only a teleport can finish, and writes nothing', () => {
    const { game, told, store } = played();
    finish(game, 0);
    expect(game.mission.done).toBe(true);
    expect(told).toEqual(['first-delivery 0.00']);
    expect(game.progress.best.size).toBe(0);
    expect(store.json).toBeNull();
  });

  it('lists every level, locked, open or done, with its best time', () => {
    const { game } = played('{"best": {"first-delivery": 40}}');
    expect(game.levelList()).toEqual([
      { id: 'first-delivery', name: 'First delivery', kind: 'delivery', standing: 'done', best: 40 },
      { id: 'ring-trial', name: 'Ring trial', kind: 'rings', standing: 'open', best: null },
      { id: 'over-the-water', name: 'Over the water', kind: 'delivery', standing: 'locked', best: null },
      { id: 'over-the-range', name: 'Over the range', kind: 'delivery', standing: 'locked', best: null },
      { id: 'up-the-valley', name: 'Up the valley', kind: 'rings', standing: 'locked', best: null },
      { id: 'mountain-drop', name: 'Mountain drop', kind: 'delivery', standing: 'locked', best: null },
      { id: 'under-and-between', name: 'Under and between', kind: 'course', standing: 'locked', best: null },
    ]);
  });

  it('starts a level on the pad it names, and on home where it names none, and starts it there again', () => {
    const away: Level = { ...LEVELS[0], id: 'away', start: 7 };
    const game = new Game({ random: seeded(1), levels: [LEVELS[0], away] });
    const at = (pad: number) => {
      const p = game.island.pads[pad];
      return [p.x, p.y, p.yaw, true];
    };
    const h = game.helicopter;
    game.play('away');
    expect([h.x, h.y, h.yaw, h.landed]).toEqual(at(7));
    for (let f = 0; f < 60; f++) game.step(DT, { forward: 1, turn: 0.4, lift: 1 });
    game.restart();
    expect([h.x, h.y, h.yaw, h.landed]).toEqual(at(7));
    game.play(LEVELS[0].id);
    expect([h.x, h.y, h.yaw, h.landed]).toEqual(at(0));
  });

  it('flies each ring trial from its own pad with its rings solid, and a delivery from home with none', () => {
    const { game } = played();
    const h = game.helicopter;
    const on = (pad: number) =>
      [h.x, h.y, h.landed].join() === [game.island.pads[pad].x, game.island.pads[pad].y, true].join();
    game.play('ring-trial');
    expect([on(2), game.solids.count]).toEqual([true, 6]);
    game.play('up-the-valley');
    expect([on(7), game.solids.count]).toEqual([true, 9]);
    game.play('first-delivery');
    expect([on(0), game.solids.count]).toEqual([true, 0]);
  });

  it('knocks the helicopter back off a ring it flies into, and never lets it inside', () => {
    const { game } = played();
    game.play('ring-trial');
    const ring = game.mission.current as Ring;
    const h = game.helicopter;
    // fifteen short of the ring on its axis, a tube's width to the side, so it flies straight at the tube
    const side = ring.opening + RING.tube;
    const x = ring.x - Math.cos(ring.yaw) * 15 - Math.sin(ring.yaw) * side;
    const y = ring.y - Math.sin(ring.yaw) * 15 + Math.cos(ring.yaw) * side;
    h.placeAbove(x, y, 0, ring.yaw);
    h.z = ring.z - HELICOPTER.size.middle;
    let into = 0;
    let back = false;
    for (let f = 0; f < 120; f++) {
      game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
      const along = h.vx * Math.cos(ring.yaw) + h.vy * Math.sin(ring.yaw);
      into = Math.max(into, along);
      if (along < 0) back = true;
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(into, 'it got up to speed').toBeGreaterThan(10);
    expect(back, 'and was knocked back').toBe(true);
    expect(game.mission.next, 'and did not pass the ring').toBe(0);
  });

  it('never knocks the helicopter faster than it can fly, struck at full speed on any part of a tube', () => {
    const { game } = played();
    game.play('ring-trial');
    const ring = game.mission.current as Ring;
    const h = game.helicopter;
    for (let k = 0; k < 72; k++) {
      // at full speed along the ring's axis, from just behind it, square on to its tube and glancing off it 3 inside
      // and outside its line, where the way off it slants up or down
      const round = ((k % 24) / 24) * Math.PI * 2;
      const line = ring.opening + RING.tube + [0, -3, 3][Math.floor(k / 24)];
      const across = Math.cos(round) * line,
        up = Math.sin(round) * line;
      const [ax, ay] = [Math.cos(ring.yaw), Math.sin(ring.yaw)];
      h.placeAbove(ring.x - ax * 6 - ay * across, ring.y - ay * 6 + ax * across, 0, ring.yaw);
      h.z = ring.z + up - HELICOPTER.size.middle;
      h.vx = ax * HELICOPTER.maxSpeed;
      h.vy = ay * HELICOPTER.maxSpeed;
      h.vz = 0;
      for (let f = 0; f < 30; f++) {
        game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
        expect(Math.abs(h.vz), `struck at ${k}, frame ${f}`).toBeLessThanOrEqual(HELICOPTER.climbSpeed + 1e-9);
        expect(h.speed, `struck at ${k}, frame ${f}`).toBeLessThanOrEqual(HELICOPTER.maxSpeed + 1e-9);
      }
    }
  });

  it('pushes the helicopter out of a ring it is put inside', () => {
    const { game } = played();
    game.play('ring-trial');
    const ring = game.mission.current as Ring;
    // its middle on the top of the tube's centre line, as a careless teleport would put it
    game.helicopter.place(ring.x, ring.y, ring.z + ring.opening + RING.tube - HELICOPTER.size.middle, 0);
    expect(checkInvariants(game)).toEqual([]);
  });

  it.each(['the bridge', 'the west tower', 'the east tower'])(
    'rests on the top of %s let down onto it, never inside it and never landed, and pushed on, slides off its edge',
    (name) => {
      const { game } = played();
      const block = game.solids.blocks.find((b) => b.name === name)!;
      const h = game.helicopter;
      const { middle, rotorRadius } = HELICOPTER.size;
      const top = block.z + block.height;
      // over its middle, facing across it, let sink onto it with nothing held, every frame checked
      h.place(block.x, block.y, top + rotorRadius - middle + 4, block.yaw + Math.PI / 2);
      for (let f = 0; f < 240; f++) {
        game.step(DT);
        expect(checkInvariants(game), `frame ${f}`).toEqual([]);
        expect(h.landed, `frame ${f}`).toBe(false);
      }
      // pressed on its top by the reach of its rotor, and all but still
      expect(h.z + middle - rotorRadius).toBeCloseTo(top, 1);
      expect(Math.abs(h.vz)).toBeLessThan(0.5);
      // flown on across it, off its side, and sinking once it is past the edge: lower than it rested, over ground
      // that is not the block's, which west of the towers rises to meet it higher than their tops
      const rested = h.z;
      let lowest = rested;
      for (let f = 0; f < 300; f++) {
        game.step(DT, { forward: 1, turn: 0, lift: 0 });
        expect(checkInvariants(game), `frame ${f}`).toEqual([]);
        lowest = Math.min(lowest, h.z);
      }
      expect(lowest).toBeLessThan(rested - 1);
      const [c, sn] = [Math.cos(block.yaw), Math.sin(block.yaw)];
      const across = -(h.x - block.x) * sn + (h.y - block.y) * c;
      expect(Math.abs(across)).toBeGreaterThan(block.width / 2 + rotorRadius);
    },
  );

  it('keeps its save in memory unless handed a store, so a game run without a page writes nowhere', () => {
    const game = new Game({ random: seeded(1) });
    finish(game);
    expect(game.progress.best.size).toBe(1);
    expect(new Game({ random: seeded(1) }).progress.best.size).toBe(0);
  });
});
