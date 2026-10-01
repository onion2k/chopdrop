import { describe, expect, it } from 'vitest';
import { HELICOPTER, Helicopter, IDLE, type Controls } from '../src/helicopter';
import { DT, flatGround, landscape } from './helpers';

const H = HELICOPTER;
const TURN = Math.PI * 2;

/** Level at the sea, which is what most of these are flown over: the island's slopes come after. */
const FLAT = flatGround();

/** A helicopter in the air, at the middle of the ground unless told, facing +x so a flight has room. */
function airborne(x = 0, y = 0, z = 10, yaw = 0) {
  const h = new Helicopter(FLAT);
  h.place(x, y, z, yaw);
  return h;
}

/** Fly `seconds` of the stick as given, calling `each` after every frame. */
function fly(h: Helicopter, controls: Controls, seconds: number, each?: (h: Helicopter) => void) {
  const frames = Math.round(seconds / DT);
  for (let f = 0; f < frames; f++) {
    h.step(DT, controls);
    each?.(h);
  }
}

describe('the helicopter at rest', () => {
  it('starts landed at the start, facing north, its rotor idling', () => {
    const h = new Helicopter(FLAT);
    expect(h.x).toBe(0);
    expect(h.y).toBe(-18);
    expect(h.z).toBe(0);
    expect(h.yaw).toBeCloseTo(Math.PI / 2, 12);
    expect(h.landed).toBe(true);
    expect(h.floor).toBe(0);
    expect(h.rotorSpeed).toBe(H.rotorIdle);
  });

  it('starts landed at the start it is given, on the ground there and not at the sea', () => {
    const h = new Helicopter(
      landscape(() => 40),
      { x: 12, y: -30, yaw: 1 },
    );
    expect([h.x, h.y, h.yaw]).toEqual([12, -30, 1]);
    expect([h.z, h.floor]).toEqual([40, 40]);
    expect(h.landed).toBe(true);
    expect(h.height).toBe(0);
  });

  it('stays put on the ground with nothing asked', () => {
    const h = new Helicopter(FLAT);
    fly(h, IDLE, 2);
    expect([h.x, h.y, h.z, h.vx, h.vy, h.vz]).toEqual([0, -18, 0, 0, 0, 0]);
  });
});

describe('climbing and landing', () => {
  it('climbs at the climb speed with lift held', () => {
    const h = new Helicopter(FLAT);
    fly(h, { forward: 0, turn: 0, lift: 1 }, 1);
    expect(h.vz).toBeCloseTo(H.climbSpeed, 9);
    expect(h.z).toBeGreaterThan(3);
    expect(h.landed).toBe(false);
  });

  it('reaches the ceiling exactly, and stops there however long lift is held', () => {
    const h = new Helicopter(FLAT);
    fly(h, { forward: 0, turn: 0, lift: 1 }, 24, (h) => expect(h.z).toBeLessThanOrEqual(H.ceiling));
    expect(h.z).toBe(H.ceiling);
    expect(h.vz).toBe(0);
  });

  it('holds its height in the air with lift let go', () => {
    const h = new Helicopter(FLAT);
    fly(h, { forward: 0, turn: 0, lift: 1 }, 1);
    fly(h, IDLE, 1);
    const z = h.z;
    fly(h, IDLE, 3);
    expect(h.z).toBeCloseTo(z, 9);
    expect(h.vz).toBe(0);
  });

  it('lands with lift down, and stays on the ground', () => {
    const h = airborne(0, 0, 12);
    fly(h, { forward: 0, turn: 0, lift: -1 }, 3);
    expect(h.z).toBe(0);
    expect(h.vz).toBe(0);
    expect(h.landed).toBe(true);
    fly(h, { forward: 0, turn: 0, lift: -1 }, 1, (h) => expect(h.vz).toBe(0));
  });

  it('clamps a stick pushed past its range', () => {
    const h = new Helicopter(FLAT);
    fly(h, { forward: 9, turn: -9, lift: 9 }, 2, (h) => {
      expect(h.vz).toBeLessThanOrEqual(H.climbSpeed + 1e-9);
      expect(h.speed).toBeLessThanOrEqual(H.maxSpeed + 1e-9);
      expect(Math.abs(h.yawRate)).toBeLessThanOrEqual(H.turnRate + 1e-9);
    });
  });
});

