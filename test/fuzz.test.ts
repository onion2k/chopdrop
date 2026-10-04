/** The monkey itself: it gets about, and a clean seed is clean. `npm run fuzz` is the long form. */
import { describe, expect, it } from 'vitest';
import { beginAtStart, fuzz } from '../scripts/fuzzer';
import { FIRES, LEVELS, RESCUE_SPOTS } from '../src/arena';
import { Game } from '../src/game';
import { HOVER_LIFT } from '../src/helicopter';
import { seeded } from '../src/random';
import { SLOW, sweep } from './slow';

describe('the fuzzer', () => {
  it('plays a seed through without breaking a rule, and does everything a player can', () => {
    // long enough to try every action once, which the run's first, a seed's own level, makes room for
    const r = fuzz(1, 6000);
    expect(r.failure, JSON.stringify(r.failure)).toBe(null);
    for (const action of [
      'fly',
      'hover',
      'let go',
      'climb',
      'land',
      'teleport',
      'take off',
      'edge run',
      'hill run',
      'pad landing',
      'forest run',
      'touch fly',
      'wanted pad',
      'to a start',
      'show the way',
      'abandon',
      'ring run',
      'through the ring',
      'structure run',
      'onto a structure',
      'through the gate',
      'through a structure',
      'to a package',
      'to a rescue',
      'skim',
      'over a fire',
      'past a fire',
      'let down onto water',
      'the bucket',
      'dip',
      'beside a person',
    ])
      expect(r.done[action], action).toBeGreaterThan(0);
    // and what can happen, happens: over the seeds `npm run fuzz` plays, since one seed's luck is not the fuzzer's reach
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) for (const key of Object.keys(fuzz(seed, 5000).happened)) seen.add(key);
    for (const happening of [
      'took off',
      'landed',
      'met rising land',
      'reached the ceiling',
      'touched the edge',
      'trees swayed',
      'trees settled',
      'loaded',
      'delivered',
      'passed a ring',
      'knocked off a ring',
      'knocked off a structure',
      'rested on a structure',
      'abandoned',
      'collected',
      'found',
      'winched',
      'boarded',
      'scooped',
      'dropped',
      'doused',
    ])
      expect(seen, happening).toContain(happening);
  });

  it('puts a fire out, on a fire level begun at once, over the seeds `npm run fuzz` plays', () => {
    const fire = LEVELS.find((level) => level.kind === 'fire')!.id;
    const seen = new Set<string>();
    // a fire takes a scoop and a drop or three, each by chance, so the run is longer than the others: 12000 frames put it
    // out three times over these seeds. The quick check runs one seed for the rules, and the slow run all twelve for the fire out
    const seeds = sweep(Array.from({ length: 12 }, (_, k) => k + 1));
    for (const seed of seeds) {
      const r = fuzz(seed, 12000, fire);
      expect(r.failure, JSON.stringify(r.failure)).toBe(null);
      for (const key of Object.keys(r.happened)) seen.add(key);
    }
    if (SLOW) expect(seen).toContain('fire out');
  });

  it('flies the course through to its landing, begun at once with the level asked for', () => {
    const course = LEVELS.find((level) => level.kind === 'course')!.id;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const r = fuzz(seed, 4000, course);
      expect(r.failure, JSON.stringify(r.failure)).toBe(null);
      expect(r.happened[`started ${course}`], `seed ${seed}`).toBeGreaterThan(0);
      for (const key of Object.keys(r.happened)) seen.add(key);
    }
    for (const happening of ['through a gate', 'passed a ring', 'landed where wanted', 'knocked off a structure'])
      expect(seen, happening).toContain(happening);
  });

  it('begins a level asked for at its start, so a rescue is not begun on the home pad it ends on', () => {
    const game = new Game({ random: seeded(1) });
    beginAtStart(game, 'wood-rescue');
    const spot = game.mission.current;
    expect(game.mission.level?.id).toBe('wood-rescue');
    expect(spot?.kind).toBe('land');
    const home = game.island.pads[0];
    expect(Math.hypot(game.helicopter.x - home.x, game.helicopter.y - home.y)).toBeGreaterThan(100);
    for (let f = 0; f < 90; f++) game.step(1 / 60, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.mission.level?.id, 'still going after a second and a half').toBe('wood-rescue');
  });

  it('refuses a level it does not have, by name', () => {
    expect(fuzz(1, 10, 'no-such-level').failure?.problems.join()).toMatch(/there is no level "no-such-level"/);
  });

  it('comes back with a save of some levels done, and starts every level by itself, over the seeds `npm run fuzz` plays', () => {
    const started = new Set<string>();
    // held by design: each seed's own level is gone to first, until it has begun, and the thirteen levels are the
    // thirteen seeds' own, which is why `npm run fuzz` plays seeds 1 to 13: the one that is none of 1 to 12's was left to
    // chance, and the run grew more actions to do before chance had it
    for (let seed = 1; seed <= 13; seed++)
      for (const key of Object.keys(fuzz(seed, 5000).happened)) if (key.startsWith('started ')) started.add(key);
    expect([...started].sort()).toEqual(LEVELS.map((level) => `started ${level.id}`).sort());
    expect(LEVELS).toHaveLength(13);
    for (const { id } of RESCUE_SPOTS) expect(started, id).toContain(`started ${id}`);
    // a fire is begun by flying to it with the bucket out, which the monkey does by itself
    for (const { id } of FIRES) expect(started, id).toContain(`started ${id}`);
  });

  it('starts flying free at home, with nothing going, unless a level is asked for', () => {
    const r = fuzz(3, 1);
    expect(r.failure).toBeNull();
    expect(Object.keys(r.happened).filter((key) => key.startsWith('started '))).toEqual([]);
    expect(Object.keys(fuzz(3, 1, 'ring-trial').happened)).toContain('started ring-trial');
  });

  it('plays the same way twice from a seed', () => {
    expect(fuzz(2, 600)).toEqual(fuzz(2, 600));
  });
});
