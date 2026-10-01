/**
 * The chase camera, stepped headless: where it settles, how fast it gets there, that it never goes under the ground
 * nor into a tree, and the fixed view the pictures are taken from.
 */
import { describe, expect, it } from 'vitest';
import { CHASE, ChaseCamera, fovFor, type Heights, type Point } from '../src/chase';
import { HOVER_LIFT, IDLE } from '../src/helicopter';
import { TREE_STRIDE } from '../src/island';
import type { Game } from '../src/game';
import { DT, canopyKinds, islandCanopy, newGame, thickestWood } from './helpers';

function near(a: Point, b: Point, tolerance = 1e-9) {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(tolerance);
}

/** Land that rises to +x at one a unit from the origin, and is level behind it: a camera behind something flying up it is under the slope. */
const RAMP = { heightAt: (x: number) => Math.max(0, x) };

describe('snap', () => {
  it.each([0, Math.PI / 2, 2.2])('puts it behind and above, looking ahead, at a heading of %f', (yaw) => {
    const cam = new ChaseCamera();
    cam.snap({ x: 4, y: -7, z: 3, yaw });
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    near(cam.position, [4 - 15 * c, -7 - 15 * s, 9.5]);
    near(cam.target, [4 + 5 * c, -7 + 5 * s, 4.5]);
  });

  it('is held above the ground under it, when that is higher than the helicopter and what it settles at', () => {
    const cam = new ChaseCamera(RAMP);
    // flying toward -x low over the ground, with the camera 15 behind it at +x, where the ground is 15 high
    cam.snap({ x: 0, y: 0, z: 2, yaw: Math.PI });
    near(cam.position, [15, 0, 15 + CHASE.minHeight]);
    near(cam.target, [-5, 0, 3.5]);
  });

  it('chases again after a park', () => {
    const cam = new ChaseCamera();
    cam.park(0, 0);
    cam.snap({ x: 0, y: 0, z: 0, yaw: 0 });
    expect(cam.mode).toBe('chase');
  });
});

describe('step', () => {
  it('settles within a quarter unit in a second of being moved 10 away', () => {
    const cam = new ChaseCamera();
    const f = { x: 0, y: 0, z: 5, yaw: 0.4 };
    cam.snap(f);
    f.x += 10;
    const settled = new ChaseCamera();
    settled.snap(f);
    for (let n = 0; n < 60; n++) cam.step(DT, f);
    const gap = Math.hypot(...cam.position.map((v, k) => v - settled.position[k]));
    expect(gap).toBeLessThan(0.25);
    expect(gap).toBeGreaterThan(0);
  });

  it('eases and does not jump: one step goes part of the way', () => {
    const cam = new ChaseCamera();
    const f = { x: 0, y: 0, z: 5, yaw: 0 };
    cam.snap(f);
    f.x = 10;
    cam.step(DT, f);
    const k = 1 - Math.exp(-CHASE.ease * DT);
    expect(cam.position[0]).toBeCloseTo(-15 + 10 * k, 9);
    const a = 1 - Math.exp(-CHASE.aimEase * DT);
    expect(cam.target[0]).toBeCloseTo(5 + 10 * a, 9);
  });

  it('is the same however the time is cut up, when what it follows stays put', () => {
    const f = { x: 12, y: 3, z: 8, yaw: 1 };
    const one = new ChaseCamera();
    const two = new ChaseCamera();
    one.step(0.1, f);
    two.step(0.05, f);
    two.step(0.05, f);
    near(one.position, two.position);
    near(one.target, two.target);
  });

  it('never goes below the lowest height, following something under the ground', () => {
    const cam = new ChaseCamera();
    const f = { x: 0, y: 0, z: -5, yaw: 0 };
    cam.snap(f);
    expect(cam.position[2]).toBe(CHASE.minHeight);
    for (let n = 0; n < 120; n++) {
      cam.step(DT, f);
      expect(cam.position[2]).toBeGreaterThanOrEqual(CHASE.minHeight);
    }
  });

  it('never goes below the lowest height above the ground under it, following a helicopter down a slope', () => {
    const cam = new ChaseCamera(RAMP);
    const f = { x: 20, y: 0, z: 21, yaw: Math.PI };
    cam.snap(f);
    for (let n = 0; n < 240; n++) {
      f.x -= 0.2;
      f.z = Math.max(0, f.x) + 1;
      cam.step(DT, f);
      expect(cam.position[2]).toBeGreaterThanOrEqual(RAMP.heightAt(cam.position[0]) + CHASE.minHeight - 1e-9);
    }
  });

  it('never goes below the lowest height, at the ground with a low setting', () => {
    const cam = new ChaseCamera();
    const was = CHASE.up;
    CHASE.up = -3;
    try {
      const f = { x: 0, y: 0, z: 0, yaw: 0 };
      cam.snap(f);
      for (let n = 0; n < 120; n++) {
        cam.step(DT, f);
        expect(cam.position[2]).toBeGreaterThanOrEqual(CHASE.minHeight);
      }
    } finally {
      CHASE.up = was;
    }
  });

  it('writes its two points in place', () => {
    const cam = new ChaseCamera();
    const { position, target } = cam;
    cam.snap({ x: 1, y: 1, z: 1, yaw: 1 });
    cam.step(DT, { x: 9, y: 9, z: 9, yaw: 0 });
    cam.park(0, 0);
    expect(cam.position).toBe(position);
    expect(cam.target).toBe(target);
  });
});

