/**
 * Touch, as the helicopter's controls, headless: fingers put down, moved and lifted as numbers, and the controls
 * read back. The stick's push, its dead zone and its letting go; the lever's slide, its stop and its staying put; two
 * thumbs at once and a third finger ignored; a finger taken away, and the screen turned over.
 */
import { describe, expect, it } from 'vitest';
import { HELICOPTER, HOVER_LIFT, type Controls } from '../src/helicopter';
import { TOUCH, TouchControls } from '../src/touch';
import { DT, flatGround } from './helpers';
import { Helicopter } from '../src/helicopter';

const W = 390,
  H = 844,
  TRAVEL = 216;
const { reach, dead } = TOUCH;

function touch(width = W, height = H, travel = TRAVEL) {
  const t = new TouchControls();
  t.layout(width, height, travel);
  return t;
}
const read = (t: TouchControls): Controls => t.read({ forward: 9, turn: 9, lift: 9 });

/** A stick put down at a point well inside its side, and pushed by (dx, dy). */
function pushed(dx: number, dy: number) {
  const t = touch();
  expect(t.down(1, 120, 600)).toBe(true);
  t.move(1, 120 + dx, 600 + dy);
  return read(t);
}

describe('the stick', () => {
  it('flies forward pushed up, back pushed down, and turns left and right pushed across, all the way at its reach', () => {
    expect(pushed(0, -reach)).toMatchObject({ forward: 1, turn: 0 });
    expect(pushed(0, reach)).toMatchObject({ forward: -1, turn: 0 });
    expect(pushed(-reach, 0)).toMatchObject({ forward: 0, turn: 1 });
    expect(pushed(reach, 0)).toMatchObject({ forward: 0, turn: -1 });
  });

  it('asks for nothing within its dead zone, and in proportion beyond it', () => {
    expect(pushed(0, -reach * dead * 0.9)).toMatchObject({ forward: 0, turn: 0 });
    const half = pushed(0, -reach * (dead + (1 - dead) / 2));
    expect(half.forward).toBeCloseTo(0.5, 9);
    const diagonal = pushed(reach * 0.6, -reach * 0.6);
    expect(Math.hypot(diagonal.forward, diagonal.turn)).toBeLessThanOrEqual(1 + 1e-9);
    expect(diagonal.forward).toBeCloseTo(-diagonal.turn, 9);
  });

  it('holds its knob to its ring, however far the thumb goes', () => {
    const t = touch();
    t.down(1, 120, 600);
    t.move(1, 120, 600 - 5 * reach);
    expect(Math.hypot(t.stick.knobX, t.stick.knobY)).toBeCloseTo(reach, 9);
    expect(read(t).forward).toBe(1);
  });

  it('comes up where the thumb lands, kept far enough in that its ring is on the screen', () => {
    const t = touch();
    t.down(1, 150, 500);
    expect([t.stick.active, t.stick.x, t.stick.y, t.stick.knobX, t.stick.knobY]).toEqual([true, 150, 500, 0, 0]);
    const corner = touch();
    corner.down(1, 2, H - 2);
    expect(corner.stick.x).toBe(TOUCH.edge);
    expect(corner.stick.y).toBe(H - TOUCH.edge);
    // landing in the corner asks for nothing, though the ring is drawn in from it, and a push is from where it landed
    expect(read(corner)).toMatchObject({ forward: 0, turn: 0 });
    corner.move(1, 2, H - 2 - reach);
    expect(read(corner)).toMatchObject({ forward: 1, turn: 0 });
  });

  it('lets go when the thumb is lifted, back to where it waits', () => {
    const t = touch();
    t.down(1, 120, 600);
    t.move(1, 150, 560);
    t.up(1);
    expect(read(t)).toMatchObject({ forward: 0, turn: 0 });
    expect(t.stick.active).toBe(false);
    expect([t.stick.x, t.stick.y]).toEqual([TOUCH.rest[0], H - TOUCH.rest[1]]);
  });
});

