/**
 * The packages found: one is found when the helicopter is landed with its middle within `FIND.reach` of it across the
 * ground, once, whatever else is going; the radar hears the nearest one not yet found within `RADAR.range`, and pings
 * the faster the nearer it is, by the game's own clock. What is found is kept in the save, by name.
 */
import { describe, expect, it, vi } from 'vitest';
import { PACKAGES } from '../src/arena';
import { FIND, Finds, RADAR, radarInterval } from '../src/finds';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT } from './helpers';

const [one, two] = PACKAGES;

/** A helicopter stood `d` east of a place, landed or not. */
const stood = (p: { x: number; y: number }, d: number, landed = true) => ({ x: p.x + d, y: p.y, z: 0, landed });

const newFinds = (json: string | null = null, places = PACKAGES) => {
  const progress = new Progress(memoryStore(json));
  return { finds: new Finds(places, progress), progress };
};

describe('what finds a package', () => {
  it('reaches 15, and the radar hears 100', () => {
    expect(FIND.reach).toBe(15);
    expect(RADAR.range).toBe(100);
  });

  it('finds the package for a helicopter landed 14 m from it', () => {
    const { finds, progress } = newFinds();
    expect(finds.step(stood(one, 14), DT)).toBe(one);
    expect(finds.has(one.id)).toBe(true);
    expect(finds.count).toBe(1);
    expect(progress.found).toEqual([one.id]);
  });

  it('measures across the ground: the height is nothing to it', () => {
    const { finds } = newFinds();
    expect(finds.step({ x: one.x, y: one.y, z: 400, landed: true }, DT)).toBe(one);
  });

  it('finds nothing for a helicopter landed 16 m from it', () => {
    const { finds } = newFinds();
    expect(finds.step(stood(one, 16), DT)).toBeNull();
    expect(finds.count).toBe(0);
  });

  it('finds nothing for one hovering over it, not landed', () => {
    const { finds, progress } = newFinds();
    for (let f = 0; f < 120; f++) expect(finds.step(stood(one, 0, false), DT)).toBeNull();
    expect(finds.count).toBe(0);
    expect(progress.found).toEqual([]);
  });

  it('finds a package once only', () => {
    const { finds, progress } = newFinds();
    expect(finds.step(stood(one, 3), DT)).toBe(one);
    for (let f = 0; f < 60; f++) expect(finds.step(stood(one, 3), DT)).toBeNull();
    expect(finds.count).toBe(1);
    expect(progress.found).toEqual([one.id]);
  });

  it('finds the nearer of two in reach, and the other when the helicopter lands again', () => {
    const near = { id: 'near', x: 0, y: 0, z: 0 };
    const far = { id: 'far', x: 20, y: 0, z: 0 };
    const { finds } = newFinds(null, [far, near]);
    const h = { x: 12, y: 0, z: 0, landed: true };
    expect(finds.step(h, DT)).toBe(far);
    expect(finds.step(h, DT)).toBe(near);
    expect(finds.step(h, DT)).toBeNull();
  });

  it('lists what is found in the order it was found', () => {
    const { finds } = newFinds();
    finds.step(stood(two, 1), DT);
    finds.step(stood(one, 1), DT);
    expect(finds.ids).toEqual([two.id, one.id]);
  });
});

describe('what the save brought', () => {
  it('has a package the save found already found, and not found again', () => {
    const { finds } = newFinds(JSON.stringify({ best: {}, found: [one.id] }));
    expect(finds.has(one.id)).toBe(true);
    expect(finds.count).toBe(1);
    expect(finds.step(stood(one, 2), DT)).toBeNull();
    expect(finds.count).toBe(1);
  });

  it('counts only the packages the game has, and says what the save brought', () => {
    const { finds } = newFinds(JSON.stringify({ best: {}, found: [one.id, 'from-a-later-game'] }));
    expect(finds.count).toBe(1);
    expect(finds.brought).toEqual(new Set([one.id, 'from-a-later-game']));
    expect(finds.ids).toEqual([one.id, 'from-a-later-game']);
  });
});

