/**
 * The game itself, without the picture or the page: the island, the
 * helicopter flying over it, the level being flown, the player's best times
 * and the clock, a step at a time.
 *
 * It is kept apart from the page, so the same game runs in the page and in
 * Node, and what the tests try is what is played. Chance is handed in here
 * before anything uses it, so that the first thing that does is seeded from
 * its first line.
 */
import { LEVELS, TREE_GIVE, TREE_KINDS, theIsland } from './arena';
import { Canopy } from './canopy';
import { Helicopter, IDLE, type Controls } from './helicopter';
import { TREE_STRIDE, type Island } from './island';
import { treeSize } from './meshes';
import { Mission, type Level, type LevelKind, type MissionEvents } from './mission';
import { Progress, type Standing } from './progress';
import type { Random } from './random';
import { Sway, reachedLean } from './sway';

/**
 * What the game tells the page as it happens, so the page can put it into words: a parcel loaded and delivered, and a
 * level done, by its name, with the time it took and whether that is the best time on it yet.
 */
export interface GameEvents extends Omit<MissionEvents, 'finished'> {
  finished?(level: string, seconds: number, best: boolean): void;
}

/** A level as the list of levels shows it: what it is, where it stands for the player, and the best time on it. */
export interface ListedLevel {
  id: string;
  name: string;
  kind: LevelKind;
  standing: Standing;
  best: number | null;
}

export interface GameOptions {
  /** What happens, told as it does; nothing is told unless something is listening. */
  events?: GameEvents;
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
  /** The land to fly over; the one island unless told otherwise. */
  island?: Island;
  /** The levels, in order; the arena's unless told otherwise. */
  levels?: readonly Level[];
  /** What the player has done, and where it is kept; a save in memory unless told otherwise, so nothing is written. */
  progress?: Progress;
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
  /** The levels, in order, as the list shows them. */
  readonly levels: readonly Level[];
  /** The level being flown, and how far it has got: the first, until another is asked for. */
  readonly mission: Mission;
  /** The player's best time on each level, kept as each is done. */
  readonly progress: Progress;
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
    this.levels = options.levels ?? LEVELS;
    this.progress = options.progress ?? new Progress();
    const events = options.events ?? {};
    this.mission = new Mission(pads, this.levels[0], {
      loaded: events.loaded,
      delivered: events.delivered,
      // the time kept before it is told, so what is told is what is kept; a level never lifted off from, which only a
      // test's teleport can finish, was not flown and is not timed
      finished: (seconds) => {
        const { id } = this.mission.level;
        const best = this.mission.started && this.progress.record(id, seconds);
        if (best) this.progress.persist();
        events.finished?.(id, seconds, best);
      },
    });
  }

  /** The level named `id` flown from the start; a name the game does not have is refused. */
  play(id: string): void {
    const level = this.levels.find((l) => l.id === id);
    if (!level) throw new Error(`no such level: ${id}`);
    this.mission.play(level);
    this.restart();
  }

  /** The level after the one being flown, or none after the last. */
  get nextLevel(): Level | undefined {
    return this.levels[this.levels.indexOf(this.mission.level) + 1];
  }

  /** Every level, as the list shows it. */
  levelList(): ListedLevel[] {
    const ids = this.levels.map((level) => level.id);
    return this.levels.map(({ id, name, kind }, k) => ({
      id,
      name,
      kind,
      standing: this.progress.standing(ids, k),
      best: this.progress.best.get(id) ?? null,
    }));
  }

  /** The level from the start again: the helicopter landed on the pad it starts from, facing as the pad does, and the first step waiting. */
  restart(): void {
    const start = this.island.pads[this.mission.level.start ?? 0];
    this.helicopter.place(start.x, start.y, 0, start.yaw);
    this.mission.reset();
  }

  /** One frame of `dt` seconds, flown so. */
  step(dt: number, controls: Readonly<Controls> = IDLE) {
    this.t += dt;
    this.helicopter.step(dt, controls);
    // the trees after the helicopter, so they take the wash from where it is now
    this.sway.step(dt, this.helicopter, this.t);
    // and the level, which goes by where the helicopter has landed
    this.mission.step(dt, this.helicopter);
  }
}
