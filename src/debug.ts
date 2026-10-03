/**
 * `window.game`: the game, for tests and for poking at from the console.
 * Everything a test needs to set a scene, play it exactly and read back
 * what happened, so no test waits on a clock or reaches into the game's
 * insides.
 *
 * Time is the test's to keep: `pause` stops the game where it is, and
 * `step` plays it on a frame at a time, exactly, drawing the last. `seed`
 * makes chance repeat. The helicopter is flown by `fly`, which holds the
 * controls as a person would until `release`, put somewhere by `teleport`
 * and read back by `state`. The camera chases it unless `look` parks it for
 * a fixed view, the one every picture and the perf gate are taken from;
 * `chase` sends it back. The page keeps no game logic: this only hands what
 * a test asks for to the game and the camera rig.
 *
 * The trees are read by `treesNear`, which says where they stand so a test
 * can put the helicopter over them, and `sway`, which says which the
 * downwash has set moving and how each leans.
 *
 * The world is an island, and heights are metres above the sea unless the
 * name says otherwise: `z` is absolute, `height` is above the ground the
 * helicopter stands on, and `teleport` takes a `height`, so a test says how
 * high above the land it wants to be and not where the land is.
 *
 * The types are shared with the smoke tests, so a test that calls something
 * that is not here does not compile.
 */
import {
  TREE_KINDS,
  type Collectible,
  type FirePlace,
  type PackagePlace,
  type RescueSpot,
  type TreeKind,
} from './arena';
import type { ChaseCamera, Point, View } from './chase';
import type { Game, LastLevel } from './game';
import { HELICOPTER, type Bounds, type Controls } from './helicopter';
import { checkInvariants } from './invariants';
import { TREE_STRIDE } from './island';
import { treeSize } from './meshes';
import type { LevelKind, Step } from './mission';
import { seeded } from './random';
import type { Block } from './solids';

declare global {
  interface Window {
    game?: GameApi;
  }
}

