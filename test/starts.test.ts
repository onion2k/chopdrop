/**
 * What begins a level when nothing is going: the helicopter landed on a pickup pad for a full load, or flown through a
 * level's first ring or opening the way it faces. Each is held to its rule here, on numbers and without the game:
 * a pad starts nothing off the ground, beside it, before the load is full or while it is blocked; an opening starts
 * nothing flown through backwards, round it, or put across it; and where two levels would start the same way, the
 * first in the list wins.
 */
import { describe, expect, it } from 'vitest';
import { FIRES, LEVELS, RESCUE_SPOTS, theIsland } from '../src/arena';
import { FIRE, Fire } from '../src/fire';
import { HELICOPTER } from '../src/helicopter';
import { BOARD, DELIVERY, WINCH, type FireWatch, type Gate, type Lander, type Level, type Ring } from '../src/mission';
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

describe('starting a rescue by the winch', () => {
  const spot = RESCUE_SPOTS.find((s) => s.id === 'ledge-rescue')!;
  const ground = theIsland().ground;
  const groundAt = (x: number, y: number) => ground.heightAt(x, y);
  /** A set of starts over the arena's levels, with the helicopter hovering `up` over the ground at `across` from the first spot. */
  function rescues() {
    const s = new Starts(pads, LEVELS, groundAt);
    const hover = (seconds: number, up = 10, across = 0): Level | null => {
      const x = spot.x + across;
      const h: Lander = { x, y: spot.y, z: groundAt(x, spot.y) + up, landed: false };
      for (let f = 0, n = Math.round(seconds / DT); f < n; f++) {
        const began = s.step(DT, h);
        if (began) return began;
      }
      return null;
    };
    return { s, hover };
  }

  it('begins after a full hold in the window, over the person', () => {
    const { s, hover } = rescues();
    expect(hover(WINCH.hold - 0.2)).toBeNull();
    expect(s.loading).toBeCloseTo(WINCH.hold - 0.2, 1);
    expect(hover(0.4)).toBe(level('ledge-rescue'));
    expect(s.loading).toBe(0);
  });

  it('begins each winched rescue from its own spot: the ledge, and the boat over the sea', () => {
    const winched = RESCUE_SPOTS.filter((s) => s.by === 'winch');
    expect(winched.map((r) => r.id)).toEqual(['boat-rescue', 'ledge-rescue']);
    for (const r of winched) {
      const s = new Starts(pads, LEVELS, groundAt);
      const h: Lander = { x: r.x, y: r.y, z: groundAt(r.x, r.y) + 10, landed: false };
      let began: Level | null = null;
      for (let f = 0; f < Math.round((WINCH.hold + 0.2) / DT) && !began; f++) began = s.step(DT, h);
      expect(began, r.id).toBe(level(r.id));
    }
  });

  it('begins nothing 15.5 or 16.5 m up, or 6 m aside, or 4 m up', () => {
    for (const [up, across] of [
      [15.5, 0],
      [16.5, 0],
      [10, 6],
      [4, 0],
    ]) {
      const { s, hover } = rescues();
      expect(hover(WINCH.hold + 2, up, across), `${up} up, ${across} aside`).toBeNull();
      expect(s.loading).toBe(0);
    }
  });

  it('starts the hold again when the helicopter leaves the window', () => {
    const { s, hover } = rescues();
    expect(hover(2)).toBeNull();
    expect(s.loading).toBeGreaterThan(1.9);
    expect(hover(DT, 16.5)).toBeNull();
    expect(s.loading).toBe(0);
    expect(hover(WINCH.hold - 0.5)).toBeNull();
    expect(hover(0.7)).toBe(level('ledge-rescue'));
  });

  it('is not held by a pad that is blocked: a level ended on home does not stop a rescue', () => {
    const { s, hover } = rescues();
    s.blocked = 0;
    expect(hover(WINCH.hold + 0.2)).toBe(level('ledge-rescue'));
  });

  it('is reset with the rest, and begins nothing from a level that has no winch first', () => {
    const { s, hover } = rescues();
    hover(1);
    s.reset();
    expect(s.loading).toBe(0);
    const none = new Starts(
      pads,
      LEVELS.filter((l) => l.steps[0].kind !== 'winch'),
      groundAt,
    );
    const h: Lander = { x: spot.x, y: spot.y, z: groundAt(spot.x, spot.y) + 10, landed: false };
    for (let f = 0; f < 400; f++) expect(none.step(DT, h)).toBeNull();
    expect(none.loading).toBe(0);
  });
});