describe('park', () => {
  it('matches the spherical formula for a given view', () => {
    const cam = new ChaseCamera();
    cam.park(3, -2, { azimuth: 0.7, polar: 0.5, radius: 40 });
    expect(cam.mode).toBe('parked');
    near(cam.target, [3, -2, 0]);
    near(cam.position, [
      3 + 40 * Math.sin(0.5) * Math.cos(0.7),
      -2 + 40 * Math.sin(0.5) * Math.sin(0.7),
      40 * Math.cos(0.5),
    ]);
  });

  it('looks at the ground at the point and sits relative to it', () => {
    const cam = new ChaseCamera(RAMP);
    cam.park(30, 5, { azimuth: 0.7, polar: 0.5, radius: 40 });
    near(cam.target, [30, 5, 30]);
    near(cam.position, [
      30 + 40 * Math.sin(0.5) * Math.cos(0.7),
      5 + 40 * Math.sin(0.5) * Math.sin(0.7),
      30 + 40 * Math.cos(0.5),
    ]);
  });

  it('takes the default view for what is left out', () => {
    const cam = new ChaseCamera();
    const { azimuth, polar, radius } = CHASE.park;
    const from = (r: number): Point => [
      r * Math.sin(polar) * Math.cos(azimuth),
      r * Math.sin(polar) * Math.sin(azimuth),
      r * Math.cos(polar),
    ];
    cam.park(0, 0);
    near(cam.position, from(radius));
    cam.park(0, 0, { radius: 10 });
    near(cam.position, from(10));
  });

  it('ignores step while parked, and chases again after snap', () => {
    const cam = new ChaseCamera();
    cam.park(0, 0);
    const position = [...cam.position];
    const target = [...cam.target];
    cam.step(DT, { x: 50, y: 50, z: 5, yaw: 1 });
    expect([...cam.position]).toEqual(position);
    expect([...cam.target]).toEqual(target);
    cam.snap({ x: 50, y: 50, z: 5, yaw: 1 });
    expect(cam.mode).toBe('chase');
    const before = [...cam.position];
    cam.step(DT, { x: 60, y: 50, z: 5, yaw: 1 });
    expect([...cam.position]).not.toEqual(before);
  });
});

/** A stand of trees whose tops are 20 high over x from 10 to 40, falling away at a slope of one either side, and nothing beyond. */
const STAND: Heights = {
  heightAt: (x: number) => (x < -10 || x > 60 ? -Infinity : 20 - Math.max(0, 10 - x, x - 40)),
};

describe('over the trees', () => {
  it('settles over the treetops behind a helicopter flying under them', () => {
    const cam = new ChaseCamera(undefined, STAND);
    // flying toward -x, the camera 15 behind it at +x, over the stand
    const f = { x: 10, y: 0, z: 2, yaw: Math.PI };
    cam.snap(f);
    for (let n = 0; n < 180; n++) cam.step(DT, f);
    expect(cam.position[0]).toBeCloseTo(25, 6);
    expect(cam.position[2]).toBeCloseTo(20 + CHASE.overTrees, 6);
    // and looks at the helicopter, not over it
    expect(cam.target[2]).toBeCloseTo(2 + CHASE.lookUp, 6);
  });

  it('is held over the treetops however fast it comes at them, and eases up to them rather than jumping', () => {
    const cam = new ChaseCamera(undefined, STAND);
    const f = { x: -60, y: 0, z: 2, yaw: 0 };
    cam.snap(f);
    let most = 0;
    let was = cam.position[2];
    for (let n = 0; n < 360; n++) {
      f.x += 26 * DT;
      cam.step(DT, f);
      expect(cam.position[2]).toBeGreaterThanOrEqual(STAND.heightAt(cam.position[0], 0) + CHASE.overTrees - 1e-9);
      most = Math.max(most, Math.abs(cam.position[2] - was));
      was = cam.position[2];
    }
    // the stand rises one a unit, and the camera crosses it at most at top speed: no faster up than that
    expect(most).toBeLessThanOrEqual(26 * DT + 1e-9);
  });

  it('chases exactly as before where no tree is near', () => {
    const bare = new ChaseCamera();
    const none = new ChaseCamera(undefined, { heightAt: () => -Infinity });
    const f = { x: 0, y: 0, z: 4, yaw: 0.3 };
    bare.snap(f);
    none.snap(f);
    for (let n = 0; n < 240; n++) {
      f.x += 0.3;
      f.z += 0.05;
      f.yaw += 0.01;
      bare.step(DT, f);
      none.step(DT, f);
      expect([...none.position, ...none.target]).toEqual([...bare.position, ...bare.target]);
    }
  });

  it('parks looking at the ground, under the trees, as before', () => {
    const cam = new ChaseCamera(undefined, STAND);
    cam.park(20, 0, { azimuth: 0, polar: 0, radius: 5 });
    expect(cam.target[2]).toBe(0);
    expect(cam.position[2]).toBe(5);
  });
});