export interface GameState {
  /** Game time, in seconds. */
  t: number;
  frame: number;
  paused: boolean;
  /** What is on the screen: free flight, or a level being flown, with the toast over it; or the panel, with the game held behind it. */
  screen: 'flying' | 'panel';
  /**
   * Where the helicopter is and how it is going. `z` is its skids' height above the sea, `floor` the height of the
   * ground it stands on here (the most under its middle and its skids) and `height` the one above the other; `vz` is
   * its climb, and `landed` is on the ground.
   */
  helicopter: {
    x: number;
    y: number;
    z: number;
    floor: number;
    height: number;
    yaw: number;
    pitch: number;
    roll: number;
    speed: number;
    vz: number;
    landed: boolean;
    /** Over water, a lake, the sea or a river, held at the hover and never landed. */
    overWater: boolean;
    rotorSpeed: number;
  };
  /** The camera's mode and its two points, copied: the rig's own arrays move every frame. */
  camera: { mode: 'chase' | 'parked'; position: Point; target: Point };
  /** How it is being flown (by the keys or by touch), the controls it was flown with at the last step, and the touch lever's lift. */
  input: InputState;
  /**
   * Where the level going has got to: which level (null with nothing going), its steps (none with nothing going) and
   * the one being done, the pad wanted now (−1 with nothing going) and the point it wants the helicopter at (null with
   * nothing going), whether a parcel is aboard, the loading (seconds landed on the pad wanted, or with nothing going the
   * seconds it has stood on a pickup pad for a level to begin), and the time since the level began.
   */
  mission: {
    level: string | null;
    steps: Step[];
    next: number;
    target: number;
    goal: { x: number; y: number; z: number } | null;
    carrying: boolean;
    loading: number;
    time: number;
  };
  /** The level the HUD shows the way to the start of, or null. */
  guided: string | null;
  /** The last level done, for the toast, or null until one is. */
  last: LastLevel | null;
  /** The toast's words while it is shown, "Delivered! 0:38 ★ New best" or "Collected the gorge bridge · 1 of 7", or null: each goes after three seconds of game time. */
  toast: string | null;
  /** The pad nothing begins from until the helicopter lifts off, by its place in the pads' list; −1 for none. */
  blocked: number;
  /** The structures collected, by name, in the order they were; one a save brought that the game does not have is in it too. */
  collected: string[];
  /** The hidden packages found, by name, in the order they were; one a save brought that the game does not have is in it too. */
  found: string[];
  /**
   * What the radar heard at the last step: the distance to the nearest package not yet found within its range, or −1
   * for none, and whether a ping fell due on that step; and what the badge on the page shows as it was last drawn:
   * `badge` quiet or heard, and the `step` its newest ring is at, 0 for no ring.
   */
  radar: { nearest: number; pinged: boolean; badge: 'quiet' | 'heard'; step: number };
  /** How many placements of gold the scene is drawing: a collar on each tower and a cover over each rail of the structures collected. */
  gold: number;
  /** How many crates of hidden packages the scene is drawing: one on each place of a package not found. */
  crates: number;
  /** Who is being winched up (the rescue level whose person it is, null for nobody) and how far up they are, 0 to 1: the loader's share. */
  winch: { spot: string | null; share: number };
  /** Who is climbing aboard (the rescue level whose person it is, null for nobody) and how far, 0 to 1: the loader's share. */
  board: { spot: string | null; share: number };
  /** How many people the scene has standing waiting on the ground: not those aboard, nor the one on the rope. */
  people: number;
  /** How many boats the scene has sat on the sea: one while its rescue waits or its sailor is on the rope, none once the sailor is winched. */
  boats: number;
  /** How many flares are lit: one for each person waiting, and none for the one being winched or whose level is going. */
  smoke: number;
  /** Whether the rope is drawn, with the person on it: while one is being winched. */
  rope: boolean;
  /** The water in the helicopter's tank: whether it is full, and the seconds of the scoop so far (0 to short of 2). */
  tank: { full: boolean; filling: number };
  /**
   * Each fire, by its id: how many of its patches burn, and each patch's state in the order of the fire's list as a
   * number (0 unburnt, 1 burning, 2 out), copied.
   */
  fires: { id: string; burning: number; patches: number[] }[];
  /**
   * The particles: how many slots of the renderer's pool may hold a live one, how many bursts the renderer has refused
   * since the page began (none, if the budget holds), and how many particles of each kind the page emitted at the last
   * frame it drew: flames, smoke, the rescue's flares, the drop's spray and mist, and the rotor's spray over open water;
   * and how many sprites the column of smoke drew at it.
   */
  particles: {
    live: number;
    refused: number;
    sprites: number;
    flames: number;
    smoke: number;
    flares: number;
    spray: number;
    wash: number;
  };
  /** How many patches of every fire the scene draws glowing, and how many burnt: what the pictures show of the fires' ground. */
  ground: { burning: number; burnt: number };
  /** The bucket: whether the player has it out, and as the scene draws it, whether it hangs, whether it holds water, and how long its line is. */
  bucket: { out: boolean; hung: boolean; full: boolean; line: number };
  /** The bucket's button as the HUD last drew it: grey in, an orange ring out, and with water in it blue when it is full. */
  badge: 'in' | 'out' | 'full';
}

/** A landing pad: where, the height of its top, its radius and which way its H faces. */
export interface PadInfo {
  x: number;
  y: number;
  z: number;
  radius: number;
  yaw: number;
}

/**
 * A tree on the island: which it is, its kind, where its foot is, its size against its kind's, and how tall it stands
 * over its foot and how far its crown spreads from its trunk, as drawn.
 */
export interface TreeInfo {
  index: number;
  kind: TreeKind;
  x: number;
  y: number;
  z: number;
  scale: number;
  height: number;
  spread: number;
}

/**
 * The trees the downwash has set moving: how many, the most there may be, and each one's index, where it stands, its
 * lean (how far its top has moved each way across the ground, as a share of its height) and how far it is pressed
 * down, as a share of its height.
 */
export interface SwayState {
  count: number;
  capacity: number;
  trees: { index: number; x: number; y: number; lean: [number, number]; squash: number }[];
}

