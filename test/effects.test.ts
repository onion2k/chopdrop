/**
 * What the page emits into the renderer's particles, headless: the flames, the smoke, the rescue's flare and the drop's
 * spray and mist, by game-time rates that do not depend on the frame rate, cut off by range, held inside the pool the
 * renderer has, and made without making anything each frame. The renderer itself is not here: it is handed the records
 * this fills, and the browser tests look at what it draws.
 */
import type { Emit } from 'artshape-render/game/particles';
import { describe, expect, it } from 'vitest';
import { FIRES, LEVELS } from '../src/arena';
import { DOWNWASH } from '../src/downwash';
import {
  Effects,
  FLAMES,
  FLARE,
  MIST,
  PARTICLES,
  SMOKE,
  SPRAY,
  WASH,
  longest,
  rescuePeople,
  waitingFlares,
  type FireView,
} from '../src/effects';
import { PATCH } from '../src/fire';
import { HELICOPTER } from '../src/helicopter';

type Camera = readonly [number, number, number];
const NOBODY = new Uint8Array(0);
const FAR: Camera = [5000, 5000, 100];

/** A fire view with the first `burning` patches burning and, for the rest, `rest` (unburnt unless told). */
function view(place: (typeof FIRES)[number], burning: number, rest: number = PATCH.unburnt): FireView {
  const states = new Uint8Array(place.patches.length).fill(rest);
  states.fill(PATCH.burning, 0, burning);
  return { states, burning };
}

/** One fire alone: its place, and the camera at its middle. */
const WEST = FIRES[0];
const middle = (p: (typeof FIRES)[number]): Camera => [p.x, p.y, p.patches[0].z + 30];

interface Run {
  flames: number;
  smoke: number;
  flares: number;
  spray: number;
  mostEmitters: number;
}

/** `seconds` of frames of `dt`, the totals of what each stream emitted and the most emitters one frame used. */
function run(
  effects: Effects,
  seconds: number,
  dt: number,
  fires: readonly FireView[],
  camera: Camera,
  waiting: ArrayLike<number> = NOBODY,
  each?: (frame: number, n: number) => void,
): Run {
  const total: Run = { flames: 0, smoke: 0, flares: 0, spray: 0, mostEmitters: 0 };
  const frames = Math.round(seconds / dt);
  for (let f = 0; f < frames; f++) {
    const n = effects.step(dt, fires, waiting, camera);
    total.flames += effects.counts.flames;
    total.smoke += effects.counts.smoke;
    total.flares += effects.counts.flares;
    total.spray += effects.counts.spray;
    total.mostEmitters = Math.max(total.mostEmitters, n);
    each?.(f, n);
  }
  return total;
}

const PEOPLE = rescuePeople(LEVELS);

describe('the rates', () => {
  it('are per game second: many small steps and a few large ones emit the same, within one a source', () => {
    const fires = FIRES.map((p) => view(p, 4));
    const camera = middle(WEST);
    const sources = { flames: 2 * 4, smoke: 4 };
    const at = (dt: number) => run(new Effects(FIRES, PEOPLE), 10, dt, fires, camera);
    const small = at(1 / 240);
    for (const dt of [1 / 60, 1 / 20, 1 / 2]) {
      const other = at(dt);
      expect(Math.abs(other.flames - small.flames), `flames at ${dt}`).toBeLessThanOrEqual(sources.flames);
      expect(Math.abs(other.smoke - small.smoke), `smoke at ${dt}`).toBeLessThanOrEqual(sources.smoke * 4);
    }
    // and it is the rate that sets how many: ten seconds of the core and the licks of four patches
    expect(small.flames).toBeGreaterThan(0.95 * 4 * (FLAMES.core.rate + FLAMES.licks.rate) * 10);
    expect(small.flames).toBeLessThan(1.05 * 4 * (FLAMES.core.rate + FLAMES.licks.rate) * 10);
  });

  it('emit nothing at a step of no time, as when the game is paused, and nothing moves for it', () => {
    const effects = new Effects(FIRES, PEOPLE);
    effects.drop(WEST.x, WEST.y, 80, 50);
    const waiting = Uint8Array.of(1, 1, 1);
    const n = effects.step(0, [view(WEST, 10), view(FIRES[1], 10), view(FIRES[2], 10)], waiting, middle(WEST));
    expect(n).toBe(0);
    expect(effects.counts).toEqual({ flames: 0, smoke: 0, flares: 0, spray: 0 });
    // the counts of the last frame that moved are kept through the frames that do not, as a paused page draws many
    const moved = new Effects(FIRES, PEOPLE);
    moved.step(1 / 60, [view(WEST, 10)], NOBODY, middle(WEST));
    const kept = { ...moved.counts };
    expect(kept.flames + kept.smoke).toBeGreaterThan(0);
    expect(moved.step(0, [view(WEST, 10)], NOBODY, middle(WEST))).toBe(0);
    expect(moved.counts).toEqual(kept);
    // the drop was not used up by it: it pours when time passes
    const later = run(effects, 1, 1 / 60, [view(WEST, 10)], middle(WEST));
    expect(later.spray).toBeGreaterThan(0);
  });

  it('give a fire more smoke the more of it burns, up to a cap, and no more past it', () => {
    const smokeOf = (burning: number) =>
      run(new Effects(FIRES, PEOPLE), 20, 1 / 60, [view(WEST, burning)], middle(WEST)).smoke;
    const [one, three, cap, all] = [1, 3, SMOKE.cap, WEST.patches.length].map(smokeOf);
    expect(three).toBeGreaterThan(2.5 * one);
    expect(cap).toBeGreaterThan(2.5 * three);
    expect(all).toBeGreaterThan(0.95 * cap);
    expect(all).toBeLessThan(1.05 * cap);
    expect(cap).toBeGreaterThan(0.95 * SMOKE.perPatch * SMOKE.cap * 20);
    expect(cap).toBeLessThan(1.05 * SMOKE.perPatch * SMOKE.cap * 20);
  });
});