describe('flying forward and back', () => {
  it('reaches top speed along its heading', () => {
    const h = airborne(-25, -25, 10, Math.PI / 4);
    fly(h, { forward: 1, turn: 0, lift: 0 }, 2.5);
    expect(h.speed).toBeCloseTo(H.maxSpeed, 6);
    expect(h.vx).toBeCloseTo(H.maxSpeed * Math.cos(Math.PI / 4), 6);
    expect(h.vy).toBeCloseTo(H.maxSpeed * Math.sin(Math.PI / 4), 6);
    expect(h.yaw).toBeCloseTo(Math.PI / 4, 12);
  });

  it('backs at the back speed, against its heading', () => {
    const h = airborne(20, 0, 10, 0);
    fly(h, { forward: -1, turn: 0, lift: 0 }, 2);
    expect(h.vx).toBeCloseTo(-H.backSpeed, 6);
    expect(h.vy).toBeCloseTo(0, 9);
  });

  it('gets to speed no faster than it accelerates', () => {
    const h = airborne(0, 0, 10, 0);
    fly(h, { forward: 1, turn: 0, lift: 0 }, 0.5);
    expect(h.speed).toBeCloseTo(H.accel * 0.5, 6);
  });

  it('halves its speed in about 0.43 seconds with nothing asked', () => {
    const h = airborne(0, 0, 10, 0);
    h.vx = H.maxSpeed;
    fly(h, IDLE, 0.4333);
    expect(h.speed).toBeGreaterThan(H.maxSpeed * 0.49);
    expect(h.speed).toBeLessThan(H.maxSpeed * 0.51);
  });

  it('lets a drift across its heading die away', () => {
    const h = airborne(0, 0, 10, 0);
    h.vy = 8;
    fly(h, IDLE, 2);
    expect(Math.abs(h.vy)).toBeLessThan(0.05);
  });

  it('never goes past top speed in a hard turn at full speed', () => {
    const h = airborne(0, 0, 10, 0);
    for (const turn of [1, -1, 1]) {
      h.place(0, 0, 10, h.yaw);
      h.vx = H.maxSpeed * Math.cos(h.yaw);
      h.vy = H.maxSpeed * Math.sin(h.yaw);
      fly(h, { forward: 1, turn, lift: 0 }, 1.5, (h) => expect(h.speed).toBeLessThanOrEqual(H.maxSpeed + 1e-9));
    }
  });
});

describe('turning and tilting', () => {
  it('turns left at the turn rate, eased in, and right with the stick the other way', () => {
    const h = airborne();
    fly(h, { forward: 0, turn: 1, lift: 0 }, 0.05);
    expect(h.yawRate).toBeGreaterThan(0);
    expect(h.yawRate).toBeLessThan(H.turnRate);
    fly(h, { forward: 0, turn: 1, lift: 0 }, 1.5);
    expect(h.yawRate).toBeCloseTo(H.turnRate, 3);
    const right = airborne();
    fly(right, { forward: 0, turn: -1, lift: 0 }, 1);
    expect(right.yawRate).toBeLessThan(0);
    expect(right.yaw).toBeLessThan(0);
  });

  it('keeps its heading within a turn, however long it turns', () => {
    const h = airborne();
    fly(h, { forward: 0, turn: 1, lift: 0 }, 10, (h) => {
      expect(h.yaw).toBeGreaterThan(-Math.PI);
      expect(h.yaw).toBeLessThanOrEqual(Math.PI);
    });
  });

  it('banks the left side down in a left turn while moving, and the right in a right', () => {
    const left = airborne();
    fly(left, { forward: 1, turn: 1, lift: 0 }, 1.5);
    expect(left.roll).toBeLessThan(-0.1);
    const right = airborne();
    fly(right, { forward: 1, turn: -1, lift: 0 }, 1.5);
    expect(right.roll).toBeGreaterThan(0.1);
  });

  it('does not bank in a turn when it is not moving', () => {
    const h = airborne();
    fly(h, { forward: 0, turn: 1, lift: 0 }, 2);
    expect(Math.abs(h.roll)).toBeLessThan(0.01);
  });

  it('pitches nose down flying forward and nose up backing, never past the limits', () => {
    const forward = airborne(-20, 0, 10, 0);
    fly(forward, { forward: 1, turn: 0, lift: 0 }, 1.5);
    expect(forward.pitch).toBeGreaterThan(0.2);
    const back = airborne(20, 0, 10, 0);
    fly(back, { forward: -1, turn: 0, lift: 0 }, 1.5);
    expect(back.pitch).toBeLessThan(-0.2);
    for (const [h, sign] of [
      [forward, 1],
      [back, -1],
    ] as const)
      fly(h, { forward: sign, turn: 1, lift: 0 }, 3, (h) => {
        expect(Math.abs(h.pitch)).toBeLessThanOrEqual(H.maxPitch + 1e-9);
        expect(Math.abs(h.roll)).toBeLessThanOrEqual(H.maxRoll + 1e-9);
      });
  });

  it('comes level again once it has landed', () => {
    const h = airborne(-20, 0, 10, 0);
    fly(h, { forward: 1, turn: 1, lift: 0 }, 1.5);
    fly(h, { forward: 0, turn: 0, lift: -1 }, 4);
    expect(h.landed).toBe(true);
    expect(Math.abs(h.pitch)).toBeLessThan(0.001);
    expect(Math.abs(h.roll)).toBeLessThan(0.001);
  });
});

