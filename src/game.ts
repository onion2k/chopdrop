/**
 * The game itself, without the picture or the page: the island, the
 * helicopter flying over it, the level going if there is one, what begins a
 * level, the player's best times and the clock, a step at a time.
 *
 * The game opens flying free, landed on the home pad with nothing going. A
 * level begins when the helicopter does its first step: that is `starts.ts`,
 * stepped while nothing is going. One level goes at a time, and when it ends
 * its time is kept and nothing is going again.
 *
 * It is kept apart from the page, so the same game runs in the page and in
 * Node, and what the tests try is what is played. Chance is handed in here
 * before anything uses it, so that the first thing that does is seeded from
 * its first line.
 */
import { COLLECTIBLES, LEVELS, STRUCTURES, TREE_GIVE, TREE_KINDS, theIsland } from './arena';
import { Canopy } from './canopy';
import { Collection } from './collection';
import { HELICOPTER, Helicopter, IDLE, type Controls } from './helicopter';
import { TREE_STRIDE, type Island } from './island';
import { treeSize } from './meshes';
import { Mission, onPad, type Gate, type Level, type MissionEvents, type Ring } from './mission';
import { Progress } from './progress';
import type { Random } from './random';
import { Solids, type Block } from './solids';
import { Starts } from './starts';
import { Sway, reachedLean } from './sway';

/**
 * What the game tells the page as it happens, so the page can put it into words: a level begun or abandoned, a parcel
 * loaded and delivered, a level done, by its name, with the time it took and whether that is the best time on it yet,
 * and a structure collected.
 */
export interface GameEvents extends Omit<MissionEvents, 'finished'> {
  finished?(level: string, seconds: number, best: boolean): void;
  /** A structure collected for the first time: its name, how many are collected now, and of how many there are. */
  collected?(id: string, n: number, of: number): void;
}

/** The last level done: which, how long it took, and whether that was the best time on it yet. */
export interface LastLevel {
  id: string;
  seconds: number;
  best: boolean;
}

/** How far back from its first opening a helicopter put at a level's start hovers, on the opening's axis. */
export const START_BACK = 30;

export interface GameOptions {
  /** What happens, told as it does; nothing is told unless something is listening. */
  events?: GameEvents;
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
  /** The land to fly over; the one island unless told otherwise. */
  island?: Island;
  /** The levels, in order; the arena's unless told otherwise. */
  levels?: readonly Level[];
  /** What stands on the island in every level, solid: the arena's unless told otherwise. */
  structures?: readonly Block[];
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
  /** The levels, in order, as the panel shows them. */
  readonly levels: readonly Level[];
  /** The level going and how far it has got, or nothing going: the game starts flying free. */
  readonly mission: Mission;
  /** What begins a level while nothing is going: a crate loaded, or a start ring or opening flown through. */
  readonly starts: Starts;
  /** The player's best time on each level, and the structures collected, kept as each is done. */
  readonly progress: Progress;
  /** The structures collected, by flying through their openings, whatever is going. */
  readonly collection: Collection;
  /** What the helicopter cannot fly into: what stands on the island, and the rings that are drawn. */
  readonly solids: Solids;
  /** The last level done, for the toast and the invariants; null until one is. */
  last: LastLevel | null = null;
  /** The level the HUD shows the way to the start of, until any level begins; null for none. */
  guided: Level | null = null;
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;
  /** Who is told what happens, if anyone. */
  private readonly events: GameEvents;
  /** The first ring of every level that begins at a ring: what is solid with nothing going. Built once. */
  private readonly startRings: Ring[];

  constructor(options: GameOptions = {}) {
    this.random = options.random ?? Math.random;
    this.island = options.island ?? theIsland();
    const { ground, bounds, pads } = this.island;
    this.levels = options.levels ?? LEVELS;
    const { middle, rotorRadius } = HELICOPTER.size;
    this.solids = new Solids({ middle, radius: rotorRadius }, options.structures ?? STRUCTURES);
    this.startRings = this.levels.flatMap((level) => (level.steps[0].kind === 'ring' ? [level.steps[0]] : []));
    this.solids.set(this.startRings);
    this.starts = new Starts(pads, this.levels);
    // the grid reads itself through `this`, so it is bound once here and not each time the helicopter asks the height
    this.helicopter = new Helicopter({ bounds, heightAt: ground.heightAt.bind(ground) }, pads[0], this.solids);
    const { trees, treeCount } = this.island;
    const give = TREE_KINDS.map((kind) => TREE_GIVE[kind]);
    this.sway = new Sway({ trees, stride: TREE_STRIDE, count: treeCount, bounds, give });
    this.canopy = new Canopy(
      { trees, stride: TREE_STRIDE, count: treeCount, bounds },
      TREE_KINDS.map((kind, k) => ({ ...treeSize(kind), lean: reachedLean(give[k]) })),
    );
    this.progress = options.progress ?? new Progress();
    this.collection = new Collection(COLLECTIBLES, this.progress);
    const events = options.events ?? {};
    this.events = events;
    this.mission = new Mission(pads, {
      started: events.started,
      abandoned: events.abandoned,
      loaded: events.loaded,
      delivered: events.delivered,
      passed: events.passed,
      through: events.through,
      landed: events.landed,
      // the time kept before it is told, so what is told is what is kept; a level that ended as it began, which has no
      // time, is not timed. Then nothing begins from the pad it ended on until the helicopter has lifted off
      finished: (seconds) => {
        const { id } = this.mission.level!;
        const best = seconds > 0 && this.progress.record(id, seconds);
        if (best) this.progress.persist();
        this.last = { id, seconds, best };
        events.finished?.(id, seconds, best);
        this.starts.reset();
        this.starts.blocked = this.padUnder();
        this.holdRings(null);
      },
    });
  }

