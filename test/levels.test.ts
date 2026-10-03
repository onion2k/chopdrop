/**
 * The levels as content: each one's pads held to what they are, so an island made again otherwise, or a pad's place
 * in the list moved, says so here and not as a level that wants the helicopter somewhere else. Each is held to what
 * makes it the level it is: over the water, over the range, up the mountain.
 */
import { describe, expect, it } from 'vitest';
import { COLLECTIBLES, FIRES, LEVELS, PACKAGES, RESCUE_SPOTS, STRUCTURES, TREE_KINDS, theIsland } from '../src/arena';
import { PILOT } from '../src/autopilot';
import { HELICOPTER } from '../src/helicopter';
import { DROP } from '../src/water';
import { SEA, TREE_STRIDE } from '../src/island';
import { treeSize } from '../src/meshes';
import { RING, RINGS, crossed, type Gate, type Level, type Ring } from '../src/mission';
import { Solids, type Block } from '../src/solids';

const { pads, ground, lakes, trees, treeCount, bounds } = theIsland();
const apart = (a: number, b: number) => Math.hypot(pads[a].x - pads[b].x, pads[a].y - pads[b].y);
/** The pads of a level, by its id: where the parcel waits and where it is wanted. */
const padsOf = (id: string) =>
  LEVELS.find((level) => level.id === id)!.steps.map((step) => ('pad' in step ? step.pad : -1));
/** Points along the straight way between two pads, `n` of them. */
function* along(a: number, b: number, n = 300) {
  for (let k = 0; k <= n; k++)
    yield [pads[a].x + ((pads[b].x - pads[a].x) * k) / n, pads[a].y + ((pads[b].y - pads[a].y) * k) / n];
}