describe('on the ground', () => {
  it('cannot fly forward or back, or turn', () => {
    const h = new Helicopter(FLAT);
    fly(h, { forward: 1, turn: 1, lift: 0 }, 2);
    expect([h.x, h.y, h.speed, h.yawRate]).toEqual([0, -18, 0, 0]);
    expect(h.yaw).toBeCloseTo(Math.PI / 2, 12);
    fly(h, { forward: -1, turn: -1, lift: -1 }, 2);
    expect([h.x, h.y, h.speed]).toEqual([0, -18, 0]);
    expect(h.yaw).toBeCloseTo(Math.PI / 2, 12);
  });

  it('slides to a stop when it is moving', () => {
    const h = new Helicopter(FLAT);
    h.vx = 10;
    h.vy = 4;
    fly(h, IDLE, 0.5);
    expect(h.x).toBeGreaterThan(0);
    expect(h.speed).toBeLessThan(0.3);
    fly(h, IDLE, 3);
    expect(h.speed).toBeLessThan(1e-6);
  });

  it('stops pushing forward the moment it lands', () => {
    const h = airborne(-20, 0, 6, 0);
    fly(h, { forward: 1, turn: 0, lift: -1 }, 3);
    expect(h.landed).toBe(true);
    fly(h, { forward: 1, turn: 0, lift: 0 }, 1);
    expect(h.speed).toBeLessThan(1e-6);
  });
});

describe('the edge of the world', () => {
  it('keeps its middle inside the ground drawn in by its reach', () => {
    const h = new Helicopter(FLAT);
    expect(h.bounds).toEqual({
      minX: FLAT.bounds.minX + H.reach,
      minY: FLAT.bounds.minY + H.reach,
      maxX: FLAT.bounds.maxX - H.reach,
      maxY: FLAT.bounds.maxY - H.reach,
    });
  });

  it('stops on the bound when flown at each edge, at any height', () => {
    for (const z of [1, 14, H.ceiling]) {
      const east = airborne(0, 0, z, 0);
      const north = airborne(0, 0, z, Math.PI / 2);
      const west = airborne(0, 0, z, Math.PI);
      const south = airborne(0, 0, z, -Math.PI / 2);
      for (const h of [east, north, west, south]) fly(h, { forward: 1, turn: 0, lift: 0 }, 6);
      expect(east.x).toBe(east.bounds.maxX);
      expect(north.y).toBe(north.bounds.maxY);
      expect(west.x).toBe(west.bounds.minX);
      expect(south.y).toBe(south.bounds.minY);
      expect(east.vx).toBeLessThanOrEqual(0);
      expect(west.vx).toBeGreaterThanOrEqual(0);
    }
  });

  it('slides along an edge it meets at an angle', () => {
    const h = airborne(new Helicopter(FLAT).bounds.maxX - 0.5, 0, 10, Math.PI / 4);
    fly(h, { forward: 1, turn: 0, lift: 0 }, 0.5);
    expect(h.x).toBe(h.bounds.maxX);
    const y = h.y;
    fly(h, { forward: 1, turn: 0, lift: 0 }, 0.5);
    expect(h.x).toBe(h.bounds.maxX);
    expect(h.y).toBeGreaterThan(y + 1);
  });

  it('stops in a corner on both bounds', () => {
    const h = airborne(0, 0, 10, Math.PI / 4);
    fly(h, { forward: 1, turn: 0, lift: 0 }, 8);
    expect(h.x).toBe(h.bounds.maxX);
    expect(h.y).toBe(h.bounds.maxY);
  });
});

/** Ground that rises to +x at `rise` a unit, from nothing at x = 0 and level behind it. */
function ramp(rise: number) {
  return landscape((x) => Math.max(0, x) * rise);
}