describe('what the radar hears', () => {
  it('hears a package at 99 m and is quiet at 101 m', () => {
    const { finds } = newFinds();
    finds.step(stood(one, 99, false), DT);
    expect(finds.nearest).toBeCloseTo(99, 9);
    finds.step(stood(one, 101, false), DT);
    expect(finds.nearest).toBe(-1);
  });

  it('is quiet with nothing near', () => {
    const { finds } = newFinds();
    finds.step({ x: 0, y: 0, z: 0, landed: true }, DT);
    expect(finds.nearest).toBe(-1);
    expect(finds.pinged).toBe(false);
  });

  it('does not hear a package that is found', () => {
    const { finds } = newFinds(JSON.stringify({ best: {}, found: [one.id] }));
    finds.step(stood(one, 20, false), DT);
    expect(finds.nearest).toBe(-1);
  });

  it('stops hearing a package the step it is found, and moves on to the next', () => {
    const near = { id: 'near', x: 0, y: 0, z: 0 };
    const next = { id: 'next', x: 60, y: 0, z: 0 };
    const { finds } = newFinds(null, [near, next]);
    finds.step({ x: 5, y: 0, z: 0, landed: false }, DT);
    expect(finds.nearest).toBeCloseTo(5, 9);
    finds.step({ x: 5, y: 0, z: 0, landed: true }, DT);
    expect(finds.nearest).toBeCloseTo(55, 9);
  });

  it('hears the nearer of two', () => {
    const a = { id: 'a', x: 0, y: 0, z: 0 };
    const b = { id: 'b', x: 70, y: 0, z: 0 };
    const { finds } = newFinds(null, [a, b]);
    finds.step({ x: 40, y: 0, z: 0, landed: false }, DT);
    expect(finds.nearest).toBeCloseTo(30, 9);
    finds.step({ x: 20, y: 0, z: 0, landed: false }, DT);
    expect(finds.nearest).toBeCloseTo(20, 9);
  });
});

describe('the radar interval', () => {
  it('is the fastest at the package and the slowest at 100 m', () => {
    expect(RADAR.slowest).toBe(1.2);
    expect(RADAR.fastest).toBe(0.15);
    expect(radarInterval(0)).toBeCloseTo(RADAR.fastest, 12);
    expect(radarInterval(RADAR.range)).toBeCloseTo(RADAR.slowest, 12);
  });

  it('is -1 beyond the range, and for no distance at all', () => {
    expect(radarInterval(RADAR.range + 0.001)).toBe(-1);
    expect(radarInterval(500)).toBe(-1);
    expect(radarInterval(-1)).toBe(-1);
  });

  it('falls as the distance falls, and the last 20 m speed up most', () => {
    let was = radarInterval(0);
    for (let d = 1; d <= RADAR.range; d++) {
      const now = radarInterval(d);
      expect(now, `at ${d}`).toBeGreaterThan(was);
      was = now;
    }
    // in pings a second the last 20 m gain more than the first 20 m from the edge
    const rate = (d: number) => 1 / radarInterval(d);
    expect(rate(0) - rate(20)).toBeGreaterThan(rate(80) - rate(100));
    // and in seconds between pings, too, the last 20 m fall more than the 20 m before them
    expect(radarInterval(20) - radarInterval(0)).toBeGreaterThan(radarInterval(40) - radarInterval(20));
  });
});

