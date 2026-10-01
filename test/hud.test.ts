/** The HUD's two sums, headless: which way the arrow turns toward the pad as seen from the camera, and the time as words. */
import { describe, expect, it } from 'vitest';
import { clock, pointer } from '../src/hud';

describe('the pointer', () => {
  // the camera looks along +x from the origin; the helicopter is at the origin
  const camera = { position: [0, 0, 10] as [number, number, number], target: [10, 0, 0] as [number, number, number] };
  const at = (x: number, y: number) => pointer(camera, { x: 0, y: 0 }, { x, y });

  it('points straight up the screen at a pad dead ahead', () => {
    expect(at(50, 0)).toBe(0);
  });

  it('turns anticlockwise for a pad to the left, clockwise for one to the right, and right round for one behind', () => {
    // +y is to the left of a camera looking along +x, as the island is seen from above
    expect(at(0, 50)).toBe(-90);
    expect(at(0, -50)).toBe(90);
    expect(Math.abs(at(-50, 0))).toBe(180);
    expect(at(50, 50)).toBe(-45);
  });

  it('turns with the camera and not with the helicopter', () => {
    const turned = { position: [0, 0, 10] as [number, number, number], target: [0, 10, 0] as [number, number, number] };
    expect(pointer(turned, { x: 0, y: 0 }, { x: 0, y: 50 })).toBe(0);
    expect(pointer(turned, { x: 5, y: 0 }, { x: 5, y: 50 })).toBe(0);
  });
});

describe('the clock', () => {
  it('reads minutes and seconds, the seconds always two figures and never rounded up', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(47.9)).toBe('0:47');
    expect(clock(61)).toBe('1:01');
    expect(clock(600)).toBe('10:00');
    expect(clock(-3)).toBe('0:00');
  });
});
