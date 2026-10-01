/** The scene's helicopter groups: six of them, placed from a pose as the frame, the mast and the tail say. No GPU is needed, since meshes are plain arrays. */
import { describe, expect, it } from 'vitest';
import { HELICOPTER } from '../src/helicopter';
import { helicopterBody, helicopterDark, helicopterGlass, helicopterTrim, mainRotor, tailRotor } from '../src/meshes';
import { ARENA_BOX, Scene, type HelicopterPose } from '../src/scene';

const pose = (over: Partial<HelicopterPose> = {}): HelicopterPose => ({
  x: 10,
  y: -20,
  z: 6,
  yaw: 0,
  pitch: 0,
  roll: 0,
  rotor: 0,
  tailRotor: 0,
  ...over,
});

const translation = (m: Float32Array) => [m[12], m[13], m[14]];

describe('dynamic', () => {
  it('gives six groups, each over its own pool of one placement', () => {
    const scene = new Scene();
    const groups = scene.dynamic();
    expect(groups).toHaveLength(6);
    expect(scene.pools).toHaveLength(6);
    groups.forEach((g, k) => {
      expect(g.matrices).toBe(scene.pools[k]);
      expect(g.matrices).toHaveLength(16);
      expect(g.count).toBe(1);
    });
  });

  it('is the same six pools when asked twice, not twelve', () => {
    const scene = new Scene();
    scene.dynamic();
    scene.dynamic();
    expect(scene.pools).toHaveLength(6);
  });

  it('paints the body and its trim, the glass and the dark metal, the rotors in the dark', () => {
    const groups = new Scene().dynamic();
    expect(groups.map((g) => g.albedo)).toEqual([
      [0.85, 0.33, 0.17],
      [0.93, 0.89, 0.78],
      [0.17, 0.29, 0.39],
      [0.17, 0.17, 0.19],
      [0.17, 0.17, 0.19],
      [0.17, 0.17, 0.19],
    ]);
    expect(groups.map((g) => g.roughness)).toEqual([0.5, 0.5, 0.15, 0.6, 0.6, 0.6]);
  });
});

describe('write', () => {
  it('puts the body at the pose, and the trim, glass and dark the same', () => {
    const scene = new Scene();
    scene.dynamic();
    scene.write(pose({ yaw: 0.8, pitch: 0.1, roll: -0.2 }));
    const [body, trim, glass, dark] = scene.pools;
    expect(translation(body)).toEqual([10, -20, 6]);
    expect(Array.from(trim)).toEqual(Array.from(body));
    expect(Array.from(glass)).toEqual(Array.from(body));
    expect(Array.from(dark)).toEqual(Array.from(body));
  });

  it('puts the main rotor at the mast top above a level body', () => {
    const scene = new Scene();
    scene.dynamic();
    scene.write(pose({ rotor: 1.3 }));
    const t = translation(scene.pools[4]);
    expect(t[0]).toBeCloseTo(10, 5);
    expect(t[1]).toBeCloseTo(-20, 5);
    expect(t[2]).toBeCloseTo(6 + HELICOPTER.size.mastTop, 5);
  });

  it('puts the tail rotor at its place, turned by the yaw', () => {
    const scene = new Scene();
    scene.dynamic();
    const yaw = Math.PI / 2;
    scene.write(pose({ yaw }));
    const [ax, ay, az] = HELICOPTER.size.tailRotorAt;
    const t = translation(scene.pools[5]);
    expect(t[0]).toBeCloseTo(10 + ax * Math.cos(yaw) - ay * Math.sin(yaw), 5);
    expect(t[1]).toBeCloseTo(-20 + ax * Math.sin(yaw) + ay * Math.cos(yaw), 5);
    expect(t[2]).toBeCloseTo(6 + az, 5);
  });

  it("spins the tail rotor about the helicopter's left-right axis, so its own Y axis stays put", () => {
    const scene = new Scene();
    scene.dynamic();
    scene.write(pose({ tailRotor: Math.PI / 2 }));
    const m = scene.pools[5];
    // the second column is where the part's Y axis points: still the body's left, which is +Y at yaw 0
    expect(m[4]).toBeCloseTo(0, 6);
    expect(m[5]).toBeCloseTo(1, 6);
    expect(m[6]).toBeCloseTo(0, 6);
    // and a quarter turn about Y has taken its X axis down to −Z, out of the level
    expect(m[2]).toBeCloseTo(-1, 6);
  });

  it('turns the rotor with its angle, and adds no pools', () => {
    const scene = new Scene();
    scene.dynamic();
    scene.write(pose({ rotor: 0 }));
    const before = Array.from(scene.pools[4]);
    scene.write(pose({ rotor: Math.PI / 2 }));
    expect(Array.from(scene.pools[4])).not.toEqual(before);
    expect(scene.pools).toHaveLength(6);
  });
});

describe('meshes', () => {
  it.each([
    ['body', helicopterBody],
    ['trim', helicopterTrim],
    ['glass', helicopterGlass],
    ['dark', helicopterDark],
    ['main rotor', mainRotor],
    ['tail rotor', tailRotor],
  ])('the %s has triangles', (_name, make) => {
    const mesh = make();
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.positions.length).toBe(mesh.normals.length);
  });

  it('keeps the rotor as long as its radius says, and the dark reaching the hub', () => {
    const xs = Array.from(mainRotor().positions).filter((_, k) => k % 3 === 0);
    expect(Math.max(...xs)).toBeCloseTo(HELICOPTER.size.rotorRadius, 5);
    expect(Math.min(...xs)).toBeCloseTo(-HELICOPTER.size.rotorRadius, 5);
    const zs = Array.from(helicopterDark().positions).filter((_, k) => k % 3 === 2);
    expect(Math.max(...zs)).toBeCloseTo(HELICOPTER.size.mastTop, 5);
    expect(Math.min(...zs)).toBeCloseTo(0, 5);
  });
});

describe('ARENA_BOX', () => {
  it('reaches the helicopter at its ceiling', () => {
    expect(ARENA_BOX.max[2]).toBe(HELICOPTER.ceiling + HELICOPTER.size.height);
  });
});
