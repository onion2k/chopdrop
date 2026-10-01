/**
 * Column-major 4×4 placements, as WebGPU reads them: element (row r, column
 * c) lives at c * 4 + r, so the translation is the last four floats.
 */

/** A turn about Z, a scale each way, and somewhere to put it. */
export function place(
  out: Float32Array,
  i: number,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  sx = 1,
  sy = sx,
  sz = sx,
) {
  const o = i * 16;
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  out[o] = c * sx;
  out[o + 1] = s * sx;
  out[o + 2] = 0;
  out[o + 3] = 0;
  out[o + 4] = -s * sy;
  out[o + 5] = c * sy;
  out[o + 6] = 0;
  out[o + 7] = 0;
  out[o + 8] = 0;
  out[o + 9] = 0;
  out[o + 10] = sz;
  out[o + 11] = 0;
  out[o + 12] = x;
  out[o + 13] = y;
  out[o + 14] = z;
  out[o + 15] = 1;
}
