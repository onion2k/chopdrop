/**
 * The shapes the game is made of. The helicopter is moulded: a lathe-turned
 * cabin and cowling, swept tubes, fins and blades, and smooth normals on
 * everything curved, so it shades as one piece of well-made plastic and not
 * as a pile of bricks. It comes to about five thousand triangles, and it is
 * drawn once. The trees are low-poly cartoon (a few lumpy blobs, a few
 * stacked cones) because there will be thousands of each, instanced, and a
 * tree is read by its outline: a crown is held near a hundred and fifty
 * triangles and a trunk to forty. The landing pads are a round slab and its
 * paint. The box and the square, flat-shaded with a normal to a face and
 * nothing shared, are what anything plain is made from. The ball and the
 * disc the stub was made of went with it, and are in the first commit to
 * copy from. The helicopter's sizes are read from `HELICOPTER` where it
 * holds them, so what is drawn and what the flight keeps to cannot part.
 *
 * Everything is in world units and Z is up, as the renderer has it, and
 * everything is built once and handed over; nothing here is kept.
 */
import { bezier3, catmullRom, resample, samplePath } from 'artshape-render/geom/curve';
import { circle, lens, ribbon, type Profile } from 'artshape-render/geom/profile';
import type { Vec2, Vec3 } from 'artshape-render/geom/types';
import { roundCorners } from 'artshape-render/mesh/rounded';
import { revolve } from 'artshape-render/mesh/revolve';
import { sweep } from 'artshape-render/mesh/sweep';
import { MeshBuilder, mergeMeshes, type Mesh } from 'artshape-render/mesh/types';
import { HELICOPTER } from './helicopter';

type V3 = [number, number, number];

/** One flat-shaded quad, wound counter-clockwise seen from the normal. */
function face(b: MeshBuilder, p0: V3, p1: V3, p2: V3, p3: V3) {
  const ux = p1[0] - p0[0],
    uy = p1[1] - p0[1],
    uz = p1[2] - p0[2];
  const vx = p3[0] - p0[0],
    vy = p3[1] - p0[1],
    vz = p3[2] - p0[2];
  let nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const a = b.vertex(p0[0], p0[1], p0[2], nx, ny, nz, 0, 0);
  b.vertex(p1[0], p1[1], p1[2], nx, ny, nz, 1, 0);
  b.vertex(p2[0], p2[1], p2[2], nx, ny, nz, 1, 1);
  b.vertex(p3[0], p3[1], p3[2], nx, ny, nz, 0, 1);
  b.quad(a, a + 1, a + 2, a + 3);
}

/** A box centred at (cx, cy, cz), `w` along X, `d` along Y and `h` along Z, added to `b`. */
export function boxAt(b: MeshBuilder, cx: number, cy: number, cz: number, w: number, d: number, h: number) {
  const x0 = cx - w / 2,
    x1 = cx + w / 2,
    y0 = cy - d / 2,
    y1 = cy + d / 2,
    z0 = cz - h / 2,
    z1 = cz + h / 2;
  face(b, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  face(b, [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]);
  face(b, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  face(b, [x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]);
  face(b, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
  face(b, [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]);
}

/** A box `w` along X, `d` along Y and `h` up Z, centred in X and Y and standing on z = 0, or centred in Z too. */
export function box(w: number, d: number, h: number, centred = false): Mesh {
  const b = new MeshBuilder();
  boxAt(b, 0, 0, centred ? 0 : h / 2, w, d, h);
  return b.build();
}

/** A flat unit square at z = 0, facing up, centred: stretched to size where it is placed. */
export function square(): Mesh {
  const b = new MeshBuilder();
  face(b, [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]);
  return b.build();
}

/* ------------------------------------------------------------------ the toolbox */

/** A move in space, as its 3×3 row by row and then the shift: twelve numbers. */
type Affine = number[];

const IDENTITY: Affine = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
/** The lathe turns about Z, and the cabin lies along X: this swaps the two, which also mirrors, and `placed` knows. */
const ALONG_X: Affine = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0];

const scaling = (sx: number, sy = sx, sz = sx): Affine => [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0];
const moving = (x: number, y: number, z: number): Affine => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
/** Leaning along X by `k` for every unit of height: a swept-back fin from one stood straight up. */
const shearing = (k: number): Affine => [1, 0, k, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function turning(axis: 'x' | 'y' | 'z', angle: number): Affine {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  if (axis === 'x') return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0];
  if (axis === 'y') return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0];
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
}

/** `second` done after `first`. */
function then(first: Affine, second: Affine): Affine {
  const out = new Array<number>(12);
  for (let r = 0; r < 3; r++) {
    const o = r * 4;
    for (let c = 0; c < 3; c++)
      out[o + c] = second[o] * first[c] + second[o + 1] * first[4 + c] + second[o + 2] * first[8 + c];
    out[o + 3] = second[o] * first[3] + second[o + 1] * first[7] + second[o + 2] * first[11] + second[o + 3];
  }
  return out;
}

/**
 * A copy of `mesh` with each move done in turn to its points. Normals go by
 * the inverse transpose (the cofactor matrix, which has the same direction
 * and no division) and are made unit again, so a cabin squeezed narrower
 * than it is tall still shades as a smooth surface and not as the sphere it
 * was turned from. A move that mirrors turns the triangles inside out, so
 * their winding is put back. Only what the renderer reads is kept.
 */
function placed(mesh: Mesh, ...moves: Affine[]): Mesh {
  const m = moves.reduce<Affine>(then, IDENTITY);
  const [a, b, c, tx, d, e, f, ty, g, h, i, tz] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const k = det < 0 ? -1 : 1;
  const cof = [
    e * i - f * h,
    f * g - d * i,
    d * h - e * g,
    c * h - b * i,
    a * i - c * g,
    b * g - a * h,
    b * f - c * e,
    c * d - a * f,
    a * e - b * d,
  ];
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    const x = mesh.positions[v * 3],
      y = mesh.positions[v * 3 + 1],
      z = mesh.positions[v * 3 + 2];
    positions[v * 3] = a * x + b * y + c * z + tx;
    positions[v * 3 + 1] = d * x + e * y + f * z + ty;
    positions[v * 3 + 2] = g * x + h * y + i * z + tz;
    const nx = mesh.normals[v * 3],
      ny = mesh.normals[v * 3 + 1],
      nz = mesh.normals[v * 3 + 2];
    const mx = k * (cof[0] * nx + cof[1] * ny + cof[2] * nz),
      my = k * (cof[3] * nx + cof[4] * ny + cof[5] * nz),
      mz = k * (cof[6] * nx + cof[7] * ny + cof[8] * nz);
    const l = Math.hypot(mx, my, mz) || 1;
    normals[v * 3] = mx / l;
    normals[v * 3 + 1] = my / l;
    normals[v * 3 + 2] = mz / l;
  }
  const indices = Uint32Array.from(mesh.indices);
  if (det < 0)
    for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
  return { positions, normals, uvs: Float32Array.from(mesh.uvs), indices };
}

