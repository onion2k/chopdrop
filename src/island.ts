/**
 * The island, made from a recipe of numbers and a source of chance. It is a
 * heightfield with the things the game needs read out of it: where the water
 * is, what each triangle is made of, where the landing pads are and where
 * the trees stand. Nothing here draws or plays; the page draws it from
 * `Island` and the helicopter flies over `island.ground`.
 *
 * The land is made the way land is: a coast and hills and a range of
 * mountains laid down as noise, then water let run over it. Rain is poured
 * on the grid by a priority-flood, which finds where it gathers (the
 * erosion lines are cut there, and lakes are held where the land has a
 * hollow) and where it runs away, and rivers are traced down those
 * runs from the hills to the sea. Pads are flattened into sites, and
 * trees are scattered by habitat on what is left. Every number is in the
 * recipe, which `arena.ts` holds; this module is the same for any island.
 *
 * Chance is handed in and noise is seeded from the recipe, so the same
 * recipe and the same source give the same island every time.
 */
import { Flood, Heightfield, boxBlur, chamfer, fillGently, flowAccumulation } from './heightfield';
import { fbm, hash01, noise2, ridged } from './noise';
import type { Random } from './random';

/** What a triangle of the land is made of. `none` is not drawn: it is deep under the sea. */
export const SURFACE = {
  none: 0,
  sand: 1,
  grass: 2,
  meadow: 3,
  forest: 4,
  gully: 5,
  rock: 6,
  snow: 7,
  dirt: 8,
} as const;
export type Surface = (typeof SURFACE)[keyof typeof SURFACE];

/** What a square of the grid is under: dry land, or the open sea, shallow near the shore and deep beyond. */
export const SEA = { dry: 0, shallow: 1, deep: 2 } as const;

/** A lake: its level, its middle, and the grid squares its water covers (index j * (cols - 1) + i). */
export interface Lake {
  level: number;
  x: number;
  y: number;
  squares: Uint32Array;
}

/** A river's run between two waters: x, y, z (the water's surface) and half its width, four floats a point, upstream first. */
export interface River {
  points: Float32Array;
}

/**
 * A landing pad: where, its top (where skids rest), its radius and which way its H faces. `site` says what kind of
 * place it was chosen for, and `slope` how steep the ground was before it was flattened (rise over run).
 */
export interface Pad {
  x: number;
  y: number;
  z: number;
  radius: number;
  yaw: number;
  site: string;
  slope: number;
}

/** Seven floats a tree: kind (an index into TREE_KINDS), x, y, z (its foot), yaw, scale, shade (−1..1 colour jitter). */
export const TREE_STRIDE = 7;

export interface Island {
  /** The land and the sea floor. */
  terrain: Heightfield;
  /** What a helicopter stands on: the land, the water over it, or a pad's top. Same grid as `terrain`. */
  ground: Heightfield;
  /** The world's edge: the grid's extent. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  seaLevel: number;
  /** Two a square, one per triangle in the order the heightfield draws them, at 2 * square and 2 * square + 1: a SURFACE. */
  surface: Uint8Array;
  /** One a square: SEA.dry, or open sea shallow or deep. */
  sea: Uint8Array;
  lakes: Lake[];
  rivers: River[];
  /** pads[0] is home, where the helicopter starts. */
  pads: Pad[];
  /** TREE_STRIDE floats a tree. */
  trees: Float32Array;
  treeCount: number;
}

/** Where one kind of tree grows. Every window is soft: it fades out over its `fade`, so a forest has an edge and not a wall. */
export interface Habitat {
  /** The heights it grows between, and how far outside them it fades away. */
  height: readonly [from: number, to: number, fade: number];
  /** The steepest ground it holds, as the least upward part of the normal. */
  flat: number;
  /** How far from the open sea it grows: from, to and fade, in world units. */
  sea: readonly [from: number, to: number, fade: number];
  /** How much it wants fresh water near (0 not at all, 1 only there). */
  wet: number;
  /** How much it wants forest (0 grows alike in forest and field, 1 only in forest). */
  forest: number;
  /** The chance that a place which suits it perfectly takes it, before the others are weighed. */
  density: number;
  /** Whether it will stand on sand. */
  sand: boolean;
}

