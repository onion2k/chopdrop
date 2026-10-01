/**
 * The touch controls as the page has them: the stick and the lever drawn
 * over the game, fed the fingers that land on the stage, and shown while the
 * helicopter is flown by touch. It builds its elements once and moves them
 * by `transform` only when a finger has moved something, so a frame with no
 * finger on the glass writes nothing to the page. What the thumbs ask for is
 * worked out in `touch.ts`; this only carries fingers in and draws what it
 * says. Without it a phone has no way to fly.
 */
import type { Input } from './input';
import { TOUCH } from './touch';

/** How big the stick's ring and knob are drawn, about its reach: the knob at a full push sits half over the ring. */
const RING = TOUCH.reach + 10;
const KNOB = 26;

export class TouchView {
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly track: HTMLElement;
  private readonly handle: HTMLElement;
  private readonly stop: HTMLElement;
  private travel = 1;
  private drawn = -1;
  private shown: boolean | null = null;

  constructor(
    private readonly input: Input,
    stage: HTMLElement,
  ) {
    const root = el('div', document.body, 'touch');
    const stick = el('div', root, 'stick');
    this.base = el('div', stick, 'base');
    for (const [arrow, where] of [
      ['▲', 'up'],
      ['▼', 'down'],
      ['◀', 'left'],
      ['▶', 'right'],
    ])
      el('span', this.base, `chev ${where}`).textContent = arrow;
    el('span', this.base, 'label').textContent = 'FLY · TURN';
    this.knob = el('div', stick, 'knob');
    this.track = el('div', root, 'track');
    el('span', this.track, 'label top').textContent = '▲ UP';
    el('span', this.track, 'label bottom').textContent = '▼ DOWN';
    this.stop = el('div', this.track, 'stop');
    el('span', this.stop, 'label').textContent = 'HOVER';
    el('span', this.track, 'label sink').textContent = 'sink';
    this.handle = el('div', this.track, 'handle');
    for (const [e, size] of [
      [this.base, 2 * RING],
      [this.knob, 2 * KNOB],
    ] as const) {
      e.style.width = `${size}px`;
      e.style.height = `${size}px`;
    }

    const { touch } = input;
    // fingers only: a mouse on a desk is not a thumb, and must not turn the keyboard's game into a phone's
    const finger = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen';
    stage.addEventListener('pointerdown', (e) => {
      if (!finger(e)) return;
      input.by = 'touch';
      if (touch.down(e.pointerId, e.clientX, e.clientY)) stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (finger(e)) touch.move(e.pointerId, e.clientX, e.clientY);
    });
    for (const end of ['pointerup', 'pointercancel'] as const)
      stage.addEventListener(end, (e) => {
        if (finger(e)) touch.up(e.pointerId);
      });
    // a finger lifted while the page was not looking never says so, and would hold the stick for ever
    addEventListener('blur', () => touch.release());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) touch.release();
    });
    addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** The screen measured again, and the lever's travel with it: on a turn of the phone, and once at the start. */
  layout(): void {
    this.travel = Math.max(1, this.track.clientHeight - this.handle.offsetHeight);
    this.input.touch.layout(innerWidth, innerHeight, this.travel);
    this.stop.style.transform = `translateY(${this.leverAt(TOUCH.stop) + this.handle.offsetHeight / 2}px)`;
  }

  /** Shown while flown by touch, and drawn where the thumbs have them, only if anything has moved. */
  draw(): void {
    const shown = this.input.by === 'touch';
    if (shown !== this.shown) {
      this.shown = shown;
      document.body.classList.toggle('touching', shown);
      // the controls are measured only once they are on the screen
      if (shown) this.layout();
    }
    const { touch } = this.input;
    if (!shown || touch.version === this.drawn) return;
    this.drawn = touch.version;
    const { active, x, y, knobX, knobY } = touch.stick;
    this.base.classList.toggle('held', active);
    this.base.style.transform = `translate(${x - RING}px, ${y - RING}px)`;
    this.knob.style.transform = `translate(${x + knobX - KNOB}px, ${y + knobY - KNOB}px)`;
    this.handle.style.transform = `translateY(${this.leverAt(touch.lever)}px)`;
  }

  /** How far down its track the lever's handle sits at a lift: the top at one, the bottom at minus one. */
  private leverAt(lift: number): number {
    return ((1 - lift) / 2) * this.travel;
  }
}

/** An element of `kind` with an id or a class, put in `parent`. */
function el(kind: string, parent: HTMLElement, name: string): HTMLElement {
  const e = document.createElement(kind);
  if (parent === document.body) e.id = name;
  else e.className = name;
  parent.append(e);
  return e;
}