/** The parts as one mesh. Each is put through `placed` first, so none carries more than the renderer reads. */
const join = (parts: Mesh[]): Mesh => mergeMeshes(parts.map((part) => placed(part)));

/** A path of `count` points, evenly spaced along `curve` by their distance, which a swept tube wants and a curve's own steps do not give. */
const spaced = (curve: Parameters<typeof resample>[0], count: number): Vec3[] => resample(curve, count);

/** A table read by position, 0 to 1, with straight lines between its entries: a taper written as numbers. */
function tabled(values: number[]): (t: number) => number {
  return (t) => {
    const s = Math.min(Math.max(t, 0), 1) * (values.length - 1);
    const i = Math.min(Math.floor(s), values.length - 2);
    return values[i] + (values[i + 1] - values[i]) * (s - i);
  };
}

/**
 * A body of revolution with its widest part off the middle and its two ends
 * brought in: a rounded nose of an ellipse and a tail drawn in by a curve.
 * Positions along it are named by `u`, which is even along the nose's arc
 * and even in length along the tail, so a few points describe it well.
 */
interface Teardrop {
  tail: number;
  nose: number;
  widest: number;
  /** The radius at the tail's end, as a share of the widest. Nought comes to a point. */
  tailRadius: number;
  /** Half the power the nose is drawn with: a half is an ellipse, and one is a point. */
  point: number;
}

const stationAt = (t: Teardrop, u: number): [x: number, r: number] => {
  const reach = t.nose - t.widest;
  if (u >= 0) {
    const theta = Math.min(u / reach, Math.PI / 2);
    const r = Math.pow(Math.cos(theta), 2 * t.point);
    return [t.widest + reach * Math.sin(theta), r < 1e-9 ? 0 : r];
  }
  const s = Math.min(-u / (t.widest - t.tail), 1);
  return [t.widest + u, t.tailRadius + (1 - t.tailRadius) * (1 - Math.pow(s, 1.8))];
};

/** The `u` that names the point `x` along the body. */
const stationOf = (t: Teardrop, x: number): number =>
  x >= t.widest ? (t.nose - t.widest) * Math.asin(Math.min((x - t.widest) / (t.nose - t.widest), 1)) : x - t.widest;

/** The silhouette, tail to nose, as [radius, position] for the lathe, `steps` points from `from` to `to`. */
function teardropPoints(t: Teardrop, steps: number, from = t.tail, to = t.nose): Vec2[] {
  const u0 = stationOf(t, from),
    u1 = stationOf(t, to);
  const out: Vec2[] = [];
  for (let k = 0; k <= steps; k++) {
    const [x, r] = stationAt(t, u0 + ((u1 - u0) * k) / steps);
    out.push([r, x]);
  }
  return out;
}

/* ------------------------------------------------------------------ the helicopter */

