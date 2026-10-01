/**
 * The game itself, without the picture or the page: the arena and the balls
 * on it, the sled, the hole, and the bank, a step at a time.
 *
 * What happens is told to `events`, for whoever shows it: the browser turns
 * it into words on the screen; the fuzzer and the tests leave it out, or
 * keep a note of it. Nothing here waits on anything there, so the same game
 * runs in the page and in Node, and what the tests try is what is played.
 */
import { BALL, BALLS, buildRock, dropPoint } from './arena';
import { makeWorld, type Pusher, type World } from './physics';
import { Progress } from './progress';
import type { Random } from './random';
import { Sled, type Drive } from './sled';

/** What happens, for whoever shows it. Every one may be left out. */
export interface GameEvents {
  /** A ball down the hole, from (x, y). */
  banked?(kind: number, x: number, y: number): void;
  /** A ball dropped onto the floor at (x, y), to replace one banked. */
  dropped?(kind: number, x: number, y: number): void;
}

export interface GameOptions {
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
}

export class Game {
  readonly world: World;
  readonly sled = new Sled();
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;
  private readonly pusher: Pusher = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    hx: 0,
    hy: 0,
    hz: 0,
    vx: 0,
    vy: 0,
    spin: 0,
    px: 0,
    py: 0,
    owner: 0,
  };
  private lastBank: number;

  constructor(
    readonly progress: Progress,
    private readonly events: GameEvents = {},
    options: GameOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.world = makeWorld(buildRock(), () => this.random());
    this.world.pushers = [this.pusher];
    this.lastBank = progress.bank;
    for (let k = 0; k < BALLS; k++) this.drop(false);
  }

  /** One frame of `dt` seconds, driven so. */
  step(dt: number, drive: Drive) {
    this.t += dt;
    const { sled, world } = this;
    sled.step(dt, drive);
    sled.pusher(this.pusher);
    // what is ahead of the sled wakes before the sled arrives
    if (Math.abs(sled.speed) > 0.3) world.wakeNear(sled.x + Math.cos(sled.yaw) * 3, sled.y + Math.sin(sled.yaw) * 3, 5);
    let fell = 0;
    world.step(dt, (kind, x, y) => {
      this.progress.deposit(1);
      this.events.banked?.(kind, x, y);
      fell++;
    });
    // the floor keeps its balls: one down the hole, one dropped
    for (; fell > 0; fell--) this.drop(true);
    if (this.progress.bank !== this.lastBank) this.persist();
  }

  /** A ball dropped from above onto somewhere clear, and told of if `tell`. */
  private drop(tell: boolean) {
    const [x, y] = dropPoint(this.random);
    if (this.world.spawn(BALL, x, y, 6) < 0) return;
    if (tell) this.events.dropped?.(BALL, x, y);
  }

  /** The save written now. */
  persist() {
    this.progress.persist();
    this.lastBank = this.progress.bank;
  }
}
