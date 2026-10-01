/**
 * The game itself, without the picture or the page: the walled floor, the
 * helicopter on it and the clock, a step at a time.
 *
 * It is kept apart from the page, so the same game runs in the page and in
 * Node, and what the tests try is what is played. Chance is handed in here
 * before anything uses it, so that the first thing that does is seeded from
 * its first line.
 */
import { FLOOR, buildRock } from './arena';
import { Helicopter, IDLE, type Controls } from './helicopter';
import type { Random } from './random';

export interface GameOptions {
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
}

export class Game {
  /** The rock, one byte a tile: what the page draws the walls from. */
  readonly solid = buildRock();
  /** The player's machine, kept inside the floor. */
  readonly helicopter = new Helicopter(FLOOR);
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;

  constructor(options: GameOptions = {}) {
    this.random = options.random ?? Math.random;
  }

  /** One frame of `dt` seconds, flown so. */
  step(dt: number, controls: Readonly<Controls> = IDLE) {
    this.t += dt;
    this.helicopter.step(dt, controls);
  }
}