describe('the lever', () => {
  it('starts at the hover, so the helicopter rests with its rotor idling', () => {
    expect(read(touch()).lift).toBe(HOVER_LIFT);
    expect(HOVER_LIFT).toBe(0);
  });

  it('is put back at the hover by a reset, however it was left', () => {
    const t = touch();
    t.down(2, 330, 700);
    t.move(2, 330, 700 - TRAVEL);
    expect(read(t).lift).toBe(1);
    t.up(2);
    t.reset();
    expect(read(t).lift).toBe(HOVER_LIFT);
    // and slides on from there, not from where it was
    t.down(3, 330, 700);
    t.move(3, 330, 700 - TRAVEL / 4);
    expect(read(t).lift).toBeCloseTo(0.5, 9);
  });

  it('is the middle of its travel: the stop is the middle, and a thumb on the middle rests there', () => {
    expect(TOUCH.stop).toBe(HOVER_LIFT);
    const t = touch();
    t.down(2, 330, 700);
    t.move(2, 330, 700 - TRAVEL / 2);
    expect(read(t).lift).toBe(1);
    // slid back by half the travel and a hair short of it, it clicks into the middle and holds the hover
    t.move(2, 330, 700 - TOUCH.pull * 0.5 * (TRAVEL / 2));
    expect(read(t).lift).toBe(HOVER_LIFT);
  });

  it('slides up to the climb and down to the way down, from where it was, and no further', () => {
    const t = touch();
    expect(t.down(2, 330, 700)).toBe(true);
    t.move(2, 330, 700 - TRAVEL);
    expect(read(t).lift).toBe(1);
    t.move(2, 330, 700 - 3 * TRAVEL);
    expect(read(t).lift).toBe(1);
    t.up(2);
    // put down somewhere else on the lever's side, it moves from where it was, not to the finger
    t.down(3, 250, 300);
    expect(read(t).lift).toBe(1);
    t.move(3, 250, 300 + TRAVEL * 2);
    expect(read(t).lift).toBe(-1);
  });

  it('clicks into the stop at the hover when slid near it, and can be slid on past it', () => {
    const t = touch();
    t.down(2, 330, 700);
    // a quarter of the way up from the middle is the stop: half the travel is a lift of one
    t.move(2, 330, 700 - (HOVER_LIFT - TOUCH.pull * 0.8) * (TRAVEL / 2));
    expect(read(t).lift).toBe(HOVER_LIFT);
    t.move(2, 330, 700 - (HOVER_LIFT + TOUCH.pull * 0.8) * (TRAVEL / 2));
    expect(read(t).lift).toBe(HOVER_LIFT);
    t.move(2, 330, 700 - 0.6 * (TRAVEL / 2));
    expect(read(t).lift).toBeCloseTo(0.6, 9);
  });

  it('stays where it is left when the finger is lifted', () => {
    const t = touch();
    t.down(2, 330, 700);
    t.move(2, 330, 700 - HOVER_LIFT * (TRAVEL / 2));
    t.up(2);
    expect(read(t).lift).toBe(HOVER_LIFT);
    t.release();
    expect(read(t).lift).toBe(HOVER_LIFT);
  });

  it('at the stop holds the helicopter where it is, at the top climbs, and at the bottom comes down fast', () => {
    const at = (lift: number) => {
      const h = new Helicopter(flatGround());
      h.place(0, 0, 100, 0);
      for (let f = 0; f < 180; f++) h.step(DT, { forward: 0, turn: 0, lift });
      return h.vz;
    };
    const t = touch();
    t.down(2, 330, 700);
    const lifts: number[] = [];
    for (const share of [1, HOVER_LIFT, -1]) {
      t.move(2, 330, 700 - share * (TRAVEL / 2));
      lifts.push(read(t).lift);
    }
    expect(lifts.map(at)).toEqual([HELICOPTER.climbSpeed, 0, -HELICOPTER.climbSpeed]);
  });
});

describe('two thumbs, and more fingers', () => {
  it('flies with both thumbs at once', () => {
    const t = touch();
    t.down(1, 120, 600);
    t.down(2, 330, 700);
    t.move(1, 120, 600 - reach);
    t.move(2, 330, 700 - TRAVEL / 2);
    expect(read(t)).toEqual({ forward: 1, turn: 0, lift: 1 });
  });

  it('pays no heed to a third finger, nor a second on the same side', () => {
    const t = touch();
    t.down(1, 120, 600);
    t.down(2, 330, 700);
    expect(t.down(3, 100, 400)).toBe(false);
    expect(t.down(4, 300, 300)).toBe(false);
    t.move(3, 100, 200);
    t.move(4, 300, 900);
    t.up(3);
    t.up(4);
    expect(read(t)).toEqual({ forward: 0, turn: 0, lift: 0 });
    // and the first two still answer
    t.move(1, 120 - reach, 600);
    expect(read(t).turn).toBe(1);
  });

  it('lets go of everything when the page loses the fingers, but keeps the lever', () => {
    const t = touch();
    t.down(1, 120, 600);
    t.down(2, 330, 700);
    t.move(1, 120, 600 - reach);
    t.move(2, 330, 700 - TRAVEL / 4);
    t.release();
    expect(read(t)).toEqual({ forward: 0, turn: 0, lift: 0.5 });
    // a finger that was let go of answers no more
    t.move(1, 120, 600 + reach);
    t.move(2, 330, 700);
    expect(read(t)).toEqual({ forward: 0, turn: 0, lift: 0.5 });
  });
});

describe('the screen', () => {
  it('turned sideways, splits the screen as before and keeps the lever where it was', () => {
    const t = touch();
    t.down(2, 330, 700);
    t.move(2, 330, 700 - TRAVEL / 2);
    t.up(2);
    t.layout(844, 390, 260);
    expect(read(t).lift).toBe(1);
    expect(t.down(1, 400, 200)).toBe(true);
    expect(t.stick.active).toBe(true);
    expect(t.down(5, 430, 200)).toBe(true);
    // the new travel: half of it, down, takes the lever from the top to the middle
    t.move(5, 430, 200 + 130);
    expect(read(t).lift).toBe(0);
    expect([t.stick.x, t.stick.y]).toEqual([400, 200]);
  });

  it('counts each change, so the page draws only when something has moved', () => {
    const t = touch();
    const v0 = t.version;
    read(t);
    expect(t.version).toBe(v0);
    t.down(1, 120, 600);
    const v1 = t.version;
    expect(v1).toBeGreaterThan(v0);
    t.move(1, 121, 600);
    expect(t.version).toBeGreaterThan(v1);
  });
});
