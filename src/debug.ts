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
 * The types are shared with the smoke tests, so a test that calls something
 * that is not here does not compile.
 */
import { FLOOR } from './arena';
import type { ChaseCamera, Point, View } from './chase';
import type { Game } from './game';
import { HELICOPTER, type Bounds, type Controls } from './helicopter';
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
  /** Where the helicopter is and how it is going; `vz` is its climb, and `landed` is on the floor. */
  helicopter: {
    x: number;
    y: number;
    z: number;
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
  /** What the helicopter is kept inside, so a test does not say it twice: the floor, where its middle may go, and the ceiling. */
  content(): { floor: Bounds; bounds: Bounds; ceiling: number };

  /** The controls held, as if a person held them, until `release`. */
  fly(forward: number, turn: number, lift: number): void;
  /** The controls let go of, and the keyboard read again. */
  release(): void;
  /** The helicopter put somewhere, stopped and level, facing `yaw` or as it was; the camera goes behind it if it is chasing. */
  teleport(x: number, y: number, z: number, yaw?: number): void;
  /** The camera parked looking at a point, from `azimuth` round and `polar` down, `radius` away, at once: the tests' standard view. */
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
  /** Play one frame of `dt`, without drawing. */
  simulate(dt: number): void;
  draw(dt: number): void;
  frame(): number;
  measureFrame(warm?: number): Promise<number>;
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
        helicopter: {
          x: helicopter.x,
          y: helicopter.y,
          z: helicopter.z,
          yaw: helicopter.yaw,
          pitch: helicopter.pitch,
          roll: helicopter.roll,
          speed: helicopter.speed,
          vz: helicopter.vz,
          landed: helicopter.landed,
          rotorSpeed: helicopter.rotorSpeed,
        },
        camera: { mode: rig.mode, position: [...rig.position], target: [...rig.target] },
      };
    },
    content: () => ({
      floor: { ...FLOOR },
      bounds: { ...helicopter.bounds },
      ceiling: HELICOPTER.ceiling,
    }),

    fly: (forward, turn, lift) => host.setControls({ forward, turn, lift }),
    release: () => host.setControls(null),
    teleport(x, y, z, yaw = helicopter.yaw) {
      helicopter.place(x, y, z, yaw);
      if (rig.mode === 'chase') rig.snap(helicopter);
    },
    look: (x, y, view) => rig.park(x, y, view),
    chase: () => rig.snap(helicopter),
    measureFrame: (warm) => host.measureFrame(warm),
  };
}
