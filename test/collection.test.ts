/**
 * The structures collected: a bridge or a pair of towers is collected the first time the helicopter's middle flies
 * through its opening, either way, with or without a level going, and never again. What is collected is kept in the
 * save, so a reload finds it collected.
 */
import { describe, expect, it } from 'vitest';
import { COLLECTIBLES, LEVELS, type Collectible } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { Collection } from '../src/collection';
import { Game } from '../src/game';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT } from './helpers';

const gorge = COLLECTIBLES.find((c) => c.id === 'gorge-bridge')!;
const towers = COLLECTIBLES.find((c) => c.id === 'shoulder-towers')!;
const { middle } = HELICOPTER.size;

/** The helicopter put `back` along the opening's axis (negative is before it, positive past it), its middle at the opening's height. */
function putAt(game: Game, c: Collectible, back: number, across = 0, facing = 0) {
  const o = c.opening;
  const [ax, ay] = [Math.cos(o.yaw), Math.sin(o.yaw)];
  game.helicopter.place(o.x + ax * back - ay * across, o.y + ay * back + ax * across, o.z - middle, o.yaw + facing);
}

/** Flown straight on from `back` before the opening for `frames` frames, holding its height; what was collected, in order. */
function flownThrough(game: Game, c: Collectible, from: 'front' | 'behind', frames = 90): string[] {
  const sign = from === 'behind' ? -1 : 1;
  putAt(game, c, sign * 15, 0, from === 'behind' ? 0 : Math.PI);
  const told: string[] = [];
  game.step(DT);
  for (let f = 0; f < frames; f++) {
    game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
    for (const id of game.collection.ids) if (!told.includes(id)) told.push(id);
  }
  return told;
}

const newGame = (collected: string[] = []) =>
  new Game({
    random: seeded(1),
    progress: new Progress(memoryStore(JSON.stringify({ best: {}, collected }))),
  });