describe('starting a rescue by landing', () => {
  const walker = RESCUE_SPOTS.find((s) => s.id === 'wood-rescue')!;
  /** A set of starts, with the helicopter `across` from the walker, landed or `up` in the air, for `seconds`; which level it began. */
  function beside(seconds: number, across = 6, landed = true, up = 0) {
    const s = new Starts(pads, LEVELS);
    const h: Lander = { x: walker.x + across, y: walker.y, z: walker.z + up, landed };
    let began: Level | null = null;
    for (let f = 0, n = Math.round(seconds / DT); f < n && !began; f++) began = s.step(DT, h);
    return { s, began };
  }

  it("begins the walker's level after a full hold landed within the reach, which a winch does not", () => {
    const early = beside(BOARD.hold - 0.2);
    expect(early.began).toBeNull();
    expect(early.s.loading).toBeCloseTo(BOARD.hold - 0.2, 1);
    expect(early.s.boarding).toBe(level('wood-rescue'));
    expect(beside(BOARD.hold + 0.2).began).toBe(level('wood-rescue'));
    expect(beside(BOARD.hold + 0.2, 14.9).began).toBe(level('wood-rescue'));
  });

  it('begins nothing landed 16 m off, or hovering over them at any height, however long', () => {
    for (const [across, landed, up] of [
      [16, true, 0],
      [0, false, 0.5],
      [0, false, 10],
      [0, false, 12],
    ] as const) {
      const { s, began } = beside(BOARD.hold + 3, across, landed, up);
      expect(began, `${across} ${landed} ${up}`).toBeNull();
      expect(s.loading).toBe(0);
    }
  });

  it('starts the hold again when the helicopter lifts off', () => {
    const s = new Starts(pads, LEVELS);
    const down: Lander = { x: walker.x + 5, y: walker.y, z: walker.z, landed: true };
    for (let f = 0; f < 120; f++) s.step(DT, down);
    expect(s.loading).toBeGreaterThan(1.9);
    s.step(DT, { ...down, z: walker.z + 1, landed: false });
    expect(s.loading).toBe(0);
    expect(s.boarding).toBeNull();
  });

  it('is not begun by a winch, and the ledge and the boat are not begun by landing near them', () => {
    const winched = RESCUE_SPOTS.filter((x) => x.by === 'winch');
    expect(winched).toHaveLength(2);
    for (const r of winched) {
      const s = new Starts(pads, LEVELS);
      const h: Lander = { x: r.x + 5, y: r.y, z: r.z, landed: true };
      for (let f = 0; f < 600; f++) expect(s.step(DT, h), r.id).toBeNull();
    }
  });

  it('is reset with the rest', () => {
    const { s } = beside(1);
    s.reset();
    expect([s.loading, s.boarding]).toEqual([0, null]);
  });
});

