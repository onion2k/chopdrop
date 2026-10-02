import { describe, expect, it } from 'vitest';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import { CHASE, ChaseCamera } from '../src/chase';
import { COLLECTIBLES, LEVELS, PACKAGES } from '../src/arena';
import { DELIVERY, RING, type Ring } from '../src/mission';
import { checkCamera, checkCollection, checkFinds, checkInvariants } from '../src/invariants';
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
