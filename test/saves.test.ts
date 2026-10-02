/**
 * Saves from every shape the game has ever written, kept in `test/saves`, all still loading and playing. A player's
 * save outlives the code that wrote it. The first is the template's stub's, a bank of points from a game no longer
 * here, written under the same key: it loads as a fresh start, and is never refused.
 *
 * A save whose shape is new needs a file here. The last test sees to that: it fails when the game writes a field no
 * file in the corpus has.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/arena';
import { Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT } from './helpers';

const DIR = new URL('saves/', import.meta.url);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const read = (file: string) => readFileSync(new URL(file, DIR), 'utf8');

/** What each save held when it was written, and what loading it must keep: the best time on each level. */
const KEPT: Record<string, Record<string, number>> = {
  '01-first.json': {},
  '02-best-times.json': { 'first-delivery': 38.4, 'over-the-water': 61.25 },
  '03-collected.json': { 'first-delivery': 38.4 },
  '04-found.json': { 'first-delivery': 38.4 },
};

/** What each save held of the structures collected, in order: none for a shape from before there were any. */
const COLLECTED: Record<string, string[]> = {
  '01-first.json': [],
  '02-best-times.json': [],
  '03-collected.json': ['gorge-bridge', 'shoulder-towers', 'from-a-later-game'],
  '04-found.json': ['gorge-bridge'],
};

/** What each save held of the packages found, in order: none for a shape from before there were any. */
const FOUND: Record<string, string[]> = {
  '01-first.json': [],
  '02-best-times.json': [],
  '03-collected.json': [],
  '04-found.json': ['east-wood', 'west-shore-wood', 'from-a-later-game'],
};

describe('saves from every shape the game has written', () => {
  it('has a file for every shape, oldest first', () => {
    expect(files).toEqual(Object.keys(KEPT).sort());
  });

  for (const file of files) {
    describe(file, () => {
      it('loads, refusing nothing, with its times kept', () => {
        const p = new Progress(memoryStore(read(file)));
        expect(p.refused).toBeNull();
        expect(Object.fromEntries(p.best)).toEqual(KEPT[file]);
        expect(p.collected).toEqual(COLLECTED[file]);
        expect(p.found).toEqual(FOUND[file]);
      });

      it('plays on from where it left off, every level it opens, and breaks no rule', () => {
        const progress = new Progress(memoryStore(read(file)));
        const game = new Game({ random: seeded(7), progress });
        game.begin(game.levels[0].id);
        for (let f = 0; f < 300; f++) game.step(DT, { forward: 1, turn: 0.3, lift: 1 });
        expect(checkInvariants(game)).toEqual([]);
      });

      it('marks what it had collected as collected in the game', () => {
        const game = new Game({ random: seeded(7), progress: new Progress(memoryStore(read(file))) });
        for (const id of COLLECTED[file]) expect(game.collection.has(id), id).toBe(true);
      });

      it('marks what it had found as found in the game', () => {
        const game = new Game({ random: seeded(7), progress: new Progress(memoryStore(read(file))) });
        for (const id of FOUND[file]) expect(game.finds.has(id), id).toBe(true);
      });

      it('comes back as it went, written again in the shape of today', () => {
        const store = memoryStore(read(file));
        const before = new Progress(store);
        expect(store.json, 'loading alone must not write').toBe(read(file));
        before.persist();
        const after = new Progress(memoryStore(store.json));
        expect(Object.fromEntries(after.best)).toEqual(KEPT[file]);
        expect(after.collected).toEqual(COLLECTED[file]);
        expect(after.found).toEqual(FOUND[file]);
      });
    });
  }

  it('has the shape the game writes now: a new field means a new file here', () => {
    const progress = new Progress(memoryStore());
    progress.record(LEVELS[0].id, 40);
    progress.collect('gorge-bridge');
    progress.find('east-wood');
    const now = Object.keys(progress.toJSON()).sort();
    const newest = Object.keys(JSON.parse(read(files[files.length - 1])) as object).sort();
    expect(newest, 'add a save in the new shape to test/saves').toEqual(now);
  });
});
