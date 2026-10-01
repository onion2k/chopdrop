/** The chase camera, stepped headless: where it settles, how fast it gets there, that it never goes under the floor, and the fixed view the pictures are taken from. */
import { describe, expect, it } from 'vitest';
import { CHASE, ChaseCamera, fovFor, type Point } from '../src/chase';
import { DT } from './helpers';

function near(a: Point, b: Point, tolerance = 1e-9) {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(tolerance);
}

describe('snap', () => {
  it.each([0, Math.PI / 2, 2.2])('puts it behind and above, looking ahead, at a heading of %f', (yaw) => {
    const cam = new ChaseCamera();
    cam.snap({ x: 4, y: -7, z: 3, yaw });
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    near(cam.position, [4 - 15 * c, -7 - 15 * s, 9.5]);
    near(cam.target, [4 + 5 * c, -7 + 5 * s, 4.5]);
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

  it('never goes below the lowest height, following something under the floor', () => {
    const cam = new ChaseCamera();
    const f = { x: 0, y: 0, z: -5, yaw: 0 };
    cam.snap(f);
    expect(cam.position[2]).toBe(CHASE.minHeight);
    for (let n = 0; n < 120; n++) {
      cam.step(DT, f);
      expect(cam.position[2]).toBeGreaterThanOrEqual(CHASE.minHeight);
    }
  });

  it('never goes below the lowest height, at the floor with a low setting', () => {
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
