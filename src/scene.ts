/**
 * The world as it is drawn: the island, which does not move, and the
 * helicopter and the trees, which do. The island is the land in a mesh for
 * each thing it is made of, the sea, the lakes and the rivers as flat water,
 * and the landing pads. The helicopter is a group for each of its colours and
 * one for each rotor, and the trees a pair of instanced groups a kind, which
 * move with it since a group set as still cannot be written again. The island
 * is built once, at boot, from the typed arrays the generator made; the moving
 * groups are fixed once, and each frame only where everything is written into
 * them, and `changed` says which. It is handed what it draws from, and never
 * the renderer. Without it the page has nothing to hand the renderer, and
 * nothing is seen.
 */
import { MATERIAL_STRIDE, type GameGroup } from 'artshape-render/game/renderer';
import type { Box } from 'artshape-render/game/shadows';
import type { Mesh } from 'artshape-render/mesh/types';
import { ISLAND, TREE_KINDS } from './arena';
import { HELICOPTER } from './helicopter';
import { SEA, SURFACE, TREE_STRIDE, type Island, type Pad, type River } from './island';
import type { Sway } from './sway';
import { lean, place, placeFrame, placePart } from './matrix';
import {
  beacon,
  crate,
  helicopterBody,
  helicopterDark,
  helicopterGlass,
  helicopterTrim,
  mainRotor,
  padMarking,
  padSlab,
  tailRotor,
  treeShape,
} from './meshes';

/** Where the helicopter is and how it is tilted and spinning: what the scene draws it from. */
export interface HelicopterPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  rotor: number;
  tailRotor: number;
}

/** A colour and how rough it is: what a group is painted with. */
type Rgb = [number, number, number];
interface Paint {
  albedo: Rgb;
  roughness: number;
}

/**
 * A colour as it is meant to be seen, written as hex, in the linear light the renderer lights: it shows the frame
 * through a gamma of 2.2, so a colour handed over as it looks on screen comes out far too pale.
 */
const seen = (hex: number): Rgb => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => (c / 255) ** 2.2) as Rgb;

/** The helicopter's paint, each named once: the shell, the cream trim on it, the glass, and the dark metal the rotors share. */
const BODY_PAINT: Paint = { albedo: seen(0xe8501c), roughness: 0.5 };
const TRIM_PAINT: Paint = { albedo: seen(0xf3ead2), roughness: 0.5 };
const GLASS_PAINT: Paint = { albedo: seen(0x3b6a8c), roughness: 0.15 };
const DARK_PAINT: Paint = { albedo: seen(0x2a2c33), roughness: 0.6 };

/**
 * What the ground is made of, by surface. They are matte, since a toon look gives a glint to anything under a
 * roughness of 0.8, and grass, sand and stone are not shiny. The greens are a family: the meadow the lightest and the
 * forest floor the darkest, so a hillside reads in patches before a tree is seen.
 */
const TERRAIN_PAINT: Record<number, { name: string; paint: Paint }> = {
  [SURFACE.sand]: { name: 'sand', paint: { albedo: seen(0xecd08c), roughness: 0.95 } },
  [SURFACE.grass]: { name: 'grass', paint: { albedo: seen(0x5db83a), roughness: 0.95 } },
  [SURFACE.meadow]: { name: 'meadow', paint: { albedo: seen(0x95d14f), roughness: 0.95 } },
  [SURFACE.forest]: { name: 'forest', paint: { albedo: seen(0x3a8f33), roughness: 0.95 } },
  [SURFACE.gully]: { name: 'gully', paint: { albedo: seen(0x4a9a36), roughness: 0.95 } },
  [SURFACE.rock]: { name: 'rock', paint: { albedo: seen(0x8d837b), roughness: 0.95 } },
  [SURFACE.snow]: { name: 'snow', paint: { albedo: seen(0xf4f8ff), roughness: 0.9 } },
  [SURFACE.dirt]: { name: 'dirt', paint: { albedo: seen(0xa9784a), roughness: 0.95 } },
};