describe('the flames', () => {
  it('rise only from burning patches, and none from patches that are out or unburnt', () => {
    const effects = new Effects(FIRES, PEOPLE);
    const states = new Uint8Array(WEST.patches.length).fill(PATCH.out);
    states[2] = PATCH.burning;
    states[7] = PATCH.burning;
    states[11] = PATCH.unburnt;
    const seen = new Set<string>();
    run(effects, 3, 1 / 60, [{ states, burning: 2 }], middle(WEST), NOBODY, (_, n) => {
      for (let k = 0; k < n; k++) {
        const r = effects.records[k];
        // a flame adds light; the smoke and the rest are translucent
        if (r.alpha === 0) seen.add(`${r.position[0]},${r.position[1]}`);
      }
    });
    const patch = (k: number) => `${WEST.patches[k].x},${WEST.patches[k].y}`;
    expect([...seen].sort()).toEqual([patch(2), patch(7)].sort());
  });

  it('are emitted within their range of the camera, at the edge of it, and not past it', () => {
    const lone = view(WEST, 1);
    const p = WEST.patches[0];
    const flames = (distance: number) =>
      run(new Effects(FIRES, PEOPLE), 2, 1 / 60, [lone], [p.x + distance, p.y, p.z]).flames;
    expect(flames(FLAMES.range)).toBeGreaterThan(0);
    expect(flames(FLAMES.range + 0.01)).toBe(0);
    // the range is across the three dimensions: the same distance straight up
    const up = run(new Effects(FIRES, PEOPLE), 2, 1 / 60, [lone], [p.x, p.y, p.z + FLAMES.range + 0.01]).flames;
    expect(up).toBe(0);
  });

  it('have a range narrower than the smoke, so a fire seen from afar is smoke alone', () => {
    expect(FLAMES.range).toBeLessThan(SMOKE.range);
    const p = WEST.patches[0];
    const far = run(
      new Effects(FIRES, PEOPLE),
      2,
      1 / 60,
      [view(WEST, 1)],
      [p.x + (FLAMES.range + SMOKE.range) / 2, p.y, p.z],
    );
    expect(far.flames).toBe(0);
    expect(far.smoke).toBeGreaterThan(0);
  });
});

