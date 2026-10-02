/**
 * The mission, on its own: a level begun with its first step already done, and the steps after it done in order.
 * A parcel is loaded only after a full load's wait on its pad and unloaded the same, a ring or an opening is passed
 * only flown through the way it faces, and nothing else (hovering, the wrong pad, beside the pad) counts. The clock
 * runs from the level's beginning to its end, a finished or abandoned level leaves nothing going, and what is told
 * is told in order. The mission is handed the helicopter as numbers, so none of it needs the game.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS, theIsland } from '../src/arena';
import { HELICOPTER } from '../src/helicopter';
import {
  crossed,
  DELIVERY,
  Mission,
  onPad,
  RING as RING_RULES,
  type Gate,
  type Lander,
  type Level,
  type Ring,
} from '../src/mission';
import { DT } from './helpers';

const { pads } = theIsland();
const MIDDLE = HELICOPTER.size.middle;

/** A mission whose events are written down as they are told, and what it read of the level at the moment of the end. */
function missioned() {
  const told: string[] = [];
  const during: { level: Level | null }[] = [];
  const mission: Mission = new Mission(pads, {
    started: (id) => told.push(`started ${id}`),
    abandoned: (id) => told.push(`abandoned ${id}`),
    loaded: (pad) => told.push(`loaded ${pad}`),
    delivered: (pad) => told.push(`delivered ${pad}`),
    passed: (ring, of) => told.push(`passed ${ring} ${of}`),
    through: (label) => told.push(`through ${label}`),
    landed: (pad) => told.push(`landed ${pad}`),
    finished: (seconds) => {
      told.push(`finished ${seconds.toFixed(3)}`);
      during.push({ level: mission.level });
    },
  });
  /** Steps `seconds` of game with the helicopter landed on pad `pad`, as set down there. */
  const sit = (pad: number, seconds: number) => {
    const p = pads[pad];
    const h: Lander = { x: p.x, y: p.y, z: p.z, landed: true };
    for (let f = 0, n = Math.round(seconds / DT); f < n; f++) mission.step(DT, h);
  };
  /** Steps along +x from `from` to `to` with the middle at height `z` and `y`, a step at a time, at 30 a second. */
  const flyX = (from: number, to: number, y: number, z: number) => {
    const h: Lander = { x: from, y, z: z - MIDDLE, landed: false };
    for (let x = from; x <= to; x += 0.5) {
      h.x = x;
      mission.step(DT, h);
    }
  };
  return { mission, told, during, sit, flyX };
}

const [PICKUP, DROP] = [4, 1];
const PARCEL: Level = {
  id: 'parcel',
  name: 'Parcel',
  kind: 'delivery',
  steps: [
    { kind: 'pickup', pad: PICKUP },
    { kind: 'drop', pad: DROP },
  ],
};
const TWO_PARCELS: Level = {
  id: 'two-parcels',
  name: 'Two parcels',
  kind: 'delivery',
  steps: [
    { kind: 'pickup', pad: 4 },
    { kind: 'drop', pad: 1 },
    { kind: 'pickup', pad: 1 },
    { kind: 'drop', pad: 2 },
  ],
};

describe('a mission with nothing going', () => {
  it('reads as nothing: no level, no step, no pad, no goal, no ring, nothing aboard, and no parcel waiting', () => {
    const { mission } = missioned();
    expect(mission.level).toBeNull();
    expect(mission.current).toBeUndefined();
    expect(mission.target).toBe(-1);
    expect(mission.goal).toBeNull();
    expect([mission.ringNumber, mission.ringCount]).toEqual([0, 0]);
    expect(mission.carrying).toBe(false);
    expect(mission.waiting).toBe(-1);
    expect([mission.next, mission.loading, mission.time]).toEqual([0, 0, 0]);
  });

  it('does nothing when stepped, however the helicopter sits on a pad, and keeps no time', () => {
    const { mission, told, sit } = missioned();
    sit(PICKUP, 3);
    sit(DROP, 3);
    expect(told).toEqual([]);
    expect([mission.next, mission.loading, mission.time]).toEqual([0, 0, 0]);
  });
});

