/**
 * What begins a level when nothing is going: the helicopter landed on a pickup pad for a full load, or flown through a
 * level's first ring or opening the way it faces. Each is held to its rule here, on numbers and without the game:
 * a pad starts nothing off the ground, beside it, before the load is full or while it is blocked; an opening starts
 * nothing flown through backwards, round it, or put across it; and where two levels would start the same way, the
 * first in the list wins.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS, theIsland } from '../src/arena';
import { HELICOPTER } from '../src/helicopter';
import { DELIVERY, type Gate, type Lander, type Level, type Ring } from '../src/mission';
import { Starts } from '../src/starts';
import { DT } from './helpers';

const { pads } = theIsland();
const MIDDLE = HELICOPTER.size.middle;
const level = (id: string) => LEVELS.find((l) => l.id === id)!;

/** A new set of starts over the island's pads and the arena's levels, with the helicopter set down on `pad`. */
function starts(levels: readonly Level[] = LEVELS) {
  const s = new Starts(pads, levels);
  /** `seconds` of game with the helicopter landed on `pad`, stopping at the first level begun; which that was. */
  const sit = (pad: number, seconds: number, dx = 0): Level | null => {
    const p = pads[pad];
    const h: Lander = { x: p.x + dx, y: p.y, z: p.z, landed: true };
    for (let f = 0, n = Math.round(seconds / DT); f < n; f++) {
      const began = s.step(DT, h);
      if (began) return began;
    }
    return null;
  };
  /** One step with the helicopter in the air `height` over `pad`. */
  const hover = (pad: number, height = 3): Level | null =>
    s.step(DT, { x: pads[pad].x, y: pads[pad].y, z: pads[pad].z + height, landed: false });
  return { s, sit, hover };
}

describe('starting a delivery', () => {
  it('begins its level only after a full load landed on its pickup pad', () => {
    const { s, sit } = starts();
    expect(sit(4, DELIVERY.load - 0.1)).toBeNull();
    expect(s.loading).toBeCloseTo(DELIVERY.load - 0.1, 6);
    expect(sit(4, 0.3)).toBe(level('first-delivery'));
    expect(s.loading).toBe(0);
  });

  it('begins the level whose pickup it is: each of the four pickup pads, its own level', () => {
    for (const [pad, id] of [
      [4, 'first-delivery'],
      [3, 'over-the-water'],
      [7, 'over-the-range'],
      [2, 'mountain-drop'],
    ] as const)
      expect(starts().sit(pad, DELIVERY.load + 0.2), `pad ${pad}`).toBe(level(id));
  });

  it('counts nothing hovering over the pad, however long, and nothing on the ground beside it', () => {
    const { s, sit, hover } = starts();
    for (let f = 0; f < 300; f++) expect(hover(4, 0.1)).toBeNull();
    expect(s.loading).toBe(0);
    expect(sit(4, 5, pads[4].radius + 4)).toBeNull();
    expect(s.loading).toBe(0);
  });

  it('starts the loading again if the helicopter lifts before it is done', () => {
    const { s, sit, hover } = starts();
    expect(sit(4, 1)).toBeNull();
    expect(s.loading).toBeGreaterThan(0.9);
    hover(4, 2);
    expect(s.loading).toBe(0);
    expect(sit(4, DELIVERY.load - 0.2)).toBeNull();
    expect(sit(4, 0.4)).toBe(level('first-delivery'));
  });

  it('does nothing landed on a pad that is only a drop, or home, or any other that begins nothing', () => {
    const { s, sit } = starts();
    for (const pad of [0, 1, 5, 6]) {
      expect(sit(pad, 4), `pad ${pad}`).toBeNull();
      expect(s.loading).toBe(0);
    }
  });

  it('begins nothing from a level whose first step is not a pickup or an opening', () => {
    const lands: Level = { id: 'lands', name: 'Lands', kind: 'course', steps: [{ kind: 'land', pad: 5 }] };
    expect(starts([lands]).sit(5, 4)).toBeNull();
  });

  it('gives a pad that two levels would start from to the first in the list', () => {
    const pickup = (id: string): Level => ({
      id,
      name: id,
      kind: 'delivery',
      steps: [
        { kind: 'pickup', pad: 4 },
        { kind: 'drop', pad: 1 },
      ],
    });
    const [one, two] = [pickup('one'), pickup('two')];
    expect(starts([one, two]).sit(4, 2)).toBe(one);
    expect(starts([two, one]).sit(4, 2)).toBe(two);
  });

  it('starts nothing from a pad that is blocked, however long it stays, until the helicopter lifts off and lands again', () => {
    const { s, sit, hover } = starts();
    s.blocked = 4;
    expect(sit(4, 6)).toBeNull();
    expect(s.loading).toBe(0);
    expect(s.blocked).toBe(4);
    hover(4, 1);
    expect(s.blocked).toBe(-1);
    expect(sit(4, DELIVERY.load + 0.2)).toBe(level('first-delivery'));
  });

  it('holds only the pad blocked: a pad beside it begins its level', () => {
    const { s, sit } = starts();
    s.blocked = 4;
    expect(sit(3, DELIVERY.load + 0.2)).toBe(level('over-the-water'));
  });

  it('is put back to nothing loading, nothing blocked, by a reset', () => {
    const { s, sit } = starts();
    s.blocked = 2;
    sit(4, 1);
    s.reset();
    expect([s.loading, s.blocked]).toEqual([0, -1]);
  });
});