  /** The level named `id`; a name the game does not have is refused. */
  private named(id: string): Level {
    const level = this.levels.find((l) => l.id === id);
    if (!level) throw new Error(`no such level: ${id}`);
    return level;
  }

  /** The pad the helicopter is landed on, by its place in the island's list, or −1. Makes nothing. */
  private padUnder(): number {
    const { pads } = this.island;
    for (let p = 0; p < pads.length; p++) if (onPad(this.helicopter, pads[p])) return p;
    return -1;
  }

  /**
   * The rings made solid for the level going, or for nothing going: the starts of every level, and with a level going
   * its own rings in the place of its start. A level that begins at an opening that is not a ring has none to hold.
   */
  private holdRings(going: Level | null): void {
    if (!going) {
      this.solids.set(this.startRings);
      return;
    }
    const held: Ring[] = going.steps.filter((step): step is Ring => step.kind === 'ring');
    for (const other of this.levels) {
      const first = other.steps[0];
      if (other !== going && first.kind === 'ring') held.push(first);
    }
    this.solids.set(held);
  }

  /** `level` begun now: nothing guided, the starts begun again from nothing, and the rings that are solid changed to its. */
  private beginLevel(level: Level): void {
    this.guided = null;
    this.starts.reset();
    this.mission.begin(level);
    // a level of one step has ended already, and put the rings back
    this.holdRings(this.mission.level);
  }

  /** The level named `id` begun at once, wherever the helicopter is, with whatever was going abandoned; a name the game does not have is refused. */
  begin(id: string): void {
    this.beginLevel(this.named(id));
    // not in `beginLevel`, which a level begun by flying through its first opening comes by: that crossing may be a
    // structure's too, and is collected on the same step
    this.collection.reset();
  }

  /**
   * What was going given up, with no time kept: told, the rings that are solid put back to the starts, and the starts
   * begun again. A helicopter landed on a pad leaves it blocked, so a level given up on its own pickup pad does not
   * begin again at once. Nothing to do with nothing going.
   */
  abandon(): void {
    if (!this.mission.level) return;
    this.mission.abandon();
    this.holdRings(null);
    this.starts.reset();
    this.starts.blocked = this.padUnder();
  }

  /** The HUD shown the way to the start of the level named `id`, or to none; a name the game does not have is refused. */
  guide(id: string | null): void {
    this.guided = id === null ? null : this.named(id);
  }

  /** Flying free from home again: landed on the home pad facing as it does, anything going abandoned, and nothing guided. */
  home(): void {
    const home = this.island.pads[0];
    this.helicopter.place(home.x, home.y, 0, home.yaw);
    this.mission.abandon();
    this.guided = null;
    this.holdRings(null);
    this.starts.reset();
    this.collection.reset();
  }

  /**
   * The helicopter put at the start of the level named `id`, with nothing begun and anything going abandoned: landed on
   * the pickup pad of a delivery, which then loads and begins as the helicopter is stepped; hovering `START_BACK` back
   * on the axis of a ring or an opening, its middle at the opening's height and facing it.
   */
  moveToStart(id: string): void {
    const level = this.named(id);
    this.mission.abandon();
    this.holdRings(null);
    const first = level.steps[0];
    if (first.kind === 'ring' || first.kind === 'gate') this.hoverBefore(first);
    else {
      const pad = this.island.pads[first.pad];
      this.helicopter.place(pad.x, pad.y, 0, pad.yaw);
    }
    this.starts.reset();
    this.collection.reset();
  }

  /** The helicopter hovering `START_BACK` before `opening` on its axis, its middle at the opening's height, facing it. */
  private hoverBefore(opening: Ring | Gate): void {
    const [ax, ay] = [Math.cos(opening.yaw), Math.sin(opening.yaw)];
    this.helicopter.place(
      opening.x - ax * START_BACK,
      opening.y - ay * START_BACK,
      opening.z - HELICOPTER.size.middle,
      opening.yaw,
    );
  }

  /** One frame of `dt` seconds, flown so. */
  step(dt: number, controls: Readonly<Controls> = IDLE) {
    this.t += dt;
    this.helicopter.step(dt, controls);
    // the trees after the helicopter, so they take the wash from where it is now
    this.sway.step(dt, this.helicopter, this.t);
    // the level going, which goes by where the helicopter has landed and what it has flown through; or, with none,
    // whether the helicopter has just done the first step of one
    if (this.mission.level) this.mission.step(dt, this.helicopter);
    else {
      const level = this.starts.step(dt, this.helicopter);
      if (level) this.beginLevel(level);
    }
    // every step, whatever is going, after the level or the starts: a structure is collected by what was just flown
    const found = this.collection.step(this.helicopter);
    if (found) {
      this.progress.persist();
      this.events.collected?.(found.id, this.collection.count, COLLECTIBLES.length);
    }
  }
}
