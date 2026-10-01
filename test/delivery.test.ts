/**
 * The first level, played headless on the island: the helicopter set down on pads as a player lands on them, and
 * what the game tells read back. The parcel loads only after a full ring on the pickup pad, delivers only after one
 * on the drop pad, and nothing else (hovering, the wrong pad, beside the pad) counts. The clock waits for the first
 * lift-off and stops at the end, and a restart puts it all back.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/arena';
import { DELIVERY, onPad } from '../src/delivery';
import { Game } from '../src/game';
import { HOVER_LIFT, IDLE, type Controls } from '../src/helicopter';
import { seeded } from '../src/random';
import { DT } from './helpers';

/** A game whose events are written down as they are told. */
function played() {
  const told: string[] = [];
  const game = new Game({
    random: seeded(1),
    events: {
      loaded: (pad) => told.push(`loaded ${pad}`),
      delivered: (pad, seconds) => told.push(`delivered ${pad} ${seconds.toFixed(3)}`),
    },
  });
  const { pads } = game.island;
  const { pickup, drop } = LEVELS[0];
  const fly = (seconds: number, controls: Controls = IDLE) => {
    for (let f = 0, n = Math.round(seconds / DT); f < n; f++) game.step(DT, controls);
  };
  /** Set down on a pad, as a landing on it leaves the helicopter: on the ground there, and not a hair above it. */
  const land = (pad: number, dx = 0, dy = 0) => {
    const p = pads[pad];
    game.helicopter.placeAbove(p.x + dx, p.y + dy, 0, p.yaw);
  };
  return { game, told, pads, pickup, drop, fly, land, delivery: game.delivery };
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
    const { delivery, pickup, drop, land, fly } = played();
    expect(delivery.target).toBe(pickup);
    land(pickup);
    fly(DELIVERY.load + 0.1);
    expect(delivery.target).toBe(drop);
    land(drop);
    fly(DELIVERY.load + 0.1);
    expect(delivery.target).toBe(-1);
  });

  it('loads the parcel after a full ring landed on the pickup pad, and tells it', () => {
    const { delivery, told, pickup, land, fly } = played();
    land(pickup);
    fly(DELIVERY.load - 0.1);
    expect(delivery.stage).toBe('pickup');
    expect(delivery.ring).toBeCloseTo(DELIVERY.load - 0.1, 6);
    fly(0.2);
    expect(delivery.stage).toBe('carry');
    expect(delivery.ring).toBe(0);
    expect(told).toEqual([`loaded ${pickup}`]);
  });

  it('empties the ring if the helicopter lifts before it is full', () => {
    const { delivery, pickup, land, fly } = played();
    land(pickup);
    fly(1);
    fly(0.5, { forward: 0, turn: 0, lift: 1 });
    expect(delivery.ring).toBe(0);
    land(pickup);
    fly(DELIVERY.load - 0.2);
    expect(delivery.stage).toBe('pickup');
    // a full ring from where it set down again, and no sooner
    fly(0.3);
    expect(delivery.stage).toBe('carry');
  });

  it('pays no heed to hovering low over the pad, the wrong pad, the pad landed in the wrong order, or beside it', () => {
    const { game, delivery, told, pads, pickup, drop, land, fly } = played();
    land(pickup);
    // a tenth up, nearer the pad than its skids may be from its top and still be on it: only landing counts
    game.helicopter.placeAbove(pads[pickup].x, pads[pickup].y, 0.1, 0);
    fly(3, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(delivery.ring).toBe(0);
    for (const pad of [0, drop, 7]) {
      land(pad);
      fly(3);
    }
    land(pickup, pads[pickup].radius + 4, 0);
    fly(3);
    expect(delivery.stage).toBe('pickup');
    expect(told).toEqual([]);
  });

  it('delivers after a full ring on the drop pad, timed from the first lift-off, and stops the clock', () => {
    const { delivery, told, pickup, drop, land, fly } = played();
    // the clock waits on the ground
    fly(5);
    expect(delivery.time).toBe(0);
    fly(1, { forward: 0, turn: 0, lift: 1 });
    land(pickup);
    fly(DELIVERY.load + 0.1);
    land(drop);
    fly(DELIVERY.load + 0.1);
    expect(delivery.stage).toBe('delivered');
    const seconds = Number(told[1].split(' ')[2]);
    expect(told[1]).toMatch(new RegExp(`^delivered ${drop} `));
    // the lift-off came a frame or so into that second, and the rest was on the ground
    expect(seconds).toBeGreaterThan(1 + 2 * DELIVERY.load);
    expect(seconds).toBeLessThan(1.1 + 2 * (DELIVERY.load + 0.1));
    expect(delivery.time).toBeCloseTo(seconds, 3);
    fly(5, { forward: 1, turn: 0, lift: 1 });
    expect(delivery.time).toBeCloseTo(seconds, 3);
    expect(told).toHaveLength(2);
  });

  it('puts it all back on a restart: home, landed, the parcel waiting and the clock at nothing', () => {
    const { game, delivery, pads, pickup, drop, land, fly } = played();
    fly(1, { forward: 1, turn: 0.5, lift: 1 });
    land(pickup);
    fly(DELIVERY.load + 0.1);
    land(drop);
    fly(DELIVERY.load + 0.1);
    game.restart();
    const h = game.helicopter;
    expect([h.x, h.y, h.yaw, h.landed]).toEqual([pads[0].x, pads[0].y, pads[0].yaw, true]);
    expect([delivery.stage, delivery.ring, delivery.time, delivery.started]).toEqual(['pickup', 0, 0, false]);
    expect(delivery.target).toBe(pickup);
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
