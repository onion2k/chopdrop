/** The panel's one sum, headless: how its subtitle counts the levels done. The rest of it is DOM, worked in smoke/panel.spec.ts. */
import { describe, expect, it } from 'vitest';
import { packageRows, panelSubtitle, structureRows } from '../src/panel';

describe('the subtitle', () => {
  it('counts the levels with a best time, and says how a level is found', () => {
    const rows = [{ best: 17 }, { best: null }, { best: 26.5 }, { best: null }];
    expect(panelSubtitle(rows)).toBe('2 of 4 done · land on a crate or fly a start, anywhere');
    expect(panelSubtitle([{ best: null }])).toBe('0 of 1 done · land on a crate or fly a start, anywhere');
    expect(panelSubtitle([{ best: 3 }, { best: 4 }])).toBe('2 of 2 done · land on a crate or fly a start, anywhere');
  });
});

describe('the structures section', () => {
  const all = [
    { id: 'gorge-bridge', name: 'the gorge bridge' },
    { id: 'shoulder-towers', name: 'the shoulder towers' },
    { id: 'west-bridge', name: 'the west bridge' },
  ];

  it('counts what is collected of what there is, and lists each by its name without "the"', () => {
    const words = structureRows(all, ['shoulder-towers', 'gorge-bridge']);
    expect(words.heading).toBe('Structures');
    expect(words.count).toBe('2 of 3');
    expect(words.items).toEqual([
      { name: 'gorge bridge', got: true },
      { name: 'shoulder towers', got: true },
      { name: 'west bridge', got: false },
    ]);
  });

  it("keeps the game's order, whatever the order they were collected in", () => {
    expect(structureRows(all, ['west-bridge']).items.map((i) => i.name)).toEqual([
      'gorge bridge',
      'shoulder towers',
      'west bridge',
    ]);
  });

  it('counts none with none collected, and leaves out of the count a name the game does not have', () => {
    expect(structureRows(all, []).count).toBe('0 of 3');
    expect(structureRows(all, []).items.every((i) => !i.got)).toBe(true);
    expect(structureRows(all, ['from-a-later-game', 'gorge-bridge']).count).toBe('1 of 3');
    expect(structureRows(all, ['gorge-bridge', 'shoulder-towers', 'west-bridge']).count).toBe('3 of 3');
  });
});

describe("the packages' line", () => {
  const all = Array.from({ length: 10 }, (_, k) => ({ id: `p${k}` }));

  it('says how many of the ten are found, in the words the line has', () => {
    const words = packageRows(all, ['p2', 'p0', 'p7']);
    expect(words.heading).toBe('Packages');
    expect(words.count).toBe('3 of 10');
    expect(words.line).toBe('Packages · 3 of 10');
    expect(packageRows(all, []).line).toBe('Packages · 0 of 10');
    expect(
      packageRows(
        all,
        all.map((p) => p.id),
      ).line,
    ).toBe('Packages · 10 of 10');
  });

  it("has a dot for each, filled as found, in the game's order whatever order they were found in", () => {
    const { dots } = packageRows(all, ['p9', 'p1']);
    expect(dots).toHaveLength(10);
    expect(dots.map((got, k) => (got ? k : -1)).filter((k) => k >= 0)).toEqual([1, 9]);
  });

  it('leaves out of the count a name the game does not have, and a name found twice', () => {
    expect(packageRows(all, ['from-a-later-game', 'p3']).count).toBe('1 of 10');
    expect(packageRows(all, ['p3', 'p3']).count).toBe('1 of 10');
  });
});
