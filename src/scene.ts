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
 * nothing is seen. The fires' flames and smoke, the rescue's flare and the
 * drop's spray are particles, which `effects.ts` emits; what is drawn here of
 * a fire is the ground under it, and of the water the bucket.
 */
import { MATERIAL_STRIDE, type GameGroup } from 'artshape-render/game/renderer';
import type { Box } from 'artshape-render/game/shadows';
import type { Mesh } from 'artshape-render/mesh/types';
import {
  COLLECTIBLES,
  FIRES,
  ISLAND,
  LEVELS,
  PACKAGES,
  TREE_KINDS,
  type Collectible,
  type FirePlace,
  type PackagePlace,
} from './arena';
import { BUCKET, type BucketPose } from './bucket';
import { PATCH, treesOnPatches, type PatchTrees } from './fire';
import { HELICOPTER } from './helicopter';
import { SEA, SURFACE, TREE_STRIDE, type Island, type Pad, type River } from './island';
import type { Sway } from './sway';
import { lean, place, placeFrame, placePart } from './matrix';
import { RING, RINGS, type Board, type Level, type Ring, type Winch } from './mission';
import type { Block } from './solids';
import {
  beacon,
  box,
  charredPole,
  crate,
  ring,
  helicopterBody,
  helicopterDark,
  helicopterGlass,
  helicopterTrim,
  mainRotor,
  padMarking,
  padSlab,
  tailRotor,
  treeShape,
  treeSize,
  trunkRadius,
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
 * The rings: the one wanted in the beacon's gold, made brighter than a surface can be so the glow takes it, and the
 * rings after it white, which reads against the grass and the water and leaves the gold one plainly next. A ring
 * passed is not drawn. Chosen from a mock.
 */
const RING_NEXT_PAINT: Paint = { albedo: seen(0xffc23a).map((c) => c * 1.6) as Rgb, roughness: 0.4 };
const RING_PAINT: Paint = { albedo: seen(0xf5f3e8), roughness: 0.4 };
/**
 * The opening the ring is made at. A ring of another opening is drawn this one scaled to its size, its tube scaled
 * with it: a valley ring of 8 looks a sixth thinner than the solid tube it is, which is a hair at the size it is seen.
 */
const RING_DRAWN = 10;

/**
 * The structures, painted steel as chosen from a mock: the deck red with a white rail along each edge, standing on
 * grey stone, and the towers banded red and white like an air race's pylons, so each is seen from far off for the
 * thing to fly under or between that it is.
 */
const DECK_PAINT: Paint = { albedo: seen(0xc8452a), roughness: 0.6 };
const RAIL_PAINT: Paint = { albedo: seen(0xf3ead2), roughness: 0.6 };
const ABUTMENT_PAINT: Paint = { albedo: seen(0x8e8e86), roughness: 0.9 };
const TOWER_RED_PAINT: Paint = { albedo: seen(0xd8402a), roughness: 0.6 };
const TOWER_WHITE_PAINT: Paint = { albedo: seen(0xf3ead2), roughness: 0.6 };
/**
 * How the structures are cut up to be painted: the deck's slab is this thick, and its rails, this thick, take the rest
 * of its height; a tower's bands are this tall, counted from its top so the top band is whole and red.
 */
const DECK = { slab: 1.5, rail: 0.3 };
const BAND = 7;

/**
 * What a structure collected gains, chosen from a mock: gold, a little brighter than a surface can be so the glow takes
 * it, as the lit ring's is. A tower gets a collar round its top, a box `across` wider than the tower on every side and
 * `tall` high, standing `over` above the tower's top; a bridge gets its two rails covered by boxes `fit` larger than the
 * rail on every face, so the gold is seen and does not fight the paint under it. None of it is solid.
 */
const COLLECTED_PAINT: Paint = { albedo: seen(0xf0b429).map((c) => c * 1.2) as Rgb, roughness: 0.4 };
const COLLAR = { across: 0.4, tall: 2.2, over: 0.2 };
const RAIL_COVER = 0.02;

/**
 * The hidden packages, a crate of the parcel's shape at `size` times its size in weathered blue-grey with dark straps,
 * chosen from a mock so that it is seen close over and is never taken for a parcel to deliver. Each is turned by `turn`
 * radians for each place before it in the list, so no two lie the same way. A package found is drawn at no size.
 */
const PACKAGE_PAINT: Paint = { albedo: seen(0x5f7d96), roughness: 0.9 };
const PACKAGE_STRAP_PAINT: Paint = { albedo: seen(0x26303a), roughness: 0.9 };
const PACKAGE = { size: 1.4, turn: 0.7 };

/**
 * The start flags, chosen from a mock: a dark pole 0.3 square and 6 tall, and a cloth of 3 by 2 squares of 1.1, chequered
 * black and white, hung across the way the opening faces, `start` out from the pole to its first square's middle. The
 * flag marks the start of a level, which is where its first step is done: it stands on the top of a start ring, a ring
 * tube's width clear of it, and on whatever a gate's content says.
 */
const FLAG_DARK_PAINT: Paint = { albedo: seen(0x22222a), roughness: 0.7 };
const FLAG_LIGHT_PAINT: Paint = { albedo: seen(0xf5f3e8), roughness: 0.7 };
const FLAG = { pole: 0.3, height: 6, square: 1.1, columns: 3, rows: 2, thin: 0.12, start: 0.6 };
/** How many boxes a flag is made of, in each colour: the pole and the black squares, and the white squares. */
const FLAG_DARK = 1 + Math.floor((FLAG.columns * FLAG.rows) / 2);
const FLAG_LIGHT = Math.ceil((FLAG.columns * FLAG.rows) / 2);

/**
 * The beacon: how wide and tall it stands, how far above the pad it starts so it never stands through the helicopter
 * on the pad, and how near the helicopter must come for it to go out, its work done. A crate on a pad sits this far
 * from the pad's middle, as a share of its radius, past the ends of the H and inside the painted ring.
 */
const BEACON = { width: 0.9, height: 140, above: 20, near: 40 };
const CRATE_OUT = 0.65;

/**
 * What is going, as the scene draws it: the level, or null with nothing going, the step wanted, whether the parcel is
 * aboard, the pad it stands on if it is not (−1 for none), and the pad wanted now (−1 for none, and once the level is
 * done). A `Mission` is one.
 */
export interface Going {
  level: Level | null;
  next: number;
  carrying: boolean;
  waiting: number;
  target: number;
}

/** Where a flag's pole stands, and the way its opening faces. */
interface FlagSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** The flags that mark the start of `level`, where its first step is a ring or an opening: none for a delivery. */
export function startFlags(level: Level): FlagSpot[] {
  const first = level.steps[0];
  if (first.kind === 'ring')
    return [{ x: first.x, y: first.y, z: first.z + first.opening + 2 * RING.tube, yaw: first.yaw }];
  if (first.kind === 'gate') return (first.flags ?? []).map(({ x, y, z }) => ({ x, y, z, yaw: first.yaw }));
  return [];
}

/**
 * The people waiting to be rescued, a figure in boxes about 1.8 tall in an orange jacket over dark legs, one arm up
 * waving. A person is five boxes, each `[side, up, across, along, tall]` from the person's feet (`side` being along the
 * way they face across, so the arm stands out to one side), painted by the colour in the same place of
 * `PERSON_COLOURS`; they stand turned by `PERSON.yaw`. Each is a placement of the one unit box, with its own paint. The
 * orange smoke of their flare, which finds them from afar, is particles, which `effects.ts` emits.
 */
const PERSON = { yaw: 0.6 };
const PERSON_BOXES: readonly (readonly number[])[] = [
  [-0.13, 0, 0.2, 0.2, 0.85],
  [0.13, 0, 0.2, 0.2, 0.85],
  [0, 0.85, 0.32, 0.55, 0.65],
  [0, 1.5, 0.26, 0.26, 0.28],
  [0.38, 1.35, 0.14, 0.14, 0.75],
];
const PERSON_COLOURS = [0x2b3440, 0x2b3440, 0xff6a1a, 0xe0b08a, 0xff6a1a];
/**
 * The boat a sailor waits in, an orange rescue inflatable sat on the sea at the spot's `yaw`: two side tubes and a bow
 * tube 0.7 across, a dark floor and a dark outboard, six boxes in all. A box is `[forward, across, up, along, wide, tall]`
 * from the spot, `forward` along the way the boat points and `across` to its left, `up` from the sea's surface to the
 * box's foot. The sailor stands in it, on the floor `sailor.forward` aft of the middle and `sailor.up` over the sea, as
 * the people on the land are, and is winched up from there.
 */
const BOAT = { tube: 0xff6a1a, floor: 0x3b3f46, outboard: 0x2b3440, sailor: { forward: 0.4, up: 0.15 } };
const BOAT_BOXES: readonly (readonly number[])[] = [
  [0, 0.85, -0.1, 4.4, 0.7, 0.7],
  [0, -0.85, -0.1, 4.4, 0.7, 0.7],
  [2.2, 0, -0.1, 0.7, 2.4, 0.7],
  [0, 0, -0.15, 4.2, 1.2, 0.3],
  [-2.1, 0, 0.1, 0.5, 0.4, 0.7],
];
const BOAT_COLOURS = [BOAT.tube, BOAT.tube, BOAT.tube, BOAT.floor, BOAT.outboard];
/** What the rescues' boxes are painted: matte, since a jacket is not shiny. */
const RESCUE_ROUGHNESS = 0.9;
/**
 * The rope the person is winched up, a dark line `width` across: it hangs from `belly` over the helicopter's skids, the
 * helicopter's underside, down to the raised hand `grip` over the person's feet, and a person who is `height` tall is
 * lifted until their head is at the belly. A person is five boxes and the rope a sixth, in one group.
 */
const ROPE = { width: 0.07, belly: 0.2, grip: 1.7, height: 1.8, paint: 0x2b3440 };

/** What is being winched, as the scene draws it: the level whose person it is (null for none) and how far up they are, 0 to 1. A `WinchState` is one. */
export interface Winching {
  spot: string | null;
  share: number;
}

/**
 * The ground of a fire, a box a patch turned by a fixed yaw of its own so the patches do not tile: where a patch burns,
 * orange ground `burning.across` wide and `burning.thick` thick, its albedo raised by `burning.glow` so that it blooms
 * as the gold does; where it is out, dark burnt ground `burnt.across` wide and a hair thick, `burnt.lift` over the
 * ground so that it is seen; and where it has not caught, nothing. `turn` is how far each patch is turned from the one
 * before it.
 */
const FIRE_GROUND = {
  burning: { across: 7, thick: 0.25, glow: 1.5, paint: 0xd8461f },
  burnt: { across: 7.5, thick: 0.06, lift: 0.03, paint: 0x2a241f },
  turn: 0.9,
};
const FIRE_ROUGHNESS = 0.9;

/**
 * What a tree on a burning or burnt patch is drawn as: a black, matte, charred pole of the tree's own full height, `wider` times
 * as wide as its trunk, in place of the tree, whose own placement is left at no size.
 */
const CHARRED = { paint: { albedo: seen(0x1c1916), roughness: 0.95 }, wider: 1.25 };

/** The bucket's paint: the dark line, the orange bucket and the blue water at its rim, which glows. */
const BUCKET_PAINT = {
  line: { albedo: seen(0x2b3440), roughness: 0.6 },
  bucket: { albedo: seen(0xff6a1a), roughness: 0.6 },
  water: { albedo: seen(0x3f8fe0).map((c) => c * BUCKET.water.glow) as Rgb, roughness: 0.2 },
};

/** What is drawn of the bucket, for the test API: whether it hangs, how long its line is, and whether it holds water. */
export interface BucketDrawn {
  hung: boolean;
  full: boolean;
  line: number;
}

/** What the scene draws besides what is going: the fires' patches, by state, and the bucket. */
export interface Drawn {
  /** Each fire's patches as the model keeps them, in the order of the fires' places. */
  fires?: readonly { states: Uint8Array }[];
  bucket?: Readonly<BucketPose>;
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
  /** The pads, which the crates and the beacon stand on, and where in `pools` the parcel's groups start. */
  private islandPads: readonly Pad[] = [];
  private parcelAt = 0;
  /** The levels that begin with a pickup, each with the pad its crate waits on: a crate each in the pool, after the one carried. Built once. */
  private readonly crates: { level: Level; pad: number }[] = [];
  /**
   * The structures that can be collected, each with where its placements are in the gold pool: a tower has one, a
   * bridge one for each rail. Built once.
   */
  private readonly collectable: { id: string; blocks: Collectible['blocks']; first: number }[] = [];
  /** Where the gold group is among the pools, and which structures it was last written for, so it is written only when one is collected. */
  private goldAt = -1;
  private goldSlots = 0;
  private readonly goldFor: Uint8Array;
  private goldWritten = false;
  /**
   * The hidden packages' places, which a crate is drawn on, and where their two groups are among the pools; the pool is
   * written only when the set found changes from what it was last written for. Sized once, by the places.
   */
  private readonly places: readonly PackagePlace[];
  private packagesAt = -1;
  private readonly foundFor: Uint8Array;
  private packagesWritten = false;
  /**
   * The people waiting to be rescued, each with the level that is theirs; where the groups of the people, their smoke and
   * the winch (the rope and the person on it) are among the pools; and what the people and smoke were last written for,
   * the level going and the spot winched (−1 for none), and whether the rope is out. Built once, and sized once.
   */
  private readonly rescuing: { level: Level; winch: Winch | Board }[] = [];
  private peopleAt = -1;
  /** Where the boat group is among the pools (−1 for none), which rescues have a boat, and what the boats were last written for. */
  private boatAt = -1;
  private readonly boats: number[] = [];
  private boatsFor: Level | null | undefined;
  /** Where a person on the ground or in a boat has their feet, written in place by `feetOf`, so that placing them makes nothing. */
  private readonly feet = { x: 0, y: 0, z: 0 };
  private rescuesFor: Level | null | undefined;
  private rescuesWinch = -2;
  private ropeOut = false;
  /**
   * Every patch of every fire, in order, which the fire ground has a placement each for; where the groups are among the
   * pools; and each patch's state as last written (255 before any is), so the pools are written only when one changes.
   */
  private readonly fireSpots: { x: number; y: number; z: number }[] = [];
  private fireAt = -1;
  private readonly firesFor: Uint8Array;
  private readonly firePlaces: readonly FirePlace[];
  /**
   * The trees on the patches and the pole group they are drawn as (−1 for none), the island's trees' places (to put a tree back
   * whole), which trees are burnt now, and which patches were last written burnt or whole (the pools are written only when
   * a patch changes between the two, and a patch that burns and then goes out is drawn the same). Sized once.
   */
  private patchTrees: PatchTrees = { tree: new Uint32Array(0), first: new Uint32Array(1) };
  private burntAt = -1;
  private islandTrees: ArrayLike<number> = [];
  private treeBurnt = new Uint8Array(0);
  private burntFor: Uint8Array;
  /** Where the bucket's groups are among the pools, and whether it was drawn at the last write, so stowing it is written once. */
  private bucketAtPool = -1;
  private bucketOut = false;
  /** What the resting crates were last written for, so they are written only when what is going changes. */
  private cratesFor: Level | null | undefined;
  /** Where the ring groups are among the pools, and what they were last written for, so they are written only on a change. */
  private ringsAt = -1;
  private ringsFor: Level | null | undefined;
  private ringsNext = -1;
  /** The levels that begin at a ring: every other one's start is drawn while one goes. Built once. */
  private readonly startRings: { level: Level; ring: Ring }[] = [];
  /** Where the flag groups are among the pools, what each level's flags are, and what the groups were last written for. */
  private flagsAt = -1;
  private readonly flags: { level: Level; spots: FlagSpot[] }[] = [];
  private flagsFor: Level | null | undefined;
  /** One ring, its opening the one most levels have; a ring of another opening is drawn at its size by its placing. */
  private readonly ringMesh = ring(RING_DRAWN + RING.tube, RING.tube);

  /**
   * The scene of `levels`: which of them have a crate to wait on a pad, a ring to be drawn as a start and flags to mark
   * it, worked out once here so that no frame works it out again; the structures that can be collected, each with its
   * place in the gold; and the places of the hidden packages. The arena's unless told otherwise.
   */
  constructor(
    levels: readonly Level[] = LEVELS,
    collectibles: readonly Collectible[] = COLLECTIBLES,
    packages: readonly PackagePlace[] = PACKAGES,
    fires: readonly FirePlace[] = FIRES,
  ) {
    this.places = packages;
    for (const fire of fires) for (const p of fire.patches) this.fireSpots.push(p);
    this.firesFor = new Uint8Array(this.fireSpots.length).fill(255);
    this.burntFor = new Uint8Array(this.fireSpots.length);
    this.firePlaces = fires;
    this.foundFor = new Uint8Array(packages.length);
    for (const { id, blocks } of collectibles) {
      this.collectable.push({ id, blocks, first: this.goldSlots });
      for (const b of blocks) this.goldSlots += b.kind === 'tower' ? 1 : b.kind === 'deck' ? 2 : 0;
    }
    this.goldFor = new Uint8Array(collectibles.length);
    for (const level of levels) {
      const first = level.steps[0];
      if (first.kind === 'pickup') this.crates.push({ level, pad: first.pad });
      else if (first.kind === 'ring') this.startRings.push({ level, ring: first });
      else if (first.kind === 'winch' || first.kind === 'board') this.rescuing.push({ level, winch: first });
      const spots = startFlags(level);
      if (spots.length > 0) this.flags.push({ level, spots });
    }
  }

  /**
   * The box the sun's shadow is fitted to, which the renderer holds and `write` moves: a stretch of the island
   * round the helicopter, from under the sea to over its highest point, so the shadow map's texels are spent
   * where the camera looks and not on a world 1,500 across.
   */
  readonly shadowBox: Box = {
    min: [-SHADOW_REACH, -SHADOW_REACH, SHADOW_FLOOR],
    max: [SHADOW_REACH, SHADOW_REACH, HELICOPTER.ceiling + HELICOPTER.size.height + SHADOW_ROOF],
  };

  /**
   * What does not move: the land, the water, the pads, and the `structures` that stand on the island. It is slow, and
   * is the page's to do once, at boot.
   */
  static(island: Island, structures: readonly Block[] = []): GameGroup[] {
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
    this.structures(structures, add);
    return groups;
  }

  /**
   * The structures, each drawn as the box it is solid as, cut up to be painted: a deck as its slab and a rail along
   * each edge on it, an abutment whole, and a tower in bands from its top down. A group is added only for what there is.
   */
  private structures(blocks: readonly Block[], add: Add) {
    const decks = blocks.filter((b) => b.kind === 'deck');
    const abutments = blocks.filter((b) => b.kind === 'abutment');
    const towers = blocks.filter((b) => b.kind === 'tower');
    const unit = box(1, 1, 1);
    const group = (name: string, paint: Paint, placings: readonly (readonly number[])[]) => {
      if (placings.length === 0) return;
      const m = new Float32Array(placings.length * 16);
      placings.forEach(([x, y, z, yaw, length, width, height], k) => place(m, k, x, y, z, yaw, length, width, height));
      add(name, unit, paint, m, placings.length);
    };
    group(
      'deck',
      DECK_PAINT,
      decks.map((b) => [b.x, b.y, b.z, b.yaw, b.length, b.width, DECK.slab]),
    );
    group(
      'rails',
      RAIL_PAINT,
      decks.flatMap((b) =>
        [-1, 1].map((side) => {
          const across = (side * (b.width - DECK.rail)) / 2;
          const [x, y] = [b.x - Math.sin(b.yaw) * across, b.y + Math.cos(b.yaw) * across];
          return [x, y, b.z + DECK.slab, b.yaw, b.length, DECK.rail, b.height - DECK.slab];
        }),
      ),
    );
    group(
      'abutments',
      ABUTMENT_PAINT,
      abutments.map((b) => [b.x, b.y, b.z, b.yaw, b.length, b.width, b.height]),
    );
    const bands = (red: boolean) =>
      towers.flatMap((b) => {
        const out: number[][] = [];
        for (let k = red ? 0 : 1; k * BAND < b.height; k += 2) {
          const top = b.z + b.height - k * BAND;
          const foot = Math.max(b.z, top - BAND);
          out.push([b.x, b.y, foot, b.yaw, b.length, b.width, top - foot]);
        }
        return out;
      });
    group('tower red', TOWER_RED_PAINT, bands(true));
    group('tower white', TOWER_WHITE_PAINT, bands(false));
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
   * only a little and only now and then, but a group that is set as still cannot be written again but whole. The trees on the
   * fires' patches are given, as the game has found them, or found here from the island's; a pole is drawn for each of them
   * when its patch burns.
   */
  dynamic(island?: Island, patchTrees?: PatchTrees): GameGroup[] {
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
    this.burntAt = -1;
    this.burntFor.fill(0);
    if (island) {
      this.trees(island, add);
      // the crates, last but for the rings and the flags: a placement for the parcel of the level going, and one for each
      // level that begins with a pickup, waiting on its pad; and the beacon, one placement, all written every frame
      this.parcelAt = this.pools.length;
      const { wood, straps } = crate();
      const places = 1 + this.crates.length;
      add('crate', wood, CRATE_PAINT, new Float32Array(places * 16), places);
      add('crate straps', straps, STRAP_PAINT, new Float32Array(places * 16), places);
      add('beacon', beacon(BEACON.width, BEACON.height), BEACON_PAINT);
      this.islandPads = island.pads;
      this.cratesFor = undefined;
      // the rings, one lit and room for every other a level may have, written only when the ring wanted changes
      this.ringsAt = this.pools.length;
      this.ringsFor = undefined;
      this.ringsNext = -1;
      add('rings', this.ringMesh, RING_PAINT, new Float32Array(RINGS.capacity * 16), RINGS.capacity);
      add('ring next', this.ringMesh, RING_NEXT_PAINT);
      // the start flags, room for every one there is, written only when what is going changes
      this.flagsAt = this.pools.length;
      this.flagsFor = undefined;
      const spots = this.flags.reduce((n, f) => n + f.spots.length, 0);
      const unit = box(1, 1, 1);
      add('flags dark', unit, FLAG_DARK_PAINT, new Float32Array(spots * FLAG_DARK * 16), spots * FLAG_DARK);
      add('flags light', unit, FLAG_LIGHT_PAINT, new Float32Array(spots * FLAG_LIGHT * 16), spots * FLAG_LIGHT);
      // the gold of what is collected, a placement for every tower and rail there is, none of them at any size until it is
      // collected, and written only when the structures collected change
      this.goldAt = this.goldSlots > 0 ? this.pools.length : -1;
      this.goldWritten = false;
      if (this.goldSlots > 0)
        add('collected', unit, COLLECTED_PAINT, new Float32Array(this.goldSlots * 16), this.goldSlots);
      // the hidden packages, a crate on each place there is, a placement a place and none at any size once it is found,
      // written only when the packages found change
      this.packagesAt = this.pools.length;
      this.packagesWritten = false;
      const n = this.places.length;
      add('packages', wood, PACKAGE_PAINT, new Float32Array(n * 16), n);
      add('package straps', straps, PACKAGE_STRAP_PAINT, new Float32Array(n * 16), n);
      this.rescueGroups(add, unit);
      this.patchTrees =
        patchTrees ??
        treesOnPatches(this.firePlaces, { trees: island.trees, stride: TREE_STRIDE, count: island.treeCount });
      this.fireGroups(add, unit);
      this.bucketGroups(add, unit);
    }
    this.changed = new Uint8Array(this.pools.length);
    return groups;
  }

  /**
   * The rescues' groups, each a placement of one unit box with its own paint, sized once: the people waiting, five boxes
   * each, and the winch, a person and a rope, six. Nothing is added where there is no rescue.
   */
  private rescueGroups(add: Add, unit: Mesh): void {
    this.peopleAt = -1;
    this.boatAt = -1;
    this.boatsFor = undefined;
    this.rescuesFor = undefined;
    this.rescuesWinch = -2;
    this.ropeOut = false;
    const n = this.rescuing.length;
    if (n === 0) return;
    this.peopleAt = this.pools.length;
    const paint = (colours: readonly number[], times: number, extra: readonly number[] = []) => {
      const all = [...Array.from({ length: times }, () => colours).flat(), ...extra];
      const m = new Float32Array(all.length * MATERIAL_STRIDE);
      all.forEach((hex, k) => m.set([...seen(hex), RESCUE_ROUGHNESS], k * MATERIAL_STRIDE));
      return m;
    };
    const people = n * PERSON_BOXES.length;
    const winch = PERSON_BOXES.length + 1;
    const base: Paint = { albedo: seen(PERSON_COLOURS[2]), roughness: RESCUE_ROUGHNESS };
    add('people', unit, base, new Float32Array(people * 16), people, paint(PERSON_COLOURS, n));
    add('winch', unit, base, new Float32Array(winch * 16), winch, paint(PERSON_COLOURS, 1, [ROPE.paint]));
    // the boats, one for each rescue that has one, in a pool of their own
    this.boats.length = 0;
    this.rescuing.forEach(({ winch: w }, k) => {
      if ('yaw' in w && w.yaw !== undefined) this.boats.push(k);
    });
    if (this.boats.length === 0) return;
    this.boatAt = this.pools.length;
    const boxes = this.boats.length * BOAT_BOXES.length;
    const materials = new Float32Array(boxes * MATERIAL_STRIDE);
    for (let k = 0; k < boxes; k++)
      materials.set([...seen(BOAT_COLOURS[k % BOAT_BOXES.length]), RESCUE_ROUGHNESS], k * MATERIAL_STRIDE);
    add(
      'boat',
      unit,
      { albedo: seen(BOAT.tube), roughness: RESCUE_ROUGHNESS },
      new Float32Array(boxes * 16),
      boxes,
      materials,
    );
  }

  /**
   * Where the feet of the person at rescue `k` are, written into `feet`: on the ground at their spot, or on the floor of the
   * boat they wait in, which is aft of the spot's middle and a little over the sea.
   */
  private feetOf(k: number): { x: number; y: number; z: number } {
    const { winch } = this.rescuing[k];
    const f = this.feet;
    f.x = winch.x;
    f.y = winch.y;
    f.z = winch.z;
    if ('yaw' in winch && winch.yaw !== undefined) {
      f.x += Math.cos(winch.yaw) * BOAT.sailor.forward;
      f.y += Math.sin(winch.yaw) * BOAT.sailor.forward;
      f.z += BOAT.sailor.up;
    }
    return f;
  }

  /**
   * The fires' ground, two groups of a unit box with a placement for every patch of every fire: the glowing ground of
   * those burning and the burnt ground of those out, each patch at no size in the one it is not in. Written when a
   * patch changes.
   */
  private fireGroups(add: Add, unit: Mesh): void {
    this.fireAt = -1;
    this.firesFor.fill(255);
    const n = this.fireSpots.length;
    if (n === 0) return;
    this.fireAt = this.pools.length;
    const { burning, burnt } = FIRE_GROUND;
    const glow = seen(burning.paint).map((c) => c * burning.glow) as Rgb;
    const [glowing, charred] = [new Float32Array(n * 16), new Float32Array(n * 16)];
    // every placement at no size where its patch is, rather than all noughts, which no placement is
    this.fireSpots.forEach(({ x, y, z }, k) => {
      place(glowing, k, x, y, z, 0, 0);
      place(charred, k, x, y, z, 0, 0);
    });
    add('burning ground', unit, { albedo: glow, roughness: FIRE_ROUGHNESS }, glowing, n);
    add('burnt ground', unit, { albedo: seen(burnt.paint), roughness: FIRE_ROUGHNESS }, charred, n);
    // the poles of the trees on the patches: a placement for each, at no size until its patch burns
    const poles = this.patchTrees.tree.length;
    if (poles === 0) return;
    this.burntAt = this.pools.length;
    const standing = new Float32Array(poles * 16);
    for (let k = 0; k < poles; k++) place(standing, k, 0, 0, 0, 0, 0);
    add('burnt trees', charredPole(), CHARRED.paint, standing, poles);
  }

  /** The bucket's three groups, one placement each, at no size until it hangs. */
  private bucketGroups(add: Add, unit: Mesh): void {
    this.bucketAtPool = this.pools.length;
    this.bucketOut = false;
    add('bucket line', unit, BUCKET_PAINT.line);
    add('bucket', unit, BUCKET_PAINT.bucket);
    add('bucket water', unit, BUCKET_PAINT.water);
  }

  /** The trees: a trunk group and a crown group a kind, sharing a pool, the crowns each their own shade of green. */
  private trees(island: Island, add: Add) {
    const { trees, treeCount } = island;
    this.treePool = new Uint16Array(treeCount);
    this.treeSlot = new Uint32Array(treeCount);
    this.treeScale = new Float32Array(treeCount);
    this.leaning = new Int32Array(treeCount);
    this.islandTrees = trees;
    this.treeBurnt = new Uint8Array(treeCount);
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
   * Given the sway, each moving tree is leaned as it says, and each it has let go stood up again. Given what is
   * going, which may be nothing, the crates, the beacon, the rings and the flags are written as it says; and given the
   * names of the structures collected, the gold on each, which is written only when they change; and given the names of
   * the packages found, a crate on every place of one not found, written only when they change; and given what is going
   * and what is winched, the people waiting, and the rope with the person on it; and given the fires' patches, the
   * ground under each, written only when a patch changes, and the bucket, written every frame it hangs.
   */
  write(
    pose: HelicopterPose,
    sway?: Sway,
    going?: Going,
    collected?: readonly string[],
    found?: readonly string[],
    winching?: Winching,
    drawn?: Drawn,
  ): void {
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
    if (going && this.islandPads.length > 0) {
      this.parcel(pose, going);
      this.rings(going);
      this.flag(going);
    }
    if (collected && this.goldAt >= 0) this.paintGold(collected);
    if (found && this.packagesAt >= 0) this.paintPackages(found);
    if (going && this.peopleAt >= 0) this.rescues(pose, going.level, winching);
    if (drawn?.fires && this.fireAt >= 0) this.paintFires(drawn.fires);
    if (drawn?.bucket && this.bucketAtPool >= 0) this.hang(pose, drawn.bucket);
    const { min, max } = this.shadowBox;
    const cx = Math.round(pose.x / SHADOW_SNAP) * SHADOW_SNAP;
    const cy = Math.round(pose.y / SHADOW_SNAP) * SHADOW_SNAP;
    min[0] = cx - SHADOW_REACH;
    max[0] = cx + SHADOW_REACH;
    min[1] = cy - SHADOW_REACH;
    max[1] = cy + SHADOW_REACH;
  }

  /**
   * The parcel of the level going where it is (on the pad it waits on, under the helicopter, or on the pad it was wanted
   * on), the crate of every other level that begins with a pickup on its own pad, and the beacon over the pad wanted now,
   * out once the helicopter is near it, and with nothing going. A level's crate is not drawn on its pickup pad while it
   * is the one going, and nothing is left on a drop pad once it ends.
   */
  private parcel(pose: HelicopterPose, going: Going): void {
    const at = this.parcelAt;
    const [wood, straps, light] = [this.pools[at], this.pools[at + 1], this.pools[at + 2]];
    // strapped under the belly, between the skids, turning and tilting with the helicopter
    if (going.carrying) placePart(wood, 0, this.pools[0], 0, 0.25, 0, 0.02, 'z', 0);
    else if (going.waiting >= 0) onPadEdge(wood, 0, this.islandPads[going.waiting]);
    // none: drawn at no size at all
    else place(wood, 0, pose.x, pose.y, pose.z, 0, 0);
    if (going.level !== this.cratesFor) {
      this.cratesFor = going.level;
      this.crates.forEach(({ level, pad }, k) => {
        if (level === going.level) place(wood, 1 + k, pose.x, pose.y, pose.z, 0, 0);
        else onPadEdge(wood, 1 + k, this.islandPads[pad]);
      });
    }
    straps.set(wood);
    const target = going.target >= 0 ? this.islandPads[going.target] : undefined;
    if (target && Math.hypot(pose.x - target.x, pose.y - target.y) > BEACON.near)
      place(light, 0, target.x, target.y, target.z + BEACON.above, 0);
    // out: drawn at no size at all, so nothing of it is seen
    else place(light, 0, pose.x, pose.y, pose.z, 0, 0);
    this.changed.fill(1, at, at + 3);
  }

  /**
   * The rings drawn: those of the level going where it has got to, the one wanted lit and those after it white, those
   * passed not drawn; and the start ring of every other level, white, as the rings to come are, so a start is never taken
   * for the one wanted. Every slot past the last at no size; written only when what is going or the ring wanted changes.
   */
  private rings({ level, next }: Going): void {
    const at = this.ringsAt;
    if (level === this.ringsFor && next === this.ringsNext) return;
    this.ringsFor = level;
    this.ringsNext = next;
    const [later, lit] = [this.pools[at], this.pools[at + 1]];
    later.fill(0);
    lit.fill(0);
    let n = 0;
    const size = (ring: Ring) => (ring.opening + RING.tube) / (RING_DRAWN + RING.tube);
    level?.steps.forEach((step, k) => {
      if (step.kind !== 'ring' || k < next) return;
      if (k === next) place(lit, 0, step.x, step.y, step.z, step.yaw, size(step));
      else place(later, n++, step.x, step.y, step.z, step.yaw, size(step));
    });
    for (const start of this.startRings)
      if (start.level !== level)
        place(later, n++, start.ring.x, start.ring.y, start.ring.z, start.ring.yaw, size(start.ring));
    this.changed[at] = this.changed[at + 1] = 1;
  }

  /**
   * The start flags: a pole and a chequered cloth at each start there is, except those of the level going, whose start is
   * done. Written only when what is going changes.
   */
  private flag({ level }: Going): void {
    const at = this.flagsAt;
    if (level === this.flagsFor) return;
    this.flagsFor = level;
    const [dark, light] = [this.pools[at], this.pools[at + 1]];
    dark.fill(0);
    light.fill(0);
    let [d, l] = [0, 0];
    for (const flags of this.flags) {
      if (flags.level === level) continue;
      for (const { x, y, z, yaw } of flags.spots) {
        place(dark, d++, x, y, z, yaw, FLAG.pole, FLAG.pole, FLAG.height);
        // the cloth hangs from the top of the pole, across the way the opening faces
        const [across, up] = [[-Math.sin(yaw), Math.cos(yaw)], z + FLAG.height];
        for (let i = 0; i < FLAG.columns; i++)
          for (let j = 0; j < FLAG.rows; j++) {
            const out = FLAG.start + i * FLAG.square;
            const [px, py, pz] = [x + across[0] * out, y + across[1] * out, up - (j + 1) * FLAG.square];
            if ((i + j) % 2) place(dark, d++, px, py, pz, yaw, FLAG.thin, FLAG.square, FLAG.square);
            else place(light, l++, px, py, pz, yaw, FLAG.thin, FLAG.square, FLAG.square);
          }
      }
    }
    this.changed[at] = this.changed[at + 1] = 1;
  }

  /**
   * The gold on the structures collected: a collar round the top of each tower and a cover over each rail, every other
   * placement at no size. A name the game does not have is not drawn. Written only when the set collected is not what
   * it was last written for; the check reads and writes in place and makes nothing.
   */
  private paintGold(collected: readonly string[]): void {
    const at = this.goldAt;
    const was = this.goldFor;
    let changed = !this.goldWritten;
    for (let k = 0; k < this.collectable.length; k++) {
      const now = collected.includes(this.collectable[k].id) ? 1 : 0;
      if (now !== was[k]) changed = true;
      was[k] = now;
    }
    if (!changed) return;
    this.goldWritten = true;
    const m = this.pools[at];
    m.fill(0);
    for (let k = 0; k < this.collectable.length; k++) {
      if (!was[k]) continue;
      let slot = this.collectable[k].first;
      for (const b of this.collectable[k].blocks) {
        if (b.kind === 'tower') {
          const { across, tall, over } = COLLAR;
          place(
            m,
            slot++,
            b.x,
            b.y,
            b.z + b.height + over - tall,
            b.yaw,
            b.length + 2 * across,
            b.width + 2 * across,
            tall,
          );
        } else if (b.kind === 'deck') {
          for (let side = -1; side <= 1; side += 2) {
            const offset = (side * (b.width - DECK.rail)) / 2;
            const [x, y] = [b.x - Math.sin(b.yaw) * offset, b.y + Math.cos(b.yaw) * offset];
            const fit = RAIL_COVER;
            place(
              m,
              slot++,
              x,
              y,
              b.z + DECK.slab - fit,
              b.yaw,
              b.length + 2 * fit,
              DECK.rail + 2 * fit,
              b.height - DECK.slab + 2 * fit,
            );
          }
        }
      }
    }
    this.changed[at] = 1;
  }

  /**
   * A crate on each place of a package not found, turned by its place in the list, every other placement at no size.
   * A name the game does not have is not a place. Written only when the set found is not what it was last written for;
   * the check reads and writes in place and makes nothing.
   */
  private paintPackages(found: readonly string[]): void {
    const at = this.packagesAt;
    const was = this.foundFor;
    let changed = !this.packagesWritten;
    for (let k = 0; k < this.places.length; k++) {
      const now = found.includes(this.places[k].id) ? 1 : 0;
      if (now !== was[k]) changed = true;
      was[k] = now;
    }
    if (!changed) return;
    this.packagesWritten = true;
    const [wood, straps] = [this.pools[at], this.pools[at + 1]];
    for (let k = 0; k < this.places.length; k++) {
      const { x, y, z } = this.places[k];
      place(wood, k, x, y, z, k * PACKAGE.turn, was[k] ? 0 : PACKAGE.size);
    }
    straps.set(wood);
    this.changed[at] = this.changed[at + 1] = 1;
  }

  /**
   * The people waiting, a person at each spot except where their level is going (they are aboard) or they are being
   * winched (they are on the rope), written only when the level going or the spot winched changes; and the rope, with the person rising up it by the share, written every frame it is out since it
   * follows the helicopter, and once more to put it away.
   */
  private rescues(pose: HelicopterPose, going: Level | null, winching?: Winching): void {
    const { rescuing, peopleAt } = this;
    let winched = -1;
    if (winching && winching.spot !== null)
      for (let k = 0; k < rescuing.length; k++) if (rescuing[k].level.id === winching.spot) winched = k;
    if (going !== this.rescuesFor || winched !== this.rescuesWinch) {
      this.rescuesFor = going;
      this.rescuesWinch = winched;
      const people = this.pools[peopleAt];
      people.fill(0);
      for (let k = 0; k < rescuing.length; k++) {
        if (rescuing[k].level === going || k === winched) continue;
        const f = this.feetOf(k);
        placePerson(people, k * PERSON_BOXES.length, f.x, f.y, f.z);
      }
      this.changed[peopleAt] = 1;
    }
    if (this.boatAt >= 0 && going !== this.boatsFor) this.setBoats(going);
    const rope = this.pools[peopleAt + 1];
    if (winched < 0) {
      if (this.ropeOut) {
        rope.fill(0);
        this.changed[peopleAt + 1] = 1;
        this.ropeOut = false;
      }
      return;
    }
    // the person on the rope rises from the ground at their spot to the helicopter's belly, drawn toward its middle as they go
    const share = Math.max(0, Math.min(1, winching!.share));
    const feet = this.feetOf(winched);
    const belly = pose.z + ROPE.belly;
    const x = feet.x + (pose.x - feet.x) * share;
    const y = feet.y + (pose.y - feet.y) * share;
    const base = feet.z + share * (belly - ROPE.height - feet.z);
    placePerson(rope, 0, x, y, base);
    const hand = base + ROPE.grip;
    place(rope, PERSON_BOXES.length, pose.x, pose.y, hand, 0, ROPE.width, ROPE.width, Math.max(0, belly - hand));
    this.ropeOut = true;
    this.changed[peopleAt + 1] = 1;
  }

  /**
   * The boats, one at each rescue that has one, sat on the sea where its sailor waits. A boat stays when its sailor has
   * been winched up out of it, left empty on the sea, since a boat does not go with the person taken off it. Written
   * when what is going changes, which is when the scene looks again; nothing moves them.
   */
  private setBoats(going: Level | null): void {
    this.boatsFor = going;
    const boats = this.pools[this.boatAt];
    boats.fill(0);
    this.boats.forEach((k, n) => {
      const { winch } = this.rescuing[k];
      const yaw = (winch as Winch).yaw ?? 0;
      const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
      BOAT_BOXES.forEach(([forward, across, up, along, wide, tall], b) => {
        const i = n * BOAT_BOXES.length + b;
        place(
          boats,
          i,
          winch.x + c * forward - s * across,
          winch.y + s * forward + c * across,
          winch.z + up,
          yaw,
          along,
          wide,
          tall,
        );
      });
    });
    this.changed[this.boatAt] = 1;
  }

  /**
   * The ground under every fire: where a patch burns, glowing ground, where it is out, burnt ground, and where it has not
   * caught, none, each patch turned by its own fixed yaw. Written only when a patch's state is not what it was last
   * written for; the check reads and writes in place and makes nothing.
   */
  private paintFires(fires: readonly { states: Uint8Array }[]): void {
    const was = this.firesFor;
    let moved = false;
    let n = 0;
    for (const { states } of fires) {
      for (let k = 0; k < states.length && n < was.length; k++, n++) {
        if (states[k] === was[n]) continue;
        was[n] = states[k];
        moved = true;
      }
    }
    if (!moved) return;
    const [glowing, burnt] = [this.pools[this.fireAt], this.pools[this.fireAt + 1]];
    const { burning, burnt: out, turn } = FIRE_GROUND;
    for (let k = 0; k < this.fireSpots.length; k++) {
      const { x, y, z } = this.fireSpots[k];
      // the placement a patch is not in is at no size where it stands
      if (was[k] === PATCH.burning) place(glowing, k, x, y, z, k * turn, burning.across, burning.across, burning.thick);
      else place(glowing, k, x, y, z, 0, 0);
      if (was[k] === PATCH.out) place(burnt, k, x, y, z + out.lift, k * turn, out.across, out.across, out.thick);
      else place(burnt, k, x, y, z, 0, 0);
    }
    this.changed[this.fireAt] = this.changed[this.fireAt + 1] = 1;
    this.paintBurnt(was);
  }

  /**
   * The trees on the patches: each tree of a patch that burns or is out is drawn at no size in its kind's pool, which its trunk
   * and crown share, and as a charred pole in the burnt group; a patch not caught has its trees whole, put back as the island
   * placed them. Written only for a patch that has changed between burnt and whole, so one that burns and goes out writes
   * nothing, and the pools of the kinds that changed are marked, not the rest. Makes nothing.
   */
  private paintBurnt(was: Uint8Array): void {
    if (this.burntAt < 0) return;
    const { patchTrees, burntFor, treePool, treeSlot, pools, changed, treeBurnt, islandTrees } = this;
    const poles = pools[this.burntAt];
    let wrote = false;
    for (let p = 0; p < burntFor.length; p++) {
      const burnt = was[p] === PATCH.burning || was[p] === PATCH.out ? 1 : 0;
      if (burnt === burntFor[p]) continue;
      burntFor[p] = burnt;
      for (let k = patchTrees.first[p]; k < patchTrees.first[p + 1]; k++) {
        const t = patchTrees.tree[k];
        const o = t * TREE_STRIDE;
        const [x, y, z, yaw, scale] = [1, 2, 3, 4, 5].map((i) => islandTrees[o + i]);
        const pool = pools[treePool[t]];
        treeBurnt[t] = burnt;
        if (burnt) {
          const kind = TREE_KINDS[islandTrees[o]];
          const wide = trunkRadius(kind) * CHARRED.wider * scale;
          place(pool, treeSlot[t], x, y, z, yaw, 0);
          place(poles, k, x, y, z, yaw, wide, wide, treeSize(kind).top * scale);
        } else {
          place(pool, treeSlot[t], x, y, z, yaw, scale);
          place(poles, k, x, y, z, 0, 0);
        }
        changed[treePool[t]] = changed[treePool[t] + 1] = 1;
        wrote = true;
      }
    }
    if (wrote) changed[this.burntAt] = 1;
  }

  /**
   * The bucket as it is told: its line from the skids down to its top, the orange bucket under it and, with the tank
   * full, the water's top at its rim; or all three at no size where it does not hang. Written every frame it hangs, since
   * it follows the helicopter, and once more to put it away.
   */
  private hang(pose: HelicopterPose, bucket: Readonly<BucketPose>): void {
    const at = this.bucketAtPool;
    const [line, body, water] = [this.pools[at], this.pools[at + 1], this.pools[at + 2]];
    if (!bucket.hung) {
      if (!this.bucketOut) return;
      this.bucketOut = false;
      for (const m of [line, body, water]) place(m, 0, pose.x, pose.y, pose.z, 0, 0);
    } else {
      this.bucketOut = true;
      const top = bucket.bottom + BUCKET.height;
      place(line, 0, pose.x, pose.y, top, pose.yaw, BUCKET.rope, BUCKET.rope, bucket.line);
      place(body, 0, pose.x, pose.y, bucket.bottom, pose.yaw, BUCKET.width, BUCKET.width, BUCKET.height);
      const { across, thick } = BUCKET.water;
      if (bucket.full) place(water, 0, pose.x, pose.y, top - thick, pose.yaw, across, across, thick);
      else place(water, 0, pose.x, pose.y, pose.z, 0, 0);
    }
    this.changed.fill(1, at, at + 3);
  }

  /** How many patches are drawn glowing and how many burnt now: what the test API says, and nothing the frame uses. */
  get groundDrawn(): { burning: number; burnt: number } {
    const drawn = { burning: 0, burnt: 0 };
    if (this.fireAt < 0) return drawn;
    const [glowing, burnt] = [this.pools[this.fireAt], this.pools[this.fireAt + 1]];
    for (let k = 0; k < this.fireSpots.length; k++) {
      if (glowing[k * 16 + 10] !== 0) drawn.burning++;
      if (burnt[k * 16 + 10] !== 0) drawn.burnt++;
    }
    return drawn;
  }

  /** How many trees are drawn burnt now, as a charred pole, and how many the pool has room for: what the test API says, and nothing the frame uses. */
  get burntDrawn(): { trees: number; pool: number } {
    if (this.burntAt < 0) return { trees: 0, pool: 0 };
    const poles = this.pools[this.burntAt];
    const pool = poles.length / 16;
    let trees = 0;
    for (let k = 0; k < pool; k++) if (poles[k * 16 + 10] !== 0) trees++;
    return { trees, pool };
  }

  /** What is drawn of the bucket now: what the test API says, and nothing the frame uses. */
  get bucketDrawn(): BucketDrawn {
    const none = { hung: false, full: false, line: 0 };
    if (this.bucketAtPool < 0) return none;
    const line = this.pools[this.bucketAtPool][10];
    if (line === 0 && this.pools[this.bucketAtPool + 1][10] === 0) return none;
    return { hung: true, full: this.pools[this.bucketAtPool + 2][10] !== 0, line };
  }

  /** How many boats are drawn now, sat on the sea with their sailors winched up or not: what the test API says, and nothing the frame uses. */
  get boatsDrawn(): number {
    if (this.boatAt < 0) return 0;
    const m = this.pools[this.boatAt];
    let drawn = 0;
    // the floor is the box a boat is counted by
    for (let k = 0; k < this.boats.length; k++) if (m[(k * BOAT_BOXES.length + 3) * 16 + 10] !== 0) drawn++;
    return drawn;
  }

  /** How many people are standing waiting now, not aboard and not on the rope: what the test API says, and nothing the frame uses. */
  get peopleDrawn(): number {
    if (this.peopleAt < 0) return 0;
    const m = this.pools[this.peopleAt];
    let drawn = 0;
    // the torso is the box a person is counted by
    for (let k = 0; k < this.rescuing.length; k++) if (m[(k * PERSON_BOXES.length + 2) * 16 + 10] !== 0) drawn++;
    return drawn;
  }

  /** Whether the rope, with the person on it, is drawn now: what the test API says, and nothing the frame uses. */
  get ropeDrawn(): boolean {
    return this.peopleAt >= 0 && this.pools[this.peopleAt + 1][2 * 16 + 10] !== 0;
  }

  /** How many crates of packages are drawn now: what the test API says, and nothing the frame uses. */
  get packagesDrawn(): number {
    if (this.packagesAt < 0) return 0;
    const m = this.pools[this.packagesAt];
    let drawn = 0;
    for (let k = 0; k < this.places.length; k++)
      if (m[k * 16] !== 0 || m[k * 16 + 5] !== 0 || m[k * 16 + 10] !== 0) drawn++;
    return drawn;
  }

  /** How many placements of gold are drawn now: what the test API says, and nothing the frame uses. */
  get gold(): number {
    if (this.goldAt < 0) return 0;
    const m = this.pools[this.goldAt];
    let drawn = 0;
    for (let k = 0; k < this.goldSlots; k++)
      if (m[k * 16] !== 0 || m[k * 16 + 5] !== 0 || m[k * 16 + 10] !== 0) drawn++;
    return drawn;
  }

  /** Each tree the sway is moving leaned as it says, and each it has let go since the last write stood up again. */
  private bow(sway: Sway): void {
    const { treePool, treeSlot, treeScale, leaning, moving, pools, changed, treeBurnt } = this;
    for (let k = 0; k < sway.count; k++) moving[sway.tree[k]] = 1;
    for (let n = 0; n < this.leaned; n++) {
      const t = leaning[n];
      // a burnt tree is at no size and stays there: leaning it would give it its height back
      if (moving[t] || treeBurnt[t]) continue;
      lean(pools[treePool[t]], treeSlot[t], 0, 0, 0, treeScale[t]);
      changed[treePool[t]] = changed[treePool[t] + 1] = 1;
    }
    this.leaned = 0;
    for (let k = 0; k < sway.count; k++) {
      const t = sway.tree[k];
      moving[t] = 0;
      if (treeBurnt[t]) continue;
      lean(pools[treePool[t]], treeSlot[t], sway.leanX[k], sway.leanY[k], sway.squash[k], treeScale[t]);
      changed[treePool[t]] = changed[treePool[t] + 1] = 1;
      leaning[this.leaned++] = t;
    }
  }
}

/** A person standing with their feet at (x, y, z), written as five boxes from slot `first` of `out`, turned by `PERSON.yaw`. */
function placePerson(out: Float32Array, first: number, x: number, y: number, z: number): void {
  const [c, s] = [Math.cos(PERSON.yaw), Math.sin(PERSON.yaw)];
  PERSON_BOXES.forEach(([side, up, across, along, tall], b) =>
    place(out, first + b, x - s * side, y + c * side, z + up, PERSON.yaw, across, along, tall),
  );
}

/** A crate set down on a pad, out from its middle past the ends of the H, turned a little off the pad's square. */
function onPadEdge(out: Float32Array, i: number, pad: Readonly<Pad>): void {
  const r = pad.radius * CRATE_OUT;
  place(out, i, pad.x + Math.cos(pad.yaw) * r, pad.y + Math.sin(pad.yaw) * r, pad.z, pad.yaw + 0.4);
}