describe('beginning a level', () => {
  it('makes it the one going with its first step already done, the clock and the loading at nothing', () => {
    const { mission } = missioned();
    mission.begin(PARCEL);
    expect(mission.level).toBe(PARCEL);
    expect([mission.next, mission.loading, mission.time]).toEqual([1, 0, 0]);
    expect(mission.current).toBe(PARCEL.steps[1]);
    expect(mission.target).toBe(DROP);
    expect(mission.carrying).toBe(true);
  });

  it('tells it started, and then the first step done: a pickup loaded', () => {
    const { mission, told } = missioned();
    mission.begin(PARCEL);
    expect(told).toEqual(['started parcel', `loaded ${PICKUP}`]);
  });

  it('tells a ring passed, as the first of the rings, and wants the next', () => {
    const rings: Ring[] = [0, 60, 120].map((x) => ({ kind: 'ring', x, y: 0, z: 200, yaw: 0, opening: 8 }));
    const { mission, told } = missioned();
    mission.begin({ id: 'trial', name: 'Trial', kind: 'rings', steps: rings });
    expect(told).toEqual(['started trial', 'passed 1 3']);
    expect(mission.current).toBe(rings[1]);
    expect([mission.ringNumber, mission.ringCount]).toEqual([2, 3]);
  });

  it('tells an opening flown through, by where it is', () => {
    const gate: Gate = { kind: 'gate', x: 0, y: 0, z: 200, yaw: 0, width: 20, height: 12, label: 'under the bridge' };
    const { mission, told } = missioned();
    mission.begin({ id: 'course', name: 'Course', kind: 'course', steps: [gate, { kind: 'land', pad: 0 }] });
    expect(told).toEqual(['started course', 'through under the bridge']);
    expect(mission.current).toEqual({ kind: 'land', pad: 0 });
  });

  it('finishes at once a level whose only step is its first, and leaves nothing going', () => {
    const { mission, told } = missioned();
    mission.begin({ id: 'one', name: 'One', kind: 'delivery', steps: [{ kind: 'pickup', pad: 4 }] });
    expect(told).toEqual(['started one', 'loaded 4', 'finished 0.000']);
    expect(mission.level).toBeNull();
  });

  it('abandons the level going, told, when another is begun over it, and starts the new from nothing', () => {
    const { mission, told, sit } = missioned();
    mission.begin(PARCEL);
    sit(PICKUP, 2);
    mission.begin(TWO_PARCELS);
    expect(told.slice(2)).toEqual(['abandoned parcel', 'started two-parcels', 'loaded 4']);
    expect([mission.next, mission.loading, mission.time]).toEqual([1, 0, 0]);
  });
});

describe('the clock', () => {
  it('runs from the beginning, on the ground or off it, and at nothing before', () => {
    const { mission, sit, flyX } = missioned();
    sit(0, 2);
    expect(mission.time).toBe(0);
    mission.begin(PARCEL);
    expect(mission.time).toBe(0);
    sit(0, 2);
    expect(mission.time).toBeCloseTo(2, 9);
    flyX(0, 1, 100, 100);
    expect(mission.time).toBeGreaterThan(2);
  });

  it('is the time the level took, told at the end, and starts again from nothing for the next', () => {
    const { mission, told, sit } = missioned();
    mission.begin(PARCEL);
    sit(0, 5);
    sit(DROP, DELIVERY.load + 0.1);
    const seconds = Number(told.at(-1)!.split(' ')[1]);
    expect(told.at(-1)).toMatch(/^finished \d+\.\d{3}$/);
    expect(seconds).toBeGreaterThan(5 + DELIVERY.load - 0.05);
    expect(seconds).toBeLessThan(5 + DELIVERY.load + 0.1);
    mission.begin(PARCEL);
    expect(mission.time).toBe(0);
  });
});