/**
 * The water. The sea is two blues and the deeper one runs on beyond the grid to the horizon; the lakes and rivers
 * are a fresher blue. The shallows, the lakes and the rivers are glossy, so the sun glances off them, but the open
 * sea is matte: a glossy sea reflects the sky at a graze, and the nearer the horizon the more, so far out, where
 * the haze has not quite taken it, it was paler than the sky above it, and the sea's cut edge at the far plane
 * showed as a hard line across the sky. A matte sea fades into the haze by the same arithmetic as the sky does.
 */
const SHALLOW_PAINT: Paint = { albedo: seen(0x3fd0d4), roughness: 0.2 };
const DEEP_PAINT: Paint = { albedo: seen(0x1f67c9), roughness: 0.9 };
const LAKE_PAINT: Paint = { albedo: seen(0x2a8ae0), roughness: 0.2 };
const RIVER_PAINT: Paint = { albedo: seen(0x36a0f0), roughness: 0.2 };

/** The pads: grey concrete with white paint on it. */
const SLAB_PAINT: Paint = { albedo: seen(0x8d9199), roughness: 0.85 };
const MARKING_PAINT: Paint = { albedo: seen(0xf5f3e8), roughness: 0.8 };

/**
 * A kind of tree's colours: its trunk, which every tree of the kind shares, and the middle of its foliage, which
 * each tree's `shade` moves a little darker and cooler or lighter and warmer so a wood is not a stamp.
 */
const TREE_PAINT: Record<(typeof TREE_KINDS)[number], { trunk: Paint; crown: Paint }> = {
  broadleaf: {
    trunk: { albedo: seen(0x6e4a2c), roughness: 0.9 },
    crown: { albedo: seen(0x4cac33), roughness: 0.85 },
  },
  pine: {
    trunk: { albedo: seen(0x5b3d24), roughness: 0.9 },
    crown: { albedo: seen(0x1f6b45), roughness: 0.85 },
  },
  poplar: {
    trunk: { albedo: seen(0x7a5a3a), roughness: 0.9 },
    crown: { albedo: seen(0x8bbf2e), roughness: 0.85 },
  },
  palm: {
    trunk: { albedo: seen(0xb08a5a), roughness: 0.9 },
    crown: { albedo: seen(0x3fb24b), roughness: 0.85 },
  },
  bush: {
    trunk: { albedo: seen(0x634428), roughness: 0.9 },
    crown: { albedo: seen(0x5ba73a), roughness: 0.85 },
  },
};

/** How far a tree's `shade`, at its most (one), moves its foliage: lighter or darker by the first, and toward yellow or toward blue by the second. */
const SHADE_LIGHTNESS = 0.22;
const SHADE_WARMTH = 0.14;

/**
 * A river is drawn this much wider than the water it carries, so its edges tuck under the banks the generator
 * raised beside it and no strip of bed shows between the water and the land.
 */
const RIVER_TUCK = 1.15;

/** The sea beyond the grid is a plane at this much under the sea, so it never fights the water drawn at sea level, and runs this far each way. */
const OCEAN_DROP = 0.25;
const OCEAN_REACH = 12000;

/** How far round the helicopter the sun's shadow reaches each way, and the grid its middle is held to so the shadow's edges do not crawl. */
const SHADOW_REACH = 128;
const SHADOW_SNAP = 8;
/** The box reaches this far under the sea to catch shadows on the shore, and a little over the helicopter's highest point. */
const SHADOW_FLOOR = -5;
const SHADOW_ROOF = 2;

/** The parcel's paint: pale wood, and dark straps. */
const CRATE_PAINT: Paint = { albedo: seen(0xc0884a), roughness: 0.9 };
const STRAP_PAINT: Paint = { albedo: seen(0x3a2a1c), roughness: 0.9 };
/** The beacon's: a warm gold, which stands out against the greens and the sea and is not the helicopter's orange. */
const BEACON_PAINT: Paint = { albedo: seen(0xffc23a), roughness: 0.9 };