describe('on land that is not flat', () => {
  it('stands on the highest ground under its skids, so its belly is clear of the slope', () => {
    const h = new Helicopter(ramp(0.5), { x: 10, y: 0, yaw: 0 });
    // the middle is at 5 and the uphill skids at 5.9, which is where it rests
    expect(h.floor).toBeCloseTo(0.5 * (10 + H.footprint), 9);
    expect(h.floorAt(10, 0)).toBe(h.floor);
    expect(h.z).toBe(h.floor);
    expect(h.landed).toBe(true);
  });

  it('lays itself along the slope when it is on the ground: nose up on a rise ahead, the left side up on a rise to the left', () => {
    const up = new Helicopter(ramp(0.2), { x: 10, y: 0, yaw: 0 });
    expect(up.pitch).toBeCloseTo(-Math.atan(0.2), 9);
    expect(up.roll).toBeCloseTo(0, 9);
    // facing -y, the left is +x, which is uphill
    const left = new Helicopter(ramp(0.2), { x: 10, y: 0, yaw: -Math.PI / 2 });
    expect(left.pitch).toBeCloseTo(0, 9);
    expect(left.roll).toBeCloseTo(Math.atan(0.2), 9);
    const steep = new Helicopter(ramp(2), { x: 10, y: 0, yaw: 0 });
    expect(steep.pitch).toBe(-H.maxPitch);
  });

  it('eases to the slope after it lands on one, and never past its limits', () => {
    const h = new Helicopter(ramp(0.2));
    h.place(10, 0, 30, 0);
    fly(h, { forward: 0, turn: 0, lift: -1 }, 5, (h) => {
      expect(Math.abs(h.pitch)).toBeLessThanOrEqual(H.maxPitch + 1e-9);
      expect(Math.abs(h.roll)).toBeLessThanOrEqual(H.maxRoll + 1e-9);
    });
    expect(h.landed).toBe(true);
    expect(h.pitch).toBeCloseTo(-Math.atan(0.2), 3);
  });

  it('follows the ground under its skids when it slides, up a slope and down one', () => {
    const h = new Helicopter(ramp(0.3), { x: 10, y: 0, yaw: 0 });
    h.vx = 10;
    fly(h, IDLE, 1, (h) => {
      expect(h.z).toBe(h.floor);
      expect(h.vz).toBe(0);
    });
    expect(h.x).toBeGreaterThan(10);
    expect(h.floor).toBeGreaterThan(0.3 * (10 + H.footprint));
    h.vx = -10;
    fly(h, IDLE, 1, (h) => expect(h.z).toBe(h.floor));
    expect(h.floor).toBeLessThan(0.3 * (h.x + H.footprint) + 1e-9);
  });

  it('is set on land that rises to meet it in the air, and loses its thrust on it', () => {
    const h = new Helicopter(ramp(0.8), { x: 0, y: 0, yaw: 0 });
    h.place(0, 0, 6, 0);
    fly(h, { forward: 1, turn: 0, lift: 0 }, 3, (h) => {
      expect(h.z).toBeGreaterThanOrEqual(h.floor);
      expect(h.vz).toBeGreaterThanOrEqual(0);
    });
    expect(h.landed).toBe(true);
    expect(h.x).toBeGreaterThan(4);
    // on the slope with the stick forward it is dragging its skids, and is slowing, not flying up it
    expect(h.speed).toBeLessThan(H.maxSpeed / 2);
  });

  it('flies over a ridge if it climbs, and is never in the ground', () => {
    const ridge = landscape((x) => Math.max(0, 12 - Math.abs(x - 40) * 0.8));
    const h = new Helicopter(ridge);
    h.place(0, 0, 4, 0);
    fly(h, { forward: 1, turn: 0, lift: 1 }, 6, (h) => {
      expect(h.z).toBeGreaterThanOrEqual(h.floor);
      expect(h.floor).toBe(h.floorAt(h.x, h.y));
    });
    expect(h.x).toBeGreaterThan(60);
    expect(h.landed).toBe(false);
  });

  it('places itself above the ground there, kept between the ground and the ceiling', () => {
    const h = new Helicopter(ramp(0.5));
    h.placeAbove(20, 0, 7, 0.5);
    expect(h.floor).toBeCloseTo(0.5 * (20 + H.footprint), 9);
    expect(h.height).toBeCloseTo(7, 9);
    h.placeAbove(20, 0, -3, 0);
    expect(h.landed).toBe(true);
    h.placeAbove(20, 0, 1e4, 0);
    expect(h.z).toBe(H.ceiling);
    h.place(20, 0, -50, 0);
    expect(h.z).toBe(h.floor);
    h.placeAbove(1e4, 1e4, 3, 0);
    expect([h.x, h.y]).toEqual([h.bounds.maxX, h.bounds.maxY]);
    expect(h.height).toBeCloseTo(3, 9);
  });
});