/** Every number the island is made from. */
export interface IslandRecipe {
  /** Seeds the noise; the same seed is the same land. */
  seed: number;
  /** The sea's surface. Heights are above it. */
  seaLevel: number;
  /** The grid: `squares` a side, each `cell` across, centred on the origin. */
  grid: { squares: number; cell: number };
  shape: {
    /** The middle of the unperturbed coast, its half-extents before it is turned, and the turn in radians. */
    centre: readonly [number, number];
    radius: readonly [number, number];
    turn: number;
    /** The size of the bays and headlands, how far they push the coast (a share of the mean radius for each unit of noise), and its layers. */
    coastWavelength: number;
    coastWarp: number;
    coastOctaves: number;
    /** The small wobble on the coast: the size of the coves, their layers, how far they push it, and how far off the coast they are worked out. */
    coastDetail: { wavelength: number; octaves: number; amount: number; reach: number };
    /** A beach rises to `height` over `width` inland of the waterline. */
    beach: { width: number; height: number };
    /** Where the noise at `wavelength` rises past `from` (to `to`, fully), the beach is a cliff instead. */
    cliff: { wavelength: number; from: number; to: number; width: number; height: number };
    /** The hills take over from the coast this far inland, more or less by `vary` (a share, for each unit of noise at `wavelength`). */
    inland: { width: number; vary: number; wavelength: number; octaves: number };
    /** The sea floor off the coast: a shelf of `depth` over `width`, and past it a drop of `depth` over `width`. */
    shelf: { width: number; depth: number };
    drop: { width: number; depth: number };
    /** Near the edge of the grid the floor is pressed to `depth`, from `start` (a share of the half-extent) on. */
    rim: { start: number; depth: number };
  };
  hills: {
    /** The hills' size, their layers, the height of the lowest (`base`) and how much higher they climb. */
    wavelength: number;
    octaves: number;
    base: number;
    amplitude: number;
    /** Small hummocks on the hills, of this size and height, so that water finds its own way down and does not run in straight lines. */
    detail: { wavelength: number; octaves: number; amount: number };
    /** And a fine grain over all the land, a few squares across, so that on a smooth slope the water still has to choose its way. */
    grain: { wavelength: number; amount: number };
  };
  mountains: {
    /** The range is an ellipse about `centre`, turned by `turn`, `length` and `width` its half-extents. */
    centre: readonly [number, number];
    turn: number;
    length: number;
    width: number;
    /** Inside this share of the ellipse's radius the range is at full strength, and fades to nothing at the edge. */
    core: number;
    /** The range is bent by noise of this size, this far, so it is not a straight line. */
    bend: { wavelength: number; octaves: number; amount: number };
    /** The ridges: their size and layers, and the part of the ridged noise (from, to) that is crest. */
    wavelength: number;
    octaves: number;
    from: number;
    to: number;
    /** The land under the range is raised by `uplift`, the crests by `height` more, and the hills round it flattened by `flatten` (0..1). */
    uplift: number;
    height: number;
    flatten: number;
    /** The hummocks on the hills are this many times higher again in the range: mountainsides are broken, and not planes. */
    rugged: number;
  };
  meadows: {
    /** Where the noise at `wavelength` passes `from` (to `to`, fully) the land is pressed toward a level, by `pressure`. */
    wavelength: number;
    octaves: number;
    from: number;
    to: number;
    pressure: number;
    /** The level pressed toward varies from `low` to `high` over noise of `levelWavelength`, and is roughened a little. */
    levelWavelength: number;
    levelOctaves: number;
    low: number;
    high: number;
    /** The level also rises this much for each unit inland, so a meadow is a gentle slope that drains to the sea and not a bowl. */
    rise: number;
    rough: { wavelength: number; octaves: number; amount: number };
  };
  basins: {
    /** How many dips to cut, within this share of the island's radius of its middle, and their radius and depth (each from, to). */
    count: number;
    within: number;
    radius: readonly [number, number];
    depth: readonly [number, number];
    /** The heights a dip may be cut at, how far from the sea and from each other and from home, in world units. */
    height: readonly [number, number];
    coast: number;
    spacing: number;
    home: number;
    /** How many sites are tried, and how much water the rim must be able to hold for a dip to be worth cutting. */
    tries: number;
    hold: number;
    /**
     * The hills' own hollows are filled before any dip is cut, to a bowl this much higher at each vertex than the one
     * it drains to, so that the only lakes are the ones dug here.
     */
    fill: number;
  };
  erosion: {
    /** The carve is `k * (sqrt(area) - 1)` cells deep, no deeper than `max`. */
    k: number;
    max: number;
    /** Land under `from` is not carved at all and land over `to` fully, so the coast is left alone, and none goes below `floor`. */
    from: number;
    to: number;
    floor: number;
    /**
     * The flood that finds where water gathers is given this much random height (up or down) at each vertex, which the
     * land is not, so that on a smooth slope the water has to choose its way and does not run in straight parallel lines.
     */
    scatter: number;
    /** The carve is blurred by a box of this radius in cells, this many times. */
    blur: number;
    passes: number;
    /** A lake's shore is left uncut this far, in world units, so cutting does not drain it, and land that drains to a lake is left this far above its level. */
    protect: number;
    lake: number;
    /** The broad valleys: cut where more than `area` cells drain through, `k` for each root of the excess, no deeper than `max`, blurred by `blur` cells. */
    valley: { area: number; k: number; max: number; blur: number };
  };
  lakes: {
    /** A hollow is a lake if it covers this many squares and holds this much water at its deepest; otherwise it is filled. */
    squares: number;
    depth: number;
    /** A vertex is in a hollow if the water would stand this much above it. */
    tolerance: number;
  };
  rivers: {
    /** The cells that must drain through a point for it to be river. */
    area: number;
    /**
     * A river is followed up into the hills until it is this high or the ground it climbs is steeper than `steep`
     * (rise over run, since a stream is not a waterfall), and one that never gets as high as `minSpring` is dropped.
     */
    spring: number;
    minSpring: number;
    steep: number;
    /** How many river systems to keep (by how much they carry), how many tributaries each, and the shortest, in world units. */
    systems: number;
    tributaries: number;
    minTributary: number;
    /**
     * The water's surface is this far under the land it runs through, this far under a lake's level where it meets
     * one, and this far under the sea's; and the river's half-width is `base + scale * sqrt(area)` held to `min`..`max`.
     */
    drop: number;
    lakeDip: number;
    seaDip: number;
    width: { base: number; scale: number; min: number; max: number };
    /** The channel's depth under the surface is `base + scale * halfWidth`; its banks rise from `lift` over the water at `slope`, for `reach` world units. */
    channel: { base: number; scale: number };
    bank: { lift: number; slope: number; reach: number };
    /** Land beside the water that is lower than it, within `share` of the half-width and `margin` world units of its edge, is raised to `lift` over it. */
    levee: { share: number; margin: number; lift: number };
    /**
     * A river that skirts a lake's shore steps in and out of it; one that steps out for no more than `gap` points between
     * two in the same lake is taken to stay in it. A run shorter than `minRun` world units is not worth a ribbon.
     */
    gap: number;
    minRun: number;
    /**
     * How many times the grid's steps are ironed out of a run and then its corners cut, and how many points of
     * a run the carve measures by in one chord.
     */
    relax: number;
    smooth: number;
    chord: number;
    /**
     * Where the ground is flat a river is not led straight down the grid's lines but wanders: pushed aside by
     * `amount` world units for each unit of noise of this size (which seldom leaves ±0.4), on ground gentler than
     * `flat` (a slope, rise over run) and fading away within `near`..`far` of the sea and lakes, so the river still
     * reaches them.
     */
    meander: { wavelength: number; octaves: number; amount: number; flat: number; near: number; far: number };
  };
  pads: {
    /** How big a pad is and how thick. */
    radius: number;
    thickness: number;
    /** The ground is levelled to the pad's mean within `radius + flat` and blended back to the land by `radius + blend`. */
    flat: number;
    blend: number;
    /** Home is the site nearest this point; the others are chosen for these sites in turn, by `sites`. */
    home: readonly [number, number];
    sites: readonly ('hilltop' | 'lakeside' | 'rivermouth' | 'meadow' | 'beach' | 'shoulder' | 'any')[];
    /** The least distance between pads, from water, from the shore (beyond the pad's own radius), and the lowest ground under a pad. */
    spacing: number;
    water: number;
    shore: number;
    low: number;
    /** The most the ground may vary under a pad before it is flattened, and the grid is searched every `step` cells. */
    relief: number;
    step: number;
    /** What makes a place suit each kind of site. */
    rules: {
      /** Every site is marked down by this much for each unit the ground varies under it. */
      relief: number;
      /** Home is marked down by `penalty` for each unit it is higher than `high`: a landing at the water's edge, not up a cliff. */
      home: { high: number; penalty: number };
      /** A hilltop is off the range (its mask under `mountain`) and higher than `from`, and the higher the better. */
      hilltop: { mountain: number; from: number };
      /** A lakeside is within `reach` times the water clearance of a lake, and best at `best` times it. */
      lakeside: { reach: number; best: number };
      /** A river mouth is within `reach` of one. */
      rivermouth: { reach: number };
      /** A meadow is where the meadow mask is over `mask` and the range's under `mountain`, the more meadow the better, by `weight`. */
      meadow: { mask: number; mountain: number; weight: number };
      /** A beach is lower than `height` and within `reach` of the sea beyond its clearance. */
      beach: { height: number; reach: number };
      /** A shoulder is on the range (over `mountain`), higher than `from`, best at `best`; `weight` a unit off it, and `relief` times the usual for unevenness. */
      shoulder: { mountain: number; from: number; best: number; weight: number; relief: number };
      /** The pad goes to one of this many of the best places, drawn at random. */
      pick: number;
    };
  };
  surface: {
    /** A triangle with every corner more than this under the sea is not drawn. */
    none: number;
    /** Thresholds are shifted by noise of this size, by this much of height, of slope, and of a mask. */
    wavelength: number;
    heightJitter: number;
    slopeJitter: number;
    maskJitter: number;
    /** Snow above `snow` where the normal's upward part is over `snowFlat`; rock where it is under `rock` or above `rockLine`. */
    snow: number;
    snowFlat: number;
    rock: number;
    rockLine: number;
    /** Sand below this, and along rivers this far from the water. */
    sand: number;
    bank: number;
    /**
     * Gullies where the land is this much lower than the ground two cells either side of it, and at least
     * `gullyArea` cells drain through, on ground steeper than `gullyFlat` (a normal's upward part).
     */
    gully: number;
    gullyArea: number;
    gullyFlat: number;
    /** Meadow and forest over these shares of their masks. */
    meadow: number;
    forest: number;
    /** Dirt this far beyond a pad's rim. */
    dirt: number;
  };
  sea: {
    /** Open sea is shallow until its deepest corner is this far down. */
    shallow: number;
  };
  trees: {
    /**
     * The candidates' lattice, how far they are jittered off it (a share of the spacing), the most trees there may
     * be, and the share of that cap the island is thinned to, so that chance rarely brings it over.
     */
    spacing: number;
    jitter: number;
    max: number;
    fill: number;
    /** The lowest a tree stands above the sea. */
    shore: number;
    /** The size and colour range of a tree. */
    scale: readonly [number, number];
    /** No tree this close to a pad's rim, to water's edge, to a lake. */
    apron: number;
    water: number;
    /** The forest mask: noise at `wavelength`, forest from `from` (fully at `to`). */
    forest: { wavelength: number; octaves: number; from: number; to: number };
    /** How much of the density a meadow keeps, and how near water counts as near for wet kinds. */
    meadow: number;
    wetReach: number;
    /** A tree's foot is sunk this far into the ground, so none floats on a slope. */
    sink: number;
    /** One for each kind of tree, in the order of `TREE_KINDS`. */
    habitats: readonly Habitat[];
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------------------------------------------------

/** Far, for a distance not yet known. */
const FAR = 1e9;

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** The distance between two points, as a square root and not `Math.hypot`, which is slow and differs a little between engines. */
function dist(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Zero below `a`, one above `b`, and an S between. */
function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x < a ? 0 : 1;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Fractal noise, which sits near 0 and hardly leaves ±0.65, spread over [0, 1]. */
function unit(n: number): number {
  return clamp(0.5 + n * 1.5, 0, 1);
}

/** The grid's shape, worked out once. */
interface Grid {
  /** Squares a side, vertices a side, and the world units across a square. */
  n: number;
  cols: number;
  cell: number;
  /** The world coordinate of vertex 0 on both axes, and the grid's half-extent. */
  origin: number;
  half: number;
}

/** Offsets that give each use of the noise its own pattern from the one seed. */
const SALT = 7919;

/** A mask this faint is nothing, and not worth the noise it would take to work out the rest. */
const NEGLIGIBLE = 0.002;

// ---------------------------------------------------------------------------------------------------------------------
// Step 1. The shape of the land.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Lays the land down: a coast pushed in and out into bays and headlands, a
 * beach or a cliff along it, rolling hills inland, a range of mountains, and
 * broad meadows pressed flat. Writes the heights, and the meadow and range
 * masks that later steps read.
 */
function lay(g: Grid, r: IslandRecipe, H: Float32Array, meadowMask: Float32Array, mountainMask: Float32Array): void {
  const { shape: s, hills, mountains: mt, meadows: md, seed } = r;
  const meanRadius = Math.sqrt(s.radius[0] * s.radius[1]);
  const cosT = Math.cos(s.turn),
    sinT = Math.sin(s.turn),
    cosM = Math.cos(mt.turn),
    sinM = Math.sin(mt.turn);
  const { cols, cell, origin, half } = g;
  // The bays and headlands are broad, so their noise is worked out at every other vertex and blended between.
  const nodes = (cols >> 1) + 2;
  const warps = new Float32Array(nodes * nodes);
  for (let nj = 0; nj < nodes; nj++) {
    for (let ni = 0; ni < nodes; ni++) {
      const wx = origin + 2 * ni * cell,
        wy = origin + 2 * nj * cell;
      warps[nj * nodes + ni] = fbm(wx / s.coastWavelength, wy / s.coastWavelength, seed + SALT, s.coastOctaves);
    }
  }
  for (let j = 0; j < cols; j++) {
    const y = origin + j * cell;
    for (let i = 0; i < cols; i++) {
      const x = origin + i * cell;
      const k = j * cols + i;

      // The coast: how far inland (+) or out to sea (−) this point is, in world units.
      const dx = x - s.centre[0],
        dy = y - s.centre[1];
      const px = (dx * cosT + dy * sinT) / s.radius[0],
        py = (-dx * sinT + dy * cosT) / s.radius[1];
      const n0 = (j >> 1) * nodes + (i >> 1);
      const fu = (i & 1) * 0.5,
        fv = (j & 1) * 0.5;
      const warp = lerp(lerp(warps[n0], warps[n0 + 1], fu), lerp(warps[n0 + nodes], warps[n0 + nodes + 1], fu), fv);
      let c = (1 - Math.sqrt(px * px + py * py) + s.coastWarp * warp) * meanRadius;
      if (c > -s.coastDetail.reach && c < s.coastDetail.reach) {
        c +=
          s.coastDetail.amount *
          fbm(x / s.coastDetail.wavelength, y / s.coastDetail.wavelength, seed + 2 * SALT, s.coastDetail.octaves);
      }

      let h: number;
      if (c < 0) {
        // The sea floor: a shelf that is shallow for a way out, and then a drop to the deep.
        const t = -c;
        const a = Math.min(1, t / s.shelf.width);
        h = -(
          s.shelf.depth * a * (2 - a) +
          s.drop.depth * smoothstep(s.shelf.width * 0.6, s.shelf.width + s.drop.width, t)
        );
        meadowMask[k] = 0;
        mountainMask[k] = 0;
      } else {
        // The shore: a gentle beach, or where the cliff noise is high a steep rise.
        const cliff = smoothstep(
          s.cliff.from,
          s.cliff.to,
          noise2(x / s.cliff.wavelength, y / s.cliff.wavelength, seed + 3 * SALT),
        );
        const width = lerp(s.beach.width, s.cliff.width, cliff),
          top = lerp(s.beach.height, s.cliff.height, cliff);
        const t = Math.min(1, c / width);
        const shore = top * t * (2 - t);
        const inlandWidth =
          s.inland.width *
          (1 +
            s.inland.vary * fbm(x / s.inland.wavelength, y / s.inland.wavelength, seed + 4 * SALT, s.inland.octaves));
        const inland = smoothstep(0, Math.max(inlandWidth, 1), c);

        // The range: an ellipse bent by noise, strongest at its core.
        let range = 0;
        let crest = 0;
        // Only near the range is it worth bending the point and measuring.
        const mx = x - mt.centre[0],
          my = y - mt.centre[1];
        const near = mt.length + mt.bend.amount * 2;
        if (mx * mx + my * my < near * near) {
          const bx =
              x +
              mt.bend.amount * fbm(x / mt.bend.wavelength, y / mt.bend.wavelength, seed + 5 * SALT, mt.bend.octaves),
            by =
              y +
              mt.bend.amount * fbm(x / mt.bend.wavelength, y / mt.bend.wavelength, seed + 6 * SALT, mt.bend.octaves);
          const ux = bx - mt.centre[0],
            uy = by - mt.centre[1];
          const ex = (ux * cosM + uy * sinM) / mt.length,
            ey = (-ux * sinM + uy * cosM) / mt.width;
          range = 1 - smoothstep(mt.core, 1, Math.sqrt(ex * ex + ey * ey));
          if (range > NEGLIGIBLE) {
            crest = smoothstep(
              mt.from,
              mt.to,
              ridged(x / mt.wavelength, y / mt.wavelength, seed + 7 * SALT, mt.octaves),
            );
          }
        }

        // The hills, with the meadows pressed flat out of them where the meadow noise is high.
        let rolling =
          hills.base +
          hills.amplitude * unit(fbm(x / hills.wavelength, y / hills.wavelength, seed + 8 * SALT, hills.octaves)) +
          hills.detail.amount *
            (1 + range * mt.rugged) *
            fbm(x / hills.detail.wavelength, y / hills.detail.wavelength, seed + 14 * SALT, hills.detail.octaves);
        const meadow =
          smoothstep(md.from, md.to, unit(fbm(x / md.wavelength, y / md.wavelength, seed + 9 * SALT, md.octaves))) *
          (1 - range);
        if (meadow > NEGLIGIBLE) {
          const level =
            md.rise * c +
            md.low +
            (md.high - md.low) *
              unit(fbm(x / md.levelWavelength, y / md.levelWavelength, seed + 10 * SALT, md.levelOctaves)) +
            md.rough.amount * fbm(x / md.rough.wavelength, y / md.rough.wavelength, seed + 11 * SALT, md.rough.octaves);
          rolling = lerp(rolling, level, meadow * md.pressure);
        }
        rolling = rolling * (1 - range * mt.flatten) + range * (mt.uplift + mt.height * crest);
        h =
          shore +
          inland * rolling +
          hills.grain.amount * noise2(x / hills.grain.wavelength, y / hills.grain.wavelength, seed + 17 * SALT);
        meadowMask[k] = meadow * inland;
        mountainMask[k] = range * inland;
      }

      // The grid's edge is deep water, whatever the coast did.
      const rim = smoothstep(s.rim.start, 1, Math.max(Math.abs(x), Math.abs(y)) / half);
      if (rim > 0) h = Math.min(h, -s.rim.depth * rim);
      H[k] = h;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Step 2. Basins.
// ---------------------------------------------------------------------------------------------------------------------

/** Cuts a few round dips into the middle-height land, where the hollows will hold water. Returns how many were cut. */
function cutBasins(g: Grid, r: IslandRecipe, random: Random, H: Float32Array, mountainMask: Float32Array): number {
  const b = r.basins;
  const { cols, cell, origin } = g;
  const [rx, ry] = r.shape.radius;
  const home = r.pads.home;
  const at = (x: number, y: number) => {
    const i = clamp(Math.round((x - origin) / cell), 0, cols - 1),
      j = clamp(Math.round((y - origin) / cell), 0, cols - 1);
    return j * cols + i;
  };
  // Whether the sea is within `coast` of a point, looked for along eight lines out from it.
  const nearSea = (x: number, y: number) => {
    for (let a = 0; a < 8; a++) {
      const dx = Math.cos((a * Math.PI) / 4),
        dy = Math.sin((a * Math.PI) / 4);
      for (let step = 1; step <= 4; step++) {
        const reach = (b.coast * step) / 4;
        if (H[at(x + dx * reach, y + dy * reach)] < r.seaLevel) return true;
      }
    }
    return false;
  };
  // Candidates are drawn all at once so the draws do not depend on which are kept.
  const sites: { x: number; y: number; radius: number; depth: number; holds: number }[] = [];
  for (let t = 0; t < b.tries; t++) {
    const x = r.shape.centre[0] + (random() * 2 - 1) * rx * b.within,
      y = r.shape.centre[1] + (random() * 2 - 1) * ry * b.within;
    const radius = lerp(b.radius[0], b.radius[1], random()),
      depth = lerp(b.depth[0], b.depth[1], random());
    const k = at(x, y);
    const h = H[k];
    if (h < b.height[0] || h > b.height[1] || mountainMask[k] > 0.1) continue;
    if (dist(x - home[0], y - home[1]) < b.home) continue;
    if (nearSea(x, y)) continue;
    // What the dip could hold is the lowest point of its rim over the dip's floor.
    let rim = Infinity;
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      rim = Math.min(rim, H[at(x + Math.cos(ang) * radius, y + Math.sin(ang) * radius)]);
    }
    const holds = rim - (h - depth);
    if (holds < b.hold) continue;
    sites.push({ x, y, radius, depth, holds });
  }
  sites.sort((p, q) => q.holds - p.holds);
  const kept: typeof sites = [];
  for (const s of sites) {
    if (kept.length >= b.count) break;
    if (kept.some((o) => dist(o.x - s.x, o.y - s.y) < b.spacing)) continue;
    kept.push(s);
  }
  for (const s of kept) {
    const i0 = Math.max(0, Math.floor((s.x - s.radius - origin) / cell)),
      i1 = Math.min(cols - 1, Math.ceil((s.x + s.radius - origin) / cell)),
      j0 = Math.max(0, Math.floor((s.y - s.radius - origin) / cell)),
      j1 = Math.min(cols - 1, Math.ceil((s.y + s.radius - origin) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = dist(origin + i * cell - s.x, origin + j * cell - s.y) / s.radius;
        if (d < 1) H[j * cols + i] -= s.depth * (1 - d * d) * (1 - d * d);
      }
    }
  }
  return kept.length;
}

// ---------------------------------------------------------------------------------------------------------------------
// Steps 3 to 6. Water: where it gathers, and where it stands.
// ---------------------------------------------------------------------------------------------------------------------

/** A hollow the flood found: water that would stand, joined into one body. */
interface Hollow {
  level: number;
  low: number;
  vertices: number;
  squares: number;
  sumX: number;
  sumY: number;
  /** Its index among the lakes, or −1 if it is too small to be one. */
  lake: number;
}

/**
 * Finds the hollows: vertices where the flood's spill level is more than `tol` above the land,
 * joined along their eight neighbours. Every vertex of a hollow shares one
 * level, since two neighbours that both hold water hold it to the same height.
 * `labels` is written with each vertex's hollow, or −1.
 */
function findHollows(
  g: Grid,
  H: Float32Array,
  F: Float32Array,
  tol: number,
  labels: Int32Array,
  stack: Int32Array,
): Hollow[] {
  const { cols, n, cell, origin } = g;
  const hollows: Hollow[] = [];
  labels.fill(-1);
  for (let v = 0; v < cols * cols; v++) {
    if (labels[v] >= 0 || F[v] <= H[v] + tol) continue;
    const id = hollows.length;
    const hollow: Hollow = { level: F[v], low: H[v], vertices: 0, squares: 0, sumX: 0, sumY: 0, lake: -1 };
    let top = 0;
    stack[top++] = v;
    labels[v] = id;
    while (top > 0) {
      const c = stack[--top];
      hollow.vertices++;
      if (H[c] < hollow.low) hollow.low = H[c];
      const j = (c / cols) | 0,
        i = c - j * cols;
      for (let nj = Math.max(0, j - 1); nj <= Math.min(cols - 1, j + 1); nj++) {
        for (let ni = Math.max(0, i - 1); ni <= Math.min(cols - 1, i + 1); ni++) {
          const m = nj * cols + ni;
          if (labels[m] < 0 && F[m] > H[m] + tol) {
            labels[m] = id;
            stack[top++] = m;
          }
        }
      }
    }
    hollows.push(hollow);
  }
  if (hollows.length === 0) return hollows;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * cols + i;
      const l = Math.max(labels[k], labels[k + 1], labels[k + cols], labels[k + cols + 1]);
      if (l < 0) continue;
      const h = hollows[l];
      h.squares++;
      h.sumX += origin + (i + 0.5) * cell;
      h.sumY += origin + (j + 0.5) * cell;
    }
  }
  return hollows;
}

/** Marks the hollows big and deep enough to be lakes. Returns how many there are. */
function chooseLakes(r: IslandRecipe, hollows: Hollow[]): number {
  let lakes = 0;
  for (const h of hollows) {
    h.lake = h.squares >= r.lakes.squares && h.level - h.low > r.lakes.depth ? lakes++ : -1;
  }
  return lakes;
}

/** Writes each vertex's lake (or −1) from its hollow's. */
function lakeVertices(labels: Int32Array, hollows: Hollow[], out: Int8Array): void {
  for (let v = 0; v < labels.length; v++) out[v] = labels[v] >= 0 ? hollows[labels[v]].lake : -1;
}

/**
 * Cuts the erosion lines: wherever water gathers the land is carved, deeper
 * for the more that gathers, so valleys deepen downstream and gullies line
 * the hillsides. The carve is blurred so it is a valley and not a trench,
 * left off the coast and the lakes' shores, and never takes land under the
 * sea. Nor does it take land that drains into a lake below the lake's level,
 * or the lake would drown the valleys cut to it and grow arms.
 */
function erode(
  g: Grid,
  r: IslandRecipe,
  H: Float32Array,
  flood: Flood,
  vertexLake: Int8Array,
  lakeDist: Float32Array,
  area: Float32Array,
  carve: Float32Array,
  tmp: Float32Array,
): void {
  const e = r.erosion;
  const total = g.cols * g.cols;
  const { filled, down, order } = flood;
  // The level of the first lake each vertex's water reaches, working from the outlets upstream.
  const lakeLevel = tmp;
  lakeLevel.fill(-Infinity);
  for (let k = 0; k < flood.count; k++) {
    const v = order[k];
    lakeLevel[v] = vertexLake[v] >= 0 ? filled[v] : down[v] >= 0 ? lakeLevel[down[v]] : -Infinity;
  }
  area.fill(1);
  flowAccumulation(flood, area);
  // Two cuts: narrow gullies wherever a little water gathers, and broad valleys where a lot does.
  const valley = new Float32Array(total);
  const v0 = Math.sqrt(e.valley.area);
  for (let v = 0; v < total; v++) {
    const a = Math.sqrt(area[v]);
    const keep = smoothstep(e.from, e.to, H[v]) * smoothstep(e.protect * 0.5, e.protect, lakeDist[v]);
    carve[v] = Math.min(e.max, Math.max(0, e.k * (a - 1))) * keep;
    valley[v] = Math.min(e.valley.max, Math.max(0, e.valley.k * (a - v0))) * keep;
  }
  // The blurs take the room `area` is done with.
  boxBlur(carve, area, g.cols, g.cols, e.blur, e.passes);
  boxBlur(valley, area, g.cols, g.cols, e.valley.blur, e.passes);
  for (let v = 0; v < total; v++) {
    const keep = Math.max(e.floor, lakeLevel[v] + e.lake);
    H[v] -= Math.min(carve[v] + valley[v], Math.max(0, H[v] - keep));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Step 7. Rivers.
// ---------------------------------------------------------------------------------------------------------------------

/** What the river step hands on: the runs, and where each one that reaches the sea does. */
interface Rivers {
  runs: Float32Array[];
  mouths: number[];
}

/**
 * Traces the rivers. Water runs down the flood's pointers; where enough of it
 * has come together it is river. Each source is followed up into the hills,
 * and down to the sea; the biggest few systems are kept, with their longer
 * tributaries, and each is cut into runs between lakes and the sea.
 */
function traceRivers(
  g: Grid,
  r: IslandRecipe,
  H: Float32Array,
  F: Float32Array,
  down: Int32Array,
  area: Float32Array,
  vertexLake: Int8Array,
  seaDist: Float32Array,
  lakeDist: Float32Array,
): Rivers {
  const rc = r.rivers;
  const { cols, cell, origin } = g;
  const total = cols * cols;
  const sea = r.seaLevel;
  const runs: Float32Array[] = [];
  const mouths: number[] = [];

  const isRiver = new Uint8Array(total),
    hasUp = new Uint8Array(total);
  for (let v = 0; v < total; v++) {
    if (area[v] >= rc.area && vertexLake[v] < 0 && H[v] > sea) isRiver[v] = 1;
  }
  for (let v = 0; v < total; v++) {
    if (isRiver[v] === 0) continue;
    const d = down[v];
    if (d >= 0 && isRiver[d] === 1) hasUp[d] = 1;
  }

  // Every source, followed up to where it is a spring and down to the sea, as a list of vertices.
  const paths: number[][] = [];
  for (let v = 0; v < total; v++) {
    if (isRiver[v] === 0 || hasUp[v] === 1) continue;
    const up: number[] = [];
    let cur = v;
    for (let guard = 0; H[cur] < rc.spring && guard < total; guard++) {
      const j = (cur / cols) | 0,
        i = cur - j * cols;
      let best = -1,
        bestArea = 0,
        bestRun = cell;
      for (let nj = Math.max(0, j - 1); nj <= Math.min(cols - 1, j + 1); nj++) {
        for (let ni = Math.max(0, i - 1); ni <= Math.min(cols - 1, i + 1); ni++) {
          const m = nj * cols + ni;
          if (m !== cur && down[m] === cur && area[m] > bestArea) {
            bestArea = area[m];
            best = m;
            bestRun = ni !== i && nj !== j ? cell * Math.SQRT2 : cell;
          }
        }
      }
      if (best < 0) break;
      // A stream does not climb a cliff: the spring is where the hill gets too steep.
      if (vertexLake[best] < 0 && (H[best] - H[cur]) / bestRun > rc.steep) break;
      up.push(best);
      if (vertexLake[best] >= 0) break;
      cur = best;
    }
    const path: number[] = [];
    for (let k = up.length - 1; k >= 0; k--) path.push(up[k]);
    for (let w = v; ;) {
      path.push(w);
      if (H[w] <= sea || down[w] < 0) break;
      w = down[w];
    }
    if (path.length >= 2) paths.push(path);
  }

  // Sources that reach the sea at the same place are one system.
  const systems = new Map<number, number[]>();
  for (let p = 0; p < paths.length; p++) {
    const mouth = paths[p][paths[p].length - 2];
    const list = systems.get(mouth);
    if (list) list.push(p);
    else systems.set(mouth, [p]);
  }
  const ranked = [...systems.entries()].sort((a, b) => area[b[0]] - area[a[0]] || a[0] - b[0]);

  const claimed = new Uint8Array(total),
    zRaw = new Float32Array(total);
  const widthOf = (v: number) => clamp(rc.width.base + rc.width.scale * Math.sqrt(area[v]), rc.width.min, rc.width.max);
  let kept = 0;
  for (const [mouth, members] of ranked) {
    if (kept >= rc.systems) break;
    members.sort((a, b) => paths[b].length - paths[a].length || a - b);
    if (H[paths[members[0]][0]] < rc.minSpring) continue;
    kept++;
    let tributaries = 0;
    for (let m = 0; m < members.length; m++) {
      const path = paths[members[m]];
      // A tributary runs down to the first vertex a river already holds, and joins there.
      let end = path.length;
      if (m > 0) {
        let t = 0;
        while (t < path.length && claimed[path[t]] === 0) t++;
        if (t === 0 || t >= path.length) continue;
        end = t + 1;
        if (tributaries >= rc.tributaries || t * cell < rc.minTributary || H[path[0]] < rc.minSpring) continue;
        tributaries++;
      }
      const pieces = pathToRuns(g, r, path, end, F, vertexLake, claimed, zRaw, widthOf);
      for (const piece of pieces) {
        meander(g, r, H, seaDist, lakeDist, piece);
        runs.push(piece);
      }
      for (let k = 0; k < end; k++) claimed[path[k]] = 1;
      // Each system's mouth is noted once, by its trunk.
      if (m === 0) {
        const j = (mouth / cols) | 0,
          i = mouth - j * cols;
        mouths.push(origin + i * cell, origin + j * cell);
      }
    }
  }
  return { runs, mouths };
}

/**
 * Turns the first `end` vertices of a path into runs: each stretch between
 * waters, with a point inside the lake where it enters or leaves one, and one
 * past the coast where it reaches the sea. Each point gets the water's surface
 * (which never rises downstream) and a half-width, and the corners are cut.
 */
function pathToRuns(
  g: Grid,
  r: IslandRecipe,
  path: number[],
  end: number,
  F: Float32Array,
  vertexLake: Int8Array,
  claimed: Uint8Array,
  zRaw: Float32Array,
  widthOf: (v: number) => number,
): Float32Array[] {
  const rc = r.rivers;
  const { cols, cell, origin } = g;
  const joins = claimed[path[end - 1]] === 1;
  const reachesSea = !joins && end === path.length;
  // Which lake each point is in, if any; a path that only touches the shore for a moment stays in the lake.
  const state = new Int8Array(end);
  for (let k = 0; k < end; k++) state[k] = vertexLake[path[k]];
  for (let k = 0; k < end - 1; k++) {
    if (state[k] < 0 || state[k + 1] >= 0) continue;
    for (let m = k + 2; m <= Math.min(end - 1, k + 1 + rc.gap); m++) {
      if (state[m] !== state[k]) continue;
      for (let q = k + 1; q < m; q++) state[q] = state[k];
      break;
    }
  }
  // The surface along the whole path, never rising: a lake's level inside a lake, and just under the land elsewhere.
  const z = new Float32Array(end);
  let low = Infinity;
  for (let k = 0; k < end; k++) {
    const v = path[k];
    let zk = vertexLake[v] >= 0 ? F[v] - rc.lakeDip : F[v] - rc.drop;
    if (k === end - 1) {
      if (joins) zk = Math.min(zk, zRaw[v]);
      else if (reachesSea) zk = r.seaLevel - rc.seaDip;
    }
    low = Math.min(low, zk);
    z[k] = low;
  }
  for (let k = 0; k < end; k++) zRaw[path[k]] = z[k];
  const w = new Float32Array(end);
  for (let k = 0; k < end; k++) {
    const v = path[k];
    // A lake's, a junction's and the sea's ends take the width of the river beside them, not of what they flow into.
    const waterEnd = state[k] >= 0 || (k === end - 1 && (joins || reachesSea));
    w[k] = waterEnd && k > 0 ? w[k - 1] : widthOf(v);
  }
  // A run that begins in a lake takes the width of the river beside it.
  if (end > 1 && state[0] >= 0) w[0] = w[1];

  const out: Float32Array[] = [];
  let cur: number[] = [];
  let inLake = false,
    lastLake = -1;
  const finish = () => {
    let length = 0;
    for (let q = 4; q < cur.length; q += 4) length += dist(cur[q] - cur[q - 4], cur[q + 1] - cur[q - 3]);
    if (cur.length >= 8 && length >= rc.minRun) out.push(smoothRun(cur, rc.relax, rc.smooth));
    cur = [];
  };
  const point = (k: number) => {
    const v = path[k];
    const j = (v / cols) | 0,
      i = v - j * cols;
    return [origin + i * cell, origin + j * cell, z[k], w[k]];
  };
  for (let k = 0; k < end; k++) {
    if (state[k] >= 0) {
      if (cur.length > 0 && !inLake) {
        cur.push(...point(k));
        finish();
      }
      inLake = true;
      lastLake = k;
    } else {
      if (inLake) {
        cur = point(lastLake);
        inLake = false;
      }
      cur.push(...point(k));
    }
  }
  finish();
  return out;
}

/**
 * Lets a run wander where the ground is flat. The push is a smooth field of the
 * place, not of the run, so a tributary and the river it joins are pushed the
 * same way where they meet; and how far it is pushed is blended between the
 * four vertices round the point, since a jump in it from one square to the next
 * would be a kink in the river.
 */
function meander(
  g: Grid,
  r: IslandRecipe,
  H: Float32Array,
  seaDist: Float32Array,
  lakeDist: Float32Array,
  pts: Float32Array,
): void {
  const m = r.rivers.meander;
  const { cols, cell, origin } = g;
  // How far the river may be pushed at a vertex: not on a slope, not close to the water it runs into.
  const room = (i: number, j: number) => {
    const v = clamp(j, 2, cols - 3) * cols + clamp(i, 2, cols - 3);
    const slope = dist(H[v + 2] - H[v - 2], H[v + 2 * cols] - H[v - 2 * cols]) / (4 * cell);
    return (1 - smoothstep(m.flat * 0.4, m.flat, slope)) * smoothstep(m.near, m.far, Math.min(seaDist[v], lakeDist[v]));
  };
  for (let k = 0; k < pts.length; k += 4) {
    const x = pts[k],
      y = pts[k + 1];
    const fx = clamp((x - origin) / cell, 0, cols - 2),
      fy = clamp((y - origin) / cell, 0, cols - 2);
    const i = Math.floor(fx),
      j = Math.floor(fy),
      u = fx - i,
      w = fy - j;
    const strength =
      m.amount * lerp(lerp(room(i, j), room(i + 1, j), u), lerp(room(i, j + 1), room(i + 1, j + 1), u), w);
    if (strength <= 0) continue;
    pts[k] = x + strength * fbm(x / m.wavelength, y / m.wavelength, r.seed + 15 * SALT, m.octaves);
    pts[k + 1] = y + strength * fbm(x / m.wavelength, y / m.wavelength, r.seed + 16 * SALT, m.octaves);
  }
}

/** Cuts a run's corners `passes` times (Chaikin), keeping its ends, and makes its surface fall and its width grow downstream. */
function smoothRun(flat: number[], relax: number, passes: number): Float32Array {
  let pts = flat;
  // The grid's own steps are ironed out first, a few times, so that the river bends at the scale of the land and not of the grid.
  for (let round = 0; round < relax; round++) {
    const next = pts.slice();
    for (let k = 4; k < pts.length - 4; k += 4) {
      next[k] = (pts[k - 4] + 2 * pts[k] + pts[k + 4]) / 4;
      next[k + 1] = (pts[k - 3] + 2 * pts[k + 1] + pts[k + 5]) / 4;
    }
    pts = next;
  }
  for (let p = 0; p < passes; p++) {
    const n = pts.length / 4;
    const next: number[] = [pts[0], pts[1], pts[2], pts[3]];
    for (let k = 0; k < n - 1; k++) {
      for (let c = 0; c < 4; c++) next.push(0.75 * pts[k * 4 + c] + 0.25 * pts[k * 4 + 4 + c]);
      for (let c = 0; c < 4; c++) next.push(0.25 * pts[k * 4 + c] + 0.75 * pts[k * 4 + 4 + c]);
    }
    for (let c = 0; c < 4; c++) next.push(pts[(n - 1) * 4 + c]);
    pts = next;
  }
  const out = new Float32Array(pts);
  for (let k = 1; k < out.length / 4; k++) {
    if (out[k * 4 + 2] > out[k * 4 - 2]) out[k * 4 + 2] = out[k * 4 - 2];
    if (out[k * 4 + 3] < out[k * 4 - 1]) out[k * 4 + 3] = out[k * 4 - 1];
  }
  return out;
}

/**
 * Cuts the rivers into the land: a channel under the water, and banks rising
 * from it to meet the hills. Each vertex takes its profile from the nearest
 * part of a river alone, so a river steeper than its banks does not dig under
 * its own upper reaches. Where the land beside a river is lower than the
 * water, a low bank is raised to hold it. Writes, for every vertex within
 * reach, how far it is outside the nearest river's edge (negative inside) and
 * that river's surface and half-width there.
 */
function carveRivers(
  g: Grid,
  r: IslandRecipe,
  H: Float32Array,
  runs: Float32Array[],
  vertexLake: Int8Array,
  edge: Float32Array,
  bankZ: Float32Array,
  bankW: Float32Array,
): void {
  const rc = r.rivers;
  const { cols, cell, origin } = g;
  const total = cols * cols;
  // First the nearest river to each vertex, by distance to its middle (held in `edge` until it is turned into the edge's).
  edge.fill(FAR);
  for (const pts of runs) {
    const n = pts.length / 4;
    for (let s = 0; s < n - 1; s += rc.chord) {
      const e = Math.min(n - 1, s + rc.chord);
      const ax = pts[s * 4],
        ay = pts[s * 4 + 1],
        az = pts[s * 4 + 2],
        aw = pts[s * 4 + 3];
      const bx = pts[e * 4],
        by = pts[e * 4 + 1],
        bz = pts[e * 4 + 2],
        bw = pts[e * 4 + 3];
      const abx = bx - ax,
        aby = by - ay;
      const len2 = abx * abx + aby * aby;
      const reach = Math.max(aw, bw) + rc.bank.reach;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - origin) / cell)),
        i1 = Math.min(cols - 1, Math.ceil((Math.max(ax, bx) + reach - origin) / cell)),
        j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - origin) / cell)),
        j1 = Math.min(cols - 1, Math.ceil((Math.max(ay, by) + reach - origin) / cell));
      for (let j = j0; j <= j1; j++) {
        const y = origin + j * cell;
        for (let i = i0; i <= i1; i++) {
          const x = origin + i * cell;
          const t = len2 > 0 ? clamp(((x - ax) * abx + (y - ay) * aby) / len2, 0, 1) : 0;
          const qx = x - (ax + t * abx),
            qy = y - (ay + t * aby);
          const d = Math.sqrt(qx * qx + qy * qy);
          const v = j * cols + i;
          if (d < edge[v]) {
            edge[v] = d;
            bankZ[v] = az + t * (bz - az);
            bankW[v] = aw + t * (bw - aw);
          }
        }
      }
    }
  }
  // Then each vertex is cut to the profile of its nearest river: a channel inside the banks, a bank outside them.
  for (let v = 0; v < total; v++) {
    if (edge[v] >= FAR) continue;
    const w = bankW[v],
      z = bankZ[v];
    const out = edge[v] - w;
    edge[v] = out;
    if (out >= rc.bank.reach) continue;
    const h = H[v];
    if (out <= 0) {
      const q = (out + w) / w;
      const bed = z - (rc.channel.base + rc.channel.scale * w) * (1 - q * q);
      if (bed < h) H[v] = bed;
    } else {
      const bank = z + rc.bank.lift + out * rc.bank.slope;
      if (h > bank) H[v] = bank + (h - bank) * smoothstep(rc.bank.reach * 0.5, rc.bank.reach, out);
    }
  }
  // Where the land beside the water is lower than the water, raise a low bank, so no ribbon floats.
  for (let v = 0; v < total; v++) {
    if (
      edge[v] <= 0 ||
      edge[v] > rc.levee.share * bankW[v] + rc.levee.margin ||
      vertexLake[v] >= 0 ||
      H[v] < r.seaLevel
    )
      continue;
    const z = bankZ[v] + rc.levee.lift;
    if (z > r.seaLevel && H[v] < z) H[v] = z;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Step 9. Pads.
// ---------------------------------------------------------------------------------------------------------------------

/** A place a pad could go, measured. */
interface Site {
  x: number;
  y: number;
  /** The mean height under the pad and the ground round it, and how much the ground varies under it. */
  level: number;
  relief: number;
  sea: number;
  lake: number;
  meadow: number;
  mountain: number;
}

/**
 * Chooses the pads: home nearest the recipe's point, and the rest for the
 * sites the recipe lists in turn, each at least `spacing` from the others on
 * land that is dry, away from water and not too uneven. Then flattens the
 * ground under each and blends it back to the land.
 */
function placePads(
  g: Grid,
  r: IslandRecipe,
  random: Random,
  H: Float32Array,
  seaDist: Float32Array,
  lakeDist: Float32Array,
  riverDist: Float32Array,
  meadowMask: Float32Array,
  mountainMask: Float32Array,
  lakes: Lake[],
  mouths: number[],
): Pad[] {
  const pc = r.pads;
  const { cols, cell, origin } = g;
  const reach = pc.radius + pc.flat;
  const span = Math.ceil(reach / cell);
  const sites: Site[] = [];
  const margin = span + 2;
  for (let j = margin; j < cols - margin; j += pc.step) {
    for (let i = margin; i < cols - margin; i += pc.step) {
      const v = j * cols + i;
      if (seaDist[v] < pc.radius + pc.shore || lakeDist[v] < pc.water || riverDist[v] < pc.water) continue;
      let lo = Infinity,
        hi = -Infinity,
        sum = 0,
        count = 0;
      for (let dj = -span; dj <= span; dj++) {
        for (let di = -span; di <= span; di++) {
          if (di * di + dj * dj > (reach / cell) * (reach / cell)) continue;
          const h = H[v + dj * cols + di];
          if (h < lo) lo = h;
          if (h > hi) hi = h;
          sum += h;
          count++;
        }
      }
      if (hi - lo > pc.relief || lo < pc.low) continue;
      sites.push({
        x: origin + i * cell,
        y: origin + j * cell,
        level: sum / count,
        relief: hi - lo,
        sea: seaDist[v],
        lake: lakeDist[v],
        meadow: meadowMask[v],
        mountain: mountainMask[v],
      });
    }
  }

  const chosen: Site[] = [];
  const kinds: string[] = [];
  const rules = pc.rules;
  const farEnough = (s: Site) => chosen.every((c) => dist(c.x - s.x, c.y - s.y) >= pc.spacing);
  // The nearest lake and river mouth not yet used, for the sites that go by them.
  const usedLakes = new Set<number>(),
    usedMouths = new Set<number>();
  const nearest = (s: Site, list: { x: number; y: number }[], used: Set<number>) => {
    let best = -1,
      bestD = Infinity;
    for (let k = 0; k < list.length; k++) {
      const d = dist(list[k].x - s.x, list[k].y - s.y);
      if (!used.has(k) && d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return { k: best, d: bestD };
  };
  const mouthPoints: { x: number; y: number }[] = [];
  for (let m = 0; m < mouths.length; m += 2) mouthPoints.push({ x: mouths[m], y: mouths[m + 1] });

  /** Scores a site for a kind: higher is better, or null if it will not do. */
  const score = (kind: string, s: Site): number | null => {
    const uneven = s.relief * rules.relief;
    switch (kind) {
      case 'home':
        return (
          -dist(s.x - pc.home[0], s.y - pc.home[1]) -
          uneven -
          Math.max(0, s.level - rules.home.high) * rules.home.penalty
        );
      case 'hilltop':
        return s.mountain < rules.hilltop.mountain && s.level > rules.hilltop.from ? s.level - uneven : null;
      case 'lakeside': {
        const near = nearest(s, lakes, usedLakes);
        return near.k >= 0 && s.lake < pc.water * rules.lakeside.reach
          ? -Math.abs(s.lake - pc.water * rules.lakeside.best) - uneven
          : null;
      }
      case 'rivermouth': {
        const near = nearest(s, mouthPoints, usedMouths);
        return near.k >= 0 && near.d < rules.rivermouth.reach ? -near.d - uneven : null;
      }
      case 'meadow':
        return s.meadow > rules.meadow.mask && s.mountain < rules.meadow.mountain
          ? s.meadow * rules.meadow.weight - uneven
          : null;
      case 'beach':
        return s.level < rules.beach.height && s.sea < pc.radius + pc.shore + rules.beach.reach
          ? -s.sea - uneven
          : null;
      case 'shoulder':
        return s.mountain > rules.shoulder.mountain && s.level > rules.shoulder.from
          ? -s.relief * rules.shoulder.relief - Math.abs(s.level - rules.shoulder.best) * rules.shoulder.weight
          : null;
      default:
        // Anywhere: as far from the others as it can be.
        return chosen.reduce((m, c) => Math.min(m, dist(c.x - s.x, c.y - s.y)), Infinity) - uneven;
    }
  };

  for (const wanted of ['home', ...pc.sites]) {
    let kind: string = wanted;
    let best: { site: Site; score: number }[] = [];
    const collect = (k: string) => {
      for (const s of sites) {
        if (k !== 'home' && !farEnough(s)) continue;
        const sc = score(k, s);
        if (sc !== null) best.push({ site: s, score: sc });
      }
    };
    collect(kind);
    if (best.length === 0 && kind !== 'any') {
      // Nothing of that kind: take a place from anywhere that suits, rather than a pad fewer.
      kind = 'any';
      collect(kind);
    }
    if (best.length === 0) {
      if (wanted === 'home') throw new Error('The island has nowhere to land home.');
      continue;
    }
    best.sort((a, b) => b.score - a.score);
    // A pick from the best few, so that the site is a choice and not just the extreme.
    best = best.slice(0, wanted === 'home' ? 1 : rules.pick);
    const pick = best[Math.min(best.length - 1, Math.floor(random() * best.length))].site;
    chosen.push(pick);
    kinds.push(kind);
    if (kind === 'lakeside') usedLakes.add(nearest(pick, lakes, usedLakes).k);
    if (kind === 'rivermouth') usedMouths.add(nearest(pick, mouthPoints, usedMouths).k);
  }

  // Flatten each: level to its mean within `radius + flat`, blended back to the land by `radius + blend`.
  const pads: Pad[] = [];
  const [cx, cy] = r.shape.centre;
  for (let p = 0; p < chosen.length; p++) {
    const s = chosen[p];
    const inner = pc.radius + pc.flat,
      outer = pc.radius + pc.blend;
    const i0 = Math.max(0, Math.floor((s.x - outer - origin) / cell)),
      i1 = Math.min(cols - 1, Math.ceil((s.x + outer - origin) / cell)),
      j0 = Math.max(0, Math.floor((s.y - outer - origin) / cell)),
      j1 = Math.min(cols - 1, Math.ceil((s.y + outer - origin) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = dist(origin + i * cell - s.x, origin + j * cell - s.y);
        if (d >= outer) continue;
        const k = j * cols + i;
        H[k] = lerp(s.level, H[k], smoothstep(inner, outer, d));
      }
    }
    pads.push({
      x: s.x,
      y: s.y,
      z: s.level + pc.thickness,
      radius: pc.radius,
      yaw: Math.atan2(cy - s.y, cx - s.x),
      site: kinds[p],
      slope: s.relief / (2 * reach),
    });
  }
  return pads;
}

// ---------------------------------------------------------------------------------------------------------------------
// Steps 11 to 13. What it is made of, the sea, and the trees.
// ---------------------------------------------------------------------------------------------------------------------

/** The forest mask at a point: 0 in the open, 1 in dense forest. */
function forestAt(r: IslandRecipe, x: number, y: number): number {
  const f = r.trees.forest;
  return smoothstep(f.from, f.to, unit(fbm(x / f.wavelength, y / f.wavelength, r.seed + 12 * SALT, f.octaves)));
}

/** A window that is 1 between `from` and `to` and fades to 0 over `fade` outside them. */
function window(x: number, from: number, to: number, fade: number): number {
  if (x < from) return smoothstep(from - fade, from, x);
  if (x > to) return 1 - smoothstep(to, to + fade, x);
  return 1;
}

/** Tells each triangle what it is made of. */
function paint(
  g: Grid,
  r: IslandRecipe,
  H: Float32Array,
  area: Float32Array,
  meadowMask: Float32Array,
  riverDist: Float32Array,
  squareLake: Int8Array,
  lakes: Lake[],
  pads: Pad[],
  surface: Uint8Array,
): void {
  const { n, cols, cell, origin } = g;
  const sc = r.surface;
  // The noise that moves every threshold, and the forest, are read at the vertices and averaged on the triangle.
  const jit = new Float32Array(cols * cols),
    forest = new Float32Array(cols * cols),
    hollow = new Float32Array(cols * cols);
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (H[k] < r.seaLevel - sc.none) continue;
      // How far the land is below the mean of its neighbours two cells off: positive in a channel, negative on a crest.
      const i0 = Math.max(0, i - 2),
        i1 = Math.min(cols - 1, i + 2),
        j0 = Math.max(0, j - 2),
        j1 = Math.min(cols - 1, j + 2);
      hollow[k] = (H[j * cols + i0] + H[j * cols + i1] + H[j0 * cols + i] + H[j1 * cols + i]) / 4 - H[k];
      const x = origin + i * cell,
        y = origin + j * cell;
      jit[k] = noise2(x / sc.wavelength, y / sc.wavelength, r.seed + 13 * SALT);
      forest[k] = forestAt(r, x, y);
    }
  }
  const floorLevel = r.seaLevel - sc.none;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * cols + i;
      const sq = j * n + i;
      // Deep under the sea there is nothing to tell: neither triangle is drawn.
      if (H[k] < floorLevel && H[k + 1] < floorLevel && H[k + cols] < floorLevel && H[k + cols + 1] < floorLevel) {
        surface[2 * sq] = SURFACE.none;
        surface[2 * sq + 1] = SURFACE.none;
        continue;
      }
      const lake = squareLake[sq] >= 0 ? lakes[squareLake[sq]].level : -Infinity;
      for (let tri = 0; tri < 2; tri++) {
        // The corners in the order drawn: [00, 10, 11] and [00, 11, 01].
        const a = k,
          b = tri === 0 ? k + 1 : k + cols + 1,
          c = tri === 0 ? k + cols + 1 : k + cols;
        const ha = H[a],
          hb = H[b],
          hc = H[c];
        const hm = (ha + hb + hc) / 3;
        let gx: number, gy: number;
        if (tri === 0) {
          gx = (hb - ha) / cell;
          gy = (hc - hb) / cell;
        } else {
          gx = (hb - hc) / cell;
          gy = (hc - ha) / cell;
        }
        const nz = 1 / Math.sqrt(1 + gx * gx + gy * gy);
        const t = (jit[a] + jit[b] + jit[c]) / 3;
        const high = hm + t * sc.heightJitter;
        const steep = nz + t * sc.slopeJitter;
        let s: Surface;
        if (ha < floorLevel && hb < floorLevel && hc < floorLevel) s = SURFACE.none;
        else if (high > sc.snow && steep > sc.snowFlat) s = SURFACE.snow;
        else if (steep < sc.rock || high > sc.rockLine) s = SURFACE.rock;
        else if (hm < lake) s = SURFACE.sand;
        else if (high < sc.sand) s = SURFACE.sand;
        else if ((riverDist[a] + riverDist[b] + riverDist[c]) / 3 < sc.bank) s = SURFACE.sand;
        else if (
          nz < sc.gullyFlat &&
          (hollow[a] + hollow[b] + hollow[c]) / 3 >= sc.gully &&
          Math.max(area[a], area[b], area[c]) >= sc.gullyArea
        )
          s = SURFACE.gully;
        else if ((meadowMask[a] + meadowMask[b] + meadowMask[c]) / 3 + t * sc.maskJitter > sc.meadow)
          s = SURFACE.meadow;
        else if ((forest[a] + forest[b] + forest[c]) / 3 + t * sc.maskJitter > sc.forest) s = SURFACE.forest;
        else s = SURFACE.grass;
        surface[2 * sq + tri] = s;
      }
    }
  }
  // Dirt round each pad, where the helicopters have worn the grass away.
  for (const p of pads) {
    const reach = p.radius + sc.dirt;
    const i0 = Math.max(0, Math.floor((p.x - reach - origin) / cell)),
      i1 = Math.min(n - 1, Math.ceil((p.x + reach - origin) / cell)),
      j0 = Math.max(0, Math.floor((p.y - reach - origin) / cell)),
      j1 = Math.min(n - 1, Math.ceil((p.y + reach - origin) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x0 = origin + i * cell,
          y0 = origin + j * cell;
        // The middles of the two triangles: a third of the way along the diagonal from each end.
        const mx0 = x0 + (2 * cell) / 3,
          my0 = y0 + cell / 3,
          mx1 = x0 + cell / 3,
          my1 = y0 + (2 * cell) / 3;
        if (dist(mx0 - p.x, my0 - p.y) < reach) surface[2 * (j * n + i)] = SURFACE.dirt;
        if (dist(mx1 - p.x, my1 - p.y) < reach) surface[2 * (j * n + i) + 1] = SURFACE.dirt;
      }
    }
  }
}