/** How the helicopter is being flown: by the keys or by touch, the controls read at the last step, and the touch lever's lift. */
export interface InputState {
  by: 'keys' | 'touch';
  controls: Controls;
  lever: number;
}

/** A level as the panel shows it: what it is, and the best time on it, or null. Nothing is locked. */
export interface LevelRow {
  id: string;
  name: string;
  kind: LevelKind;
  best: number | null;
}

/** Every level, as the panel and the test API show them. */
export function levelRows(game: Game): LevelRow[] {
  return game.levels.map(({ id, name, kind }) => ({ id, name, kind, best: game.progress.best.get(id) ?? null }));
}

export interface GameApi {
  readonly version: 1;
  /** Booted, and the frame loop running. */
  readonly ready: boolean;
  /** How long the boot took, from the page's start to ready, in milliseconds; 0 until it has. */
  readonly bootMs: number;

  pause(): void;
  resume(): void;
  /**
   * Play `frames` frames of 1/60 s exactly, and draw the last. The particles move only as a frame is drawn, so this
   * leaves them out: none is born in it, so what is drawn is the island as it stands, and the long flights of the
   * play-through are quick.
   */
  step(frames?: number): void;
  /**
   * Play `frames` frames of 1/60 s exactly and draw every one, with the particles born and moved in each: what every
   * picture or check of them is taken after.
   */
  stepDrawn(frames?: number): void;
  /** Chance from a seed from now on. */
  seed(n: number): void;

  state(): GameState;
  /**
   * What the helicopter is kept inside and what is on the island, so a test does not say it twice: where its middle
   * may go (`bounds`), the island's whole extent (`world`), the highest it can climb to (`ceiling`, above the sea),
   * the sea's level, the landing pads and the first of them, `home`, which it starts on, and the structures that
   * stand in every level, each the box it is solid as.
   */
  content(): {
    bounds: Bounds;
    world: Bounds;
    ceiling: number;
    seaLevel: number;
    pads: PadInfo[];
    home: PadInfo;
    structures: Block[];
    /** The bridges and pairs of towers that can be collected, each with its opening and the blocks it is solid as. */
    collectibles: Collectible[];
    /** The hidden packages, each where it lies, with `z` the ground under it. */
    packages: PackagePlace[];
    /** Where each person waits to be rescued, with `z` the ground under them, how they are (`by` landing or the winch), and the boat's `yaw` for the one in a boat; copies. */
    rescues: RescueSpot[];
    /** The fires: where each burns, its patches (with `z` the ground under each), how many are lit and its run to skim; copies. */
    fires: FirePlace[];
  };
  /** The height of the ground at a point: the land, the water over it or a pad's top. A helicopter there rests at `floor`, which on a slope is a little higher. */
  groundAt(x: number, y: number): number;
  /**
   * Where a helicopter at a point rests: the ground, and on a slope a little higher, so its skids are on it. What
   * `teleport`'s height is over, so a test that wants it at a height above the sea takes this from it.
   */
  floorAt(x: number, y: number): number;

  /** Every tree whose foot is within `radius` of a point across the ground, nearest first. */
  treesNear(x: number, y: number, radius: number): TreeInfo[];
  /** The trees moving in the downwash, and how. */
  sway(): SwayState;

