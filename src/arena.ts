/**
 * The arena: the content of the world. The island is here: the recipe of
 * numbers it is made from, the kinds of tree that grow on it and the one
 * island built from them, which the game reads and the page draws. The
 * generator in `island.ts` is the same for any recipe, and the lower modules
 * go on knowing nothing of what is on it.
 */
import { buildIsland, type Clearing, type Island, type IslandRecipe } from './island';
import type { Gate, Level, Ring } from './mission';
import { seeded } from './random';
import type { Block } from './solids';

/** The kinds of tree, in the order the island's trees name them by. Each has its habitat in the recipe, at the same index. */
export const TREE_KINDS = ['broadleaf', 'pine', 'poplar', 'palm', 'bush'] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

/**
 * How much each kind of tree gives to the helicopter's downwash, against a broadleaf's one: a palm and a poplar,
 * tall and slender, bend the most, and a pine and a bush, stiff and low, the least.
 */
export const TREE_GIVE: Record<TreeKind, number> = { broadleaf: 1, pine: 0.7, poplar: 1.2, palm: 1.4, bush: 0.6 };

/**
 * What the helicopter can fly through that stands on the island, and is collected by flying through: its `id`, a name
 * that players' saves are given and that never changes, its `name` for the words, the `opening` that is flown through
 * (a `Gate`, which the course uses for two of them) and its solid `blocks`.
 */
export interface Collectible {
  id: string;
  name: string;
  opening: Gate;
  blocks: readonly Block[];
}

/** A structure as `bridgeAt` and `towersAt` build it: the collectible, and the ground it keeps clear of trees. */
interface Built extends Collectible {
  clearings: readonly Clearing[];
}

/** The numbers every bridge is built to: its deck's width and thickness, rails and all, and an abutment's width, a metre past each edge. */
const BRIDGE = { width: 8, height: 2.7, abutment: 10 };

/** Everything that is found for a bridge, by the script that places them, and kept here as numbers. */
interface BridgeSite {
  id: string;
  name: string;
  /** What the words call its opening: "under the bridge". */
  label: string;
  /** The deck's middle, its underside at `z` (13 over the water where the river runs under it), turned square to the river, and its length from bank to bank. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  length: number;
  /** How far down the abutments' feet are sunk, below the lowest ground under either. */
  low: number;
  /** The abutments' lengths from each end of the deck inward, the end that lies toward negative along the deck first, and what each is called. */
  ends: readonly [number, number];
  sides: readonly [string, string];
  /** Where the river runs under the deck, the water's height there and how wide the opening is across it. */
  opening: { x: number; y: number; water: number; width: number };
}

/** A number kept to the centimetre, as the content is. */
const cm = (v: number) => Math.round(v * 100) / 100;

/**
 * A bridge across a gorge, from a few found numbers: a deck resting on both banks, abutments filling the ground under
 * each end wherever there is less room between it and the deck than the helicopter needs to stand (without them it
 * could be pressed between the bank rising under it and the deck above it, and be held inside the deck), and the
 * opening under the deck, from the water to its underside and facing along the river. The deck's end is the
 * abutment's end, and the abutment is a metre wider than the deck either side.
 */
function bridgeAt(site: BridgeSite): Built {
  const { x, y, z, yaw, length } = site;
  const deck: Block = {
    name: site.name,
    kind: 'deck',
    x,
    y,
    z,
    yaw,
    length,
    width: BRIDGE.width,
    height: BRIDGE.height,
  };
  const abutments = site.ends.map((end, k): Block => {
    // the middle of the abutment, along the deck from its middle, toward the end it stands under
    const along = (k ? 1 : -1) * (length / 2 - end / 2);
    return {
      name: `${site.name}'s ${site.sides[k]} abutment`,
      kind: 'abutment',
      x: cm(x + along * Math.cos(yaw)),
      y: cm(y + along * Math.sin(yaw)),
      z: site.low,
      yaw,
      length: end,
      width: BRIDGE.abutment,
      height: z - site.low,
    };
  });
  const { water } = site.opening;
  const opening: Gate = {
    kind: 'gate',
    x: site.opening.x,
    y: site.opening.y,
    z: (water + z) / 2,
    yaw: yaw - Math.PI / 2,
    width: site.opening.width,
    height: z - water,
    label: site.label,
  };
  const blocks = [deck, ...abutments];
  return { id: site.id, name: site.name, opening, blocks, clearings: blocks.map(clearing) };
}