describe('a delivery', () => {
  it('unloads the parcel after a full load landed on the drop pad, and tells it, and the end', () => {
    const { mission, told, during, sit } = missioned();
    mission.begin(PARCEL);
    sit(DROP, DELIVERY.load - 0.1);
    expect(mission.next).toBe(1);
    expect(mission.loading).toBeCloseTo(DELIVERY.load - 0.1, 6);
    sit(DROP, 0.2);
    expect(told.slice(2)).toEqual([`delivered ${DROP}`, expect.stringMatching(/^finished /)]);
    // it was still the level going as the end was told, and nothing is going after
    expect(during[0].level).toBe(PARCEL);
    expect(mission.level).toBeNull();
  });

  it('leaves nothing going when it is finished: no level, no step, the clock, the loading and the place back to nothing', () => {
    const { mission, sit } = missioned();
    mission.begin(PARCEL);
    sit(DROP, DELIVERY.load + 0.1);
    expect(mission.level).toBeNull();
    expect([mission.next, mission.time, mission.loading]).toEqual([0, 0, 0]);
    expect(mission.current).toBeUndefined();
    expect(mission.target).toBe(-1);
    expect(mission.goal).toBeNull();
    expect(mission.carrying).toBe(false);
    expect(mission.waiting).toBe(-1);
  });

  it('starts the loading again if the helicopter lifts before it is done', () => {
    const { mission, sit } = missioned();
    mission.begin(PARCEL);
    sit(DROP, 1);
    mission.step(DT, { x: pads[DROP].x, y: pads[DROP].y, z: pads[DROP].z + 2, landed: false });
    expect(mission.loading).toBe(0);
    sit(DROP, DELIVERY.load - 0.2);
    expect(mission.next).toBe(1);
    sit(DROP, 0.3);
    expect(mission.level).toBeNull();
  });

  it('pays no heed to hovering low over the pad, the wrong pad, or beside it', () => {
    const { mission, told, sit } = missioned();
    mission.begin(PARCEL);
    const p = pads[DROP];
    for (let f = 0; f < 180; f++) mission.step(DT, { x: p.x, y: p.y, z: p.z + 0.1, landed: false });
    for (const pad of [0, PICKUP, 7]) sit(pad, 3);
    for (let f = 0; f < 180; f++) mission.step(DT, { x: p.x + p.radius + 4, y: p.y, z: p.z, landed: true });
    expect(mission.next).toBe(1);
    expect(told).toEqual(['started parcel', `loaded ${PICKUP}`]);
  });

  it('is done a step at a time, in order, and finished only at the last', () => {
    const { mission, told, sit } = missioned();
    mission.begin(TWO_PARCELS);
    const seen: [number, boolean, number][] = [];
    for (const pad of [1, 1, 2]) {
      seen.push([mission.target, mission.carrying, mission.waiting]);
      sit(pad, DELIVERY.load + 0.1);
    }
    // the pad wanted, whether a parcel is aboard, and the pad one stands on: with the second aboard, the first stands
    // where it was delivered
    expect(seen).toEqual([
      [1, true, -1],
      [1, false, 1],
      [2, true, 1],
    ]);
    expect(told.slice(0, 5)).toEqual(['started two-parcels', 'loaded 4', 'delivered 1', 'loaded 1', 'delivered 2']);
    expect(told[5]).toMatch(/^finished /);
    expect(told).toHaveLength(6);
  });

  it('pays no heed to a pad of a step to come, nor one already done', () => {
    const { mission, told, sit } = missioned();
    mission.begin(TWO_PARCELS);
    sit(2, DELIVERY.load + 0.5);
    sit(4, DELIVERY.load + 0.5);
    expect(mission.next).toBe(1);
    expect(told).toEqual(['started two-parcels', 'loaded 4']);
  });

  it('wants the top of the pad of the step being done, the same point written afresh, and nowhere once all are done', () => {
    const { mission, sit } = missioned();
    mission.begin(PARCEL);
    const goal = mission.goal;
    expect([goal!.x, goal!.y, goal!.z]).toEqual([pads[DROP].x, pads[DROP].y, pads[DROP].z]);
    // the same object, moved: it is read every frame, and nothing is made each frame
    mission.begin(TWO_PARCELS);
    expect(mission.goal).toBe(goal);
    sit(1, DELIVERY.load + 0.1);
    sit(1, DELIVERY.load + 0.1);
    expect(mission.goal).toBe(goal);
    expect([goal!.x, goal!.y, goal!.z]).toEqual([pads[2].x, pads[2].y, pads[2].z]);
    sit(2, DELIVERY.load + 0.1);
    expect(mission.goal).toBeNull();
  });

  it('is abandoned with nothing going after, told, and with the parcel that was aboard put back', () => {
    const { mission, told } = missioned();
    mission.begin(PARCEL);
    expect(mission.carrying).toBe(true);
    mission.abandon();
    expect(told).toEqual(['started parcel', `loaded ${PICKUP}`, 'abandoned parcel']);
    expect(mission.level).toBeNull();
    expect([mission.next, mission.time, mission.loading]).toEqual([0, 0, 0]);
    expect(mission.carrying).toBe(false);
    expect(mission.waiting).toBe(-1);
    expect(mission.current).toBeUndefined();
  });

  it('tells nothing for an abandon with nothing going', () => {
    const { mission, told } = missioned();
    mission.abandon();
    expect(told).toEqual([]);
  });
});

