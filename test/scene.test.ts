/**
 * The scene: the helicopter's six groups, placed from a pose as the frame, the mast and the tail say, and the
 * island's, a mesh for each thing it is made of. No GPU is needed, since meshes are plain arrays; the island is built
 * once for the file, since it takes most of a second.
 */
import { describe, expect, it } from 'vitest';
import { COLLECTIBLES, FIRES, ISLAND, LEVELS, PACKAGES, STRUCTURES, TREE_KINDS, theIsland } from '../src/arena';
import { BUCKET, type BucketPose } from '../src/bucket';
import { PATCH } from '../src/fire';
import { Mission, RING, RINGS, type Level, type Ring } from '../src/mission';
import { HELICOPTER } from '../src/helicopter';
import { SEA, SURFACE, TREE_STRIDE } from '../src/island';
import {
  helicopterBody,
  helicopterDark,
  helicopterGlass,
  helicopterTrim,
  mainRotor,
  tailRotor,
  treeShape,
  treeSize,
} from '../src/meshes';
import { Scene, type HelicopterPose } from '../src/scene';
import { openWaterOf } from '../src/water';
import { DT, islandSway, thickestWood } from './helpers';

const pose = (over: Partial<HelicopterPose> = {}): HelicopterPose => ({
  x: 10,
  y: -20,
  z: 6,
  yaw: 0,
  pitch: 0,
  roll: 0,
  rotor: 0,
  tailRotor: 0,
  ...over,
});

const translation = (m: Float32Array) => [m[12], m[13], m[14]];

/** The groups that come after the trees, in order: the crates, the rings and flags, the gold, the packages, the rescues, the fires' ground and the bucket. */
const TAIL = [
  'crate',
  'crate straps',
  'beacon',
  'rings',
  'ring next',
  'flags dark',
  'flags light',
  'collected',
  'packages',
  'package straps',
  'people',
  'winch',
  'boat',
  'burning ground',
  'burnt ground',
  'bucket line',
  'bucket',
  'bucket water',
];

describe('dynamic', () => {
  it('gives six groups, each over its own pool of one placement', () => {
    const scene = new Scene();
    const groups = scene.dynamic();
    expect(groups).toHaveLength(6);
    expect(scene.pools).toHaveLength(6);
    groups.forEach((g, k) => {
      expect(g.matrices).toBe(scene.pools[k]);
      expect(g.matrices).toHaveLength(16);
      expect(g.count).toBe(1);
    });
  });

  it('is the same six pools when asked twice, not twelve', () => {
    const scene = new Scene();
    scene.dynamic();
    scene.dynamic();
    expect(scene.pools).toHaveLength(6);
  });

  it('paints the body and its trim, the glass and the dark metal, the rotors in the dark', () => {
    const groups = new Scene().dynamic();
    const [body, trim, glass, dark, main, tail] = groups;
    // four paints, and the rotors share the dark metal's
    expect(new Set([body, trim, glass, dark].map((g) => String(g.albedo))).size).toBe(4);
    expect(main.albedo).toEqual(dark.albedo);
    expect(tail.albedo).toEqual(dark.albedo);
    // the shell is a strong orange, red well over green over blue, and the metal is dark
    const [r, g, b] = body.albedo!;
    expect(r).toBeGreaterThan(2 * g);
    expect(g).toBeGreaterThan(b);
    expect(Math.max(...dark.albedo!)).toBeLessThan(0.1);
    expect(groups.map((g) => g.roughness)).toEqual([0.5, 0.5, 0.15, 0.6, 0.6, 0.6]);
  });
});

describe('write', () => {
  it('puts the body at the pose, and the trim, glass and dark the same', () => {
    const scene = new Scene();
    scene.dynamic();
    scene.write(pose({ yaw: 0.8, pitch: 0.1, roll: -0.2 }));
    const [body, trim, glass, dark] = scene.pools;
    expect(translation(body)).toEqual([10, -20, 6]);
    expect(Array.from(trim)).toEqual(Array.from(body));
    expect(Array.from(glass)).toEqual(Array.from(body));
    expect(Array.from(dark)).toEqual(Array.from(body));
  });

  it('puts the main rotor at the mast top above a level body', () => {
    const scene = new Scene();
    scene.dynamic();
    scene.write(pose({ rotor: 1.3 }));
    const t = translation(scene.pools[4]);
    expect(t[0]).toBeCloseTo(10, 5);
    expect(t[1]).toBeCloseTo(-20, 5);
    expect(t[2]).toBeCloseTo(6 + HELICOPTER.size.mastTop, 5);
  });

  it('puts the tail rotor at its place, turned by the yaw', () => {
    const scene = new Scene();
    scene.dynamic();
    const yaw = Math.PI / 2;
    scene.write(pose({ yaw }));
    const [ax, ay, az] = HELICOPTER.size.tailRotorAt;
    const t = translation(scene.pools[5]);
    expect(t[0]).toBeCloseTo(10 + ax * Math.cos(yaw) - ay * Math.sin(yaw), 5);
    expect(t[1]).toBeCloseTo(-20 + ax * Math.sin(yaw) + ay * Math.cos(yaw), 5);
    expect(t[2]).toBeCloseTo(6 + az, 5);
  });

  it("spins the tail rotor about the helicopter's left-right axis, so its own Y axis stays put", () => {
    const scene = new Scene();
    scene.dynamic();
    scene.write(pose({ tailRotor: Math.PI / 2 }));
    const m = scene.pools[5];
    // the second column is where the part's Y axis points: still the body's left, which is +Y at yaw 0
    expect(m[4]).toBeCloseTo(0, 6);
    expect(m[5]).toBeCloseTo(1, 6);
    expect(m[6]).toBeCloseTo(0, 6);
    // and a quarter turn about Y has taken its X axis down to −Z, out of the level
    expect(m[2]).toBeCloseTo(-1, 6);
  });

  it('turns the rotor with its angle, and adds no pools', () => {
    const scene = new Scene();
    scene.dynamic();
    scene.write(pose({ rotor: 0 }));
    const before = Array.from(scene.pools[4]);
    scene.write(pose({ rotor: Math.PI / 2 }));
    expect(Array.from(scene.pools[4])).not.toEqual(before);
    expect(scene.pools).toHaveLength(6);
  });
});

describe('meshes', () => {
  it.each([
    ['body', helicopterBody],
    ['trim', helicopterTrim],
    ['glass', helicopterGlass],
    ['dark', helicopterDark],
    ['main rotor', mainRotor],
    ['tail rotor', tailRotor],
  ])('the %s has triangles', (_name, make) => {
    const mesh = make();
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.positions.length).toBe(mesh.normals.length);
  });

  it('measures each kind of tree as tall and as wide as its shape is', () => {
    for (const kind of TREE_KINDS) {
      const { top, radius } = treeSize(kind);
      const { trunk, crown } = treeShape(kind);
      for (const m of [trunk, crown])
        for (let i = 0; i < m.positions.length; i += 3) {
          expect(m.positions[i + 2]).toBeLessThanOrEqual(top);
          expect(Math.hypot(m.positions[i], m.positions[i + 1])).toBeLessThanOrEqual(radius + 1e-6);
        }
      expect(top).toBeGreaterThan(1.5);
      expect(treeSize(kind)).toBe(treeSize(kind));
    }
    expect(treeSize('pine').top).toBeCloseTo(13.2, 6);
    expect(treeSize('poplar').top).toBeCloseTo(12.2, 6);
  });

  it('keeps the rotor as long as its radius says, and the dark reaching the hub', () => {
    const xs = Array.from(mainRotor().positions).filter((_, k) => k % 3 === 0);
    expect(Math.max(...xs)).toBeCloseTo(HELICOPTER.size.rotorRadius, 5);
    expect(Math.min(...xs)).toBeCloseTo(-HELICOPTER.size.rotorRadius, 5);
    const zs = Array.from(helicopterDark().positions).filter((_, k) => k % 3 === 2);
    expect(Math.max(...zs)).toBeCloseTo(HELICOPTER.size.mastTop, 5);
    expect(Math.min(...zs)).toBeCloseTo(0, 5);
  });
});

describe('shadowBox', () => {
  it('reaches from under the sea to over the helicopter at its ceiling', () => {
    const { min, max } = new Scene().shadowBox;
    expect(min[2]).toBeLessThan(0);
    expect(max[2]).toBeGreaterThan(HELICOPTER.ceiling + HELICOPTER.size.height);
  });

  it('is the one box, written in place as the helicopter moves, so the renderer which holds it follows', () => {
    const scene = new Scene();
    scene.dynamic();
    const box = scene.shadowBox;
    const { min, max } = box;
    scene.write(pose({ x: 500, y: -300 }));
    expect(scene.shadowBox).toBe(box);
    expect(box.min).toBe(min);
    expect(box.max).toBe(max);
    // it is the same size wherever it is, and the helicopter is well inside it
    expect(max[0] - min[0]).toBe(max[1] - min[1]);
    expect(min[0]).toBeLessThan(500 - 100);
    expect(max[0]).toBeGreaterThan(500 + 100);
    expect(min[1]).toBeLessThan(-300 - 100);
    expect(max[1]).toBeGreaterThan(-300 + 100);
  });

  it('is held to a grid of eight, so a small move leaves it where it was and its shadow does not crawl', () => {
    const scene = new Scene();
    scene.dynamic();
    scene.write(pose({ x: 96, y: 96 }));
    const before = [...scene.shadowBox.min, ...scene.shadowBox.max];
    scene.write(pose({ x: 99, y: 93 }));
    expect([...scene.shadowBox.min, ...scene.shadowBox.max]).toEqual(before);
    scene.write(pose({ x: 105, y: 96 }));
    const { min, max } = scene.shadowBox;
    expect(min[0] - before[0]).toBe(8);
    expect(max[0] - before[3]).toBe(8);
    expect(min[1]).toBe(before[1]);
    expect((min[0] / 8) % 1).toBeCloseTo(0, 6);
  });

  it('keeps its height whatever the helicopter does', () => {
    const scene = new Scene();
    scene.dynamic();
    const { min, max } = scene.shadowBox;
    const [lo, hi] = [min[2], max[2]];
    scene.write(pose({ z: 200 }));
    expect([min[2], max[2]]).toEqual([lo, hi]);
  });
});

/* ------------------------------------------------------------------ the island */

const island = theIsland();
const scene = new Scene();
const groups = scene.static(island, STRUCTURES);
const movers = scene.dynamic(island);
const group = (name: string) => {
  const k = scene.names.indexOf(name);
  if (k >= 0) return groups[k];
  const m = scene.movers.indexOf(name);
  expect(m, `a group called ${name}`).toBeGreaterThanOrEqual(0);
  return movers[m];
};
const triangles = (name: string) => group(name).mesh.indices.length / 3;
const count = (name: string) => group(name).count ?? group(name).matrices.length / 16;
const { terrain, surface, sea, seaLevel } = island;
const n = terrain.cols - 1;
const KINDS = Object.entries(SURFACE).filter(([, kind]) => kind !== SURFACE.none);

