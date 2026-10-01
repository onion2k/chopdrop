/**
 * The first level, played headless on the island: the helicopter set down on pads as a player lands on them, and
 * what the game tells read back. The parcel loads only after a full load's wait on the pickup pad, delivers only after one
 * on the drop pad, and nothing else (hovering, the wrong pad, beside the pad) counts. The clock waits for the first
 * lift-off and stops at the end, and a restart puts it all back.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/arena';
import { Game } from '../src/game';
import { HELICOPTER, HOVER_LIFT, IDLE, type Controls } from '../src/helicopter';
import { DELIVERY, onPad, type Level, type Ring } from '../src/mission';
import { seeded } from '../src/random';
import { DT, padsOf } from './helpers';

/** A game whose events are written down as they are told. */
function played() {
  const told: string[] = [];
  const game = new Game({
    random: seeded(1),
    events: {
      loaded: (pad) => told.push(`loaded ${pad}`),
      delivered: (pad) => told.push(`delivered ${pad}`),
      finished: (id, seconds) => told.push(`finished ${id} ${seconds.toFixed(3)}`),
    },
  });
  const { pads } = game.island;
  const [pickup, drop] = padsOf(LEVELS[0]);
  const fly = (seconds: number, controls: Controls = IDLE) => {
    for (let f = 0, n = Math.round(seconds / DT); f < n; f++) game.step(DT, controls);
  };
  /** Set down on a pad, as a landing on it leaves the helicopter: on the ground there, and not a hair above it. */
  const land = (pad: number, dx = 0, dy = 0) => {
    const p = pads[pad];
    game.helicopter.placeAbove(p.x + dx, p.y + dy, 0, p.yaw);
  };
  return { game, told, pads, pickup, drop, fly, land, mission: game.mission };
}