/**
 * The beacon: how wide and tall it stands, how far above the pad it starts so it never stands through the helicopter
 * on the pad, and how near the helicopter must come for it to go out, its work done. A crate on a pad sits this far
 * from the pad's middle, as a share of its radius, past the ends of the H and inside the painted ring.
 */
const BEACON = { width: 0.9, height: 140, above: 20, near: 40 };
const CRATE_OUT = 0.65;

/**
 * Where the level has got to, as the scene draws it: whether the parcel is aboard, the pad it stands on if it is not
 * (−1 for none), and the pad wanted now (−1 once the level is done).
 */
export interface ParcelPose {
  carrying: boolean;
  waiting: number;
  target: number;
}

/** How many of `dynamic`'s groups are the helicopter's: they come first, and move every frame. */
const HELICOPTER_GROUPS = 6;

/** A placement that leaves a mesh where it is. */
function stay(): Float32Array {
  const m = new Float32Array(16);
  place(m, 0, 0, 0, 0);
  return m;
}

/** A mesh that has no texture, and so no `uvs`: the renderer reads positions, normals and indices and nothing else. */
function mesh(positions: Float32Array, normals: Float32Array, indices: Uint32Array): Mesh {
  return { positions, normals, uvs: new Float32Array(0), indices };
}

/**
 * The land, a mesh for every kind of surface it has: [kind, mesh] pairs in the order of `SURFACE`. The triangles
 * are the ones `Heightfield` draws, split along the same diagonal, so the helicopter stands on what is seen. A
 * triangle with its three corners at or under the sea, in a square the sea covers, is left out: the water is
 * drawn over it and it can never be seen, and the sea floor is most of the grid. Each mesh shares its
 * vertices among its own triangles, and their normals are the land's own, smooth across every join.
 */
function terrainMeshes(island: Island): [number, Mesh][] {
  const { terrain, surface, sea, seaLevel } = island;
  const { cols, rows, cell, originX, originY, heights } = terrain;
  const n = cols - 1;
  const triangles = 2 * n * (rows - 1);

  // which triangles are drawn, as their surface, and how many there are of each
  const drawn = new Uint8Array(triangles);
  const counts = new Uint32Array(9);
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < n; i++) {
      const sq = j * n + i;
      const k = j * cols + i;
      const h00 = heights[k],
        h10 = heights[k + 1],
        h11 = heights[k + cols + 1],
        h01 = heights[k + cols];
      const covered = sea[sq] !== SEA.dry;
      let kind = surface[2 * sq];
      if (kind !== SURFACE.none && !(covered && h00 <= seaLevel && h10 <= seaLevel && h11 <= seaLevel)) {
        drawn[2 * sq] = kind;
        counts[kind]++;
      }
      kind = surface[2 * sq + 1];
      if (kind !== SURFACE.none && !(covered && h00 <= seaLevel && h11 <= seaLevel && h01 <= seaLevel)) {
        drawn[2 * sq + 1] = kind;
        counts[kind]++;
      }
    }
  }

  // each kind's triangles together, so a kind is built from its own and not from a pass over the lot
  const starts = new Uint32Array(10);
  for (let kind = 1; kind < 9; kind++) starts[kind + 1] = starts[kind] + counts[kind];
  const fill = starts.slice();
  const grouped = new Uint32Array(starts[9]);
  for (let t = 0; t < triangles; t++) if (drawn[t]) grouped[fill[drawn[t]]++] = t;

  const remap = new Int32Array(cols * rows).fill(-1);
  const made: [number, Mesh][] = [];
  for (let kind = 1; kind < 9; kind++) {
    const count = counts[kind];
    if (count === 0) continue;
    const indices = new Uint32Array(count * 3);
    const order = new Int32Array(Math.min(count * 3, cols * rows));
    let used = 0;
    let o = 0;
    for (let g = starts[kind]; g < starts[kind + 1]; g++) {
      const t = grouped[g];
      const sq = t >> 1;
      const j = (sq / n) | 0;
      const k = j * cols + (sq - j * n);
      // the two triangles of a square, in the order Heightfield documents
      const a = k,
        b = t & 1 ? k + cols + 1 : k + 1,
        c = t & 1 ? k + cols : k + cols + 1;
      for (let corner = 0; corner < 3; corner++) {
        const v = corner === 0 ? a : corner === 1 ? b : c;
        let id = remap[v];
        if (id < 0) {
          id = remap[v] = used++;
          order[id] = v;
        }
        indices[o++] = id;
      }
    }
    const positions = new Float32Array(used * 3);
    const normals = new Float32Array(used * 3);
    for (let id = 0; id < used; id++) {
      const v = order[id];
      const j = (v / cols) | 0;
      const i = v - j * cols;
      positions[3 * id] = originX + i * cell;
      positions[3 * id + 1] = originY + j * cell;
      positions[3 * id + 2] = heights[v];
      terrain.normalAt(i, j, normals, 3 * id);
      remap[v] = -1;
    }
    made.push([kind, mesh(positions, normals, indices)]);
  }
  return made;
}

