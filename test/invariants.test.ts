import { describe, expect, it } from 'vitest';
import { HELICOPTER, HOVER_LIFT } from '../src/helicopter';
import { ChaseCamera } from '../src/chase';
import { checkCamera, checkInvariants } from '../src/invariants';
import { TREE_STRIDE } from '../src/island';
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

  it('holds of a level flown through, and reports a delivery at no stage, a ring out of range or off the pad, and a clock gone wrong', () => {
    const { game } = newGame();
    const { pads } = game.island;
    const target = () => pads[game.delivery.target];
    for (let leg = 0; leg < 2; leg++) {
      game.helicopter.placeAbove(target().x, target().y, 0, 0);
      for (let f = 0; f < 60; f++) {
        game.step(DT, { forward: 0, turn: 0, lift: 0 });
        expect(checkInvariants(game)).toEqual([]);
      }
      for (let f = 0; f < 60; f++) game.step(DT, { forward: 0, turn: 0, lift: 0 });
    }
    expect(game.delivery.stage).toBe('delivered');
    const d = game.delivery;
    game.restart();
    (d as { stage: string }).stage = 'lost';
    expect(checkInvariants(game).join('\n')).toMatch(/no such stage/);
    game.restart();
    d.ring = 9;
    expect(checkInvariants(game).join('\n')).toMatch(/the ring reads 9/);
    d.ring = 0.5;
    game.helicopter.placeAbove(pads[0].x, pads[0].y, 0, 0);
    expect(checkInvariants(game).join('\n')).toMatch(/the ring runs off the pad/);
    d.ring = 0;
    d.time = 3;
    expect(checkInvariants(game).join('\n')).toMatch(/clock ran before the first lift-off/);
    d.time = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/clock reads NaN/);
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
