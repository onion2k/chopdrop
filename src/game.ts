/**
 * The game itself, without the picture or the page: for now the walled
 * floor and the clock, a step at a time, and nothing on the floor.
 *
 * It is kept apart from the page from the start, so the same game runs in
 * the page and in Node, and what the tests try is what is played. Chance is
 * handed in here before anything uses it, so that the first thing that does
 * is seeded from its first line.
 */
import { buildRock } from './arena';
import type { Random } from './random';

export interface GameOptions {
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
}

export class Game {
  /** The rock, one byte a tile: what the page draws the walls from. */
  readonly solid = buildRock();
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;

  constructor(options: GameOptions = {}) {
    this.random = options.random ?? Math.random;
  }

  /** One frame of `dt` seconds. */
  step(dt: number) {
    this.t += dt;
  }
}