/** What `static` adds a group with: its name, mesh and paint, and where it is placed and how often, if not once. */
type Add = (
  name: string,
  mesh: Mesh,
  paint: Paint,
  matrices?: Float32Array,
  count?: number,
  materials?: Float32Array,
) => void;

/** A set of grid squares of flat water, and how high its surface is. */
interface Patch {
  squares: ArrayLike<number>;
  z: number;
}

/**
 * Flat water over grid squares, each patch at its own height, sharing the corners squares have in common within a
 * patch so a sheet of them is one vertex a square and not four. The normals are straight up.
 */
function waterMesh(island: Island, patches: Patch[]): Mesh {
  const { terrain } = island;
  const { cols, rows, cell, originX, originY } = terrain;
  const n = cols - 1;
  let total = 0;
  for (const p of patches) total += p.squares.length;
  const vertexOf = new Int32Array(cols * rows);
  const owner = new Int32Array(cols * rows).fill(-1);
  // at most four vertices a square, and fewer where they are shared
  const corners = new Float32Array(total * 12);
  const indices = new Uint32Array(total * 6);
  let used = 0;
  let o = 0;
  patches.forEach((patch, which) => {
    const corner = (i: number, j: number): number => {
      const v = j * cols + i;
      if (owner[v] !== which) {
        owner[v] = which;
        vertexOf[v] = used;
        corners.set([originX + i * cell, originY + j * cell, patch.z], 3 * used++);
      }
      return vertexOf[v];
    };
    for (let s = 0; s < patch.squares.length; s++) {
      const sq = patch.squares[s];
      const j = (sq / n) | 0;
      const i = sq - j * n;
      const a = corner(i, j),
        b = corner(i + 1, j),
        c = corner(i + 1, j + 1),
        d = corner(i, j + 1);
      indices.set([a, b, c, a, c, d], o);
      o += 6;
    }
  });
  const positions = corners.slice(0, used * 3);
  const up = new Float32Array(used * 3);
  for (let k = 2; k < up.length; k += 3) up[k] = 1;
  return mesh(positions, up, indices);
}

/**
 * Flat water over the squares of one kind of sea, merged into as few rectangles as it will go: the deep sea is
 * more than half the grid, and a plane needs no vertex at every square. Where rectangles meet end to end the
 * edges do not share every vertex, and a hairline may open between them; the ocean plane under the lot is the
 * same blue, so it shows nothing.
 */
