/**
 * Nothing is made in a step of the column of smoke: the wind each puff leans in is written into one record, made once.
 * Seen by what `windAt` is handed, since a heap's size is the garbage collector's to say and would pass or fail with the
 * machine. Its own file, since it stands in for `windAt` to see what it is given.
 */
import { describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ outs: new Set<object>(), calls: 0 }));

vi.mock('../src/wind', async (original) => {
  const real = await original<typeof import('../src/wind')>();
  return {
    ...real,
    windAt: (...args: Parameters<typeof real.windAt>) => {
      seen.outs.add(args[1]);
      seen.calls++;
      return real.windAt(...args);
    },
  };
});

describe('the column, a step at a time', () => {
  it('is handed the same wind record for every puff of every step, and the same data', async () => {
    const { Column, COLUMN } = await import('../src/column');
    const { FIRES } = await import('../src/arena');
    const { PATCH } = await import('../src/fire');
    const column = new Column(FIRES);
    const data = column.data;
    const views = FIRES.map((f) => ({
      states: new Uint8Array(f.patches.length).fill(PATCH.burning),
      burning: f.patches.length,
    }));
    for (let f = 0; f < 200; f++) column.step(f * 0.37, views);
    expect(seen.calls).toBe(200 * FIRES.length * COLUMN.puffs);
    expect(seen.outs.size).toBe(1);
    expect(column.data).toBe(data);
  });
});
