/**
 * The determinism check, on its own working parts: the hash sees a change as small as a thousandth, and the check
 * says the frame two runs parted at, so a run that does not repeat itself is found and not just suspected.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT, flight, hashGame, playTwice, startingLevel } from '../scripts/determinism';
import { FIRES, LEVELS } from '../src/arena';
import { PATCH } from '../src/fire';
import { Game } from '../src/game';
import { seeded } from '../src/random';
import { DT } from './helpers';
import { SLOW, sweep } from './slow';

describe('the determinism check', () => {
  it('plays a seed through the level twice the same way', () => {
    const r = playTwice({ seed: 3, frames: 2400, every: 200 });
    expect(r.diverged, r.note).toBeNull();
    expect(r.checkpoints).toHaveLength(12);
    // and the run got somewhere: the checkpoints are not all one
    expect(new Set(r.checkpoints).size).toBeGreaterThan(6);
  });

  it('flies the levels in turn from home, each begun by its own start and done before the next, and the first again after the last', () => {
    const begun: string[] = [];
    const done: string[] = [];
    let at = '';
    let last: unknown = null;
    // long enough for all thirteen, a little over twenty minutes of game with the flights between them, and the first begun again
    for (const game of flight(1, 60 * 60 * 21)) {
      const id = game.mission.level?.id ?? '';
      if (id && id !== at) begun.push(id);
      at = id;
      if (game.last !== last) {
        last = game.last;
        done.push(game.last!.id);
      }
    }
    expect(begun.slice(0, LEVELS.length + 1)).toEqual([...LEVELS.map((level) => level.id), LEVELS[0].id]);
    expect(done.slice(0, LEVELS.length)).toEqual(LEVELS.map((level) => level.id));
  });

  it('begins every one of the thirteen levels over the default run, each seed from its own starting level', () => {
    const begun = new Set<string>();
    const seeds = sweep(Array.from({ length: DEFAULT.seeds }, (_, k) => k + 1));
    for (const seed of seeds)
      for (const game of flight(seed, DEFAULT.frames, startingLevel(seed, LEVELS.length))) {
        const id = game.mission.level?.id;
        if (id) begun.add(id);
      }
    expect(DEFAULT.frames).toBe(5400);
    expect(DEFAULT.seeds).toBe(LEVELS.length);
    // the quick check flies one seed, which begins its own level; the slow run flies them all, which begin every one
    if (SLOW) expect([...begun].sort()).toEqual(LEVELS.map((level) => level.id).sort());
    else expect(begun.has(LEVELS[startingLevel(seeds[0], LEVELS.length)].id)).toBe(true);
  });

  it('gives each starting level to a seed of its own, within the list', () => {
    const at = Array.from({ length: LEVELS.length }, (_, k) => startingLevel(k + 1, LEVELS.length));
    expect(new Set(at).size).toBe(LEVELS.length);
  });

  it('sees which level is going, or none, the best times kept, what the starts are loading and have blocked, and the level guided to', () => {
    const game = () => new Game({ random: seeded(1) });
    const was = hashGame(game());
    const going = game();
    going.begin('mountain-drop');
    const other = game();
    other.begin('first-delivery');
    expect(hashGame(going)).not.toBe(was);
    expect(hashGame(going)).not.toBe(hashGame(other));
    const kept = game();
    kept.progress.record('first-delivery', 40);
    expect(hashGame(kept)).not.toBe(was);
    const loading = game();
    loading.starts.loading += 1e-6;
    expect(hashGame(loading)).not.toBe(was);
    const blocked = game();
    blocked.starts.blocked = 3;
    expect(hashGame(blocked)).not.toBe(was);
    const guided = game();
    guided.guide('ring-trial');
    expect(hashGame(guided)).not.toBe(was);
    const guidedOther = game();
    guidedOther.guide('over-the-range');
    expect(hashGame(guidedOther)).not.toBe(hashGame(guided));
  });

  it('sees how many structures are collected, and which, and in what order', () => {
    const game = () => new Game({ random: seeded(1) });
    const was = hashGame(game());
    const one = game();
    one.progress.collect('gorge-bridge');
    one.collection.count = 1;
    expect(hashGame(one)).not.toBe(was);
    const other = game();
    other.progress.collect('west-bridge');
    other.collection.count = 1;
    expect(hashGame(other), 'which').not.toBe(hashGame(one));
    const ab = game();
    ab.progress.collect('gorge-bridge');
    ab.progress.collect('west-bridge');
    ab.collection.count = 2;
    const ba = game();
    ba.progress.collect('west-bridge');
    ba.progress.collect('gorge-bridge');
    ba.collection.count = 2;
    expect(hashGame(ab), 'in what order').not.toBe(hashGame(ba));
    const counted = game();
    counted.collection.count = 1;
    expect(hashGame(counted), 'how many').not.toBe(was);
  });

  it('sees how many packages are found, and which, in what order, how near the radar hears one, and its clock', () => {
    const game = () => new Game({ random: seeded(1) });
    const was = hashGame(game());
    const one = game();
    one.progress.find('east-wood');
    one.finds.count = 1;
    expect(hashGame(one)).not.toBe(was);
    const other = game();
    other.progress.find('west-shore-wood');
    other.finds.count = 1;
    expect(hashGame(other), 'which').not.toBe(hashGame(one));
    const ab = game();
    ab.progress.find('east-wood');
    ab.progress.find('west-shore-wood');
    ab.finds.count = 2;
    const ba = game();
    ba.progress.find('west-shore-wood');
    ba.progress.find('east-wood');
    ba.finds.count = 2;
    expect(hashGame(ab), 'in what order').not.toBe(hashGame(ba));
    const counted = game();
    counted.finds.count = 1;
    expect(hashGame(counted), 'how many').not.toBe(was);
    const heard = game();
    heard.finds.nearest = 42;
    expect(hashGame(heard), 'how near').not.toBe(was);
    const clocked = game();
    clocked.finds.until = 0.5;
    expect(hashGame(clocked), 'the clock').not.toBe(was);
  });

  it("sees the tank, full and how far it is filled, and the state of each fire's patches", () => {
    const game = () => new Game({ random: seeded(1) });
    const was = hashGame(game());
    const full = game();
    full.tank.full = true;
    expect(hashGame(full), 'full').not.toBe(was);
    const filling = game();
    filling.tank.filling = 1e-6;
    expect(hashGame(filling), 'filling').not.toBe(was);
    for (const place of FIRES) {
      const out = game();
      const fire = out.fire(place.id);
      fire.states[0] = PATCH.out;
      fire.burning--;
      expect(hashGame(out), `${place.id} out`).not.toBe(was);
      const lit = game();
      lit.fire(place.id).states[place.lit] = PATCH.burning;
      expect(hashGame(lit), `${place.id} caught`).not.toBe(was);
    }
    // which patch, and not only how many
    const a = game();
    a.fire(FIRES[0].id).states[0] = PATCH.out;
    const b = game();
    b.fire(FIRES[0].id).states[1] = PATCH.out;
    expect(hashGame(a), 'which').not.toBe(hashGame(b));
  });

  it('sees the helicopter moved a thousandth, turned a millionth, a tree leaned, and the ring a hair fuller', () => {
    const game = () => {
      const g = new Game({ random: seeded(1) });
      g.helicopter.placeAbove(-300, -100, 4, 0);
      for (let f = 0; f < 120; f++) g.step(DT, { forward: 0.5, turn: 0, lift: 0.25 });
      return g;
    };
    const was = hashGame(game());
    expect(hashGame(game())).toBe(was);
    const moved = game();
    moved.helicopter.x += 0.001;
    expect(hashGame(moved)).not.toBe(was);
    const turned = game();
    turned.helicopter.yaw += 1e-6;
    expect(hashGame(turned)).not.toBe(was);
    const leaned = game();
    expect(leaned.sway.count).toBeGreaterThan(0);
    leaned.sway.leanX[0] += 1e-6;
    expect(hashGame(leaned)).not.toBe(was);
    const filled = game();
    filled.mission.loading += 1e-6;
    expect(hashGame(filled)).not.toBe(was);
  });

  it('says the frame two runs parted at', () => {
    const r = playTwice({
      seed: 2,
      frames: 900,
      every: 300,
      meddle: (game, pass, frame) => {
        if (pass === 1 && frame === 450) game.helicopter.vx += 0.01;
      },
    });
    expect(r.diverged).toBe(600);
    expect(r.note).toMatch(/parted by frame 600/);
  });
});
