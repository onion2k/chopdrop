/**
 * The arena: the content of the world. The island is here: the recipe of
 * numbers it is made from, the kinds of tree that grow on it and the one
 * island built from them, which the game reads and the page draws. The
 * generator in `island.ts` is the same for any recipe, and the lower modules
 * go on knowing nothing of what is on it.
 */
import { buildIsland, type Island, type IslandRecipe } from './island';
import { seeded } from './random';

/** The kinds of tree, in the order the island's trees name them by. Each has its habitat in the recipe, at the same index. */
export const TREE_KINDS = ['broadleaf', 'pine', 'poplar', 'palm', 'bush'] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

/**
 * How much each kind of tree gives to the helicopter's downwash, against a broadleaf's one: a palm and a poplar,
 * tall and slender, bend the most, and a pine and a bush, stiff and low, the least.
 */
export const TREE_GIVE: Record<TreeKind, number> = { broadleaf: 1, pine: 0.7, poplar: 1.2, palm: 1.4, bush: 0.6 };

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

/**
 * The one island, built from the recipe the first time it is asked for and
 * the same object after. It is a cache of one, named so: it holds the world
 * for the life of the page and is never added to, since a page has one island.
 */
let built: Island | undefined;
export function theIsland(): Island {
  return (built ??= buildIsland(ISLAND, seeded(ISLAND.seed)));
}
