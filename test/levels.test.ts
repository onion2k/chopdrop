/**
 * The levels as content: each one's pads held to what they are, so an island made again otherwise, or a pad's place
 * in the list moved, says so here and not as a level that wants the helicopter somewhere else. Each is held to what
 * makes it the level it is: over the water, over the range, up the mountain.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS, TREE_KINDS, theIsland } from '../src/arena';
import { HELICOPTER } from '../src/helicopter';
import { TREE_STRIDE } from '../src/island';
import { treeSize } from '../src/meshes';
import { RING, RINGS, type Ring } from '../src/mission';

const { pads, ground, lakes, trees, treeCount, bounds } = theIsland();
const apart = (a: number, b: number) => Math.hypot(pads[a].x - pads[b].x, pads[a].y - pads[b].y);
/** The pads of a level, by its id: where the parcel waits and where it is wanted. */
const padsOf = (id: string) =>
  LEVELS.find((level) => level.id === id)!.steps.map((step) => (step.kind === 'ring' ? -1 : step.pad));
/** Points along the straight way between two pads, `n` of them. */
function* along(a: number, b: number, n = 300) {
  for (let k = 0; k <= n; k++)
    yield [pads[a].x + ((pads[b].x - pads[a].x) * k) / n, pads[a].y + ((pads[b].y - pads[a].y) * k) / n];
}

