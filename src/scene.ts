/**
 * The arena as it is drawn: the floor and the rock round it, which do not
 * move. Nothing moves yet; what does gets a group of its own here, sized
 * once, with only where everything is written into it each frame. It is
 * handed what it draws from, and never the renderer.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { COLS, FLOOR, ORIGIN_X, ORIGIN_Y, ROWS, TILE } from './arena';
import { place } from './matrix';
import { box, square } from './meshes';

/** How tall the rock stands. */
const ROCK_HEIGHT = 3;

/** What does not move: the floor, and a block for every tile of rock. */
export function staticGroups(solid: Uint8Array): GameGroup[] {
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
  return [
    { mesh: square(), matrices: floor, albedo: [0.62, 0.6, 0.55], roughness: 0.9 },
    { mesh: box(TILE, TILE, ROCK_HEIGHT), matrices: rocks, albedo: [0.32, 0.3, 0.3], roughness: 0.95 },
  ];
}

/** The rock's footprint, for the sun's shadow to be fitted to. */
export const ARENA_BOX = {
  min: [ORIGIN_X, ORIGIN_Y, -1] as [number, number, number],
  max: [ORIGIN_X + COLS * TILE, ORIGIN_Y + ROWS * TILE, ROCK_HEIGHT + 2] as [number, number, number],
};
