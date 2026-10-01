import { describe, expect, it, vi } from 'vitest';
import { LEVELS, theIsland } from '../src/arena';
import { Game } from '../src/game';
import { HELICOPTER } from '../src/helicopter';
import { DELIVERY } from '../src/mission';
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

/** The level being flown, finished: lifted off for `airborne` seconds, then set down on each step's pad in turn and waited on. */
function finish(game: Game, airborne = 1) {
  for (let f = 0, n = Math.round(airborne / DT); f < n; f++) game.step(DT, { forward: 0, turn: 0, lift: 1 });
  for (const step of game.mission.level.steps) {
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
    expect([game.mission.next, game.mission.ring, game.mission.time, game.mission.started]).toEqual([0, 0, 0, false]);
    expect(game.mission.target).toBe(LEVELS[1].steps[0].pad);
  });

  it('refuses by name a level it does not have', () => {
    const { game } = played();
    expect(() => game.play('lost-in-the-woods')).toThrow(/no such level: lost-in-the-woods/);
    expect(game.mission.level.id).toBe('first-delivery');
  });

  it('knows the level after the one being flown, and that there is none after the last', () => {
    const { game } = played();
    expect(game.nextLevel?.id).toBe('over-the-water');
    game.play('mountain-drop');
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
      { id: 'over-the-water', name: 'Over the water', kind: 'delivery', standing: 'open', best: null },
      { id: 'over-the-range', name: 'Over the range', kind: 'delivery', standing: 'locked', best: null },
      { id: 'mountain-drop', name: 'Mountain drop', kind: 'delivery', standing: 'locked', best: null },
    ]);
  });

  it('keeps its save in memory unless handed a store, so a game run without a page writes nowhere', () => {
    const game = new Game({ random: seeded(1) });
    finish(game);
    expect(game.progress.best.size).toBe(1);
    expect(new Game({ random: seeded(1) }).progress.best.size).toBe(0);
  });
});