describe('starting a ring trial or a course', () => {
  const ring = level('ring-trial').steps[0] as Ring;
  const gate = level('under-and-between').steps[0] as Gate;
  /** A point on the opening's axis `along` from its middle, `across` to the side and `up` from its middle, as the skids are put. */
  const at = (o: Ring | Gate, along: number, across = 0, up = 0): Lander => ({
    x: o.x + Math.cos(o.yaw) * along - Math.sin(o.yaw) * across,
    y: o.y + Math.sin(o.yaw) * along + Math.cos(o.yaw) * across,
    z: o.z + up - MIDDLE,
    landed: false,
  });

  it('begins the level when its first ring is flown through the way it faces', () => {
    const { s } = starts();
    expect(s.step(DT, at(ring, -2))).toBeNull();
    expect(s.step(DT, at(ring, 2))).toBe(level('ring-trial'));
  });

  it('begins the course when the opening between the towers is flown through, anywhere inside it', () => {
    const { s } = starts();
    expect(s.step(DT, at(gate, -2, gate.width / 2 - 0.5, 3))).toBeNull();
    expect(s.step(DT, at(gate, 2, gate.width / 2 - 0.5, 3))).toBe(level('under-and-between'));
  });

  it('begins nothing flown through it backwards', () => {
    const { s } = starts();
    expect(s.step(DT, at(ring, 2))).toBeNull();
    expect(s.step(DT, at(ring, -2))).toBeNull();
    expect(s.step(DT, at(gate, 2))).toBeNull();
    expect(s.step(DT, at(gate, -2))).toBeNull();
  });

  it('begins nothing flown round it, past its rim or over or under it', () => {
    const { s } = starts();
    for (const [across, up] of [
      [ring.opening + 1, 0],
      [-ring.opening - 1, 0],
      [0, ring.opening + 1],
      [0, -ring.opening - 1],
    ]) {
      s.reset();
      expect(s.step(DT, at(ring, -2, across, up))).toBeNull();
      expect(s.step(DT, at(ring, 2, across, up))).toBeNull();
    }
    s.reset();
    expect(s.step(DT, at(gate, -2, gate.width / 2 + 1))).toBeNull();
    expect(s.step(DT, at(gate, 2, gate.width / 2 + 1))).toBeNull();
  });

  it('begins nothing for a helicopter put across it, which no flight could do in a step', () => {
    const { s } = starts();
    expect(s.step(DT, at(ring, -6))).toBeNull();
    expect(s.step(DT, at(ring, 6))).toBeNull();
  });

  it('begins nothing from the first step after a reset, which has no step before it to cross from', () => {
    const { s } = starts();
    s.step(DT, at(ring, -2));
    s.reset();
    expect(s.step(DT, at(ring, 2))).toBeNull();
    // and the step after that is a step like any other
    expect(s.step(DT, at(ring, 2.5))).toBeNull();
  });

  it('begins the first of two levels that share an opening', () => {
    const copy: Level = { ...level('ring-trial'), id: 'copy' };
    expect(
      (() => {
        const { s } = starts([copy, level('ring-trial')]);
        s.step(DT, at(ring, -2));
        return s.step(DT, at(ring, 2));
      })(),
    ).toBe(copy);
  });

  it('counts a ring that is not the first step of a level as nothing to begin', () => {
    const second = level('ring-trial').steps[1] as Ring;
    const { s } = starts();
    s.step(DT, at(second, -2));
    expect(s.step(DT, at(second, 2))).toBeNull();
  });

  it('keeps the loader at nothing while an opening is flown through', () => {
    const { s } = starts();
    s.step(DT, at(ring, -2));
    s.step(DT, at(ring, 2));
    expect(s.loading).toBe(0);
  });
});