function seaRectangles(island: Island, kind: number): Mesh {
  const { terrain, sea, seaLevel } = island;
  const { cols, cell, originX, originY } = terrain;
  const n = cols - 1;
  const taken = new Uint8Array(n * n);
  const at = (i: number, j: number) => sea[j * n + i] === kind && taken[j * n + i] === 0;
  const found: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!at(i, j)) continue;
      let w = 1;
      while (i + w < n && at(i + w, j)) w++;
      let h = 1;
      grow: while (j + h < n) {
        for (let x = i; x < i + w; x++) if (!at(x, j + h)) break grow;
        h++;
      }
      for (let y = j; y < j + h; y++) taken.fill(1, y * n + i, y * n + i + w);
      found.push(i, j, w, h);
    }
  }
  const count = found.length / 4;
  const positions = new Float32Array(count * 12);
  const normals = new Float32Array(count * 12);
  const indices = new Uint32Array(count * 6);
  for (let r = 0; r < count; r++) {
    const x0 = originX + found[4 * r] * cell,
      y0 = originY + found[4 * r + 1] * cell,
      x1 = x0 + found[4 * r + 2] * cell,
      y1 = y0 + found[4 * r + 3] * cell;
    positions.set([x0, y0, seaLevel, x1, y0, seaLevel, x1, y1, seaLevel, x0, y1, seaLevel], r * 12);
    for (let v = 0; v < 4; v++) normals[r * 12 + v * 3 + 2] = 1;
    indices.set([r * 4, r * 4 + 1, r * 4 + 2, r * 4, r * 4 + 2, r * 4 + 3], r * 6);
  }
  return mesh(positions, normals, indices);
}

/** The sea beyond the grid: one square plane, out to the horizon. */
function ocean(z: number): Mesh {
  const r = OCEAN_REACH;
  return mesh(
    new Float32Array([-r, -r, z, r, -r, z, r, r, z, -r, r, z]),
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    new Uint32Array([0, 1, 2, 0, 2, 3]),
  );
}

/**
 * The rivers as ribbons on the water's surface: two vertices to a point of a run, `RIVER_TUCK` times its half-width
 * out either side of it, across the way the run is going there. A run is smooth, so its quads do not fold.
 */