describe('the levels', () => {
  it('are the deliveries and the ring trials, in order, each known by a name that is not its place in the list', () => {
    expect(LEVELS.map((level) => level.id)).toEqual([
      'first-delivery',
      'ring-trial',
      'over-the-water',
      'over-the-range',
      'up-the-valley',
      'mountain-drop',
    ]);
    expect(LEVELS.map((level) => level.name)).toEqual([
      'First delivery',
      'Ring trial',
      'Over the water',
      'Over the range',
      'Up the valley',
      'Mountain drop',
    ]);
    for (const level of LEVELS) {
      expect(level.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      if (level.kind === 'delivery') {
        expect(level.steps.map((step) => step.kind)).toEqual(['pickup', 'drop']);
        for (const step of level.steps)
          if (step.kind !== 'ring')
            expect(step.pad > 0 && step.pad < pads.length, `${level.id}: pad ${step.pad}`).toBe(true);
      } else {
        expect(level.kind).toBe('rings');
        expect(level.steps.every((step) => step.kind === 'ring')).toBe(true);
        expect(level.steps.length).toBeLessThanOrEqual(RINGS.capacity);
      }
    }
  });

  it('starts with the first delivery: from the meadow pad, 187 inland of home, to the hilltop pad 187 beyond it', () => {
    const [pickup, drop] = padsOf('first-delivery');
    expect([pads[pickup].site, pads[drop].site]).toEqual(['meadow', 'hilltop']);
    expect(apart(0, pickup)).toBeCloseTo(187, -1);
    expect(apart(pickup, drop)).toBeCloseTo(187, -1);
  });

  it('then goes over the water: from the river mouth to the lakeside pad, 646 away, across a lake', () => {
    const [pickup, drop] = padsOf('over-the-water');
    expect([pads[pickup].site, pads[drop].site]).toEqual(['rivermouth', 'lakeside']);
    expect(apart(pickup, drop)).toBeCloseTo(646, -1);
    // the share of the way over a lake's water, measured as 80 of it
    let wet = 0;
    for (const [x, y] of along(pickup, drop))
      if (lakes.some((lake) => ground.heightAt(x, y) < lake.level + 0.01 && Math.hypot(x - lake.x, y - lake.y) < 120))
        wet++;
    expect((wet / 300) * apart(pickup, drop)).toBeGreaterThan(60);
  });

  it('then over the range: from the northern meadow pad to the beach, 501 away, over peaks of more than 140', () => {
    const [pickup, drop] = padsOf('over-the-range');
    expect([pads[pickup].site, pads[drop].site]).toEqual(['meadow', 'beach']);
    expect(apart(pickup, drop)).toBeCloseTo(501, -1);
    let top = 0;
    for (const [x, y] of along(pickup, drop)) top = Math.max(top, ground.heightAt(x, y));
    expect(top).toBeGreaterThan(140);
  });

  it('and ends up the mountain: from the lakeside pad to the shoulder pad, 79 up', () => {
    const [pickup, drop] = padsOf('mountain-drop');
    expect([pads[pickup].site, pads[drop].site]).toEqual(['lakeside', 'shoulder']);
    expect(apart(pickup, drop)).toBeCloseTo(392, -1);
    expect(pads[drop].z).toBeGreaterThan(75);
  });
});

/** Every tree's foot, the height of its top above the sea, and how far its crown spreads, as drawn. */
const TREES = Array.from({ length: treeCount }, (_, t) => {
  const o = t * TREE_STRIDE;
  const size = treeSize(TREE_KINDS[trees[o]]);
  return {
    x: trees[o + 1],
    y: trees[o + 2],
    top: trees[o + 3] + size.top * trees[o + 5],
    spread: size.radius * trees[o + 5],
  };
});

/** The rings of a trial and the pad it starts from. */
function trial(id: string) {
  const level = LEVELS.find((l) => l.id === id)!;
  return { level, rings: level.steps as Ring[], start: pads[level.start ?? 0] };
}

/** The angle from one heading to another, in (−π, π]. */
const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

describe.each([
  ['ring-trial', 'lakeside', 6, 10],
  ['up-the-valley', 'meadow', 9, 8],
] as const)('the ring trial %s', (id, site, count, opening) => {
  const { level, rings, start } = trial(id);

  it(`starts on the ${site} pad, with ${count} rings, each an opening of ${opening}`, () => {
    expect(level.kind).toBe('rings');
    expect(start.site).toBe(site);
    // the first ring faces the way from the pad's middle, which the level says without building the island
    expect(rings[0].yaw).toBeCloseTo(Math.atan2(rings[0].y - start.y, rings[0].x - start.x), 9);
    expect(rings).toHaveLength(count);
    for (const ring of rings) expect(ring.opening).toBe(opening);
  });

  it('faces each ring the way from the one before, the first from its pad, and turns no more than 75 degrees', () => {
    rings.forEach((ring, k) => {
      const from = k ? rings[k - 1] : start;
      expect(ring.yaw, `ring ${k + 1}`).toBeCloseTo(Math.atan2(ring.y - from.y, ring.x - from.x), 6);
      if (k)
        expect(Math.abs(turn(rings[k - 1].yaw, ring.yaw)), `the turn into ring ${k + 1}`).toBeLessThanOrEqual(
          (75 * Math.PI) / 180,
        );
    });
    const first = Math.hypot(rings[0].x - start.x, rings[0].y - start.y);
    expect(first).toBeGreaterThanOrEqual(40);
    expect(first).toBeLessThanOrEqual(90);
  });

  it('keeps 8 of air under every ring, so nothing can be caught between a ring and the ground', () => {
    const outer = opening + RING.tube;
    rings.forEach((ring, k) => {
      for (let s = -outer; s <= outer; s += 0.5) {
        const x = ring.x - Math.sin(ring.yaw) * s,
          y = ring.y + Math.cos(ring.yaw) * s;
        expect(ring.z - outer - ground.heightAt(x, y), `ring ${k + 1}, ${s} across`).toBeGreaterThanOrEqual(8);
      }
    });
  });

  it('has no tree reaching into a ring, nor within 3 of its tube', () => {
    const outer = opening + RING.tube;
    rings.forEach((ring, k) => {
      for (const tree of TREES) {
        const along = (tree.x - ring.x) * Math.cos(ring.yaw) + (tree.y - ring.y) * Math.sin(ring.yaw);
        const across = Math.abs(-(tree.x - ring.x) * Math.sin(ring.yaw) + (tree.y - ring.y) * Math.cos(ring.yaw));
        const near = Math.abs(along) < tree.spread + 3 && across < outer + tree.spread + 3;
        expect(near && tree.top > ring.z - outer - 3, `ring ${k + 1}: a tree ${across.toFixed(0)} across`).toBe(false);
      }
    });
  });

  it('flies straight from each ring to the next with room for the rotor over the ground and the treetops', () => {
    for (let k = 1; k < rings.length; k++) {
      const [a, b] = [rings[k - 1], rings[k]];
      for (let s = 0; s <= 1; s += 0.02) {
        const x = a.x + (b.x - a.x) * s,
          y = a.y + (b.y - a.y) * s,
          z = a.z + (b.z - a.z) * s;
        let floor = ground.heightAt(x, y);
        for (const tree of TREES) if (Math.hypot(tree.x - x, tree.y - y) < 6) floor = Math.max(floor, tree.top);
        expect(z - floor, `ring ${k} to ${k + 1}`).toBeGreaterThanOrEqual(6 + HELICOPTER.size.rotorRadius);
      }
    }
  });

  it('stays inside the edge and under the ceiling', () => {
    for (const ring of rings) {
      expect(ring.x - bounds.minX).toBeGreaterThan(100);
      expect(bounds.maxX - ring.x).toBeGreaterThan(100);
      expect(ring.y - bounds.minY).toBeGreaterThan(100);
      expect(bounds.maxY - ring.y).toBeGreaterThan(100);
      expect(ring.z + opening + RING.tube).toBeLessThan(HELICOPTER.ceiling - 20);
    }
  });
});

describe('the valley', () => {
  it('climbs from under 40 to over 100, up river 4', () => {
    const { rings } = trial('up-the-valley');
    expect(rings[0].z).toBeLessThan(40);
    expect(rings[rings.length - 1].z).toBeGreaterThan(100);
  });
});