describe('the smoke', () => {
  it('is emitted within its range, at the edge of it, and not past it', () => {
    const p = WEST.patches[0];
    const smoke = (distance: number) =>
      run(new Effects(FIRES, PEOPLE), 5, 1 / 60, [view(WEST, 1)], [p.x + distance, p.y, p.z]).smoke;
    expect(smoke(SMOKE.range)).toBeGreaterThan(0);
    expect(smoke(SMOKE.range + 0.01)).toBe(0);
  });

  it('rises dark and fades to pale as it ages: one colour at the fire and a paler one for the top', () => {
    const effects = new Effects(FIRES, PEOPLE);
    let record: (typeof effects.records)[number] | undefined;
    run(effects, 2, 1 / 60, [view(WEST, 4)], middle(WEST), NOBODY, (_, n) => {
      for (let k = 0; k < n; k++)
        if (effects.records[k].alpha > 0 && !record)
          record = JSON.parse(JSON.stringify(effects.records[k])) as typeof record;
    });
    expect(record).toBeDefined();
    const [from, to] = [record!.colour, record!.fade!];
    expect(Math.max(...from)).toBeLessThan(Math.min(...to));
    // upward, and away: it drifts as it climbs
    expect(record!.velocity[2]).toBeGreaterThan(0);
    expect(Math.hypot(record!.velocity[0], record!.velocity[1])).toBeGreaterThan(0);
  });
});

describe('the flare', () => {
  it('rises only from a person waiting, and from none while they are winched or their level is going', () => {
    const person = PEOPLE[0];
    const at = (waiting: number[]) =>
      run(new Effects(FIRES, PEOPLE), 5, 1 / 60, [], [person.x, person.y, person.z], Uint8Array.from(waiting));
    // the camera is put over the first person, so only range could keep a flare out
    expect(at([1, 0, 0]).flares).toBeGreaterThan(0);
    expect(at([0, 0, 0]).flares).toBe(0);
    expect(at([0, 1, 1]).flares).toBe(0);
  });

  it('is told for each person by their level: waiting unless it is going or they are on the rope', () => {
    const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const out = new Uint8Array(3);
    expect(waitingFlares(people, null, null, out)).toBe(3);
    expect([...out]).toEqual([1, 1, 1]);
    expect(waitingFlares(people, 'b', null, out)).toBe(2);
    expect([...out]).toEqual([1, 0, 1]);
    expect(waitingFlares(people, null, 'c', out)).toBe(2);
    expect([...out]).toEqual([1, 1, 0]);
    // a level that is not about anyone takes no one away
    expect(waitingFlares(people, 'first-delivery', null, out)).toBe(3);
  });

  it('is counted for the test API as the flares that are lit, whether or not one is born this frame', () => {
    const effects = new Effects(FIRES, PEOPLE);
    effects.step(0, [], Uint8Array.of(1, 0, 1), FAR);
    expect(effects.flaring).toBe(2);
    effects.step(1 / 60, [], Uint8Array.of(0, 0, 0), FAR);
    expect(effects.flaring).toBe(0);
  });

  it('is cut off by the same range as the smoke', () => {
    const person = PEOPLE[0];
    const at = (d: number) =>
      run(new Effects(FIRES, PEOPLE), 5, 1 / 60, [], [person.x + d, person.y, person.z], Uint8Array.of(1, 0, 0)).flares;
    expect(at(FLARE.range - 1e-6)).toBeGreaterThan(0);
    expect(at(FLARE.range + 0.01)).toBe(0);
  });
});

describe('the spray', () => {
  const drop = (effects: Effects) => effects.drop(WEST.x, WEST.y, 80, 60);

  it('comes only after a drop, for its pour, and for no longer', () => {
    const quiet = new Effects(FIRES, PEOPLE);
    expect(run(quiet, 2, 1 / 60, [view(WEST, 10)], middle(WEST)).spray).toBe(0);
    const effects = new Effects(FIRES, PEOPLE);
    drop(effects);
    const during = run(effects, SPRAY.pour, 1 / 60, [view(WEST, 10)], middle(WEST)).spray;
    // the pour's spray and its mist, a particle each at most of a frame's share
    expect(during).toBeGreaterThan(0.95 * (SPRAY.rate + MIST.rate) * SPRAY.pour - 2);
    expect(during).toBeLessThan(1.05 * (SPRAY.rate + MIST.rate) * SPRAY.pour + 2);
    expect(run(effects, 2, 1 / 60, [view(WEST, 10)], middle(WEST)).spray).toBe(0);
  });

  it('pours from the bucket and misting where it lands, over the ground there', () => {
    const effects = new Effects(FIRES, PEOPLE);
    drop(effects);
    const wet: Emit[] = [];
    run(effects, 0.2, 1 / 60, [], middle(WEST), NOBODY, (_, n) => {
      for (let k = 0; k < n; k++)
        if (effects.records[k].gravity! >= 0.5 || effects.records[k].gravity! < 0) wet.push({ ...effects.records[k] });
    });
    const spray = wet.filter((r) => r.gravity! > 0);
    expect(spray.length).toBeGreaterThan(0);
    for (const r of spray) {
      expect(r.position).toEqual([WEST.x, WEST.y, 80]);
      expect(r.velocity[2]).toBeLessThan(0);
      expect(r.floor).toBe(60);
    }
    const mist = wet.filter((r) => r.gravity! < 0);
    expect(mist.length).toBeGreaterThan(0);
    for (const r of mist) expect(r.position[2]).toBeCloseTo(61, 6);
  });

  it('pours the whole of a drop even when the frames are long, and once for each drop told', () => {
    const effects = new Effects(FIRES, PEOPLE);
    drop(effects);
    effects.drop(WEST.x + 10, WEST.y, 80, 60);
    const total = run(effects, SPRAY.pour * 3, 1 / 2, [], middle(WEST)).spray;
    expect(total).toBeGreaterThan(1.9 * (SPRAY.rate + MIST.rate) * SPRAY.pour - 4);
    expect(total).toBeLessThan(2.1 * (SPRAY.rate + MIST.rate) * SPRAY.pour + 4);
  });

  it('keeps room for the drops told between two frames, and lets the oldest go past it', () => {
    const effects = new Effects(FIRES, PEOPLE);
    for (let k = 0; k < 50; k++) effects.drop(WEST.x, WEST.y, 80, 60);
    const total = run(effects, SPRAY.pour * 2, 1 / 60, [], middle(WEST)).spray;
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(10 * (SPRAY.rate + MIST.rate) * SPRAY.pour);
  });
});

