/**
 * The arena as it is drawn: the floor, the rock round it and the hole, which
 * do not move; and the balls and the sled, which do. The groups are fixed
 * once, and each frame only where everything is written into them. It is
 * handed what it draws from, and never the renderer.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { BODY_CAPACITY, COLS, FLOOR, HOLE, KIND_RADIUS, ORIGIN_X, ORIGIN_Y, ROWS, TILE } from './arena';
import { place } from './matrix';
import { ball, box, disc, square } from './meshes';
import type { World } from './physics';
import { SLED, type Sled } from './sled';

/** How tall the rock stands. */
const ROCK_HEIGHT = 3;

export class Scene {
  /** The moving placements, one pool a group: the balls, then the sled. */
  readonly balls = new Float32Array(BODY_CAPACITY * 16);
  readonly sled = new Float32Array(16);

  /** What does not move. */
  static(solid: Uint8Array): GameGroup[] {
    const floor = new Float32Array(16);
    place(
      floor,
      0,
      (FLOOR.minX + FLOOR.maxX) / 2,
      (FLOOR.minY + FLOOR.maxY) / 2,
      0,
      0,
      FLOOR.maxX - FLOOR.minX,
      FLOOR.maxY - FLOOR.minY,
      1,
    );
    const rock: number[] = [];
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) if (solid[ty * COLS + tx]) rock.push(tx, ty);
    const rocks = new Float32Array((rock.length / 2) * 16);
    for (let k = 0; k < rock.length; k += 2)
      place(rocks, k / 2, ORIGIN_X + (rock[k] + 0.5) * TILE, ORIGIN_Y + (rock[k + 1] + 0.5) * TILE, 0);
    const hole = new Float32Array(16);
    place(hole, 0, HOLE.x, HOLE.y, 0.02);
    return [
      { mesh: square(), matrices: floor, albedo: [0.62, 0.6, 0.55], roughness: 0.9 },
      { mesh: box(TILE, TILE, ROCK_HEIGHT), matrices: rocks, albedo: [0.32, 0.3, 0.3], roughness: 0.95 },
      { mesh: disc(HOLE.radius), matrices: hole, albedo: [0.02, 0.02, 0.02], roughness: 1 },
    ];
  }

  /** What moves: the pools, sized once. */
  dynamic(): GameGroup[] {
    return [
      { mesh: ball(KIND_RADIUS[0]), matrices: this.balls, count: 0, albedo: [0.9, 0.5, 0.2], roughness: 0.4 },
      {
        mesh: box(SLED.half[0] * 2, SLED.half[1] * 2, SLED.half[2] * 2),
        matrices: this.sled,
        albedo: [0.25, 0.45, 0.85],
        roughness: 0.5,
      },
    ];
  }

  /** Everything where it is this frame: how many balls are placed. */
  write(world: World, sled: Sled): number {
    let n = 0;
    for (let i = 0; i < world.count; i++) {
      if (!world.alive[i]) continue;
      place(this.balls, n++, world.x[i], world.y[i], world.z[i]);
    }
    place(this.sled, 0, sled.x, sled.y, 0, sled.yaw);
    return n;
  }
}

/** The rock's footprint, for the sun's shadow to be fitted to. */
export const ARENA_BOX = {
  min: [ORIGIN_X, ORIGIN_Y, -1] as [number, number, number],
  max: [ORIGIN_X + COLS * TILE, ORIGIN_Y + ROWS * TILE, ROCK_HEIGHT + 2] as [number, number, number],
};