describe('static', () => {
  it('gives every group a name, and every mesh whole triangles over vertices which have normals', () => {
    expect(scene.names).toHaveLength(groups.length);
    expect(new Set(scene.names).size).toBe(groups.length);
    for (const g of groups) {
      const { positions, normals, indices } = g.mesh;
      expect(indices.length % 3).toBe(0);
      expect(positions.length).toBe(normals.length);
      expect(positions.length % 3).toBe(0);
      let top = 0;
      for (let k = 0; k < indices.length; k++) top = Math.max(top, indices[k]);
      expect(top).toBeLessThan(positions.length / 3);
      expect(g.matrices.length % 16).toBe(0);
      expect(g.count ?? g.matrices.length / 16).toBeGreaterThan(0);
    }
  });

  it('draws it again as the same groups, and names them afresh and not twice over', () => {
    const again = new Scene();
    expect(again.static(island, STRUCTURES)).toHaveLength(groups.length);
    expect(again.names).toEqual(scene.names);
    again.static(island, STRUCTURES);
    expect(again.names).toEqual(scene.names);
  });

  it('builds the whole island in well under a second', () => {
    const t = performance.now();
    new Scene().static(island, STRUCTURES);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('the land', () => {
  it('has a group for every kind of surface the island has, and none for what is not drawn', () => {
    const present = new Set<number>();
    for (const kind of surface) present.add(kind);
    for (const [name, kind] of KINDS) expect(scene.names.includes(name), name).toBe(present.has(kind));
    expect(scene.names).not.toContain('none');
  });

  it('draws the triangles the heightfield splits its squares into, each of the surface it was given', () => {
    const { cols, cell, originX, originY, heights } = terrain;
    // checked by counting what is wrong and not by an assertion each, since there are hundreds of thousands
    let offGrid = 0,
      wrongHeight = 0,
      wrongSplit = 0,
      wrongSurface = 0;
    for (const [name, kind] of KINDS) {
      if (!scene.names.includes(name)) continue;
      const { positions, indices } = group(name).mesh;
      const cornerOf = (v: number) => {
        const i = Math.round((positions[3 * v] - originX) / cell),
          j = Math.round((positions[3 * v + 1] - originY) / cell);
        if (positions[3 * v] !== originX + i * cell || positions[3 * v + 1] !== originY + j * cell) offGrid++;
        if (positions[3 * v + 2] !== heights[j * cols + i]) wrongHeight++;
        return j * cols + i;
      };
      for (let t = 0; t < indices.length; t += 3) {
        const [p, q, r] = [cornerOf(indices[t]), cornerOf(indices[t + 1]), cornerOf(indices[t + 2])].sort(
          (a, b) => a - b,
        );
        // one of a square's two triangles: [00, 10, 11] or [00, 11, 01], split along 00-11
        const lower = q === p + 1 && r === p + cols + 1;
        const upper = q === p + cols && r === p + cols + 1;
        if (!lower && !upper) wrongSplit++;
        const j = Math.floor(p / cols);
        const sq = j * n + (p - j * cols);
        if (surface[2 * sq + (lower ? 0 : 1)] !== kind) wrongSurface++;
      }
    }
    expect({ offGrid, wrongHeight, wrongSplit, wrongSurface }).toEqual({
      offGrid: 0,
      wrongHeight: 0,
      wrongSplit: 0,
      wrongSurface: 0,
    });
  });

  it('leaves out only what the sea is drawn over, and counts the rest against the surface', () => {
    const drawn = new Set<number>();
    let triangleCount = 0;
    for (const [name] of KINDS) {
      if (scene.names.includes(name)) triangleCount += triangles(name);
    }
    // every triangle with a surface is either in a group, or has its three corners at the sea or under it in a square the sea covers
    const { cols, heights } = terrain;
    let left = 0;
    let given = 0;
    for (let sq = 0; sq < n * n; sq++) {
      const j = Math.floor(sq / n),
        k = j * cols + (sq - j * n);
      const corners = [
        [k, k + 1, k + cols + 1],
        [k, k + cols + 1, k + cols],
      ];
      for (let half = 0; half < 2; half++) {
        if (surface[2 * sq + half] === SURFACE.none) continue;
        given++;
        const under = corners[half].every((v) => heights[v] <= seaLevel) && sea[sq] !== SEA.dry;
        if (under) left++;
        else drawn.add(2 * sq + half);
      }
    }
    expect(triangleCount).toBe(drawn.size);
    expect(triangleCount + left).toBe(given);
    // and a good deal of the sea floor is left out, which is the point
    expect(left).toBeGreaterThan(given / 10);
  });

  it("shades it with the land's own normals, unit and facing up", () => {
    let bad = 0;
    for (const [name] of KINDS) {
      if (!scene.names.includes(name)) continue;
      const { normals } = group(name).mesh;
      for (let v = 0; v < normals.length; v += 3) {
        if (Math.abs(Math.hypot(normals[v], normals[v + 1], normals[v + 2]) - 1) > 1e-4 || normals[v + 2] <= 0) bad++;
      }
    }
    expect(bad).toBe(0);
  });

  it('shares its vertices within a group, so a group is a vertex or so a triangle and not three', () => {
    for (const [name] of KINDS) {
      if (!scene.names.includes(name)) continue;
      const { positions, indices } = group(name).mesh;
      expect(positions.length / 3).toBeLessThan(indices.length * 0.8);
    }
  });

  it('is matte, so a toon look gives it no glint', () => {
    for (const [name] of KINDS)
      if (scene.names.includes(name)) expect(group(name).roughness).toBeGreaterThanOrEqual(0.9);
  });
});

describe('the water', () => {
  const cell2 = terrain.cell * terrain.cell;
  const zs = (name: string) => {
    const { positions } = group(name).mesh;
    const out = new Set<number>();
    for (let v = 2; v < positions.length; v += 3) out.add(positions[v]);
    return [...out];
  };
  const area = (name: string) => {
    const { positions, indices } = group(name).mesh;
    let sum = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      sum +=
        Math.abs(
          (positions[3 * b] - positions[3 * a]) * (positions[3 * c + 1] - positions[3 * a + 1]) -
            (positions[3 * c] - positions[3 * a]) * (positions[3 * b + 1] - positions[3 * a + 1]),
        ) / 2;
    }
    return sum;
  };

  it('has a sea plane under the rest, out to the horizon, a hair below the water so they do not fight', () => {
    const { positions } = group('ocean').mesh;
    expect(zs('ocean')).toEqual([seaLevel - 0.25]);
    expect(Math.max(...positions.map(Math.abs).filter((v) => v > 1))).toBeGreaterThanOrEqual(5000);
  });

  it('covers the deep sea and the shallows at sea level, to the square and no more', () => {
    const deep = sea.filter((v) => v === SEA.deep).length;
    const shallow = sea.filter((v) => v === SEA.shallow).length;
    expect(zs('deep')).toEqual([seaLevel]);
    expect(zs('shallow')).toEqual([seaLevel]);
    expect(area('deep')).toBeCloseTo(deep * cell2, -1);
    expect(triangles('shallow')).toBe(shallow * 2);
    expect(area('shallow')).toBeCloseTo(shallow * cell2, -1);
    // and the deep sea, which is most of the grid, is a few rectangles and not a quad a square
    expect(triangles('deep')).toBeLessThan(deep / 10);
  });

  it('fills each lake to its level over its squares, glossy', () => {
    expect(island.lakes.length).toBeGreaterThan(0);
    expect(zs('lakes').sort((a, b) => a - b)).toEqual(island.lakes.map((l) => l.level).sort((a, b) => a - b));
    expect(triangles('lakes')).toBe(island.lakes.reduce((sum, l) => sum + l.squares.length * 2, 0));
    expect(group('lakes').roughness).toBeLessThan(0.5);
  });

  it('lays each river as a ribbon on its surface, wider than the water by a little so its edges tuck under the banks', () => {
    const { positions, indices } = group('rivers').mesh;
    const points = island.rivers.reduce((sum, r) => sum + r.points.length / 4, 0);
    expect(positions.length / 3).toBe(points * 2);
    expect(indices.length / 3).toBe(2 * (points - island.rivers.length));
    let v = 0;
    for (const { points: p } of island.rivers) {
      for (let k = 0; k < p.length / 4; k++, v++) {
        // the pair of vertices at a point: at the water's height, either side of the point, 1.15 of the half-width out
        expect(positions[6 * v + 2]).toBe(p[4 * k + 2]);
        expect(positions[6 * v + 5]).toBe(p[4 * k + 2]);
        const mx = (positions[6 * v] + positions[6 * v + 3]) / 2,
          my = (positions[6 * v + 1] + positions[6 * v + 4]) / 2;
        expect(mx).toBeCloseTo(p[4 * k], 3);
        expect(my).toBeCloseTo(p[4 * k + 1], 3);
        const across = Math.hypot(positions[6 * v] - positions[6 * v + 3], positions[6 * v + 1] - positions[6 * v + 4]);
        expect(across).toBeCloseTo(2 * p[4 * k + 3] * 1.15, 3);
      }
    }
    expect(group('rivers').roughness).toBeLessThan(0.5);
  });
});

describe('the trees', () => {
  const kinds = TREE_KINDS.map((kind, index) => {
    let total = 0;
    for (let t = 0; t < island.treeCount; t++) if (island.trees[t * TREE_STRIDE] === index) total++;
    return { kind, index, total };
  });

  it('move, after the helicopter, and are not among what stands still', () => {
    expect(scene.movers.slice(0, 6)).toEqual(['body', 'trim', 'glass', 'dark', 'main rotor', 'tail rotor']);
    expect(scene.movers.slice(6, -TAIL.length)).toEqual(
      TREE_KINDS.flatMap((kind) => [`${kind} trunks`, `${kind} crowns`]),
    );
    expect(scene.movers.slice(-TAIL.length)).toEqual(TAIL);
    expect(scene.names.filter((name) => / (trunks|crowns)$/.test(name))).toEqual([]);
    expect(scene.pools).toHaveLength(movers.length);
    movers.forEach((g, k) => expect(g.matrices).toBe(scene.pools[k]));
  });

  it('are not written again while the helicopter alone moves', () => {
    scene.write(pose());
    expect(Array.from(scene.changed)).toEqual(movers.map((_, k) => (k < 6 ? 1 : 0)));
  });

  it('are a trunk group and a crown group for every kind there is, with a placement for each tree', () => {
    for (const { kind, total } of kinds) {
      if (total === 0) continue;
      expect(count(`${kind} trunks`)).toBe(total);
      expect(count(`${kind} crowns`)).toBe(total);
      expect(group(`${kind} trunks`).matrices).toBe(group(`${kind} crowns`).matrices);
    }
    expect(kinds.filter((k) => k.total > 0).length).toBe(TREE_KINDS.length);
  });

  it('stand where the island put them, turned and sized as it said, with their feet on the ground', () => {
    for (const { kind, index } of kinds) {
      const m = group(`${kind} crowns`).matrices;
      let placed = 0;
      for (let t = 0; t < island.treeCount; t++) {
        const o = t * TREE_STRIDE;
        if (island.trees[o] !== index) continue;
        const [x, y, z, yaw, s] = [1, 2, 3, 4, 5].map((k) => island.trees[o + k]);
        const f = placed++ * 16;
        expect([m[f + 12], m[f + 13], m[f + 14]]).toEqual([x, y, z]);
        expect(m[f]).toBeCloseTo(Math.cos(yaw) * s, 5);
        expect(m[f + 1]).toBeCloseTo(Math.sin(yaw) * s, 5);
        expect(m[f + 10]).toBeCloseTo(s, 5);
        // a foot is a little under the ground and never floating over it, nor sunk
        expect(Math.abs(z - terrain.heightAt(x, y))).toBeLessThan(0.5);
      }
    }
  });

  it('have crowns each their own shade, a trunk the one colour', () => {
    for (const { kind, index } of kinds) {
      const { materials, albedo } = group(`${kind} crowns`);
      expect(materials).toBeDefined();
      expect(materials!.length).toBe(count(`${kind} crowns`) * 4);
      expect(group(`${kind} trunks`).materials).toBeUndefined();
      // the palest and the darkest shade of a kind are not the same colour, and the middle one is the paint
      let lo = Infinity,
        hi = -Infinity,
        mid: number | undefined;
      let placed = 0;
      for (let t = 0; t < island.treeCount; t++) {
        const o = t * TREE_STRIDE;
        if (island.trees[o] !== index) continue;
        const shade = island.trees[o + 6];
        const bright = materials![placed * 4] + materials![placed * 4 + 1] + materials![placed * 4 + 2];
        lo = Math.min(lo, bright);
        hi = Math.max(hi, bright);
        if (Math.abs(shade) < 0.01) mid = placed;
        placed++;
      }
      expect(hi / lo).toBeGreaterThan(1.1);
      if (mid !== undefined)
        expect(Array.from(materials!.slice(mid * 4, mid * 4 + 3)).map((v) => +v.toFixed(2))).toEqual(
          albedo!.map((v) => +v.toFixed(2)),
        );
      for (let k = 0; k < materials!.length; k += 4) {
        for (let c = 0; c < 3; c++) expect(materials![k + c]).toBeLessThanOrEqual(1);
        expect(materials![k + 3]).toBeGreaterThan(0.5);
      }
    }
  });
});

describe('the pads', () => {
  it('are a slab and its painted marking for every pad, set into the pad and level with its top', () => {
    const { thickness } = ISLAND.pads;
    expect(count('pad slabs')).toBe(island.pads.length);
    expect(count('pad markings')).toBe(island.pads.length);
    island.pads.forEach((pad, k) => {
      const slab = group('pad slabs').matrices,
        mark = group('pad markings').matrices;
      expect([slab[16 * k + 12], slab[16 * k + 13]]).toEqual([pad.x, pad.y]);
      expect(slab[16 * k + 14]).toBeCloseTo(pad.z - thickness, 5);
      expect(mark[16 * k + 14]).toBeCloseTo(pad.z, 5);
      // turned to face where the pad says, and no wider than it is
      expect(slab[16 * k]).toBeCloseTo(Math.cos(pad.yaw) * (pad.radius / ISLAND.pads.radius), 5);
      expect(slab[16 * k + 1]).toBeCloseTo(Math.sin(pad.yaw) * (pad.radius / ISLAND.pads.radius), 5);
      expect(mark.slice(16 * k, 16 * k + 12)).toEqual(slab.slice(16 * k, 16 * k + 12));
    });
  });

  it('have a slab whose top is the thickness of the recipe, over a base which is the ground', () => {
    const { positions } = group('pad slabs').mesh;
    let lo = Infinity,
      hi = -Infinity;
    for (let v = 2; v < positions.length; v += 3) {
      lo = Math.min(lo, positions[v]);
      hi = Math.max(hi, positions[v]);
    }
    expect(lo).toBeCloseTo(0, 5);
    expect(hi).toBeCloseTo(ISLAND.pads.thickness, 5);
  });
});

describe('the structures', () => {
  const NAMES = ['deck', 'rails', 'abutments', 'tower red', 'tower white'];
  /** Each placement of a structure group, as the drawn box's foot's middle, its yaw and its size along, across and up. */
  const boxes = (name: string) =>
    Array.from({ length: count(name) }, (_, k) => {
      const m = group(name).matrices.subarray(16 * k, 16 * k + 16);
      return {
        x: m[12],
        y: m[13],
        z: m[14],
        yaw: Math.atan2(m[1], m[0]),
        length: Math.hypot(m[0], m[1]),
        width: Math.hypot(m[4], m[5]),
        height: m[10],
      };
    });
  type Drawn = ReturnType<typeof boxes>[number];
  /** The corners of `box` in the frame of `block`: along it, across it and up from its foot. */
  const corners = (box: Drawn, block: (typeof STRUCTURES)[number]) => {
    const out: [number, number, number][] = [];
    for (const a of [-0.5, 0.5])
      for (const c of [-0.5, 0.5])
        for (const u of [0, 1]) {
          const wx = box.x + Math.cos(box.yaw) * a * box.length - Math.sin(box.yaw) * c * box.width;
          const wy = box.y + Math.sin(box.yaw) * a * box.length + Math.cos(box.yaw) * c * box.width;
          const dx = wx - block.x,
            dy = wy - block.y;
          out.push([
            dx * Math.cos(block.yaw) + dy * Math.sin(block.yaw),
            -dx * Math.sin(block.yaw) + dy * Math.cos(block.yaw),
            box.z + u * box.height - block.z,
          ]);
        }
    return out;
  };
  /** The drawn boxes standing in `block`: those whose middle is inside it. */
  const drawnIn = (block: (typeof STRUCTURES)[number]) =>
    NAMES.flatMap((name) => boxes(name).map((box) => ({ name, box }))).filter(({ box }) => {
      const dx = box.x - block.x,
        dy = box.y - block.y;
      const along = dx * Math.cos(block.yaw) + dy * Math.sin(block.yaw);
      const across = -dx * Math.sin(block.yaw) + dy * Math.cos(block.yaw);
      const up = box.z + box.height / 2 - block.z;
      return Math.abs(along) < block.length / 2 && Math.abs(across) < block.width / 2 && up > 0 && up < block.height;
    });

  it('draws each one as big as it is solid, out to every face, and no bigger', () => {
    for (const block of STRUCTURES) {
      const drawn = drawnIn(block);
      expect(drawn.length, block.name).toBeGreaterThan(0);
      const lo = [Infinity, Infinity, Infinity],
        hi = [-Infinity, -Infinity, -Infinity];
      for (const { box } of drawn) {
        expect(Math.abs(Math.sin(box.yaw - block.yaw)), `${block.name}: turned with it`).toBeLessThan(1e-6);
        for (const corner of corners(box, block))
          corner.forEach((v, k) => {
            lo[k] = Math.min(lo[k], v);
            hi[k] = Math.max(hi[k], v);
          });
      }
      const size = [block.length / 2, block.width / 2];
      for (let k = 0; k < 2; k++) {
        expect(lo[k], `${block.name} ${k}`).toBeCloseTo(-size[k], 4);
        expect(hi[k], `${block.name} ${k}`).toBeCloseTo(size[k], 4);
      }
      expect(lo[2], `${block.name}: from its foot`).toBeCloseTo(0, 4);
      expect(hi[2], `${block.name}: to its top`).toBeCloseTo(block.height, 4);
    }
    // and nothing drawn that stands in none of them
    const all = NAMES.reduce((n, name) => n + count(name), 0);
    expect(STRUCTURES.reduce((n, block) => n + drawnIn(block).length, 0)).toBe(all);
  });

  /** Whether `name` is painted a strong red, a white, or a grey: as the mock chose, painted steel on stone. */
  const red = (name: string) => {
    const [r, g, b] = group(name).albedo!;
    return r > 4 * g && r > 4 * b;
  };
  const white = (name: string) => Math.min(...group(name).albedo!) > 0.6;
  const grey = (name: string) => {
    const rgb = group(name).albedo!;
    return Math.max(...rgb) - Math.min(...rgb) < 0.05 && Math.max(...rgb) > 0.1 && Math.max(...rgb) < 0.5;
  };

  it('paints the deck red with white rails along both its edges, and the abutments grey', () => {
    expect(red('deck')).toBe(true);
    expect(white('rails')).toBe(true);
    expect(grey('abutments')).toBe(true);
    for (const block of STRUCTURES.filter((b) => b.kind === 'deck')) {
      const drawn = drawnIn(block);
      const slab = drawn.filter(({ name }) => name === 'deck').map(({ box }) => box);
      const rails = drawn.filter(({ name }) => name === 'rails').map(({ box }) => box);
      expect(slab).toHaveLength(1);
      expect(rails).toHaveLength(2);
      // the rails on the slab, at either edge, as long as it
      for (const rail of rails) {
        expect(rail.z).toBeCloseTo(slab[0].z + slab[0].height, 5);
        expect(rail.length).toBeCloseTo(block.length, 5);
      }
      const across = rails.map((r) => -(r.x - block.x) * Math.sin(block.yaw) + (r.y - block.y) * Math.cos(block.yaw));
      expect(Math.sign(across[0])).toBe(-Math.sign(across[1]));
    }
    for (const block of STRUCTURES.filter((b) => b.kind === 'abutment'))
      expect(drawnIn(block).map(({ name }) => name)).toEqual(['abutments']);
  });

  it('bands each tower red and white, seven high from its top down, red first, with no gap and no overlap', () => {
    expect(red('tower red')).toBe(true);
    expect(white('tower white')).toBe(true);
    const towers = STRUCTURES.filter((b) => b.kind === 'tower');
    expect(towers.length).toBeGreaterThan(0);
    for (const tower of towers) {
      const bands = drawnIn(tower).sort((a, b) => b.box.z - a.box.z);
      expect(bands).toHaveLength(Math.ceil(tower.height / 7));
      let top = tower.z + tower.height;
      bands.forEach(({ name, box }, k) => {
        expect(name, `${tower.name} band ${k}`).toBe(k % 2 === 0 ? 'tower red' : 'tower white');
        expect(box.z + box.height).toBeCloseTo(top, 5);
        if (k < bands.length - 1) expect(box.height).toBeCloseTo(7, 5);
        top = box.z;
      });
      expect(top).toBeCloseTo(tower.z, 5);
    }
  });

  it('draws none where there are none', () => {
    const bare = new Scene();
    bare.static(island);
    for (const name of NAMES) expect(bare.names).not.toContain(name);
  });
});

describe('the trees in the downwash', () => {
  /** Each tree's pool and its place in it, worked out from the island as the scene is meant to have laid them out. */
  const placeOf = new Map<number, { pool: Float32Array; slot: number; scale: number }>();
  const fresh = new Scene();
  const freshMovers = fresh.dynamic(island);
  for (const { kind, index } of TREE_KINDS.map((kind, index) => ({ kind, index }))) {
    const pool = movers[scene.movers.indexOf(`${kind} crowns`)].matrices;
    let slot = 0;
    for (let t = 0; t < island.treeCount; t++)
      if (island.trees[t * TREE_STRIDE] === index)
        placeOf.set(t, { pool, slot: slot++, scale: island.trees[t * TREE_STRIDE + 5] });
  }
  const wood = thickestWood();
  const source = {
    x: wood.x,
    y: wood.y,
    z: island.ground.heightAt(wood.x, wood.y) + 4,
    rotorSpeed: HELICOPTER.rotorFull,
  };
  const treePools = () => freshMovers.map((_, k) => k).filter((k) => k >= 6);
  /** Whether every tree but those in `except` stands exactly as the scene first placed it. */
  const standing = (except: Set<number>) => {
    for (const k of treePools()) {
      const now = scene.pools[k],
        was = fresh.pools[k];
      for (let o = 0; o < now.length; o++)
        if (now[o] !== was[o]) {
          const slot = Math.floor(o / 16);
          const kind = scene.movers[k].split(' ')[0];
          const tree = [...placeOf].find(
            ([t, p]) => p.slot === slot && TREE_KINDS[island.trees[t * TREE_STRIDE]] === kind,
          )![0];
          if (!except.has(tree)) return `tree ${tree} moved`;
        }
    }
    return 'all standing';
  };

  it('leans each moving tree from its foot, as the sway says, and leaves every other where it stood', () => {
    const sway = islandSway();
    for (let f = 1; f <= 120; f++) sway.step(DT, source, f * DT);
    expect(sway.count).toBeGreaterThan(20);
    scene.write(pose(), sway);
    const moving = new Set<number>();
    for (let k = 0; k < sway.count; k++) {
      const tree = sway.tree[k];
      moving.add(tree);
      const { pool, slot, scale } = placeOf.get(tree)!;
      const m = Array.from(pool.subarray(slot * 16, slot * 16 + 16));
      const rest = Array.from(fresh.pools[scene.pools.indexOf(pool)].subarray(slot * 16, slot * 16 + 16));
      // the foot, and the axes across the ground, are where they were
      for (const o of [0, 1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15]) expect(m[o], `tree ${tree}, ${o}`).toBe(rest[o]);
      // the up axis tipped by the lean and shortened by the press, so the top moves and the foot does not
      expect(m[8]).toBeCloseTo(sway.leanX[k] * scale, 6);
      expect(m[9]).toBeCloseTo(sway.leanY[k] * scale, 6);
      expect(m[10]).toBeCloseTo(scale * (1 - sway.squash[k]), 6);
    }
    expect(standing(moving)).toBe('all standing');
  });

  it('stands each tree let go exactly as it was, and writes only the kinds that moved', () => {
    const sway = islandSway();
    let t = 0;
    for (let f = 0; f < 120; f++) sway.step(DT, source, (t += DT));
    expect(sway.count).toBeGreaterThan(20);
    scene.write(pose(), sway);
    const kindsMoving = new Set<string>();
    for (let k = 0; k < sway.count; k++) kindsMoving.add(TREE_KINDS[island.trees[sway.tree[k] * TREE_STRIDE]]);
    for (const k of treePools())
      expect(scene.changed[k], scene.movers[k]).toBe(kindsMoving.has(scene.movers[k].split(' ')[0]) ? 1 : 0);
    // flown away and out of reach, until the last of them is still and let go
    const away = { ...source, z: HELICOPTER.ceiling };
    for (let f = 0; f < 600 && sway.count > 0; f++) sway.step(DT, away, (t += DT));
    expect(sway.count).toBe(0);
    scene.write(pose(), sway);
    expect(standing(new Set())).toBe('all standing');
    // the kinds stood up again were written this once, and nothing is written after
    for (const k of treePools())
      expect(scene.changed[k], scene.movers[k]).toBe(kindsMoving.has(scene.movers[k].split(' ')[0]) ? 1 : 0);
    scene.write(pose(), sway);
    for (const k of treePools()) expect(scene.changed[k], scene.movers[k]).toBe(0);
  });
});

/** What a level going is, to the scene: nothing going, or the level, the step wanted and where the parcel is. */
const nothing = { level: null, next: 0, carrying: false, waiting: -1, target: -1 };
const deliveries = LEVELS.filter((l) => l.steps[0].kind === 'pickup');
const noSize = (m: Float32Array, k: number) => Array.from(m.subarray(k * 16, k * 16 + 11)).every((v) => v === 0);
const footOf = (m: Float32Array, k = 0) => [m[k * 16 + 12], m[k * 16 + 13], m[k * 16 + 14]];

describe('the crates', () => {
  const crateScene = new Scene();
  const groups = crateScene.dynamic(island);
  const pool = (name: string) => groups[crateScene.movers.indexOf(name)].matrices;
  const pads = island.pads;
  const far = pose({ x: pads[0].x, y: pads[0].y, z: pads[0].z });
  /** Whether slot `k` of the crates stands on `pad`, out from its middle past the ends of the H. */
  const onPad = (k: number, pad: number) => {
    const [x, y, z] = footOf(pool('crate'), k);
    const p = pads[pad];
    const out = Math.hypot(x - p.x, y - p.y);
    return out > p.radius * 0.5 && out < p.radius * 0.8 && Math.abs(z - p.z) < 1e-4;
  };
  const pickupOf = (level: Level) => (level.steps[0] as { pad: number }).pad;

  it('are a pool sized once: a place for the level going and one for each level that begins with a pickup', () => {
    expect(deliveries).toHaveLength(4);
    expect(groups[crateScene.movers.indexOf('crate')].count).toBe(1 + deliveries.length);
    expect(groups[crateScene.movers.indexOf('crate straps')].count).toBe(1 + deliveries.length);
    expect(pool('crate')).toHaveLength((1 + deliveries.length) * 16);
  });

  it('stand on the four pickup pads at boot, with nothing going, and none is carried', () => {
    crateScene.write(far, undefined, nothing);
    expect(noSize(pool('crate'), 0)).toBe(true);
    deliveries.forEach((level, k) => expect(onPad(1 + k, pickupOf(level)), level.id).toBe(true));
    expect(deliveries.map(pickupOf)).toEqual([4, 3, 7, 2]);
    expect(Array.from(pool('crate straps'))).toEqual(Array.from(pool('crate')));
  });

  it("carry the going level's parcel under the helicopter, and take its crate off its pickup pad", () => {
    const mission = new Mission(pads);
    mission.begin(LEVELS[0]);
    const flying = pose({ x: 40, y: -200, z: 60, yaw: 1.1, pitch: 0.2, roll: -0.1 });
    crateScene.write(flying, undefined, mission);
    const c = pool('crate');
    const body = crateScene.pools[0];
    // the crate's axes are the body's: it is strapped on
    for (const o of [0, 1, 2, 4, 5, 6, 8, 9, 10]) expect(c[o]).toBeCloseTo(body[o], 6);
    const [x, y, z] = footOf(c);
    expect(Math.hypot(x - 40, y + 200)).toBeLessThan(1);
    expect(z).toBeGreaterThan(59);
    expect(z).toBeLessThan(61);
    // its own pickup slot is empty, and the other three stay where they were
    expect(noSize(c, 1)).toBe(true);
    for (const [k, level] of deliveries.slice(1).entries()) expect(onPad(2 + k, pickupOf(level)), level.id).toBe(true);
  });

  it('set the crate on the drop pad once it is delivered, and leave nothing there after the level ends', () => {
    const mission = new Mission(pads);
    mission.begin(LEVELS[0]);
    const drop = (LEVELS[0].steps[1] as { pad: number }).pad;
    const d = pads[drop];
    const at = { x: d.x, y: d.y, z: d.z, landed: true };
    // down on the drop pad and waiting until the parcel is unloaded: the crate waits on that pad while the level is going
    mission.step(0.1, at);
    mission.step(1.6, at);
    expect(mission.level).toBeNull();
    // the parcel set down on the drop pad, drawn there on the last frame of the level
    crateScene.write(far, undefined, { level: LEVELS[0], next: 2, carrying: false, waiting: drop, target: -1 });
    expect(onPad(0, drop)).toBe(true);
    crateScene.write(far, undefined, nothing);
    // the level is over: its crate is back on its pickup pad and nothing is on the drop pad
    expect(onPad(1, pickupOf(LEVELS[0]))).toBe(true);
    for (let k = 0; k < 1 + deliveries.length; k++) {
      const [x, y] = footOf(pool('crate'), k);
      if (noSize(pool('crate'), k)) continue;
      expect(Math.hypot(x - d.x, y - d.y), `crate ${k} clear of the drop pad`).toBeGreaterThan(d.radius);
    }
  });

  it('wait on the drop pad of a level that is going, until it ends', () => {
    const going = { level: LEVELS[0], next: 2, carrying: false, waiting: 1, target: -1 };
    crateScene.write(far, undefined, going);
    expect(onPad(0, 1)).toBe(true);
    expect(noSize(pool('crate'), 1)).toBe(true);
  });

  it('are written every frame the level is told, and not at all without it', () => {
    const k = crateScene.movers.indexOf('crate');
    crateScene.write(far);
    expect(Array.from(crateScene.changed.subarray(k, k + 3))).toEqual([0, 0, 0]);
    crateScene.write(far, undefined, nothing);
    expect(Array.from(crateScene.changed.subarray(k, k + 3))).toEqual([1, 1, 1]);
  });
});

describe('the beacon', () => {
  const beaconScene = new Scene();
  const groups = beaconScene.dynamic(island);
  const beacon = () => groups[beaconScene.movers.indexOf('beacon')].matrices;
  const pads = island.pads;
  const far = pose({ x: pads[0].x, y: pads[0].y, z: pads[0].z });

  it('stands over the pad wanted of the level going, from high up', () => {
    const going = { level: LEVELS[0], next: 1, carrying: true, waiting: -1, target: 1 };
    beaconScene.write(far, undefined, going);
    expect(footOf(beacon()).map((v) => +v.toFixed(3))).toEqual(
      [pads[1].x, pads[1].y, pads[1].z + 20].map((v) => +v.toFixed(3)),
    );
    expect(beacon()[10]).toBe(1);
  });

  it('is out with nothing going, since the user chose no beacons for a start', () => {
    beaconScene.write(far, undefined, nothing);
    expect(noSize(beacon(), 0)).toBe(true);
  });

  it('is out once the helicopter is near the pad', () => {
    const p = pads[1];
    const going = { level: LEVELS[0], next: 1, carrying: true, waiting: -1, target: 1 };
    beaconScene.write(pose({ x: p.x + 30, y: p.y, z: p.z + 10 }), undefined, going);
    expect(noSize(beacon(), 0)).toBe(true);
  });
});

describe('the rings', () => {
  const ringScene = new Scene();
  const ringGroups = ringScene.dynamic(island);
  const pool = (name: string) => ringGroups[ringScene.movers.indexOf(name)].matrices;
  const level = LEVELS.find((l) => l.id === 'ring-trial')!;
  const valley = LEVELS.find((l) => l.id === 'up-the-valley')!;
  const rings = level.steps as Ring[];
  const far = pose({ x: island.pads[0].x, y: island.pads[0].y, z: island.pads[0].z });
  const at = (r: Ring) => [r.x, r.y, r.z].map((v) => +v.toFixed(3));
  const going = (l: Level, next: number) => ({ level: l, next, carrying: false, waiting: -1, target: -1 });
  /** Where each white ring stands, in the slots that are used. */
  const whites = () => {
    const out: number[][] = [];
    for (let k = 0; k < RINGS.capacity; k++)
      if (!noSize(pool('rings'), k)) out.push(footOf(pool('rings'), k).map((v) => +v.toFixed(3)));
    return out;
  };

  it(`has room for ${RINGS.capacity} rings to come, and one lit`, () => {
    expect(ringGroups[ringScene.movers.indexOf('rings')].count).toBe(RINGS.capacity);
    expect(ringGroups[ringScene.movers.indexOf('ring next')].count).toBe(1);
  });

  it('draws every start ring white with nothing going, and none lit', () => {
    ringScene.write(far, undefined, nothing);
    expect(noSize(pool('ring next'), 0)).toBe(true);
    expect(whites()).toEqual([at(rings[0]), at(valley.steps[0] as Ring)]);
  });

  it('lights the ring wanted where it stands, turned the way it faces, draws the rings after it in white, and none passed', () => {
    ringScene.write(far, undefined, going(level, 2));
    const lit = pool('ring next');
    expect(footOf(lit).map((v) => +v.toFixed(3))).toEqual(at(rings[2]));
    expect(lit[0]).toBeCloseTo(Math.cos(rings[2].yaw), 6);
    expect(lit[1]).toBeCloseTo(Math.sin(rings[2].yaw), 6);
    const seen = whites();
    for (const r of rings.slice(3)) expect(seen, 'a ring to come').toContainEqual(at(r));
    for (const r of rings.slice(0, 3)) expect(seen, 'a ring passed or lit').not.toContainEqual(at(r));
  });

  it("draws every other level's start ring white while one goes, and not the going level's own once it is passed", () => {
    ringScene.write(far, undefined, going(level, 1));
    expect(whites()).toContainEqual(at(valley.steps[0] as Ring));
    expect(whites()).not.toContainEqual(at(rings[0]));
    ringScene.write(far, undefined, going(valley, 1));
    expect(whites()).toContainEqual(at(rings[0]));
    expect(whites()).not.toContainEqual(at(valley.steps[0] as Ring));
    // a delivery going leaves both starts drawn
    ringScene.write(far, undefined, going(LEVELS[0], 1));
    expect(whites()).toEqual([at(rings[0]), at(valley.steps[0] as Ring)]);
  });

  it('draws no ring lit once the last is passed, nor for a level of deliveries', () => {
    ringScene.write(far, undefined, going(level, rings.length));
    expect(noSize(pool('ring next'), 0)).toBe(true);
    ringScene.write(far, undefined, going(LEVELS[0], 1));
    expect(noSize(pool('ring next'), 0)).toBe(true);
  });

  it(`never has more than ${RINGS.capacity} drawn, whichever level goes and however far it has got`, () => {
    for (const l of [null, ...LEVELS]) {
      for (let next = 0; next <= (l?.steps.length ?? 0); next++) {
        ringScene.write(far, undefined, l ? going(l, next) : nothing);
        const lit = noSize(pool('ring next'), 0) ? 0 : 1;
        expect(whites().length + lit, `${l?.id ?? 'nothing'} at ${next}`).toBeLessThanOrEqual(RINGS.capacity);
      }
    }
    // the most there is: the valley's rings to come beside the trial's start
    ringScene.write(far, undefined, going(valley, 1));
    expect(whites().length + 1).toBe(valley.steps.length - 1 + 1);
  });

  it('draws a ring of another opening at its size, its tube scaled with it', () => {
    ringScene.write(far, undefined, going(valley, 1));
    const lit = pool('ring next');
    const size = ((valley.steps[1] as Ring).opening + RING.tube) / (10 + RING.tube);
    expect(Math.hypot(lit[0], lit[1])).toBeCloseTo(size, 5);
  });

  it('writes the rings only when what is going or the ring wanted has changed', () => {
    const [a, b] = [ringScene.movers.indexOf('rings'), ringScene.movers.indexOf('ring next')];
    ringScene.write(far, undefined, going(level, 1));
    expect([ringScene.changed[a], ringScene.changed[b]]).toEqual([1, 1]);
    ringScene.write(far, undefined, going(level, 1));
    expect([ringScene.changed[a], ringScene.changed[b]]).toEqual([0, 0]);
    ringScene.write(far, undefined, going(level, 2));
    expect([ringScene.changed[a], ringScene.changed[b]]).toEqual([1, 1]);
    ringScene.write(far, undefined, nothing);
    expect([ringScene.changed[a], ringScene.changed[b]]).toEqual([1, 1]);
  });
});

describe('the start flags', () => {
  const flagScene = new Scene();
  const groups = flagScene.dynamic(island);
  const dark = () => groups[flagScene.movers.indexOf('flags dark')].matrices;
  const light = () => groups[flagScene.movers.indexOf('flags light')].matrices;
  const far = pose({ x: island.pads[0].x, y: island.pads[0].y, z: island.pads[0].z });
  const level = (id: string) => LEVELS.find((l) => l.id === id)!;
  const going = (l: Level) => ({ level: l, next: 1, carrying: false, waiting: -1, target: -1 });
  const used = (m: Float32Array) => {
    const out: number[] = [];
    for (let k = 0; k < m.length / 16; k++) if (!noSize(m, k)) out.push(k);
    return out;
  };
  /** The poles: the placements six units tall, by where their feet stand. */
  const poles = () =>
    used(dark())
      .filter((k) => dark()[k * 16 + 10] === 6)
      .map((k) => footOf(dark(), k).map((v) => +v.toFixed(3)));
  const [west, east] = STRUCTURES.filter((b) => b.kind === 'tower');
  const top = (r: Ring) => [r.x, r.y, r.z + r.opening + 2 * RING.tube].map((v) => +v.toFixed(3));
  const towerTop = (b: typeof west) => [b.x, b.y, b.z + b.height].map((v) => +v.toFixed(3));

  it('are a pool sized once, to the most flags there are, two groups of boxes: the dark and the light', () => {
    const flags = 4;
    expect(groups[flagScene.movers.indexOf('flags dark')].count).toBe(flags * 4);
    expect(groups[flagScene.movers.indexOf('flags light')].count).toBe(flags * 3);
  });

  it('stand on the ring tops and the tower tops with nothing going', () => {
    flagScene.write(far, undefined, nothing);
    expect(poles()).toHaveLength(4);
    expect(poles()).toContainEqual(top(level('ring-trial').steps[0] as Ring));
    expect(poles()).toContainEqual(top(level('up-the-valley').steps[0] as Ring));
    expect(poles()).toContainEqual(towerTop(west));
    expect(poles()).toContainEqual(towerTop(east));
    // each flag is a pole and six squares of cloth, chequered: three of them black and three white
    expect(used(dark())).toHaveLength(4 * 4);
    expect(used(light())).toHaveLength(4 * 3);
  });

  it('are a dark pole 0.3 square and a cloth of 3 by 2 squares of 1.1, across the way the opening faces', () => {
    flagScene.write(far, undefined, nothing);
    const ring = level('ring-trial').steps[0] as Ring;
    const k = used(dark()).find((n) => dark()[n * 16 + 10] === 6 && Math.abs(dark()[n * 16 + 12] - ring.x) < 1e-3)!;
    // 0.3 along and across: the columns of the placement are the box's size turned by the yaw
    expect(Math.hypot(dark()[k * 16], dark()[k * 16 + 1])).toBeCloseTo(0.3, 5);
    expect(Math.hypot(dark()[k * 16 + 4], dark()[k * 16 + 5])).toBeCloseTo(0.3, 5);
    // the cloth is a square 1.1 up and across, thin along the way the opening faces: six squares to a flag
    const squares = (m: Float32Array) => used(m).filter((n) => Math.abs(m[n * 16 + 10] - 1.1) < 1e-4);
    expect(squares(dark())).toHaveLength(4 * 3);
    expect(squares(light())).toHaveLength(4 * 3);
    const cloth = squares(light())[0];
    expect(Math.hypot(light()[cloth * 16], light()[cloth * 16 + 1])).toBeCloseTo(0.12, 5);
    expect(Math.hypot(light()[cloth * 16 + 4], light()[cloth * 16 + 5])).toBeCloseTo(1.1, 5);
  });

  it("are gone while their level is going, and no other level's", () => {
    flagScene.write(far, undefined, going(level('ring-trial')));
    expect(poles()).toHaveLength(3);
    expect(poles()).not.toContainEqual(top(level('ring-trial').steps[0] as Ring));
    expect(poles()).toContainEqual(top(level('up-the-valley').steps[0] as Ring));
    expect(poles()).toContainEqual(towerTop(west));
    flagScene.write(far, undefined, going(level('under-and-between')));
    expect(poles()).toHaveLength(2);
    expect(poles()).not.toContainEqual(towerTop(west));
    expect(poles()).not.toContainEqual(towerTop(east));
    expect(poles()).toContainEqual(top(level('ring-trial').steps[0] as Ring));
    // a delivery going takes none of them
    flagScene.write(far, undefined, going(level('first-delivery')));
    expect(poles()).toHaveLength(4);
  });

  it('leave unused slots at no size, and are written only when what is going changes', () => {
    const [a, b] = [flagScene.movers.indexOf('flags dark'), flagScene.movers.indexOf('flags light')];
    flagScene.write(far, undefined, going(level('under-and-between')));
    expect(used(light())).toHaveLength(2 * 3);
    expect(used(dark())).toHaveLength(2 * 4);
    flagScene.write(far, undefined, going(level('under-and-between')));
    expect([flagScene.changed[a], flagScene.changed[b]]).toEqual([0, 0]);
    flagScene.write(far, undefined, nothing);
    expect([flagScene.changed[a], flagScene.changed[b]]).toEqual([1, 1]);
  });
});

describe('the collected look', () => {
  const goldScene = new Scene();
  const groups = goldScene.dynamic(island);
  const at = goldScene.movers.indexOf('collected');
  const pool = () => groups[at].matrices;
  const far = pose({ x: island.pads[0].x, y: island.pads[0].y, z: island.pads[0].z });
  const collectible = (id: string) => COLLECTIBLES.find((c) => c.id === id)!;
  /** The placements drawn, each as the box it is: its foot's middle, its yaw and its size along, across and up. */
  const drawn = () => {
    const out: { x: number; y: number; z: number; yaw: number; length: number; width: number; height: number }[] = [];
    for (let k = 0; k < pool().length / 16; k++) {
      if (noSize(pool(), k)) continue;
      const m = pool().subarray(16 * k, 16 * k + 16);
      out.push({
        x: m[12],
        y: m[13],
        z: m[14],
        yaw: Math.atan2(m[1], m[0]),
        length: Math.hypot(m[0], m[1]),
        width: Math.hypot(m[4], m[5]),
        height: m[10],
      });
    }
    return out;
  };
  const collect = (...ids: string[]) => goldScene.write(far, undefined, nothing, ids);
  /** Where along and across `block` a placement's middle is, in the block's own frame. */
  const across = (box: { x: number; y: number }, block: { x: number; y: number; yaw: number }) =>
    -(box.x - block.x) * Math.sin(block.yaw) + (box.y - block.y) * Math.cos(block.yaw);

  it('is a pool sized once, with a placement for each tower and each rail of every structure, in the one group', () => {
    const slots = COLLECTIBLES.flatMap((c) => c.blocks).reduce(
      (n, b) => n + (b.kind === 'tower' ? 1 : b.kind === 'deck' ? 2 : 0),
      0,
    );
    expect(slots).toBeGreaterThan(10);
    expect(groups[at].count).toBe(slots);
    expect(pool().length).toBe(slots * 16);
    const again = new Scene();
    const twice = again.dynamic(island);
    again.dynamic(island);
    expect(again.movers.filter((m) => m === 'collected')).toHaveLength(1);
    expect(twice[again.movers.indexOf('collected')].count).toBe(slots);
    // writing it never grows or replaces it
    const before = pool();
    collect(...COLLECTIBLES.map((c) => c.id));
    expect(pool()).toBe(before);
    expect(pool().length).toBe(slots * 16);
  });

  it('is gold, a little brighter than a surface can be, so the glow takes it', () => {
    const [r, g, b] = groups[at].albedo!;
    const linear = (c: number) => (c / 255) ** 2.2 * 1.2;
    expect([r, g, b].map((v) => +v.toFixed(5))).toEqual(
      [linear(0xf0), linear(0xb4), linear(0x29)].map((v) => +v.toFixed(5)),
    );
  });

  it('draws nothing with nothing collected, and nothing for a name it does not know', () => {
    collect();
    expect(drawn()).toEqual([]);
    collect('from-a-later-game');
    expect(drawn()).toEqual([]);
  });

  it('puts a collar round the top of each tower of a pair collected: 0.4 wider on every side, 2.2 tall, its top 0.2 over the tower', () => {
    const pair = collectible('shoulder-towers');
    collect('shoulder-towers');
    const collars = drawn();
    expect(collars).toHaveLength(2);
    for (const tower of pair.blocks) {
      const collar = collars.find((c) => Math.hypot(c.x - tower.x, c.y - tower.y) < 1e-4)!;
      expect(collar, tower.name).toBeDefined();
      expect(Math.sin(collar.yaw - tower.yaw)).toBeCloseTo(0, 5);
      expect(collar.length).toBeCloseTo(tower.length + 0.8, 4);
      expect(collar.width).toBeCloseTo(tower.width + 0.8, 4);
      expect(collar.height).toBeCloseTo(2.2, 5);
      expect(collar.z + collar.height).toBeCloseTo(tower.z + tower.height + 0.2, 4);
    }
  });

  it('covers each rail of a bridge collected in gold, 0.02 larger than the rail on every face, and nothing else of it', () => {
    const bridge = collectible('gorge-bridge');
    const deck = bridge.blocks.find((b) => b.kind === 'deck')!;
    collect('gorge-bridge');
    const covers = drawn();
    expect(covers).toHaveLength(2);
    const railHeight = deck.height - 1.5;
    for (const side of [-1, 1]) {
      const middle = (side * (deck.width - 0.3)) / 2;
      const cover = covers.find((c) => Math.abs(across(c, deck) - middle) < 1e-4)!;
      expect(cover, `rail at ${side}`).toBeDefined();
      expect(Math.sin(cover.yaw - deck.yaw)).toBeCloseTo(0, 5);
      expect(cover.length).toBeCloseTo(deck.length + 0.04, 4);
      expect(cover.width).toBeCloseTo(0.3 + 0.04, 4);
      expect(cover.z).toBeCloseTo(deck.z + 1.5 - 0.02, 4);
      expect(cover.height).toBeCloseTo(railHeight + 0.04, 4);
    }
    // none stands on an abutment, nor on the slab of the deck
    for (const cover of covers) expect(cover.z).toBeGreaterThanOrEqual(deck.z + 1.5 - 0.02 - 1e-4);
  });

  it('draws nothing for a structure not collected, however many others are', () => {
    collect('gorge-bridge', 'lakeside-towers');
    const bridge = collectible('gorge-bridge');
    const lake = collectible('lakeside-towers');
    expect(drawn()).toHaveLength(2 + 2);
    for (const other of COLLECTIBLES.filter((c) => c !== bridge && c !== lake))
      for (const block of other.blocks)
        for (const box of drawn())
          expect(Math.hypot(box.x - block.x, box.y - block.y), `${other.id}`).toBeGreaterThan(1);
    // each draws its own: a pair's two, a bridge's two
    collect('shoulder-towers');
    expect(drawn()).toHaveLength(2);
    collect(...COLLECTIBLES.map((c) => c.id));
    expect(drawn()).toHaveLength(groups[at].count!);
  });

  it('is written only when what is collected changes', () => {
    collect();
    collect('gorge-bridge');
    expect(goldScene.changed[at]).toBe(1);
    collect('gorge-bridge');
    expect(goldScene.changed[at]).toBe(0);
    goldScene.write(far, undefined, undefined, ['gorge-bridge']);
    expect(goldScene.changed[at]).toBe(0);
    collect('gorge-bridge', 'shoulder-towers');
    expect(goldScene.changed[at]).toBe(1);
    // a game begun again, with less collected, is written again, and a read with nothing handed leaves it alone
    collect();
    expect(goldScene.changed[at]).toBe(1);
    expect(drawn()).toEqual([]);
    collect('gorge-bridge');
    goldScene.write(far);
    expect(goldScene.changed[at]).toBe(0);
    expect(drawn()).toHaveLength(2);
  });

  it('counts what is drawn, for the test API', () => {
    collect();
    expect(goldScene.gold).toBe(0);
    collect('gorge-bridge', 'shoulder-towers');
    expect(goldScene.gold).toBe(4);
  });
});

describe('the hidden packages', () => {
  const packScene = new Scene();
  const groups = packScene.dynamic(island);
  const woodAt = packScene.movers.indexOf('packages');
  const strapsAt = packScene.movers.indexOf('package straps');
  const far = pose({ x: island.pads[0].x, y: island.pads[0].y, z: island.pads[0].z });
  const show = (...found: string[]) => packScene.write(far, undefined, nothing, [], found);
  /** The placements drawn, each as the crate it is: where it stands, and its size across and up. */
  const drawn = (pool = packScene.pools[woodAt]) => {
    const out: { slot: number; x: number; y: number; z: number; across: number; up: number }[] = [];
    for (let k = 0; k < pool.length / 16; k++) {
      if (noSize(pool, k)) continue;
      const m = pool.subarray(16 * k, 16 * k + 16);
      out.push({ slot: k, x: m[12], y: m[13], z: m[14], across: Math.hypot(m[0], m[1]), up: m[10] });
    }
    return out;
  };

  it('is a pool of crates and a pool of straps, each sized once to the places there are', () => {
    expect(PACKAGES).toHaveLength(10);
    expect(woodAt).toBeGreaterThan(0);
    expect(strapsAt).toBe(woodAt + 1);
    expect(groups[woodAt].count).toBe(PACKAGES.length);
    expect(groups[strapsAt].count).toBe(PACKAGES.length);
    expect(packScene.pools[woodAt]).toHaveLength(PACKAGES.length * 16);
    expect(packScene.pools[strapsAt]).toHaveLength(PACKAGES.length * 16);
    // made again, there is still the one pair of groups; and written, a pool is neither grown nor swapped
    const again = new Scene();
    again.dynamic(island);
    again.dynamic(island);
    expect(again.movers.filter((m) => m === 'packages')).toHaveLength(1);
    expect(again.movers.filter((m) => m === 'package straps')).toHaveLength(1);
    const before = packScene.pools[woodAt];
    show();
    show(...PACKAGES.map((p) => p.id));
    expect(packScene.pools[woodAt]).toBe(before);
    expect(before).toHaveLength(PACKAGES.length * 16);
  });

  it('is painted weathered blue-grey with dark straps', () => {
    const linear = (hex: number) => [hex >> 16, (hex >> 8) & 255, hex & 255].map((c) => +((c / 255) ** 2.2).toFixed(5));
    expect(Array.from(groups[woodAt].albedo!).map((v) => +v.toFixed(5))).toEqual(linear(0x5f7d96));
    expect(Array.from(groups[strapsAt].albedo!).map((v) => +v.toFixed(5))).toEqual(linear(0x26303a));
  });

  it("stands a crate on each place at its z, one and four tenths of the delivery crate's size, turned a little by its place in the list", () => {
    show();
    const crates = drawn();
    expect(crates).toHaveLength(PACKAGES.length);
    PACKAGES.forEach((p, k) => {
      const c = crates.find((d) => d.slot === k)!;
      expect(c, p.id).toBeDefined();
      expect([c.x, c.y, c.z].map((v) => +v.toFixed(3))).toEqual([p.x, p.y, p.z].map((v) => +v.toFixed(3)));
      expect(c.across).toBeCloseTo(1.4, 5);
      expect(c.up).toBeCloseTo(1.4, 5);
    });
    // turned by the index: no two the same way, and the first not at all
    const yaw = (k: number) => {
      const m = packScene.pools[woodAt].subarray(16 * k, 16 * k + 16);
      return Math.atan2(m[1], m[0]);
    };
    expect(yaw(0)).toBeCloseTo(0, 5);
    expect(new Set(PACKAGES.map((_, k) => yaw(k).toFixed(3))).size).toBe(PACKAGES.length);
    // the straps are on the same places
    expect(Array.from(packScene.pools[strapsAt])).toEqual(Array.from(packScene.pools[woodAt]));
  });

  it('draws none for a package that is found, and the others still', () => {
    show('east-wood', 'west-shore-wood');
    const crates = drawn();
    expect(crates).toHaveLength(PACKAGES.length - 2);
    const slotOf = (id: string) => PACKAGES.findIndex((p) => p.id === id);
    expect(crates.map((c) => c.slot)).not.toContain(slotOf('east-wood'));
    expect(crates.map((c) => c.slot)).not.toContain(slotOf('west-shore-wood'));
    expect(drawn(packScene.pools[strapsAt])).toHaveLength(PACKAGES.length - 2);
    show(...PACKAGES.map((p) => p.id));
    expect(drawn()).toEqual([]);
    // a name the game does not have is not a crate, and takes none away
    show('from-a-later-game');
    expect(drawn()).toHaveLength(PACKAGES.length);
  });

  it('is written only when what is found changes', () => {
    show();
    show('east-wood');
    expect([packScene.changed[woodAt], packScene.changed[strapsAt]]).toEqual([1, 1]);
    show('east-wood');
    expect([packScene.changed[woodAt], packScene.changed[strapsAt]]).toEqual([0, 0]);
    packScene.write(far, undefined, nothing, [], ['east-wood']);
    expect([packScene.changed[woodAt], packScene.changed[strapsAt]]).toEqual([0, 0]);
    show('east-wood', 'west-shore-wood');
    expect(packScene.changed[woodAt]).toBe(1);
    // a game begun again with fewer found is written again, and a read with nothing handed leaves them be
    show();
    expect(packScene.changed[woodAt]).toBe(1);
    expect(drawn()).toHaveLength(PACKAGES.length);
    packScene.write(far);
    expect(packScene.changed[woodAt]).toBe(0);
    expect(drawn()).toHaveLength(PACKAGES.length);
  });

  it('counts what is drawn, for the test API', () => {
    show();
    expect(packScene.packagesDrawn).toBe(PACKAGES.length);
    show('east-wood');
    expect(packScene.packagesDrawn).toBe(PACKAGES.length - 1);
    show(...PACKAGES.map((p) => p.id));
    expect(packScene.packagesDrawn).toBe(0);
  });
});

describe('the rescues', () => {
  const rescueScene = new Scene();
  const rescueGroups = rescueScene.dynamic(island);
  const rescues = LEVELS.filter((l) => l.steps[0].kind === 'winch' || l.steps[0].kind === 'board');
  const spots = rescues.map((l) => l.steps[0] as { x: number; y: number; z: number });
  const at = (name: string) => rescueScene.movers.indexOf(name);
  const poolOf = (name: string) => rescueScene.pools[at(name)];
  const hover = pose({ x: spots[0].x + 2, y: spots[0].y - 1, z: spots[0].z + 10 });
  const going = (level: Level | null) => ({ level, next: level ? 1 : 0, carrying: false, waiting: -1, target: -1 });
  const show = (level: Level | null = null, winching = { spot: null as string | null, share: 0 }) =>
    rescueScene.write(hover, undefined, going(level), [], [], winching);
  const linear = (hex: number) => [hex >> 16, (hex >> 8) & 255, hex & 255].map((c) => +((c / 255) ** 2.2).toFixed(5));
  const colourOf = (name: string, k: number) =>
    Array.from(rescueGroups[at(name)].materials!.subarray(k * 4, k * 4 + 3)).map((v) => +v.toFixed(5));
  /** The boxes drawn in a pool: where each stands, how big it is across and up. */
  const boxOf = (pool: Float32Array, k: number) => {
    const m = pool.subarray(16 * k, 16 * k + 16);
    return { x: m[12], y: m[13], z: m[14], w: Math.hypot(m[0], m[1]), d: Math.hypot(m[4], m[5]), h: m[10] };
  };

  it('are three spots, a person of five boxes at each, in pools sized once, with no boxes of smoke: the flare is particles', () => {
    expect(rescues).toHaveLength(3);
    expect(rescueGroups[at('people')].count).toBe(15);
    expect(rescueGroups[at('winch')].count).toBe(6);
    expect(poolOf('people')).toHaveLength(15 * 16);
    expect(poolOf('winch')).toHaveLength(6 * 16);
    expect(rescueScene.movers).not.toContain('smoke');
    const again = new Scene();
    again.dynamic(island);
    again.dynamic(island);
    expect(again.movers.filter((m) => m === 'people')).toHaveLength(1);
    const before = [poolOf('people'), poolOf('winch')];
    show();
    show(rescues[0], { spot: rescues[0].id, share: 0.5 });
    show();
    expect([poolOf('people'), poolOf('winch')]).toEqual(before);
    before.forEach((p, k) => expect(rescueScene.pools[at(['people', 'winch'][k])]).toBe(p));
  });

  it('stands a person at each spot, about 1.8 tall, in dark legs and an orange jacket, one arm up', () => {
    show();
    spots.forEach((spot, k) => {
      // the sailor stands on the floor of the boat, a little aft of the spot's middle and over the sea
      const boat = rescues[k].id === 'boat-rescue';
      const yaw = (spot as { yaw?: number }).yaw ?? 0;
      const s = boat ? { x: spot.x + Math.cos(yaw) * 0.4, y: spot.y + Math.sin(yaw) * 0.4, z: spot.z + 0.15 } : spot;
      const [left, right, torso, head, arm] = [0, 1, 2, 3, 4].map((b) => boxOf(poolOf('people'), 5 * k + b));
      expect(left.z).toBeCloseTo(s.z, 4);
      expect(right.z).toBeCloseTo(s.z, 4);
      expect(torso.x).toBeCloseTo(s.x, 4);
      expect(torso.y).toBeCloseTo(s.y, 4);
      expect(torso.z).toBeCloseTo(s.z + 0.85, 4);
      expect(head.z + head.h - s.z).toBeCloseTo(1.78, 2);
      // the arm is the tallest part of the jacket's side and stands above the shoulder
      expect(arm.z + arm.h).toBeGreaterThan(head.z + head.h);
      expect(colourOf('people', 5 * k)).toEqual(linear(0x2b3440));
      expect(colourOf('people', 5 * k + 1)).toEqual(linear(0x2b3440));
      expect(colourOf('people', 5 * k + 2)).toEqual(linear(0xff6a1a));
      expect(colourOf('people', 5 * k + 3)).toEqual(linear(0xe0b08a));
      expect(colourOf('people', 5 * k + 4)).toEqual(linear(0xff6a1a));
    });
    expect(rescueScene.peopleDrawn).toBe(3);
  });

  it('draws no person at the level going, and still those of the others', () => {
    show(rescues[1]);
    for (let b = 0; b < 5; b++) {
      expect(noSize(poolOf('people'), 5 + b), `person box ${b}`).toBe(true);
      expect(noSize(poolOf('people'), b)).toBe(false);
      expect(noSize(poolOf('people'), 10 + b)).toBe(false);
    }
    expect(rescueScene.peopleDrawn).toBe(2);
    // a level that is not a rescue takes none away
    show(LEVELS[0]);
    expect(rescueScene.peopleDrawn).toBe(3);
  });

  it('winches the sailor up from the floor of the boat', () => {
    const boat = rescues.findIndex((l) => l.id === 'boat-rescue');
    const spot = spots[boat] as { x: number; y: number; z: number; yaw: number };
    show(null, { spot: rescues[boat].id, share: 0 });
    const [foot, torso] = [0, 2].map((b) => boxOf(poolOf('winch'), b));
    expect(foot.z).toBeCloseTo(spot.z + 0.15, 3);
    expect(torso.x).toBeCloseTo(spot.x + Math.cos(spot.yaw) * 0.4, 3);
    expect(torso.y).toBeCloseTo(spot.y + Math.sin(spot.yaw) * 0.4, 3);
  });

  it('takes the person off the ground at the spot being winched, and no other', () => {
    show(null, { spot: rescues[0].id, share: 0.4 });
    for (let b = 0; b < 5; b++) expect(noSize(poolOf('people'), b)).toBe(true);
    for (let b = 0; b < 5; b++) expect(noSize(poolOf('people'), 5 + b)).toBe(false);
    expect(rescueScene.peopleDrawn).toBe(2);
    // broken off, the person is back
    show(null, { spot: null, share: 0 });
    expect(noSize(poolOf('people'), 0)).toBe(false);
    expect(rescueScene.peopleDrawn).toBe(3);
  });

  it('hangs a dark rope from the helicopter’s belly to the person, who rises up it by the loader’s share', () => {
    const s = spots[0];
    const belly = hover.z + 0.2;
    for (const share of [0.1, 0.5, 0.9]) {
      show(null, { spot: rescues[0].id, share });
      const rope = boxOf(poolOf('winch'), 5);
      const torso = boxOf(poolOf('winch'), 2);
      const foot = boxOf(poolOf('winch'), 0);
      // the rope's top is at the belly, and it hangs under the helicopter
      expect(rope.z + rope.h).toBeCloseTo(belly, 3);
      expect([rope.x, rope.y]).toEqual([expect.closeTo(hover.x, 4), expect.closeTo(hover.y, 4)]);
      // the person is higher the greater the share, from the ground at none to the belly at all
      const base = s.z + share * (belly - 1.8 - s.z);
      expect(foot.z).toBeCloseTo(base, 3);
      expect(torso.z).toBeCloseTo(base + 0.85, 3);
      // the rope ends at the raised hand: its length is what is left between the person and the belly
      expect(rope.h).toBeCloseTo(belly - (base + 1.7), 3);
    }
    show(null, { spot: rescues[0].id, share: 0.2 });
    const short = boxOf(poolOf('winch'), 5).h;
    show(null, { spot: rescues[0].id, share: 0.8 });
    expect(boxOf(poolOf('winch'), 5).h).toBeLessThan(short);
    expect(Array.from(rescueGroups[at('winch')].materials!.subarray(20, 23)).map((v) => +v.toFixed(5))).toEqual(
      linear(0x2b3440),
    );
  });

  it('draws the rope at no size when nothing is winched, and the person on it in their own colours', () => {
    show();
    for (let k = 0; k < 6; k++) expect(noSize(poolOf('winch'), k), `winch box ${k}`).toBe(true);
    show(null, { spot: rescues[0].id, share: 0.5 });
    for (let k = 0; k < 6; k++) expect(noSize(poolOf('winch'), k), `winch box ${k}`).toBe(false);
    expect(colourOf('winch', 2)).toEqual(linear(0xff6a1a));
    show(rescues[0]);
    for (let k = 0; k < 6; k++) expect(noSize(poolOf('winch'), k), `winch box ${k}`).toBe(true);
  });

  it('writes the waiting people only when what is going or what is winched changes, and the rope every frame it is out', () => {
    const [people, winch] = [at('people'), at('winch')];
    const changed = () => [rescueScene.changed[people], rescueScene.changed[winch]];
    show();
    show();
    expect(changed()).toEqual([0, 0]);
    show(rescues[0]);
    expect(changed()[0]).toBe(1);
    show(rescues[0]);
    expect(changed()).toEqual([0, 0]);
    show(null, { spot: rescues[0].id, share: 0.1 });
    expect(changed()).toEqual([1, 1]);
    // the share moves, and so does the helicopter: the rope is written, the rest is not
    show(null, { spot: rescues[0].id, share: 0.2 });
    expect(changed()).toEqual([0, 1]);
    rescueScene.write({ ...hover, x: hover.x + 1 }, undefined, going(null), [], [], {
      spot: rescues[0].id,
      share: 0.2,
    });
    expect(changed()).toEqual([0, 1]);
    // broken off: written once to put it away, and then not again
    show();
    expect(changed()).toEqual([1, 1]);
    show();
    expect(changed()).toEqual([0, 0]);
    // and a read with nothing handed leaves them be
    rescueScene.write(hover);
    expect(changed()).toEqual([0, 0]);
  });

  it('counts what is drawn, for the test API: the people and the rope', () => {
    show();
    expect([rescueScene.peopleDrawn, rescueScene.ropeDrawn]).toEqual([3, false]);
    show(null, { spot: rescues[0].id, share: 0.5 });
    expect([rescueScene.peopleDrawn, rescueScene.ropeDrawn]).toEqual([2, true]);
    show(rescues[2]);
    expect([rescueScene.peopleDrawn, rescueScene.ropeDrawn]).toEqual([2, false]);
    expect([new Scene().peopleDrawn, new Scene().ropeDrawn]).toEqual([0, false]);
  });

  it('draws none where there are no rescues', () => {
    const bare = new Scene(LEVELS.filter((l) => l.kind !== 'rescue'));
    bare.dynamic(island);
    expect(bare.movers).not.toContain('people');
    expect(bare.movers).not.toContain('winch');
    bare.write(hover, undefined, nothing, [], [], { spot: null, share: 0 });
    expect(bare.peopleDrawn).toBe(0);
  });
});

describe('the boat', () => {
  const boatScene = new Scene();
  const groups = boatScene.dynamic(island);
  const rescues = LEVELS.filter((l) => l.steps[0].kind === 'winch' || l.steps[0].kind === 'board');
  const level = rescues.find((l) => l.id === 'boat-rescue')!;
  const spot = level.steps[0] as { x: number; y: number; z: number; yaw: number };
  const at = (name: string) => boatScene.movers.indexOf(name);
  const pool = () => boatScene.pools[at('boat')];
  const hover = pose({ x: spot.x + 2, y: spot.y - 1, z: spot.z + 10 });
  const going = (l: Level | null) => ({ level: l, next: l ? 1 : 0, carrying: false, waiting: -1, target: -1 });
  const show = (l: Level | null = null, winching = { spot: null as string | null, share: 0 }) =>
    boatScene.write(hover, undefined, going(l), [], [], winching);
  const linear = (hex: number) => [hex >> 16, (hex >> 8) & 255, hex & 255].map((c) => +((c / 255) ** 2.2).toFixed(5));
  const colourOf = (k: number) =>
    Array.from(groups[at('boat')].materials!.subarray(k * 4, k * 4 + 3)).map((v) => +v.toFixed(5));
  const box = (k: number) => {
    const m = pool().subarray(16 * k, 16 * k + 16);
    return {
      x: m[12],
      y: m[13],
      z: m[14],
      w: Math.hypot(m[0], m[1]),
      d: Math.hypot(m[4], m[5]),
      h: m[10],
      yaw: Math.atan2(m[1], m[0]),
    };
  };

  it('is one boat of five boxes, in a pool of its own sized once, the same whatever is written', () => {
    expect(groups[at('boat')].count).toBe(5);
    expect(pool()).toHaveLength(5 * 16);
    const before = pool();
    show();
    show(level);
    show(LEVELS[0]);
    expect(pool()).toBe(before);
    expect(boatScene.pools.filter((p) => p === before)).toHaveLength(1);
    const again = new Scene();
    again.dynamic(island);
    again.dynamic(island);
    expect(again.movers.filter((m) => m === 'boat')).toHaveLength(1);
  });

  it('is an orange inflatable: two side tubes and a bow tube 0.7 across, a dark floor and a dark outboard', () => {
    show();
    const [port, starboard, bow, floor, outboard] = [0, 1, 2, 3, 4].map(box);
    for (const tube of [port, starboard]) {
      expect(tube.d).toBeCloseTo(0.7, 4);
      expect(tube.w).toBeGreaterThan(3);
    }
    expect(bow.w).toBeCloseTo(0.7, 4);
    expect(bow.d).toBeGreaterThan(2);
    [0, 1, 2].forEach((k) => expect(colourOf(k)).toEqual(linear(0xff6a1a)));
    expect(colourOf(3)).toEqual(linear(0x3b3f46));
    expect(colourOf(4)).toEqual(linear(0x2b3440));
    // the tubes are either side of the floor, which lies between them, and the outboard is aft of it
    const turn = (b: { x: number; y: number }) => {
      const [c, s] = [Math.cos(spot.yaw), Math.sin(spot.yaw)];
      return { forward: (b.x - spot.x) * c + (b.y - spot.y) * s, across: -(b.x - spot.x) * s + (b.y - spot.y) * c };
    };
    expect(turn(port).across).toBeGreaterThan(0.5);
    expect(turn(starboard).across).toBeLessThan(-0.5);
    expect(Math.abs(turn(floor).across)).toBeLessThan(1e-3);
    expect(turn(bow).forward).toBeGreaterThan(1.5);
    expect(turn(outboard).forward).toBeLessThan(-1.5);
  });

  it('sits on the sea at the spot, turned as the spot says, the floor over the water and the tubes standing out of it', () => {
    show();
    for (let k = 0; k < 5; k++) expect(box(k).yaw, `box ${k}`).toBeCloseTo(spot.yaw, 4);
    const [port, , , floor] = [0, 1, 2, 3].map(box);
    expect(floor.x).toBeCloseTo(spot.x, 4);
    expect(floor.y).toBeCloseTo(spot.y, 4);
    // the foot of the hull is just under the surface and the top of a tube well over it
    expect(port.z).toBeLessThan(spot.z);
    expect(port.z).toBeGreaterThan(spot.z - 0.3);
    expect(port.z + port.h).toBeGreaterThan(spot.z + 0.4);
    // the surface is where the island puts the sea
    expect(openWaterOf(island).surfaceAt(spot.x, spot.y)).toBeCloseTo(spot.z, 3);
  });

  it('is drawn while its rescue waits, while its sailor is on the rope, and stays, empty, once the sailor is winched', () => {
    show();
    expect(boatScene.boatsDrawn).toBe(1);
    show(null, { spot: level.id, share: 0.5 });
    expect(boatScene.boatsDrawn).toBe(1);
    // winched: the level is going, the sailor is aboard the helicopter, and the boat they left is still on the sea
    show(level);
    expect(boatScene.boatsDrawn).toBe(1);
    for (let k = 0; k < 5; k++) expect(noSize(pool(), k), `box ${k}`).toBe(false);
    // whatever else is going, and once its level ends
    show(LEVELS[0]);
    expect(boatScene.boatsDrawn).toBe(1);
    show();
    expect(boatScene.boatsDrawn).toBe(1);
  });

  it('is written only when what is going changes', () => {
    const boat = at('boat');
    show();
    show();
    expect(boatScene.changed[boat]).toBe(0);
    show(level);
    expect(boatScene.changed[boat]).toBe(1);
    show(level);
    expect(boatScene.changed[boat]).toBe(0);
    // the winch's share is the people's and the rope's business, not the boat's
    show(null, { spot: level.id, share: 0.3 });
    show(null, { spot: level.id, share: 0.6 });
    expect(boatScene.changed[boat]).toBe(0);
  });

  it('is drawn for the rescue with a boat and for no other, and none where there is none', () => {
    expect(boatScene.boatsDrawn).toBeLessThanOrEqual(1);
    const bare = new Scene(LEVELS.filter((l) => l.id !== 'boat-rescue'));
    bare.dynamic(island);
    expect(bare.movers).not.toContain('boat');
    expect(bare.boatsDrawn).toBe(0);
    expect(new Scene().boatsDrawn).toBe(0);
  });
});

describe('the fires on the ground', () => {
  const fireScene = new Scene();
  const groups = fireScene.dynamic(island);
  const patches = FIRES.flatMap((f) => f.patches);
  const at = (name: string) => fireScene.movers.indexOf(name);
  const poolOf = (name: string) => fireScene.pools[at(name)];
  const hover = pose({ x: 0, y: 0, z: 40 });
  /** Each fire's patches as these say, written to the scene, with nothing going. */
  const show = (states: (fire: number, patch: number) => number) =>
    fireScene.write(hover, undefined, nothing, [], [], undefined, {
      fires: FIRES.map((f, i) => ({ states: Uint8Array.from(f.patches, (_, k) => states(i, k)) })),
    });
  const burningAll = () => show(() => PATCH.burning);
  const linear = (hex: number) => [hex >> 16, (hex >> 8) & 255, hex & 255].map((c) => (c / 255) ** 2.2);
  const boxOf = (pool: Float32Array, k: number) => {
    const m = pool.subarray(16 * k, 16 * k + 16);
    return {
      x: m[12],
      y: m[13],
      z: m[14],
      w: Math.hypot(m[0], m[1]),
      d: Math.hypot(m[4], m[5]),
      h: m[10],
      yaw: Math.atan2(m[1], m[0]),
    };
  };

  it('are two pools sized once to every fire’s patches, the same pools whatever is written', () => {
    expect(patches).toHaveLength(60);
    for (const name of ['burning ground', 'burnt ground']) {
      expect(groups[at(name)].count).toBe(60);
      expect(poolOf(name)).toHaveLength(60 * 16);
    }
    const before = [poolOf('burning ground'), poolOf('burnt ground')];
    burningAll();
    show(() => PATCH.out);
    show(() => PATCH.unburnt);
    expect([poolOf('burning ground'), poolOf('burnt ground')]).toEqual(before);
    before.forEach((p, k) => expect(fireScene.pools[at(['burning ground', 'burnt ground'][k])]).toBe(p));
    const again = new Scene();
    again.dynamic(island);
    again.dynamic(island);
    expect(again.movers.filter((m) => m === 'burning ground')).toHaveLength(1);
  });

  it('glows under a burning patch: orange ground 7 across and a quarter thick on the ground there, its colour raised so that it blooms', () => {
    burningAll();
    patches.forEach((p, k) => {
      const b = boxOf(poolOf('burning ground'), k);
      expect([b.x, b.y, b.z]).toEqual([expect.closeTo(p.x, 4), expect.closeTo(p.y, 4), expect.closeTo(p.z, 4)]);
      expect([b.w, b.d, b.h]).toEqual([expect.closeTo(7, 4), expect.closeTo(7, 4), expect.closeTo(0.25, 4)]);
      expect(noSize(poolOf('burnt ground'), k)).toBe(true);
    });
    const orange = linear(0xd8461f);
    groups[at('burning ground')].albedo!.forEach((c, k) => expect(c).toBeCloseTo(orange[k] * 1.5, 5));
  });

  it('leaves burnt ground under a patch that is out: dark, 7.5 across and a hair thick, just over the ground', () => {
    show(() => PATCH.out);
    patches.forEach((p, k) => {
      const b = boxOf(poolOf('burnt ground'), k);
      expect([b.x, b.y]).toEqual([expect.closeTo(p.x, 4), expect.closeTo(p.y, 4)]);
      expect(b.z).toBeGreaterThan(p.z);
      expect(b.z - p.z).toBeLessThan(0.1);
      expect([b.w, b.d, b.h]).toEqual([expect.closeTo(7.5, 4), expect.closeTo(7.5, 4), expect.closeTo(0.06, 4)]);
      expect(noSize(poolOf('burning ground'), k)).toBe(true);
    });
    const dark = linear(0x2a241f);
    groups[at('burnt ground')].albedo!.forEach((c, k) => expect(c).toBeCloseTo(dark[k], 5));
  });

  it('draws nothing for a patch not yet lit, and only the patches there are in each state', () => {
    show((_, k) => [PATCH.burning, PATCH.out, PATCH.unburnt][k % 3]);
    patches.forEach((_, k) => {
      const state = (k % 20) % 3;
      expect(noSize(poolOf('burning ground'), k), `burning ${k}`).toBe(state !== 0);
      expect(noSize(poolOf('burnt ground'), k), `burnt ${k}`).toBe(state !== 1);
    });
  });

  it('turns each patch by a fixed yaw of its own, the same in both pools and every time it is written', () => {
    burningAll();
    const yaws = patches.map((_, k) => +boxOf(poolOf('burning ground'), k).yaw.toFixed(4));
    expect(new Set(yaws.slice(0, 20)).size).toBe(20);
    show(() => PATCH.out);
    expect(patches.map((_, k) => +boxOf(poolOf('burnt ground'), k).yaw.toFixed(4))).toEqual(yaws);
    burningAll();
    expect(patches.map((_, k) => +boxOf(poolOf('burning ground'), k).yaw.toFixed(4))).toEqual(yaws);
  });

  it('is written only when a patch changes state, and not at all when none is handed', () => {
    const changed = () => [fireScene.changed[at('burning ground')], fireScene.changed[at('burnt ground')]];
    burningAll();
    burningAll();
    expect(changed()).toEqual([0, 0]);
    show((f, k) => (f === 1 && k === 3 ? PATCH.out : PATCH.burning));
    expect(changed()).toEqual([1, 1]);
    show((f, k) => (f === 1 && k === 3 ? PATCH.out : PATCH.burning));
    expect(changed()).toEqual([0, 0]);
    // the helicopter moving writes nothing of them
    fireScene.write({ ...hover, x: 50 }, undefined, nothing, [], [], undefined, {
      fires: FIRES.map((f, i) => ({ states: Uint8Array.from(f.patches, (_, k) => (i === 1 && k === 3 ? 2 : 1)) })),
    });
    expect(changed()).toEqual([0, 0]);
    fireScene.write(hover);
    expect(changed()).toEqual([0, 0]);
    // the first write, for a scene that has not seen any, is a write
    const fresh = new Scene();
    fresh.dynamic(island);
    fresh.write(hover, undefined, nothing, [], [], undefined, {
      fires: FIRES.map((f) => ({ states: new Uint8Array(f.patches.length) })),
    });
    expect(fresh.changed[fresh.movers.indexOf('burning ground')]).toBe(1);
  });

  it('counts what is drawn, for the test API: the patches glowing and the patches burnt', () => {
    show((_, k) => [PATCH.burning, PATCH.out, PATCH.unburnt][k % 3]);
    // twenty patches a fire: seven burning, seven burnt and six not yet lit in a fire, as k % 3 falls
    const of = (state: number) => FIRES.reduce((n, f) => n + f.patches.filter((_, k) => k % 3 === state).length, 0);
    expect(fireScene.groundDrawn).toEqual({ burning: of(0), burnt: of(1) });
    burningAll();
    expect(fireScene.groundDrawn).toEqual({ burning: 60, burnt: 0 });
    show(() => PATCH.unburnt);
    expect(fireScene.groundDrawn).toEqual({ burning: 0, burnt: 0 });
    expect(new Scene().groundDrawn).toEqual({ burning: 0, burnt: 0 });
  });

  it('draws none where there are no fires', () => {
    const bare = new Scene(LEVELS, COLLECTIBLES, PACKAGES, []);
    bare.dynamic(island);
    expect(bare.movers).not.toContain('burning ground');
    expect(bare.movers).not.toContain('burnt ground');
    bare.write(hover);
  });
});

describe('the bucket', () => {
  const bucketScene = new Scene();
  const groups = bucketScene.dynamic(island);
  const at = (name: string) => bucketScene.movers.indexOf(name);
  const poolOf = (name: string) => bucketScene.pools[at(name)];
  const heli = pose({ x: 100, y: -50, z: 60, yaw: 0.7 });
  const hang = (over: Partial<BucketPose> = {}): BucketPose => ({
    out: true,
    hung: true,
    full: false,
    line: BUCKET.line,
    bottom: heli.z - BUCKET.line - BUCKET.height,
    ...over,
  });
  const show = (bucket: BucketPose, p = heli) =>
    bucketScene.write(p, undefined, nothing, [], [], undefined, { bucket });
  const linear = (hex: number) => [hex >> 16, (hex >> 8) & 255, hex & 255].map((c) => (c / 255) ** 2.2);
  const boxOf = (pool: Float32Array) => ({
    x: pool[12],
    y: pool[13],
    z: pool[14],
    w: Math.hypot(pool[0], pool[1]),
    d: Math.hypot(pool[4], pool[5]),
    h: pool[10],
  });

  it('is three single placements, sized once: a dark line, an orange bucket and the water in it', () => {
    for (const name of ['bucket line', 'bucket', 'bucket water']) {
      expect(groups[at(name)].count).toBe(1);
      expect(poolOf(name)).toHaveLength(16);
    }
    const [line, bucket, water] = ['bucket line', 'bucket', 'bucket water'].map((n) => groups[at(n)].albedo!);
    line.forEach((c, k) => expect(c).toBeCloseTo(linear(0x2b3440)[k], 5));
    bucket.forEach((c, k) => expect(c).toBeCloseTo(linear(0xff6a1a)[k], 5));
    // the water glows, a fifth over its own blue
    water.forEach((c, k) => expect(c).toBeCloseTo(linear(0x3f8fe0)[k] * BUCKET.water.glow, 5));
  });

  it('hangs plumb under the helicopter: the line from the skids down to the bucket, which stands under it', () => {
    show(hang());
    const line = boxOf(poolOf('bucket line'));
    const bucket = boxOf(poolOf('bucket'));
    expect([line.x, line.y]).toEqual([expect.closeTo(heli.x, 4), expect.closeTo(heli.y, 4)]);
    expect([bucket.x, bucket.y]).toEqual([expect.closeTo(heli.x, 4), expect.closeTo(heli.y, 4)]);
    expect([line.w, line.d]).toEqual([expect.closeTo(BUCKET.rope, 5), expect.closeTo(BUCKET.rope, 5)]);
    expect([bucket.w, bucket.d, bucket.h]).toEqual([
      expect.closeTo(BUCKET.width, 5),
      expect.closeTo(BUCKET.width, 5),
      expect.closeTo(BUCKET.height, 5),
    ]);
    // the bucket's bottom where it is told, its top where the line starts, and the line up to the skids
    expect(bucket.z).toBeCloseTo(heli.z - BUCKET.line - BUCKET.height, 4);
    expect(line.z).toBeCloseTo(bucket.z + BUCKET.height, 4);
    expect(line.z + line.h).toBeCloseTo(heli.z, 4);
    expect(line.h).toBeCloseTo(BUCKET.line, 4);
  });

  it('shortens its line with the helicopter coming down, and is written every frame it hangs', () => {
    show(hang({ line: 2, bottom: heli.z - 2 - BUCKET.height }));
    expect(boxOf(poolOf('bucket line')).h).toBeCloseTo(2, 4);
    expect(boxOf(poolOf('bucket line')).z + 2).toBeCloseTo(heli.z, 4);
    expect([
      bucketScene.changed[at('bucket line')],
      bucketScene.changed[at('bucket')],
      bucketScene.changed[at('bucket water')],
    ]).toEqual([1, 1, 1]);
    show(hang({ line: 2, bottom: heli.z - 2 - BUCKET.height }));
    expect(bucketScene.changed[at('bucket line')]).toBe(1);
  });

  it('shows water at its rim with the tank full, a flat blue top a little narrower than the bucket, and none when empty', () => {
    show(hang({ full: false }));
    expect(noSize(poolOf('bucket water'), 0)).toBe(true);
    show(hang({ full: true }));
    const bucket = boxOf(poolOf('bucket'));
    const water = boxOf(poolOf('bucket water'));
    expect([water.w, water.d, water.h]).toEqual([
      expect.closeTo(BUCKET.water.across, 5),
      expect.closeTo(BUCKET.water.across, 5),
      expect.closeTo(BUCKET.water.thick, 5),
    ]);
    expect(water.w).toBeLessThan(bucket.w);
    expect(water.z + water.h).toBeCloseTo(bucket.z + bucket.h, 4);
    expect([water.x, water.y]).toEqual([expect.closeTo(bucket.x, 4), expect.closeTo(bucket.y, 4)]);
  });

  it('is stowed when it does not hang: drawn at no size, written once to put it away and then not again', () => {
    show(hang());
    show(hang({ hung: false, line: 0, bottom: heli.z }));
    for (const name of ['bucket line', 'bucket', 'bucket water']) {
      expect(noSize(poolOf(name), 0), name).toBe(true);
      expect(bucketScene.changed[at(name)], name).toBe(1);
    }
    show(hang({ hung: false, line: 0, bottom: heli.z }));
    for (const name of ['bucket line', 'bucket', 'bucket water']) expect(bucketScene.changed[at(name)], name).toBe(0);
    // a read with none handed leaves it be
    bucketScene.write(heli);
    expect(bucketScene.changed[at('bucket')]).toBe(0);
  });

  it('says what is drawn, for the test API: whether it hangs, how long its line is and whether it holds water', () => {
    show(hang({ full: true, line: 3, bottom: heli.z - 3 - BUCKET.height }));
    expect(bucketScene.bucketDrawn.hung).toBe(true);
    expect(bucketScene.bucketDrawn.full).toBe(true);
    expect(bucketScene.bucketDrawn.line).toBeCloseTo(3, 4);
    show(hang({ hung: false, line: 0, bottom: heli.z }));
    expect(bucketScene.bucketDrawn).toEqual({ hung: false, full: false, line: 0 });
    expect(new Scene().bucketDrawn).toEqual({ hung: false, full: false, line: 0 });
  });
});