describe('the budget', () => {
  /**
   * The worst the island can ask of the pool at once, as the model allows it: the going fire with every patch burning, the
   * other two at their start (only the going fire spreads past `lit`, which `checkFires` holds), all three people waiting
   * and a drop pouring. The pool is a ring, so what must fit is everything emitted over the longest life of any stream,
   * not what is alive at once: a particle is lost when the ring comes round to its slot again.
   */
  const patches = FIRES[0].patches.length;
  const lit = FIRES[0].lit;
  const slack = 0.05;
  const longestLife =
    Math.max(
      longest(FLAMES.core),
      longest(FLAMES.licks),
      longest(SMOKE),
      longest(FLARE),
      longest(SPRAY),
      longest(MIST),
    ) + slack;
  const flames = patches * (FLAMES.core.rate + FLAMES.licks.rate);
  const smokeOf = (burning: number) => SMOKE.perPatch * Math.min(burning, SMOKE.cap);
  const smoke = smokeOf(patches) + 2 * smokeOf(lit);
  const flares = 3 * FLARE.rate;
  const pour = (SPRAY.rate + MIST.rate) * SPRAY.pour;
  const window = (flames + smoke + flares) * longestLife + pour;

  it('has the pool and the renderer’s emitters said once', () => {
    expect(PARTICLES).toEqual({ capacity: 16384, emitters: 128 });
  });

  it('keeps everything emitted over the longest life within 90% of the pool, with the flames of one fire in range at a time', () => {
    // a camera cannot be within the flames' range of two fires: they are further apart than twice of it
    for (let a = 0; a < FIRES.length; a++)
      for (let b = a + 1; b < FIRES.length; b++)
        expect(Math.hypot(FIRES[a].x - FIRES[b].x, FIRES[a].y - FIRES[b].y)).toBeGreaterThan(2 * FLAMES.range);
    expect(window).toBeLessThanOrEqual(0.9 * PARTICLES.capacity);
    // a pour is within a life of each stream, so what it adds is all of it
    expect(SPRAY.pour).toBeLessThanOrEqual(Math.min(longest(SPRAY), longest(MIST)));
  });

  it('holds when played, by the renderer’s own rule for the live run of its ring, and the emitters in a frame', () => {
    for (const dt of [1 / 60, 1 / 30, 1 / 20]) {
      const effects = new Effects(FIRES, PEOPLE);
      const fires = [view(FIRES[0], patches), view(FIRES[1], FIRES[1].lit), view(FIRES[2], FIRES[2].lit)];
      // the camera over the going fire, which is within the smoke range of the others
      const camera = middle(FIRES[0]);
      // the renderer keeps every burst with the moment its last particle can have died, and the live run of the ring is
      // all that was emitted since the oldest burst not yet dead: this is that rule
      const bursts: { start: number; until: number }[] = [];
      let emitted = 0;
      let time = 0;
      let most = 0;
      let emitters = 0;
      const frames = Math.round(40 / dt);
      for (let f = 0; f < frames; f++) {
        if (f === Math.round(15 / dt)) effects.drop(FIRES[0].x, FIRES[0].y, 80, 60);
        const n = effects.step(dt, fires, Uint8Array.of(1, 1, 1), camera);
        emitters = Math.max(emitters, n);
        for (let k = 0; k < n; k++) {
          const r = effects.records[k];
          bursts.push({ start: emitted, until: time + r.life * (1 + (r.lifeSpread ?? 0)) + slack });
          emitted += r.count;
        }
        time += dt;
        while (bursts.length && bursts[0].until < time) bursts.shift();
        const run = bursts.length ? emitted - bursts[0].start : 0;
        if (time > 8) most = Math.max(most, run);
      }
      expect(most, `live run at ${dt}`).toBeLessThanOrEqual(0.9 * PARTICLES.capacity);
      expect(most, `live run at ${dt}`).toBeGreaterThan(0.6 * PARTICLES.capacity);
      expect(emitters, `emitters at ${dt}`).toBeLessThanOrEqual(PARTICLES.emitters);
    }
  });
});