/** The tree whose crown, leaned as the sway has it, holds the camera's point, worked out from the trees and not the canopy; −1 if none. */
function crownHolding(game: Game, p: Point): number {
  const { trees, treeCount } = game.island;
  const kinds = canopyKinds();
  const { sway } = game;
  for (let t = 0; t < treeCount; t++) {
    const o = t * TREE_STRIDE;
    const { top, radius } = kinds[trees[o]];
    const s = trees[o + 5];
    const k = sway.slot(t);
    const lean = k >= 0 ? Math.hypot(sway.leanX[k], sway.leanY[k]) : 0;
    if (
      Math.hypot(p[0] - trees[o + 1], p[1] - trees[o + 2]) < (radius + lean * top) * s &&
      p[2] < trees[o + 3] + top * s
    )
      return t;
  }
  return -1;
}

describe('over the island', () => {
  /** The game and the camera stepped together, a frame of `controls` at a time, the camera checked each frame. */
  function chase(game: Game, cam: ChaseCamera, frames: number, controls = IDLE, each?: () => void) {
    for (let n = 0; n < frames; n++) {
      game.step(DT, controls);
      cam.step(DT, game.helicopter);
      each?.();
    }
  }
  /**
   * The most the camera moved up or down in a frame, over everything flown in this block, and the most it rose in a
   * frame that ended with it held up on the lowest it may be, which is the only move it makes without easing.
   */
  let most = 0,
    heldRise = 0;
  const watch = (game: Game, cam: ChaseCamera) => {
    let was = cam.position[2];
    const canopy = islandCanopy();
    return () => {
      const p = cam.position;
      const t = crownHolding(game, p);
      expect(t, `in the crown of tree ${t}`).toBe(-1);
      most = Math.max(most, Math.abs(p[2] - was));
      const lowest = Math.max(
        game.island.ground.heightAt(p[0], p[1]) + CHASE.minHeight,
        canopy.heightAt(p[0], p[1]) + CHASE.overTrees,
      );
      if (Math.abs(p[2] - lowest) < 1e-9) heldRise = Math.max(heldRise, p[2] - was);
      was = p[2];
    };
  };

  it('is never in a crown, flown low at full speed through the thickest wood every way', () => {
    const { game } = newGame();
    const cam = new ChaseCamera(game.island.ground, islandCanopy());
    const wood = thickestWood();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      game.helicopter.placeAbove(wood.x - 90 * Math.cos(a), wood.y - 90 * Math.sin(a), 3, a);
      cam.snap(game.helicopter);
      chase(game, cam, 420, { forward: 1, turn: 0, lift: HOVER_LIFT }, watch(game, cam));
    }
  });

  it('is never in a crown, let down into the clearing in the wood and lifted out again', () => {
    const { game } = newGame();
    const cam = new ChaseCamera(game.island.ground, islandCanopy());
    for (const yaw of [0, 1.6, 3.1, 4.7]) {
      game.helicopter.placeAbove(116, -280, 14, yaw);
      cam.snap(game.helicopter);
      const check = watch(game, cam);
      chase(game, cam, 480, IDLE, check);
      expect(game.helicopter.landed).toBe(true);
      // landed in the clearing, it is over the crowns round it and looking down at the helicopter
      expect(cam.position[2]).toBeGreaterThan(game.helicopter.z + CHASE.up);
      chase(game, cam, 180, { forward: 0, turn: 0, lift: 1 }, check);
    }
  });

  it('eases over the trees without a jump', () => {
    // measured over everything flown above. Held up against a crown it rose at most 0.08 in a frame, looking ahead as
    // it does; with a canopy falling away at a slope and no looking ahead it was held in half the frames and rose 0.43
    expect(heldRise).toBeGreaterThan(0);
    expect(heldRise).toBeLessThan(0.15);
    // and every other move is its easing toward where it settles, which crossed 0.42 in a frame at the most
    expect(most).toBeLessThan(0.5);
  });
});

describe('fovFor', () => {
  it('is the set angle on a screen as wide as it is tall or wider', () => {
    expect(fovFor(1.6)).toBe(40);
    expect(fovFor(1)).toBe(40);
  });

  it('is capped on a very narrow screen', () => {
    expect(fovFor(0.465)).toBeCloseTo(CHASE.maxFov, 5);
  });

  it("is between on a screen a little narrow, and keeps the square screen's width", () => {
    const fov = fovFor(0.8);
    expect(fov).toBeGreaterThan(40);
    expect(fov).toBeLessThan(75);
    const wide = (v: number) => Math.tan((v * Math.PI) / 360);
    expect(wide(fov) * 0.8).toBeCloseTo(wide(40), 9);
  });
});
