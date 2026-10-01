/**
 * `window.game`: the game, for tests and for poking at from the console.
 * Everything a test needs to set a scene, play it exactly and read back
 * what happened, so no test waits on a clock or reaches into the game's
 * insides.
 *
 * Time is the test's to keep: `pause` stops the game where it is, and
 * `step` plays it on a frame at a time, exactly, drawing the last. `seed`
 * makes chance repeat. Anything that changes the game goes through here,
 * and `state`, `bodies`, `events` and `invariants` read it back.
 *
 * The types are shared with the smoke tests, so a test that calls something
 * that is not here does not compile.
 */
import { BALLS, FLOOR, HOLE, KIND_NAME } from './arena';
import type { Game } from './game';
import { checkInvariants } from './invariants';
import { seeded } from './random';

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
  bank: number;
  banked: number;
  /** How many bodies are on the floor. */
  live: number;
  sled: { x: number; y: number; yaw: number; speed: number };
}

/** A body on the floor. */
export interface Body {
  slot: number;
  kind: string;
  x: number;
  y: number;
  z: number;
  asleep: boolean;
}

/** Where things are, for setting a scene without importing the game's source. */
export interface Content {
  hole: { x: number; y: number; radius: number };
  floor: { minX: number; minY: number; maxX: number; maxY: number };
  balls: number;
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
  bodies(kind?: string): Body[];
  content(): Content;
  /** What has happened since this was last asked, a line each: "banked 12.0,4.0". */
  events(): string[];
  /** The rules that must always hold, broken; empty when all is well. */
  invariants(): string[];

  /** Drive as if the controls were held so, until `release`. */
  drive(throttle: number, steer: number): void;
  release(): void;
  /** The sled put at a point facing `yaw`, stopped. */
  teleport(x: number, y: number, yaw?: number): void;
  /** A body moved to a point, still, and woken. */
  place(slot: number, x: number, y: number, z?: number): void;
  deposit(value: number): void;
  /** The save written now, and what it is. */
  save(): string;

  /** The camera looking at a point, from `azimuth` round and `polar` down, `radius` away, at once. */
  look(x: number, y: number, view?: { azimuth?: number; polar?: number; radius?: number }): void;
  /**
   * What drawing a frame of the scene as it stands costs, in milliseconds, once the GPU has been kept drawing for
   * `warm` of them: a quarter of a second unless told otherwise, which is what one that sat idle while the page
   * booted needs. A test that measures scene after scene may ask for less after the first.
   */
  measureFrame(warm?: number): Promise<number>;
}

/** What the page gives the API that is not the game's: time, the controls, the camera and the renderer. */
export interface DebugHost {
  game: Game;
  ready(): boolean;
  bootMs(): number;
  paused(): boolean;
  setPaused(paused: boolean): void;
  /** Play one frame of `dt`, without drawing. */
  simulate(dt: number): void;
  draw(dt: number): void;
  frame(): number;
  setDrive(drive: { throttle: number; steer: number } | null): void;
  look(x: number, y: number, view: { azimuth?: number; polar?: number; radius?: number }): void;
  measureFrame(warm?: number): Promise<number>;
  events: string[];
}

export function createApi(host: DebugHost): GameApi {
  const { game } = host;
  const { world, progress, sled } = game;
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
        bank: progress.save.bank,
        banked: progress.save.banked,
        live: world.live,
        sled: { x: sled.x, y: sled.y, yaw: sled.yaw, speed: sled.speed },
      };
    },
    bodies(kind) {
      const out: Body[] = [];
      for (let i = 0; i < world.count; i++) {
        if (!world.alive[i]) continue;
        const name = KIND_NAME[world.kind[i]];
        if (kind !== undefined && name !== kind) continue;
        out.push({ slot: i, kind: name, x: world.x[i], y: world.y[i], z: world.z[i], asleep: !!world.asleep[i] });
      }
      return out;
    },
    content: () => ({ hole: { x: HOLE.x, y: HOLE.y, radius: HOLE.radius }, floor: { ...FLOOR }, balls: BALLS }),
    events() {
      return host.events.splice(0);
    },
    invariants: () => checkInvariants(game),

    drive: (throttle, steer) => host.setDrive({ throttle, steer }),
    release: () => host.setDrive(null),
    teleport(x, y, yaw) {
      Object.assign(sled, { x, y, speed: 0, yawRate: 0 });
      if (yaw !== undefined) sled.yaw = yaw;
    },
    place(slot, x, y, z) {
      if (!world.alive[slot]) return;
      world.x[slot] = x;
      world.y[slot] = y;
      if (z !== undefined) world.z[slot] = z;
      world.vx[slot] = world.vy[slot] = world.vz[slot] = 0;
      world.wake(slot);
    },
    deposit: (value) => progress.deposit(value),
    save() {
      game.persist();
      return JSON.stringify(progress.save);
    },

    look: (x, y, view = {}) => host.look(x, y, view),
    measureFrame: (warm) => host.measureFrame(warm),
  };
}
