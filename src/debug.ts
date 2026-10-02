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
import { TREE_KINDS, type TreeKind } from './arena';
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
  /** The toast's words while it is shown, "Delivered! 0:38 ★ New best", or null: it goes after three seconds of game time. */
  toast: string | null;
  /** The pad nothing begins from until the helicopter lifts off, by its place in the pads' list; −1 for none. */
  blocked: number;
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
  /** Play `frames` frames of 1/60 s exactly, and draw the last. */
  step(frames?: number): void;
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
   * `delivered 1`, `passed 2 6`, `through under the bridge`, `landed 6`, `finished first-delivery 47.25 best`,
   * `abandoned first-delivery`.
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
  /** The HUD shown the way to the start of the level named `id`, or to none with null; a name the game does not have throws. */
  guide(id: string | null): void;
  /** Every level as the panel shows it: its name, its kind and the best time on it. Nothing is locked. */
  levels(): LevelRow[];
  /** What the player has done, as it is saved, and why the save the game found could not be read, if it could not. */
  save(): { best: Record<string, number>; refused: string | null };
  /**
   * The autopilot flying in place of the player, or not: what the play-through flies the level by. Given a level `id`,
   * it goes to that level's start from wherever the helicopter is and does it, whenever nothing is going.
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
  /** The toast's words while it is shown, or null. */
  toast(): string | null;
  /** The autopilot flying in place of the keys and touch, or not, told the level to do while nothing is going. */
  setAutopilot(on: boolean, id?: string): void;
  /** Play one frame of `dt`, without drawing. */
  simulate(dt: number): void;
  draw(dt: number): void;
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
      host.draw(1 / 60);
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
