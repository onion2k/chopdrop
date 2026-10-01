/** Placements, checked by putting points through the matrices they write: a flipped sign or a transposed matrix tilts the helicopter the wrong way and nothing else would notice. */
import { describe, expect, it } from 'vitest';
import { lean, place, placeFrame, placePart } from '../src/matrix';

type V3 = [number, number, number];

/** A point through slot `i` of a column-major pool. */
function apply(m: Float32Array, i: number, [x, y, z]: V3): V3 {
  const o = i * 16;
  return [
    m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12],
    m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13],
    m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14],
  ];
}

function near(a: V3, b: V3) {
  for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k], 5);
}

describe('placeFrame', () => {
  it('turns +X to +Y at a yaw of a quarter turn', () => {
    const m = new Float32Array(16);
    placeFrame(m, 0, 0, 0, 0, Math.PI / 2, 0, 0);
    near(apply(m, 0, [1, 0, 0]), [0, 1, 0]);
  });

  it('puts the nose below the ground at a positive pitch', () => {
    const m = new Float32Array(16);
    placeFrame(m, 0, 0, 0, 0, 0, 0.3, 0);
    const nose = apply(m, 0, [1, 0, 0]);
    expect(nose[2]).toBeLessThan(0);
    near(nose, [Math.cos(0.3), 0, -Math.sin(0.3)]);
  });

  it('puts the left side above the ground at a positive roll', () => {
    const m = new Float32Array(16);
    placeFrame(m, 0, 0, 0, 0, 0, 0, 0.3);
    const left = apply(m, 0, [0, 1, 0]);
    expect(left[2]).toBeGreaterThan(0);
    near(left, [0, Math.cos(0.3), Math.sin(0.3)]);
  });

  it('puts the origin where it is asked, and writes into the slot it is given', () => {
    const m = new Float32Array(32);
    placeFrame(m, 1, 3, -4, 5, 0.7, 0.2, -0.1);
    near(apply(m, 1, [0, 0, 0]), [3, -4, 5]);
    expect(Array.from(m.slice(0, 16)).every((v) => v === 0)).toBe(true);
    expect([m[16 + 3], m[16 + 7], m[16 + 11], m[16 + 15]]).toEqual([0, 0, 0, 1]);
  });

  it('is a rotation: the three axes stay unit and square to each other', () => {
    const m = new Float32Array(16);
    placeFrame(m, 0, 0, 0, 0, 1.1, 0.28, -0.35);
    const col = (c: number): V3 => [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];
    const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) expect(dot(col(a), col(b))).toBeCloseTo(a === b ? 1 : 0, 5);
  });

  it('applies the yaw last: a pitched nose still points the way the machine faces', () => {
    const m = new Float32Array(16);
    placeFrame(m, 0, 0, 0, 0, Math.PI / 2, 0.3, 0);
    near(apply(m, 0, [1, 0, 0]), [0, Math.cos(0.3), -Math.sin(0.3)]);
  });
});

describe('placePart', () => {
  const frame = new Float32Array(16);
  placeFrame(frame, 0, 10, 20, 30, 0, 0, 0);

  it("lands a part at (0, 0, 3.1) at the frame's position and 3.1 up", () => {
    const out = new Float32Array(16);
    placePart(out, 0, frame, 0, 0, 0, 3.1, 'z', 0);
    near(apply(out, 0, [0, 0, 0]), [10, 20, 33.1]);
  });

  it("spins about Z: the part's +X turns to +Y at a quarter turn, and its hub stays put", () => {
    const out = new Float32Array(16);
    placePart(out, 0, frame, 0, 0, 0, 3.1, 'z', Math.PI / 2);
    near(apply(out, 0, [1, 0, 0]), [10, 21, 33.1]);
    near(apply(out, 0, [0, 0, 0]), [10, 20, 33.1]);
    near(apply(out, 0, [0, 1, 0]), [9, 20, 33.1]);
  });

  it("spins about Y: the part's Y is kept and its X turns toward Z", () => {
    const out = new Float32Array(16);
    placePart(out, 0, frame, 0, -6.2, 0.35, 2.4, 'y', Math.PI / 2);
    near(apply(out, 0, [0, 1, 0]), [10 - 6.2, 20 + 1.35, 32.4]);
    near(apply(out, 0, [1, 0, 0]), [10 - 6.2, 20.35, 30 + 2.4 - 1]);
  });

  it("moves in the frame's own axes, so a yawed body carries the offset round", () => {
    const turned = new Float32Array(16);
    placeFrame(turned, 0, 0, 0, 0, Math.PI / 2, 0, 0);
    const out = new Float32Array(16);
    placePart(out, 0, turned, 0, -6, 0, 0, 'y', 0);
    near(apply(out, 0, [0, 0, 0]), [0, -6, 0]);
  });

  it("reads the frame from the slot it is told, and writes to another array's slot", () => {
    const pool = new Float32Array(32);
    placeFrame(pool, 1, 1, 2, 3, 0, 0, 0);
    const out = new Float32Array(32);
    placePart(out, 1, pool, 1, 0, 0, 1, 'z', 0);
    near(apply(out, 1, [0, 0, 0]), [1, 2, 4]);
  });

  it('gives the same answer written over the frame it was made from', () => {
    const f = new Float32Array(16);
    placeFrame(f, 0, 1, 2, 3, 0.9, 0.2, -0.3);
    const apart = new Float32Array(16);
    placePart(apart, 0, f, 0, 0.5, -0.5, 2, 'y', 0.8);
    placePart(f, 0, f, 0, 0.5, -0.5, 2, 'y', 0.8);
    expect(Array.from(f)).toEqual(Array.from(apart));
  });
});

describe('place', () => {
  it('is unchanged: a turn about Z, a scale and a position', () => {
    const m = new Float32Array(16);
    place(m, 0, 1, 2, 3, Math.PI / 2, 2, 3, 4);
    near(apply(m, 0, [1, 0, 0]), [1, 4, 3]);
    near(apply(m, 0, [0, 1, 0]), [-2, 2, 3]);
    near(apply(m, 0, [0, 0, 1]), [1, 2, 7]);
  });
});

describe('lean', () => {
  it('keeps the foot where it was and moves the top by the lean, pressed down by the squash', () => {
    const m = new Float32Array(32);
    place(m, 1, 10, -4, 2, 0.7, 1.3);
    lean(m, 1, 0.2, -0.1, 0.05, 1.3);
    near(apply(m, 1, [0, 0, 0]), [10, -4, 2]);
    // a point a unit up the tree, which a scale of 1.3 makes 1.3 high
    near(apply(m, 1, [0, 0, 1]), [10 + 0.2 * 1.3, -4 - 0.1 * 1.3, 2 + 1.3 * 0.95]);
    // a point out to the side at the foot is turned and sized as before, and not tipped
    const side = apply(m, 1, [1, 0, 0]);
    near(side, [10 + Math.cos(0.7) * 1.3, -4 + Math.sin(0.7) * 1.3, 2]);
    expect(Array.from(m.subarray(0, 16)).every((v) => v === 0)).toBe(true);
  });

  it('with no lean and no squash, is the placement exactly', () => {
    const was = new Float32Array(16);
    place(was, 0, 3, 4, 5, 1.1, 0.85);
    const m = was.slice();
    lean(m, 0, 0.3, 0.2, 0.1, 0.85);
    lean(m, 0, 0, 0, 0, 0.85);
    expect(Array.from(m)).toEqual(Array.from(was));
  });
});
