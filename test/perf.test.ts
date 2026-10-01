/**
 * The perf gate's judging, apart from the browser: how far each figure may
 * move from its baseline before it is a change. The gate itself is only
 * ever run whole, on the GPU, where a judgement that lets a change through
 * looks the same as one that passes.
 */
import { describe, expect, it } from 'vitest';
import { TOLERANCE, moved } from '../smoke/judging';

describe('the perf gate', () => {
  it('holds the download to the byte, either way', () => {
    // the build gives the same bytes every time, so any byte more or less is a change, and one that crept a
    // kilobyte at a time under a tenth went unseen in three games until something unrelated tripped it
    expect(moved('bundleBytes', 41_513, 41_513)).toBe(false);
    expect(moved('bundleBytes', 41_513, 41_514)).toBe(true);
    expect(moved('bundleBytes', 41_513, 41_512)).toBe(true);
    expect(TOLERANCE.bundleBytes).toEqual([0, 0]);
  });

  it('holds the frame to a share of itself, both ways, and a hair more for a frame too small to share', () => {
    expect(moved('frameMs', 0.171, 0.171)).toBe(false);
    expect(moved('frameMs', 0.171, 0.19)).toBe(false);
    expect(moved('frameMs', 0.171, 0.2)).toBe(true);
    expect(moved('frameMs', 0.171, 0.14)).toBe(true);
    // a frame of half its baseline, or three times it: what the old slack of 0.6 ms let through
    expect(moved('frameMs', 0.171, 0.085)).toBe(true);
    expect(moved('frameMs', 0.171, 0.513)).toBe(true);
  });

  it('holds the boot both ways', () => {
    expect(moved('bootMs', 50, 60)).toBe(false);
    expect(moved('bootMs', 1000, 1400)).toBe(true);
    expect(moved('bootMs', 1000, 600)).toBe(true);
  });
});
