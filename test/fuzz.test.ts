/** The monkey itself: it gets about, and a clean seed is clean. `npm run fuzz` is the long form. */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { LEVELS } from '../src/arena';

describe('the fuzzer', () => {
  it('plays a seed through without breaking a rule, and does everything a player can', () => {
    const r = fuzz(1, 4000);
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
      'fly again',
      'next level',
      'pick a level',
      'ring run',
      'through the ring',
      'structure run',
      'onto a structure',
      'through the gate',
    ])
      expect(r.done[action], action).toBeGreaterThan(0);
    // and what can happen, happens: over the seeds `npm run fuzz` plays, since one seed's luck is not the fuzzer's reach
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) for (const key of Object.keys(fuzz(seed, 4000).happened)) seen.add(key);
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
    ])
      expect(seen, happening).toContain(happening);
  });

  it('flies the course through to its landing, started on it as a player who has done every level does', () => {
    const course = LEVELS.find((level) => level.kind === 'course')!.id;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const r = fuzz(seed, 4000, course);
      expect(r.failure, JSON.stringify(r.failure)).toBe(null);
      expect(r.happened[`flew ${course}`], `seed ${seed}`).toBeGreaterThan(0);
      for (const key of Object.keys(r.happened)) seen.add(key);
    }
    for (const happening of ['through a gate', 'passed a ring', 'landed where wanted', 'knocked off a structure'])
      expect(seen, happening).toContain(happening);
  });

  it('refuses a level it does not have, by name', () => {
    expect(fuzz(1, 10, 'no-such-level').failure?.problems.join()).toMatch(/there is no level "no-such-level"/);
  });

  it('comes back with a save, and flies every level the list lets it pick, over the seeds `npm run fuzz` plays', () => {
    const flew = new Set<string>();
    for (let seed = 1; seed <= 12; seed++)
      for (const key of Object.keys(fuzz(seed, 4000).happened)) if (key.startsWith('flew ')) flew.add(key);
    expect([...flew].sort()).toEqual(LEVELS.map((level) => `flew ${level.id}`).sort());
  });

  it('plays the same way twice from a seed', () => {
    expect(fuzz(2, 600)).toEqual(fuzz(2, 600));
  });
});
