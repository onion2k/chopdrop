/**
 * Noise, from a seed and nothing else: a hash of the lattice, gradient noise
 * smoothed between its points, and the sums of it that make land. Every
 * function is pure and made of integer mixing and plain arithmetic, so the
 * same seed gives the same hills in Node and in the page, and the island is
 * the same island each time it is built.
 */

/** A diagonal gradient's part along each axis, so that it is a unit vector like the rest. */
const D = 0.7071067811865476;

/** Eight gradient directions, two floats each: the four axes and the four diagonals. */
const GRADIENTS = new Float64Array([1, 0, -1, 0, 0, 1, 0, -1, D, D, -D, D, D, -D, -D, -D]);

/** Gradient noise reaches a little under 0.71 at best, so this puts its extremes near ±1. */
const SPREAD = 1.4142135623730951;

/**
 * The first half of the hash, which depends on a column of the lattice and the seed and not on the row: the noise
 * mixes it once for each of the two columns a point falls between, and not four times.
 */
function column(ix: number, seed: number): number {
  let h = Math.imul(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ ix, 0xc2b2ae35);
  h ^= h >>> 15;
  return h;
}

/** The second half: a row of the lattice mixed into a column. */
function row(h: number, iy: number): number {
  h = Math.imul(h ^ iy, 0x27d4eb2f);
  h ^= h >>> 13;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A 32-bit hash of a lattice point and a seed: every bit of each moves about half the bits of the result. */
export function hash2(ix: number, iy: number, seed: number): number {
  return row(column(ix, seed), iy);
}

/** The hash as a number in [0, 1). */
export function hash01(ix: number, iy: number, seed: number): number {
  return hash2(ix, iy, seed) / 4294967296;
}

/** Gradient noise in about [−1, 1], smooth in its first and second derivative, and zero on every lattice point. */
export function noise2(x: number, y: number, seed: number): number {
  const fx = Math.floor(x),
    fy = Math.floor(y);
  const u = x - fx,
    v = y - fy;
  const ix = fx | 0,
    iy = fy | 0;
  const c0 = column(ix, seed),
    c1 = column(ix + 1, seed);
  const g00 = (row(c0, iy) & 7) << 1,
    g10 = (row(c1, iy) & 7) << 1,
    g01 = (row(c0, iy + 1) & 7) << 1,
    g11 = (row(c1, iy + 1) & 7) << 1;
  const u1 = u - 1,
    v1 = v - 1;
  const n00 = GRADIENTS[g00] * u + GRADIENTS[g00 + 1] * v,
    n10 = GRADIENTS[g10] * u1 + GRADIENTS[g10 + 1] * v,
    n01 = GRADIENTS[g01] * u + GRADIENTS[g01 + 1] * v1,
    n11 = GRADIENTS[g11] * u1 + GRADIENTS[g11 + 1] * v1;
  // The quintic ease, so the slope is continuous across a lattice line and no grid shows.
  const su = u * u * u * (u * (u * 6 - 15) + 10),
    sv = v * v * v * (v * (v * 6 - 15) + 10);
  const a = n00 + su * (n10 - n00),
    b = n01 + su * (n11 - n01);
  return (a + sv * (b - a)) * SPREAD;
}

/**
 * Fractal noise: `octaves` layers of gradient noise, each `lacunarity` times
 * finer and `gain` times fainter than the one before, over the sum of their
 * strengths. In about [−1, 1], though it rarely goes far from 0 once there
 * are several. Each layer is shifted, so they do not all fall to zero on the
 * same lattice points.
 */
export function fbm(x: number, y: number, seed: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let sum = 0,
    amp = 1,
    norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x, y, seed + o * 1013);
    norm += amp;
    amp *= gain;
    x = x * lacunarity + 5.2;
    y = y * lacunarity + 1.3;
  }
  return sum / norm;
}

/**
 * Ridged fractal noise in [0, 1]: sharp crests where the noise crosses zero,
 * and each layer weighted by the one before it, so the crests are strongest
 * where the coarse layer is on a ridge and the fine layers only roughen those.
 * This is what a mountain range is made of.
 */
export function ridged(x: number, y: number, seed: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let sum = 0,
    amp = 1,
    norm = 0,
    weight = 1;
  for (let o = 0; o < octaves; o++) {
    let s = 1 - Math.abs(noise2(x, y, seed + o * 1013));
    s *= s;
    s *= weight;
    weight = Math.min(1, Math.max(0, s * 2));
    sum += amp * s;
    norm += amp;
    amp *= gain;
    x = x * lacunarity + 5.2;
    y = y * lacunarity + 1.3;
  }
  return sum / norm;
}
