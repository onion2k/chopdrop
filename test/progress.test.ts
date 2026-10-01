/**
 * The player's progress: the best time on each level, kept in a store, and which levels are open worked out from it.
 * A save is read as if anyone had written it: what cannot be read is refused by name and play starts fresh, without
 * writing over it until there is something to keep; what can be read is kept, a level's time only ever lowered.
 */
import { describe, expect, it } from 'vitest';
import { KEY, Progress, SAVE, memoryStore } from '../src/progress';

const IDS = ['first-delivery', 'over-the-water', 'over-the-range', 'mountain-drop'];
const saved = (best: Record<string, unknown>) => memoryStore(JSON.stringify({ best }));

describe('progress', () => {
  it('is kept under the key given out with the first save', () => {
    expect(KEY).toBe('chopdrop-save-v1');
  });

  it('starts with no times kept, the first level open and the rest locked', () => {
    const p = new Progress(memoryStore());
    expect(p.best.size).toBe(0);
    expect(IDS.map((_, i) => p.standing(IDS, i))).toEqual(['open', 'locked', 'locked', 'locked']);
    expect(p.pick(IDS)).toBe(0);
    expect(p.refused).toBeNull();
  });

  it('keeps a level done, says when it is the best yet, and only ever lowers it', () => {
    const p = new Progress(memoryStore());
    expect(p.record('first-delivery', 41.5)).toBe(true);
    expect(p.record('first-delivery', 44)).toBe(false);
    expect(p.best.get('first-delivery')).toBe(41.5);
    expect(p.record('first-delivery', 39.25)).toBe(true);
    expect(p.best.get('first-delivery')).toBe(39.25);
  });

  it('opens a level once the one before it is done, and offers the first open one not yet done', () => {
    const p = new Progress(saved({ 'first-delivery': 40, 'over-the-water': 70 }));
    expect(IDS.map((_, i) => p.standing(IDS, i))).toEqual(['done', 'done', 'open', 'locked']);
    expect(p.pick(IDS)).toBe(2);
    // a level slotted into the list later, after one that is done, is open by the same rule, and the rest stand
    const slotted = ['first-delivery', 'ring-trial', 'over-the-water', 'over-the-range'];
    expect(slotted.map((_, i) => p.standing(slotted, i))).toEqual(['done', 'open', 'done', 'open']);
    expect(p.pick(slotted)).toBe(1);
    // and every one done offers the first again
    for (const id of IDS) p.record(id, 50);
    expect(p.pick(IDS)).toBe(0);
  });

  it('writes what it keeps to its store, and reads it back the same', () => {
    const store = memoryStore();
    const p = new Progress(store);
    p.record('first-delivery', 41.5);
    p.record('over-the-water', 63.75);
    p.persist();
    expect(JSON.parse(store.json!)).toEqual({ best: { 'first-delivery': 41.5, 'over-the-water': 63.75 } });
    expect([...new Progress(memoryStore(store.json)).best]).toEqual([...p.best]);
  });

  it('never writes on loading, and leaves a save it refused alone until there is something to keep', () => {
    const store = memoryStore('{"best": {"first-delivery": 40}');
    const p = new Progress(store);
    expect(p.refused).toMatch(/not JSON/);
    expect(store.json).toBe('{"best": {"first-delivery": 40}');
    p.record('first-delivery', 45);
    p.persist();
    expect(JSON.parse(store.json!)).toEqual({ best: { 'first-delivery': 45 } });
  });

  it('refuses by name a save that is not JSON, not a table, or whose times are not a table', () => {
    for (const [json, why] of [
      ['not json', /not JSON/],
      ['[1, 2]', /not a table/],
      ['null', /not a table/],
      ['"best"', /not a table/],
      ['{"best": 41}', /its best times are not a table/],
      ['{"best": [41]}', /its best times are not a table/],
    ] as const) {
      const p = new Progress(memoryStore(json));
      expect(p.refused, json).toMatch(why);
      expect(p.best.size, json).toBe(0);
    }
  });

  it('drops a time that is not a positive number, or a name that is not a level name, and keeps the rest', () => {
    const p = new Progress(
      saved({
        'first-delivery': 40,
        'over-the-water': -3,
        'over-the-range': 'quick',
        'mountain-drop': null,
        'ring-trial': 0,
        'lost-in-the-woods': Infinity,
        'Not A Name': 30,
        '': 30,
        'up-the-valley': 95.5,
      }),
    );
    expect(p.refused).toBeNull();
    expect(Object.fromEntries(p.best)).toEqual({ 'first-delivery': 40, 'up-the-valley': 95.5 });
  });

  it("reaches into nothing with a name that would reach into every table's prototype", () => {
    const p = new Progress(memoryStore('{"best": {"__proto__": {"polluted": 1}, "first-delivery": 40}}'));
    expect(Object.fromEntries(p.best)).toEqual({ 'first-delivery': 40 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps a level it does not list, as a save written by a later game has, and writes it back', () => {
    const store = saved({ 'first-delivery': 40, 'ring-trial': 52 });
    const p = new Progress(store);
    p.record('over-the-water', 70);
    p.persist();
    expect((JSON.parse(store.json!) as { best: object }).best).toEqual({
      'first-delivery': 40,
      'ring-trial': 52,
      'over-the-water': 70,
    });
  });

  it(`keeps no more than ${SAVE.kept} times from a save, however many it holds`, () => {
    const many: Record<string, number> = {};
    for (let k = 0; k < SAVE.kept * 3; k++) many[`level-${k}`] = 30 + k;
    const p = new Progress(saved(many));
    expect(p.best.size).toBe(SAVE.kept);
    expect(p.best.get('level-0')).toBe(30);
    // and a level the game has is still kept on top of them
    p.record('first-delivery', 40);
    expect(p.best.get('first-delivery')).toBe(40);
  });

  it('refuses to keep a time that is not a positive number, or for a level with no proper name', () => {
    const p = new Progress(memoryStore());
    expect(() => p.record('first-delivery', NaN)).toThrow(/not a time/);
    expect(() => p.record('first-delivery', 0)).toThrow(/not a time/);
    expect(() => p.record('First Delivery', 40)).toThrow(/not a level's name/);
    expect(p.best.size).toBe(0);
  });
});