/** The cabin's size and shape, in the helicopter's own frame, with the skids' base at z = 0. */
const CABIN: {
  centre: number;
  halfWidth: number;
  halfHeight: number;
  droop: number;
  squareness: number;
  shape: Teardrop;
} = {
  /** Where the cabin's axis lies, and how far its section reaches either way from it. */
  centre: 1.5,
  halfWidth: 0.92,
  halfHeight: 1.02,
  /** How much the nose is dropped: a small turn about Y, in radians, so the belly climbs to the tail. */
  droop: 0.05,
  /** How square the section is. Two would be an ellipse and higher a box with its corners rounded. */
  squareness: 2.6,
  shape: { tail: -2.6, nose: 2.75, widest: 0.3, tailRadius: 0.42, point: 0.5 },
};

/** The radius multiplier for the cabin's section at `angle` round its length, which makes the ellipse squarer. */
const squared = (angle: number): number => {
  const n = CABIN.squareness;
  return Math.pow(Math.pow(Math.abs(Math.cos(angle)), n) + Math.pow(Math.abs(Math.sin(angle)), n), -1 / n);
};

/** What a part of the cabin is put through: onto its length, squeezed to the section, drooped and lifted onto the skids. */
const CABIN_FRAME: Affine[] = [
  ALONG_X,
  scaling(1, CABIN.halfWidth, CABIN.halfHeight),
  turning('y', CABIN.droop),
  moving(0, 0, CABIN.centre),
];

/**
 * A skin laid on the cabin, `grow` proud of it: from `x0` to `x1` along it
 * and from `a0` to `a1` round it (nought is the roof and positive is the
 * left). It is a thin shell with a lip at each end tucked into the paint, so
 * a window reads as glass set into the cabin and a stripe as paint on it.
 */
function cabinSkin(x0: number, x1: number, a0: number, a1: number, grow: number): Mesh {
  const t = CABIN.shape;
  const lip = 0.12;
  const rim = teardropPoints(t, 9, x0, x1);
  // Pushed out along the surface's own normal, so the nose's tip stands proud too and not only its sides.
  const points: Vec2[] = rim.map(([r, x], k) => {
    const [r0, x0k] = rim[Math.max(k - 1, 0)],
      [r1, x1k] = rim[Math.min(k + 1, rim.length - 1)];
    const dr = r1 - r0,
      dx = x1k - x0k;
    const l = Math.hypot(dr, dx) || 1;
    // The normal to the silhouette, outward, in the section's own proportions.
    return [r + (dx / l) * (grow / CABIN.halfWidth), x - (dr / l) * grow] as Vec2;
  });
  const sharp = points.map(() => false);
  const tipped = rim[rim.length - 1][0] === 0;
  if (!tipped) {
    const last = points[points.length - 1];
    points.push([last[0] - lip, last[1]]);
    sharp[sharp.length - 1] = true;
    sharp.push(false);
  }
  const first = points[0];
  points.unshift([Math.max(first[0] - lip, 0), first[1]]);
  sharp.unshift(false);
  sharp[1] = true;
  return placed(
    revolve(
      { points, sharp },
      {
        segments: Math.max(4, Math.round(((a1 - a0) / (Math.PI * 2)) * 28)),
        arc: a1 - a0,
        warp: (angle) => squared(a0 + angle),
      },
    ),
    turning('z', a0),
    ...CABIN_FRAME,
  );
}

/** The whole cabin: a squared teardrop, the nose forward and the tail drawn in to meet the boom. */
function cabin(): Mesh {
  const t = CABIN.shape;
  const points = teardropPoints(t, 15);
  // Closed behind the boom, where it cannot be seen.
  points.unshift([0, t.tail - 0.16], [t.tailRadius * 0.55, t.tail - 0.1]);
  return placed(revolve({ points }, { segments: 24, warp: (angle) => squared(angle) }), ...CABIN_FRAME);
}

/** The engine cowling: the long hump behind the mast, running back and down to the boom. */
function cowling(): Mesh {
  const shape: Teardrop = { tail: -3.1, nose: 0.75, widest: -0.35, tailRadius: 0.3, point: 0.5 };
  const points = teardropPoints(shape, 11);
  points.unshift([0, shape.tail - 0.1]);
  return placed(
    revolve({ points }, { segments: 16 }),
    ALONG_X,
    scaling(1, 0.62, 0.52),
    turning('y', -0.07),
    moving(0, 0, 2.38),
  );
}

/**
 * A thin foil standing along +Z from z = 0 for `length`: a lens section with
 * its chord along X, `chord` long at the root, `thick` thick, and `taper`
 * scaling both along it. `round` is the share at the end drawn in to a
 * round tip, and at the root end too if `both`. It is how fins, the
 * tailplane and the end plates are made.
 */
