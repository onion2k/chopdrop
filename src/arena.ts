/**
 * The arena: a square floor walled in by rock, a hole in the middle of it,
 * and the balls on it. Content, not logic: the game reads it and the page
 * draws it. A game of its own replaces this with its rooms, its heaps,
 * whatever it has, and the lower modules go on knowing nothing of them.
 */
import type { Random } from './random';

export const TILE = 3;
export const COLS = 24,
  ROWS = 24;
export const ORIGIN_X = -(COLS * TILE) / 2,
  ORIGIN_Y = -(ROWS * TILE) / 2;
/** How many tiles thick the rock round the floor is. */
export const WALL = 1;
export const HOLE = { x: 0, y: 0, radius: 4, depth: 12 };
/** How many balls are on the floor at any time: one banked, one dropped. */
export const BALLS = 12;
/** The most bodies the world can hold, with room past the balls for whatever a game adds. */
export const BODY_CAPACITY = 64;
/** The kinds of body there are, one radius each, and what each is called. */
export const KIND_RADIUS = [1.0];
export const KIND_NAME = ['ball'];
export const BALL = 0;
export const KINDS = KIND_RADIUS.length;

/** The floor's edge, in world units: where the rock starts. */
export const FLOOR = {
  minX: ORIGIN_X + WALL * TILE,
  minY: ORIGIN_Y + WALL * TILE,
  maxX: ORIGIN_X + (COLS - WALL) * TILE,
  maxY: ORIGIN_Y + (ROWS - WALL) * TILE,
};

/** The rock, one byte a tile, 1 where it is: the border, and nothing else. */
export function buildRock(): Uint8Array {
  const solid = new Uint8Array(COLS * ROWS);
  for (let ty = 0; ty < ROWS; ty++)
    for (let tx = 0; tx < COLS; tx++)
      if (tx < WALL || ty < WALL || tx >= COLS - WALL || ty >= ROWS - WALL) solid[ty * COLS + tx] = 1;
  return solid;
}

/** The tile a point is in, or -1 off the grid. */
export function tileAt(x: number, y: number): number {
  const tx = Math.floor((x - ORIGIN_X) / TILE),
    ty = Math.floor((y - ORIGIN_Y) / TILE);
  return tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? -1 : ty * COLS + tx;
}

/** Whether a point is on the floor: on the grid and not in the rock. */
export function onFloor(solid: Uint8Array, x: number, y: number): boolean {
  const t = tileAt(x, y);
  return t >= 0 && solid[t] === 0;
}

/** How far in from the rock a ball is dropped: room for the sled to get behind it. */
export const DROP_MARGIN = 7;

/** Somewhere to drop a ball: on the floor, well clear of the rock, and clear of the hole's rim. */
export function dropPoint(random: Random): [number, number] {
  const margin = DROP_MARGIN;
  for (;;) {
    const x = FLOOR.minX + margin + random() * (FLOOR.maxX - FLOOR.minX - margin * 2);
    const y = FLOOR.minY + margin + random() * (FLOOR.maxY - FLOOR.minY - margin * 2);
    if (Math.hypot(x - HOLE.x, y - HOLE.y) > HOLE.radius + 3) return [x, y];
  }
}