/** Plants the trees. */
function plant(
  g: Grid,
  r: IslandRecipe,
  random: Random,
  terrain: Heightfield,
  surface: Uint8Array,
  seaDist: Float32Array,
  lakeDist: Float32Array,
  riverDist: Float32Array,
  riverEdge: Float32Array,
  pads: Pad[],
): { trees: Float32Array; count: number } {
  const tc = r.trees;
  const { n, cols, cell, origin, half } = g;
  const across = Math.floor((2 * half) / tc.spacing);
  const slots = across * across;
  const kinds = tc.habitats.length;
  const cx = new Float32Array(slots),
    cy = new Float32Array(slots),
    cp = new Float32Array(slots),
    cw = new Float32Array(slots * kinds);
  let candidates = 0;
  let expected = 0;
  const nearest = (x: number, y: number) => {
    const i = clamp(Math.round((x - origin) / cell), 0, cols - 1),
      j = clamp(Math.round((y - origin) / cell), 0, cols - 1);
    return j * cols + i;
  };
  for (let gy = 0; gy < across; gy++) {
    for (let gx = 0; gx < across; gx++) {
      // Both draws are always made, so the stream does not depend on which candidates are culled.
      const jx = (random() - 0.5) * tc.jitter,
        jy = (random() - 0.5) * tc.jitter;
      const x = -half + (gx + 0.5 + jx) * tc.spacing,
        y = -half + (gy + 0.5 + jy) * tc.spacing;
      const h = terrain.heightAt(x, y);
      if (h < r.seaLevel + tc.shore) continue;
      const v = nearest(x, y);
      // Water's edge: a lake's squares reach a square past its hollow, and a river's edge is known at the four corners round the tree.
      const i0 = Math.min(cols - 2, ((x - origin) / cell) | 0),
        j0 = Math.min(cols - 2, ((y - origin) / cell) | 0);
      const k0 = j0 * cols + i0;
      const nearRiver = Math.min(riverEdge[k0], riverEdge[k0 + 1], riverEdge[k0 + cols], riverEdge[k0 + cols + 1]);
      if (lakeDist[v] < tc.water + cell * 1.5 || nearRiver < tc.water + cell * 0.71) continue;
      // Not on a pad or its apron.
      let onPad = false;
      for (const p of pads) {
        if (dist(x - p.x, y - p.y) < p.radius + tc.apron) {
          onPad = true;
          break;
        }
      }
      if (onPad) continue;
      // The triangle it stands on, and how steep it is.
      const fx = (x - origin) / cell,
        fy = (y - origin) / cell;
      const si = Math.min(n - 1, fx | 0),
        sj = Math.min(n - 1, fy | 0);
      const tri = fx - si >= fy - sj ? 0 : 1;
      const surf = surface[2 * (sj * n + si) + tri];
      if (surf === SURFACE.none || surf === SURFACE.rock || surf === SURFACE.snow || surf === SURFACE.dirt) continue;
      // The slope over a square's width, centred on the tree.
      const reachOff = cell / 2;
      const dzx = terrain.heightAt(x + reachOff, y) - terrain.heightAt(x - reachOff, y),
        dzy = terrain.heightAt(x, y + reachOff) - terrain.heightAt(x, y - reachOff);
      const nz = 1 / Math.sqrt(1 + (dzx * dzx + dzy * dzy) / (cell * cell));
      const forest = forestAt(r, x, y);
      const wet = 1 - smoothstep(tc.wetReach * 0.5, tc.wetReach * 1.5, Math.min(lakeDist[v], riverDist[v]));
      // How well each kind suits the place. The place takes the best of them, and the kind is drawn by those weights.
      let best = 0;
      for (let kind = 0; kind < kinds; kind++) {
        const hab = tc.habitats[kind];
        let p = 0;
        if (surf !== SURFACE.sand || hab.sand) {
          p =
            window(h, hab.height[0], hab.height[1], hab.height[2]) *
            window(seaDist[v], hab.sea[0], hab.sea[1], hab.sea[2]) *
            smoothstep(hab.flat - 0.1, hab.flat, nz) *
            (1 - hab.wet + hab.wet * wet) *
            (1 - hab.forest + hab.forest * forest) *
            hab.density;
          if (surf === SURFACE.meadow) p *= tc.meadow;
        }
        cw[candidates * kinds + kind] = p;
        if (p > best) best = p;
      }
      if (best <= 0) continue;
      cx[candidates] = x;
      cy[candidates] = y;
      cp[candidates] = best;
      candidates++;
      expected += best;
    }
  }
  // If the island would be thicker than its cap, every candidate is thinned alike, not the last ones dropped.
  const thin = expected > tc.max * tc.fill ? (tc.max * tc.fill) / expected : 1;
  const trees = new Float32Array(tc.max * TREE_STRIDE);
  let count = 0;
  for (let c = 0; c < candidates && count < tc.max; c++) {
    if (random() >= cp[c] * thin) continue;
    let total = 0;
    for (let kind = 0; kind < kinds; kind++) total += cw[c * kinds + kind];
    let pick = random() * total,
      chosen = 0;
    for (let kind = 0; kind < kinds; kind++) {
      const w = cw[c * kinds + kind];
      if (w <= 0) continue;
      chosen = kind;
      pick -= w;
      if (pick <= 0) break;
    }
    const o = count * TREE_STRIDE;
    trees[o] = chosen;
    trees[o + 1] = cx[c];
    trees[o + 2] = cy[c];
    trees[o + 3] = terrain.heightAt(cx[c], cy[c]) - tc.sink;
    trees[o + 4] = random() * Math.PI * 2;
    trees[o + 5] = lerp(tc.scale[0], tc.scale[1], random());
    trees[o + 6] = random() * 2 - 1;
    count++;
  }
  return { trees: trees.slice(0, count * TREE_STRIDE), count };
}