function foil(
  chord: number,
  thick: number,
  length: number,
  taper: (t: number) => number,
  round = 0.14,
  both = false,
): Mesh {
  // Even stations along the foil, and close ones round the tip, so the curve of it is drawn and not guessed.
  const tip = [0.5, 0.8, 0.95, 1];
  const start = both ? round : 0;
  const steps = Math.max(2, Math.round((1 - round - start) / 0.12));
  const stations = [
    ...(both ? [...tip].reverse().map((e) => round * (1 - e)) : []),
    ...Array.from({ length: steps + 1 }, (_, i) => start + (i / steps) * (1 - round - start)),
    ...tip.map((e) => 1 - round + round * e),
  ];
  const drawn = (e: number) => Math.sqrt(Math.max(1 - e * e, 0)) * 0.9 + 0.1;
  const ends = (t: number) => {
    if (t > 1 - round) return drawn((t - (1 - round)) / round);
    if (both && t < round) return drawn((round - t) / round);
    return 1;
  };
  return sweep(
    stations.map((t) => [0, 0, t * length] as Vec3),
    {
      profile: lens(chord, thick, 8),
      up: [1, 0, 0],
      // The sweep names its sections evenly, and these are not, so each is looked up by the station it is.
      taper: (u) => {
        const t = stations[Math.round(u * (stations.length - 1))];
        return taper(t) * ends(t);
      },
    },
  );
}

/** The upper fin: swept back as it rises from the boom, its trailing edge near upright, the tail rotor beside its foot. */
function fin(): Mesh {
  return placed(
    foil(1, 0.1, 1.4, (t) => 1.42 * (1 - 0.64 * t), 0.2),
    shearing(-0.4),
    moving(-5.9, 0, 2.18),
  );
}

/** The small fin under the boom, which is also the tail's skid. */
function lowerFin(): Mesh {
  return placed(
    foil(1, 0.09, 0.55, (t) => 0.9 * (1 - 0.5 * t), 0.25),
    shearing(-0.42),
    scaling(1, 1, -1),
    moving(-6.1, 0, 2.38),
  );
}

/** The tailplane across the boom, thin and a little tapered, with a plate standing at either tip. */
function tailplane(): Mesh {
  const x = -5.3,
    z = 2.28;
  const span = 1.0;
  const wing = placed(
    foil(1, 0.1, 2 * span, (t) => 0.84 * (1 - 0.35 * Math.abs(2 * t - 1)), 0.12, true),
    turning('x', -Math.PI / 2),
    moving(x, -span, z),
  );
  const plate = (side: number) =>
    placed(
      foil(1, 0.07, 0.6, (t) => 0.6 * (1 - 0.3 * t), 0.2, true),
      moving(x - 0.05, side * span, z - 0.3),
    );
  return join([wing, plate(-1), plate(1)]);
}

/**
 * The tail boom, drawn out of the cowling and in toward the fin, climbing a
 * little on the way. It starts thin and inside the cowling and swells as it
 * leaves it, so there is no flat end showing where the two meet.
 */
function boom(): Mesh {
  const path = spaced(bezier3([-2.0, 0, 2.1], [-3.3, 0, 2.15], [-4.8, 0, 2.3], [-6.2, 0, 2.42]), 11);
  return sweep(path, {
    profile: circle(1, 12),
    up: [0, 1, 0],
    taper: tabled([0.26, 0.37, 0.38, 0.33, 0.26, 0.2, 0.16, 0.13]),
    caps: true,
  });
}

/** The painted shell: the cabin, the cowling, the boom, the fins and the tailplane. */
export function helicopterBody(): Mesh {
  return join([cabin(), cowling(), boom(), fin(), lowerFin(), tailplane()]);
}

/** The cream trim: a belly panel and a line along each side below the glass. */
export function helicopterTrim(): Mesh {
  const belly = cabinSkin(-2.2, 2.45, Math.PI - 0.75, Math.PI + 0.75, 0.022);
  const line = (side: number) => {
    const a0 = 1.82,
      a1 = 2.08;
    return side > 0 ? cabinSkin(-2.3, 2.3, a0, a1, 0.02) : cabinSkin(-2.3, 2.3, -a1, -a0, 0.02);
  };
  return join([belly, line(1), line(-1)]);
}

/**
 * The glass, standing a little proud of the cabin so it reads as glass and
 * not paint: a pane either side of a painted post over the nose, and a
 * window in each door and behind it.
 */
export function helicopterGlass(): Mesh {
  const sill = 1.62;
  const pane = (side: number, x0: number, x1: number, top: number, grow: number) =>
    side > 0 ? cabinSkin(x0, x1, top, sill, grow) : cabinSkin(x0, x1, -sill, -top, grow);
  const parts: Mesh[] = [];
  for (const side of [1, -1]) {
    parts.push(
      pane(side, 0.78, 2.75, 0.14, 0.034),
      pane(side, -0.42, 0.58, 0.5, 0.03),
      pane(side, -1.75, -0.62, 0.62, 0.03),
    );
  }
  return join(parts);
}

/** A smooth round section of `sides`, turned so a point of it is straight up and one straight down: the base of a tube is then where it says. */
function rod(radius: number, sides: number): Profile {
  const turn = (Math.PI / 2) % ((Math.PI * 2) / sides);
  const points = Array.from({ length: sides }, (_, i) => {
    const a = turn + (i / sides) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius] as Vec2;
  });
  return { points, sharp: points.map(() => false) };
}