describe('the collection', () => {
  it('starts with nothing collected, of the seven the game has', () => {
    const game = newGame();
    expect(game.collection.count).toBe(0);
    expect(COLLECTIBLES).toHaveLength(7);
    for (const c of COLLECTIBLES) expect(game.collection.has(c.id)).toBe(false);
  });

  it.each(COLLECTIBLES.map((c) => c.id))('collects %s by its middle crossing its opening, either way', (id) => {
    const c = COLLECTIBLES.find((k) => k.id === id)!;
    const o = c.opening;
    const [ax, ay] = [Math.cos(o.yaw), Math.sin(o.yaw)];
    // the middle at the opening's centre, `back` along its axis, the skids the middle's height below
    const at = (back: number) => ({ x: o.x + ax * back, y: o.y + ay * back, z: o.z - middle, landed: false });
    for (const [from, to] of [
      [-2, 2],
      [2, -2],
    ]) {
      const collection = new Collection([c], new Progress(memoryStore()));
      expect(collection.step(at(from)), `${from} to ${to}`).toBeNull();
      expect(collection.step(at(to))?.id, `${from} to ${to}`).toBe(id);
      expect(collection.count).toBe(1);
      expect(collection.has(id)).toBe(true);
    }
  });

  it('collects the shoulder towers flown through, from either side, and the gorge bridge from the downstream side', () => {
    for (const from of ['behind', 'front'] as const) {
      const game = newGame();
      expect(flownThrough(game, towers, from), from).toEqual(['shoulder-towers']);
      expect(game.collection.count).toBe(1);
    }
    const game = newGame();
    expect(flownThrough(game, gorge, 'behind')).toEqual(['gorge-bridge']);
  });

  it('collects once: a second pass, either way, collects nothing and tells nothing', () => {
    const told: string[] = [];
    const game = new Game({
      random: seeded(1),
      events: { collected: (id, n, of) => told.push(`${id} ${n} ${of}`) },
    });
    flownThrough(game, towers, 'behind');
    flownThrough(game, towers, 'front');
    flownThrough(game, towers, 'behind');
    expect(told).toEqual(['shoulder-towers 1 7']);
    expect(game.collection.count).toBe(1);
    expect(game.collection.ids).toEqual(['shoulder-towers']);
  });

  it('collects nothing by flying round the structure, or over it', () => {
    const game = newGame();
    const o = towers.opening;
    // along the opening's axis but wide of it, past the towers' outer faces
    putAt(game, towers, -15, o.width / 2 + 30);
    game.step(DT);
    for (let f = 0; f < 90; f++) game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
    // and along it, but above the opening's top
    putAt(game, towers, -15, 0);
    game.helicopter.place(game.helicopter.x, game.helicopter.y, o.z + o.height + 6, o.yaw);
    game.step(DT);
    for (let f = 0; f < 90; f++) game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
    expect(game.collection.count).toBe(0);
    // under the bridge's deck is its opening; over the deck is not
    const d = gorge.opening;
    putAt(game, gorge, -15, 0);
    game.helicopter.place(game.helicopter.x, game.helicopter.y, d.z + d.height + 20, d.yaw);
    game.step(DT);
    for (let f = 0; f < 90; f++) game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
    expect(game.collection.has('gorge-bridge')).toBe(false);
  });

  it('collects nothing by a teleport across the opening, but the next flight through still does', () => {
    const game = newGame();
    putAt(game, towers, -3);
    game.step(DT);
    putAt(game, towers, 3);
    game.step(DT);
    expect(game.collection.count).toBe(0);
    flownThrough(game, towers, 'behind');
    expect(game.collection.has('shoulder-towers')).toBe(true);
  });

  it('forgets where the helicopter was on a reset, so a position put after it is never taken for a crossing', () => {
    const game = newGame();
    putAt(game, towers, -0.5);
    game.step(DT);
    game.collection.reset();
    putAt(game, towers, 0.5);
    game.step(DT);
    expect(game.collection.count).toBe(0);
  });

  it('collects with a level going, whichever it is', () => {
    const game = newGame();
    game.begin('first-delivery');
    expect(flownThrough(game, towers, 'behind')).toEqual(['shoulder-towers']);
    expect(game.mission.level?.id).toBe('first-delivery');
  });

  it('is collected by the course as it is flown: the gorge bridge and the shoulder towers', () => {
    const game = new Game({ random: seeded(1) });
    const pilot = new Autopilot(game);
    pilot.wanted = 'under-and-between';
    for (let f = 0; f < 60 * 120 && game.last === null; f++) pilot.step(DT);
    expect(game.last?.id).toBe('under-and-between');
    expect(game.collection.ids.slice().sort()).toEqual(['gorge-bridge', 'shoulder-towers']);
  });

  it('collects the first in the list when two openings are crossed in one step, and the other on the next crossing', () => {
    const twin: Collectible = { ...towers, id: 'twin-towers', name: 'the twin towers' };
    const progress = new Progress(memoryStore());
    const collection = new Collection([towers, twin], progress);
    const o = towers.opening;
    const [ax, ay] = [Math.cos(o.yaw), Math.sin(o.yaw)];
    const at = (back: number) => ({
      x: o.x + ax * back,
      y: o.y + ay * back,
      z: o.z - middle,
      landed: false,
    });
    expect(collection.step(at(-1))).toBeNull();
    expect(collection.step(at(1))?.id).toBe('shoulder-towers');
    expect(collection.count).toBe(1);
    // the second is not lost: crossing again, back through, collects it
    expect(collection.step(at(-1))?.id).toBe('twin-towers');
    expect(collection.count).toBe(2);
    expect(collection.step(at(1))).toBeNull();
    expect(collection.step(at(-1))).toBeNull();
  });

  it("marks a save's collected ids at the start, and never collects those again", () => {
    const told: string[] = [];
    const game = new Game({
      random: seeded(1),
      progress: new Progress(memoryStore('{"best":{},"collected":["shoulder-towers","from-a-later-game"]}')),
      events: { collected: (id) => told.push(id) },
    });
    expect(game.collection.has('shoulder-towers')).toBe(true);
    expect(game.collection.has('gorge-bridge')).toBe(false);
    // an id the game does not have is kept in the save but is not one of the seven
    expect(game.collection.has('from-a-later-game')).toBe(true);
    expect(game.collection.count).toBe(1);
    flownThrough(game, towers, 'behind');
    expect(told).toEqual([]);
  });

  it('counts what it has collected, and says which with has', () => {
    const game = newGame();
    flownThrough(game, gorge, 'behind');
    flownThrough(game, towers, 'front');
    expect(game.collection.count).toBe(2);
    expect(game.collection.has('gorge-bridge')).toBe(true);
    expect(game.collection.has('shoulder-towers')).toBe(true);
    expect(game.collection.has('west-bridge')).toBe(false);
  });

  it('has ids that no level has, so the test API can take either by name', () => {
    const levels = new Set(LEVELS.map((l) => l.id));
    for (const c of COLLECTIBLES) expect(levels.has(c.id), c.id).toBe(false);
  });
});