// ---------------------------------------------------------------------------------------------------------------------
// The island.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Builds the island from the recipe. `onStage`, when given, is called as each
 * stage finishes, so a caller can time them.
 */
export function buildIsland(recipe: IslandRecipe, random: Random, onStage?: (stage: string) => void): Island {
  const r = recipe;
  const n = r.grid.squares,
    cols = n + 1,
    cell = r.grid.cell;
  const half = (n * cell) / 2;
  const g: Grid = { n, cols, cell, origin: -half, half };
  const total = cols * cols;
  const stage = (name: string) => onStage?.(name);

  const H = new Float32Array(total),
    meadowMask = new Float32Array(total),
    mountainMask = new Float32Array(total);
  const carve = new Float32Array(total),
    tmp = new Float32Array(total),
    hollowDist = new Float32Array(total);

  // 1. Shape. 2. Basins.
  lay(g, r, H, meadowMask, mountainMask);
  const flood = new Flood(cols, cols);
  flood.run(H, r.seaLevel);
  fillGently(flood, H, r.basins.fill, r.seaLevel, tmp);
  H.set(tmp);
  stage('shape');
  const distanceTo = (isSource: (v: number) => boolean, out: Float32Array) => {
    for (let v = 0; v < total; v++) out[v] = isSource(v) ? 0 : FAR;
    chamfer(out, cols, cols, cell);
  };
  cutBasins(g, r, random, H, mountainMask);
  stage('basins');

  // 3. Flood. 4. Accumulate. 5. Erode, leaving the lakes' shores alone. 6. Flood again, and hold the lakes.
  const area = new Float32Array(total);
  const labels = new Int32Array(total),
    stack = new Int32Array(total);
  // The flood that finds where water gathers is run on the land with a little noise on it; the land itself is not.
  const scattered = new Float32Array(total);
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const v = j * cols + i;
      scattered[v] = H[v] + r.erosion.scatter * (2 * hash01(i, j, r.seed + 18 * SALT) - 1);
    }
  }
  flood.run(scattered, r.seaLevel);
  stage('flood');
  // The scattering leaves small pits of its own in the land; they are not hollows to be counted.
  let hollows = findHollows(g, scattered, flood.filled, r.lakes.tolerance + 2 * r.erosion.scatter, labels, stack);
  chooseLakes(r, hollows);
  const vertexLake = new Int8Array(total);
  lakeVertices(labels, hollows, vertexLake);
  distanceTo((v) => vertexLake[v] >= 0, hollowDist);
  erode(g, r, H, flood, vertexLake, hollowDist, area, carve, tmp);
  stage('erosion');

  flood.run(H, r.seaLevel);
  hollows = findHollows(g, H, flood.filled, r.lakes.tolerance, labels, stack);
  const lakeCount = chooseLakes(r, hollows);
  // A hollow too small to be a lake is filled, so no puddles are left.
  for (let v = 0; v < total; v++) {
    const l = labels[v];
    if (l >= 0 && hollows[l].lake < 0) H[v] = flood.filled[v];
  }
  lakeVertices(labels, hollows, vertexLake);
  area.fill(1);
  flowAccumulation(flood, area);
  stage('lakes');

  // The lakes' squares: every square with a corner in the hollow.
  const squareLake = new Int8Array(n * n).fill(-1);
  const lakeSquares: number[][] = Array.from({ length: lakeCount }, () => []);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * cols + i;
      const lake = Math.max(vertexLake[k], vertexLake[k + 1], vertexLake[k + cols], vertexLake[k + cols + 1]);
      if (lake >= 0) {
        squareLake[j * n + i] = lake;
        lakeSquares[lake].push(j * n + i);
      }
    }
  }
  const lakes: Lake[] = [];
  for (const h of hollows) {
    if (h.lake < 0) continue;
    lakes[h.lake] = {
      level: h.level,
      x: h.sumX / h.squares,
      y: h.sumY / h.squares,
      squares: Uint32Array.from(lakeSquares[h.lake]),
    };
  }

  // 7. Rivers. 8. Carve them.
  const seaDist = new Float32Array(total),
    lakeDist = new Float32Array(total),
    riverDist = new Float32Array(total);
  distanceTo((v) => H[v] < r.seaLevel, seaDist);
  distanceTo((v) => vertexLake[v] >= 0, lakeDist);
  const { runs, mouths } = traceRivers(g, r, H, flood.filled, flood.down, area, vertexLake, seaDist, lakeDist);
  stage('rivers');
  const edge = new Float32Array(total),
    bankZ = new Float32Array(total),
    bankW = new Float32Array(total);
  carveRivers(g, r, H, runs, vertexLake, edge, bankZ, bankW);
  stage('carve');

  // 9. Pads.
  distanceTo((v) => edge[v] <= 0, riverDist);
  const pads = placePads(g, r, random, H, seaDist, lakeDist, riverDist, meadowMask, mountainMask, lakes, mouths);
  stage('pads');

  // 10. Ground: the land, the water over it, a pad's top.
  const ground = new Float32Array(H);
  for (let v = 0; v < total; v++) {
    if (ground[v] < r.seaLevel) ground[v] = r.seaLevel;
    if (edge[v] <= 0 && bankZ[v] > ground[v]) ground[v] = bankZ[v];
  }
  for (let l = 0; l < lakes.length; l++) {
    for (const sq of lakes[l].squares) {
      const k = Math.floor(sq / n) * cols + (sq % n);
      for (const c of [k, k + 1, k + cols, k + cols + 1]) if (ground[c] < lakes[l].level) ground[c] = lakes[l].level;
    }
  }
  for (const p of pads) {
    const i0 = Math.max(0, Math.floor((p.x - p.radius - g.origin) / cell)),
      i1 = Math.min(cols - 1, Math.ceil((p.x + p.radius - g.origin) / cell)),
      j0 = Math.max(0, Math.floor((p.y - p.radius - g.origin) / cell)),
      j1 = Math.min(cols - 1, Math.ceil((p.y + p.radius - g.origin) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (dist(g.origin + i * cell - p.x, g.origin + j * cell - p.y) <= p.radius) ground[j * cols + i] = p.z;
      }
    }
  }
  stage('ground');

  // 11. Surface. 12. Sea.
  const surface = new Uint8Array(2 * n * n);
  paint(g, r, H, area, meadowMask, riverDist, squareLake, lakes, pads, surface);
  stage('surface');
  const sea = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * cols + i;
      const low = Math.min(H[k], H[k + 1], H[k + cols], H[k + cols + 1]);
      sea[j * n + i] = low >= r.seaLevel ? SEA.dry : low > r.seaLevel - r.sea.shallow ? SEA.shallow : SEA.deep;
    }
  }
  stage('sea');

  // 13. Trees.
  const terrain = new Heightfield(g.origin, g.origin, cell, cols, cols, H);
  const { trees, count } = plant(g, r, random, terrain, surface, seaDist, lakeDist, riverDist, edge, pads);
  stage('trees');

  return {
    terrain,
    ground: new Heightfield(g.origin, g.origin, cell, cols, cols, ground),
    bounds: { minX: -half, minY: -half, maxX: half, maxY: half },
    seaLevel: r.seaLevel,
    surface,
    sea,
    lakes,
    rivers: runs.map((points) => ({ points })),
    pads,
    trees,
    treeCount: count,
  };
}
