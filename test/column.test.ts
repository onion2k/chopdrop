/**
 * The column of smoke over each burning fire, as the sprites the renderer is handed, headless: a pure function of the
 * game's time and the fires, so the same time gives the same puffs, drawn for every fire that burns and for none that is
 * out however far the camera is, rising from the treetops to well over the fire, bent away under the rotor's wash, and
 * within the renderer's sprite capacity. The renderer is not here: the browser tests look at what it draws.
 */
import { SPRITE_CAPACITY, SPRITE_STRIDE } from 'artshape-render/game/particles';
import { describe, expect, it } from 'vitest';
import { FIRES, TREE_KINDS, theIsland } from '../src/arena';
import { COLUMN, Column } from '../src/column';
import { washAt, type WashSource } from '../src/downwash';
import { SMOKE, type FireView } from '../src/effects';
import { PATCH } from '../src/fire';
import { HELICOPTER } from '../src/helicopter';
import { TREE_STRIDE } from '../src/island';
import { treeSize } from '../src/meshes';
import { windAt, type Wind } from '../src/wind';

const WEST = FIRES[0];
const NO_FIRE: FireView = { states: new Uint8Array(WEST.patches.length).fill(PATCH.out), burning: 0 };
/** A fire view with the first `burning` patches burning and the rest unburnt. */
function view(place: (typeof FIRES)[number], burning: number): FireView {
  const states = new Uint8Array(place.patches.length).fill(PATCH.unburnt);
  states.fill(PATCH.burning, 0, burning);
  return { states, burning };
}
const ALL = FIRES.map((f) => view(f, f.lit));
/** The puffs of one fire as the column wrote them: where, how big, what colour and how thick. */
interface Puff {
  x: number;
  y: number;
  z: number;
  size: number;
  colour: [number, number, number];
  alpha: number;
}
function puffsOf(column: Column, n: number): Puff[] {
  const d = column.data;
  return Array.from({ length: n }, (_, k) => ({
    x: d[k * SPRITE_STRIDE],
    y: d[k * SPRITE_STRIDE + 1],
    z: d[k * SPRITE_STRIDE + 2],
    size: d[k * SPRITE_STRIDE + 3],
    colour: [d[k * SPRITE_STRIDE + 4], d[k * SPRITE_STRIDE + 5], d[k * SPRITE_STRIDE + 6]],
    alpha: d[k * SPRITE_STRIDE + 7],
  }));
}
/** The tallest tree on the island, foot to top, which is what "from the treetops" is to be no higher than. */
const treetops = (() => {
  const { trees, treeCount } = theIsland();
  let most = 0;
  for (let t = 0; t < treeCount; t++)
    most = Math.max(most, treeSize(TREE_KINDS[trees[t * TREE_STRIDE]]).top * trees[t * TREE_STRIDE + 5]);
  return most;
})();
const fireZ = (p: (typeof FIRES)[number]) => p.patches[0].z;

