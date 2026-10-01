/**
 * The arena: a square floor walled in by rock, and nothing on it yet.
 * Content, not logic: the game reads it and the page draws it. The helicopter,
 * the deliveries and where they go are added here as they are built, and the
 * lower modules go on knowing nothing of them.
 */

export const TILE = 3;
export const COLS = 24,
  ROWS = 24;
export const ORIGIN_X = -(COLS * TILE) / 2,
  ORIGIN_Y = -(ROWS * TILE) / 2;
/** How many tiles thick the rock round the floor is. */
export const WALL = 1;

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