describe('on a pad', () => {
  const p = pads[PICKUP];

  it('is landed with its middle on the slab and its skids on the top', () => {
    expect(onPad({ x: p.x, y: p.y, z: p.z, landed: true }, p)).toBe(true);
    expect(onPad({ x: p.x + p.radius * DELIVERY.onSlab * 0.9, y: p.y, z: p.z, landed: true }, p)).toBe(true);
  });

  it('is not over it in the air, near its rim, nor on the ground beside it', () => {
    expect(onPad({ x: p.x, y: p.y, z: p.z + 2, landed: false }, p)).toBe(false);
    expect(onPad({ x: p.x + p.radius * 0.95, y: p.y, z: p.z, landed: true }, p)).toBe(false);
    expect(onPad({ x: p.x + p.radius + 6, y: p.y, z: p.z, landed: true }, p)).toBe(false);
    // a floor that is not the pad's top, as a hillside beside a pad would be
    expect(onPad({ x: p.x, y: p.y, z: p.z + 1, landed: true }, p)).toBe(false);
  });
});

describe('a trial of rings', () => {
  // three rings high over the island, out of reach of any ground, in a line along +x
  const RINGS: Ring[] = [0, 60, 120].map((x) => ({ kind: 'ring', x, y: 0, z: 200, yaw: 0, opening: 8 }));
  const trial: Level = { id: 'trial', name: 'Trial', kind: 'rings', steps: RINGS };

  it('wants the second ring once the first is done, its middle the goal, and no pad', () => {
    const { mission } = missioned();
    mission.begin(trial);
    expect(mission.current).toBe(RINGS[1]);
    expect(mission.target).toBe(-1);
    expect({ ...mission.goal }).toEqual({ x: 60, y: 0, z: 200 });
  });

  it('passes a ring flown through its opening the way it faces, tells it, and wants the next', () => {
    const { mission, told, flyX } = missioned();
    mission.begin(trial);
    flyX(40, 70, 3, 202);
    expect(told.slice(2)).toEqual(['passed 2 3']);
    expect(mission.current).toBe(RINGS[2]);
  });

  it('passes nothing flown round a ring, through it backwards, or through the ring after the one wanted', () => {
    const { mission, told, flyX } = missioned();
    mission.begin(trial);
    // beside it and under it, clear of its tube
    flyX(40, 70, 14.5, 200);
    flyX(40, 70, 0, 185.5);
    // backwards, from the far side
    for (let x = 70, h: Lander = { x, y: 0, z: 200 - MIDDLE, landed: false }; x >= 40; x -= 0.5) {
      h.x = x;
      mission.step(DT, h);
    }
    // the third ring, not yet wanted
    flyX(100, 130, 0, 200);
    expect(told).toEqual(['started trial', 'passed 1 3']);
    expect(mission.next).toBe(1);
  });

  it('passes nothing for a helicopter put from one side to the other, which no flight could do in a step', () => {
    const { mission, told } = missioned();
    mission.begin(trial);
    mission.step(DT, { x: 57, y: 0, z: 200 - MIDDLE, landed: false });
    mission.step(DT, { x: 63, y: 0, z: 200 - MIDDLE, landed: false });
    expect(told).toEqual(['started trial', 'passed 1 3']);
    expect(mission.next).toBe(1);
  });

  it('ends at the last ring, and leaves nothing going', () => {
    const { mission, told, flyX } = missioned();
    mission.begin(trial);
    flyX(40, 140, 0, 200);
    expect(told.slice(0, 4)).toEqual(['started trial', 'passed 1 3', 'passed 2 3', 'passed 3 3']);
    expect(told[4]).toMatch(/^finished \d+\.\d{3}$/);
    expect(mission.level).toBeNull();
    expect(mission.goal).toBeNull();
  });
});