describe('starting a fire', () => {
  const west = level('west-lake-fire');
  const here = FIRES[0];

  /** Starts watching real fires, with the helicopter flown `across` from the westernmost patch of the one named `id`. */
  function fires(levels: readonly Level[] = LEVELS) {
    const burning = new Map(FIRES.map((place) => [place.id, new Fire(place)]));
    const watch: FireWatch = {
      burning: (id) => burning.get(id)?.burning ?? 0,
      nearest: (id, x, y, out) => burning.get(id)?.nearestBurning(x, y, out) ?? false,
    };
    const s = new Starts(pads, levels, () => 0, watch);
    return { s, burning };
  }
  /** A place `across` metres west of the westernmost lit patch of a fire, which no other lit patch is nearer than. */
  function west_of(place: (typeof FIRES)[number], across: number): Lander {
    const lit = place.patches.slice(0, place.lit);
    const edge = lit.reduce((a, b) => (b.x < a.x ? b : a));
    return { x: edge.x - across, y: edge.y, z: edge.z + 20, landed: false };
  }

  it('says its number once: a bucket out within 60 m of a burning patch begins the level of its fire', () => {
    expect(FIRE.near).toBe(60);
  });

  it('begins the level of a fire arrived at with the bucket out: at 59.9 m, and not at 60.1', () => {
    for (const place of FIRES) {
      expect(fires().s.step(DT, west_of(place, 59.9), true), place.id).toBe(level(place.id));
      expect(fires().s.step(DT, west_of(place, 60.1), true), `${place.id} 60.1 m`).toBeNull();
    }
  });

  it('is begun by the bucket put out where the helicopter already is: the step it goes out on', () => {
    const { s } = fires();
    const h = west_of(here, 40);
    for (let f = 0; f < 120; f++) expect(s.step(DT, h, false)).toBeNull();
    expect(s.step(DT, h, true)).toBe(west);
  });

  it('is not begun with the bucket in, however near, or over the fire, or landed in it', () => {
    const { s } = fires();
    const [p] = here.patches;
    for (let f = 0; f < 600; f++) expect(s.step(DT, { x: p.x, y: p.y, z: p.z + 10, landed: false }, false)).toBeNull();
    expect(s.step(DT, { x: p.x, y: p.y, z: p.z, landed: true })).toBeNull();
    expect(s.loading).toBe(0);
  });

  it("is begun by no drop: a drop is the game's to tell, and the starts are told of none", () => {
    expect((fires().s as unknown as Record<string, unknown>).dropped).toBeUndefined();
  });

  it('is begun by a patch that burns, and not by one that is out or has not caught: a fire with none burning begins nothing', () => {
    const { s, burning } = fires();
    const fire = burning.get(here.id)!;
    for (const p of here.patches) fire.douse(p.x, p.y);
    expect(fire.burning).toBe(0);
    expect(s.step(DT, west_of(here, 10), true)).toBeNull();
  });

  it('is begun with a fire that no level is made of by nothing, and by the first level whose first step is an arrival at it', () => {
    expect(fires([]).s.step(DT, west_of(here, 10), true)).toBeNull();
    const second: Level = { ...west, id: 'west-lake-fire-again' };
    expect(fires([west, second]).s.step(DT, west_of(here, 10), true)).toBe(west);
  });

  it('does not begin again a fire whose level has just ended or been given up, while the helicopter stays by it with the bucket out', () => {
    const { s } = fires();
    s.spent = here.id;
    const h = west_of(here, 30);
    for (let f = 0; f < 600; f++) expect(s.step(DT, h, true)).toBeNull();
    // another fire is another matter
    expect(fires().s.step(DT, west_of(FIRES[1], 30), true)).toBe(level(FIRES[1].id));
    const other = fires();
    other.s.spent = here.id;
    expect(other.s.step(DT, west_of(FIRES[1], 30), true)).toBe(level(FIRES[1].id));
  });

  it('lets it begin again once the bucket has been taken in, or the helicopter has come past 60 m of the fire alight', () => {
    const inAgain = fires();
    inAgain.s.spent = here.id;
    expect(inAgain.s.step(DT, west_of(here, 30), true)).toBeNull();
    expect(inAgain.s.step(DT, west_of(here, 30), false)).toBeNull();
    expect(inAgain.s.spent).toBe('');
    expect(inAgain.s.step(DT, west_of(here, 30), true)).toBe(west);
    const away = fires();
    away.s.spent = here.id;
    expect(away.s.step(DT, west_of(here, 61), true)).toBeNull();
    expect(away.s.spent).toBe('');
    expect(away.s.step(DT, west_of(here, 59), true)).toBe(west);
  });

  it('keeps a fire that is out to be rested until it is alight again: nothing is learned of where the helicopter is from a fire with no patch burning', () => {
    const { s, burning } = fires();
    s.spent = here.id;
    const fire = burning.get(here.id)!;
    for (const p of here.patches) fire.douse(p.x, p.y);
    s.step(DT, west_of(here, 200), true);
    expect(s.spent).toBe(here.id);
    fire.relight();
    s.step(DT, west_of(here, 200), true);
    expect(s.spent).toBe('');
  });

  it('is reset with the rest: the fire it was kept off is forgotten', () => {
    const { s } = fires();
    s.spent = here.id;
    s.reset();
    expect(s.spent).toBe('');
  });

  it('is not begun by a fire step that is not the first of a level', () => {
    const later: Level = { ...west, steps: [west.steps[1], west.steps[1]] };
    expect(fires([later]).s.step(DT, west_of(here, 10), true)).toBeNull();
  });

  it('is not kept loading by being near: a fire is begun at once, and the loader is for pads and people', () => {
    const { s } = fires();
    s.step(DT, west_of(here, 10), true);
    expect(s.loading).toBe(0);
  });

  it('asks nothing of the bucket when it is not told of one: the step is as it was for a helicopter with the bucket in', () => {
    const { s } = fires();
    expect(s.step(DT, west_of(here, 10))).toBeNull();
  });
});