/** The numbers every pair of towers is built to: each tower 6 square and 38.5 tall, their inner faces 20 apart. */
const TOWER = { size: 6, height: 38.5, gap: 20 };

/** Everything that is found for a pair of towers, and kept here as numbers. */
interface TowersSite {
  id: string;
  name: string;
  /** What the words call its opening: "between the towers". */
  label: string;
  /** The middle of the gap, and the way it faces: through it, which is the way the pair is turned to be flown. */
  x: number;
  y: number;
  yaw: number;
  /** The feet's height, sunk a little under the lowest ground at either, and the ground in the gap, which the opening reaches down to. */
  z: number;
  ground: number;
  /** Where chequered flags stand, if the opening begins a level: on each tower's top middle. */
  flags?: boolean;
  /**
   * Where the towers' middles were put, first and second, where they were found by hand and are not exactly a gap and
   * a tower apart across the way they face; said, they are what the pair is built on, to the centimetre, and not the
   * middle and the way.
   */
  middles?: readonly [readonly [number, number], readonly [number, number]];
}

/**
 * A pair of towers from a few found numbers, standing side by side across the way they face, with their inner faces a
 * gap apart, and the opening between them, from the ground in the gap to their tops. The one that lies toward the
 * lower end of the axis it is spread along (west for a pair spread east and west, south for a pair spread north and
 * south) is first, and is named so.
 */
function towersAt(site: TowersSite): Built {
  const { x, y, yaw, z } = site;
  const off = (TOWER.gap + TOWER.size) / 2;
  const tower = (side: number): Block => ({
    name: '',
    kind: 'tower',
    x: cm(x - side * off * Math.sin(yaw)),
    y: cm(y + side * off * Math.cos(yaw)),
    z,
    yaw,
    length: TOWER.size,
    width: TOWER.size,
    height: TOWER.height,
  });
  const pair = [tower(1), tower(-1)];
  site.middles?.forEach(([mx, my], k) => {
    [pair[k].x, pair[k].y] = [mx, my];
  });
  // the pair is spread across the way it faces, along whichever axis that is nearer; the lower of the two is first
  const alongX = Math.abs(pair[0].x - pair[1].x) >= Math.abs(pair[0].y - pair[1].y);
  const key = (b: Block) => (alongX ? b.x : b.y);
  const [first, second] = pair.sort((a, b) => key(a) - key(b));
  first.name = `${site.name}' ${alongX ? 'west' : 'south'} tower`;
  second.name = `${site.name}' ${alongX ? 'east' : 'north'} tower`;
  const blocks = [first, second];
  const top = z + TOWER.height;
  const opening: Gate = {
    kind: 'gate',
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: (site.ground + top) / 2,
    yaw,
    width: Math.hypot(first.x - second.x, first.y - second.y) - first.width,
    height: top - site.ground,
    label: site.label,
    ...(site.flags ? { flags: blocks.map((b) => ({ x: b.x, y: b.y, z: b.z + b.height })) } : {}),
  };
  return { id: site.id, name: site.name, opening, blocks, clearings: blocks.map(clearing) };
}

/** The ground kept clear of trees under and round a block: 8 round a tower, and 4 past a deck and its ends. */
function clearing(block: Block): Clearing {
  const margin = block.kind === 'tower' ? 8 : 4;
  return { x: block.x, y: block.y, yaw: block.yaw, length: block.length + 2 * margin, width: block.width + 2 * margin };
}

/**
 * The seven structures, painted steel as chosen from a mock, each placed by a script that held it to its rules and
 * kept here as the numbers it found, every tower on dry land. Two are the course's: the bridge across the gorge at
 * the head of the northern river, turned square to the river's run into it and resting on both banks on its
 * abutments, and the two towers on the level ground between the shoulder pad and the river, their tops at 110. The
 * rest are the west bridge across the gorge west of the range, and four more pairs of towers.
 *
 * A pair that stands on a level's way is turned so that way passes through its gap, its middle on the way's line and
 * its opening facing along it: the lakeside towers on the ring trial's leg from ring 1 to ring 2, 0.62 of the way along it, far enough past ring 1 and its turn for the pilot to line up on the gap, and the southern
 * towers on the way over the water, which flies at 62 and passes between their tops at 64.9. No dry ground on that
 * way would hold a second pair, so the southeastern towers stand off it, and with the eastern towers, which no way
 * passes either, face across the slope they stand on, 20 clear of every way.
 */
