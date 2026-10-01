/**
 * How a frame's cost is measured, tried without a GPU: the drawing and the
 * waiting are stand-ins that move a clock of the test's own, so what is
 * held is the measuring and not the machine. The perf gate holds the game
 * to the figure this gives, and a figure that wobbles by half of itself
 * holds the game to nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEWEST, SAMPLES, SAMPLE_MS, WARM_MS, frameCost } from '../src/frame-cost';

interface Machine {
  /** What the page takes to hand a frame over, in milliseconds. */
  cpu?: number;
  /** What the GPU takes over a frame, by how long it has been drawing. */
  gpu?: (drawingFor: number) => number;
  /** The step the clock is read in, as a browser's is. */
  grain?: number;
  /** Whether the nth frame asked for is drawn at all. */
  drawn?: (frame: number) => boolean;
}

/** A page and a GPU that take the time they are told to, on a clock of the test's own. */
function machine({ cpu = 0.1, gpu = () => 0.4, grain = 0, drawn = () => true }: Machine = {}) {
  let now = 0,
    asked = 0,
    drawing = 0,
    waiting = 0,
    lot = 0;
  /** How many frames were drawn in each lot, a lot being what was handed over between one wait and the next. */
  const lots: number[] = [];
  /** How long the GPU had been drawing for, at the end of each lot. */
  const drawingBy: number[] = [];
  vi.spyOn(performance, 'now').mockImplementation(() => (grain ? Math.floor(now / grain + 1e-9) * grain : now));
  return {
    draw: () => {
      if (!drawn(asked++)) return false;
      const cost = cpu + gpu(drawing);
      now += cpu;
      waiting += cost - cpu;
      drawing += cost;
      lot++;
      return true;
    },
    done: () => {
      now += waiting;
      waiting = 0;
      lots.push(lot);
      drawingBy.push(drawing);
      lot = 0;
      return Promise.resolve();
    },
    /** Something else holding the machine up for a while. */
    hold: (ms: number) => {
      now += ms;
    },
    lots,
    /** The lots that were timed: the last of them, one a sample. */
    samples: () => lots.slice(-SAMPLES),
    /** How long the GPU had been drawing for when the first sample was taken. */
    warmedFor: () => drawingBy[drawingBy.length - SAMPLES - 1],
  };
}

afterEach(() => vi.restoreAllMocks());

describe('what a frame costs', () => {
  it('times frames drawn back to back, ten milliseconds of them a sample, and gives the cost of one', async () => {
    const m = machine({ cpu: 0.1, gpu: () => 0.4 });
    expect(await frameCost(m.draw, m.done)).toBeCloseTo(0.5, 9);
    expect(SAMPLE_MS).toBe(10);
    expect(m.samples().length).toBe(SAMPLES);
    // twenty frames of half a millisecond, or one more where the sum came out a hair under
    for (const frames of m.samples()) expect([20, 21]).toContain(frames);
  });

  it('puts as many frames in a sample as it takes, by what a frame costs', async () => {
    // a frame that costs little needs many to keep the GPU at it for as long: ten of these would be over in a
    // millisecond and a half, and read a GPU that never came up to speed
    const small = machine({ cpu: 0.025, gpu: () => 0.1 });
    expect(await frameCost(small.draw, small.done)).toBeCloseTo(0.125, 9);
    for (const frames of small.samples()) expect([80, 81]).toContain(frames);
    vi.restoreAllMocks();
    // and never fewer than ten, however dear the frame
    const dear = machine({ cpu: 1, gpu: () => 3 });
    expect(await frameCost(dear.draw, dear.done)).toBeCloseTo(4, 9);
    expect(FEWEST).toBe(10);
    expect(dear.samples()).toEqual(Array(SAMPLES).fill(10));
  });

  it('reads a frame to a hundredth of a millisecond on a clock that ticks in tenths', async () => {
    // a browser's clock is coarse on purpose; a frame of 0.47 ms timed alone reads 0.4 or 0.5, a fifth apart
    const m = machine({ cpu: 0.07, gpu: () => 0.4, grain: 0.1 });
    const cost = await frameCost(m.draw, m.done);
    expect(Math.abs(cost - 0.47)).toBeLessThanOrEqual(0.01 + 1e-9);
  });

  it('keeps the GPU drawing for a quarter of a second before it times anything', async () => {
    // a GPU that has sat idle while the page booted: until it has been drawing for a fifth of a second, a frame
    // takes half as long again
    const idle = (drawingFor: number) => (drawingFor < 200 ? 0.65 : 0.4);
    const warmed = machine({ gpu: idle });
    expect(await frameCost(warmed.draw, warmed.done), 'warmed first').toBeCloseTo(0.5, 9);
    expect(WARM_MS).toBe(250);
    expect(warmed.warmedFor()).toBeGreaterThanOrEqual(WARM_MS);
    expect(warmed.warmedFor(), 'and not for much longer').toBeLessThan(WARM_MS + 2 * SAMPLE_MS);
    vi.restoreAllMocks();
    // and one slower to warm than the samples take to draw, so that every one of them is of a cold GPU
    const slow = (drawingFor: number) => (drawingFor < 400 ? 0.65 : 0.4);
    const cold = machine({ gpu: slow });
    expect(await frameCost(cold.draw, cold.done, 0), 'timed from cold').toBeCloseTo(0.75, 9);
    vi.restoreAllMocks();
    const longer = machine({ gpu: slow });
    expect(await frameCost(longer.draw, longer.done, 450), 'warmed for longer').toBeCloseTo(0.5, 9);
  });

  it('warms the GPU for as long as it is asked to', async () => {
    const m = machine();
    await frameCost(m.draw, m.done, 60);
    expect(m.warmedFor()).toBeGreaterThanOrEqual(60);
    expect(m.warmedFor()).toBeLessThan(60 + 2 * SAMPLE_MS);
  });

  it('takes the least of its samples, so one held up by something else does not count', async () => {
    const m = machine();
    let lot = 0;
    const done = () => {
      // all but one lot in six are held up for a few milliseconds by whatever else the machine is doing
      if (lot++ % 6 !== 0) m.hold(4);
      return m.done();
    };
    expect(await frameCost(m.draw, done)).toBeCloseTo(0.5, 9);
  });

  it('shares a sample among the frames that were drawn, and leaves out one in which none was', async () => {
    // one frame in three is not drawn, as none is while the renderer is still compiling
    const m = machine({ drawn: (frame) => frame % 3 !== 0 });
    expect(await frameCost(m.draw, m.done)).toBeCloseTo(0.5, 9);
    vi.restoreAllMocks();
    const never = machine({ drawn: () => false });
    expect(await frameCost(never.draw, never.done, 20), 'nothing drawn at all').toBe(0);
  });
});
