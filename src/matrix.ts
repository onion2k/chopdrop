/**
 * Column-major 4×4 placements, as WebGPU reads them: element (row r, column
 * c) lives at c * 4 + r, so the translation is the last four floats. The
 * helicopter's tilt and its spinning rotors are placed here, into plain
 * arrays and without allocating, so the scene can write them every frame.
 * A tree bowed by the downwash is leaned here too, from its foot. A
 * transposed matrix would draw the machine nose-up or mirrored, and nothing
 * else would say so.
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

/**
 * A body's frame: turned by `yaw` about Z, then tilted by `pitch` about its
 * own left (Y) axis and `roll` about its own forward (X) axis, so the
 * rotation is Rz(yaw)·Ry(pitch)·Rx(roll), and put at (x, y, z). A positive
 * pitch puts the nose (+X) down; a positive roll lifts the left side (+Y).
 */
export function placeFrame(
  out: Float32Array,
  i: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
): void {
  const o = i * 16;
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const cr = Math.cos(roll),
    sr = Math.sin(roll);
  out[o] = cy * cp;
  out[o + 1] = sy * cp;
  out[o + 2] = -sp;
  out[o + 3] = 0;
  out[o + 4] = cy * sp * sr - sy * cr;
  out[o + 5] = sy * sp * sr + cy * cr;
  out[o + 6] = cp * sr;
  out[o + 7] = 0;
  out[o + 8] = cy * sp * cr + sy * sr;
  out[o + 9] = sy * sp * cr - cy * sr;
  out[o + 10] = cp * cr;
  out[o + 11] = 0;
  out[o + 12] = x;
  out[o + 13] = y;
  out[o + 14] = z;
  out[o + 15] = 1;
}

/**
 * A part of a body: the body's frame (the 16 floats of `frame` from slot
 * `at`), then a move by (ox, oy, oz) in the body's own axes, then a spin of
 * `spin` about the body's own Z or Y axis. Written into slot `i` of `out`.
 * Every float it needs is read before any is written, so `out` may be the
 * very array `frame` is in.
 */
export function placePart(
  out: Float32Array,
  i: number,
  frame: Float32Array,
  at: number,
  ox: number,
  oy: number,
  oz: number,
  axis: 'y' | 'z',
  spin: number,
): void {
  const f = at * 16;
  const o = i * 16;
  const c = Math.cos(spin),
    s = Math.sin(spin);
  const a0 = frame[f],
    a1 = frame[f + 1],
    a2 = frame[f + 2];
  const b0 = frame[f + 4],
    b1 = frame[f + 5],
    b2 = frame[f + 6];
  const c0 = frame[f + 8],
    c1 = frame[f + 9],
    c2 = frame[f + 10];
  const t0 = frame[f + 12],
    t1 = frame[f + 13],
    t2 = frame[f + 14];
  out[o + 12] = a0 * ox + b0 * oy + c0 * oz + t0;
  out[o + 13] = a1 * ox + b1 * oy + c1 * oz + t1;
  out[o + 14] = a2 * ox + b2 * oy + c2 * oz + t2;
  out[o + 3] = 0;
  out[o + 7] = 0;
  out[o + 11] = 0;
  out[o + 15] = 1;
  if (axis === 'z') {
    out[o] = c * a0 + s * b0;
    out[o + 1] = c * a1 + s * b1;
    out[o + 2] = c * a2 + s * b2;
    out[o + 4] = c * b0 - s * a0;
    out[o + 5] = c * b1 - s * a1;
    out[o + 6] = c * b2 - s * a2;
    out[o + 8] = c0;
    out[o + 9] = c1;
    out[o + 10] = c2;
  } else {
    out[o] = c * a0 - s * c0;
    out[o + 1] = c * a1 - s * c1;
    out[o + 2] = c * a2 - s * c2;
    out[o + 4] = b0;
    out[o + 5] = b1;
    out[o + 6] = b2;
    out[o + 8] = s * a0 + c * c0;
    out[o + 9] = s * a1 + c * c1;
    out[o + 10] = s * a2 + c * c2;
  }
}

/**
 * A placement from `place`, of a thing of `scale`, leaned from its foot: its up axis tipped across the ground by
 * (ax, ay) for each unit of its height and shortened by `squash`, so its foot stays where it was and its top moves
 * the most. Only the up axis is written; with no lean and no squash it is the placement `place` wrote, exactly.
 */
export function lean(out: Float32Array, i: number, ax: number, ay: number, squash: number, scale: number): void {
  const o = i * 16;
  out[o + 8] = ax * scale;
  out[o + 9] = ay * scale;
  out[o + 10] = scale * (1 - squash);
}