const BUILT: readonly Built[] = [
  bridgeAt({
    id: 'gorge-bridge',
    name: 'the gorge bridge',
    label: 'under the bridge',
    x: -15.21,
    y: 335.67,
    z: 87.5,
    yaw: 2.2689,
    length: 46.5,
    low: 77,
    ends: [14.75, 8.75],
    sides: ['south', 'north'],
    opening: { x: -16.5, y: 337.2, water: 74.5, width: 20 },
  }),
  towersAt({
    id: 'shoulder-towers',
    name: 'the shoulder towers',
    label: 'between the towers',
    x: -120,
    y: 225,
    yaw: 1.1479,
    z: 71.5,
    ground: 72,
    flags: true,
    middles: [
      [-131.85, 230.33],
      [-108.15, 219.67],
    ],
  }),
  bridgeAt({
    id: 'west-bridge',
    name: 'the west bridge',
    label: 'under the west bridge',
    x: -282.6,
    y: 166.88,
    z: 50,
    yaw: -0.4949,
    length: 43.5,
    low: 40,
    ends: [8, 8],
    sides: ['west', 'east'],
    opening: { x: -282.6, y: 166.88, water: 37, width: 26 },
  }),
  towersAt({
    id: 'southern-towers',
    name: 'the southern towers',
    label: 'between the southern towers',
    x: -76.82,
    y: -265.04,
    yaw: 0.7328,
    z: 26.39,
    ground: 26.5,
  }),
  towersAt({
    id: 'southeastern-towers',
    name: 'the southeastern towers',
    label: 'between the southeastern towers',
    x: 65.08,
    y: -199.33,
    yaw: 1.4771,
    z: 26.39,
    ground: 26.5,
  }),
  towersAt({
    id: 'lakeside-towers',
    name: 'the lakeside towers',
    label: 'between the lakeside towers',
    x: 112.1,
    y: -28.6,
    yaw: -2.5536,
    z: 20.9,
    ground: 22.8,
  }),
  towersAt({
    id: 'eastern-towers',
    name: 'the eastern towers',
    label: 'between the eastern towers',
    x: 302,
    y: 86,
    yaw: 0.317,
    z: 18.02,
    ground: 18,
  }),
];

/** The structures that can be collected, each with its opening and its blocks. */
export const COLLECTIBLES: readonly Collectible[] = BUILT.map(({ id, name, opening, blocks }) => ({
  id,
  name,
  opening,
  blocks,
}));

/** What stands on the island in every level, and is solid in every level: every block of all eight. */
export const STRUCTURES: readonly Block[] = COLLECTIBLES.flatMap((c) => c.blocks);

/** A hidden package's place: where it lies, `z` being the ground under it. Its `id` is in players' saves and never changes. */
export interface PackagePlace {
  id: string;
  x: number;
  y: number;
  z: number;
}

/**
 * The ten places for hidden packages, found by a script on a grid of 2 and kept here as the numbers it found. Each is
 * on dry land by the island's own maps and inland (5 or more above the sea), in a clearing (the ground within 1.5 over
 * 12 square, no tree's foot within 6) that a wood stands round (eight or more trees' feet within 30), 120 or more from
 * every pad, 60 or more from every structure's blocks and 140 or more from every other, inside the bounds the
 * helicopter is kept to. The wood and the spacing were loosened and no other rule: twelve trees and 150 apart were
 * asked first, but inland the most places that keep them is nine at a wood of 8 and 150, and ten fit at a
 * wood of 8 and 140. Of the places that keep every rule the ten chosen are those whose least gap from each other is
 * the greatest, 145.8 m. The ground is the island's as it stands, so an island made again otherwise moves every one,
 * and the tests that pin them say so.
 */
export const PACKAGES: readonly PackagePlace[] = [
  { id: 'west-shore-wood', x: -546.1, y: 19.9, z: 10.85 },
  { id: 'north-gorge-wood', x: -148.1, y: 389.9, z: 10.0 },
  { id: 'lake-east-wood', x: 125.9, y: -156.1, z: 27.96 },
  { id: 'inland-east-wood', x: 179.9, y: 131.9, z: 25.89 },
  { id: 'south-river-wood', x: 195.9, y: -292.1, z: 26.89 },
  { id: 'north-east-wood', x: 287.9, y: 241.9, z: 19.95 },
  { id: 'east-wood', x: 395.9, y: 143.9, z: 18.67 },
  { id: 'east-ridge-wood', x: 417.9, y: -66.1, z: 48.22 },
  { id: 'far-north-east-wood', x: 457.9, y: 275.9, z: 24.18 },
  { id: 'north-east-shore-wood', x: 485.9, y: 423.9, z: 8.7 },
];