describe('the rotor', () => {
  it('idles on the ground, and winds up to full as soon as it climbs', () => {
    const h = new Helicopter(FLAT);
    fly(h, IDLE, 3);
    expect(h.rotorSpeed).toBeCloseTo(H.rotorIdle, 9);
    fly(h, { forward: 0, turn: 0, lift: 1 }, 0.1);
    expect(h.rotorSpeed).toBeGreaterThan(H.rotorIdle);
    expect(h.rotorSpeed).toBeLessThan(H.rotorFull);
    fly(h, { forward: 0, turn: 0, lift: 1 }, 8);
    expect(h.rotorSpeed).toBeCloseTo(H.rotorFull, 2);
  });

  it('winds up on the first step a lift-off is asked for, while the skids are still on the ground', () => {
    // the rotor is what shows the player the stick was heard, before the climb can
    const h = new Helicopter(FLAT);
    h.step(DT, { forward: 0, turn: 0, lift: 1 });
    expect(h.rotorSpeed).toBeGreaterThan(H.rotorIdle);
  });

  it('stays at full speed in the air with nothing asked, and slows after it lands', () => {
    const h = airborne(0, 0, 10, 0);
    h.rotorSpeed = H.rotorFull;
    fly(h, IDLE, 3);
    expect(h.rotorSpeed).toBeCloseTo(H.rotorFull, 9);
    fly(h, { forward: 0, turn: 0, lift: -1 }, 4);
    expect(h.landed).toBe(true);
    fly(h, IDLE, 5);
    expect(h.rotorSpeed).toBeCloseTo(H.rotorIdle, 2);
  });

  it('turns by its speed, kept within a turn, and the tail rotor turns at three times it', () => {
    const h = airborne();
    h.rotorSpeed = H.rotorFull;
    const wrapped = (a: number) => a - TURN * Math.floor(a / TURN);
    for (let f = 0; f < 600; f++) {
      h.step(DT, IDLE);
      expect(h.rotor).toBeGreaterThanOrEqual(0);
      expect(h.rotor).toBeLessThan(TURN);
      expect(h.tailRotor).toBeGreaterThanOrEqual(0);
      expect(h.tailRotor).toBeLessThan(TURN);
      expect(h.tailRotor).toBeCloseTo(wrapped(h.rotor * H.tailRotorRatio), 9);
    }
    h.rotor = 1;
    expect(h.tailRotor).toBeCloseTo(3, 12);
  });

  it('advances by its speed a frame', () => {
    const h = airborne();
    h.rotorSpeed = H.rotorFull;
    h.step(DT, IDLE);
    expect(h.rotor).toBeCloseTo(H.rotorFull * DT, 9);
  });
});

describe('placing it', () => {
  it('puts it where asked, stopped and level, and leaves the rotor alone', () => {
    const h = airborne(-20, 0, 10, 0);
    fly(h, { forward: 1, turn: 1, lift: 1 }, 1);
    const rotor = h.rotor;
    h.place(5, 6, 7, 1);
    expect([h.x, h.y, h.z, h.yaw]).toEqual([5, 6, 7, 1]);
    expect([h.vx, h.vy, h.vz, h.yawRate, h.pitch, h.roll]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(h.rotor).toBe(rotor);
  });

  it('keeps it inside the bounds and between the ground and the ceiling', () => {
    const h = new Helicopter(FLAT);
    h.place(1e4, -1e4, 1e4, 0);
    expect([h.x, h.y, h.z]).toEqual([h.bounds.maxX, h.bounds.minY, H.ceiling]);
    h.place(-1e4, 1e4, -5, 0);
    expect([h.x, h.y, h.z]).toEqual([h.bounds.minX, h.bounds.maxY, 0]);
  });

  it('wraps the heading into a turn', () => {
    const h = new Helicopter(FLAT);
    h.place(0, 0, 5, 3 * Math.PI);
    expect(h.yaw).toBeCloseTo(Math.PI, 12);
    h.place(0, 0, 5, -Math.PI);
    expect(h.yaw).toBeCloseTo(Math.PI, 12);
    h.place(0, 0, 5, TURN + 0.5);
    expect(h.yaw).toBeCloseTo(0.5, 12);
  });
});
