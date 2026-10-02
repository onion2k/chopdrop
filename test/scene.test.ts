/**
 * The scene: the helicopter's six groups, placed from a pose as the frame, the mast and the tail say, and the
 * island's, a mesh for each thing it is made of. No GPU is needed, since meshes are plain arrays; the island is built
 * once for the file, since it takes most of a second.
 */
import { describe, expect, it } from 'vitest';
import { ISLAND, LEVELS, STRUCTURES, TREE_KINDS, theIsland } from '../src/arena';
import { RINGS, type Ring } from '../src/mission';
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
import { DT, islandSway, padsOf, thickestWood } from './helpers';

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
    expect(scene.movers.slice(6, -5)).toEqual(TREE_KINDS.flatMap((kind) => [`${kind} trunks`, `${kind} crowns`]));
    expect(scene.movers.slice(-5)).toEqual(['crate', 'crate straps', 'beacon', 'rings', 'ring next']);
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

describe('the parcel and the beacon', () => {
  const parcelScene = new Scene();
  const parcelGroups = parcelScene.dynamic(island);
  const at = (name: string) => parcelGroups[parcelScene.movers.indexOf(name)].matrices;
  const [pickup, drop] = padsOf(LEVELS[0]);
  const pads = island.pads;
  const far = pose({ x: pads[0].x, y: pads[0].y, z: pads[0].z });
  const foot = (m: Float32Array) => [m[12], m[13], m[14]];

  it('stands the crate on the pickup pad, beside its middle, and the beacon over that pad from high up', () => {
    parcelScene.write(far, undefined, { carrying: false, waiting: pickup, target: pickup });
    const p = pads[pickup];
    const [x, y, z] = foot(at('crate'));
    expect(z).toBeCloseTo(p.z, 4);
    const out = Math.hypot(x - p.x, y - p.y);
    expect(out).toBeGreaterThan(p.radius * 0.5);
    expect(out).toBeLessThan(p.radius * 0.8);
    expect(Array.from(at('crate straps'))).toEqual(Array.from(at('crate')));
    const b = at('beacon');
    expect(foot(b).map((v) => +v.toFixed(3))).toEqual([p.x, p.y, p.z + 20].map((v) => +v.toFixed(3)));
    expect(b[10]).toBe(1);
  });

  it('carries the crate under the helicopter, turning and tilting with it, and moves the beacon to the drop pad', () => {
    const flying = pose({ x: 40, y: -200, z: 60, yaw: 1.1, pitch: 0.2, roll: -0.1 });
    parcelScene.write(flying, undefined, { carrying: true, waiting: -1, target: drop });
    const c = at('crate');
    const body = parcelScene.pools[0];
    // the crate's axes are the body's: it is strapped on
    for (const o of [0, 1, 2, 4, 5, 6, 8, 9, 10]) expect(c[o]).toBeCloseTo(body[o], 6);
    const [x, y, z] = foot(c);
    expect(Math.hypot(x - 40, y + 200)).toBeLessThan(1);
    expect(z).toBeGreaterThan(59);
    expect(z).toBeLessThan(61);
    expect(foot(at('beacon'))[0]).toBeCloseTo(pads[drop].x, 4);
  });

  it('puts the beacon out once the helicopter is near the pad, and once the parcel is delivered, and leaves the crate on the drop pad', () => {
    const p = pads[pickup];
    parcelScene.write(pose({ x: p.x + 30, y: p.y, z: p.z + 10 }), undefined, {
      carrying: false,
      waiting: pickup,
      target: pickup,
    });
    expect(Array.from(at('beacon').subarray(0, 11)).every((v) => v === 0)).toBe(true);
    parcelScene.write(far, undefined, { carrying: false, waiting: drop, target: -1 });
    expect(Array.from(at('beacon').subarray(0, 11)).every((v) => v === 0)).toBe(true);
    const d = pads[drop];
    const [x, y, z] = foot(at('crate'));
    expect(Math.hypot(x - d.x, y - d.y)).toBeLessThan(d.radius * 0.8);
    expect(z).toBeCloseTo(d.z, 4);
  });

  it('draws no crate where the level has no parcel, aboard or on a pad', () => {
    parcelScene.write(far, undefined, { carrying: false, waiting: -1, target: pickup });
    expect(Array.from(at('crate').subarray(0, 11)).every((v) => v === 0)).toBe(true);
    expect(Array.from(at('crate straps'))).toEqual(Array.from(at('crate')));
  });

  it('writes the parcel and the beacon every frame, and only when told where the level is', () => {
    const k = parcelScene.movers.indexOf('crate');
    parcelScene.write(far);
    expect(Array.from(parcelScene.changed.subarray(k, k + 3))).toEqual([0, 0, 0]);
    parcelScene.write(far, undefined, { carrying: false, waiting: pickup, target: pickup });
    expect(Array.from(parcelScene.changed.subarray(k, k + 3))).toEqual([1, 1, 1]);
  });
});

