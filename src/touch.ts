/**
 * Touch, as the helicopter's controls: a stick under the left thumb for
 * flying and turning, and a lever under the right for the height, which
 * stays where it is left and clicks into a stop at the hover. Fingers come
 * in as plain numbers (an id and a point on the screen, in CSS pixels) and
 * `Controls` go out, with what the page needs to draw; nothing here touches
 * the page, so it is tried headless. Without it a phone can only watch.
 */
import { HOVER_LIFT, type Controls } from './helicopter';

/** How the stick and the lever answer. Sizes are CSS pixels. */
export const TOUCH = {
  /** How far the knob goes from the stick's middle: a push that far is a full one, and it is held to it. */
  reach: 56,
  /** The share of the reach a thumb may wander from the middle and ask for nothing. */
  dead: 0.125,
  /** The share of the screen's width, from the left, that is the stick's; the rest is the lever's. */
  stickSide: 0.5,
  /** How far in from the screen's edges the stick's middle is kept, so its ring is on screen. */
  edge: 76,
  /** Where the stick waits to be touched, from the bottom left of the screen. */
  rest: [96, 132] as const,
  /** The lever's stop, as lift, and how near a slide must come to it to click in. */
  stop: HOVER_LIFT,
  pull: 0.06,
};

export class TouchControls {
  /**
   * The stick as drawn: whether a thumb is on it, where its middle is, and where its knob is from its middle. Its
   * middle is where the thumb landed, kept far enough in that its ring is on the screen.
   */
  readonly stick = { active: false, x: 0, y: 0, knobX: 0, knobY: 0 };
  /** The lever, as lift: −1 at the bottom of its travel, 1 at the top. It starts at the sink, and stays where it is left. */
  lever = 0;
  /** Counted up each time anything here changes, so the page draws only when it has. */
  version = 0;
  private width = 1;
  private height = 1;
  private travel = 1;
  /** Which finger has the stick and which the lever, or −1; and the lever as slid, before the stop pulls it in. */
  private stickFinger = -1;
  private leverFinger = -1;
  private leverY = 0;
  private slid = 0;
  /** Where the stick's thumb landed, which is where it asks for nothing, whether or not the ring could be drawn there. */
  private landedX = 0;
  private landedY = 0;

  /** The screen's size, and how far the lever's handle travels from its bottom to its top. */
  layout(width: number, height: number, travel: number): void {
    this.width = width;
    this.height = height;
    this.travel = Math.max(1, travel);
    if (!this.stick.active) this.rest();
    this.version++;
  }

  /** A finger put down at (x, y); whether it took the stick or the lever. */
  down(id: number, x: number, y: number): boolean {
    if (x < this.width * TOUCH.stickSide) {
      if (this.stickFinger >= 0) return false;
      this.stickFinger = id;
      const s = this.stick;
      s.active = true;
      // landing asks for nothing, wherever the thumb lands: a thumb near an edge has its ring drawn a little in from it
      this.landedX = x;
      this.landedY = y;
      s.x = clamp(x, TOUCH.edge, Math.max(TOUCH.edge, this.width - TOUCH.edge));
      s.y = clamp(y, TOUCH.edge, Math.max(TOUCH.edge, this.height - TOUCH.edge));
      this.knob(x, y);
    } else {
      if (this.leverFinger >= 0) return false;
      this.leverFinger = id;
      this.leverY = y;
      this.slid = this.lever;
    }
    this.version++;
    return true;
  }

  /** A finger moved to (x, y). */
  move(id: number, x: number, y: number): void {
    if (id === this.stickFinger) this.knob(x, y);
    else if (id === this.leverFinger) {
      // half the travel is a lift of one, so the whole of it runs from the bottom to the top
      this.slid = clamp(this.slid - ((y - this.leverY) * 2) / this.travel, -1, 1);
      this.leverY = y;
      this.lever = Math.abs(this.slid - TOUCH.stop) < TOUCH.pull ? TOUCH.stop : this.slid;
    } else return;
    this.version++;
  }

  /** A finger lifted, or taken away by the browser. */
  up(id: number): void {
    if (id === this.stickFinger) {
      this.stickFinger = -1;
      this.rest();
    } else if (id === this.leverFinger) this.leverFinger = -1;
    else return;
    this.version++;
  }

  /** Back to the start: every finger let go, and the lever down at the sink, so a helicopter set on a pad rests there. */
  reset(): void {
    this.release();
    this.lever = 0;
    this.slid = 0;
  }

  /** Every finger let go: the page has lost its focus or been hidden. */
  release(): void {
    this.stickFinger = -1;
    this.leverFinger = -1;
    this.rest();
    this.version++;
  }

  /** The controls as the thumbs have them, written into `out`, which is returned. */
  read(out: Controls): Controls {
    const { knobX, knobY } = this.stick;
    const push = Math.hypot(knobX, knobY) / TOUCH.reach;
    // beyond the dead zone the push runs from nothing to one, along the way the knob is pushed
    const scale = push <= TOUCH.dead ? 0 : (push - TOUCH.dead) / (1 - TOUCH.dead) / (push * TOUCH.reach);
    out.forward = -knobY * scale || 0;
    out.turn = -knobX * scale || 0;
    out.lift = this.lever;
    return out;
  }

  /** The knob pushed as far as the thumb at (x, y) has moved from where it landed, held to the ring. */
  private knob(x: number, y: number): void {
    const s = this.stick;
    let dx = x - this.landedX,
      dy = y - this.landedY;
    const d = Math.hypot(dx, dy);
    if (d > TOUCH.reach) {
      dx *= TOUCH.reach / d;
      dy *= TOUCH.reach / d;
    }
    s.knobX = dx;
    s.knobY = dy;
  }

  /** The stick let go, back where it waits, its knob in the middle. */
  private rest(): void {
    const s = this.stick;
    s.active = false;
    s.x = TOUCH.rest[0];
    s.y = this.height - TOUCH.rest[1];
    s.knobX = 0;
    s.knobY = 0;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
