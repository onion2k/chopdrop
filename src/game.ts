/**
 * The game itself, without the picture or the page: the island, the
 * helicopter flying over it and the clock, a step at a time.
 *
 * It is kept apart from the page, so the same game runs in the page and in
 * Node, and what the tests try is what is played. Chance is handed in here
 * before anything uses it, so that the first thing that does is seeded from
 * its first line.
 */
import { TREE_GIVE, TREE_KINDS, theIsland } from './arena';
import { Canopy } from './canopy';
import { Helicopter, IDLE, type Controls } from './helicopter';
import { TREE_STRIDE, type Island } from './island';
import { treeSize } from './meshes';
import type { Random } from './random';
import { Sway, reachedLean } from './sway';

export interface GameOptions {
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
  /** The land to fly over; the one island unless told otherwise. */
  island?: Island;
}

export class Game {
  /** The land and the water, the pads and the trees: what the page draws, and what the helicopter flies over. */
  readonly island: Island;
  /** The player's machine, kept inside the world's edge, and starting landed on the home pad. */
  readonly helicopter: Helicopter;
  /** The trees the helicopter's downwash has set moving, and how each leans. */
  readonly sway: Sway;
  /**
   * The treetops, as what the camera keeps over: each kind's height and spread as it is drawn, and the most it leans
   * in the wash. Built once with the island; the game itself never reads it.
   */
  readonly canopy: Canopy;
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;

  constructor(options: GameOptions = {}) {
    this.random = options.random ?? Math.random;
    this.island = options.island ?? theIsland();
    const { ground, bounds, pads } = this.island;
    const home = pads[0];
    // the grid reads itself through `this`, so it is bound once here and not each time the helicopter asks the height
    this.helicopter = new Helicopter({ bounds, heightAt: ground.heightAt.bind(ground) }, home);
    const { trees, treeCount } = this.island;
    const give = TREE_KINDS.map((kind) => TREE_GIVE[kind]);
    this.sway = new Sway({ trees, stride: TREE_STRIDE, count: treeCount, bounds, give });
    this.canopy = new Canopy(
      { trees, stride: TREE_STRIDE, count: treeCount, bounds },
      TREE_KINDS.map((kind, k) => ({ ...treeSize(kind), lean: reachedLean(give[k]) })),
    );
  }

  /** One frame of `dt` seconds, flown so. */
  step(dt: number, controls: Readonly<Controls> = IDLE) {
    this.t += dt;
    this.helicopter.step(dt, controls);
    // the trees after the helicopter, so they take the wash from where it is now
    this.sway.step(dt, this.helicopter, this.t);
  }
}
