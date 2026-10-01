/**
 * The few shapes the arena is made of, built flat-shaded on purpose: a box
 * and a square. Cartoon geometry wants hard edges, so faces do not share
 * vertices and every normal is a face's. The ball and the disc the stub
 * was made of went with it, and are in the first commit to copy from.
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

/** A flat unit square at z = 0, facing up, centred: stretched to size where it is placed. */
export function square(): Mesh {
  const b = new MeshBuilder();
  face(b, [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]);
  return b.build();
}