describe('the first level', () => {
  it('waits on the meadow pad, 187 from home, and is wanted on the hilltop pad 187 beyond it', () => {
    const { pads, pickup, drop } = played();
    const apart = (a: number, b: number) => Math.hypot(pads[a].x - pads[b].x, pads[a].y - pads[b].y);
    expect(pads[pickup].site).toBe('meadow');
    expect(apart(0, pickup)).toBeCloseTo(187, -1);
    expect(pads[drop].site).toBe('hilltop');
    expect(apart(pickup, drop)).toBeCloseTo(187, -1);
  });

  it('wants the pickup pad, then the drop pad, then none', () => {
    const { mission, pickup, drop, land, fly } = played();
    expect(mission.target).toBe(pickup);
    land(pickup);
    fly(DELIVERY.load + 0.1);
    expect(mission.target).toBe(drop);
    land(drop);
    fly(DELIVERY.load + 0.1);
    expect(mission.target).toBe(-1);
  });

  it('loads the parcel after a full load landed on the pickup pad, and tells it', () => {
    const { mission, told, pickup, land, fly } = played();
    land(pickup);
    fly(DELIVERY.load - 0.1);
    expect(mission.next).toBe(0);
    expect(mission.loading).toBeCloseTo(DELIVERY.load - 0.1, 6);
    fly(0.2);
    expect(mission.next).toBe(1);
    expect(mission.loading).toBe(0);
    expect(told).toEqual([`loaded ${pickup}`]);
  });

  it('starts the loading again if the helicopter lifts before it is done', () => {
    const { mission, pickup, land, fly } = played();
    land(pickup);
    fly(1);
    fly(0.5, { forward: 0, turn: 0, lift: 1 });
    expect(mission.loading).toBe(0);
    land(pickup);
    fly(DELIVERY.load - 0.2);
    expect(mission.next).toBe(0);
    // a full load from where it set down again, and no sooner
    fly(0.3);
    expect(mission.next).toBe(1);
  });

  it('pays no heed to hovering low over the pad, the wrong pad, the pad landed in the wrong order, or beside it', () => {
    const { game, mission, told, pads, pickup, drop, land, fly } = played();
    land(pickup);
    // a tenth up, nearer the pad than its skids may be from its top and still be on it: only landing counts
    game.helicopter.placeAbove(pads[pickup].x, pads[pickup].y, 0.1, 0);
    fly(3, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(mission.loading).toBe(0);
    for (const pad of [0, drop, 7]) {
      land(pad);
      fly(3);
    }
    land(pickup, pads[pickup].radius + 4, 0);
    fly(3);
    expect(mission.next).toBe(0);
    expect(told).toEqual([]);
  });

  it('delivers after a full load on the drop pad, timed from the first lift-off, and stops the clock', () => {
    const { mission, told, pickup, drop, land, fly } = played();
    // the clock waits on the ground
    fly(5);
    expect(mission.time).toBe(0);
    fly(1, { forward: 0, turn: 0, lift: 1 });
    land(pickup);
    fly(DELIVERY.load + 0.1);
    land(drop);
    fly(DELIVERY.load + 0.1);
    expect(mission.done).toBe(true);
    expect(told.slice(0, 2)).toEqual([`loaded ${pickup}`, `delivered ${drop}`]);
    const seconds = Number(told[2].split(' ')[2]);
    expect(told[2]).toMatch(/^finished first-delivery /);
    // the lift-off came a frame or so into that second, and the rest was on the ground
    expect(seconds).toBeGreaterThan(1 + 2 * DELIVERY.load);
    expect(seconds).toBeLessThan(1.1 + 2 * (DELIVERY.load + 0.1));
    expect(mission.time).toBeCloseTo(seconds, 3);
    fly(5, { forward: 1, turn: 0, lift: 1 });
    expect(mission.time).toBeCloseTo(seconds, 3);
    expect(told).toHaveLength(3);
  });

  it('puts it all back on a restart: home, landed, the parcel waiting and the clock at nothing', () => {
    const { game, mission, pads, pickup, drop, land, fly } = played();
    fly(1, { forward: 1, turn: 0.5, lift: 1 });
    land(pickup);
    fly(DELIVERY.load + 0.1);
    land(drop);
    fly(DELIVERY.load + 0.1);
    game.restart();
    const h = game.helicopter;
    expect([h.x, h.y, h.yaw, h.landed]).toEqual([pads[0].x, pads[0].y, pads[0].yaw, true]);
    expect([mission.next, mission.loading, mission.time, mission.started]).toEqual([0, 0, 0, false]);
    expect(mission.target).toBe(pickup);
  });
});

describe('where it wants the helicopter', () => {
  it('is the top of the pad of the step being done, the same point written afresh, and nowhere once all are done', () => {
    const { mission, pads, pickup, drop, land, fly } = played();
    const goal = mission.goal;
    expect(goal).not.toBeNull();
    expect([goal!.x, goal!.y, goal!.z]).toEqual([pads[pickup].x, pads[pickup].y, pads[pickup].z]);
    fly(0.5, { forward: 0, turn: 0, lift: 1 });
    land(pickup);
    fly(DELIVERY.load + 0.1);
    // the same object, moved: it is read every frame, and nothing is made each frame
    expect(mission.goal).toBe(goal);
    expect([goal!.x, goal!.y, goal!.z]).toEqual([pads[drop].x, pads[drop].y, pads[drop].z]);
    land(drop);
    fly(DELIVERY.load + 0.1);
    expect(mission.goal).toBeNull();
  });
});

describe('on a pad', () => {
  const { game, pads, pickup } = played();
  const p = pads[pickup];
  const h = game.helicopter;

  it('is landed with its middle on the slab and its skids on the top', () => {
    h.placeAbove(p.x, p.y, 0, 0);
    expect(onPad(h, p)).toBe(true);
    h.placeAbove(p.x + p.radius * DELIVERY.onSlab * 0.9, p.y, 0, 0);
    expect(onPad(h, p)).toBe(true);
  });

  it('is not over it in the air, near its rim, nor on the ground beside it', () => {
    h.placeAbove(p.x, p.y, 2, 0);
    expect(onPad(h, p)).toBe(false);
    h.placeAbove(p.x + p.radius * 0.95, p.y, 0, 0);
    expect(onPad(h, p)).toBe(false);
    h.placeAbove(p.x + p.radius + 6, p.y, 0, 0);
    expect(onPad(h, p)).toBe(false);
    // a floor that is not the pad's top, as a hillside beside a pad would be
    expect(onPad({ x: p.x, y: p.y, z: p.z + 1, landed: true }, p)).toBe(false);
  });
});

describe('a level of more steps', () => {
  // two parcels: one from the meadow to the hilltop, then one from the hilltop on to the lakeside
  const level: Level = {
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

  it('is done a step at a time, in order, and finished only at the last', () => {
    const { game, told, land, fly } = played();
    const mission = game.mission;
    mission.play(level);
    const seen: [number, boolean, number][] = [];
    for (const pad of padsOf(level)) {
      seen.push([mission.target, mission.carrying, mission.waiting]);
      fly(0.5, { forward: 0, turn: 0, lift: 1 });
      land(pad);
      fly(DELIVERY.load + 0.1);
    }
    seen.push([mission.target, mission.carrying, mission.waiting]);
    // the pad wanted, whether a parcel is aboard, and the pad one stands on: with the second aboard, the first stands
    // where it was delivered
    expect(seen).toEqual([
      [4, false, 4],
      [1, true, -1],
      [1, false, 1],
      [2, true, 1],
      [-1, false, 2],
    ]);
    expect(told.slice(0, 4)).toEqual(['loaded 4', 'delivered 1', 'loaded 1', 'delivered 2']);
    expect(told[4]).toMatch(/^finished /);
    expect(told).toHaveLength(5);
    expect(mission.done).toBe(true);
  });

  it('pays no heed to a pad of a step to come, nor one already done', () => {
    const { game, told, land, fly } = played();
    game.mission.play(level);
    for (const pad of [1, 2]) {
      land(pad);
      fly(DELIVERY.load + 0.5);
    }
    expect(game.mission.next).toBe(0);
    land(4);
    fly(DELIVERY.load + 0.1);
    land(4);
    fly(DELIVERY.load + 0.5);
    expect(game.mission.next).toBe(1);
    expect(told).toEqual(['loaded 4']);
  });

  it('is flown from the start when it is handed in, whatever was flown before', () => {
    const { game, land, fly } = played();
    land(4);
    fly(DELIVERY.load + 0.1);
    game.mission.time = 12;
    game.mission.started = true;
    game.mission.play(level);
    expect([
      game.mission.level,
      game.mission.next,
      game.mission.loading,
      game.mission.time,
      game.mission.started,
    ]).toEqual([level, 0, 0, 0, false]);
  });
});

describe('a trial of rings', () => {
  // three rings high over the island, out of reach of any ground, in a line along +x
  const RINGS: Ring[] = [0, 60, 120].map((x) => ({ kind: 'ring', x, y: 0, z: 200, yaw: 0, opening: 8 }));
  const trial: Level = { id: 'trial', name: 'Trial', kind: 'rings', steps: RINGS };
  /** A game flying the trial, its events written down, with the helicopter set so its middle is at (x, y, z), facing yaw. */
  const flying = () => {
    const told: string[] = [];
    const game = new Game({
      random: seeded(1),
      levels: [trial],
      events: {
        passed: (ring, of) => told.push(`passed ${ring} ${of}`),
        finished: (id, seconds) => told.push(`finished ${id} ${seconds.toFixed(2)}`),
      },
    });
    game.play('trial');
    const h = game.helicopter;
    const put = (x: number, y: number, z: number, yaw = 0) => {
      h.placeAbove(x, y, 0, yaw);
      h.z = z - HELICOPTER.size.middle;
      h.vz = 0;
    };
    /** Flown level at full speed along the heading for `seconds`, holding the height. */
    const fly = (seconds: number, controls: Controls = { forward: 1, turn: 0, lift: HOVER_LIFT }) => {
      for (let f = 0, n = Math.round(seconds / DT); f < n; f++) game.step(DT, controls);
    };
    return { game, told, mission: game.mission, h, put, fly };
  };

  it('wants the first ring, its middle the goal, and no pad', () => {
    const { mission } = flying();
    expect(mission.current).toBe(RINGS[0]);
    expect(mission.target).toBe(-1);
    expect({ ...mission.goal }).toEqual({ x: 0, y: 0, z: 200 });
    expect([mission.ringNumber, mission.ringCount]).toEqual([1, 3]);
  });

  it('passes a ring flown through its opening the way it faces, tells it, and wants the next', () => {
    const { mission, told, put, fly } = flying();
    // from rest it is 31 on in two seconds: through the first, and short of the second
    put(-20, 3, 202);
    fly(2);
    expect(told).toEqual(['passed 1 3']);
    expect(mission.current).toBe(RINGS[1]);
    expect([mission.ringNumber, mission.ringCount]).toEqual([2, 3]);
  });

  it('passes nothing flown round a ring, through it backwards, or through the ring after the one wanted', () => {
    const { mission, told, put, fly } = flying();
    // beside it and under it, clear of its tube
    put(-20, 14.5, 200);
    fly(2);
    put(-20, 0, 185.5);
    fly(2);
    // backwards, from the far side
    put(20, 0, 200, Math.PI);
    fly(2);
    // the second ring, not yet wanted
    put(40, 0, 200);
    fly(2);
    expect(told).toEqual([]);
    expect(mission.next).toBe(0);
  });

  it('passes nothing for a helicopter put from one side to the other, which no flight could do in a step', () => {
    const { mission, told, put, game } = flying();
    put(-3, 0, 200);
    game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    put(3, 0, 200);
    game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(told).toEqual([]);
    expect(mission.next).toBe(0);
  });

  it('ends at the last ring, timed from the first lift-off, and wants nothing after', () => {
    const { mission, told, put, fly } = flying();
    put(-20, 0, 200);
    fly(7);
    expect(told.slice(0, 3)).toEqual(['passed 1 3', 'passed 2 3', 'passed 3 3']);
    expect(told[3]).toMatch(/^finished trial \d+\.\d\d$/);
    expect(mission.done).toBe(true);
    expect(mission.goal).toBeNull();
    expect(mission.carrying).toBe(false);
    expect(mission.waiting).toBe(-1);
  });
});
