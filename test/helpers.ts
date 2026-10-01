/** What the tests share: a new game in memory, from a seed, and grounds for a helicopter to be flown over without the island. */
import { Game } from '../src/game';
import type { Ground } from '../src/helicopter';
import { seeded } from '../src/random';

export const DT = 1 / 60;

export function newGame(seed = 1) {
  return { game: new Game({ random: seeded(seed) }) };
}

/** Ground that is level at `height` over a square 200 across, big enough to fly about on and still meet its edge. */
export function flatGround(height = 0): Ground {
  return landscape(() => height);
}

/** Ground of any shape, given by its height at a point, over the same square as `flatGround`. */
export function landscape(heightAt: (x: number, y: number) => number): Ground {
  return { bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 }, heightAt };
}