/**
 * A tube of `radius` along a path, with `sides` to its section. With
 * `round` its two ends are drawn in to a point, as the toe of a skid is,
 * and without it they are cut off flat, which is for ends that are hidden.
 */
function tube(path: Vec3[], radius: number, sides = 6, round = false): Mesh {
  if (!round) return sweep(path, { profile: rod(radius, sides), caps: true });
  // Two rings past each end, drawn in by a quarter turn of a circle, close the tube with a dome.
  const reach = (from: Vec3, to: Vec3, d: number): Vec3 => {
    const dx = from[0] - to[0],
      dy = from[1] - to[1],
      dz = from[2] - to[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    return [from[0] + (dx / l) * d, from[1] + (dy / l) * d, from[2] + (dz / l) * d];
  };
  const n = path.length;
  const full = [
    reach(path[0], path[1], radius * 0.985),
    reach(path[0], path[1], radius * 0.64),
    ...path,
    reach(path[n - 1], path[n - 2], radius * 0.64),
    reach(path[n - 1], path[n - 2], radius * 0.985),
  ];
  const dome = [0.17, 0.77];
  const sizes = [...dome, ...path.map(() => 1), ...[...dome].reverse()];
  return sweep(full, { profile: rod(radius, sides), caps: true, taper: tabled(sizes) });
}

/** One skid: a tube with an upturned toe at each end, the base of it at z = 0. */
function skid(side: number): Mesh {
  const r = 0.075;
  const y = side * 1.08;
  const lift = (x: number, z: number): Vec3 => [x, y, z];
  const rear = samplePath(bezier3(lift(-2.02, r + 0.3), lift(-1.96, r + 0.08), lift(-1.8, r), lift(-1.45, r)), 4);
  const front = samplePath(bezier3(lift(1.45, r), lift(1.95, r), lift(2.3, r + 0.14), lift(2.52, r + 0.52)), 5);
  return tube([...rear, ...front], r, 6, true);
}

/** An arched cross tube from skid to skid, its middle hidden in the belly, so the cabin stands on four legs. */
function crossTube(x: number): Mesh {
  const r = 0.07;
  const curve = catmullRom([
    [x, -1.08, r + 0.02],
    [x, -0.97, 0.32],
    [x, -0.72, 0.58],
    [x, -0.34, 0.72],
    [x, 0, 0.76],
    [x, 0.34, 0.72],
    [x, 0.72, 0.58],
    [x, 0.97, 0.32],
    [x, 1.08, r + 0.02],
  ]);
  return tube(spaced(curve, 13), r, 6);
}

/** The mast and the swashplate round it, from the cowling to the hub. */
function mast(): Mesh {
  const top = HELICOPTER.size.mastTop;
  const points: Vec2[] = [
    [0, 2.3],
    [0.18, 2.3],
    [0.18, 2.55],
    [0.12, 2.55],
    [0.12, 2.78],
    [0.32, 2.78],
    [0.32, 2.86],
    [0.13, 2.86],
    [0.13, top],
    [0, top],
  ];
  return revolve({ points, sharp: points.map(() => true) }, { segments: 10 });
}

/** The exhaust, a short pipe at the back of the cowling, leaning aft. */
function exhaust(): Mesh {
  return tube(
    [
      [-2.15, 0, 2.5],
      [-2.6, 0, 2.86],
    ],
    0.12,
    6,
    true,
  );
}

/** The tail rotor's gearbox, which carries it out to the left of the fin. */
function gearbox(): Mesh {
  const [x, y, z] = HELICOPTER.size.tailRotorAt;
  return tube(
    [
      [x + 0.05, 0.02, z],
      [x, y - 0.04, z],
    ],
    0.14,
    8,
  );
}

/** The skids, their cross tubes and legs, the mast, the exhaust and the tail rotor's gearbox: the dark metal. */
export function helicopterDark(): Mesh {
  return join([skid(-1), skid(1), crossTube(0.95), crossTube(-1.0), mast(), exhaust(), gearbox()]);
}

/** The main rotor, centred on its hub, which is where it is placed and spun about Z. Four blades, a grip to each. */
export function mainRotor(): Mesh {
  const radius = HELICOPTER.size.rotorRadius;
  const hub: Vec2[] = [
    [0, -0.14],
    [0.34, -0.14],
    [0.34, 0.1],
    [0.25, 0.32],
    [0, 0.46],
  ];
  const head = revolve({ points: hub, sharp: [false, true, false, false, false] }, { segments: 12 });
  // Sections are closer toward the tip, where the blade is drawn in to a round end.
  const reach = [0.5, 1.4, 2.5, 3.5, 4.1, 4.3, radius];
  const chord = tabled([0.52, 0.5, 0.47, 0.44, 0.4, 0.34, 0.14]);
  const blade = sweep(
    reach.map((x) => [x, 0, 0.02] as Vec3),
    { profile: ribbon(1, 0.14, 1), up: [0, 1, 0], taper: chord, caps: true },
  );
  const grip = tube(
    [
      [0.25, 0, 0],
      [0.66, 0, 0],
    ],
    0.1,
    6,
  );
  const arms: Mesh[] = [];
  for (let k = 0; k < 4; k++)
    arms.push(placed(blade, turning('z', (k * Math.PI) / 2)), placed(grip, turning('z', (k * Math.PI) / 2)));
  return join([head, ...arms]);
}

/** The tail rotor, centred on its hub, which is where it is placed and spun about Y. */
export function tailRotor(): Mesh {
  const radius = HELICOPTER.size.tailRotorRadius;
  const half = sweep(
    [
      [0.1, 0, 0],
      [0.45, 0, 0],
      [0.7, 0, 0],
      [radius, 0, 0],
    ],
    { profile: ribbon(1, 0.2, 1), up: [0, 0, 1], taper: tabled([0.24, 0.24, 0.21, 0.12]), caps: true },
  );
  const hub = tube(
    [
      [0, -0.1, 0],
      [0, 0.18, 0],
    ],
    0.12,
    8,
    true,
  );
  return join([hub, half, placed(half, turning('y', Math.PI))]);
}

/* ------------------------------------------------------------------ the trees */

export type TreeKind = 'broadleaf' | 'pine' | 'poplar' | 'palm' | 'bush';

/** A tree as two meshes, so that a kind is two instanced groups: a trunk to paint brown and a crown to paint green. */
export interface TreeShape {
  trunk: Mesh;
  crown: Mesh;
}

/**
 * A lump of foliage: a squashed ball turned on the lathe, its surface pushed
 * in and out by `bumps` lobes round it so no two views are alike, centred on
 * the origin. Few segments on purpose; the smooth normals do the rest, and a
 * tree is read by its outline.
 */
function blob(radius: number, squash: number, segments: number, rings: number, bumps: number, phase: number): Mesh {
  const points: Vec2[] = [];
  for (let k = 0; k <= rings; k++) {
    const lat = -Math.PI / 2 + (Math.PI * k) / rings;
    points.push([k === 0 || k === rings ? 0 : radius * Math.cos(lat), radius * squash * Math.sin(lat)]);
  }
  return revolve(
    { points },
    {
      segments,
      warp: (angle, v) => 1 + 0.13 * Math.sin(bumps * angle + phase) * Math.sin(Math.PI * v),
    },
  );
}

/** A straight run from the foot up to `height`: the path of a trunk with no lean in it. */
const upright = (height: number): Vec3[] => [
  [0, 0, 0],
  [0, 0, height],
];

/** A trunk: a tapered tube up the points given, as many sides as it needs and none of its ends closed, since a crown or the ground hides them. */
function trunk(path: Vec3[], base: number, top: number, sides: number): Mesh {
  return sweep(path, {
    profile: circle(1, sides),
    taper: (t) => base + (top - base) * t,
    caps: false,
    up: [0, 1, 0],
  });
}

/**
 * One tier of a pine: a cone with its rim scalloped, standing on z = `foot`
 * and coming to a point at `tip`. The waist draws the side in a little, so a
 * tier is not a plain cone; the topmost leaves it out, and is one.
 */
function tier(radius: number, foot: number, tip: number, turn: number, waist = true): Mesh {
  const points: Vec2[] = [
    [0, foot + 0.15],
    [radius, foot],
    ...(waist ? ([[radius * 0.52, foot + (tip - foot) * 0.5]] as Vec2[]) : []),
    [0, tip],
  ];
  return placed(
    revolve(
      { points, sharp: points.map((_, k) => k === 1) },
      {
        segments: 10,
        warp: (angle) => 1 + 0.16 * Math.cos(5 * angle),
      },
    ),
    turning('z', turn),
  );
}

function broadleaf(): TreeShape {
  const path: Vec3[] = [
    [0, 0, 0],
    [0.05, 0, 1.4],
    [0.2, 0.1, 3.4],
    [0, 0, 5.4],
  ];
  return {
    trunk: trunk(path, 0.62, 0.36, 6),
    crown: join([
      placed(blob(3.7, 0.84, 8, 4, 3, 0.4), moving(0, 0, 6.6)),
      placed(blob(2.5, 0.84, 6, 4, 3, 1.9), moving(2.5, 0.9, 5.6)),
      placed(blob(2.4, 0.84, 6, 4, 2, 3.1), moving(-1.9, -1.9, 5.9)),
      placed(blob(2.2, 0.84, 6, 4, 3, 5.0), moving(-0.7, 1.5, 8.5)),
    ]),
  };
}

function pine(): TreeShape {
  return {
    trunk: trunk(upright(5), 0.5, 0.3, 6),
    crown: join([
      tier(3.1, 1.8, 5.4, 0),
      tier(2.6, 4.0, 7.8, 0.5),
      tier(2.0, 6.3, 10.2, 1.1),
      tier(1.4, 8.6, 13.2, 0.3, false),
    ]),
  };
}

function poplar(): TreeShape {
  const shape: Teardrop = { tail: 2.0, nose: 12.2, widest: 5.4, tailRadius: 0.3, point: 0.8 };
  const outline = teardropPoints(shape, 8).map(([r, z]) => [r * 1.75, z] as Vec2);
  outline[outline.length - 1][0] = 0;
  outline.unshift([0, shape.tail - 0.35]);
  return {
    trunk: trunk(upright(4.2), 0.4, 0.28, 6),
    crown: revolve(
      { points: outline },
      { segments: 8, warp: (angle, v) => 1 + 0.1 * Math.sin(3 * angle + 0.7) * Math.sin(Math.PI * v) },
    ),
  };
}

function palm(): TreeShape {
  const top: Vec3 = [1.6, 0.4, 7.8];
  const stem = trunk(samplePath(bezier3([0, 0, 0], [0.1, 0, 3.5], [0.9, 0.2, 6.0], top), 4), 0.42, 0.24, 5);
  // One frond in its own plane, outward along X: up from the crown and over, drooping at the tip.
  const curve = bezier3([0, 0, 0], [1.3, 0, 1.6], [3.2, 0, 1.4], [4.2, 0, -1.6]);
  const leaf: Profile = {
    points: [
      [0.22, 0],
      [0, 1],
      [0, -1],
    ],
    sharp: [true, true, true],
  };
  const frond = sweep(samplePath(curve, 3), {
    profile: leaf,
    up: [0, 0, 1],
    taper: tabled([0.3, 0.8, 0.72, 0.08]),
    caps: false,
  });
  const fronds: Mesh[] = [];
  for (let k = 0; k < 8; k++) {
    const size = k % 2 ? 0.92 : 1.08;
    fronds.push(
      placed(
        frond,
        scaling(size, size, size),
        turning('z', k * 0.785 + (k % 3) * 0.12),
        moving(top[0], top[1], top[2]),
      ),
    );
  }
  return { trunk: stem, crown: join(fronds) };
}

function bush(): TreeShape {
  return {
    trunk: trunk(upright(0.7), 0.2, 0.15, 5),
    crown: join([
      placed(blob(1.05, 0.85, 7, 4, 3, 0.3), moving(0, 0, 1.0)),
      placed(blob(0.8, 0.85, 6, 4, 2, 1.7), moving(0.95, 0.3, 0.8)),
      placed(blob(0.75, 0.85, 6, 4, 3, 2.6), moving(-0.65, -0.7, 0.75)),
    ]),
  };
}

/**
 * How tall a kind of tree stands and how far its crown spreads from its trunk, at scale one, and how far it spreads at
 * each height: `profile` is the most any part of the tree is from its axis within each of `TREE_BANDS` equal bands of its
 * height, the lowest first.
 */
export interface TreeSize {
  top: number;
  radius: number;
  profile: readonly number[];
}

/** How many bands of its height a tree's spread is told in: enough that a blob of foliage on a bare trunk is not taken for a tree as wide from foot to top. */
export const TREE_BANDS = 16;

const sizes = new Map<TreeKind, TreeSize>();

/**
 * A kind of tree's height and spread, measured from its shape, so what the camera keeps over is what is drawn and is
 * said nowhere else. Measured once a kind: a map of five that is never added to past them. A band's spread is the
 * widest of every triangle that is in it at all, since a triangle that runs from one band to another is in each between.
 */
export function treeSize(kind: TreeKind): TreeSize {
  let size = sizes.get(kind);
  if (!size) {
    const { trunk, crown } = treeShape(kind);
    let top = 0,
      radius = 0;
    for (const m of [trunk, crown]) {
      for (let i = 0; i < m.positions.length; i += 3) {
        top = Math.max(top, m.positions[i + 2]);
        radius = Math.max(radius, Math.hypot(m.positions[i], m.positions[i + 1]));
      }
    }
    const profile = new Array<number>(TREE_BANDS).fill(0);
    const band = (z: number) => Math.min(TREE_BANDS - 1, Math.max(0, Math.floor((z / top) * TREE_BANDS)));
    for (const m of [trunk, crown]) {
      const p = m.positions;
      for (let i = 0; i < m.indices.length; i += 3) {
        const at = [m.indices[i] * 3, m.indices[i + 1] * 3, m.indices[i + 2] * 3];
        const z = at.map((a) => p[a + 2]);
        const widest = Math.max(...at.map((a) => Math.hypot(p[a], p[a + 1])));
        for (let b = band(Math.min(...z)); b <= band(Math.max(...z)); b++) profile[b] = Math.max(profile[b], widest);
      }
    }
    size = { top, radius, profile };
    sizes.set(kind, size);
  }
  return size;
}

/** The shape of a kind of tree, its foot at the origin and its size that of a tree of scale one. */
export function treeShape(kind: TreeKind): TreeShape {
  switch (kind) {
    case 'broadleaf':
      return broadleaf();
    case 'pine':
      return pine();
    case 'poplar':
      return poplar();
    case 'palm':
      return palm();
    case 'bush':
      return bush();
  }
}

const trunks = new Map<TreeKind, number>();

/**
 * How wide a kind of tree's trunk is at its foot, a radius at scale one, measured from its shape like `treeSize`, so a
 * charred pole that stands where the tree stood is sized by the trunk it replaces and the number is said nowhere else.
 * Measured once a kind: a map of five.
 */
export function trunkRadius(kind: TreeKind): number {
  let radius = trunks.get(kind);
  if (radius === undefined) {
    const { positions } = treeShape(kind).trunk;
    let foot = Infinity;
    for (let i = 2; i < positions.length; i += 3) foot = Math.min(foot, positions[i]);
    radius = 0;
    // the lowest ring of the trunk, and the rings within a hand of it, since a tube's first ring is at the foot
    for (let i = 0; i < positions.length; i += 3)
      if (positions[i + 2] < foot + 0.3) radius = Math.max(radius, Math.hypot(positions[i], positions[i + 1]));
    trunks.set(kind, radius);
  }
  return radius;
}

/**
 * A charred pole of height one, radius one at its foot and `CHARRED.top` of that at its tip, closed at both ends: what
 * a tree on a burnt patch is drawn as, sized per tree by its placement, so every tree is the one mesh instanced.
 */
export const CHARRED = { sides: 7, top: 0.55 };
export function charredPole(): Mesh {
  return sweep(upright(1), {
    profile: circle(1, CHARRED.sides),
    taper: (t) => 1 + (CHARRED.top - 1) * t,
    caps: true,
    up: [0, 1, 0],
  });
}

/* ------------------------------------------------------------------ the parcel and the beacon */

/** The parcel's size, said once: the crate the scene draws, and what it sits on and hangs under. */
export const CRATE = { side: 1.5, height: 1.1, strap: 0.2 };

/** The parcel: a wooden crate standing on z = 0, and the two straps round it, a hair proud of it so they show. */
export function crate(): { wood: Mesh; straps: Mesh } {
  const { side, height, strap } = CRATE;
  const proud = 0.03;
  return {
    wood: box(side, side, height),
    straps: join([box(side + proud, strap, height + proud), box(strap, side + proud, height + proud)]),
  };
}

/**
 * A ring to fly through: a tube of `thickness` round a circle of `radius` about its middle, standing upright in the
 * y–z plane, so that it faces along x and is turned to face its way by a yaw alone.
 */
export function ring(radius: number, thickness: number): Mesh {
  const path: Vec3[] = [];
  for (let k = 0; k <= RING_SEGMENTS; k++) {
    const a = (k / RING_SEGMENTS) * Math.PI * 2;
    path.push([0, Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return tube(path, thickness, RING_SIDES);
}

/** How finely a ring is made: round enough at the size it is seen, and no finer. */
const RING_SEGMENTS = 48,
  RING_SIDES = 12;

/** The beacon over a pad that is wanted: a tall square column standing on z = 0, seen from across the island. */
export function beacon(width: number, height: number): Mesh {
  return box(width, width, height);
}

/* ------------------------------------------------------------------ the pads */

/**
 * A round landing pad: a slab standing from z = 0 to `thickness`, its top
 * edge rounded so it catches the light, and a little wider at the foot, as
 * poured concrete is.
 */
export function padSlab(radius: number, thickness: number): Mesh {
  const rim = Math.min(thickness * 0.4, 0.14);
  const sil = roundCorners(
    {
      points: [
        [0, 0],
        [radius + 0.12, 0],
        [radius, thickness],
        [0, thickness],
      ],
      sharp: [false, true, false, false],
    },
    rim,
  );
  return revolve(sil, { segments: 40 });
}

/**
 * The paint on a pad: a ring near its rim and a big H, thin and flat, from
 * z = 0.02 to 0.03. It is placed at the pad's top, so it lies a hair above
 * the slab and does not fight it for the depth. The H's bars run along X, so
 * a helicopter landing at the pad's yaw comes down along them and reads it
 * upright, as a pilot does a real one.
 */
export function padMarking(radius: number): Mesh {
  const lo = 0.02,
    hi = 0.03;
  const outer = radius * 0.9,
    inner = radius * 0.82;
  const ring = revolve(
    {
      points: [
        [outer, lo],
        [outer, hi],
        [inner, hi],
        [inner, lo],
      ],
      sharp: [true, true, true, true],
    },
    { segments: 40 },
  );
  const b = new MeshBuilder();
  const h = radius * 0.5;
  const bar = radius * 0.14;
  const gap = radius * 0.24;
  boxAt(b, 0, -(gap + bar / 2), (lo + hi) / 2, 2 * h, bar, hi - lo);
  boxAt(b, 0, gap + bar / 2, (lo + hi) / 2, 2 * h, bar, hi - lo);
  boxAt(b, 0, 0, (lo + hi) / 2, bar, 2 * gap, hi - lo);
  return join([ring, b.build()]);
}