describe('the column', () => {
  it('holds every burning fire’s puffs within the renderer’s sprites, and the sprite stride said once', () => {
    expect(SPRITE_STRIDE).toBe(8);
    const column = new Column(FIRES);
    expect(FIRES.length * COLUMN.puffs).toBeLessThanOrEqual(SPRITE_CAPACITY);
    expect(column.capacity).toBe(FIRES.length * COLUMN.puffs);
    expect(column.data.length).toBe(column.capacity * SPRITE_STRIDE);
    // more fires than the renderer has sprites for is refused by name, not drawn short
    const crowd = Array.from({ length: Math.floor(SPRITE_CAPACITY / COLUMN.puffs) + 1 }, () => FIRES[0]);
    expect(() => new Column(crowd)).toThrow(/sprites/);
  });

  it('draws the puffs of every burning fire, wherever the camera is, and none for a fire that is out', () => {
    const column = new Column(FIRES);
    expect(column.step(10, ALL)).toBe(3 * COLUMN.puffs);
    expect(column.step(10, [ALL[0], NO_FIRE, ALL[2]])).toBe(2 * COLUMN.puffs);
    expect(column.step(10, [NO_FIRE, NO_FIRE, NO_FIRE])).toBe(0);
    expect(column.step(10, [])).toBe(0);
    // a fire at its start is burning, plainly seen; one with a single patch burning is too
    expect(column.step(10, [view(WEST, 1), NO_FIRE, NO_FIRE])).toBe(COLUMN.puffs);
  });

  it('rises from the treetops to at least 60 m over the fire', () => {
    const column = new Column(FIRES);
    let low = Infinity,
      high = -Infinity;
    for (let t = 0; t < COLUMN.life; t += 0.25) {
      const n = column.step(t, [view(WEST, WEST.lit), NO_FIRE, NO_FIRE]);
      for (const p of puffsOf(column, n)) {
        low = Math.min(low, p.z - fireZ(WEST));
        high = Math.max(high, p.z - fireZ(WEST));
      }
    }
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThanOrEqual(treetops);
    expect(high).toBeGreaterThanOrEqual(60);
  });

  it('says the wind’s share of a puff’s drift once: 0.4 at the fire to 1.3 at the top, and a ragged top of up to 45%', () => {
    expect(COLUMN.wind).toEqual({ at: 0.4, top: 1.3 });
    expect(COLUMN.ragged).toBe(0.45);
    expect('drift' in COLUMN).toBe(false);
  });
  it('swells and pales as it climbs, from the smoke’s dark colour to its pale one', () => {
    const column = new Column(FIRES);
    const n = column.step(3, [view(WEST, WEST.lit), NO_FIRE, NO_FIRE]);
    const puffs = puffsOf(column, n).sort((a, b) => a.z - b.z);
    const [bottom, top] = [puffs[0], puffs[puffs.length - 1]];
    expect(top.size).toBeGreaterThan(2 * bottom.size);
    expect(bottom.size).toBeGreaterThanOrEqual(COLUMN.size.from * 0.99);
    expect(top.size).toBeLessThanOrEqual(COLUMN.size.to * 1.001);
    // the low end is the smoke's own colour, near enough, and the high end near its fade, and each channel in between
    for (let c = 0; c < 3; c++) {
      expect(bottom.colour[c]).toBeCloseTo(SMOKE.colour[c], 1);
      expect(top.colour[c]).toBeCloseTo(SMOKE.fade[c], 1);
    }
    expect(Math.max(...bottom.colour)).toBeLessThan(Math.min(...top.colour));
  });

  it('fades in over the first tenth of a puff’s climb and out over the last third, and is thicker for more of the fire burning, to a floor', () => {
    const column = new Column(FIRES);
    const alphas = (burning: number) => {
      const n = column.step(5, [view(WEST, burning), NO_FIRE, NO_FIRE]);
      return puffsOf(column, n).sort((a, b) => a.z - b.z);
    };
    const whole = alphas(WEST.patches.length);
    const peak = Math.max(...whole.map((p) => p.alpha));
    expect(peak).toBeCloseTo(COLUMN.alpha, 5);
    const climb = (p: Puff) => (p.z - fireZ(WEST) - COLUMN.from) / (COLUMN.rise - COLUMN.from);
    for (const p of whole) {
      const c = climb(p);
      if (c < COLUMN.fadeIn * 0.5) expect(p.alpha).toBeLessThan(peak * 0.75);
      if (c > 1 - COLUMN.fadeOut * 0.5) expect(p.alpha).toBeLessThan(peak * 0.75);
      // a puff that is to die short of the top fades out sooner, but never before its own last third of at least 55%
      if (c > COLUMN.fadeIn && c < (1 - COLUMN.ragged) * (1 - COLUMN.fadeOut)) expect(p.alpha).toBeCloseTo(peak, 5);
      expect(p.alpha).toBeLessThanOrEqual(peak + 1e-9);
      expect(p.alpha).toBeGreaterThanOrEqual(0);
    }
    // a fire at its start is plainly seen: not under the floor's share of a whole one, and a single patch is no thinner
    const most = (burning: number) => Math.max(...alphas(burning).map((p) => p.alpha));
    expect(most(WEST.lit)).toBeGreaterThanOrEqual(COLUMN.floor * COLUMN.alpha - 1e-9);
    expect(most(1)).toBeCloseTo(COLUMN.floor * COLUMN.alpha, 5);
    expect(most(WEST.patches.length)).toBeGreaterThan(most(1));
  });

  it('is the same for the same time, moves with time, and is a function of the time and the fires alone', () => {
    const [a, b] = [new Column(FIRES), new Column(FIRES)];
    // a goes through other times first: where it has been makes no difference
    a.step(1, ALL);
    a.step(77, ALL);
    const na = a.step(31.4, ALL);
    const nb = b.step(31.4, ALL);
    expect(na).toBe(nb);
    expect(Array.from(a.data.subarray(0, na * SPRITE_STRIDE))).toEqual(
      Array.from(b.data.subarray(0, nb * SPRITE_STRIDE)),
    );
    // paused: a frame of the same time draws it as it stands
    const first = Array.from(b.data.subarray(0, nb * SPRITE_STRIDE));
    b.step(31.4, ALL);
    expect(Array.from(b.data.subarray(0, nb * SPRITE_STRIDE))).toEqual(first);
    b.step(31.9, ALL);
    expect(Array.from(b.data.subarray(0, nb * SPRITE_STRIDE))).not.toEqual(first);
    // and it makes nothing: the same array each step
    const data = b.data;
    b.step(40, ALL);
    expect(b.data).toBe(data);
  });

  it('is bent away from under the hub where the rotor’s wash is on it, and not at all far from it', () => {
    const column = new Column(FIRES);
    const views = [view(WEST, WEST.lit), NO_FIRE, NO_FIRE];
    const plain = puffsOf(column, column.step(8, views));
    // a helicopter 10 m to the side of the fire's middle, its hub 40 m over the fire: the lower puffs are under it, and
    // those over it are not blown
    const source: WashSource = {
      x: WEST.x + 10,
      y: WEST.y,
      z: fireZ(WEST) + 40 - HELICOPTER.size.mastTop,
      rotorSpeed: HELICOPTER.rotorFull,
    };
    const hub = source.z + HELICOPTER.size.mastTop;
    const blown = puffsOf(column, column.step(8, views, source));
    let bent = 0,
      untouched = 0;
    const w = { x: 0, y: 0, down: 0 };
    plain.forEach((p, k) => {
      const q = blown[k];
      const moved = Math.hypot(q.x - p.x, q.y - p.y);
      washAt(source, p.x, p.y, p.z, w);
      if (p.z <= hub && (w.x !== 0 || w.y !== 0)) {
        bent++;
        expect(moved, `puff ${k}`).toBeGreaterThan(0);
        // away from under the hub: further from it than it was
        expect(Math.hypot(q.x - source.x, q.y - source.y)).toBeGreaterThan(
          Math.hypot(p.x - source.x, p.y - source.y) - 1e-6,
        );
      } else {
        untouched++;
        expect(moved, `puff ${k}`).toBe(0);
      }
      expect(q.z).toBe(p.z);
    });
    expect(bent).toBeGreaterThan(3);
    expect(untouched).toBeGreaterThan(3);
    // a rotor that idles blows nothing
    const idle = puffsOf(column, column.step(8, views, { ...source, rotorSpeed: HELICOPTER.rotorIdle }));
    expect(idle).toEqual(plain);
  });
});