  /**
   * What the game has told since this was last asked, oldest first, as lines: `started first-delivery`, `loaded 4`,
   * `delivered 1`, `winched ledge-rescue`, `boarded wood-rescue`, `passed 2 6`, `through under the bridge`, `landed 6`, `finished first-delivery 47.25 best`,
   * `abandoned first-delivery`, `collected gorge-bridge 1 7`, `found east-wood 1 10`, `scooped`,
   * `dropped west-lake-fire 4` and `fire out west-lake-fire`.
   */
  events(): string[];
  /** Flying free from home again: landed on the home pad, anything going abandoned (told), nothing guided. */
  home(): void;
  /**
   * The helicopter put at the start of the level named `id`, with nothing begun and anything going abandoned (told): for
   * a delivery landed on its pickup pad, which then loads and begins as it is stepped; for a ring or an opening hovering
   * 30 back on its axis, its middle at its height, facing it.
   */
  play(id: string): void;
  /** The level named `id` begun at once, wherever the helicopter is; a name the game does not have throws. */
  begin(id: string): void;
  /** The level going given up, told, with no time kept; nothing happens with none going. */
  abandon(): void;
  /** The bucket put out with true, taken in with false, or with no argument put out if it is in and taken in if it is out; whether it is out now. */
  bucket(out?: boolean): boolean;
  /** The HUD shown the way to the start of the level named `id`, or to none with null; a name the game does not have throws. */
  guide(id: string | null): void;
  /** Every level as the panel shows it: its name, its kind and the best time on it. Nothing is locked. */
  levels(): LevelRow[];
  /** What the player has done, as it is saved, and why the save the game found could not be read, if it could not. */
  save(): { best: Record<string, number>; collected: string[]; found: string[]; refused: string | null };
  /**
   * The autopilot flying in place of the player, or not: what the play-through flies the level by. Given a level `id`,
   * it goes to that level's start from wherever the helicopter is and does it, whenever nothing is going (a fire level's
   * start is the water it must scoop and drop to begin it); given a
   * structure's `id`, it flies through that structure's opening, and given a package's `id`, it flies to it and lands by
   * it, while nothing else is asked of it. Level, structure and package ids never clash; one that is none throws.
   */
  autopilot(on: boolean, id?: string): void;
  /** Every rule that must always hold and does not, as `invariants.ts` says: none, if all is well. */
  invariants(): string[];

  /** The controls held, as if a person held them, until `release`. */
  fly(forward: number, turn: number, lift: number): void;
  /** The controls let go of, and the keyboard read again. */
  release(): void;
  /**
   * The helicopter put somewhere, `height` above the ground there (so 0 is landed), stopped and level, facing `yaw`
   * or as it was; the camera goes behind it if it is chasing. Kept inside `content().bounds` and under the ceiling.
   */
  teleport(x: number, y: number, height: number, yaw?: number): void;
  /** The camera parked looking at the ground at a point, from `azimuth` round and `polar` down, `radius` away, at once: the tests' standard view. */
  look(x: number, y: number, view?: View): void;
  /** The camera behind the helicopter again, and following it. */
  chase(): void;
  /**
   * What drawing a frame of the scene as it stands costs, in milliseconds, once the GPU has been kept drawing for
   * `warm` of them: a quarter of a second unless told otherwise, which is what one that sat idle while the page
   * booted needs. A test that measures scene after scene may ask for less after the first.
   */
  measureFrame(warm?: number): Promise<number>;
}

/** What the page gives the API that is not the game's: time, the controls, the camera rig and the renderer. */
export interface DebugHost {
  game: Game;
  rig: ChaseCamera;
  ready(): boolean;
  bootMs(): number;
  paused(): boolean;
  setPaused(paused: boolean): void;
  /** Hold these controls in place of the keyboard, or give the keyboard back with null. */
  setControls(controls: Controls | null): void;
  /** How it is being flown, as `state().input` says. */
  input(): InputState;
  /** What the game has told, taken away as it is read. */
  events(): string[];
  /** Flying free from home again, as the page does it: the camera behind the helicopter and the toast put away. */
  home(): void;
  /** The helicopter put at the start of the level named `id`, as the panel's "fly" does it. */
  play(id: string): void;
  /** What is on the screen. */
  screen(): GameState['screen'];
  /** The toast's words while it is shown, a level's or a structure's, or null. */
  toast(): string | null;
  /** How many placements of gold the scene has written. */
  gold(): number;
  /** How many crates of packages the scene has written at a size. */
  crates(): number;
  /** How many people the scene has written standing waiting. */
  people(): number;
  /** How many boats the scene has written sat on the sea. */
  boats(): number;
  /** How many flares are lit: the people waiting at the last frame drawn. */
  smoke(): number;
  /** The particles as the page counts them: see `GameState.particles`. */
  particles(): GameState['particles'];
  /** The fires' ground as the scene last drew it. */
  ground(): GameState['ground'];
  /** The bucket as the scene last drew it. */
  bucket(): Omit<GameState['bucket'], 'out'>;
  /** The bucket's button as the HUD last drew it. */
  badge(): GameState['badge'];
  /** Whether the scene has written the rope. */
  rope(): boolean;
  /** The radar's badge as the page last drew it. */
  radar(): { badge: 'quiet' | 'heard'; step: number };
  /** The autopilot flying in place of the keys and touch, or not, told the level or the structure to do while nothing is going. */
  setAutopilot(on: boolean, id?: string): void;
  /** Play one frame of `dt`, without drawing. */
  simulate(dt: number): void;
  /** Draw a frame of `dt` seconds, with the particles born in it if `emit`, and only moved if not. */
  draw(dt: number, emit: boolean): void;
  frame(): number;
  measureFrame(warm?: number): Promise<number>;
}

