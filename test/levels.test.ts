/**
 * The levels as content: each one's pads held to what they are, so an island made again otherwise, or a pad's place
 * in the list moved, says so here and not as a level that wants the helicopter somewhere else. Each is held to what
 * makes it the level it is: over the water, over the range, up the mountain.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS, STRUCTURES, TREE_KINDS, theIsland } from '../src/arena';
import { HELICOPTER } from '../src/helicopter';
import { TREE_STRIDE } from '../src/island';
import { treeSize } from '../src/meshes';
import { RING, RINGS, type Gate, type Ring } from '../src/mission';

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
    ]);
    expect(LEVELS.map((level) => level.name)).toEqual([
      'First delivery',
      'Ring trial',
      'Over the water',
      'Over the range',
      'Up the valley',
      'Mountain drop',
      'Under and between',
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

describe('what stands on the island', () => {
  const [bridge, south, north, west, east] = STRUCTURES;
  /** The ground under a block's footprint, at its lowest and highest. */
  const under = (b: (typeof STRUCTURES)[number]) => {
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

  it('is a bridge on its abutments and two towers, named as a rule broken says them', () => {
    expect(STRUCTURES.map((b) => b.name)).toEqual([
      'the bridge',
      'the south abutment',
      'the north abutment',
      'the west tower',
      'the east tower',
    ]);
  });

  it('leaves no room under the deck too narrow for the helicopter to stand in, that an abutment does not fill', () => {
    const need = HELICOPTER.size.middle + HELICOPTER.size.rotorRadius;
    const inside = (b: (typeof STRUCTURES)[number], x: number, y: number) => {
      const along = (x - b.x) * Math.cos(b.yaw) + (y - b.y) * Math.sin(b.yaw);
      const across = -(x - b.x) * Math.sin(b.yaw) + (y - b.y) * Math.cos(b.yaw);
      return Math.abs(along) <= b.length / 2 + 1e-6 && Math.abs(across) <= b.width / 2 + 1e-6;
    };
    let open = 0;
    for (let a = -bridge.length / 2; a <= bridge.length / 2; a += 0.5)
      for (let w = -bridge.width / 2; w <= bridge.width / 2; w += 0.5) {
        const x = bridge.x + a * Math.cos(bridge.yaw) - w * Math.sin(bridge.yaw),
          y = bridge.y + a * Math.sin(bridge.yaw) + w * Math.cos(bridge.yaw);
        if (inside(south, x, y) || inside(north, x, y)) continue;
        // the bank meets the deck where there is no room at all, to within the five centimetres the content is said to
        const room = bridge.z - ground.heightAt(x, y);
        expect(room <= 0.05 || room >= need, `${a} along, ${w} across: room ${room.toFixed(2)}`).toBe(true);
        if (room > 0.05) open++;
      }
    // and there is open water under it to fly through
    expect(open).toBeGreaterThan(500);
  });

  it('stands each abutment from below the bank up to the deck', () => {
    for (const end of [south, north]) {
      expect(end.z, end.name).toBeLessThan(under(end).lo);
      expect(end.z + end.height, end.name).toBeCloseTo(bridge.z, 6);
    }
  });

  it('stands each tower on the ground, its foot sunk into it and never floating, its top at 110', () => {
    for (const tower of [west, east]) {
      const { lo } = under(tower);
      expect(tower.z, tower.name).toBeLessThan(lo);
      expect(lo - tower.z, tower.name).toBeLessThan(3);
      expect(tower.z + tower.height).toBeCloseTo(110, 6);
    }
  });

  it('rests the deck on both banks, 13 over the water where the river runs under it', () => {
    // each end on the bank: the ground under its last two metres as high as its underside
    for (const end of [-1, 1]) {
      const at = end * (bridge.length / 2 - 1);
      const g = ground.heightAt(bridge.x + at * Math.cos(bridge.yaw), bridge.y + at * Math.sin(bridge.yaw));
      expect(g, `the end ${end}`).toBeGreaterThanOrEqual(bridge.z);
    }
    expect(bridge.z - ground.heightAt(-16.5, 337.2)).toBeCloseTo(13, 0);
  });

  it('has no tree in it, under the deck or beside a tower', () => {
    for (const b of STRUCTURES) {
      const margin = b === west || b === east ? 8 : 4;
      const inside = TREES.filter((t) => {
        const along = (t.x - b.x) * Math.cos(b.yaw) + (t.y - b.y) * Math.sin(b.yaw);
        const across = -(t.x - b.x) * Math.sin(b.yaw) + (t.y - b.y) * Math.cos(b.yaw);
        return Math.abs(along) <= b.length / 2 + margin && Math.abs(across) <= b.width / 2 + margin;
      });
      expect(inside, b.name).toEqual([]);
    }
  });
});

/** The pad the course lands on, which its opening between the towers faces from. */
const SHOULDER = 6;

describe('the course', () => {
  const level = LEVELS.find((l) => l.id === 'under-and-between')!;
  const [between, under, ...rest] = level.steps;
  const rings = rest.filter((s): s is Ring => s.kind === 'ring');
  const [bridge, , , west, east] = STRUCTURES;

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
});

describe('where a level begins', () => {
  it('is its first step, and no level names a start pad of its own', () => {
    for (const level of LEVELS) expect('start' in level, level.id).toBe(false);
  });

  it('is a pickup for a delivery, and a ring or an opening for the trials and the course', () => {
    for (const level of LEVELS)
      expect(level.steps[0].kind, level.id).toBe(
        level.kind === 'delivery' ? 'pickup' : level.kind === 'rings' ? 'ring' : 'gate',
      );
  });

  it('is a pad of its own for each of the four deliveries: 4, 3, 7 and 2, so that no two begin from one', () => {
    const pickups = LEVELS.flatMap((level) => (level.steps[0].kind === 'pickup' ? [level.steps[0].pad] : []));
    expect(pickups).toEqual([4, 3, 7, 2]);
    expect(new Set(pickups).size).toBe(4);
  });
});
