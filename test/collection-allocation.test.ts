/**
 * Nothing is made in a step of the collection: the points it watches the helicopter's middle by and the openings it
 * watches are built once. Seen by what `crossed` is handed, since a heap's size is the garbage collector's to say and
 * would pass or fail with the machine. Its own file, since it stands in for `crossed` to see what it is given.
 */
import { describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({
  from: new Set<object>(),
  to: new Set<object>(),
  openings: new Set<object>(),
  calls: 0,
}));

vi.mock('../src/mission', async (original) => {
  const real = await original<typeof import('../src/mission')>();
  return {
    ...real,
    crossed: (...args: Parameters<typeof real.crossed>) => {
      seen.openings.add(args[0]);
      seen.from.add(args[1]);
      seen.to.add(args[2]);
      seen.calls++;
      return real.crossed(...args);
    },
  };
});

describe('the collection, a step at a time', () => {
  it('is handed the same two points and the same fourteen openings however many steps it takes', async () => {
    const { Collection } = await import('../src/collection');
    const { COLLECTIBLES } = await import('../src/arena');
    const { Progress, memoryStore } = await import('../src/progress');
    const collection = new Collection(COLLECTIBLES, new Progress(memoryStore()));
    const h = { x: -400, y: -400, z: 0, landed: true };
    for (let f = 0; f < 500; f++) {
      h.x += 0.01;
      collection.step(h);
    }
    expect(seen.calls).toBe(499 * COLLECTIBLES.length * 2);
    expect(seen.from.size).toBe(1);
    expect(seen.to.size).toBe(1);
    // each opening and the same turned about
    expect(seen.openings.size).toBe(COLLECTIBLES.length * 2);
  });
});