describe('making nothing', () => {
  it('hands out the same records every frame, and the same list of them', () => {
    const effects = new Effects(FIRES, PEOPLE);
    const fires = [view(FIRES[0], 10), view(FIRES[1], 10), view(FIRES[2], 10)];
    const list = effects.records;
    const first = [...effects.records];
    const positions = first.map((r) => r.position);
    const colours = first.map((r) => r.colour);
    effects.drop(WEST.x, WEST.y, 80, 60);
    run(effects, 3, 1 / 60, fires, middle(WEST), Uint8Array.of(1, 1, 1));
    expect(effects.records).toBe(list);
    expect(effects.records).toHaveLength(first.length);
    effects.records.forEach((r, k) => {
      expect(r).toBe(first[k]);
      expect(r.position).toBe(positions[k]);
      expect(r.colour).toBe(colours[k]);
    });
  });

  it('has room for every source there can be in a frame, so what the renderer refuses is counted by the page', () => {
    const effects = new Effects(FIRES, PEOPLE);
    const sources = FIRES.reduce((n, f) => n + 3 * f.patches.length, 0) + PEOPLE.length + 8;
    expect(effects.records.length).toBeGreaterThanOrEqual(sources);
  });

  it('is the same every time: the same frames give the same records, with no chance in them', () => {
    const seen = () => {
      const effects = new Effects(FIRES, PEOPLE);
      const fires = [view(FIRES[0], 12), view(FIRES[1], 10), view(FIRES[2], 10)];
      const out: string[] = [];
      effects.drop(WEST.x, WEST.y, 80, 60);
      run(effects, 2, 1 / 60, fires, middle(WEST), Uint8Array.of(1, 1, 1), (_, n) => {
        for (let k = 0; k < n; k++) out.push(JSON.stringify(effects.records[k]));
      });
      return out;
    };
    const [a, b] = [seen(), seen()];
    expect(a.length).toBeGreaterThan(100);
    expect(a).toEqual(b);
  });
});

describe('the wash', () => {
  const effects = new Effects(FIRES, PEOPLE);
  const heli = (rotorSpeed: number) => ({ x: 10, y: -20, z: 40, rotorSpeed });

  it('is none while the rotor is idling, and the rotor’s air at its hub when it turns', () => {
    expect(effects.wash(heli(HELICOPTER.rotorIdle))).toEqual([]);
    const [wash] = effects.wash(heli(HELICOPTER.rotorFull));
    expect(wash.position).toEqual([10, -20, 40 + HELICOPTER.size.mastTop]);
    expect(wash.radius).toBe(HELICOPTER.size.rotorRadius);
    expect(wash.speed).toBeCloseTo(WASH.speed, 6);
    expect(wash.reach).toBe(DOWNWASH.depth);
  });

  it('blows harder as the rotor turns faster, as the trees feel it, and is one record written in place', () => {
    const a = effects.wash(heli(HELICOPTER.rotorFull));
    const half = effects.wash(heli(0.7 * HELICOPTER.rotorFull))[0].speed;
    const b = effects.wash(heli(HELICOPTER.rotorFull));
    expect(half).toBeLessThan(WASH.speed);
    expect(half).toBeGreaterThan(0);
    expect(b[0]).toBe(a[0]);
    expect(b).toBe(a);
  });
});