/** The ground kept clear of trees under and round each structure. */
const CLEARINGS: readonly Clearing[] = BUILT.flatMap((b) => b.clearings);

/**
 * Every number the island is made from. Units are world units, near enough
 * metres (the helicopter is 13 long), with z up and the sea at 0. What each
 * one does is said where its type is, in `island.ts`; what they add up to is
 * an island about 1,100 across with a bayed and beached coast, hills and
 * meadows, a range of mountains in the north-west, a few lakes held in the
 * land, rivers from the hills to the sea, and nine pads to fly between.
 */
export const ISLAND: IslandRecipe = {
  seed: 1977,
  seaLevel: 0,
  // 513 vertices a side, 1,536 across: x and y run from −768 to 768.
  grid: { squares: 512, cell: 3 },
  // The coast is an ellipse pushed in and out by noise into bays and headlands, a beach along most of it and a cliff
  // where the cliff noise is high; the sea floor is a shallow shelf and then a drop, and the grid's edge is deep.
  shape: {
    centre: [10, 15],
    radius: [560, 470],
    turn: 0.3,
    coastWavelength: 420,
    coastWarp: 0.7,
    coastOctaves: 4,
    coastDetail: { wavelength: 80, octaves: 2, amount: 30, reach: 200 },
    beach: { width: 42, height: 3 },
    cliff: { wavelength: 300, from: 0.42, to: 0.62, width: 9, height: 13 },
    inland: { width: 130, vary: 1.1, wavelength: 330, octaves: 1 },
    shelf: { width: 80, depth: 3.5 },
    drop: { width: 140, depth: 16 },
    rim: { start: 0.86, depth: 18 },
  },
  // Rolling hills between 16 and 60 high, with hummocks and a fine grain on them.
  hills: {
    wavelength: 260,
    octaves: 4,
    base: 16,
    amplitude: 46,
    detail: { wavelength: 48, octaves: 2, amount: 4 },
    grain: { wavelength: 16, amount: 0.5 },
  },
  // The range, north-west of the middle and off its axis: crests of 140 to 155 under a snowline.
  mountains: {
    centre: [-110, 250],
    turn: 0.55,
    length: 430,
    width: 230,
    core: 0.2,
    bend: { wavelength: 300, octaves: 1, amount: 80 },
    wavelength: 200,
    octaves: 5,
    from: 0.3,
    to: 0.85,
    uplift: 45,
    height: 80,
    flatten: 0.3,
    rugged: 1.5,
  },
  // Broad open lowland, pressed flat out of the hills but tilted to drain to the sea.
  meadows: {
    wavelength: 340,
    octaves: 2,
    from: 0.56,
    to: 0.84,
    pressure: 0.8,
    levelWavelength: 500,
    levelOctaves: 1,
    low: 4,
    high: 15,
    rise: 0.03,
    rough: { wavelength: 50, octaves: 1, amount: 2 },
  },
  // Three round dips cut into the middle-height land, where the water will stand.
  basins: {
    count: 3,
    within: 0.85,
    radius: [55, 90],
    depth: [10, 15],
    height: [20, 55],
    coast: 140,
    spacing: 260,
    home: 260,
    tries: 600,
    hold: 4,
    fill: 0.03,
  },
  // The erosion lines: gullies on the hillsides where a little water gathers, valleys where a lot does.
  erosion: {
    k: 1.2,
    max: 14,
    from: 3,
    to: 14,
    floor: 1,
    scatter: 0.6,
    blur: 1,
    passes: 2,
    protect: 30,
    lake: 1,
    valley: { area: 300, k: 0.15, max: 16, blur: 3 },
  },
  lakes: { squares: 200, depth: 2.5, tolerance: 0.05 },
  // Up to eight river systems with their longer tributaries, from springs in the hills to the sea.
  rivers: {
    area: 400,
    spring: 35,
    minSpring: 24,
    steep: 0.55,
    systems: 8,
    tributaries: 3,
    minTributary: 120,
    drop: 0.5,
    lakeDip: 0.1,
    seaDip: 0.3,
    width: { base: 2, scale: 0.05, min: 3, max: 11 },
    channel: { base: 0.8, scale: 0.25 },
    bank: { lift: 0.2, slope: 0.55, reach: 24 },
    levee: { share: 0.15, margin: 3, lift: 0.05 },
    gap: 6,
    minRun: 15,
    relax: 5,
    smooth: 2,
    chord: 2,
    meander: { wavelength: 150, octaves: 2, amount: 45, flat: 0.2, near: 20, far: 60 },
  },
  // Nine pads: home on the south coast, then these sites in turn. `radius` and `thickness` are what the page draws them by.
  pads: {
    radius: 11,
    thickness: 0.35,
    flat: 4,
    blend: 18,
    home: [-40, -420],
    sites: ['hilltop', 'lakeside', 'rivermouth', 'meadow', 'beach', 'shoulder', 'meadow', 'hilltop'],
    spacing: 150,
    water: 30,
    shore: 8,
    low: 1.2,
    relief: 5,
    step: 4,
    rules: {
      relief: 2,
      home: { high: 10, penalty: 4 },
      hilltop: { mountain: 0.25, from: 20 },
      lakeside: { reach: 2, best: 1.3 },
      rivermouth: { reach: 130 },
      meadow: { mask: 0.6, mountain: 0.05, weight: 20 },
      beach: { height: 4.5, reach: 30 },
      shoulder: { mountain: 0.4, from: 60, best: 100, weight: 0.1, relief: 4 },
      pick: 3,
    },
  },
  // What the ground is made of, by height, slope and what is near: the colours are the page's business. The gullies run
  // along the water that gathers from 30 cells, on slopes steeper than about 16 degrees.
  surface: {
    none: 6,
    wavelength: 28,
    heightJitter: 6,
    slopeJitter: 0.08,
    maskJitter: 0.1,
    snow: 100,
    snowFlat: 0.66,
    rock: 0.7,
    rockLine: 165,
    sand: 2.2,
    bank: 4,
    gullyArea: 30,
    gullyFlat: 0.96,
    gullyBlur: 3,
    gullyWiden: 0.06,
    meadow: 0.5,
    forest: 0.5,
    dirt: 6,
  },
  sea: { shallow: 6 },
  // About 7,500 trees by habitat. The order of `habitats` is the order of `TREE_KINDS`.
  trees: {
    spacing: 5.5,
    jitter: 0.9,
    max: 8000,
    fill: 0.97,
    shore: 0.4,
    scale: [0.75, 1.3],
    apron: 25,
    clear: CLEARINGS,
    water: 3,
    forest: { wavelength: 190, octaves: 3, from: 0.5, to: 0.7 },
    meadow: 0.12,
    wetReach: 70,
    sink: 0.2,
    habitats: [
      // broadleaf: the lowlands and the lower hills, a little wetter than not, thick in the forests
      {
        height: [2, 70, 15],
        flat: 0.8,
        sea: [25, Infinity, 20],
        wet: 0.35,
        forest: 0.6,
        density: 0.75,
        sand: false,
      },
      // pine: up the mountains, in forest
      {
        height: [45, 135, 25],
        flat: 0.72,
        sea: [60, Infinity, 30],
        wet: 0,
        forest: 0.5,
        density: 0.8,
        sand: false,
      },
      // poplar: along the rivers and the lakes, in the wet low ground
      {
        height: [1.5, 45, 10],
        flat: 0.85,
        sea: [20, Infinity, 20],
        wet: 0.85,
        forest: 0.2,
        density: 0.6,
        sand: false,
      },
      // palm: the coast, sand or not
      { height: [0.4, 7, 3], flat: 0.9, sea: [0, 70, 30], wet: 0, forest: 0, density: 0.55, sand: true },
      // bush: scattered anywhere
      {
        height: [1, 120, 10],
        flat: 0.75,
        sea: [10, Infinity, 15],
        wet: 0,
        forest: 0,
        density: 0.2,
        sand: false,
      },
    ],
  },
};

