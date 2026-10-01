/**
 * The levels as content: each one's pads held to what they are, so an island made again otherwise, or a pad's place
 * in the list moved, says so here and not as a level that wants the helicopter somewhere else. Each is held to what
 * makes it the level it is: over the water, over the range, up the mountain.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS, theIsland } from '../src/arena';

const { pads, ground, lakes } = theIsland();
const apart = (a: number, b: number) => Math.hypot(pads[a].x - pads[b].x, pads[a].y - pads[b].y);
/** The pads of a level, by its id: where the parcel waits and where it is wanted. */
const padsOf = (id: string) => LEVELS.find((level) => level.id === id)!.steps.map((step) => step.pad);
/** Points along the straight way between two pads, `n` of them. */
function* along(a: number, b: number, n = 300) {
  for (let k = 0; k <= n; k++)
    yield [pads[a].x + ((pads[b].x - pads[a].x) * k) / n, pads[a].y + ((pads[b].y - pads[a].y) * k) / n];
}

describe('the levels', () => {
  it('are the four deliveries, in order, each known by a name that is not its place in the list', () => {
    expect(LEVELS.map((level) => level.id)).toEqual([
      'first-delivery',
      'over-the-water',
      'over-the-range',
      'mountain-drop',
    ]);
    expect(LEVELS.map((level) => level.name)).toEqual([
      'First delivery',
      'Over the water',
      'Over the range',
      'Mountain drop',
    ]);
    for (const level of LEVELS) {
      expect(level.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(level.kind).toBe('delivery');
      expect(level.steps.map((step) => step.kind)).toEqual(['pickup', 'drop']);
      for (const step of level.steps)
        expect(step.pad > 0 && step.pad < pads.length, `${level.id}: pad ${step.pad}`).toBe(true);
    }
  });

  it('starts with the first delivery: from the meadow pad, 187 inland of home, to the hilltop pad 187 beyond it', () => {
    const [pickup, drop] = padsOf('first-delivery');
    expect([pads[pickup].site, pads[drop].site]).toEqual(['meadow', 'hilltop']);
    expect(apart(0, pickup)).toBeCloseTo(187, -1);
    expect(apart(pickup, drop)).toBeCloseTo(187, -1);
  });

  it('then goes over the water: from the river mouth to the lakeside pad, 646 away, across a lake', () => {
    const [pickup, drop] = padsOf('over-the-water');
    expect([pads[pickup].site, pads[drop].site]).toEqual(['rivermouth', 'lakeside']);
    expect(apart(pickup, drop)).toBeCloseTo(646, -1);
    // the share of the way over a lake's water, measured as 80 of it
    let wet = 0;
    for (const [x, y] of along(pickup, drop))
      if (lakes.some((lake) => ground.heightAt(x, y) < lake.level + 0.01 && Math.hypot(x - lake.x, y - lake.y) < 120))
        wet++;
    expect((wet / 300) * apart(pickup, drop)).toBeGreaterThan(60);
  });

  it('then over the range: from the northern meadow pad to the beach, 501 away, over peaks of more than 140', () => {
    const [pickup, drop] = padsOf('over-the-range');
    expect([pads[pickup].site, pads[drop].site]).toEqual(['meadow', 'beach']);
    expect(apart(pickup, drop)).toBeCloseTo(501, -1);
    let top = 0;
    for (const [x, y] of along(pickup, drop)) top = Math.max(top, ground.heightAt(x, y));
    expect(top).toBeGreaterThan(140);
  });

  it('and ends up the mountain: from the lakeside pad to the shoulder pad, 79 up', () => {
    const [pickup, drop] = padsOf('mountain-drop');
    expect([pads[pickup].site, pads[drop].site]).toEqual(['lakeside', 'shoulder']);
    expect(apart(pickup, drop)).toBeCloseTo(392, -1);
    expect(pads[drop].z).toBeGreaterThan(75);
  });
});
