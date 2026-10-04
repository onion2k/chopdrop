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
 *
 * The tank is the helicopter's: it is filled by the bucket, put out and let down into open water, and emptied by a drop
 * over a burning patch in the middle of whatever else is going; the drop is a pour of a second or so, putting out what is
 * under it as it goes. A fire level is one begun by coming to the fire with the bucket out. The bucket is out or in as the
 * player has set it, whatever level is going, and nothing begun or ended changes it. The fires burn at their start until
 * their level is begun, spread while it is going, and are lit again by their own rule once they are left.
 */
import {
  COLLECTIBLES,
  FIRES,
  LEVELS,
  PACKAGES,
  STRUCTURES,
  TREE_GIVE,
  TREE_KINDS,
  theIsland,
  type FirePlace,
} from './arena';
import { bucketAt, bucketInWater, type BucketPose } from './bucket';
import { Canopy } from './canopy';
import { Collection } from './collection';
import { Finds } from './finds';
import { Fire, treesOnPatches, type PatchTrees } from './fire';
import { HELICOPTER, HOVER_OVER_WATER, Helicopter, IDLE, type Controls } from './helicopter';
import { TREE_STRIDE, type Island } from './island';
import { treeSize } from './meshes';
import {
  BOARD_BESIDE,
  Mission,
  WINCH_MIDDLE,
  fireOf,
  loadFor,
  onPad,
  type Board,
  type Gate,
  type Level,
  type MissionEvents,
  type Point3,
  type Ring,
  type Winch,
} from './mission';
import { Progress } from './progress';
import type { Random } from './random';
import { Solids, type Block } from './solids';
import { Starts } from './starts';
import { Sway, flightLean } from './sway';
import { DROP, NO_WATER, OpenWater, Tank, Waters, openWaterOf, watersOf } from './water';

/**
 * What the game tells the page as it happens, so the page can put it into words: a level begun or abandoned, a parcel
 * loaded and delivered, a level done, by its name, with the time it took and whether that is the best time on it yet,
 * a structure collected and a package found; and the water: a tank scooped full, a drop begun over a fire and the end of
 * its pour with how many patches it put out, and a fire out.
 */
export interface GameEvents extends Omit<MissionEvents, 'finished'> {
  finished?(level: string, seconds: number, best: boolean): void;
  /** A structure collected for the first time: its name, how many are collected now, and of how many there are. */
  collected?(id: string, n: number, of: number): void;
  /** A hidden package found for the first time: its name, how many are found now, and of how many there are. */
  found?(id: string, n: number, of: number): void;
}

/** The last level done: which, how long it took, and whether that was the best time on it yet. */
export interface LastLevel {
  id: string;
  seconds: number;
  best: boolean;
}

/**
 * Who is being winched up and how far, as the page draws it and the words say it: the level whose person it is (null
 * when nobody is), what the words call them, and the winch's share of its hold run so far, 0 to 1.
 */
export interface WinchState {
  spot: string | null;
  who: string;
  share: number;
}

/** Who is climbing aboard and how far, as the winch's is told: the level whose person it is, what the words call them, and the share of the boarding's hold run so far. */
export type BoardState = WinchState;

/** How far back from its first opening a helicopter put at a level's start hovers, on the opening's axis. */
export const START_BACK = 30;

