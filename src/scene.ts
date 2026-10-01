/**
 * The arena as it is drawn: the floor and the rock round it, which do not
 * move; and the helicopter, which does, a group for each of its colours and
 * one for each rotor. The groups are fixed once, and each frame only where
 * everything is written into them. It is handed what it draws from, and
 * never the renderer. Without it the page has nothing to hand the renderer,
 * and the helicopter is never seen.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { COLS, FLOOR, ORIGIN_X, ORIGIN_Y, ROWS, TILE } from './arena';
import { HELICOPTER } from './helicopter';
import { place, placeFrame, placePart } from './matrix';
import {
  box,
  helicopterBody,
  helicopterDark,
  helicopterGlass,
  helicopterTrim,
  mainRotor,
  square,
  tailRotor,
} from './meshes';

/** Where the helicopter is and how it is tilted and spinning: what the scene draws it from. */
export interface HelicopterPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  rotor: number;
  tailRotor: number;
}

/** How tall the rock stands. */
const ROCK_HEIGHT = 3;

/** The helicopter's paint, each named once: the shell, the cream trim on it, the glass, and the dark metal the rotors share. */
type Rgb = [number, number, number];
const BODY_PAINT = { albedo: [0.85, 0.33, 0.17] as Rgb, roughness: 0.5 };
const TRIM_PAINT = { albedo: [0.93, 0.89, 0.78] as Rgb, roughness: 0.5 };
const GLASS_PAINT = { albedo: [0.17, 0.29, 0.39] as Rgb, roughness: 0.15 };
const DARK_PAINT = { albedo: [0.17, 0.17, 0.19] as Rgb, roughness: 0.6 };

export class Scene {
  /** The moving placements, one pool a group, one placement each, in the order `dynamic` gives the groups. */
  readonly pools: Float32Array[] = [];

  /** What does not move: the floor, and a block for every tile of rock. */
  static(solid: Uint8Array): GameGroup[] {
    const floor = new Float32Array(16);
    place(
      floor,
      0,
      (FLOOR.minX + FLOOR.maxX) / 2,
      (FLOOR.minY + FLOOR.maxY) / 2,
      0,
      0,
      FLOOR.maxX - FLOOR.minX,
      FLOOR.maxY - FLOOR.minY,
      1,
    );
    const rock: number[] = [];
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) if (solid[ty * COLS + tx]) rock.push(tx, ty);
    const rocks = new Float32Array((rock.length / 2) * 16);
    for (let k = 0; k < rock.length; k += 2)
      place(rocks, k / 2, ORIGIN_X + (rock[k] + 0.5) * TILE, ORIGIN_Y + (rock[k + 1] + 0.5) * TILE, 0);
    return [
      { mesh: square(), matrices: floor, albedo: [0.62, 0.6, 0.55], roughness: 0.9 },
      { mesh: box(TILE, TILE, ROCK_HEIGHT), matrices: rocks, albedo: [0.32, 0.3, 0.3], roughness: 0.95 },
    ];
  }

  /** What moves: the helicopter's groups, their pools sized once. */
  dynamic(): GameGroup[] {
    this.pools.length = 0;
    const group = (mesh: GameGroup['mesh'], paint: { albedo: Rgb; roughness: number }): GameGroup => {
      const matrices = new Float32Array(16);
      this.pools.push(matrices);
      return { mesh, matrices, count: 1, albedo: paint.albedo, roughness: paint.roughness };
    };
    return [
      group(helicopterBody(), BODY_PAINT),
      group(helicopterTrim(), TRIM_PAINT),
      group(helicopterGlass(), GLASS_PAINT),
      group(helicopterDark(), DARK_PAINT),
      group(mainRotor(), DARK_PAINT),
      group(tailRotor(), DARK_PAINT),
    ];
  }

  /** Everything where it is this frame. */
  write(pose: HelicopterPose): void {
    const [body, trim, glass, dark, main, tail] = this.pools;
    const { mastTop, tailRotorAt } = HELICOPTER.size;
    placeFrame(body, 0, pose.x, pose.y, pose.z, pose.yaw, pose.pitch, pose.roll);
    trim.set(body);
    glass.set(body);
    dark.set(body);
    placePart(main, 0, body, 0, 0, 0, mastTop, 'z', pose.rotor);
    placePart(tail, 0, body, 0, tailRotorAt[0], tailRotorAt[1], tailRotorAt[2], 'y', pose.tailRotor);
  }
}

/**
 * The arena's footprint, for the sun's shadow to be fitted to. Its top is
 * the highest the helicopter can reach, hub and all, so the shadow covers it
 * at any height and not only when it is low.
 */
export const ARENA_BOX = {
  min: [ORIGIN_X, ORIGIN_Y, -1] as [number, number, number],
  max: [ORIGIN_X + COLS * TILE, ORIGIN_Y + ROWS * TILE, HELICOPTER.ceiling + HELICOPTER.size.height] as [
    number,
    number,
    number,
  ],
};
