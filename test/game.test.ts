import { describe, expect, it, vi } from 'vitest';
import { COLLECTIBLES, FIRES, LEVELS, PACKAGES, RESCUE_SPOTS, theIsland, type Collectible } from '../src/arena';
import { FIRE, PATCH, SPREAD } from '../src/fire';
import { Game } from '../src/game';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import { checkInvariants } from '../src/invariants';
import { DELIVERY, RING, RINGS, WINCH, type Gate, type Level, type Ring } from '../src/mission';
import { Progress, memoryStore } from '../src/progress';
import { DROP, SCOOP } from '../src/water';
import { seeded } from '../src/random';
import { DT, newGame } from './helpers';

const RING_TRIAL = LEVELS.find((l) => l.id === 'ring-trial')!;
const VALLEY = LEVELS.find((l) => l.id === 'up-the-valley')!;
const COURSE = LEVELS.find((l) => l.id === 'under-and-between')!;
const startRing = (level: Level) => level.steps[0] as Ring;

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

  it('boots flying free: nothing going, nothing last, nothing guided, nothing loading and no pad blocked', () => {
    const { game } = newGame();
    expect(game.mission.level).toBeNull();
    expect(game.last).toBeNull();
    expect(game.guided).toBeNull();
    expect([game.starts.loading, game.starts.blocked]).toEqual([0, -1]);
    expect([game.mission.next, game.mission.time, game.mission.loading]).toEqual([0, 0, 0]);
    expect(game.levels).toBe(LEVELS);
  });

  it('boots with the solids holding the start rings of the two trials and no others', () => {
    const { game } = newGame();
    expect(game.solids.rings).toEqual([startRing(RING_TRIAL), startRing(VALLEY)]);
    expect(game.solids.count).toBe(2);
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

/** `game` stepped `seconds`, nothing held. */
function wait(game: Game, seconds: number) {
  for (let f = 0, n = Math.round(seconds / DT); f < n; f++) game.step(DT);
}

/** The helicopter set down on `pad`, as a landing on it leaves it, and left there `seconds`. */
function sitOn(game: Game, pad: number, seconds: number) {
  const p = game.island.pads[pad];
  game.helicopter.placeAbove(p.x, p.y, 0, p.yaw);
  wait(game, seconds);
}

/** Lifted off and held up `airborne` seconds, so the helicopter has been in the air. */
function liftOff(game: Game, airborne = 1) {
  for (let f = 0, n = Math.round(airborne / DT); f < n; f++) game.step(DT, { forward: 0, turn: 0, lift: 1 });
}

/**
 * A level of pads done as a player does it from free flight: set down on its pickup pad for the load, lifted off for
 * `airborne` seconds, then set down on each pad after in turn and waited on. It is for levels of pads alone.
 */
function deliver(game: Game, id: string, airborne = 1) {
  const level = LEVELS.find((l) => l.id === id)!;
  const pads = level.steps.flatMap((step) => ('pad' in step ? [step.pad] : []));
  sitOn(game, pads[0], DELIVERY.load + 0.2);
  liftOff(game, airborne);
  for (const pad of pads.slice(1)) sitOn(game, pad, DELIVERY.load + 0.2);
}

/** The helicopter set `back` short of an opening on its axis, its middle at the opening's height, facing it. */
function before(game: Game, opening: Ring | Gate, back: number) {
  const [ax, ay] = [Math.cos(opening.yaw), Math.sin(opening.yaw)];
  game.helicopter.place(opening.x - ax * back, opening.y - ay * back, opening.z - HELICOPTER.size.middle, opening.yaw);
}

describe('the levels in play', () => {
  /** A game whose events are written down as they are told, with its save in memory. */
  const played = (json: string | null = null) => {
    const told: string[] = [];
    const store = memoryStore(json);
    const game = new Game({
      random: seeded(1),
      progress: new Progress(store),
      events: {
        started: (id) => told.push(`started ${id}`),
        abandoned: (id) => told.push(`abandoned ${id}`),
        loaded: (pad) => told.push(`loaded ${pad}`),
        delivered: (pad) => told.push(`delivered ${pad}`),
        passed: (ring, of) => told.push(`passed ${ring} ${of}`),
        through: (label) => told.push(`through ${label}`),
        finished: (id, seconds, best) => told.push(`finished ${id} ${seconds.toFixed(2)}${best ? ' best' : ''}`),
      },
    });
    return { game, told, store };
  };

  it('begins a delivery by landing on its pickup pad and staying for the load, and tells it started and then loaded', () => {
    const { game, told } = played();
    sitOn(game, 4, DELIVERY.load - 0.2);
    expect(game.mission.level).toBeNull();
    expect(game.starts.loading).toBeGreaterThan(1);
    expect(told).toEqual([]);
    wait(game, 0.4);
    expect(game.mission.level?.id).toBe('first-delivery');
    expect(told).toEqual(['started first-delivery', 'loaded 4']);
    expect([game.mission.next, game.starts.loading]).toEqual([1, 0]);
  });

  it('runs the clock from the beginning, and not from a lift-off', () => {
    const { game } = played();
    sitOn(game, 4, DELIVERY.load + 0.2);
    expect(game.mission.time).toBeLessThan(0.2);
    wait(game, 1);
    expect(game.mission.time).toBeGreaterThan(1);
    expect(game.helicopter.landed).toBe(true);
  });

  it('does nothing for a landing on a drop pad, or home, with nothing going', () => {
    const { game, told } = played();
    for (const pad of [1, 0, 5, 6]) sitOn(game, pad, 4);
    expect(game.mission.level).toBeNull();
    expect(told).toEqual([]);
  });

  it('goes one level at a time: another level’s crate is landed on and its start ring flown through, and nothing begins', () => {
    const { game, told } = played();
    sitOn(game, 4, DELIVERY.load + 0.2);
    expect(told).toEqual(['started first-delivery', 'loaded 4']);
    for (const pad of [3, 7, 2]) sitOn(game, pad, DELIVERY.load + 2);
    const ring = startRing(RING_TRIAL);
    before(game, ring, 12);
    for (let f = 0; f < 90; f++) game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
    // it went through the opening, and began nothing
    const across =
      (game.helicopter.x - ring.x) * Math.cos(ring.yaw) + (game.helicopter.y - ring.y) * Math.sin(ring.yaw);
    expect(across).toBeGreaterThan(1);
    expect(game.mission.level?.id).toBe('first-delivery');
    expect(game.mission.next).toBe(1);
    expect(told).toEqual(['started first-delivery', 'loaded 4']);
  });

  it('begins the ring trial by that same flight through its start ring when nothing is going', () => {
    const { game, told } = played();
    before(game, startRing(RING_TRIAL), 12);
    for (let f = 0; f < 90; f++) game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
    expect(game.mission.level?.id).toBe('ring-trial');
    expect(told).toEqual(['started ring-trial', 'passed 1 6']);
  });

  it('begins the course by flying between the towers, and tells it through between the towers', () => {
    const { game, told } = played();
    before(game, COURSE.steps[0] as Gate, 14);
    for (let f = 0; f < 90; f++) game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
    expect(game.mission.level?.id).toBe('under-and-between');
    expect(told).toEqual(['started under-and-between', 'through between the towers']);
  });

  it('begins nothing for a start ring flown through backwards, or flown at and knocked off', () => {
    const { game, told } = played();
    const ring = startRing(RING_TRIAL);
    const [ax, ay] = [Math.cos(ring.yaw), Math.sin(ring.yaw)];
    game.helicopter.place(ring.x + ax * 12, ring.y + ay * 12, ring.z - HELICOPTER.size.middle, ring.yaw + Math.PI);
    for (let f = 0; f < 90; f++) game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
    expect(told).toEqual([]);
    // at the tube a tube's width to the side, and knocked back
    const side = ring.opening + RING.tube;
    const h = game.helicopter;
    h.place(ring.x - ax * 15 - ay * side, ring.y - ay * 15 + ax * side, ring.z - HELICOPTER.size.middle, ring.yaw);
    let back = false;
    for (let f = 0; f < 120; f++) {
      game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
      if (h.vx * ax + h.vy * ay < 0) back = true;
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(back).toBe(true);
    expect(game.mission.level).toBeNull();
    expect(told).toEqual([]);
  });

  it('begins a level named at once, wherever the helicopter is, and refuses by name a level it does not have', () => {
    const { game, told } = played();
    game.helicopter.placeAbove(-300, 200, 40, 1);
    game.begin('over-the-water');
    expect(game.mission.level?.id).toBe('over-the-water');
    expect(told).toEqual(['started over-the-water', 'loaded 3']);
    expect([game.mission.next, game.mission.time, game.mission.loading]).toEqual([1, 0, 0]);
    expect(() => game.begin('lost-in-the-woods')).toThrow(/no such level: lost-in-the-woods/);
    expect(game.mission.level?.id).toBe('over-the-water');
  });

  it('puts the guide away when any level begins, by name or by landing, and resets what was loading', () => {
    const { game } = played();
    game.guide('mountain-drop');
    game.begin('first-delivery');
    expect(game.guided).toBeNull();
    game.abandon();
    game.guide('over-the-range');
    sitOn(game, 3, 0.5);
    expect(game.starts.loading).toBeGreaterThan(0);
    game.begin('ring-trial');
    expect(game.starts.loading).toBe(0);
    game.abandon();
    game.guide('over-the-range');
    liftOff(game, 0.3);
    sitOn(game, 4, DELIVERY.load + 0.2);
    expect(game.guided).toBeNull();
  });

  it('ends a level with its time kept as the best, last set, the end told, and nothing going', () => {
    const { game, told, store } = played();
    deliver(game, 'first-delivery');
    const seconds = game.last!.seconds;
    expect(game.last).toEqual({ id: 'first-delivery', seconds, best: true });
    expect(told.at(-1)).toBe(`finished first-delivery ${seconds.toFixed(2)} best`);
    expect(game.progress.best.get('first-delivery')).toBe(seconds);
    expect(JSON.parse(store.json!)).toEqual({ best: { 'first-delivery': seconds }, collected: [], found: [] });
    expect(game.mission.level).toBeNull();
    expect(seconds).toBeGreaterThan(1 + DELIVERY.load);
  });

  it('keeps the best over a slower run, says it was not, and has the level ready to begin again at once', () => {
    const { game, told, store } = played();
    deliver(game, 'first-delivery', 1);
    const first = game.last!.seconds;
    liftOff(game, 0.5);
    deliver(game, 'first-delivery', 4);
    expect(game.last).toEqual({ id: 'first-delivery', seconds: expect.any(Number) as number, best: false });
    expect(game.last!.seconds).toBeGreaterThan(first);
    expect(told.at(-1)).toBe(`finished first-delivery ${game.last!.seconds.toFixed(2)}`);
    expect(game.progress.best.get('first-delivery')).toBe(first);
    expect(JSON.parse(store.json!)).toEqual({ best: { 'first-delivery': first }, collected: [], found: [] });
    // a faster run lowers it
    liftOff(game, 0.5);
    deliver(game, 'first-delivery', 0.2);
    expect(game.last!.best).toBe(true);
    expect(game.progress.best.get('first-delivery')).toBeLessThan(first);
  });

  it('keeps a level that ends at once, as one of a single step would, without a time and without breaking', () => {
    const one: Level = { id: 'one', name: 'One', kind: 'delivery', steps: [{ kind: 'pickup', pad: 4 }] };
    const store = memoryStore();
    const game = new Game({ random: seeded(1), levels: [one], progress: new Progress(store) });
    game.begin('one');
    expect(game.mission.level).toBeNull();
    expect(game.last).toEqual({ id: 'one', seconds: 0, best: false });
    expect(game.progress.best.size).toBe(0);
    expect(store.json).toBeNull();
    expect(checkInvariants(game)).toEqual([]);
  });

  it('blocks the pad a level ended on, which is the pad it was set down on to end it', () => {
    const { game, told } = played();
    deliver(game, 'first-delivery');
    expect(game.starts.blocked).toBe(1);
    expect(told.at(-1)).toMatch(/^finished first-delivery/);
  });

  it('begins no chained level: over the water ends on the pad the mountain drop is loaded from, which begins nothing until it lifts off and lands again', () => {
    const { game, told } = played();
    deliver(game, 'over-the-water');
    expect(game.starts.blocked).toBe(2);
    expect(told.at(-1)).toMatch(/^finished over-the-water/);
    // landed there still, a long while: nothing loads and nothing begins
    wait(game, 6);
    expect(game.mission.level).toBeNull();
    expect(game.starts.loading).toBe(0);
    expect(told.filter((line) => line.startsWith('started'))).toEqual(['started over-the-water']);
    // up, and down on it again
    liftOff(game, 0.5);
    expect(game.starts.blocked).toBe(-1);
    sitOn(game, 2, DELIVERY.load + 0.2);
    expect(game.mission.level?.id).toBe('mountain-drop');
    expect(told.at(-2)).toBe('started mountain-drop');
  });

  it('abandons a level going, told, with nothing going after, the solids at the start rings, and the clock and place gone', () => {
    const { game, told } = played();
    game.begin('up-the-valley');
    game.abandon();
    expect(told).toEqual(['started up-the-valley', 'passed 1 9', 'abandoned up-the-valley']);
    expect(game.mission.level).toBeNull();
    expect([game.mission.next, game.mission.time, game.mission.loading]).toEqual([0, 0, 0]);
    expect(game.solids.rings).toEqual([startRing(RING_TRIAL), startRing(VALLEY)]);
    expect(game.last).toBeNull();
    expect(game.progress.best.size).toBe(0);
  });

  it('puts a parcel that was aboard back when the level is abandoned, and keeps no time', () => {
    const { game } = played();
    sitOn(game, 4, DELIVERY.load + 0.2);
    expect(game.mission.carrying).toBe(true);
    game.abandon();
    expect(game.mission.carrying).toBe(false);
    expect(game.mission.waiting).toBe(-1);
    expect(game.progress.best.size).toBe(0);
  });

  it('blocks the pad it was abandoned on, so the level abandoned on its own pickup pad does not begin again at once', () => {
    const { game, told } = played();
    sitOn(game, 4, DELIVERY.load + 0.2);
    game.abandon();
    expect(game.starts.blocked).toBe(4);
    wait(game, 5);
    expect(game.mission.level).toBeNull();
    expect(told).toEqual(['started first-delivery', 'loaded 4', 'abandoned first-delivery']);
    liftOff(game, 0.5);
    sitOn(game, 4, DELIVERY.load + 0.2);
    expect(game.mission.level?.id).toBe('first-delivery');
  });

  it('abandons nothing with nothing going: nothing told, and what was loading goes on loading', () => {
    const { game, told } = played();
    sitOn(game, 4, 1);
    const loading = game.starts.loading;
    game.abandon();
    expect(told).toEqual([]);
    expect(game.starts.loading).toBe(loading);
    expect(game.starts.blocked).toBe(-1);
  });

  it('shows the way to a level, and to none, and refuses by name a level it does not have', () => {
    const { game } = played();
    game.guide('ring-trial');
    expect(game.guided).toBe(RING_TRIAL);
    game.guide('mountain-drop');
    expect(game.guided?.id).toBe('mountain-drop');
    game.guide(null);
    expect(game.guided).toBeNull();
    expect(() => game.guide('lost-in-the-woods')).toThrow(/no such level: lost-in-the-woods/);
    expect(game.guided).toBeNull();
  });

  it('goes home: landed on the home pad facing as it does, anything going abandoned and told, nothing guided or loading', () => {
    const { game, told } = played();
    game.begin('first-delivery');
    game.guide('ring-trial');
    for (let f = 0; f < 60; f++) game.step(DT, { forward: 1, turn: 0.5, lift: 1 });
    game.home();
    const h = game.helicopter;
    const home = game.island.pads[0];
    expect([h.x, h.y, h.yaw, h.landed]).toEqual([home.x, home.y, home.yaw, true]);
    expect(game.mission.level).toBeNull();
    expect(told.at(-1)).toBe('abandoned first-delivery');
    expect(game.guided).toBeNull();
    expect([game.starts.loading, game.starts.blocked]).toEqual([0, -1]);
    expect(game.solids.rings).toEqual([startRing(RING_TRIAL), startRing(VALLEY)]);
    // and with nothing going, it tells nothing more
    const n = told.length;
    game.home();
    expect(told).toHaveLength(n);
  });

  it('holds only the start rings of the trials while nothing is going, and with a delivery going, and no ring of the course', () => {
    const { game } = played();
    expect(game.solids.count).toBe(2);
    for (const id of ['first-delivery', 'over-the-water']) {
      game.begin(id);
      expect(game.solids.rings, id).toEqual([startRing(RING_TRIAL), startRing(VALLEY)]);
      game.abandon();
    }
    // the course's own rings are solid while it is going, and its openings, which are no rings, never
    game.begin('under-and-between');
    expect(game.solids.rings).toEqual([
      ...COURSE.steps.filter((s) => s.kind === 'ring'),
      startRing(RING_TRIAL),
      startRing(VALLEY),
    ]);
    game.abandon();
    expect(game.solids.rings).toEqual([startRing(RING_TRIAL), startRing(VALLEY)]);
  });

  it('holds the rings of the level going and every other level’s start ring, up to the capacity: ten for the valley', () => {
    const { game } = played();
    game.begin('ring-trial');
    expect(game.solids.rings).toEqual([...RING_TRIAL.steps, startRing(VALLEY)]);
    game.begin('up-the-valley');
    expect(game.solids.rings).toEqual([...VALLEY.steps, startRing(RING_TRIAL)]);
    expect(game.solids.count).toBe(10);
    expect(game.solids.count).toBeLessThanOrEqual(RINGS.capacity);
  });

  it('puts the helicopter at the start of a delivery, landed on its pad, which then loads and begins', () => {
    const { game, told } = played();
    game.moveToStart('over-the-range');
    const pad = game.island.pads[7];
    const h = game.helicopter;
    expect([h.x, h.y, h.landed]).toEqual([pad.x, pad.y, true]);
    expect(game.mission.level).toBeNull();
    expect(told).toEqual([]);
    wait(game, DELIVERY.load + 0.2);
    expect(game.mission.level?.id).toBe('over-the-range');
    expect(told).toEqual(['started over-the-range', 'loaded 7']);
  });

  it.each(['ring-trial', 'up-the-valley', 'under-and-between'])(
    'puts the helicopter 30 back from the opening %s starts with, its middle at the opening’s height, facing it, and flown on it begins',
    (id) => {
      const { game, told } = played();
      game.moveToStart(id);
      const opening = LEVELS.find((l) => l.id === id)!.steps[0] as Ring | Gate;
      const h = game.helicopter;
      const back = (h.x - opening.x) * Math.cos(opening.yaw) + (h.y - opening.y) * Math.sin(opening.yaw);
      const across = -(h.x - opening.x) * Math.sin(opening.yaw) + (h.y - opening.y) * Math.cos(opening.yaw);
      expect(back).toBeCloseTo(-30, 6);
      expect(Math.abs(across)).toBeLessThan(1e-9);
      expect(h.z + HELICOPTER.size.middle).toBeCloseTo(opening.z, 6);
      expect(h.yaw).toBeCloseTo(opening.yaw, 9);
      expect(game.mission.level).toBeNull();
      for (let f = 0; f < 240 && !game.mission.level; f++) game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
      expect(game.mission.level?.id).toBe(id);
      expect(told[0]).toBe(`started ${id}`);
    },
  );

  it('abandons what is going, told, when the helicopter is put at a start, and blocks nothing there', () => {
    const { game, told } = played();
    game.begin('first-delivery');
    game.moveToStart('first-delivery');
    expect(told.at(-1)).toBe('abandoned first-delivery');
    expect(game.mission.level).toBeNull();
    expect(game.starts.blocked).toBe(-1);
    expect(() => game.moveToStart('lost-in-the-woods')).toThrow(/no such level: lost-in-the-woods/);
  });
});

describe('the helicopter and the rings', () => {
  it('knocks the helicopter back off a ring it flies into, and never lets it inside', () => {
    const { game } = newGame();
    const ring = startRing(RING_TRIAL);
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
    expect(game.mission.level, 'and did not pass the ring').toBeNull();
  });

  it('never knocks the helicopter faster than it can fly, struck at full speed on any part of a tube', () => {
    const { game } = newGame();
    const ring = startRing(RING_TRIAL);
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
    const { game } = newGame();
    const ring = startRing(RING_TRIAL);
    // its middle on the top of the tube's centre line, as a careless teleport would put it
    game.helicopter.place(ring.x, ring.y, ring.z + ring.opening + RING.tube - HELICOPTER.size.middle, 0);
    expect(checkInvariants(game)).toEqual([]);
  });

  it.each(['the gorge bridge', "the shoulder towers' west tower", "the shoulder towers' east tower"])(
    'rests on the top of %s let down onto it, never inside it and never landed, and pushed on, slides off its edge',
    (name) => {
      const { game } = newGame();
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
    deliver(game, 'first-delivery');
    expect(game.progress.best.size).toBe(1);
    expect(new Game({ random: seeded(1) }).progress.best.size).toBe(0);
  });
});

describe('the structures collected, in the game', () => {
  const towers = COLLECTIBLES.find((c) => c.id === 'shoulder-towers')!;
  const gorge = COLLECTIBLES.find((c) => c.id === 'gorge-bridge')!;
  const played = (json: string | null = null) => {
    const told: string[] = [];
    const store = memoryStore(json);
    const game = new Game({
      random: seeded(1),
      progress: new Progress(store),
      events: { collected: (id, n, of) => told.push(`collected ${id} ${n} ${of}`) },
    });
    return { game, told, store };
  };
  const through = (game: Game, c: Collectible) => {
    before(game, c.opening, 15);
    game.step(DT);
    for (let f = 0; f < 90; f++) game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
  };

  it('tells what was collected, how many are collected now and of how many there are, once each', () => {
    const { game, told } = played();
    through(game, towers);
    through(game, gorge);
    through(game, towers);
    expect(told).toEqual(['collected shoulder-towers 1 7', 'collected gorge-bridge 2 7']);
  });

  it('keeps it in the save as it is collected, in order, and not before', () => {
    const { game, store } = played();
    expect(store.json).toBeNull();
    through(game, gorge);
    through(game, towers);
    expect(JSON.parse(store.json!)).toEqual({ best: {}, collected: ['gorge-bridge', 'shoulder-towers'], found: [] });
    const again = new Game({ random: seeded(1), progress: new Progress(memoryStore(store.json)) });
    expect(again.collection.count).toBe(2);
    expect(again.collection.has('gorge-bridge')).toBe(true);
  });

  it('counts an id the save brought that the game does not have as no one of the seven', () => {
    const { game, told } = played('{"best":{},"collected":["from-a-later-game"]}');
    through(game, towers);
    expect(told).toEqual(['collected shoulder-towers 1 7']);
  });

  it('collects with nothing going and with a level going, and goes on with the level', () => {
    const { game, told } = played();
    game.begin('ring-trial');
    through(game, towers);
    expect(told).toHaveLength(1);
    expect(game.mission.level?.id).toBe('ring-trial');
    expect(checkInvariants(game)).toEqual([]);
  });

  it.each(['home', 'moveToStart', 'begin'] as const)(
    'forgets where the helicopter was on %s, so a crossing that is only a move is not collected',
    (how) => {
      const { game } = played();
      before(game, towers.opening, 0.5);
      game.step(DT);
      if (how === 'home') game.home();
      else if (how === 'moveToStart') game.moveToStart('first-delivery');
      else game.begin('first-delivery');
      before(game, towers.opening, -0.5);
      game.step(DT);
      expect(game.collection.count).toBe(0);
    },
  );
});

describe('the packages found, in the game', () => {
  const [one, two] = PACKAGES;
  const played = (json: string | null = null) => {
    const told: string[] = [];
    const store = memoryStore(json);
    const game = new Game({
      random: seeded(1),
      progress: new Progress(store),
      events: { found: (id, n, of) => told.push(`found ${id} ${n} ${of}`) },
    });
    return { game, told, store };
  };
  const landAt = (game: Game, p: { x: number; y: number }, away: number) => {
    game.helicopter.place(p.x + away, p.y, 0, 0);
    for (let f = 0; f < 5; f++) game.step(DT);
  };

  it('tells what was found, how many are found now and of how many there are, once each', () => {
    const { game, told } = played();
    landAt(game, one, 5);
    landAt(game, two, 5);
    landAt(game, one, 5);
    expect(told).toEqual([`found ${one.id} 1 10`, `found ${two.id} 2 10`]);
  });

  it('keeps it in the save as it is found, in order, and not before', () => {
    const { game, store } = played();
    expect(store.json).toBeNull();
    landAt(game, two, 2);
    landAt(game, one, 2);
    expect(JSON.parse(store.json!)).toEqual({ best: {}, collected: [], found: [two.id, one.id] });
    const again = new Game({ random: seeded(1), progress: new Progress(memoryStore(store.json)) });
    expect(again.finds.count).toBe(2);
    expect(again.finds.has(two.id)).toBe(true);
  });

  it('tells nothing for a package the save had found, nor for one landed 16 m from', () => {
    const { game, told } = played(JSON.stringify({ best: {}, found: [one.id] }));
    landAt(game, one, 2);
    landAt(game, two, 16);
    expect(told).toEqual([]);
  });

  it('counts an id the save brought that the game does not have as no one of the ten', () => {
    const { game, told } = played('{"best":{},"found":["from-a-later-game"]}');
    landAt(game, one, 2);
    expect(told).toEqual([`found ${one.id} 1 10`]);
  });

  it('finds with a level going, and goes on with the level', () => {
    const { game, told } = played();
    game.begin('ring-trial');
    landAt(game, one, 2);
    expect(told).toHaveLength(1);
    expect(game.mission.level?.id).toBe('ring-trial');
    expect(checkInvariants(game)).toEqual([]);
  });
});

describe('a rescue, in the game', () => {
  const [spot] = RESCUE_SPOTS;
  const played = () => {
    const told: string[] = [];
    const game = new Game({
      random: seeded(1),
      events: {
        started: (id) => told.push(`started ${id}`),
        abandoned: (id) => told.push(`abandoned ${id}`),
        loaded: (pad) => told.push(`loaded ${pad}`),
        winched: (id) => told.push(`winched ${id}`),
        landed: (pad) => told.push(`landed ${pad}`),
        finished: (id, seconds, best) => told.push(`finished ${id} ${seconds.toFixed(2)}${best ? ' best' : ''}`),
      },
    });
    return { game, told };
  };
  /** The helicopter hovering `up` over the ground at the spot, `across` from it, then stepped `seconds` held there. */
  const hoverOver = (game: Game, seconds: number, up = 10, across = 0) => {
    game.helicopter.placeAbove(spot.x + across, spot.y, up, 0);
    for (let f = 0, n = Math.round(seconds / DT); f < n; f++) game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
  };

  it('begins by holding the window for 3 s, told started then winched, and wants the home pad', () => {
    const { game, told } = played();
    hoverOver(game, WINCH.hold - 0.3);
    expect(game.mission.level).toBeNull();
    expect(told).toEqual([]);
    hoverOver(game, 0.6);
    expect(game.mission.level?.id).toBe('wood-rescue');
    expect(told).toEqual(['started wood-rescue', 'winched wood-rescue']);
    expect([game.mission.target, game.mission.next, game.starts.loading]).toEqual([0, 1, 0]);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('is flown through to the home pad, with its time kept as the best', () => {
    const { game, told } = played();
    hoverOver(game, WINCH.hold + 0.5);
    const home = game.island.pads[0];
    game.helicopter.placeAbove(home.x, home.y, 20, 0);
    for (let f = 0; f < 600 && game.mission.level; f++) game.step(DT, { forward: 0, turn: 0, lift: -1 });
    expect(game.mission.level).toBeNull();
    expect(game.last?.id).toBe('wood-rescue');
    expect(game.last!.seconds).toBeGreaterThan(0);
    expect(game.progress.best.get('wood-rescue')).toBe(game.last!.seconds);
    expect(told.slice(0, 2)).toEqual(['started wood-rescue', 'winched wood-rescue']);
    expect(told.at(-1)).toMatch(/^finished wood-rescue [\d.]+ best$/);
    expect(told.at(-2)).toBe('landed 0');
  });

  it('begins nothing while another level is going, however long the window is held', () => {
    const { game, told } = played();
    game.begin('first-delivery');
    expect(told).toEqual(['started first-delivery', 'loaded 4']);
    hoverOver(game, WINCH.hold + 2);
    expect(game.mission.level?.id).toBe('first-delivery');
    expect(told).toEqual(['started first-delivery', 'loaded 4']);
    expect(game.starts.loading).toBe(0);
  });

  it('puts the helicopter at the start, hovering 10 m over the person, where holding it begins the level', () => {
    const { game, told } = played();
    game.moveToStart('wood-rescue');
    expect([game.helicopter.x, game.helicopter.y]).toEqual([spot.x, spot.y]);
    expect(game.helicopter.landed).toBe(false);
    expect(game.mission.level).toBeNull();
    for (let f = 0; f < Math.round((WINCH.hold + 0.5) / DT); f++)
      game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.mission.level?.id).toBe('wood-rescue');
    expect(told[0]).toBe('started wood-rescue');
  });

  it('says which person is being winched and how far up they are, by the loader, and nobody otherwise', () => {
    const { game } = played();
    expect(game.winch).toEqual({ spot: null, who: '', share: 0 });
    hoverOver(game, 1.5);
    expect(game.winch.spot).toBe('wood-rescue');
    expect(game.winch.who).toBe('the walker');
    expect(game.winch.share).toBeCloseTo(0.5, 1);
    expect(game.winch.share).toBeCloseTo(game.starts.loading / WINCH.hold, 6);
    // out of the window, the rope has run back
    hoverOver(game, 0.1, 20);
    expect(game.winch).toEqual({ spot: null, who: '', share: 0 });
    // the other spot, and a read that makes nothing
    game.helicopter.placeAbove(RESCUE_SPOTS[2].x, RESCUE_SPOTS[2].y, 10, 0);
    for (let f = 0; f < 30; f++) game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect([game.winch.spot, game.winch.who]).toEqual(['ledge-rescue', 'the climber']);
    expect(game.winch).toBe(game.winch);
    const first = game.winch;
    game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.winch).toBe(first);
  });

  it('winches nobody while a level is going, or when it is a pad that is loading, or once the person is aboard', () => {
    const { game } = played();
    game.begin('first-delivery');
    hoverOver(game, 1);
    expect(game.winch.spot).toBeNull();
    const pad = game.island.pads[4];
    game.abandon();
    game.helicopter.place(pad.x, pad.y, 0, pad.yaw);
    for (let f = 0; f < 30; f++) game.step(DT);
    expect(game.starts.loading).toBeGreaterThan(0);
    expect(game.winch.spot).toBeNull();
    const again = played().game;
    hoverOver(again, WINCH.hold + 0.5);
    expect(again.mission.level?.id).toBe('wood-rescue');
    expect(again.winch).toEqual({ spot: null, who: '', share: 0 });
  });

  it('begun at once, wherever the helicopter is, is past its winch', () => {
    const { game, told } = played();
    game.begin('ledge-rescue');
    expect(told).toEqual(['started ledge-rescue', 'winched ledge-rescue']);
    expect(game.mission.target).toBe(0);
  });
});

describe('water bombing, in the game', () => {
  const [west, south] = FIRES;
  /** A lit patch on the edge of the fire: a drop on it puts out some of the lit ones and leaves the rest burning. */
  const EDGE = west.lit - 1;
  const played = () => {
    const told: string[] = [];
    const game = new Game({
      random: seeded(1),
      events: {
        started: (id) => told.push(`started ${id}`),
        abandoned: (id) => told.push(`abandoned ${id}`),
        scooped: () => told.push('scooped'),
        dropped: (fire, out) => told.push(`dropped ${fire} ${out}`),
        fireOut: (id) => told.push(`fire out ${id}`),
        finished: (id, seconds, best) => told.push(`finished ${id} ${seconds.toFixed(2)}${best ? ' best' : ''}`),
      },
    });
    return { game, told };
  };
  /** The lift that holds the skids `want` metres up, as a hand on the lever would: held in a band, not just at a point. */
  const holding = (game: Game, want: number) =>
    Math.max(-1, Math.min(1, HOVER_LIFT + (want - game.helicopter.z) * 0.8));
  /** Flown along `fire`'s run from its start, 1 m over the water, until the tank is full or `seconds` have gone. */
  function scoop(game: Game, fire = west, seconds = 8, height = 1, forward = 1): void {
    const { from, to, z } = fire.run;
    game.helicopter.place(from.x, from.y, z + height, Math.atan2(to.y - from.y, to.x - from.x));
    for (let f = 0, n = Math.round(seconds / DT); f < n && !game.tank.full; f++)
      game.step(DT, { forward, turn: 0, lift: holding(game, z + height) });
  }
  /**
   * Hovering `up` over the ground at patch `k` of `fire`, for `seconds`. The middle patch, 0, has every lit patch within
   * the splash of it, so a drop on it puts the whole fire out; the corner, 5, leaves some burning.
   */
  function over(game: Game, fire = west, k = EDGE, up = 15, seconds = 0.1): void {
    const p = fire.patches[k];
    game.helicopter.placeAbove(p.x, p.y, up, 0);
    for (let f = 0, n = Math.max(1, Math.round(seconds / DT)); f < n; f++)
      game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
  }
  /** `seconds` flown parked in the air at home, with nothing to do with any fire. */
  const wait = (game: Game, seconds: number) => {
    game.helicopter.placeAbove(0, 0, 60, 0);
    for (let f = 0, n = Math.round(seconds / DT); f < n; f++) game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
  };

  it('has a fire for each place, by name, each burning at its start, and an empty tank', () => {
    const { game } = played();
    expect(game.fires.map((f) => f.id)).toEqual(FIRES.map((f) => f.id));
    for (const f of game.fires) expect([f.burning, f.atStart]).toEqual([FIRES[0].lit, true]);
    expect(game.fire('west-lake-fire')).toBe(game.fires[0]);
    expect(() => game.fire('no-such-fire')).toThrow(/no such fire: no-such-fire/);
    expect([game.tank.full, game.tank.filling]).toEqual([false, 0]);
  });

  it('is handed its fires, as it is its levels', () => {
    const game = new Game({ random: seeded(1), fires: [south] });
    expect(game.fires.map((f) => f.id)).toEqual(['south-lake-fire']);
  });

  it('fills the tank skimming the run, and tells scooped once', () => {
    const { game, told } = played();
    scoop(game);
    expect(game.tank.full).toBe(true);
    expect(told).toEqual(['scooped']);
    const h = game.helicopter;
    expect(h.speed).toBeGreaterThanOrEqual(SCOOP.speed);
    // 2 s of scoop, and the first half second of it to get to 8 m/s
    expect(game.t).toBeGreaterThan(SCOOP.time);
    expect(game.t).toBeLessThan(SCOOP.time + 1.5);
  });

  it('does not fill the tank hovering 1 m over the water, nor skimming too high, nor in a river, nor on the land', () => {
    for (const [forward, height] of [
      [0, 1],
      [1, 3],
    ]) {
      const { game } = played();
      scoop(game, west, 6, height, forward);
      expect(game.tank.full, `${forward} ${height}`).toBe(false);
    }
    const { game } = played();
    const [river] = game.island.rivers;
    const k = Math.floor(river.points.length / 8) * 4;
    game.helicopter.placeAbove(river.points[k], river.points[k + 1], 1, 0);
    for (let f = 0; f < 300; f++) game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT });
    expect(game.tank.filling).toBe(0);
    expect(game.tank.full).toBe(false);
  });

  it('does not fill the tank landed on the water, whatever the speed it slides at', () => {
    const { game } = played();
    const { from, z } = west.run;
    game.helicopter.place(from.x, from.y, z, 0);
    game.helicopter.vx = 12;
    for (let f = 0; f < 10; f++) game.step(DT, { forward: 0, turn: 0, lift: -1 });
    expect(game.helicopter.landed).toBe(true);
    expect(game.tank.filling).toBe(0);
  });

  it('drops a full tank on a burning patch, and puts out the patches in reach and no others', () => {
    const { game, told } = played();
    scoop(game);
    over(game);
    expect(game.tank.full).toBe(false);
    const fire = game.fire(west.id);
    const p = west.patches[EDGE];
    const within = west.patches
      .slice(0, west.lit)
      .filter((q) => Math.hypot(q.x - p.x, q.y - p.y) <= DROP.splash).length;
    expect(within).toBeGreaterThan(1);
    expect(fire.burning).toBe(west.lit - within);
    west.patches.forEach((q, k) => {
      const reached = k < west.lit && Math.hypot(q.x - p.x, q.y - p.y) <= DROP.splash;
      expect(fire.states[k], `patch ${k}`).toBe(reached ? PATCH.out : k < west.lit ? PATCH.burning : PATCH.unburnt);
    });
    expect(told).toEqual(['scooped', `dropped ${west.id} ${within}`, `started ${west.id}`]);
  });

  it('begins the fire level by the drop, with the clock at nothing and its first step done', () => {
    const { game } = played();
    scoop(game);
    expect(game.mission.level).toBeNull();
    over(game, west, EDGE, 15, 1 / 60);
    expect(game.mission.level?.id).toBe(west.id);
    expect(game.mission.next).toBe(1);
    expect(game.mission.time).toBe(0);
    game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.mission.time).toBeCloseTo(DT, 9);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('keeps the water over ground with no fire, over a fire too high, with an empty tank, and over a patch that is out', () => {
    const { game, told } = played();
    scoop(game);
    game.helicopter.placeAbove(0, 0, 10, 0);
    game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.tank.full).toBe(true);
    const p = west.patches[0];
    game.helicopter.placeAbove(p.x, p.y, DROP.high + 1, 0);
    game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.tank.full).toBe(true);
    // beside the fire, just out of the splash
    game.helicopter.placeAbove(p.x + 40, p.y, 15, 0);
    game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.tank.full).toBe(true);
    expect(told).toEqual(['scooped']);
    expect(game.mission.level).toBeNull();
    // an empty tank over the fire does nothing
    const other = played();
    over(other.game);
    expect(other.told).toEqual([]);
    expect(other.game.fire(west.id).burning).toBe(west.lit);
    expect(other.game.mission.level).toBeNull();
  });

  it('drops from near the top of its reach: 20 m up drops, 26 m does not', () => {
    const high = played();
    scoop(high.game);
    over(high.game, west, EDGE, DROP.high + 1);
    expect(high.game.tank.full).toBe(true);
    const low = played();
    scoop(low.game);
    over(low.game, west, EDGE, DROP.high - 5);
    expect(low.game.tank.full).toBe(false);
  });

  it('douses a fire while another level is going, and begins nothing', () => {
    const { game, told } = played();
    game.begin('first-delivery');
    scoop(game);
    over(game);
    const fire = game.fire(west.id);
    expect(fire.burning).toBeLessThan(west.lit);
    expect(game.tank.full).toBe(false);
    expect(game.mission.level?.id).toBe('first-delivery');
    expect(told.filter((t) => t.startsWith('started'))).toEqual(['started first-delivery']);
    expect(told.some((t) => t.startsWith('dropped'))).toBe(true);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('scoops and drops whatever level is going, a parcel aboard too', () => {
    const { game } = played();
    game.begin('first-delivery');
    // the parcel is aboard, its pickup being the step that began the level
    expect(game.mission.carrying).toBe(true);
    scoop(game);
    expect(game.tank.full).toBe(true);
    expect(game.mission.level?.id).toBe('first-delivery');
    expect(game.mission.carrying).toBe(true);
  });

  it('spreads while its level is going, one patch each 8 s, and not before it is begun', () => {
    const { game } = played();
    wait(game, 20);
    expect(game.fire(west.id).burning).toBe(west.lit);
    scoop(game);
    over(game);
    const before = game.fire(west.id).burning;
    // put the helicopter somewhere that is no part of it, and let the level go on
    wait(game, SPREAD.every - 0.2);
    expect(game.fire(west.id).burning).toBe(before);
    wait(game, 0.5);
    expect(game.fire(west.id).burning).toBe(before + 1);
    expect(game.mission.level?.id).toBe(west.id);
  });

  it('flies a fire level through with scoops and drops: told in order, its time kept, and the fire lit again after', () => {
    const { game, told } = played();
    let drops = 0;
    for (let round = 0; round < 20 && game.last?.id !== west.id; round++) {
      scoop(game);
      // over the outermost patch still burning, which leaves the fire some to do
      const fire = game.fire(west.id);
      const k = west.patches
        .map((_, j) => j)
        .filter((j) => fire.states[j] === PATCH.burning)
        .at(-1)!;
      expect(k, 'a patch is burning while the level is going').toBeGreaterThanOrEqual(0);
      over(game, west, k);
      drops++;
      expect(checkInvariants(game), `after drop ${drops}`).toEqual([]);
    }
    expect(game.last?.id).toBe(west.id);
    expect(game.last!.seconds).toBeGreaterThan(0);
    expect(game.progress.best.get(west.id)).toBe(game.last!.seconds);
    expect(game.mission.level).toBeNull();
    expect(game.fire(west.id).burning).toBe(0);
    expect(told.indexOf(`started ${west.id}`)).toBeGreaterThan(told.indexOf('scooped'));
    const out = told.indexOf(`fire out ${west.id}`);
    expect(out).toBeGreaterThan(told.indexOf(`started ${west.id}`));
    expect(told[out + 1]).toMatch(new RegExp(`^finished ${west.id} [\\d.]+ best$`));
    expect(told.filter((t) => t.startsWith('dropped'))).toHaveLength(drops);
    // and lit again once its toast has gone, ready to be flown again, not before
    wait(game, FIRE.relight - 0.3);
    expect(game.fire(west.id).burning).toBe(0);
    wait(game, 0.6);
    expect(game.fire(west.id).burning).toBe(west.lit);
    expect(game.fire(west.id).atStart).toBe(true);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('ends a level as it begins if its fire is out already, with no time kept: a guard, since no drop can do it', () => {
    const { game, told } = played();
    const fire = game.fire(west.id);
    fire.douse(west.patches[0].x, west.patches[0].y);
    fire.douse(west.patches[EDGE].x, west.patches[EDGE].y);
    for (const p of west.patches) fire.douse(p.x, p.y);
    expect(fire.burning).toBe(0);
    game.begin(west.id);
    expect(game.mission.level).toBeNull();
    expect(told).toEqual([`started ${west.id}`, `fire out ${west.id}`, `finished ${west.id} 0.00`]);
    expect(game.progress.best.has(west.id)).toBe(false);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('is not put out by any one drop: from the best place, over the middle, some are left burning', () => {
    for (const place of FIRES) {
      const { game } = played();
      scoop(game, place);
      const lit = place.patches.slice(0, place.lit);
      const [mx, my] = [
        (Math.min(...lit.map((p) => p.x)) + Math.max(...lit.map((p) => p.x))) / 2,
        (Math.min(...lit.map((p) => p.y)) + Math.max(...lit.map((p) => p.y))) / 2,
      ];
      game.helicopter.placeAbove(mx, my, 15, 0);
      game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
      expect(game.fire(place.id).burning, place.id).toBeGreaterThan(0);
    }
  });

  it("starts a fire's wait to be lit again when its level is given up, not from its last change: clean at once, lit 3 s on", () => {
    const { game } = played();
    game.begin(west.id);
    // spread past its start, and then quiet for longer than the wait, with the level still going
    wait(game, SPREAD.every + 0.5);
    const fire = game.fire(west.id);
    expect(fire.burning).toBe(west.lit + 1);
    wait(game, FIRE.relight + 2);
    expect(fire.burning).toBe(west.lit + 1);
    game.abandon();
    // checked with no step in between, it is clean, and not yet lit again
    expect(checkInvariants(game)).toEqual([]);
    expect(fire.atStart).toBe(false);
    wait(game, FIRE.relight - 0.2);
    expect(checkInvariants(game)).toEqual([]);
    expect(fire.atStart).toBe(false);
    wait(game, 0.4);
    expect(fire.atStart).toBe(true);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('starts the wait too when a level is finished, and when home is flown to', () => {
    const { game } = played();
    game.begin(west.id);
    wait(game, SPREAD.every + 0.5);
    game.home();
    expect(checkInvariants(game)).toEqual([]);
    wait(game, FIRE.relight + 0.3);
    expect(game.fire(west.id).atStart).toBe(true);
  });

  it('lights a fire again that was put out while another level was going, 3 s after the last drop, as it is not going', () => {
    const { game } = played();
    game.begin('first-delivery');
    scoop(game);
    over(game);
    expect(game.fire(west.id).atStart).toBe(false);
    wait(game, FIRE.relight - 0.3);
    expect(game.fire(west.id).atStart).toBe(false);
    wait(game, 0.6);
    expect(game.fire(west.id).atStart).toBe(true);
  });

  it("leaves a fire level abandoned to be lit again by the rule, and keeps the tank, which is the helicopter's", () => {
    const { game } = played();
    scoop(game);
    over(game);
    scoop(game);
    expect(game.tank.full).toBe(true);
    wait(game, SPREAD.every + 0.5);
    expect(game.fire(west.id).atStart).toBe(false);
    game.abandon();
    expect(game.mission.level).toBeNull();
    expect(game.tank.full).toBe(true);
    expect(checkInvariants(game)).toEqual([]);
    wait(game, FIRE.relight + 0.3);
    expect(game.fire(west.id).atStart).toBe(true);
    // home, with the tank as it was
    game.home();
    expect(game.tank.full).toBe(true);
  });

  it('is begun by `begin` wherever the helicopter is, with the fire as it stands, and flies to its start by `moveToStart`', () => {
    const { game } = played();
    game.begin(west.id);
    expect(game.mission.level?.id).toBe(west.id);
    expect(game.mission.current?.kind).toBe('fire');
    game.abandon();
    game.moveToStart(west.id);
    // over its run's start, low, ready to skim
    const { from, z } = west.run;
    expect(Math.hypot(game.helicopter.x - from.x, game.helicopter.y - from.y)).toBeLessThan(1);
    expect(game.helicopter.z - z).toBeLessThan(SCOOP.low + 2);
    expect(game.mission.level).toBeNull();
  });

  it('says where the nearest open water is, from where it is, written in place', () => {
    const { game } = played();
    const a = game.nearestWater();
    expect(Number.isFinite(game.water.levelAt(a.x, a.y))).toBe(true);
    const home = game.island.pads[0];
    expect(Math.hypot(a.x - home.x, a.y - home.y)).toBeGreaterThan(0);
    expect(game.nearestWater()).toBe(a);
    game.helicopter.place(west.run.from.x, west.run.from.y, 60, 0);
    const b = game.nearestWater();
    expect(Math.hypot(b.x - west.run.from.x, b.y - west.run.from.y)).toBeLessThan(40);
  });
});
