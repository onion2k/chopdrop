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
import { DRIFT, SMOKE, type FireView } from '../src/effects';
import { PATCH } from '../src/fire';
import { HELICOPTER } from '../src/helicopter';
import { TREE_STRIDE } from '../src/island';
import { treeSize } from '../src/meshes';

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

  it('rises from the treetops to at least 60 m over the fire, over the fire and drifting downwind', () => {
    const column = new Column(FIRES);
    let low = Infinity,
      high = -Infinity,
      furthest = 0;
    const dx = Math.cos(DRIFT.yaw),
      dy = Math.sin(DRIFT.yaw);
    for (let t = 0; t < COLUMN.life; t += 0.25) {
      const n = column.step(t, [view(WEST, WEST.lit), NO_FIRE, NO_FIRE]);
      for (const p of puffsOf(column, n)) {
        low = Math.min(low, p.z - fireZ(WEST));
        high = Math.max(high, p.z - fireZ(WEST));
        // measured along the wind, from the fire
        furthest = Math.max(furthest, (p.x - WEST.x) * dx + (p.y - WEST.y) * dy);
        // and never far across it
        expect(Math.abs(-(p.x - WEST.x) * dy + (p.y - WEST.y) * dx)).toBeLessThan(1e-3 + 2);
      }
    }
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThanOrEqual(treetops);
    expect(high).toBeGreaterThanOrEqual(60);
    expect(furthest).toBeGreaterThan(0.9 * COLUMN.drift);
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
      if (c > COLUMN.fadeIn && c < 1 - COLUMN.fadeOut) expect(p.alpha).toBeCloseTo(peak, 5);
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