describe('a course: openings to fly through, and a pad to land on', () => {
  // an opening under a bridge and one between two towers, high over the island, then a ring, then home to land on
  const UNDER: Gate = { kind: 'gate', x: 0, y: 0, z: 200, yaw: 0, width: 20, height: 12, label: 'under the bridge' };
  const BETWEEN: Gate = {
    kind: 'gate',
    x: 80,
    y: 0,
    z: 200,
    yaw: 0,
    width: 16,
    height: 30,
    label: 'between the towers',
  };
  const RING: Ring = { kind: 'ring', x: 160, y: 0, z: 200, yaw: 0, opening: 8 };
  const course: Level = {
    id: 'course',
    name: 'Course',
    kind: 'course',
    steps: [UNDER, BETWEEN, RING, { kind: 'land', pad: 0 }],
  };

  it('wants the next opening first, and no pad, with one ring in all', () => {
    const { mission } = missioned();
    mission.begin(course);
    expect(mission.current).toBe(BETWEEN);
    expect({ ...mission.goal }).toEqual({ x: 80, y: 0, z: 200 });
    expect([mission.target, mission.ringNumber, mission.ringCount]).toEqual([-1, 0, 1]);
  });

  it('passes an opening flown through anywhere inside its width and height, the way it faces, and tells it', () => {
    const { mission, told, flyX } = missioned();
    mission.begin(course);
    // near its corner: 7 to the side of 8, and 14 up of 15
    flyX(60, 90, 7, 214);
    expect(told.slice(2)).toEqual(['through between the towers']);
    expect(mission.current).toBe(RING);
  });

  it('passes nothing flown over the opening, beside it, or through it the wrong way', () => {
    const { mission, told, flyX } = missioned();
    mission.begin(course);
    flyX(60, 90, 0, 216);
    flyX(60, 90, 9, 200);
    for (let x = 90, h: Lander = { x, y: 0, z: 200 - MIDDLE, landed: false }; x >= 60; x -= 0.5) {
      h.x = x;
      mission.step(DT, h);
    }
    expect(told).toEqual(['started course', 'through under the bridge']);
    expect(mission.next).toBe(1);
  });

  it('counts the ring among rings, and the openings not at all', () => {
    const { mission, told, flyX } = missioned();
    mission.begin(course);
    flyX(60, 170, 0, 200);
    expect(told.slice(2)).toEqual(['through between the towers', 'passed 1 1']);
    expect(mission.current?.kind).toBe('land');
  });

  it('wants the pad last, which the beacon stands over, and is done the moment the skids touch it', () => {
    const { mission, told, flyX } = missioned();
    mission.begin(course);
    flyX(60, 170, 0, 200);
    const pad = pads[0];
    expect(mission.target).toBe(0);
    expect({ ...mission.goal }).toEqual({ x: pad.x, y: pad.y, z: pad.z });
    // hovered over it, it is not landed on
    for (let f = 0; f < 60; f++) mission.step(DT, { x: pad.x, y: pad.y, z: pad.z + 0.1, landed: false });
    expect(mission.level).toBe(course);
    // and set down on it, it is done that step, with no wait
    mission.step(DT, { x: pad.x, y: pad.y, z: pad.z, landed: true });
    expect(told.slice(-2, -1)).toEqual(['landed 0']);
    expect(told.at(-1)).toMatch(/^finished \d+\.\d{3}$/);
    expect(mission.level).toBeNull();
  });
});