/** A level that is a parcel waiting on one pad and wanted on another, the pads by their place in the island's list. */
function delivery(id: string, name: string, pickup: number, drop: number): Level {
  return {
    id,
    name,
    kind: 'delivery',
    steps: [
      { kind: 'pickup', pad: pickup },
      { kind: 'drop', pad: drop },
    ],
  };
}

/**
 * A level that is a run of rings to fly through, the first of them where it begins: each ring at its middle
 * `[x, y, z]`, an `opening` wide, facing the way from the ring before it, and the first the way from the point `from`,
 * a pad beside it, so that it is flown straight into. `from` is said here so that the levels can be read without
 * building the island; a test holds it to the pad.
 */
function trial(
  id: string,
  name: string,
  from: readonly [number, number],
  opening: number,
  middles: readonly (readonly [number, number, number])[],
): Level {
  const steps = middles.map((middle, k) => ringFrom(k ? middles[k - 1] : from, middle, opening));
  return { id, name, kind: 'rings', steps };
}

/** A ring of `opening` with its middle at [x, y, z], facing the way from `from`, so that it is flown straight into. */
function ringFrom(
  from: readonly [number, number, ...number[]],
  [x, y, z]: readonly [number, number, number],
  opening: number,
): Ring {
  return { kind: 'ring', x, y, z, yaw: Math.atan2(y - from[1], x - from[0]), opening };
}