/** How little of a pour is left to be the end of it: a hair, since a pour is not a whole number of steps of any size. */
const POUR_END = 1e-9;

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
  /** The fires, by the places they burn; the arena's unless told otherwise. A level that puts one out is in `levels`. */
  fires?: readonly FirePlace[];
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
   * The treetops, as what a flight keeps over (the autopilot reads it): each kind's height and spread as it is drawn, and
   * the lean the flight has always allowed it. Built once with the island.
   */
  readonly canopy: Canopy;
  /**
   * The crowns as what the camera keeps out of: each as it stands, at rest where it was planted and leaned as far as the
   * sway has it where the wash is bowing it, with how far each kind spreads at each height. Built once with the island.
   */
  readonly crown: Canopy;
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
  /** The hidden packages found, by landing near them, whatever is going, and the radar that hears the rest. */
  readonly finds: Finds;
  /** What the helicopter cannot fly into: what stands on the island, and the rings that are drawn. */
  readonly solids: Solids;
  /** The water in the helicopter's tank: filled by the bucket in open water, dropped on a fire, whatever level is going. It is the helicopter's, so no level takes it away. */
  readonly tank = new Tank();
  /** Where the open water is: the lakes and the sea, never a river. */
  readonly water: OpenWater;
  /** Every water the helicopter holds a hover over: the open water, and the rivers too. */
  readonly waters: Waters;
  /** The fires, in the order of their places: each burning at its start until its level is begun. */
  readonly fires: readonly Fire[];
  /**
   * The seconds left of the pour a drop has begun, from `DROP.pour` down to 0 with none going. The helicopter's, like the
   * tank: a level begun, finished or given up does not change it, and nor does anything the player does.
   */
  pour = 0;
  /** The trees on every fire's patches, found once at boot: which the page draws burnt while their patch burns or is out. */
  readonly patchTrees: PatchTrees;
  /** The last level done, for the toast and the invariants; null until one is. */
  last: LastLevel | null = null;
  /** The fires by their ids, so that asking for one each frame makes nothing. Built once. */
  private readonly fireIds = new Map<string, Fire>();
  /** What `bucket` says, written in place so that reading it each frame makes nothing. */
  private readonly bucketPose: BucketPose = { out: false, hung: false, full: false, line: 0, bottom: 0 };
  /** Whether the player has put the bucket out. It starts in, and only `setBucket` changes it. */
  private bucketOut = false;
  /** Where to land beside a person, written in place by `landingBeside`, so choosing it makes nothing. */
  private readonly beside: Point3 = { x: 0, y: 0, z: 0 };
  /** The fire a pour going began over, by its id, and how many patches it has put out so far in all; read when it ends. */
  private pouringOn = '';
  private pouredOut = 0;
  /** The nearest open water to the helicopter, written in place by `nearestWater`, so reading it each frame makes nothing. */
  private readonly watered: Point3 = { x: 0, y: 0, z: 0 };
  /** A burning patch's place, written in place by `nearestFire`, so reading it each frame makes nothing. */
  private readonly burningAt: Point3 = { x: 0, y: 0, z: 0 };
  /** What `winch` says, written in place so that reading it each frame makes nothing. */
  private readonly winching: WinchState = { spot: null, who: '', share: 0 };
  /** What `board` says, written in place likewise. */
  private readonly boarding: BoardState = { spot: null, who: '', share: 0 };
  /** The level the HUD shows the way to the start of, until any level begins; null for none. */
  guided: Level | null = null;
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;
  /** Who is told what happens, if anyone. */
  private readonly events: GameEvents;
  /** The height of the ground, bound once, which a drop is measured over. */
  private readonly groundAt: (x: number, y: number) => number;
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
    // the grid reads itself through `this`, so it is bound once here and not each time the helicopter asks the height
    const heightAt = ground.heightAt.bind(ground);
    this.groundAt = heightAt;
    this.water = openWaterOf(this.island);
    this.waters = watersOf(this.island);
    const waters = this.waters;
    this.helicopter = new Helicopter(
      { bounds, heightAt, surfaceAt: (x, y) => waters.surfaceAt(x, y) },
      pads[0],
      this.solids,
    );
    const { trees, treeCount } = this.island;
    const give = TREE_KINDS.map((kind) => TREE_GIVE[kind]);
    const top = TREE_KINDS.map((kind) => treeSize(kind).top);
    this.sway = new Sway({ trees, stride: TREE_STRIDE, count: treeCount, bounds, give, top });
    const grid = { trees, stride: TREE_STRIDE, count: treeCount, bounds };
    const sizes = TREE_KINDS.map((kind) => treeSize(kind));
    // the camera and the pilot keep over the crowns as they were built, whole, and not over the bare poles the trees on a
    // burning or burnt patch are drawn as: a little higher than they need to be over a fire, and out of scope for now
    this.canopy = new Canopy(
      grid,
      sizes.map(({ top, radius }, k) => ({ top, radius, lean: flightLean(give[k]) })),
    );
    this.crown = new Canopy(
      grid,
      sizes.map((size) => ({ ...size, lean: 0 })),
      this.sway,
    );
    this.fires = (options.fires ?? FIRES).map((place) => new Fire(place));
    this.patchTrees = treesOnPatches(
      this.fires.map((f) => f.place),
      grid,
    );
    for (const fire of this.fires) this.fireIds.set(fire.id, fire);
    const fireIds = this.fireIds;
    // what the mission and the starts read of the fires, one watch for both
    const watch = {
      burning: (id: string) => fireIds.get(id)?.burning ?? 0,
      nearest: (id: string, x: number, y: number, out: Point3) => fireIds.get(id)?.nearestBurning(x, y, out) ?? false,
    };
    this.starts = new Starts(pads, this.levels, heightAt, watch);
    this.progress = options.progress ?? new Progress();
    this.collection = new Collection(COLLECTIBLES, this.progress);
    this.finds = new Finds(PACKAGES, this.progress);
    const events = options.events ?? {};
    this.events = events;
    this.mission = new Mission(
      pads,
      {
        started: events.started,
        abandoned: events.abandoned,
        loaded: events.loaded,
        delivered: events.delivered,
        passed: events.passed,
        through: events.through,
        landed: events.landed,
        winched: events.winched,
        boarded: events.boarded,
        fireOut: events.fireOut,
        // the time kept before it is told, so what is told is what is kept; a level that ended as it began, which has no
        // time, is not timed. Then nothing begins from the pad it ended on until the helicopter has lifted off
        finished: (seconds) => {
          const { id } = this.mission.level!;
          const fire = this.fireGoing() ?? '';
          const best = seconds > 0 && this.progress.record(id, seconds);
          if (best) this.progress.persist();
          this.last = { id, seconds, best };
          events.finished?.(id, seconds, best);
          this.starts.reset();
          this.starts.blocked = this.padUnder();
          // and nothing begins from the fire it put out while the helicopter stays there with the bucket out
          this.starts.spent = fire;
          this.holdRings(null);
        },
      },
      heightAt,
      watch,
    );
  }

  /**
   * Who is being winched up now: with nothing going, the person of the rescue whose window the helicopter is holding, by
   * the starts' loader; with a winch the step being done, by the mission's. Nobody when no winch is running, and
   * not for a pad's load. Written in place, and the same object each time.
   */
  get winch(): Readonly<WinchState> {
    const w = this.winching;
    const step = this.mission.current;
    let level: Level | null = null;
    let first: Winch | undefined;
    let loading = 0;
    if (step) {
      if (step.kind === 'winch') {
        level = this.mission.level;
        first = step;
        loading = this.mission.loading;
      }
    } else if (this.starts.winching) {
      level = this.starts.winching;
      first = level.steps[0] as Winch;
      loading = this.starts.loading;
    }
    if (!level || !first || !(loading > 0)) {
      w.spot = null;
      w.who = '';
      w.share = 0;
    } else {
      w.spot = level.id;
      w.who = first.who;
      w.share = Math.min(1, loading / loadFor(first));
    }
    return w;
  }

  /**
   * Who is climbing aboard now, as `winch` says who is winched: with nothing going, the person of the rescue whose reach
   * the helicopter is landed in, by the starts' loader; with a boarding the step being done, by the mission's. Nobody
   * when none is running. Written in place, and the same object each time.
   */
  get board(): Readonly<BoardState> {
    const w = this.boarding;
    const step = this.mission.current;
    let level: Level | null = null;
    let first: Board | undefined;
    let loading = 0;
    if (step) {
      if (step.kind === 'board') {
        level = this.mission.level;
        first = step;
        loading = this.mission.loading;
      }
    } else if (this.starts.boarding) {
      level = this.starts.boarding;
      first = level.steps[0] as Board;
      loading = this.starts.loading;
    }
    if (!level || !first || !(loading > 0)) {
      w.spot = null;
      w.who = '';
      w.share = 0;
    } else {
      w.spot = level.id;
      w.who = first.who;
      w.share = Math.min(1, loading / loadFor(first));
    }
    return w;
  }

  /**
   * The bucket under the helicopter: whether the player has it out, whether it is in use (out, or holding water), whether it
   * hangs (out, and with room), how long its line is and where its bottom is, where it hangs or would, which a drop falls
   * from. A read for the page and the test API, so the scene, the badge and the spray agree. Written in place, the same
   * object each time.
   */
  get bucket(): Readonly<BucketPose> {
    const h = this.helicopter;
    const b = this.bucketPose;
    b.out = this.bucketOut;
    b.full = this.tank.full;
    // where it hangs, or would: a drop is told as the tank is emptied, and falls from here
    bucketAt(h, this.groundAt(h.x, h.y), this.water.surfaceAt(h.x, h.y) !== NO_WATER, b);
    if (!this.bucketOut) b.hung = false;
    return b;
  }

  /** The bucket put out (true) or taken in (false). A full bucket taken in keeps its water; a half filled one starts again. */
  setBucket(out: boolean): void {
    this.bucketOut = out;
  }

  /** The bucket put out if it is in, and taken in if it is out. */
  toggleBucket(): void {
    this.bucketOut = !this.bucketOut;
  }

  /**
   * Whether the bucket is in open water: out, hanging, and its bottom under the surface of a lake or the sea under the
   * helicopter, never a river's. The one rule the fill and the rules read, by the bucket's own hanging.
   */
  private dipped(): boolean {
    if (!this.bucketOut) return false;
    const h = this.helicopter;
    const pose = this.bucket;
    return pose.hung && bucketInWater(pose.bottom, this.water.surfaceAt(h.x, h.y));
  }

  /**
   * Where to set down beside `person`, written into `out`: `BOARD_BESIDE` from them in whichever of eight directions
   * has the flattest ground, level with theirs, and the lowest crowns, the first of those that tie. Makes nothing.
   */
  landingBeside(person: Readonly<Pick<Board, 'x' | 'y' | 'z'>>, out: Point3): Point3 {
    let best = Infinity;
    for (let k = 0; k < 8; k++) {
      const x = person.x + BOARD_BESIDE * Math.cos((k * Math.PI) / 4),
        y = person.y + BOARD_BESIDE * Math.sin((k * Math.PI) / 4);
      const ground = this.groundAt(x, y);
      const cost = Math.abs(ground - person.z) + Math.max(0, this.canopy.heightAt(x, y) - ground);
      if (cost >= best) continue;
      best = cost;
      out.x = x;
      out.y = y;
      out.z = ground;
    }
    return out;
  }

  /** The fire named `id`; a name the game does not have is refused. */
  fire(id: string): Fire {
    const fire = this.fireIds.get(id);
    if (!fire) throw new Error(`no such fire: ${id}`);
    return fire;
  }

  /**
   * Where the nearest open water is, from where the helicopter is, at its level: what the arrow points to while the tank
   * is empty. Written in place and the same object each time; where there is none, the helicopter's own place.
   */
  nearestWater(): Readonly<Point3> {
    const h = this.helicopter;
    const w = this.watered;
    if (!this.water.nearest(h.x, h.y, w)) {
      w.x = h.x;
      w.y = h.y;
      w.z = h.z;
    }
    return w;
  }

  /**
   * The fire with a patch burning nearest the helicopter, the one the arrow and the words are for while the bucket is out
   * and nothing else is going; null with every fire out. A read for the page: it makes nothing.
   */
  nearestFire(): Fire | null {
    const h = this.helicopter;
    let least = Infinity;
    let nearest: Fire | null = null;
    for (const fire of this.fires) {
      if (!fire.nearestBurning(h.x, h.y, this.burningAt)) continue;
      const d = Math.hypot(this.burningAt.x - h.x, this.burningAt.y - h.y);
      if (d < least) {
        least = d;
        nearest = fire;
      }
    }
    return nearest;
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
   * begin again at once, and a fire's level given up by it does not either. Nothing to do with nothing going.
   */
  abandon(): void {
    if (!this.mission.level) return;
    const fire = this.fireGoing() ?? '';
    this.mission.abandon();
    this.holdRings(null);
    this.starts.reset();
    this.starts.blocked = this.padUnder();
    // a fire given up with the helicopter by it and the bucket out is not begun again at once
    this.starts.spent = fire;
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
   * the pickup pad of a delivery, which then loads and begins as the helicopter is stepped; hovering in the middle of
   * the window over the person of a rescue, which holding begins; hovering `START_BACK` back on the axis of a ring or an
   * opening, its middle at the opening's height and facing it; landed beside the person of a rescue by landing, which
   * staying begins; hovering at the hover over the start of the run of a fire, ready to put the bucket out and into the
   * water, since a fire is begun by coming to it with the bucket out, which its run is too far off for.
   */
  moveToStart(id: string): void {
    const level = this.named(id);
    this.mission.abandon();
    this.holdRings(null);
    const first = level.steps[0];
    if (first.kind === 'ring' || first.kind === 'gate') this.hoverBefore(first);
    else if (first.kind === 'arrive') {
      // with the tank to fill first: at the hover over the start of the fire's run, ready to put the bucket into the water
      const { from, to, z } = this.fire(first.fire).place.run;
      this.helicopter.place(from.x, from.y, z + HOVER_OVER_WATER, Math.atan2(to.y - from.y, to.x - from.x));
    } else if (first.kind === 'board') {
      // landed beside the person, which staying begins the level from
      const at = this.landingBeside(first, this.beside);
      this.helicopter.place(at.x, at.y, at.z, 0);
    } else if (first.kind === 'winch') {
      // in the middle of the window over the person, which holding it begins the level from
      this.helicopter.placeAbove(first.x, first.y, WINCH_MIDDLE, 0);
    } else if ('pad' in first) {
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

  /** The id of the fire the level going is about, or null with none going or a level that is not about one. Makes nothing. */
  private fireGoing(): string | null {
    const level = this.mission.level;
    if (!level) return null;
    for (const step of level.steps) {
      const id = fireOf(step);
      if (id !== null) return id;
    }
    return null;
  }

  /**
   * The drop begun and the pour that follows it, one step: with no pour going, the bucket out and the tank full, a drop
   * starts over the first fire with a burning patch under the helicopter by the drop's rule, which empties the tank at once
   * and tells it; and with a pour going, begun now or before, every burning patch of any fire within the splash of the
   * helicopter's middle is put out, and at the end of the pour it is told with how many that was in all. The pour is
   * not cut short by anything the helicopter or the player does, and a second drop cannot start in the middle of it.
   * Makes nothing.
   */
  private drop(dt: number): void {
    const h = this.helicopter;
    if (this.pour === 0) {
      if (!this.tank.full || !this.bucketOut) return;
      let over: Fire | null = null;
      for (const fire of this.fires)
        if (fire.dropReaches(h, this.groundAt)) {
          over = fire;
          break;
        }
      if (!over) return;
      this.tank.drop();
      this.pour = DROP.pour;
      this.pouringOn = over.id;
      this.pouredOut = 0;
      this.events.dropped?.(over.id);
    }
    for (const fire of this.fires) this.pouredOut += fire.douse(h.x, h.y);
    this.pour -= dt;
    // a step is a sixtieth of a second and a pour is not a whole number of them, so a hair under nothing is the end
    if (this.pour > POUR_END) return;
    this.pour = 0;
    this.events.doused?.(this.pouringOn, this.pouredOut);
  }

  /** One frame of `dt` seconds, flown so. */
  step(dt: number, controls: Readonly<Controls> = IDLE) {
    this.t += dt;
    const h = this.helicopter;
    h.step(dt, controls);
    // the trees after the helicopter, so they take the wash from where it is now
    this.sway.step(dt, h, this.t);
    // the tank, whatever is going: filled by the bucket put out and in open water as the helicopter is now, and not while
    // it pours, which has it empty from the first step to the last
    if (this.tank.step(dt, this.pour === 0 && this.dipped())) this.events.scooped?.();
    // a drop, if one falls, and the pour of one that has
    this.drop(dt);
    // the fires, after the drop: the level going spreads its own, and the rest are lit again by the rule
    const going = this.fireGoing();
    for (const fire of this.fires) fire.step(dt, fire.id === going);
    // the level going, which goes by where the helicopter has landed and what it has flown through; or, with none,
    // whether the helicopter has just done the first step of one, with the bucket out if it is a fire it has come to,
    // which sees the fires as the pour left them. A level begun on a step is not stepped on it, as none is: its clock
    // starts with the next
    if (this.mission.level) this.mission.step(dt, h);
    else {
      const level = this.starts.step(dt, h, this.bucketOut);
      if (level) this.beginLevel(level);
    }
    // every step, whatever is going, after the level or the starts: a structure is collected by what was just flown
    const found = this.collection.step(this.helicopter);
    if (found) {
      this.progress.persist();
      this.events.collected?.(found.id, this.collection.count, COLLECTIBLES.length);
    }
    // after the collection, and whatever is going: a package is found by where the helicopter has just landed
    const place = this.finds.step(this.helicopter, dt);
    if (place) {
      this.progress.persist();
      this.events.found?.(place.id, this.finds.count, PACKAGES.length);
    }
  }
}