/** How far from its fire each puff is, along the wind of `t` and across it, with how high it has climbed (0 to 1). */
function drift(column: Column, t: number, burning = WEST.lit) {
  const n = column.step(t, [view(WEST, burning), NO_FIRE, NO_FIRE]);
  return puffsOf(column, n).map((p) => ({
    x: p.x - WEST.x,
    y: p.y - WEST.y,
    climbed: (p.z - fireZ(WEST) - COLUMN.from) / (COLUMN.rise - COLUMN.from),
    alpha: p.alpha,
  }));
}

describe('the column in the wind', () => {
  const along = (d: { x: number; y: number }, w: Wind) => (d.x * w.x + d.y * w.y) / Math.hypot(w.x, w.y);

  it('carries each puff downwind, more as it rises: little at the fire and a long way at the top', () => {
    const column = new Column(FIRES);
    for (const t of [0, 31.4, 90, 200]) {
      const w = windAt(t, { x: 0, y: 0 });
      const puffs = drift(column, t).sort((a, b) => a.climbed - b.climbed);
      const third = Math.floor(puffs.length / 3);
      const mean = (xs: typeof puffs) => xs.reduce((n, d) => n + along(d, windAt(t, { x: 0, y: 0 })), 0) / xs.length;
      const [low, mid, high] = [puffs.slice(0, third), puffs.slice(third, 2 * third), puffs.slice(2 * third)];
      expect(mean(low), `t ${t}`).toBeGreaterThan(0);
      expect(mean(mid), `t ${t}`).toBeGreaterThan(mean(low));
      expect(mean(high), `t ${t}`).toBeGreaterThan(mean(mid));
      // the top of the column is well downwind of the fire: over a minute of a wind of 3 to 9 m/s, at least a hundred metres
      expect(Math.max(...puffs.map((d) => along(d, w)))).toBeGreaterThan(100);
      expect(Math.min(...puffs.map((d) => along(d, w)))).toBeGreaterThanOrEqual(0);
    }
  });

  it('carries a puff by the wind of the moment it rose through, half its age ago, times its climb’s share', () => {
    const column = new Column(FIRES);
    const t = 77.7;
    const out = { x: 0, y: 0 };
    for (const d of drift(column, t)) {
      const age = d.climbed * COLUMN.life;
      const w = windAt(t - age / 2, out);
      const share = COLUMN.wind.at + ((COLUMN.wind.top - COLUMN.wind.at) * d.climbed) / 2;
      expect(d.x).toBeCloseTo(w.x * age * share, 3);
      expect(d.y).toBeCloseTo(w.y * age * share, 3);
    }
  });

  it('bends and curls as the wind turns: the column over a fire at one time lies another way a half turn on', () => {
    const column = new Column(FIRES);
    const lean = (t: number) => {
      const puffs = drift(column, t).filter((d) => d.climbed > 0.8);
      return Math.atan2(
        puffs.reduce((n, d) => n + d.y, 0),
        puffs.reduce((n, d) => n + d.x, 0),
      );
    };
    // the wind at the time a puff rose through is what bends it, and it turns once round in 360 s: 180 s on is the other way
    const turned = Math.abs(Math.atan2(Math.sin(lean(220) - lean(40)), Math.cos(lean(220) - lean(40))));
    expect(turned).toBeGreaterThan(Math.PI * 0.6);
  });

  it('lets each puff die at a height of its own, up to 45% short of the top, so the top is ragged', () => {
    const column = new Column(FIRES);
    let band = 0,
      dead = 0,
      reached = 0,
      earliest = 1;
    for (let t = 0; t < 400; t += 1.7) {
      for (const d of drift(column, t)) {
        // a puff that has not begun, or is the faint start of its life, is not looked at
        if (d.climbed < 0.15) continue;
        if (d.alpha === 0) earliest = Math.min(earliest, d.climbed);
        // between 80% and 90% of the climb, a puff has died if its own top is under where it has got to: about two in three
        if (d.climbed >= 0.8 && d.climbed < 0.9) {
          band++;
          if (d.alpha === 0) dead++;
        }
        if (d.alpha > 0 && d.climbed > 0.95) reached++;
      }
    }
    expect(dead / band).toBeGreaterThan(0.5);
    expect(dead / band).toBeLessThan(0.85);
    // some reach the top, and none is gone before 55% of its climb
    expect(reached).toBeGreaterThan(0);
    expect(earliest).toBeGreaterThanOrEqual(1 - COLUMN.ragged - 0.02);
  });

  it('draws the same ragged tops on every run, from a hash of the puff and its round and never from chance', () => {
    const [a, b] = [new Column(FIRES), new Column(FIRES)];
    for (const t of [3, 50.5, 250]) expect(drift(a, t)).toEqual(drift(b, t));
    // a puff's round is a new puff: the same puff dies at another height the next time round
    const heights = new Set<number>();
    for (let round = 0; round < 12; round++) {
      // one puff, taken at the same phase each round
      const d = drift(a, round * COLUMN.life + 0.8 * COLUMN.life)[7];
      heights.add(d.alpha);
    }
    expect(heights.size).toBeGreaterThan(3);
  });

  it('stays as many puffs as it was: the dead are drawn at no thickness, not left out', () => {
    const column = new Column(FIRES);
    for (const t of [3, 50.5, 250]) expect(column.step(t, ALL)).toBe(3 * COLUMN.puffs);
  });
});