function riverMesh(rivers: River[]): Mesh {
  let points = 0;
  let quads = 0;
  for (const r of rivers) {
    const m = r.points.length / 4;
    points += m;
    quads += Math.max(0, m - 1);
  }
  const positions = new Float32Array(points * 6);
  const normals = new Float32Array(points * 6);
  const indices = new Uint32Array(quads * 6);
  let v = 0;
  let o = 0;
  for (const { points: p } of rivers) {
    const m = p.length / 4;
    for (let k = 0; k < m; k++) {
      // the way it runs here: from the point before to the point after, so a bend is cut evenly
      const a = Math.max(0, k - 1) * 4,
        b = Math.min(m - 1, k + 1) * 4;
      let dx = p[b] - p[a],
        dy = p[b + 1] - p[a + 1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const w = p[4 * k + 3] * RIVER_TUCK;
      const x = p[4 * k],
        y = p[4 * k + 1],
        z = p[4 * k + 2];
      // the left bank, then the right
      positions.set([x - dy * w, y + dx * w, z, x + dy * w, y - dx * w, z], v * 6);
      normals[v * 6 + 2] = 1;
      normals[v * 6 + 5] = 1;
      if (k < m - 1) {
        const l = v * 2;
        indices.set([l, l + 1, l + 3, l, l + 3, l + 2], o);
        o += 6;
      }
      v++;
    }
  }
  return mesh(positions, normals, indices);
}

/** A tree's foliage colour moved by its shade, written as a colour and a roughness at `o`. */
function shaded(out: Float32Array, o: number, paint: Paint, shade: number): void {
  const light = 1 + SHADE_LIGHTNESS * shade;
  const warm = SHADE_WARMTH * shade;
  const [r, g, b] = paint.albedo;
  out[o] = Math.min(1, r * light * (1 + warm));
  out[o + 1] = Math.min(1, g * light * (1 + warm * 0.5));
  out[o + 2] = Math.min(1, b * light * (1 - warm));
  out[o + 3] = paint.roughness;
}

export class Scene {
  /**
   * The moving placements, a pool a group in the order `dynamic` gives the groups: one placement each for the
   * helicopter's, and a placement a tree for the trees', where a kind's trunks and crowns share the one pool.
   */
  readonly pools: Float32Array[] = [];

  /**
   * Which of `pools` `write` changed, one a pool, so the page writes those to the renderer and leaves the rest: a
   * kind of tree is thousands of placements, and is only written again when one of its trees has moved.
   */
  changed = new Uint8Array(0);

  /** What each of `static`'s groups is, in its order: the land by surface, the water and the pads. */
  readonly names: string[] = [];

  /** What each of `dynamic`'s groups is, in its order: the helicopter's parts, then the trees' trunks and crowns by kind. */
  readonly movers: string[] = [];

  /**
   * Where each tree is drawn: the pool its kind's trunks are in (its crowns are the next, over the same pool), its
   * place in it and its size; and the trees leaned at the last `write`, with a mark a tree, so each one the sway has
   * let go since is stood up again once. Sized once, by the island's trees.
   */
  private treePool = new Uint16Array(0);
  private treeSlot = new Uint32Array(0);
  private treeScale = new Float32Array(0);
  private leaning = new Int32Array(0);
  private leaned = 0;
  private moving = new Uint8Array(0);
  /** The pads, which the parcel and the beacon stand on, and where in `pools` the parcel's groups start. */
  private islandPads: readonly Pad[] = [];
  private parcelAt = 0;

  /**
   * The box the sun's shadow is fitted to, which the renderer holds and `write` moves: a stretch of the island
   * round the helicopter, from under the sea to over its highest point, so the shadow map's texels are spent
   * where the camera looks and not on a world 1,500 across.
   */
  readonly shadowBox: Box = {
    min: [-SHADOW_REACH, -SHADOW_REACH, SHADOW_FLOOR],
    max: [SHADOW_REACH, SHADOW_REACH, HELICOPTER.ceiling + HELICOPTER.size.height + SHADOW_ROOF],
  };

  /** What does not move: the land, the water and the pads. It is slow, and is the page's to do once, at boot. */
  static(island: Island): GameGroup[] {
    this.names.length = 0;
    const groups: GameGroup[] = [];
    const add: Add = (name, mesh, paint, matrices = stay(), count, materials) => {
      this.names.push(name);
      groups.push({ mesh, matrices, count, materials, albedo: paint.albedo, roughness: paint.roughness });
    };

    for (const [kind, land] of terrainMeshes(island)) add(TERRAIN_PAINT[kind].name, land, TERRAIN_PAINT[kind].paint);

    // the sea: the horizon, then the deep, then the shallows, which are cut out of the deep
    add('ocean', ocean(island.seaLevel - OCEAN_DROP), DEEP_PAINT);
    const shallows: number[] = [];
    for (let s = 0; s < island.sea.length; s++) if (island.sea[s] === SEA.shallow) shallows.push(s);
    if (island.sea.includes(SEA.deep)) add('deep', seaRectangles(island, SEA.deep), DEEP_PAINT);
    if (shallows.length > 0) {
      add('shallow', waterMesh(island, [{ squares: shallows, z: island.seaLevel }]), SHALLOW_PAINT);
    }
    if (island.lakes.length > 0) {
      add(
        'lakes',
        waterMesh(
          island,
          island.lakes.map((l) => ({ squares: l.squares, z: l.level })),
        ),
        LAKE_PAINT,
      );
    }
    if (island.rivers.length > 0) add('rivers', riverMesh(island.rivers), RIVER_PAINT);

    this.pads(island, add);
    return groups;
  }

  /** The pads: a slab and its paint each, at the pad's top, turned to face where the pad says. */
  private pads(island: Island, add: Add) {
    const { pads } = island;
    if (pads.length === 0) return;
    const { radius, thickness } = ISLAND.pads;
    const slabs = new Float32Array(pads.length * 16);
    const marks = new Float32Array(pads.length * 16);
    pads.forEach((pad, k) => {
      // a pad of another radius is the same mesh, widened and not thickened
      const s = pad.radius / radius;
      place(slabs, k, pad.x, pad.y, pad.z - thickness, pad.yaw, s, s, 1);
      place(marks, k, pad.x, pad.y, pad.z, pad.yaw, s, s, 1);
    });
    add('pad slabs', padSlab(radius, thickness), SLAB_PAINT, slabs, pads.length);
    add('pad markings', padMarking(radius), MARKING_PAINT, marks, pads.length);
  }

  /**
   * What moves: the helicopter's groups, then, given the island, its trees and the parcel and its beacon, each pool
   * sized once. The trees move
   * only a little and only now and then, but a group that is set as still cannot be written again but whole.
   */
  dynamic(island?: Island): GameGroup[] {
    this.pools.length = 0;
    this.movers.length = 0;
    const groups: GameGroup[] = [];
    const add: Add = (name, mesh, paint, matrices = new Float32Array(16), count = 1, materials) => {
      this.pools.push(matrices);
      this.movers.push(name);
      groups.push({ mesh, matrices, count, materials, albedo: paint.albedo, roughness: paint.roughness });
    };
    add('body', helicopterBody(), BODY_PAINT);
    add('trim', helicopterTrim(), TRIM_PAINT);
    add('glass', helicopterGlass(), GLASS_PAINT);
    add('dark', helicopterDark(), DARK_PAINT);
    add('main rotor', mainRotor(), DARK_PAINT);
    add('tail rotor', tailRotor(), DARK_PAINT);
    this.islandPads = [];
    if (island) {
      this.trees(island, add);
      // the parcel and the beacon, last: one placement each, written every frame
      this.parcelAt = this.pools.length;
      const { wood, straps } = crate();
      add('crate', wood, CRATE_PAINT);
      add('crate straps', straps, STRAP_PAINT);
      add('beacon', beacon(BEACON.width, BEACON.height), BEACON_PAINT);
      this.islandPads = island.pads;
    }
    this.changed = new Uint8Array(this.pools.length);
    return groups;
  }

  /** The trees: a trunk group and a crown group a kind, sharing a pool, the crowns each their own shade of green. */
  private trees(island: Island, add: Add) {
    const { trees, treeCount } = island;
    this.treePool = new Uint16Array(treeCount);
    this.treeSlot = new Uint32Array(treeCount);
    this.treeScale = new Float32Array(treeCount);
    this.leaning = new Int32Array(treeCount);
    this.leaned = 0;
    this.moving = new Uint8Array(treeCount);
    const perKind = new Uint32Array(TREE_KINDS.length);
    for (let t = 0; t < treeCount; t++) perKind[trees[t * TREE_STRIDE]]++;
    TREE_KINDS.forEach((kind, index) => {
      const count = perKind[index];
      if (count === 0) return;
      const shape = treeShape(kind);
      const paint = TREE_PAINT[kind];
      const matrices = new Float32Array(count * 16);
      const colours = new Float32Array(count * MATERIAL_STRIDE);
      let k = 0;
      for (let t = 0; t < treeCount; t++) {
        const o = t * TREE_STRIDE;
        if (trees[o] !== index) continue;
        place(matrices, k, trees[o + 1], trees[o + 2], trees[o + 3], trees[o + 4], trees[o + 5]);
        shaded(colours, k * MATERIAL_STRIDE, paint.crown, trees[o + 6]);
        this.treePool[t] = this.pools.length;
        this.treeSlot[t] = k;
        this.treeScale[t] = trees[o + 5];
        k++;
      }
      add(`${kind} trunks`, shape.trunk, paint.trunk, matrices, count);
      add(`${kind} crowns`, shape.crown, paint.crown, matrices, count, colours);
    });
  }

  /**
   * Everything where it is this frame, and the shadow's box round the helicopter; `changed` says which pools moved.
   * Given the sway, each moving tree is leaned as it says, and each it has let go stood up again.
   */
  write(pose: HelicopterPose, sway?: Sway, parcel?: ParcelPose): void {
    const [body, trim, glass, dark, main, tail] = this.pools;
    this.changed.fill(1, 0, HELICOPTER_GROUPS);
    this.changed.fill(0, HELICOPTER_GROUPS);
    if (sway && this.treePool.length > 0) this.bow(sway);
    const { mastTop, tailRotorAt } = HELICOPTER.size;
    placeFrame(body, 0, pose.x, pose.y, pose.z, pose.yaw, pose.pitch, pose.roll);
    trim.set(body);
    glass.set(body);
    dark.set(body);
    placePart(main, 0, body, 0, 0, 0, mastTop, 'z', pose.rotor);
    placePart(tail, 0, body, 0, tailRotorAt[0], tailRotorAt[1], tailRotorAt[2], 'y', pose.tailRotor);
    if (parcel && this.islandPads.length > 0) this.parcel(pose, parcel);
    const { min, max } = this.shadowBox;
    const cx = Math.round(pose.x / SHADOW_SNAP) * SHADOW_SNAP;
    const cy = Math.round(pose.y / SHADOW_SNAP) * SHADOW_SNAP;
    min[0] = cx - SHADOW_REACH;
    max[0] = cx + SHADOW_REACH;
    min[1] = cy - SHADOW_REACH;
    max[1] = cy + SHADOW_REACH;
  }

  /**
   * The parcel where the level has it (on the pad it waits on, under the helicopter, or on the pad it was wanted
   * on), and the beacon over the pad wanted now, out once the helicopter is near it or the level is done.
   */
  private parcel(pose: HelicopterPose, parcel: ParcelPose): void {
    const at = this.parcelAt;
    const [wood, straps, light] = [this.pools[at], this.pools[at + 1], this.pools[at + 2]];
    // strapped under the belly, between the skids, turning and tilting with the helicopter
    if (parcel.carrying) placePart(wood, 0, this.pools[0], 0, 0.25, 0, 0.02, 'z', 0);
    else if (parcel.waiting >= 0) onPadEdge(wood, this.islandPads[parcel.waiting]);
    // none: drawn at no size at all
    else place(wood, 0, pose.x, pose.y, pose.z, 0, 0);
    straps.set(wood);
    const target = parcel.target >= 0 ? this.islandPads[parcel.target] : undefined;
    if (target && Math.hypot(pose.x - target.x, pose.y - target.y) > BEACON.near)
      place(light, 0, target.x, target.y, target.z + BEACON.above, 0);
    // out: drawn at no size at all, so nothing of it is seen
    else place(light, 0, pose.x, pose.y, pose.z, 0, 0);
    this.changed.fill(1, at, at + 3);
  }

  /** Each tree the sway is moving leaned as it says, and each it has let go since the last write stood up again. */
  private bow(sway: Sway): void {
    const { treePool, treeSlot, treeScale, leaning, moving, pools, changed } = this;
    for (let k = 0; k < sway.count; k++) moving[sway.tree[k]] = 1;
    for (let n = 0; n < this.leaned; n++) {
      const t = leaning[n];
      if (moving[t]) continue;
      lean(pools[treePool[t]], treeSlot[t], 0, 0, 0, treeScale[t]);
      changed[treePool[t]] = changed[treePool[t] + 1] = 1;
    }
    this.leaned = 0;
    for (let k = 0; k < sway.count; k++) {
      const t = sway.tree[k];
      moving[t] = 0;
      lean(pools[treePool[t]], treeSlot[t], sway.leanX[k], sway.leanY[k], sway.squash[k], treeScale[t]);
      changed[treePool[t]] = changed[treePool[t] + 1] = 1;
      leaning[this.leaned++] = t;
    }
  }
}

/** A crate set down on a pad, out from its middle past the ends of the H, turned a little off the pad's square. */
function onPadEdge(out: Float32Array, pad: Readonly<Pad>): void {
  const r = pad.radius * CRATE_OUT;
  place(out, 0, pad.x + Math.cos(pad.yaw) * r, pad.y + Math.sin(pad.yaw) * r, pad.z, pad.yaw + 0.4);
}
