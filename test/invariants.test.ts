import { describe, expect, it } from 'vitest';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import { CHASE, ChaseCamera } from '../src/chase';
import { COLLECTIBLES, FIRES, LEVELS, PACKAGES, RESCUE_SPOTS } from '../src/arena';
import { FIRE, PATCH } from '../src/fire';
import { SCOOP } from '../src/water';
import { DELIVERY, RING, WINCH, type Level, type Ring } from '../src/mission';
import { checkCamera, checkCollection, checkFinds, checkFires, checkInvariants, checkTank } from '../src/invariants';
import { RADAR } from '../src/finds';
import { TREE_STRIDE } from '../src/island';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT, canopyKinds, islandCanopy, newGame, thickestWood } from './helpers';

function flown() {
  const { game } = newGame();
  for (let f = 0; f < 120; f++) game.step(DT, { forward: 1, turn: 0.5, lift: 1 });
  for (let f = 0; f < 60; f++) game.step(DT, { forward: 1, turn: -0.5, lift: -0.2 });
  return game;
}

describe('what must always hold', () => {
  it('holds of a new game, and of one flown a little', () => {
    const { game } = newGame();
    expect(checkInvariants(game)).toEqual([]);
    expect(checkInvariants(flown())).toEqual([]);
  });

  it('reports a field that is not a number', () => {
    const game = flown();
    game.helicopter.vx = NaN;
    game.helicopter.rotor = Infinity;
    expect(checkInvariants(game).join('\n')).toMatch(/not a number.*vx is NaN, rotor is Infinity/);
  });

  it('reports a helicopter out of bounds, and above the ceiling or below the ground', () => {
    const game = flown();
    const h = game.helicopter;
    h.x = h.bounds.maxX + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/out of bounds/);
    h.x = 0;
    h.y = h.bounds.minY - 1;
    expect(checkInvariants(game).join('\n')).toMatch(/out of bounds/);
    h.y = 0;
    h.floor = h.floorAt(h.x, h.y);
    h.z = HELICOPTER.ceiling + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/out of height/);
    h.z = h.floor - 1;
    expect(checkInvariants(game).join('\n')).toMatch(/out of height/);
    h.z = h.floor + 1;
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a helicopter that thinks it stands on other ground than the ground under it', () => {
    const game = flown();
    const h = game.helicopter;
    h.floor += 5;
    h.z += 5;
    expect(checkInvariants(game).join('\n')).toMatch(/standing on the wrong ground/);
  });

  it('reports a helicopter going too fast, along or up', () => {
    const game = flown();
    game.helicopter.vx = HELICOPTER.maxSpeed + 1;
    game.helicopter.vy = 0;
    expect(checkInvariants(game).join('\n')).toMatch(/too fast: /);
    game.helicopter.vx = 0;
    game.helicopter.vz = HELICOPTER.climbSpeed + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/too fast up or down/);
  });

  it('reports a helicopter tilted too far', () => {
    const game = flown();
    game.helicopter.pitch = HELICOPTER.maxPitch + 0.1;
    expect(checkInvariants(game).join('\n')).toMatch(/too steep/);
    game.helicopter.pitch = 0;
    game.helicopter.roll = -HELICOPTER.maxRoll - 0.1;
    expect(checkInvariants(game).join('\n')).toMatch(/too banked/);
  });

  it('reports a helicopter sinking through the ground', () => {
    const { game } = newGame();
    game.helicopter.vz = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/sinking/);
  });

  it('reports a clock that is negative or not a number', () => {
    const { game } = newGame();
    game.t = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/the clock reads -1/);
    game.t = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/the clock reads NaN/);
  });

  it('holds of trees bowed by a helicopter hovering low over a wood', () => {
    const game = hovered();
    expect(game.sway.count).toBeGreaterThan(20);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a tree whose lean is not a number, or leans or is pressed past the most a tree can', () => {
    let game = hovered();
    game.sway.leanY[3] = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/not a number: tree \d+ leans/);
    game = hovered();
    game.sway.leanX[2] = game.sway.maxLean + 0.01;
    expect(checkInvariants(game).join('\n')).toMatch(/leans too far: tree \d+/);
    game = hovered();
    game.sway.squash[1] = -game.sway.maxSquash - 0.01;
    expect(checkInvariants(game).join('\n')).toMatch(/pressed too far: tree \d+/);
  });

  it('reports more trees moving than there is room for, and a tree that is not where the pool says', () => {
    let game = hovered();
    game.sway.count = game.sway.capacity + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/more trees moving than there is room for/);
    game = hovered();
    game.sway.tree[1] = game.sway.tree[0];
    expect(checkInvariants(game).join('\n')).toMatch(/lost its place: tree \d+/);
  });

  it('reports a tree kept moving that has stopped and that the wash no longer reaches', () => {
    const game = hovered();
    const { sway } = game;
    // the tree leaning furthest, which is nowhere near still
    let k = 0;
    for (let n = 1; n < sway.count; n++)
      if (Math.hypot(sway.leanX[n], sway.leanY[n]) > Math.hypot(sway.leanX[k], sway.leanY[k])) k = n;
    const kept = new RegExp(`kept: tree ${sway.tree[k]} is still and out of the wash`);
    // as if the last step had been taken at the ceiling, out of reach: the tree is kept while it still swings
    sway.source.z = HELICOPTER.ceiling;
    expect(checkInvariants(game).join('\n')).not.toMatch(kept);
    sway.leanX[k] = sway.leanY[k] = sway.squash[k] = 0;
    sway.leanXRate[k] = sway.leanYRate[k] = sway.squashRate[k] = 0;
    expect(checkInvariants(game).join('\n')).toMatch(kept);
  });

  it('holds of the camera chasing a helicopter hovering low in a wood', () => {
    const game = hovered();
    const cam = new ChaseCamera(game.island.ground, islandCanopy());
    cam.snap(game.helicopter);
    for (let f = 0; f < 120; f++) {
      game.step(DT, { forward: 1, turn: 0.2, lift: HOVER_LIFT });
      cam.step(DT, game.helicopter);
      expect(checkCamera(cam, game, canopyKinds())).toEqual([]);
    }
  });

  it('reports a camera inside a crown, and one under the ground, and holds a parked one to neither', () => {
    const game = hovered();
    const cam = new ChaseCamera(game.island.ground, islandCanopy());
    cam.snap(game.helicopter);
    const { trees, ground } = game.island;
    const [x, y, z, s] = [1, 2, 3, 5].map((k) => trees[k]);
    const top = canopyKinds()[trees[0]].top;
    cam.position[0] = x + 0.5;
    cam.position[1] = y;
    cam.position[2] = z + top * s * 0.6;
    expect(checkCamera(cam, game, canopyKinds()).join('\n')).toMatch(/in a crown: the camera .* is inside tree 0/);
    cam.position[2] = ground.heightAt(x + 0.5, y) - 1;
    expect(checkCamera(cam, game, canopyKinds()).join('\n')).toMatch(/under the ground: the camera/);
    cam.park(x, y);
    cam.position[2] = -50;
    expect(checkCamera(cam, game, canopyKinds())).toEqual([]);
    expect(TREE_STRIDE).toBe(7);
  });

  it('reports a camera nearer a structure than it draws, inside it or beside it, and holds one just far enough off', () => {
    const { game } = newGame();
    const cam = new ChaseCamera(game.island.ground, islandCanopy(), game.solids);
    const tower = game.solids.blocks.find((block) => block.kind === 'tower')!;
    const [c, s] = [Math.cos(tower.yaw), Math.sin(tower.yaw)];
    // chasing, set at a distance out from the tower's face, half way up it
    const at = (out: number) => {
      cam.snap(game.helicopter);
      const d = tower.length / 2 + out;
      cam.position[0] = tower.x + d * c;
      cam.position[1] = tower.y + d * s;
      cam.position[2] = tower.z + tower.height / 2;
      return checkCamera(cam, game, canopyKinds()).join('\n');
    };
    expect(at(-1)).toMatch(/in a structure: the camera .* is 0.00 from the shoulder towers' (west|east) tower/);
    expect(at(CHASE.near - 0.1)).toMatch(
      /in a structure: the camera .* is 1.90 from the shoulder towers' (west|east) tower/,
    );
    expect(at(CHASE.near + 0.01)).not.toMatch(/in a structure/);
    expect(at(CHASE.offBlocks)).toBe('');
  });

  it('holds of free flight, and of a level begun by landing on its crate and done, every step of the way', () => {
    const { game } = newGame();
    const { pads } = game.island;
    expect(checkInvariants(game)).toEqual([]);
    for (const pad of [4, 1]) {
      game.helicopter.placeAbove(pads[pad].x, pads[pad].y, 0, 0);
      for (let f = 0; f < 120; f++) {
        game.step(DT, { forward: 0, turn: 0, lift: 0 });
        expect(checkInvariants(game), `pad ${pad}, frame ${f}`).toEqual([]);
      }
    }
    expect(game.mission.level).toBeNull();
    expect(game.last?.id).toBe('first-delivery');
  });

  it('reports nothing going that is not nothing: a step, a clock, a loading, a pad wanted or a goal', () => {
    const { game } = newGame();
    const d = game.mission;
    d.next = 1;
    expect(checkInvariants(game).join('\n')).toMatch(/nothing is going, and the level is at step 1/);
    d.next = 0;
    d.time = 3;
    expect(checkInvariants(game).join('\n')).toMatch(/nothing is going, and the clock reads 3/);
    d.time = 0;
    d.loading = 0.5;
    expect(checkInvariants(game).join('\n')).toMatch(/nothing is going, and the loading reads 0.5/);
    d.loading = 0;
    expect(checkInvariants(game)).toEqual([]);
    Object.defineProperty(d, 'target', { get: () => 3, configurable: true });
    expect(checkInvariants(game).join('\n')).toMatch(/nothing is going, and it wants pad 3/);
    Object.defineProperty(d, 'target', { get: () => -1, configurable: true });
    Object.defineProperty(d, 'goal', { get: () => ({ x: 0, y: 0, z: 0 }), configurable: true });
    expect(checkInvariants(game).join('\n')).toMatch(/nothing is going, and it wants somewhere/);
  });

  it('reports the starts loading out of range, not a number, or off a pickup pad, or on one that is blocked', () => {
    const { game } = newGame();
    const { pads } = game.island;
    const s = game.starts;
    s.loading = DELIVERY.load;
    expect(checkInvariants(game).join('\n')).toMatch(/the starts' loading reads 1.5/);
    s.loading = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/the starts' loading reads -1/);
    s.loading = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/the starts' loading reads NaN/);
    // loading with the helicopter on home, which starts nothing
    s.loading = 0.5;
    expect(checkInvariants(game).join('\n')).toMatch(/the starts' loading runs off a pickup pad/);
    // on a pickup pad it is right, and blocked it is not
    game.helicopter.placeAbove(pads[4].x, pads[4].y, 0, 0);
    s.loading = 0;
    game.step(DT);
    expect(s.loading).toBeGreaterThan(0);
    expect(checkInvariants(game)).toEqual([]);
    s.blocked = 4;
    expect(checkInvariants(game).join('\n')).toMatch(/the starts' loading runs off a pickup pad/);
    // and in the air over it
    s.blocked = -1;
    game.helicopter.placeAbove(pads[4].x, pads[4].y, 5, 0);
    expect(checkInvariants(game).join('\n')).toMatch(/the starts' loading runs off a pickup pad/);
  });

  it('reports a level going at no step, before its first step is done or past its last, and a loading or a clock gone wrong', () => {
    const { game } = newGame();
    const { pads } = game.island;
    game.begin('first-delivery');
    const d = game.mission;
    expect(checkInvariants(game)).toEqual([]);
    d.next = 0;
    expect(checkInvariants(game).join('\n')).toMatch(/no such step: the level is at step 0 of 2/);
    d.next = 2;
    expect(checkInvariants(game).join('\n')).toMatch(/no such step: the level is at step 2 of 2/);
    d.next = 0.5;
    expect(checkInvariants(game).join('\n')).toMatch(/no such step/);
    d.next = 1;
    d.loading = 9;
    expect(checkInvariants(game).join('\n')).toMatch(/the loading reads 9/);
    d.loading = 0.5;
    game.helicopter.placeAbove(pads[0].x, pads[0].y, 0, 0);
    expect(checkInvariants(game).join('\n')).toMatch(/the loading runs off the pad/);
    d.loading = 0;
    d.time = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/clock reads NaN/);
    d.time = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/clock reads -1/);
    // a clock that has run on the ground is fine: it runs from the beginning
    d.time = 3;
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports the starts loading while a level is going, since nothing starts then', () => {
    const { game } = newGame();
    game.begin('first-delivery');
    game.starts.loading = 0.5;
    expect(checkInvariants(game).join('\n')).toMatch(/the starts are loading while a level is going: 0.5/);
  });

  it('reports the helicopter inside a start ring, which nothing a player does can leave it', () => {
    const { game } = newGame();
    const ring = LEVELS.find((l) => l.id === 'ring-trial')!.steps[0] as Ring;
    const h = game.helicopter;
    expect(checkInvariants(game)).toEqual([]);
    // set by hand, past the push a placing would give it: its middle on the top of the first ring's tube
    h.x = ring.x;
    h.y = ring.y;
    h.z = ring.z + ring.opening + RING.tube - HELICOPTER.size.middle;
    h.floor = h.floorAt(h.x, h.y);
    expect(checkInvariants(game).join('\n')).toMatch(/inside ring 1 of 2: its reach 5\.200 past touching it/);
  });

  it('holds of a level done and kept, and reports a best time slower than the level was just done in, not kept, or not a time', () => {
    const { game } = newGame();
    const { pads } = game.island;
    for (const pad of [4, 1]) {
      game.helicopter.placeAbove(pads[pad].x, pads[pad].y, 0, 0);
      for (let f = 0; f < 120; f++) game.step(DT);
    }
    expect(game.last).not.toBeNull();
    expect(checkInvariants(game)).toEqual([]);
    const { id, seconds } = game.last!;
    game.progress.best.set(id, seconds + 1);
    expect(checkInvariants(game).join('\n')).toMatch(
      /the best time on first-delivery is \d+\.\d+ s, slower than the \d+\.\d+ s it was just done in/,
    );
    game.progress.best.delete(id);
    expect(checkInvariants(game).join('\n')).toMatch(/first-delivery is done, and no time is kept for it/);
    game.progress.best.set(id, -2);
    expect(checkInvariants(game).join('\n')).toMatch(/the best time on first-delivery is -2, not a time/);
    game.progress.best.set(id, NaN);
    expect(checkInvariants(game).join('\n')).toMatch(/not a time/);
  });
});

/** A game with the helicopter hovering four up over the thickest wood for two seconds, its trees bowed. */
function hovered() {
  const { game } = newGame();
  const wood = thickestWood();
  game.helicopter.placeAbove(wood.x, wood.y, 4, 0);
  for (let f = 0; f < 120; f++) game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
  return game;
}

describe('what must hold of the structures collected', () => {
  it('holds of a new game, and of one that has collected some', () => {
    const { game } = newGame();
    expect(checkCollection(game)).toEqual([]);
    game.progress.collect('gorge-bridge');
    game.collection.count = 1;
    expect(checkCollection(game)).toEqual([]);
  });

  it('is part of every check', () => {
    const { game } = newGame();
    game.progress.collected.push('not-a-structure');
    expect(checkInvariants(game).join('\n')).toMatch(/collected/);
  });

  it('reports an id collected that the game does not have and the save did not bring', () => {
    const { game } = newGame();
    game.progress.collected.push('not-a-structure');
    expect(checkCollection(game).join('\n')).toMatch(/not-a-structure is collected, and is no structure of the game's/);
  });

  it('does not report an id the save brought that the game does not have', () => {
    const game = new Game({
      random: seeded(1),
      progress: new Progress(memoryStore('{"best":{},"collected":["from-a-later-game"]}')),
    });
    expect(checkCollection(game)).toEqual([]);
  });

  it('reports a count over the number of structures there are', () => {
    const { game } = newGame();
    game.collection.count = COLLECTIBLES.length + 1;
    expect(checkCollection(game).join('\n')).toMatch(/8 collected, and there are only 7/);
  });

  it('reports one collected twice', () => {
    const { game } = newGame();
    game.progress.collected.push('gorge-bridge', 'gorge-bridge');
    expect(checkCollection(game).join('\n')).toMatch(/gorge-bridge is collected twice/);
  });
});

describe('what must hold of the packages found', () => {
  const [one, two] = PACKAGES;

  it('holds of a new game, and of one that has found some', () => {
    const { game } = newGame();
    expect(checkFinds(game)).toEqual([]);
    game.helicopter.place(one.x + 3, one.y, 0, 0);
    game.step(DT);
    expect(game.finds.count).toBe(1);
    expect(checkFinds(game)).toEqual([]);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('is part of every check', () => {
    const { game } = newGame();
    game.progress.found.push('not-a-package');
    expect(checkInvariants(game).join('\n')).toMatch(/found/);
  });

  it('reports an id found that the game does not have and the save did not bring', () => {
    const { game } = newGame();
    game.progress.found.push('not-a-package');
    expect(checkFinds(game).join('\n')).toMatch(/not-a-package is found, and is no package of the game's/);
  });

  it('does not report an id the save brought that the game does not have', () => {
    const game = new Game({
      random: seeded(1),
      progress: new Progress(memoryStore('{"best":{},"found":["from-a-later-game"]}')),
    });
    expect(checkFinds(game)).toEqual([]);
  });

  it('reports one found twice', () => {
    const { game } = newGame();
    game.progress.found.push(one.id, one.id);
    expect(checkFinds(game).join('\n')).toMatch(new RegExp(`${one.id} is found twice`));
  });

  it('reports a count over the ten there are', () => {
    const { game } = newGame();
    game.finds.count = PACKAGES.length + 1;
    expect(checkFinds(game).join('\n')).toMatch(/11 found, and there are only 10/);
  });

  it('reports a radar that hears beyond its range', () => {
    const { game } = newGame();
    game.finds.nearest = RADAR.range + 1;
    expect(checkFinds(game).join('\n')).toMatch(/hears a package 101\.00 away, and its range is 100/);
  });

  it('reports a radar that hears a package that is found', () => {
    const game = new Game({
      random: seeded(1),
      progress: new Progress(memoryStore(JSON.stringify({ best: {}, found: [one.id] }))),
    });
    game.helicopter.place(one.x + 30, one.y, 0, 0);
    game.step(DT);
    expect(game.finds.nearest).toBe(-1);
    expect(checkFinds(game)).toEqual([]);
    game.finds.nearest = 30;
    expect(checkFinds(game).join('\n')).toMatch(/hears the package it found, 30\.00 away/);
  });

  it('reports a radar that hears the farther of two, or none with one in range', () => {
    const { game } = newGame();
    game.helicopter.place(two.x + 60, two.y, 0, 0);
    game.step(DT);
    expect(checkFinds(game)).toEqual([]);
    game.finds.nearest = -1;
    expect(checkFinds(game).join('\n')).toMatch(/hears nothing/);
  });
});

describe('what must hold of a winch', () => {
  const [spot] = RESCUE_SPOTS;
  /** The helicopter hovering `up` over the ground at `across` from the first spot. */
  const over = (game: Game, up: number, across = 0) => game.helicopter.placeAbove(spot.x + across, spot.y, up, 0);

  it('holds of a rescue begun by the window held, every step of the way', () => {
    const { game } = newGame();
    over(game, 10);
    for (let f = 0; f < Math.round((WINCH.hold + 1) / DT); f++) {
      game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(game.mission.level?.id).toBe('wood-rescue');
  });

  it('reports the starts loading in a rescue window as right, and under the limit for it', () => {
    const { game } = newGame();
    over(game, 10);
    game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.starts.loading).toBeGreaterThan(0);
    expect(checkInvariants(game)).toEqual([]);
    // over the limit for a winch, which is longer than a pad's
    game.starts.loading = WINCH.hold;
    expect(checkInvariants(game).join('\n')).toMatch(/the starts' loading reads 3/);
    // over a pad's limit but under a winch's is right in the window
    game.starts.loading = DELIVERY.load + 0.5;
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports the starts loading out of every window, which is the rule broken', () => {
    const { game } = newGame();
    over(game, 16);
    game.starts.loading = 1;
    expect(checkInvariants(game).join('\n')).toMatch(
      /the starts' loading runs off a pickup pad or out of a rescue's window/,
    );
    over(game, 10, 6);
    expect(checkInvariants(game).join('\n')).toMatch(/runs off a pickup pad or out of a rescue's window/);
    over(game, 4);
    expect(checkInvariants(game).join('\n')).toMatch(/runs off a pickup pad or out of a rescue's window/);
  });

  it('holds a pad to the pad limit: over 1.5 on a pad is reported', () => {
    const { game } = newGame();
    const { pads } = game.island;
    game.helicopter.placeAbove(pads[4].x, pads[4].y, 0, 0);
    game.starts.loading = DELIVERY.load + 0.1;
    expect(checkInvariants(game).join('\n')).toMatch(/the starts' loading reads 1.6/);
  });

  it('reports the mission loading on a winch step outside its window, and at or over the hold', () => {
    const { game } = newGame();
    // a level whose second step is a winch, since a rescue's own is its first and is done as it begins
    const [wood, beach] = ['wood-rescue', 'beach-rescue'].map((id) => LEVELS.find((l) => l.id === id)!.steps[0]);
    const level: Level = { id: 'two', name: 'Two', kind: 'rescue', steps: [wood, beach, { kind: 'land', pad: 0 }] };
    game.mission.begin(level);
    expect(game.mission.current?.kind).toBe('winch');
    expect(checkInvariants(game)).toEqual([]);
    const spot2 = RESCUE_SPOTS[1];
    game.helicopter.placeAbove(spot2.x, spot2.y, 10, 0);
    game.mission.loading = 1;
    expect(checkInvariants(game)).toEqual([]);
    game.mission.loading = WINCH.hold;
    expect(checkInvariants(game).join('\n')).toMatch(/the loading reads 3, and runs from 0 to short of 3/);
    game.mission.loading = 1;
    game.helicopter.placeAbove(spot2.x, spot2.y, 16, 0);
    expect(checkInvariants(game).join('\n')).toMatch(/the loading runs out of the winch's window/);
    game.helicopter.placeAbove(spot2.x + 6, spot2.y, 10, 0);
    expect(checkInvariants(game).join('\n')).toMatch(/the loading runs out of the winch's window/);
  });
});

describe('what must hold of the tank', () => {
  const [west] = FIRES;
  /** Skimming the run of the west fire, a step from the window: filling, with `seconds` of it done. */
  const skimming = (seconds: number) => {
    const { game } = newGame();
    const { from, to, z } = west.run;
    game.helicopter.place(from.x, from.y, z + 1, Math.atan2(to.y - from.y, to.x - from.x));
    for (let f = 0; f < Math.round(seconds / DT); f++)
      game.step(DT, { forward: 1, turn: 0, lift: HOVER_LIFT + (z + 1 - game.helicopter.z) * 0.8 });
    return game;
  };

  it('holds of a new game, of a tank half filled, and of one full', () => {
    expect(checkTank(newGame().game)).toEqual([]);
    const half = skimming(1.5);
    expect(half.tank.filling).toBeGreaterThan(0.5);
    expect(checkTank(half)).toEqual([]);
    expect(checkInvariants(half)).toEqual([]);
    const full = skimming(4);
    expect(full.tank.full).toBe(true);
    expect(checkTank(full)).toEqual([]);
  });

  it('reports a filling that is not a number, under nothing, or not short of a full scoop', () => {
    for (const bad of [NaN, -0.1, SCOOP.time, SCOOP.time + 1]) {
      const game = skimming(1);
      game.tank.filling = bad;
      expect(checkTank(game).join('\n'), String(bad)).toMatch(
        /the tank's filling reads .*, and runs from 0 to short of 2/,
      );
    }
  });

  it('reports a tank filling that is full', () => {
    const game = skimming(4);
    game.tank.filling = 0.5;
    expect(checkTank(game).join('\n')).toMatch(/the tank is full and filling/);
  });

  it('reports a tank filling off the water, too high, too slow, and landed', () => {
    const { game: onLand } = newGame();
    onLand.tank.filling = 0.5;
    expect(checkTank(onLand).join('\n')).toMatch(
      /the tank is filling, and the helicopter is not in the scoop's window/,
    );
    for (const mend of [
      (g: Game) => g.helicopter.place(g.helicopter.x, g.helicopter.y, west.run.z + 2, g.helicopter.yaw),
      (g: Game) => {
        g.helicopter.vx = 3;
        g.helicopter.vy = 0;
      },
      (g: Game) => g.helicopter.place(g.helicopter.x, g.helicopter.y, west.run.z, g.helicopter.yaw),
    ]) {
      const game = skimming(1);
      expect(game.tank.filling).toBeGreaterThan(0);
      mend(game);
      expect(checkTank(game).join('\n')).toMatch(/not in the scoop's window/);
    }
  });
});

describe('what must hold of the fires', () => {
  const [west] = FIRES;

  it('holds of a new game, and of a fire begun, spread and put out', () => {
    const { game } = newGame();
    expect(checkFires(game)).toEqual([]);
    game.begin(west.id);
    expect(checkFires(game)).toEqual([]);
    for (let f = 0; f < 60 * 14; f++) {
      game.helicopter.placeAbove(0, 0, 60, 0);
      game.step(DT, { forward: 0, turn: 0, lift: HOVER_LIFT });
      expect(checkFires(game), `frame ${f}`).toEqual([]);
    }
    expect(game.fire(west.id).burning).toBeGreaterThan(west.lit);
  });

  it('reports a patch in no known state', () => {
    const { game } = newGame();
    game.fire(west.id).states[3] = 7;
    expect(checkFires(game).join('\n')).toMatch(new RegExp(`${west.id} has patch 3 in no known state: 7`));
  });

  it('reports a count of burning that is not the patches burning, and one past the patches there are', () => {
    const { game } = newGame();
    game.fire(west.id).burning = west.lit + 1;
    expect(checkFires(game).join('\n')).toMatch(
      new RegExp(`${west.id} counts ${west.lit + 1} burning, and ${west.lit} are`),
    );
    const all = newGame().game;
    const fire = all.fire(west.id);
    fire.states.fill(PATCH.burning);
    fire.burning = west.patches.length + 1;
    expect(checkFires(all).join('\n')).toMatch(/burns \d+ of \d+ patches/);
  });

  it('reports a fire that is not going and has been left off its start longer than it waits to be lit again', () => {
    const { game } = newGame();
    const fire = game.fire(west.id);
    fire.douse(west.patches[0].x, west.patches[0].y);
    // just put out: it is not yet time
    expect(checkFires(game)).toEqual([]);
    fire.quiet = FIRE.relight - 0.01;
    expect(checkFires(game)).toEqual([]);
    fire.quiet = FIRE.relight + 1;
    expect(checkFires(game).join('\n')).toMatch(new RegExp(`${west.id} is not going and has been off its start for`));
    // and one that has caught more than it started with, left so
    const more = newGame().game;
    const spread = more.fire(west.id);
    spread.states[west.lit] = PATCH.burning;
    spread.burning++;
    spread.quiet = FIRE.relight + 1;
    expect(checkFires(more).join('\n')).toMatch(/is not going and has been off its start/);
  });

  it('reports a fire level going with none of its fire burning', () => {
    const { game } = newGame();
    game.begin(west.id);
    const fire = game.fire(west.id);
    fire.states.fill(PATCH.out);
    fire.burning = 0;
    expect(checkInvariants(game).join('\n')).toMatch(new RegExp(`${west.id} is going, and none of it burns`));
  });

  it('reports a fire level going, as the mission has it, before its douse step, which is no state a level is in', () => {
    const { game } = newGame();
    game.begin(west.id);
    game.mission.next = 0;
    expect(checkInvariants(game).join('\n')).toMatch(/no such step/);
  });
});