/** The opening between the shoulder towers, which begins the course: the gap between their inner faces, from the ground in it to their tops. */
const BETWEEN_THE_TOWERS: Gate = COLLECTIBLES.find((c) => c.id === 'shoulder-towers')!.opening;

/** The opening under the gorge bridge, where the river runs under the deck, facing up the gorge, from the water at 74.5 to the deck's underside. */
const UNDER_THE_BRIDGE: Gate = COLLECTIBLES.find((c) => c.id === 'gorge-bridge')!.opening;

/**
 * The course: begun by flying between the towers, then up the river into the gorge and under the bridge, out past
 * the spring and round through three rings of 8 over the eastern hills, and back down onto the shoulder pad. The rings
 * were found by the script that found the trials', to their rules, clear of the towers and the bridge.
 */
function course(): Level {
  const middles = [
    [80, 330, 120],
    [80, 250, 98],
    [20, 190, 94],
  ] as const;
  const rings = middles.map((middle, k) =>
    ringFrom(k ? middles[k - 1] : [UNDER_THE_BRIDGE.x, UNDER_THE_BRIDGE.y], middle, 8),
  );
  return {
    id: 'under-and-between',
    name: 'Under and between',
    kind: 'course',
    steps: [BETWEEN_THE_TOWERS, UNDER_THE_BRIDGE, ...rings, { kind: 'land', pad: 6 }],
  };
}

/**
 * The levels, in order, each pad held by a test to what it is. None is flown from a place of its own: a level begins
 * where its first step is. The deliveries begin on their pickup pads: the first a short one with a climb at the end,
 * from the meadow pad 187 inland of home to the hilltop pad 187 beyond it; then 646 from the river mouth to the
 * lakeside pad, across a lake; 501 from the northern meadow pad over the range, its peaks past 140, to the beach; and
 * 392 from the lakeside pad up a river valley to the shoulder pad, 79 up the mountain.
 *
 * The ring trials begin at their first ring, which is drawn as a start. The first, with its ring facing from the
 * lakeside pad, is six rings of 10 in a circuit of 365 over the meadow, west and round the meadow pad and back east.
 * The second, with its ring facing from that meadow pad, is nine rings of 8 up the river that falls from the gorge, 454
 * of them, climbing from 37 up to 107 and turning with the water. They were found by a script that held every ring
 * clear of the trees and 8 over the ground under it, and every run between rings 10 over the ground and the
 * treetops; the tests hold them to it still.
 *
 * The course, last for now, begins by flying between the towers and ends on the shoulder pad: between the towers,
 * under the bridge and through three rings, as `course` says, its clock stopping as the skids touch. Nothing is
 * locked, so it is open from the first.
 */
export const LEVELS: readonly Level[] = [
  delivery('first-delivery', 'First delivery', 4, 1),
  trial('ring-trial', 'Ring trial', [201, -15], 10, [
    [140, -10, 42],
    [95, -40, 43.5],
    [40, -20, 40],
    [15, 50, 43.5],
    [50, 90, 43.5],
    [120, 100, 43.5],
  ]),
  delivery('over-the-water', 'Over the water', 3, 2),
  delivery('over-the-range', 'Over the range', 7, 5),
  trial('up-the-valley', 'Up the valley', [69, 69], 8, [
    [39, 41, 37.5],
    [-23, 47, 43],
    [-55, 80, 42.5],
    [-35, 126, 53.5],
    [-53, 174, 72],
    [-59, 219, 84.5],
    [-65, 264, 95.5],
    [-47, 315, 87.5],
    [5, 341, 107],
  ]),
  delivery('mountain-drop', 'Mountain drop', 2, 6),
  course(),
];

/**
 * The one island, built from the recipe the first time it is asked for and
 * the same object after. It is a cache of one, named so: it holds the world
 * for the life of the page and is never added to, since a page has one island.
 */
let built: Island | undefined;
export function theIsland(): Island {
  return (built ??= buildIsland(ISLAND, seeded(ISLAND.seed)));
}
