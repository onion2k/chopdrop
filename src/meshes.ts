/**
 * The few shapes the game is made of, built flat-shaded on purpose: boxes, a
 * square, and the helicopter put together from boxes. Cartoon geometry
 * wants hard edges, so faces do not share vertices and every normal is a
 * face's. The ball and the disc the stub was made of went with it, and are
 * in the first commit to copy from. The helicopter's sizes are read from
 * `HELICOPTER` where it holds them, so what is drawn and what the flight
 * keeps to cannot part.
 *
 * Everything is in world units and Z is up, as the renderer has it.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
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

/** A box from its extents on each axis, which is how the helicopter's parts were drawn on the approved mock. */
function span(b: MeshBuilder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  boxAt(b, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
}

/** The cabin, tail boom, fin and stabiliser: the painted shell, in the helicopter's own frame. */
export function helicopterBody(): Mesh {
  const b = new MeshBuilder();
  span(b, -2.0, 2.4, -1.1, 1.1, 0.6, 2.6);
  span(b, -6.4, -2.0, -0.3, 0.3, 1.7, 2.3);
  span(b, -6.6, -5.8, -0.08, 0.08, 2.0, 3.6);
  span(b, -5.7, -4.9, -1.0, 1.0, 1.85, 2.05);
  return b.build();
}

/** The canopy, standing a little proud of the cabin's front so it reads as glass and not paint. */
export function helicopterGlass(): Mesh {
  const b = new MeshBuilder();
  span(b, 1.2, 2.7, -1.0, 1.0, 1.2, 2.4);
  return b.build();
}

/** The skids, their struts and the mast: the dark metal under and over the shell. */
export function helicopterDark(): Mesh {
  const b = new MeshBuilder();
  for (const side of [-1, 1]) {
    span(b, -1.8, 2.0, side - 0.075, side + 0.075, 0, 0.15);
    for (const x of [-1.0, 1.2]) span(b, x - 0.06, x + 0.06, side - 0.06, side + 0.06, 0.15, 0.6);
  }
  span(b, -0.15, 0.15, -0.15, 0.15, 2.6, HELICOPTER.size.mastTop);
  return b.build();
}

/** The main rotor, centred on its hub, which is where it is placed and spun about Z. */
export function mainRotor(): Mesh {
  const b = new MeshBuilder();
  boxAt(b, 0, 0, 0, 2 * HELICOPTER.size.rotorRadius, 0.35, 0.08);
  boxAt(b, 0, 0, 0.1, 0.4, 0.4, 0.2);
  return b.build();
}

/** The tail rotor, centred on its hub, which is where it is placed and spun about Y. */
export function tailRotor(): Mesh {
  const b = new MeshBuilder();
  boxAt(b, 0, 0, 0, 2 * HELICOPTER.size.tailRotorRadius, 0.06, 0.22);
  return b.build();
}

/** A flat unit square at z = 0, facing up, centred: stretched to size where it is placed. */
export function square(): Mesh {
  const b = new MeshBuilder();
  face(b, [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]);
  return b.build();
}