describe('the rings', () => {
  const ringScene = new Scene();
  const ringGroups = ringScene.dynamic(island);
  const pool = (name: string) => ringGroups[ringScene.movers.indexOf(name)].matrices;
  const level = LEVELS.find((l) => l.id === 'ring-trial')!;
  const rings = level.steps as Ring[];
  const far = pose({ x: island.pads[0].x, y: island.pads[0].y, z: island.pads[0].z });
  const foot = (m: Float32Array, k = 0) => [m[k * 16 + 12], m[k * 16 + 13], m[k * 16 + 14]];
  const none = (m: Float32Array, k: number) => Array.from(m.subarray(k * 16, k * 16 + 11)).every((v) => v === 0);

  it(`has room for ${RINGS.capacity} rings to come, and one lit`, () => {
    expect(ringGroups[ringScene.movers.indexOf('rings')].count).toBe(RINGS.capacity);
    expect(ringGroups[ringScene.movers.indexOf('ring next')].count).toBe(1);
  });

  it('lights the ring wanted where it stands, turned the way it faces, draws the rings after it in white, and none passed', () => {
    ringScene.write(far, undefined, undefined, { level, next: 2 });
    const lit = pool('ring next');
    expect(foot(lit).map((v) => +v.toFixed(3))).toEqual([rings[2].x, rings[2].y, rings[2].z].map((v) => +v.toFixed(3)));
    expect(lit[0]).toBeCloseTo(Math.cos(rings[2].yaw), 6);
    expect(lit[1]).toBeCloseTo(Math.sin(rings[2].yaw), 6);
    const later = pool('rings');
    for (let k = 0; k < 3; k++)
      expect(foot(later, k).map((v) => +v.toFixed(3))).toEqual(
        [rings[3 + k].x, rings[3 + k].y, rings[3 + k].z].map((v) => +v.toFixed(3)),
      );
    for (let k = 3; k < RINGS.capacity; k++) expect(none(later, k), `slot ${k}`).toBe(true);
  });

  it('draws no ring at all once the last is passed, nor for a level of deliveries', () => {
    ringScene.write(far, undefined, undefined, { level, next: rings.length });
    expect(none(pool('ring next'), 0)).toBe(true);
    for (let k = 0; k < RINGS.capacity; k++) expect(none(pool('rings'), k)).toBe(true);
    ringScene.write(far, undefined, undefined, { level: LEVELS[0], next: 0 });
    expect(none(pool('ring next'), 0)).toBe(true);
    for (let k = 0; k < RINGS.capacity; k++) expect(none(pool('rings'), k)).toBe(true);
  });

  it('writes the rings only when the level or the ring wanted has changed', () => {
    const [a, b] = [ringScene.movers.indexOf('rings'), ringScene.movers.indexOf('ring next')];
    ringScene.write(far, undefined, undefined, { level, next: 1 });
    expect([ringScene.changed[a], ringScene.changed[b]]).toEqual([1, 1]);
    ringScene.write(far, undefined, undefined, { level, next: 1 });
    expect([ringScene.changed[a], ringScene.changed[b]]).toEqual([0, 0]);
    ringScene.write(far, undefined, undefined, { level, next: 2 });
    expect([ringScene.changed[a], ringScene.changed[b]]).toEqual([1, 1]);
    ringScene.write(far, undefined, undefined, { level: LEVELS[0], next: 0 });
    expect([ringScene.changed[a], ringScene.changed[b]]).toEqual([1, 1]);
  });
});