function padInfo({ x, y, z, radius, yaw }: PadInfo): PadInfo {
  return { x, y, z, radius, yaw };
}

export function createApi(host: DebugHost): GameApi {
  const { game, rig } = host;
  const helicopter = game.helicopter;
  return {
    version: 1,
    get ready() {
      return host.ready();
    },
    get bootMs() {
      return host.bootMs();
    },
    pause: () => host.setPaused(true),
    resume: () => host.setPaused(false),
    step(frames = 1) {
      for (let f = 0; f < frames; f++) host.simulate(1 / 60);
      host.draw(1 / 60, false);
    },
    stepDrawn(frames = 1) {
      for (let f = 0; f < frames; f++) {
        host.simulate(1 / 60);
        host.draw(1 / 60, true);
      }
    },
    seed(n) {
      game.random = seeded(n);
    },

    state() {
      return {
        t: game.t,
        frame: host.frame(),
        paused: host.paused(),
        screen: host.screen(),
        helicopter: {
          x: helicopter.x,
          y: helicopter.y,
          z: helicopter.z,
          floor: helicopter.floor,
          height: helicopter.height,
          yaw: helicopter.yaw,
          pitch: helicopter.pitch,
          roll: helicopter.roll,
          speed: helicopter.speed,
          vz: helicopter.vz,
          landed: helicopter.landed,
          overWater: helicopter.overWater,
          rotorSpeed: helicopter.rotorSpeed,
        },
        camera: { mode: rig.mode, position: [...rig.position], target: [...rig.target] },
        input: host.input(),
        mission: {
          level: game.mission.level?.id ?? null,
          steps: game.mission.level?.steps.map((step) => ({ ...step })) ?? [],
          next: game.mission.next,
          target: game.mission.target,
          goal: game.mission.goal && { ...game.mission.goal },
          carrying: game.mission.carrying,
          loading: game.mission.level ? game.mission.loading : game.starts.loading,
          time: game.mission.time,
        },
        guided: game.guided?.id ?? null,
        last: game.last && { ...game.last },
        toast: host.toast(),
        blocked: game.starts.blocked,
        collected: [...game.collection.ids],
        found: [...game.finds.ids],
        radar: { nearest: game.finds.nearest, pinged: game.finds.pinged, ...host.radar() },
        gold: host.gold(),
        crates: host.crates(),
        winch: { spot: game.winch.spot, share: game.winch.share },
        board: { spot: game.board.spot, share: game.board.share },
        people: host.people(),
        boats: host.boats(),
        smoke: host.smoke(),
        rope: host.rope(),
        tank: { full: game.tank.full, filling: game.tank.filling },
        fires: game.fires.map((f) => ({ id: f.id, burning: f.burning, patches: [...f.states] })),
        particles: host.particles(),
        ground: host.ground(),
        bucket: { out: game.bucket.out, ...host.bucket() },
        badge: host.badge(),
      };
    },
    content: () => ({
      bounds: { ...helicopter.bounds },
      world: { ...game.island.bounds },
      ceiling: HELICOPTER.ceiling,
      seaLevel: game.island.seaLevel,
      pads: game.island.pads.map(padInfo),
      home: padInfo(game.island.pads[0]),
      structures: game.solids.blocks.map((block) => ({ ...block })),
      collectibles: game.collection.collectibles.map(({ id, name, opening, blocks }) => ({
        id,
        name,
        opening: { ...opening, ...(opening.flags && { flags: opening.flags.map((f) => ({ ...f })) }) },
        blocks: blocks.map((block) => ({ ...block })),
      })),
      packages: game.finds.places.map(({ id, x, y, z }) => ({ id, x, y, z })),
      // read from the levels that begin with a person, whose names are the spots' own
      rescues: game.levels.flatMap(({ id, name, steps: [first] }) =>
        first.kind === 'winch' || first.kind === 'board'
          ? [
              {
                id,
                name,
                who: first.who,
                where: first.where,
                by: first.kind === 'board' ? ('land' as const) : ('winch' as const),
                x: first.x,
                y: first.y,
                z: first.z,
                ...(first.kind === 'winch' && first.yaw !== undefined && { yaw: first.yaw }),
              },
            ]
          : [],
      ),
      fires: game.fires.map(({ place }) => ({
        ...place,
        patches: place.patches.map((p) => ({ ...p })),
        run: { ...place.run, from: { ...place.run.from }, to: { ...place.run.to } },
      })),
    }),
    groundAt: (x, y) => game.island.ground.heightAt(x, y),
    floorAt: (x, y) => helicopter.floorAt(x, y),
    treesNear(x, y, radius) {
      const { trees, treeCount } = game.island;
      const found: (TreeInfo & { d: number })[] = [];
      for (let t = 0; t < treeCount; t++) {
        const o = t * TREE_STRIDE;
        const d = Math.hypot(trees[o + 1] - x, trees[o + 2] - y);
        if (d > radius) continue;
        found.push({
          index: t,
          kind: TREE_KINDS[trees[o]],
          x: trees[o + 1],
          y: trees[o + 2],
          z: trees[o + 3],
          scale: trees[o + 5],
          height: treeSize(TREE_KINDS[trees[o]]).top * trees[o + 5],
          spread: treeSize(TREE_KINDS[trees[o]]).radius * trees[o + 5],
          d,
        });
      }
      return found.sort((a, b) => a.d - b.d).map(({ d: _d, ...tree }) => tree);
    },
    sway() {
      const { sway } = game;
      const { trees } = game.island;
      const moving: SwayState['trees'] = [];
      for (let k = 0; k < sway.count; k++) {
        const t = sway.tree[k];
        moving.push({
          index: t,
          x: trees[t * TREE_STRIDE + 1],
          y: trees[t * TREE_STRIDE + 2],
          lean: [sway.leanX[k], sway.leanY[k]],
          squash: sway.squash[k],
        });
      }
      return { count: sway.count, capacity: sway.capacity, trees: moving };
    },

    events: () => host.events(),
    home: () => host.home(),
    play: (id) => host.play(id),
    begin: (id) => game.begin(id),
    abandon: () => game.abandon(),
    bucket(out) {
      if (out === undefined) game.toggleBucket();
      else game.setBucket(out);
      return game.bucket.out;
    },
    guide: (id) => game.guide(id),
    levels: () => levelRows(game),
    save: () => ({ ...game.progress.toJSON(), refused: game.progress.refused }),
    autopilot: (on, id) => host.setAutopilot(on, id),
    invariants: () => checkInvariants(game),
    fly: (forward, turn, lift) => host.setControls({ forward, turn, lift }),
    release: () => host.setControls(null),
    teleport(x, y, height, yaw = helicopter.yaw) {
      helicopter.placeAbove(x, y, height, yaw);
      if (rig.mode === 'chase') rig.snap(helicopter);
    },
    look: (x, y, view) => rig.park(x, y, view),
    chase: () => rig.snap(helicopter),
    measureFrame: (warm) => host.measureFrame(warm),
  };
}
