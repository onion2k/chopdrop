/**
 * The few shapes the arena is made of, built flat-shaded on purpose: a box,
 * a low-poly ball, a square, a disc. Cartoon geometry wants hard edges, so
 * faces do not share vertices and every normal is a face's.
 *
 * Everything is in world units and Z is up, as the renderer has it.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';

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

function tri(b: MeshBuilder, p0: V3, p1: V3, p2: V3) {
  const ux = p1[0] - p0[0],
    uy = p1[1] - p0[1],
    uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0],
    vy = p2[1] - p0[1],
    vz = p2[2] - p0[2];
  let nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const a = b.vertex(p0[0], p0[1], p0[2], nx, ny, nz, 0, 0);
  b.vertex(p1[0], p1[1], p1[2], nx, ny, nz, 1, 0);
  b.vertex(p2[0], p2[1], p2[2], nx, ny, nz, 0.5, 1);
  b.triangle(a, a + 1, a + 2);
}

/** A box `w` along X, `d` along Y and `h` up Z, centred in X and Y and standing on z = 0, or centred in Z too. */
export function box(w: number, d: number, h: number, centred = false): Mesh {
  const b = new MeshBuilder();
  const x = w / 2,
    y = d / 2,
    z0 = centred ? -h / 2 : 0,
    z1 = z0 + h;
  face(b, [-x, -y, z1], [x, -y, z1], [x, y, z1], [-x, y, z1]);
  face(b, [-x, y, z0], [x, y, z0], [x, -y, z0], [-x, -y, z0]);
  face(b, [-x, -y, z0], [x, -y, z0], [x, -y, z1], [-x, -y, z1]);
  face(b, [x, y, z0], [-x, y, z0], [-x, y, z1], [x, y, z1]);
  face(b, [x, -y, z0], [x, y, z0], [x, y, z1], [x, -y, z1]);
  face(b, [-x, y, z0], [-x, -y, z0], [-x, -y, z1], [-x, y, z1]);
  return b.build();
}

/** A low-poly ball, centred. */
export function ball(radius: number, rings = 6, segments = 10): Mesh {
  const b = new MeshBuilder();
  const at = (i: number, j: number): V3 => {
    const phi = (i / rings) * Math.PI,
      th = (j / segments) * Math.PI * 2;
    return [Math.sin(phi) * Math.cos(th) * radius, Math.sin(phi) * Math.sin(th) * radius, Math.cos(phi) * radius];
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      if (i === 0) tri(b, at(0, 0), at(1, j), at(1, j + 1));
      else if (i === rings - 1) tri(b, at(rings, 0), at(i, j + 1), at(i, j));
      else face(b, at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  return b.build();
}

/** A flat unit square at z = 0, facing up, centred: stretched to size where it is placed. */
export function square(): Mesh {
  const b = new MeshBuilder();
  face(b, [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]);
  return b.build();
}

/** A flat disc at z = 0, facing up. */
export function disc(radius: number, segments = 24): Mesh {
  const b = new MeshBuilder();
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2,
      a1 = ((i + 1) / segments) * Math.PI * 2;
    tri(
      b,
      [0, 0, 0],
      [Math.cos(a0) * radius, Math.sin(a0) * radius, 0],
      [Math.cos(a1) * radius, Math.sin(a1) * radius, 0],
    );
  }
  return b.build();
}