describe('the radar clock', () => {
  /** Pings over `seconds` of game time with the helicopter held still `d` from the package. */
  const pings = (d: number, seconds = 10) => {
    const { finds } = newFinds(null, [one]);
    let n = 0;
    for (let f = 0; f < Math.round(seconds / DT); f++) {
      finds.step(stood(one, d, false), DT);
      if (finds.pinged) n++;
    }
    return n;
  };

  it('pings faster at 20 m than at 80 m, and the count is the clock over the interval', () => {
    const near = pings(20),
      far = pings(80);
    expect(near).toBeGreaterThan(far);
    expect(Math.abs(near - 10 / radarInterval(20))).toBeLessThanOrEqual(1);
    expect(Math.abs(far - 10 / radarInterval(80))).toBeLessThanOrEqual(1);
  });

  it('does not ping beyond the range, however long it waits', () => {
    expect(pings(101)).toBe(0);
  });

  it('runs only while a package is in range: leaving and coming back starts it over', () => {
    const { finds } = newFinds(null, [one]);
    let n = 0;
    const step = (d: number) => {
      finds.step(stood(one, d, false), DT);
      if (finds.pinged) n++;
    };
    // within 0.1 s of coming into range at the slowest, nothing has pinged: the interval starts from then
    for (let f = 0; f < 6; f++) step(100);
    expect(n).toBe(0);
    for (let f = 0; f < 600; f++) step(300);
    expect(n).toBe(0);
    for (let f = 0; f < 6; f++) step(100);
    expect(n).toBe(0);
  });

  it('is stepped in the time handed to it, so twice the time is twice the pings', () => {
    const { finds } = newFinds(null, [one]);
    let n = 0;
    for (let f = 0; f < 300; f++) {
      finds.step(stood(one, 50, false), 2 * DT);
      if (finds.pinged) n++;
    }
    expect(Math.abs(n - 10 / radarInterval(50))).toBeLessThanOrEqual(1);
  });
});

describe('a step of the finds, in the game', () => {
  it('is told through the game once, in order, with how many are found and of how many', () => {
    const told: string[] = [];
    const store = memoryStore();
    const game = new Game({
      random: seeded(1),
      progress: new Progress(store),
      events: { found: (id, n, of) => told.push(`found ${id} ${n} ${of}`) },
    });
    for (const p of [one, two, one]) {
      game.helicopter.place(p.x + 3, p.y, 0, 0);
      for (let f = 0; f < 5; f++) game.step(DT);
    }
    expect(told).toEqual([`found ${one.id} 1 10`, `found ${two.id} 2 10`]);
    expect((JSON.parse(store.json!) as { found: string[] }).found).toEqual([one.id, two.id]);
  });

  it('is stepped with a level going, and with nothing going', () => {
    const game = new Game({ random: seeded(1) });
    game.begin('first-delivery');
    game.helicopter.place(one.x, one.y, 0, 0);
    game.step(DT);
    expect(game.finds.has(one.id)).toBe(true);
    expect(game.mission.level?.id).toBe('first-delivery');
  });
});

describe('what a step makes', () => {
  it('nothing: it hands back the places it was built with, and keeps the same fields', () => {
    const { finds } = newFinds();
    const keys = Object.keys(finds).sort();
    const h = { x: 0, y: 0, z: 0, landed: true };
    // pinging at 50 m, then a find, then more steps: the one place is the very object in the list, and nothing else is handed out
    for (let f = 0; f < 3000; f++) {
      h.x = one.x + 50 - (f % 1000) * 0.05;
      h.y = one.y;
      h.landed = false;
      expect(finds.step(h, DT)).toBeNull();
      expect(typeof finds.nearest).toBe('number');
      expect(typeof finds.pinged).toBe('boolean');
    }
    h.x = one.x;
    h.landed = true;
    expect(finds.step(h, DT)).toBe(PACKAGES[0]);
    for (let f = 0; f < 3000; f++) expect(finds.step(h, DT)).toBeNull();
    expect(Object.keys(finds).sort()).toEqual(keys);
  });

  it('makes no list, iterator or copy, which is what each of those would hand the garbage collector', () => {
    const { finds } = newFinds();
    const spies: { mock: { calls: unknown[] } }[] = [];
    for (const name of ['filter', 'map', 'slice', 'concat', 'flatMap', 'entries', 'values', 'keys', 'splice'] as const)
      spies.push(vi.spyOn(Array.prototype, name));
    spies.push(vi.spyOn(Array.prototype, Symbol.iterator));
    const h = { x: one.x + 40, y: one.y, z: 0, landed: false };
    for (let f = 0; f < 2000; f++) {
      h.x -= 0.01;
      finds.step(h, DT);
    }
    // counted without a list or an iterator of its own, which would be counted too
    let made = 0;
    for (let k = 0; k < spies.length; k++) made += spies[k].mock.calls.length;
    vi.restoreAllMocks();
    expect(made).toBe(0);
  });
});