describe('the levels', () => {
  it('are the deliveries, the ring trials and the course, in order, each known by a name that is not its place in the list', () => {
    expect(LEVELS.map((level) => level.id)).toEqual([
      'first-delivery',
      'ring-trial',
      'over-the-water',
      'over-the-range',
      'up-the-valley',
      'mountain-drop',
      'under-and-between',
      'wood-rescue',
      'boat-rescue',
      'ledge-rescue',
      'west-lake-fire',
      'south-lake-fire',
      'north-wood-fire',
    ]);
    expect(LEVELS.map((level) => level.name)).toEqual([
      'First delivery',
      'Ring trial',
      'Over the water',
      'Over the range',
      'Up the valley',
      'Mountain drop',
      'Under and between',
      'Wood rescue',
      'Boat rescue',
      'Ledge rescue',
      'Fire by the west lake',
      'Fire by the south lake',
      'Fire in the northern wood',
    ]);
    for (const level of LEVELS) {
      expect(level.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      if (level.kind === 'delivery') {
        expect(level.steps.map((step) => step.kind)).toEqual(['pickup', 'drop']);
        for (const step of level.steps)
          if ('pad' in step) expect(step.pad > 0 && step.pad < pads.length, `${level.id}: pad ${step.pad}`).toBe(true);
      } else if (level.kind === 'rings') {
        expect(level.steps.every((step) => step.kind === 'ring')).toBe(true);
        expect(level.steps.length).toBeLessThanOrEqual(RINGS.capacity);
      } else if (level.kind === 'rescue') {
        // a person boarded by landing beside them or winched up, and then the home pad
        expect(['board', 'winch']).toContain(level.steps[0].kind);
        expect(level.steps.map((step) => step.kind)[1]).toBe('land');
        expect(level.steps).toHaveLength(2);
      } else if (level.kind === 'fire') {
        expect(level.steps.map((step) => step.kind)).toEqual(['douse', 'fire']);
      } else {
        expect(level.kind).toBe('course');
        expect(level.steps.at(-1)?.kind).toBe('land');
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

/**
 * The point each trial's first ring faces from, which the level says without building the island: the middle of the
 * pad beside it, where a player would come to it from. The trial no longer starts there, since it starts at its ring.
 */
const FROM: Record<string, { pad: number; x: number; y: number }> = {
  'ring-trial': { pad: 2, x: 201, y: -15 },
  'up-the-valley': { pad: 7, x: 69, y: 69 },
};

/** The rings of a trial and the point its first ring faces from. */
function trial(id: string) {
  const level = LEVELS.find((l) => l.id === id)!;
  return { level, rings: level.steps as Ring[], start: FROM[id] };
}

/** The angle from one heading to another, in (−π, π]. */
const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

describe.each([
  ['ring-trial', 'lakeside', 6, 10],
  ['up-the-valley', 'meadow', 9, 8],
] as const)('the ring trial %s', (id, site, count, opening) => {
  const { level, rings, start } = trial(id);

  it(`has its first ring face from the ${site} pad, with ${count} rings, each an opening of ${opening}`, () => {
    expect(level.kind).toBe('rings');
    expect(pads[start.pad].site).toBe(site);
    // the point is the pad's middle, said in the content so the levels can be read without building the island
    expect([start.x, start.y]).toEqual([pads[start.pad].x, pads[start.pad].y]);
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

/** The seven structures, in the order the island has them, each with the names its blocks go by when a rule says them. */
const SEVEN = [
  [
    'gorge-bridge',
    'the gorge bridge',
    ['the gorge bridge', "the gorge bridge's south abutment", "the gorge bridge's north abutment"],
  ],
  ['shoulder-towers', 'the shoulder towers', ["the shoulder towers' west tower", "the shoulder towers' east tower"]],
  [
    'west-bridge',
    'the west bridge',
    ['the west bridge', "the west bridge's west abutment", "the west bridge's east abutment"],
  ],
  ['southern-towers', 'the southern towers', ["the southern towers' south tower", "the southern towers' north tower"]],
  [
    'southeastern-towers',
    'the southeastern towers',
    ["the southeastern towers' west tower", "the southeastern towers' east tower"],
  ],
  ['lakeside-towers', 'the lakeside towers', ["the lakeside towers' south tower", "the lakeside towers' north tower"]],
  ['eastern-towers', 'the eastern towers', ["the eastern towers' south tower", "the eastern towers' north tower"]],
] as const;
const collectible = (id: string) => COLLECTIBLES.find((c) => c.id === id)!;
const BRIDGES = COLLECTIBLES.filter((c) => c.blocks[0].kind === 'deck');
const PAIRS = COLLECTIBLES.filter((c) => c.blocks[0].kind === 'tower');
const EDGE = 100;

/** The ground under a block's footprint, at its lowest and highest. */
const under = (b: Block) => {
  let lo = Infinity,
    hi = -Infinity;
  for (let a = -b.length / 2; a <= b.length / 2; a += 0.5)
    for (let w = -b.width / 2; w <= b.width / 2; w += 0.5) {
      const g = ground.heightAt(
        b.x + a * Math.cos(b.yaw) - w * Math.sin(b.yaw),
        b.y + a * Math.sin(b.yaw) + w * Math.cos(b.yaw),
      );
      [lo, hi] = [Math.min(lo, g), Math.max(hi, g)];
    }
  return { lo, hi };
};

/**
 * Whether (x, y) is water, by what the island knows of its water and not by the height of the ground there, which is
 * the surface of the water: in a lake's squares, in a square of the sea, or within a river's width of its run.
 */
const lakeSquares = new Set(theIsland().lakes.flatMap((lake) => Array.from(lake.squares)));
function wet(x: number, y: number): boolean {
  const { terrain, sea } = theIsland();
  const i = Math.floor((x - terrain.originX) / terrain.cell),
    j = Math.floor((y - terrain.originY) / terrain.cell);
  const square = j * (terrain.cols - 1) + i;
  if (lakeSquares.has(square) || sea[square] !== SEA.dry) return true;
  for (const river of theIsland().rivers)
    for (let k = 0; k < river.points.length; k += 4)
      if (Math.hypot(river.points[k] - x, river.points[k + 1] - y) < river.points[k + 3] + 1) return true;
  return false;
}

describe('what stands on the island', () => {
  it('is seven structures, each known by a name that is a name and never its place in the list, and their blocks named as a rule broken says them', () => {
    expect(COLLECTIBLES.map((c) => [c.id, c.name, c.blocks.map((b) => b.name)])).toEqual(
      SEVEN.map(([id, name, blocks]) => [id, name, blocks]),
    );
    for (const c of COLLECTIBLES) expect(c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(new Set(COLLECTIBLES.map((c) => c.id)).size).toBe(7);
    expect(new Set(COLLECTIBLES.map((c) => c.name)).size).toBe(7);
    // solid in every level: every block of all seven, the gorge bridge and the shoulder towers first as they were
    expect(STRUCTURES).toEqual(COLLECTIBLES.flatMap((c) => c.blocks));
  });

  it('says each opening as the words do: under a bridge, between a pair of towers', () => {
    expect(COLLECTIBLES.map((c) => c.opening.label)).toEqual([
      'under the bridge',
      'between the towers',
      'under the west bridge',
      'between the southern towers',
      'between the southeastern towers',
      'between the lakeside towers',
      'between the eastern towers',
    ]);
    for (const c of COLLECTIBLES) expect(c.opening.kind).toBe('gate');
    // only the shoulder towers' opening begins a level, so only it has flags
    expect(COLLECTIBLES.map((c) => c.opening.flags !== undefined)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('keeps the gorge bridge and the shoulder towers as they were, to the centimetre, so the course and its pictures are untouched', () => {
    const old = (
      name: string,
      kind: Block['kind'],
      x: number,
      y: number,
      z: number,
      yaw: number,
      l: number,
      w: number,
      h: number,
    ) => ({
      name,
      kind,
      x,
      y,
      z,
      yaw,
      length: l,
      width: w,
      height: h,
    });
    expect(collectible('gorge-bridge').blocks).toEqual([
      old('the gorge bridge', 'deck', -15.21, 335.67, 87.5, 2.2689, 46.5, 8, 2.7),
      old("the gorge bridge's south abutment", 'abutment', -5.01, 323.51, 77, 2.2689, 14.75, 10, 10.5),
      old("the gorge bridge's north abutment", 'abutment', -27.34, 350.13, 77, 2.2689, 8.75, 10, 10.5),
    ]);
    expect(collectible('shoulder-towers').blocks).toEqual([
      old("the shoulder towers' west tower", 'tower', -131.85, 230.33, 71.5, 1.1479, 6, 6, 38.5),
      old("the shoulder towers' east tower", 'tower', -108.15, 219.67, 71.5, 1.1479, 6, 6, 38.5),
    ]);
  });

  it('has no room under any deck too narrow for the helicopter to stand in, that an abutment does not fill', () => {
    const need = HELICOPTER.size.middle + HELICOPTER.size.rotorRadius;
    const inside = (b: Block, x: number, y: number) => {
      const along = (x - b.x) * Math.cos(b.yaw) + (y - b.y) * Math.sin(b.yaw);
      const across = -(x - b.x) * Math.sin(b.yaw) + (y - b.y) * Math.cos(b.yaw);
      return Math.abs(along) <= b.length / 2 + 1e-6 && Math.abs(across) <= b.width / 2 + 1e-6;
    };
    for (const { name, blocks } of BRIDGES) {
      const [bridge, ...ends] = blocks;
      let open = 0;
      for (let a = -bridge.length / 2; a <= bridge.length / 2; a += 0.5)
        for (let w = -bridge.width / 2; w <= bridge.width / 2; w += 0.5) {
          const x = bridge.x + a * Math.cos(bridge.yaw) - w * Math.sin(bridge.yaw),
            y = bridge.y + a * Math.sin(bridge.yaw) + w * Math.cos(bridge.yaw);
          if (ends.some((end) => inside(end, x, y))) continue;
          // the bank meets the deck where there is no room at all, to within the five centimetres the content is said to
          const room = bridge.z - ground.heightAt(x, y);
          expect(room <= 0.05 || room >= need, `${name}, ${a} along, ${w} across: room ${room.toFixed(2)}`).toBe(true);
          if (room > 0.05) open++;
        }
      // and there is open water under it to fly through
      expect(open, name).toBeGreaterThan(500);
    }
  });

  it('stands each abutment from below the bank up to the deck, as long as its end and a metre past each edge of the deck', () => {
    for (const { blocks } of BRIDGES) {
      const [bridge, ...ends] = blocks;
      expect(ends).toHaveLength(2);
      for (const end of ends) {
        expect(end.z, end.name).toBeLessThan(under(end).lo);
        expect(end.z + end.height, end.name).toBeCloseTo(bridge.z, 6);
        expect(end.width, end.name).toBe(bridge.width + 2);
        expect(end.yaw, end.name).toBe(bridge.yaw);
        // flush with the deck's end, which it fills from
        const along = (end.x - bridge.x) * Math.cos(bridge.yaw) + (end.y - bridge.y) * Math.sin(bridge.yaw);
        expect(Math.abs(along) + end.length / 2, end.name).toBeCloseTo(bridge.length / 2, 1);
      }
    }
  });

  it('rests each deck on both banks, 13 over the water where the river runs under it', () => {
    for (const { name, blocks, opening } of BRIDGES) {
      const [bridge] = blocks;
      // each end on the bank: the ground under its last metre as high as its underside
      for (const end of [-1, 1]) {
        const at = end * (bridge.length / 2 - 1);
        const g = ground.heightAt(bridge.x + at * Math.cos(bridge.yaw), bridge.y + at * Math.sin(bridge.yaw));
        expect(g, `${name}, the end ${end}`).toBeGreaterThanOrEqual(bridge.z);
      }
      expect(bridge.z - ground.heightAt(opening.x, opening.y), name).toBeCloseTo(13, 0);
      expect(bridge.height, name).toBe(2.7);
      expect(bridge.width, name).toBe(8);
    }
  });

  it("has each bridge's opening from the water to the deck, facing along the river, square to the deck, inside the abutments", () => {
    for (const { name, blocks, opening: g } of BRIDGES) {
      const [bridge, south, north] = blocks;
      expect(g.z + g.height / 2, name).toBeCloseTo(bridge.z, 6);
      expect(g.z - g.height / 2, name).toBeCloseTo(ground.heightAt(g.x, g.y), 0);
      expect(Math.cos(g.yaw - bridge.yaw), name).toBeCloseTo(0, 6);
      // the river under it, near its middle, and between the abutments' inner ends
      const along = (g.x - bridge.x) * Math.cos(bridge.yaw) + (g.y - bridge.y) * Math.sin(bridge.yaw);
      const [inner0, inner1] = [south, north]
        .map((end) => {
          const at = (end.x - bridge.x) * Math.cos(bridge.yaw) + (end.y - bridge.y) * Math.sin(bridge.yaw);
          return at - Math.sign(at) * (end.length / 2);
        })
        .sort((p, q) => p - q);
      expect(along - g.width / 2, name).toBeGreaterThanOrEqual(inner0);
      expect(along + g.width / 2, name).toBeLessThanOrEqual(inner1);
      expect(Math.abs(along) + g.width / 2, name).toBeLessThan(bridge.length / 2);
      // wide enough to fly under, about as wide as the gorge is at the helicopter's height
      expect(g.width, name).toBeGreaterThanOrEqual(20);
    }
  });

  it('stands each pair of towers 6 across and 38.5 tall, their inner faces 20 apart, the feet sunk into the ground and never floating', () => {
    for (const { name, blocks } of PAIRS) {
      const [a, b] = blocks;
      for (const tower of blocks) {
        expect([tower.length, tower.width, tower.height], tower.name).toEqual([6, 6, 38.5]);
        expect(tower.yaw, tower.name).toBe(a.yaw);
        const { lo } = under(tower);
        expect(tower.z, tower.name).toBeLessThan(lo);
        expect(lo - tower.z, tower.name).toBeLessThan(3);
      }
      expect(Math.hypot(a.x - b.x, a.y - b.y) - a.width, name).toBeCloseTo(20, 1);
      // side by side across the way they face, with the same tops
      const across = -(b.x - a.x) * Math.sin(a.yaw) + (b.y - a.y) * Math.cos(a.yaw);
      expect(Math.abs(across), name).toBeCloseTo(26, 1);
      expect(a.z + a.height, name).toBeCloseTo(b.z + b.height, 6);
    }
    // the shoulder towers' tops at 110
    expect(collectible('shoulder-towers').blocks[0].z + 38.5).toBeCloseTo(110, 6);
  });

  it("has each pair's opening in the gap between the inner faces, from the ground in it to the tops, facing as the towers do", () => {
    for (const { name, blocks, opening: g } of PAIRS) {
      const [a, b] = blocks;
      expect([g.x, g.y], name).toEqual([(a.x + b.x) / 2, (a.y + b.y) / 2]);
      expect(g.width, name).toBeCloseTo(20, 1);
      expect(g.yaw, name).toBe(a.yaw);
      expect(g.z + g.height / 2, name).toBeCloseTo(a.z + a.height, 6);
      expect(g.z - g.height / 2, name).toBeLessThanOrEqual(ground.heightAt(g.x, g.y));
      // from the ground in the gap, and not from far below it
      expect(ground.heightAt(g.x, g.y) - (g.z - g.height / 2), name).toBeLessThan(3);
    }
  });

  it('stands every tower on dry land: its footprint, 6 across, sampled every half metre, is in no lake, no sea and no river', () => {
    for (const { blocks } of PAIRS)
      for (const tower of blocks) {
        const wetAt: string[] = [];
        for (let a = -tower.length / 2; a <= tower.length / 2; a += 0.5)
          for (let w = -tower.width / 2; w <= tower.width / 2; w += 0.5) {
            const x = tower.x + a * Math.cos(tower.yaw) - w * Math.sin(tower.yaw),
              y = tower.y + a * Math.sin(tower.yaw) + w * Math.cos(tower.yaw);
            if (wet(x, y)) wetAt.push(`${a},${w}`);
          }
        expect(wetAt, tower.name).toEqual([]);
      }
  });

  it('has no tree in any structure: none within 8 of a tower, nor within 4 of a deck or an abutment', () => {
    for (const b of STRUCTURES) {
      const margin = b.kind === 'tower' ? 8 : 4;
      const inside = TREES.filter((t) => {
        const along = (t.x - b.x) * Math.cos(b.yaw) + (t.y - b.y) * Math.sin(b.yaw);
        const across = -(t.x - b.x) * Math.sin(b.yaw) + (t.y - b.y) * Math.cos(b.yaw);
        return Math.abs(along) <= b.length / 2 + margin && Math.abs(across) <= b.width / 2 + margin;
      });
      expect(inside, b.name).toEqual([]);
    }
  });

  it('keeps every block inside the edge and under the ceiling, and every structure at least 150 from every other', () => {
    for (const b of STRUCTURES) {
      expect(b.x - bounds.minX, b.name).toBeGreaterThan(EDGE);
      expect(bounds.maxX - b.x, b.name).toBeGreaterThan(EDGE);
      expect(b.y - bounds.minY, b.name).toBeGreaterThan(EDGE);
      expect(bounds.maxY - b.y, b.name).toBeGreaterThan(EDGE);
      expect(b.z + b.height, b.name).toBeLessThan(HELICOPTER.ceiling - 20);
    }
    COLLECTIBLES.forEach((a, i) =>
      COLLECTIBLES.slice(i + 1).forEach((b) =>
        expect(
          Math.hypot(a.opening.x - b.opening.x, a.opening.y - b.opening.y),
          `${a.id} and ${b.id}`,
        ).toBeGreaterThanOrEqual(150),
      ),
    );
  });

  it('stands where the search looked: the west bridge over the gorge west of the range, each pair near its site', () => {
    const at = (id: string) => collectible(id).opening;
    expect(Math.hypot(at('west-bridge').x + 282, at('west-bridge').y - 168)).toBeLessThan(5);
    // the water under it about 37, and the span about 42
    expect(ground.heightAt(at('west-bridge').x, at('west-bridge').y)).toBeCloseTo(37, 0);
    expect(collectible('west-bridge').blocks[0].length).toBeCloseTo(42, -1);
    for (const [id, x, y, near] of [
      ['eastern-towers', 300, 80, 10],
      ['southern-towers', -80, -280, 30],
      ['southeastern-towers', 45, -155, 70],
      // 0.62 of the way along the ring trial's leg from ring 1 (140, -10) to ring 2 (95, -40), where the pilot has room to line up
      ['lakeside-towers', 112.1, -28.6, 1],
    ] as const)
      expect(Math.hypot(at(id).x - x, at(id).y - y), id).toBeLessThan(near);
  });
});

/** A way a level is flown by, the helicopter's middle at each metre of it. */
interface Spot {
  x: number;
  y: number;
  z: number;
}
/** Metre by metre along a straight leg. */
function leg(a: Spot, b: Spot): Spot[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)));
  return Array.from({ length: n + 1 }, (_, k) => ({
    x: a.x + ((b.x - a.x) * k) / n,
    y: a.y + ((b.y - a.y) * k) / n,
    z: a.z + ((b.z - a.z) * k) / n,
  }));
}
/**
 * The legs a level is flown along, as the autopilot flies it: a delivery straight from its pickup pad to its drop at
 * its cruise, `PILOT.clear` over the highest ground still to come on the way and the pad it comes to, and a trial or
 * the course from step to step, at the height of the opening or the ring, and down to a pad it lands on.
 */
function waysOf(level: Level): { leg: string; spots: Spot[] }[] {
  const { middle } = HELICOPTER.size;
  if (level.kind === 'delivery') {
    const [from, to] = level.steps.map((s) => pads['pad' in s ? s.pad : 0]);
    const n = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
    const at = (k: number) => [from.x + ((to.x - from.x) * k) / n, from.y + ((to.y - from.y) * k) / n];
    const spots: Spot[] = [];
    let top = to.z;
    const tops: number[] = [];
    for (let k = n; k >= 0; k--) {
      top = Math.max(top, ground.heightAt(at(k)[0], at(k)[1]));
      tops[k] = Math.min(HELICOPTER.ceiling, top + PILOT.clear);
    }
    for (let k = 0; k <= n; k++) spots.push({ x: at(k)[0], y: at(k)[1], z: tops[k] + middle });
    return [{ leg: 'pickup to drop', spots }];
  }
  const marks = level.steps.map((s) =>
    s.kind === 'land' ? { x: pads[s.pad].x, y: pads[s.pad].y, z: pads[s.pad].z + middle + 1 } : (s as Spot),
  );
  return marks.slice(1).map((m, k) => ({ leg: `step ${k + 1} to ${k + 2}`, spots: leg(marks[k], m) }));
}

/** How a way meets a structure: how far its rotor's reach stays from the blocks, less than nothing inside one, and whether it crosses the opening, either way. */
function meets(solids: Solids, c: (typeof COLLECTIBLES)[number], spots: Spot[]) {
  let gap = Infinity,
    through = false,
    over = false;
  const back = { ...c.opening, yaw: c.opening.yaw + Math.PI };
  const top = c.blocks[0].z + c.blocks[0].height;
  spots.forEach((p, k) => {
    for (const b of c.blocks) gap = Math.min(gap, solids.gapTo(b, p.x, p.y, p.z - HELICOPTER.size.middle));
    if (k && (crossed(c.opening, spots[k - 1], p) || crossed(back, spots[k - 1], p))) through = true;
    if (k && c.blocks[0].kind === 'tower') {
      // over: across the plane of the opening above the tops
      const ax = Math.cos(c.opening.yaw),
        ay = Math.sin(c.opening.yaw);
      const before = (spots[k - 1].x - c.opening.x) * ax + (spots[k - 1].y - c.opening.y) * ay;
      const now = (p.x - c.opening.x) * ax + (p.y - c.opening.y) * ay;
      const across = Math.abs(-(p.x - c.opening.x) * ay + (p.y - c.opening.y) * ax);
      if (before * now <= 0 && across <= c.opening.width / 2 && p.z > top) over = true;
    }
  });
  return { gap, through, over };
}

describe('the ways the levels are flown by', () => {
  const solids = new Solids({ middle: HELICOPTER.size.middle, radius: HELICOPTER.size.rotorRadius }, STRUCTURES);

  it.each(LEVELS.map((l) => l.id))(
    'takes %s past every structure either clear of it by the rotor and 2, or through its opening',
    (id) => {
      const level = LEVELS.find((l) => l.id === id)!;
      for (const way of waysOf(level))
        for (const c of COLLECTIBLES) {
          // a course that begins in an opening or goes under one is flown through it by its own steps
          if (level.steps.includes(c.opening)) continue;
          const m = meets(solids, c, way.spots);
          expect(m.gap >= 2 || m.through, `${id}, ${way.leg}, ${c.id}: ${m.gap.toFixed(1)}`).toBe(true);
        }
    },
  );

  it('passes through the lakeside towers on the ring trial from ring 1 to ring 2, and the southern towers on the way over the water, and no other, the course going through its own two', () => {
    const through: string[] = [];
    for (const level of LEVELS)
      for (const way of waysOf(level))
        for (const c of COLLECTIBLES)
          if (!level.steps.includes(c.opening) && meets(solids, c, way.spots).through)
            through.push(`${level.id} ${way.leg} ${c.id}`);
    expect(through.sort()).toEqual(
      ['over-the-water pickup to drop southern-towers', 'ring-trial step 1 to 2 lakeside-towers'].sort(),
    );
  });

  it('passes the way over the water between the southern towers, its middle under their tops, and the towers the same 38.5 as the rest', () => {
    const [way] = waysOf(LEVELS.find((l) => l.id === 'over-the-water')!);
    const southern = collectible('southern-towers');
    const m = meets(solids, southern, way.spots);
    expect(m.through).toBe(true);
    expect(m.over).toBe(false);
    // at the plane of the opening the way is at least 0.3 under the tops
    const at = way.spots.reduce((best, p) =>
      Math.hypot(p.x - southern.opening.x, p.y - southern.opening.y) <
      Math.hypot(best.x - southern.opening.x, best.y - southern.opening.y)
        ? p
        : best,
    );
    expect(southern.blocks[0].z + southern.blocks[0].height - at.z).toBeGreaterThan(0.3);
    for (const c of PAIRS) expect(c.blocks[0].height, c.id).toBe(38.5);
  });

  it('turns each pair on a way so that the way passes through its gap: its middle on the way, facing along it, the pair 150 clear of the rest', () => {
    // the ring trial's leg from ring 1 to ring 2
    const trialRings = trial('ring-trial').rings;
    const lines: [string, Spot, Spot][] = [
      ['lakeside-towers', trialRings[0], trialRings[1]],
      ['southern-towers', pads[3], pads[2]],
    ];
    for (const [id, a, b] of lines) {
      const { opening } = collectible(id);
      const heading = Math.atan2(b.y - a.y, b.x - a.x);
      expect(turn(opening.yaw, heading), id).toBeCloseTo(0, 3);
      // its middle on the line, between the two ends of it
      const off = -(opening.x - a.x) * Math.sin(heading) + (opening.y - a.y) * Math.cos(heading);
      const along =
        ((opening.x - a.x) * (b.x - a.x) + (opening.y - a.y) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y) ** 2;
      expect(Math.abs(off), id).toBeLessThan(0.05);
      expect(along, id).toBeGreaterThan(0);
      expect(along, id).toBeLessThan(1);
    }
  });

  it('faces each pair that no way passes across the slope it stands on, 20 clear of every way', () => {
    for (const id of ['southeastern-towers', 'eastern-towers']) {
      const c = collectible(id);
      // the ground's steepest rise over 60 about it, a plane fitted by least squares over the grid of 3
      let sxx = 0,
        syy = 0,
        sxh = 0,
        syh = 0;
      for (let a = -30; a <= 30; a += 3)
        for (let b = -30; b <= 30; b += 3) {
          const h = ground.heightAt(c.opening.x + a, c.opening.y + b);
          sxx += a * a;
          syy += b * b;
          sxh += a * h;
          syh += b * h;
        }
      const [gx, gy] = [sxh / sxx, syh / syy];
      expect(Math.hypot(gx, gy), `${id}: a slope`).toBeGreaterThan(0.03);
      // its opening faces along the contour: square to the way up
      expect(Math.cos(c.opening.yaw - Math.atan2(gy, gx)), id).toBeCloseTo(0, 3);
      for (const level of LEVELS)
        for (const way of waysOf(level))
          expect(meets(solids, c, way.spots).gap, `${id}, ${level.id} ${way.leg}`).toBeGreaterThanOrEqual(20);
    }
  });
});

/** The pad the course lands on, which its opening between the towers faces from. */
const SHOULDER = 6;

describe('the course', () => {
  const level = LEVELS.find((l) => l.id === 'under-and-between')!;
  const [between, under, ...rest] = level.steps;
  const rings = rest.filter((s): s is Ring => s.kind === 'ring');
  const [bridge] = collectible('gorge-bridge').blocks;
  const [west, east] = collectible('shoulder-towers').blocks;

  it('is begun between the towers, goes under the bridge, through three rings, and lands back on the shoulder pad', () => {
    expect(pads[SHOULDER].site).toBe('shoulder');
    expect(level.steps.map((s) => (s.kind === 'gate' ? s.label : s.kind))).toEqual([
      'between the towers',
      'under the bridge',
      'ring',
      'ring',
      'ring',
      'land',
    ]);
    expect(level.steps.at(-1)).toEqual({ kind: 'land', pad: SHOULDER });
  });

  it('has its two openings as they were, to the centimetre: those of the shoulder towers and the gorge bridge, which collect it', () => {
    expect(between).toEqual({
      kind: 'gate',
      x: -120,
      y: 225,
      z: 91,
      yaw: 1.1479,
      width: 19.987027532982683,
      height: 38,
      label: 'between the towers',
      flags: [
        { x: -131.85, y: 230.33, z: 110 },
        { x: -108.15, y: 219.67, z: 110 },
      ],
    });
    expect(under).toEqual({
      kind: 'gate',
      x: -16.5,
      y: 337.2,
      z: 81,
      yaw: 0.6981036732051034,
      width: 20,
      height: 13,
      label: 'under the bridge',
    });
    expect(between).toBe(collectible('shoulder-towers').opening);
    expect(under).toBe(collectible('gorge-bridge').opening);
  });

  it('has its opening between the towers in the gap between their inner faces, from the ground to their tops', () => {
    const g = between as Gate;
    expect([g.x, g.y]).toEqual([(west.x + east.x) / 2, (west.y + east.y) / 2]);
    expect(g.width).toBeCloseTo(20, 1);
    expect(g.z + g.height / 2).toBeCloseTo(west.z + west.height, 6);
    expect(g.z - g.height / 2).toBeLessThanOrEqual(ground.heightAt(g.x, g.y));
    // facing the way from the shoulder pad, which it is flown from and back down to
    const pad = pads[SHOULDER];
    expect(g.yaw).toBeCloseTo(Math.atan2(g.y - pad.y, g.x - pad.x), 3);
  });

  it('stands a flag on the top middle of each tower to mark its start, and no other opening has one', () => {
    expect((between as Gate).flags).toEqual([
      { x: west.x, y: west.y, z: west.z + west.height },
      { x: east.x, y: east.y, z: east.z + east.height },
    ]);
    expect((under as Gate).flags).toBeUndefined();
  });

  it('has its opening under the bridge from the water to the deck, facing up the gorge, square to the deck', () => {
    const g = under as Gate;
    expect(g.z + g.height / 2).toBeCloseTo(bridge.z, 6);
    expect(g.z - g.height / 2).toBeCloseTo(ground.heightAt(g.x, g.y), 0);
    expect(Math.cos(g.yaw - bridge.yaw)).toBeCloseTo(0, 6);
    // the river under it, near its middle
    const along = (g.x - bridge.x) * Math.cos(bridge.yaw) + (g.y - bridge.y) * Math.sin(bridge.yaw);
    expect(Math.abs(along)).toBeLessThan(bridge.length / 2 - g.width / 2);
  });

  it("keeps its rings to the trials' rules: clear of the trees, 8 of air under each, and each facing the way from the step before", () => {
    const outer = 8 + RING.tube;
    rings.forEach((ring, k) => {
      const from = k ? rings[k - 1] : (under as Gate);
      expect(ring.yaw).toBeCloseTo(Math.atan2(ring.y - from.y, ring.x - from.x), 9);
      for (let s = -outer; s <= outer; s += 0.5)
        expect(
          ring.z - outer - ground.heightAt(ring.x - Math.sin(ring.yaw) * s, ring.y + Math.cos(ring.yaw) * s),
        ).toBeGreaterThanOrEqual(8);
      for (const tree of TREES) {
        const along = (tree.x - ring.x) * Math.cos(ring.yaw) + (tree.y - ring.y) * Math.sin(ring.yaw);
        const across = Math.abs(-(tree.x - ring.x) * Math.sin(ring.yaw) + (tree.y - ring.y) * Math.cos(ring.yaw));
        const near = Math.abs(along) < tree.spread + 3 && across < outer + tree.spread + 3;
        expect(near && tree.top > ring.z - outer - 3, `ring ${k + 1}`).toBe(false);
      }
    });
  });
});

describe('every ring', () => {
  it('can be flown straight into at its height: its way in, 35 back along its axis, clear by the rotor and 2', () => {
    for (const level of LEVELS)
      level.steps.forEach((ring, k) => {
        if (ring.kind !== 'ring') return;
        for (let back = 0; back <= 35; back += 1) {
          const x = ring.x - Math.cos(ring.yaw) * back,
            y = ring.y - Math.sin(ring.yaw) * back;
          let floor = ground.heightAt(x, y);
          for (const tree of TREES) if (Math.hypot(tree.x - x, tree.y - y) < 6) floor = Math.max(floor, tree.top);
          expect(ring.z - floor, `${level.id}, step ${k + 1}, ${back} back`).toBeGreaterThanOrEqual(
            HELICOPTER.size.rotorRadius + 2,
          );
        }
      });
  });

  it('keeps its tube and its way in clear of every structure by the rotor and 2, so no structure stands in a ring or on the way to one', () => {
    const solids = new Solids({ middle: HELICOPTER.size.middle, radius: HELICOPTER.size.rotorRadius }, STRUCTURES);
    for (const level of LEVELS)
      level.steps.forEach((ring, k) => {
        if (ring.kind !== 'ring') return;
        const line = ring.opening + RING.tube;
        for (const b of STRUCTURES) {
          for (let t = 0; t < 360; t += 5) {
            const a = (t * Math.PI) / 180;
            const x = ring.x - Math.sin(ring.yaw) * Math.cos(a) * line,
              y = ring.y + Math.cos(ring.yaw) * Math.cos(a) * line,
              z = ring.z + Math.sin(a) * line;
            expect(
              solids.gapTo(b, x, y, z - HELICOPTER.size.middle),
              `${level.id}, step ${k + 1}, tube at ${t}, ${b.name}`,
            ).toBeGreaterThanOrEqual(2 + RING.tube);
          }
          for (let back = 0; back <= 35; back += 1)
            expect(
              solids.gapTo(
                b,
                ring.x - Math.cos(ring.yaw) * back,
                ring.y - Math.sin(ring.yaw) * back,
                ring.z - HELICOPTER.size.middle,
              ),
              `${level.id}, step ${k + 1}, ${back} back, ${b.name}`,
            ).toBeGreaterThanOrEqual(2);
        }
      });
  });
});

describe('where a level begins', () => {
  it('is its first step, and no level names a start pad of its own', () => {
    for (const level of LEVELS) expect('start' in level, level.id).toBe(false);
  });

  it('is a pickup for a delivery, and a ring or an opening for the trials and the course, a person for a rescue', () => {
    for (const level of LEVELS)
      expect(level.steps[0].kind, level.id).toBe(
        level.kind === 'delivery'
          ? 'pickup'
          : level.kind === 'rings'
            ? 'ring'
            : level.kind === 'rescue'
              ? RESCUE_SPOTS.find((s) => s.id === level.id)!.by === 'land'
                ? 'board'
                : 'winch'
              : level.kind === 'fire'
                ? 'douse'
                : 'gate',
      );
  });

  it('is a pad of its own for each of the four deliveries: 4, 3, 7 and 2, so that no two begin from one', () => {
    const pickups = LEVELS.flatMap((level) => (level.steps[0].kind === 'pickup' ? [level.steps[0].pad] : []));
    expect(pickups).toEqual([4, 3, 7, 2]);
    expect(new Set(pickups).size).toBe(4);
  });
});

/**
 * How many trees' feet a wood must have within 30 of a package, said once. Twelve was asked for first; eight is what
 * ten places inland could keep.
 */
const WOOD = 8;

/**
 * How far apart packages must be. It is not 150: with the places inland, 150 left nine, and ten fit only at 140.
 */
const SPACING = 140;

/** How far above the sea a package's ground must be: inland, and not a beach. */
const INLAND = 5;

/** How far (x, y) is from a block's footprint, which is nothing inside it. */
function fromBlock(b: Block, x: number, y: number): number {
  const along = (x - b.x) * Math.cos(b.yaw) + (y - b.y) * Math.sin(b.yaw);
  const across = -(x - b.x) * Math.sin(b.yaw) + (y - b.y) * Math.cos(b.yaw);
  return Math.hypot(Math.max(Math.abs(along) - b.length / 2, 0), Math.max(Math.abs(across) - b.width / 2, 0));
}

describe('the hidden packages', () => {
  const apartBy = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  it('are ten, each known by a name that is kebab-case, unique, and no level its own nor structure its own', () => {
    expect(PACKAGES).toHaveLength(10);
    const ids = PACKAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(10);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    // a rescue spot's id is its level's, by design, so levels are not among what it must not share
    const taken = new Set([...COLLECTIBLES.map((c) => c.id)]);
    for (const id of ids) expect(taken.has(id), id).toBe(false);
  });

  it('stand on dry land: in no lake, no sea and no river', () => {
    for (const p of PACKAGES) expect(wet(p.x, p.y), p.id).toBe(false);
  });

  it(`stand inland: the ground ${INLAND} or more above the sea`, () => {
    for (const p of PACKAGES) expect(p.z, p.id).toBeGreaterThanOrEqual(INLAND);
  });

  it('have z equal to the ground there, within 0.05', () => {
    for (const p of PACKAGES) expect(Math.abs(p.z - ground.heightAt(p.x, p.y)), p.id).toBeLessThanOrEqual(0.05);
  });

  it('have a clearing to land in: the ground within 1.5 over 12 square, sampled every 3, and no tree foot within 6', () => {
    for (const p of PACKAGES) {
      let lo = Infinity,
        hi = -Infinity;
      for (let a = -6; a <= 6; a += 3)
        for (let b = -6; b <= 6; b += 3) {
          const h = ground.heightAt(p.x + a, p.y + b);
          [lo, hi] = [Math.min(lo, h), Math.max(hi, h)];
          expect(wet(p.x + a, p.y + b), `${p.id} at ${a},${b}`).toBe(false);
        }
      expect(hi - lo, p.id).toBeLessThanOrEqual(1.5);
      const near = TREES.filter((t) => apartBy(t, p) < 6);
      expect(near, p.id).toEqual([]);
    }
  });

  it(`stand in a wood: ${WOOD} or more trees' feet within 30`, () => {
    for (const p of PACKAGES)
      expect(TREES.filter((t) => apartBy(t, p) <= 30).length, p.id).toBeGreaterThanOrEqual(WOOD);
  });

  it('keep 120 from every pad and 60 from every structure block', () => {
    for (const p of PACKAGES) {
      for (const pad of pads) expect(apartBy(p, pad), `${p.id} and a pad`).toBeGreaterThanOrEqual(120);
      for (const b of STRUCTURES) expect(fromBlock(b, p.x, p.y), `${p.id} and ${b.name}`).toBeGreaterThanOrEqual(60);
    }
  });

  it(`keep ${SPACING} from each other`, () => {
    PACKAGES.forEach((a, i) =>
      PACKAGES.slice(i + 1).forEach((b) =>
        expect(apartBy(a, b), `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(SPACING),
      ),
    );
  });

  it("stand inside the bounds the helicopter's middle is kept to, with room to land", () => {
    const r = HELICOPTER.reach;
    for (const p of PACKAGES) {
      expect(p.x, p.id).toBeGreaterThan(bounds.minX + r);
      expect(p.x, p.id).toBeLessThan(bounds.maxX - r);
      expect(p.y, p.id).toBeGreaterThan(bounds.minY + r);
      expect(p.y, p.id).toBeLessThan(bounds.maxY - r);
    }
  });
});

/** The rules a rescue spot keeps, each said once. */
const SPOT = {
  /** The ground within this over a patch, and the patch's side and the step it is sampled at. */
  level: 2,
  patch: 10,
  sample: 2.5,
  /** No tree's foot within this, so the rotor has room overhead in the winch's window. */
  clear: 8,
  /** How far from every pad, every structure's blocks, and every package; the ledge's gap from a package is less. */
  pad: 120,
  structure: 60,
  package: 100,
  /** No ledge 60 up keeps 100 from a package: the highest that does is 56, and the nearest one 60 up is 80 away. */
  ledgePackage: 75,
  apart: 150,
  /** The wood's trees' feet within 30, and the ledge's least. */
  wood: 8,
  woodReach: 30,
  ledge: 60,
  /** The boat: on the sea, this near the shore and no nearer, this far from every fire, and this far from every other level's way. */
  shoreNear: 40,
  shoreFar: 120,
  fire: 150,
  way: 40,
  /** The winch's window: the helicopter hovers this far over the ground, and its column is this far round the spot. */
  low: 5,
  high: 15,
  column: 5,
};

describe('the rescue spots', () => {
  const apartBy = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const spot = (id: string) => RESCUE_SPOTS.find((s) => s.id === id)!;
  const wood = () => RESCUE_SPOTS.filter((s) => s.id.startsWith('wood'));

  /** The spots that stand on land, which the rules of dry ground are for; the boat stands on the sea. */
  const dry = RESCUE_SPOTS.filter((s) => s.id !== 'boat-rescue');

  it('say where each is, as the words say it', () => {
    expect(RESCUE_SPOTS.map((s) => s.where)).toEqual([
      'in the western wood',
      'off the east beach',
      'on the southern ledge',
    ]);
    // each by where it stands: the wood is west of home, the boat east, the ledge south
    expect(spot('wood-rescue').x).toBeLessThan(-300);
    expect(spot('boat-rescue').x).toBeGreaterThan(300);
    expect(spot('ledge-rescue').y).toBeLessThan(-300);
  });

  it('say how each is done: the walker by landing beside them, the boat and the ledge by the winch', () => {
    expect(RESCUE_SPOTS.map((s) => [s.id, s.by])).toEqual([
      ['wood-rescue', 'land'],
      ['boat-rescue', 'winch'],
      ['ledge-rescue', 'winch'],
    ]);
  });

  it('are three, one of each kind, each known by a name that is kebab-case, unique, and no other thing its own', () => {
    expect(RESCUE_SPOTS.map((s) => s.id)).toEqual(['wood-rescue', 'boat-rescue', 'ledge-rescue']);
    expect(RESCUE_SPOTS.map((s) => s.who)).toEqual(['the walker', 'the sailor', 'the climber']);
    expect(RESCUE_SPOTS.map((s) => s.name)).toEqual(['Wood rescue', 'Boat rescue', 'Ledge rescue']);
    // the beach rescue is retired, and a save's time for it is kept as any id the game does not know is
    expect(RESCUE_SPOTS.some((s) => s.id === 'beach-rescue')).toBe(false);
    expect(LEVELS.some((l) => l.id === 'beach-rescue')).toBe(false);
    for (const s of RESCUE_SPOTS) expect(s.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    // a rescue spot's id is its level's, by design, so levels are not among what it must not share
    const taken = new Set([...COLLECTIBLES.map((c) => c.id), ...PACKAGES.map((p) => p.id)]);
    for (const s of RESCUE_SPOTS) expect(taken.has(s.id), s.id).toBe(false);
    expect(wood()).toHaveLength(1);
  });

  it('stand on dry land, but for the boat: in no lake, no sea and no river', () => {
    expect(dry).toHaveLength(2);
    for (const s of dry) expect(wet(s.x, s.y), s.id).toBe(false);
  });

  it(`have z equal to the ground there, within 0.05, which for the boat is the sea's surface`, () => {
    for (const s of RESCUE_SPOTS) expect(Math.abs(s.z - ground.heightAt(s.x, s.y)), s.id).toBeLessThanOrEqual(0.05);
    expect(spot('boat-rescue').z).toBe(theIsland().seaLevel);
  });

  it(`give the boat a yaw, a number, which only a boat has`, () => {
    expect(Number.isFinite(spot('boat-rescue').yaw)).toBe(true);
    expect(dry.filter((s) => s.yaw !== undefined)).toEqual([]);
  });

  it(`put the boat on the sea, ${SPOT.shoreNear} to ${SPOT.shoreFar} from the shore, and over the sea at every metre of the boat's length round it`, () => {
    const boat = spot('boat-rescue');
    const { terrain, sea } = theIsland();
    const across = terrain.cols - 1;
    const square = (x: number, y: number) =>
      Math.floor((y - terrain.originY) / terrain.cell) * across + Math.floor((x - terrain.originX) / terrain.cell);
    expect(sea[square(boat.x, boat.y)]).not.toBe(SEA.dry);
    expect(lakes.some((l) => l.squares.includes(square(boat.x, boat.y)))).toBe(false);
    // from the nearest dry square, as the squares' own rectangles say it
    let shore = Infinity;
    for (let sq = 0; sq < sea.length; sq++) {
      if (sea[sq] !== SEA.dry) continue;
      const x0 = terrain.originX + (sq % across) * terrain.cell,
        y0 = terrain.originY + Math.floor(sq / across) * terrain.cell;
      shore = Math.min(
        shore,
        Math.hypot(
          Math.max(x0 - boat.x, 0, boat.x - x0 - terrain.cell),
          Math.max(y0 - boat.y, 0, boat.y - y0 - terrain.cell),
        ),
      );
    }
    expect(shore).toBeGreaterThanOrEqual(SPOT.shoreNear);
    expect(shore).toBeLessThanOrEqual(SPOT.shoreFar);
    for (let a = -3; a <= 3; a += 1.5)
      for (let b = -3; b <= 3; b += 1.5) expect(sea[square(boat.x + a, boat.y + b)], `${a},${b}`).not.toBe(SEA.dry);
  });

  it(`keep the boat ${SPOT.fire} from every fire, ${SPOT.way} from every other level's way, and away from the others by ${SPOT.apart}`, () => {
    const boat = spot('boat-rescue');
    for (const f of FIRES) expect(apartBy(boat, f), f.id).toBeGreaterThanOrEqual(SPOT.fire);
    for (const level of LEVELS) {
      if (level.kind === 'fire' || level.id === 'boat-rescue') continue;
      for (const way of waysOf(level))
        for (const p of way.spots)
          if (apartBy(boat, p) < SPOT.way)
            throw new Error(`${level.id}, ${way.leg}, is ${apartBy(boat, p).toFixed(1)} from the boat`);
    }
  });

  it(`are level: the ground within ${SPOT.level} over ${SPOT.patch} square, sampled every ${SPOT.sample}, all dry`, () => {
    const h = SPOT.patch / 2;
    for (const s of dry) {
      let lo = Infinity,
        hi = -Infinity;
      for (let a = -h; a <= h; a += SPOT.sample)
        for (let b = -h; b <= h; b += SPOT.sample) {
          const g = ground.heightAt(s.x + a, s.y + b);
          [lo, hi] = [Math.min(lo, g), Math.max(hi, g)];
          expect(wet(s.x + a, s.y + b), `${s.id} at ${a},${b}`).toBe(false);
        }
      expect(hi - lo, s.id).toBeLessThanOrEqual(SPOT.level);
    }
  });

  it(`have no tree's foot within ${SPOT.clear}`, () => {
    for (const s of dry)
      expect(
        TREES.filter((t) => apartBy(t, s) < SPOT.clear),
        s.id,
      ).toEqual([]);
  });

  it(`keep each kind's own rule: ${SPOT.wood} or more trees' feet within ${SPOT.woodReach} of the walker, and the climber ${SPOT.ledge} up or more`, () => {
    expect(TREES.filter((t) => apartBy(t, spot('wood-rescue')) <= SPOT.woodReach).length).toBeGreaterThanOrEqual(
      SPOT.wood,
    );
    expect(spot('ledge-rescue').z).toBeGreaterThanOrEqual(SPOT.ledge);
  });

  it(`keep ${SPOT.pad} from every pad, ${SPOT.structure} from every structure block and ${SPOT.package} from every package (the climber ${SPOT.ledgePackage})`, () => {
    for (const s of RESCUE_SPOTS) {
      const gap = s.id === 'ledge-rescue' ? SPOT.ledgePackage : SPOT.package;
      for (const pad of pads) expect(apartBy(s, pad), `${s.id} and a pad`).toBeGreaterThanOrEqual(SPOT.pad);
      for (const b of STRUCTURES)
        expect(fromBlock(b, s.x, s.y), `${s.id} and ${b.name}`).toBeGreaterThanOrEqual(SPOT.structure);
      for (const p of PACKAGES) expect(apartBy(s, p), `${s.id} and ${p.id}`).toBeGreaterThanOrEqual(gap);
    }
  });

  it(`keep ${SPOT.apart} from each other`, () => {
    RESCUE_SPOTS.forEach((a, i) =>
      RESCUE_SPOTS.slice(i + 1).forEach((b) =>
        expect(apartBy(a, b), `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(SPOT.apart),
      ),
    );
  });

  it("stand inside the bounds the helicopter's middle is kept to", () => {
    const r = HELICOPTER.reach;
    for (const s of RESCUE_SPOTS) {
      expect(s.x, s.id).toBeGreaterThan(bounds.minX + r);
      expect(s.x, s.id).toBeLessThan(bounds.maxX - r);
      expect(s.y, s.id).toBeGreaterThan(bounds.minY + r);
      expect(s.y, s.id).toBeLessThan(bounds.maxY - r);
    }
  });

  it(`have a winch window that fits: hovering ${SPOT.low} to ${SPOT.high} up is under the ceiling, and no structure is within the rotor's reach of the column ${SPOT.column} round`, () => {
    const { middle, rotorRadius, height } = HELICOPTER.size;
    const solids = new Solids({ middle, radius: rotorRadius }, STRUCTURES);
    for (const s of RESCUE_SPOTS) {
      expect(s.z + SPOT.high + height, s.id).toBeLessThanOrEqual(HELICOPTER.ceiling);
      for (let up = SPOT.low; up <= SPOT.high; up += 2.5)
        for (let k = -1; k < 8; k++) {
          const dx = k < 0 ? 0 : SPOT.column * Math.cos((k * Math.PI) / 4);
          const dy = k < 0 ? 0 : SPOT.column * Math.sin((k * Math.PI) / 4);
          expect(
            solids.distanceAt(s.x + dx, s.y + dy, s.z + up + middle),
            `${s.id} at ${dx},${dy},${up}`,
          ).toBeGreaterThan(0);
        }
    }
  });
});

describe('the rescue levels', () => {
  const rescues = LEVELS.filter((l) => l.kind === 'rescue');

  it('are three, one for each spot, after the course, in the order wood, boat, ledge', () => {
    expect(rescues.map((l) => l.id)).toEqual(RESCUE_SPOTS.map((s) => s.id));
    expect(LEVELS.slice(-6, -3)).toEqual(rescues);
    expect(LEVELS.indexOf(rescues[0])).toBe(LEVELS.findIndex((l) => l.kind === 'course') + 1);
  });

  it('are named for their kind, each the way its spot says (a boarding, or a winch) at its spot and then a landing on the home pad', () => {
    expect(rescues.map((l) => l.name)).toEqual(['Wood rescue', 'Boat rescue', 'Ledge rescue']);
    rescues.forEach((level, k) => {
      const s = RESCUE_SPOTS[k];
      expect(level.steps).toEqual([
        {
          kind: s.by === 'land' ? 'board' : 'winch',
          x: s.x,
          y: s.y,
          z: s.z,
          who: s.who,
          where: s.where,
          ...(s.yaw !== undefined && { yaw: s.yaw }),
        },
        { kind: 'land', pad: 0 },
      ]);
    });
  });

  it('are the walker landed beside, the boat and the ledge winched, as the spots say', () => {
    expect(rescues.map((l) => l.steps[0].kind)).toEqual(['board', 'winch', 'winch']);
  });
});

/** The rules a fire keeps, each said once. */
const FIRE = {
  count: 3,
  /** The two lake fires are within this of a lake's nearest square; the far fire is this far or more from all water. */
  nearLake: 150,
  farWater: 200,
  /** The middle's wood: this many trees' feet within `woodReach`. */
  wood: 25,
  woodReach: 30,
  /** The middle's least distance from every pad, every structure's blocks, every package and every rescue spot. */
  pad: 100,
  structure: 60,
  package: 60,
  rescue: 60,
  /** The least between two fires' middles. */
  apart: 150,
  /** Patches: how many, how many burn at the start, how far apart, how far from the middle, and how much wood each has. */
  patchesMin: 12,
  patchesMax: 24,
  lit: 10,
  /** The grid a drop's place is tried on, to see that none reaches every lit patch. */
  dropGrid: 0.5,
  spacing: 8,
  spacingSlack: 0.5,
  patchReach: 40,
  patchTrees: 3,
  patchTreeReach: 10,
  /** The run: its least length, the sampling step, how far the water's level may differ from the ground over it. */
  runMin: 80,
  step: 1,
  levelSlack: 0.05,
  /**
   * The room to come on to a run and leave it: this far beyond each end, the ground no higher than `endRise` over the
   * water. The low approach comes in at 6 over it and clears the ground by 3; a skim of 1 would leave no lake a shore.
   */
  end: 20,
  endRise: 3,
  /** The helicopter skims this far over the water, and its rotor keeps this much more than its reach from a crown. */
  skim: 1,
  crownMargin: 2,
};

describe('the fires', () => {
  const apartBy = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const { terrain, sea } = theIsland();
  const across = terrain.cols - 1;

  /** The nearest open water to (x, y): the index of the lake, or -2 for the sea, and how far its nearest square is. */
  function waterGap(x: number, y: number): { water: number; gap: number } {
    let best = { water: -1, gap: Infinity };
    const lakeOf = new Map<number, number>();
    lakes.forEach((lake, n) => lake.squares.forEach((sq) => lakeOf.set(sq, n)));
    for (let sq = 0; sq < sea.length; sq++) {
      const water = lakeOf.get(sq) ?? (sea[sq] !== SEA.dry ? -2 : -1);
      if (water === -1) continue;
      const x0 = terrain.originX + (sq % across) * terrain.cell,
        y0 = terrain.originY + Math.floor(sq / across) * terrain.cell;
      const gap = Math.hypot(Math.max(x0 - x, 0, x - x0 - terrain.cell), Math.max(y0 - y, 0, y - y0 - terrain.cell));
      if (gap < best.gap) best = { water, gap };
    }
    return best;
  }
  /** Which water a point is over, as `waterGap` says it, or -1 for none. */
  function overWater(x: number, y: number): number {
    const sq =
      Math.floor((y - terrain.originY) / terrain.cell) * across + Math.floor((x - terrain.originX) / terrain.cell);
    const lake = lakes.findIndex((l) => l.squares.includes(sq));
    return lake >= 0 ? lake : sea[sq] !== SEA.dry ? -2 : -1;
  }
  const levelOf = (water: number) => (water === -2 ? theIsland().seaLevel : lakes[water].level);
  /** Whether (x, y) is on a river's water, with a metre of bank, as the dry-land rule has it. */
  const wetByRiver = (x: number, y: number) =>
    theIsland().rivers.some((river) => {
      for (let k = 0; k < river.points.length; k += 4)
        if (Math.hypot(river.points[k] - x, river.points[k + 1] - y) < river.points[k + 3] + 1) return true;
      return false;
    });

  it('are three, each known by a name that is kebab-case, unique, and no other thing its own', () => {
    expect(FIRES).toHaveLength(FIRE.count);
    const ids = FIRES.map((f) => f.id);
    expect(new Set(ids).size).toBe(FIRE.count);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    for (const f of FIRES) expect(f.name.length, f.id).toBeGreaterThan(0);
    // the fire's id is its level's own, as a rescue spot's is: it is taken by no other level, thing or place
    const taken = new Set([
      ...LEVELS.filter((l) => l.kind !== 'fire').map((l) => l.id),
      ...COLLECTIBLES.map((c) => c.id),
      ...PACKAGES.map((p) => p.id),
      ...RESCUE_SPOTS.map((s) => s.id),
    ]);
    for (const id of ids) expect(taken.has(id), id).toBe(false);
  });

  it(`are two within ${FIRE.nearLake} of a lake, each by a different lake, and one ${FIRE.farWater} or more from all water`, () => {
    const near = FIRES.filter((f) => waterGap(f.x, f.y).gap <= FIRE.nearLake);
    expect(near).toHaveLength(2);
    expect(new Set(near.map((f) => waterGap(f.x, f.y).water)).size).toBe(2);
    for (const f of near) expect(waterGap(f.x, f.y).water, f.id).toBeGreaterThanOrEqual(0);
    const far = FIRES.filter((f) => !near.includes(f));
    expect(far).toHaveLength(1);
    expect(waterGap(far[0].x, far[0].y).gap, far[0].id).toBeGreaterThanOrEqual(FIRE.farWater);
  });

  it(`have a middle in a wood of ${FIRE.wood} or more trees' feet within ${FIRE.woodReach}, on dry land`, () => {
    for (const f of FIRES) {
      expect(wet(f.x, f.y), f.id).toBe(false);
      expect(TREES.filter((t) => apartBy(t, f) <= FIRE.woodReach).length, f.id).toBeGreaterThanOrEqual(FIRE.wood);
    }
  });

  it(`keep the middle ${FIRE.pad} from every pad, ${FIRE.structure} from every structure block, ${FIRE.package} from every package and ${FIRE.rescue} from every rescue spot`, () => {
    for (const f of FIRES) {
      for (const pad of pads) expect(apartBy(f, pad), `${f.id} and a pad`).toBeGreaterThanOrEqual(FIRE.pad);
      for (const b of STRUCTURES)
        expect(fromBlock(b, f.x, f.y), `${f.id} and ${b.name}`).toBeGreaterThanOrEqual(FIRE.structure);
      for (const p of PACKAGES) expect(apartBy(f, p), `${f.id} and ${p.id}`).toBeGreaterThanOrEqual(FIRE.package);
      for (const s of RESCUE_SPOTS) expect(apartBy(f, s), `${f.id} and ${s.id}`).toBeGreaterThanOrEqual(FIRE.rescue);
    }
  });

  it(`keep the middles ${FIRE.apart} from each other`, () => {
    FIRES.forEach((a, i) =>
      FIRES.slice(i + 1).forEach((b) =>
        expect(apartBy(a, b), `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(FIRE.apart),
      ),
    );
  });

  it("stand inside the bounds the helicopter's middle is kept to", () => {
    const r = HELICOPTER.reach;
    for (const f of FIRES) {
      expect(f.x, f.id).toBeGreaterThan(bounds.minX + r);
      expect(f.x, f.id).toBeLessThan(bounds.maxX - r);
      expect(f.y, f.id).toBeGreaterThan(bounds.minY + r);
      expect(f.y, f.id).toBeLessThan(bounds.maxY - r);
    }
  });

  it(`have ${FIRE.patchesMin} to ${FIRE.patchesMax} patches, ${FIRE.lit} lit, the lit ones the nearest to the middle`, () => {
    for (const f of FIRES) {
      expect(f.patches.length, f.id).toBeGreaterThanOrEqual(FIRE.patchesMin);
      expect(f.patches.length, f.id).toBeLessThanOrEqual(FIRE.patchesMax);
      expect(f.lit, f.id).toBe(FIRE.lit);
      const away = f.patches.map((p) => apartBy(p, f));
      expect(away, f.id).toEqual([...away].sort((a, b) => a - b));
    }
  });

  it(`cannot be put out by one drop: no point, on a grid of ${FIRE.dropGrid}, has every lit patch within the splash`, () => {
    for (const f of FIRES) {
      const lit = f.patches.slice(0, f.lit);
      const xs = f.patches.map((p) => p.x),
        ys = f.patches.map((p) => p.y);
      let best = Infinity;
      for (let x = Math.min(...xs) - DROP.splash; x <= Math.max(...xs) + DROP.splash; x += FIRE.dropGrid)
        for (let y = Math.min(...ys) - DROP.splash; y <= Math.max(...ys) + DROP.splash; y += FIRE.dropGrid)
          best = Math.min(best, Math.max(...lit.map((p) => Math.hypot(p.x - x, p.y - y))));
      // the smallest circle that holds every lit patch is wider than the splash, whatever the drop is aimed at
      expect(best, `${f.id}: the nearest a drop comes to reaching them all`).toBeGreaterThan(DROP.splash);
    }
  });

  it(`have patches on dry land, in the wood (${FIRE.patchTrees} or more trees' feet within ${FIRE.patchTreeReach}), within ${FIRE.patchReach} of the middle, with z the ground there`, () => {
    for (const f of FIRES)
      f.patches.forEach((p, k) => {
        const at = `${f.id} patch ${k}`;
        expect(wet(p.x, p.y), at).toBe(false);
        expect(apartBy(p, f), at).toBeLessThanOrEqual(FIRE.patchReach);
        expect(TREES.filter((t) => apartBy(t, p) <= FIRE.patchTreeReach).length, at).toBeGreaterThanOrEqual(
          FIRE.patchTrees,
        );
        expect(Math.abs(p.z - ground.heightAt(p.x, p.y)), at).toBeLessThanOrEqual(0.05);
      });
  });

  it(`have patches ${FIRE.spacing} apart, near enough: none nearer than ${FIRE.spacing - FIRE.spacingSlack}, each with a neighbour within ${FIRE.spacing + FIRE.spacingSlack}`, () => {
    for (const f of FIRES)
      f.patches.forEach((p, k) => {
        const gaps = f.patches.filter((_, j) => j !== k).map((q) => apartBy(p, q));
        expect(Math.min(...gaps), `${f.id} patch ${k}`).toBeGreaterThanOrEqual(FIRE.spacing - FIRE.spacingSlack);
        expect(Math.min(...gaps), `${f.id} patch ${k}`).toBeLessThanOrEqual(FIRE.spacing + FIRE.spacingSlack);
      });
  });

  it('have patches that keep clear of every pad, structure block, package and rescue spot, by what the middle keeps less its reach', () => {
    for (const f of FIRES)
      for (const p of f.patches) {
        for (const pad of pads)
          expect(apartBy(p, pad), `${f.id} and a pad`).toBeGreaterThanOrEqual(FIRE.pad - FIRE.patchReach);
        for (const b of STRUCTURES)
          expect(fromBlock(b, p.x, p.y), `${f.id} and ${b.name}`).toBeGreaterThanOrEqual(
            FIRE.structure - FIRE.patchReach,
          );
        for (const q of [...PACKAGES, ...RESCUE_SPOTS])
          expect(apartBy(p, q), `${f.id} and ${q.id}`).toBeGreaterThanOrEqual(FIRE.package - FIRE.patchReach);
      }
  });

  it(`have a run: straight, ${FIRE.runMin} or more long, over one open water at every ${FIRE.step}, never a river, at the water's level`, () => {
    for (const f of FIRES) {
      const { from, to, z } = f.run;
      const length = apartBy(from, to);
      expect(length, f.id).toBeGreaterThanOrEqual(FIRE.runMin);
      const water = overWater(from.x, from.y);
      expect(water, `${f.id} starts over water`).not.toBe(-1);
      expect(Math.abs(z - levelOf(water)), f.id).toBeLessThanOrEqual(FIRE.levelSlack);
      for (let s = 0; s <= length; s += FIRE.step) {
        const x = from.x + ((to.x - from.x) * s) / length,
          y = from.y + ((to.y - from.y) * s) / length;
        expect(overWater(x, y), `${f.id} at ${s}`).toBe(water);
        expect(wetByRiver(x, y), `${f.id} at ${s} is a river`).toBe(false);
        expect(Math.abs(ground.heightAt(x, y) - z), `${f.id} at ${s}`).toBeLessThanOrEqual(FIRE.levelSlack);
      }
    }
  });

  it(`have a run with room at each end: the ${FIRE.end} beyond it no more than ${FIRE.endRise} over the water`, () => {
    for (const f of FIRES) {
      const { from, to, z } = f.run;
      const length = apartBy(from, to);
      const ux = (to.x - from.x) / length,
        uy = (to.y - from.y) / length;
      for (let s = 0; s <= FIRE.end; s += FIRE.step) {
        expect(ground.heightAt(to.x + ux * s, to.y + uy * s) - z, `${f.id} past the end, ${s}`).toBeLessThanOrEqual(
          FIRE.endRise,
        );
        expect(
          ground.heightAt(from.x - ux * s, from.y - uy * s) - z,
          `${f.id} before the start, ${s}`,
        ).toBeLessThanOrEqual(FIRE.endRise);
      }
    }
  });

  it(`have a run clear of crowns and structures: none within the rotor's reach and ${FIRE.crownMargin} of the line, ${FIRE.skim} over the water`, () => {
    const { middle, rotorRadius } = HELICOPTER.size;
    const solids = new Solids({ middle, radius: rotorRadius }, STRUCTURES);
    for (const f of FIRES) {
      const { from, to, z } = f.run;
      const length = apartBy(from, to);
      for (let s = 0; s <= length; s += FIRE.step) {
        const x = from.x + ((to.x - from.x) * s) / length,
          y = from.y + ((to.y - from.y) * s) / length;
        expect(solids.distanceAt(x, y, z + FIRE.skim + middle), `${f.id} at ${s}`).toBeGreaterThan(FIRE.crownMargin);
      }
      // a crown's edge to the line, for every tree that stands over the skim
      for (const t of TREES) {
        if (t.top <= z + FIRE.skim) continue;
        const along = Math.max(
          0,
          Math.min(length, ((t.x - from.x) * (to.x - from.x) + (t.y - from.y) * (to.y - from.y)) / length),
        );
        const px = from.x + ((to.x - from.x) * along) / length,
          py = from.y + ((to.y - from.y) * along) / length;
        expect(Math.hypot(t.x - px, t.y - py) - t.spread, f.id).toBeGreaterThanOrEqual(rotorRadius + FIRE.crownMargin);
      }
    }
  });
});

describe('the fire levels', () => {
  const fires = LEVELS.filter((l) => l.kind === 'fire');

  it('are three, one for each fire, after the rescues, in the order west lake, south lake, north wood', () => {
    expect(fires.map((l) => l.id)).toEqual(['west-lake-fire', 'south-lake-fire', 'north-wood-fire']);
    expect(fires.map((l) => l.id)).toEqual(FIRES.map((f) => f.id));
    expect(LEVELS.slice(-3)).toEqual(fires);
    expect(LEVELS.indexOf(fires[0])).toBe(LEVELS.findIndex((l) => l.kind === 'rescue' && l.id === 'ledge-rescue') + 1);
    expect(LEVELS).toHaveLength(13);
  });

  it('are named for their fire, and each a douse of it and then the fire out', () => {
    fires.forEach((level, k) => {
      const f = FIRES[k];
      expect(level.name).toBe(f.name);
      expect(level.steps).toEqual([
        { kind: 'douse', fire: f.id },
        { kind: 'fire', fire: f.id },
      ]);
    });
    expect(fires.map((l) => l.name)).toEqual([
      'Fire by the west lake',
      'Fire by the south lake',
      'Fire in the northern wood',
    ]);
  });

  it("have ids that are no other level, and are kept: each is in players' saves", () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });
});