describe('the levels of the arena, begun', () => {
  it.each(LEVELS.map((level) => level.id))('begins %s with its first step done and tells it', (id) => {
    const level = LEVELS.find((l) => l.id === id)!;
    const { mission, told } = missioned();
    mission.begin(level);
    const first = level.steps[0];
    expect(told).toEqual([
      `started ${id}`,
      first.kind === 'pickup'
        ? `loaded ${first.pad}`
        : first.kind === 'ring'
          ? `passed 1 ${level.steps.filter((s) => s.kind === 'ring').length}`
          : `through ${first.kind === 'gate' ? first.label : ''}`,
    ]);
    expect(mission.next).toBe(1);
  });
});

const RULES_JUMP = RING_RULES.jump;

describe('crossing an opening', () => {
  // both face +x, so "across" is y and "up" is z from the middle at (0, 0, 200)
  const ring: Ring = { kind: 'ring', x: 0, y: 0, z: 200, yaw: 0, opening: 8 };
  const gate: Gate = { kind: 'gate', x: 0, y: 0, z: 200, yaw: 0, width: 20, height: 12, label: 'under the bridge' };
  const at = (x: number, y = 0, z = 200) => ({ x, y, z });

  it('counts a move straight through a ring from behind to in front', () => {
    expect(crossed(ring, at(-1), at(1))).toBe(true);
  });

  it('counts nothing for a move through it backwards', () => {
    expect(crossed(ring, at(1), at(-1))).toBe(false);
  });

  it('counts nothing for a crossing of the face outside the ring, across or up', () => {
    expect(crossed(ring, at(-1, 8.5), at(1, 8.5))).toBe(false);
    expect(crossed(ring, at(-1, 0, 208.5), at(1, 0, 208.5))).toBe(false);
    expect(crossed(ring, at(-1, 7.9), at(1, 7.9))).toBe(true);
  });

  it('works out the crossing point on a slanted move, not the ends', () => {
    // the end is outside the opening, but the move crosses the face at y = 8, on its rim
    expect(crossed(ring, at(-1, 6), at(1, 10))).toBe(true);
    // the end is inside, but the move crosses the face at y = 8.25, outside
    expect(crossed(ring, at(-1, 9.5), at(1, 7))).toBe(false);
  });

  it('counts a move across a gate inside its rectangle', () => {
    expect(crossed(gate, at(-1, 9.9, 205.9), at(1, 9.9, 205.9))).toBe(true);
    expect(crossed(gate, at(-1, -9.9, 194.1), at(1, -9.9, 194.1))).toBe(true);
  });

  it('counts nothing across a gate just outside its width or just above or below its height', () => {
    expect(crossed(gate, at(-1, 10.1), at(1, 10.1))).toBe(false);
    expect(crossed(gate, at(-1, -10.1), at(1, -10.1))).toBe(false);
    expect(crossed(gate, at(-1, 0, 206.1), at(1, 0, 206.1))).toBe(false);
    expect(crossed(gate, at(-1, 0, 193.9), at(1, 0, 193.9))).toBe(false);
  });

  it('follows the opening round when it faces another way', () => {
    const turned: Gate = { ...gate, yaw: Math.PI / 2 };
    // faces +y, so across is x
    expect(crossed(turned, at(0, -1), at(0, 1))).toBe(true);
    expect(crossed(turned, at(0, 1), at(0, -1))).toBe(false);
    expect(crossed(turned, at(10.1, -1), at(10.1, 1))).toBe(false);
  });

  it('counts nothing for a move longer than a step could fly, which is a teleport', () => {
    const half = RULES_JUMP / 2;
    expect(crossed(ring, at(-half + 0.01), at(half - 0.01))).toBe(true);
    expect(crossed(ring, at(-half - 0.5), at(half + 0.5))).toBe(false);
    // the jump is the move in three dimensions, not only along the way it is flown
    expect(crossed(ring, at(-2, 0, 200), at(2, 0, 200 + RULES_JUMP))).toBe(false);
  });

  it('counts nothing for a move that starts on the face, and counts one that ends on it', () => {
    expect(crossed(ring, at(0), at(1))).toBe(false);
    expect(crossed(ring, at(-1), at(0))).toBe(true);
  });
});
