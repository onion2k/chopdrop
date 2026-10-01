/**
 * The words on the screen while a level is flown: what is wanted and at which
 * pad, an arrow turned toward it from where the camera looks and how far off
 * it is, the ring filling while the parcel is loaded or unloaded, and the
 * card at the end with the time and a way to fly it again. It reads where
 * the game has got to and is told the end by the game's event; it writes to
 * the page only when a word or a figure on it changes. Without it a player
 * would not know where to go, nor that they had got there.
 */
import type { Point } from './chase';
import { DELIVERY } from './delivery';
import type { Game } from './game';

/** How far round the arrow is turned, in degrees clockwise, to point from `from` toward `to` as seen along the camera. */
export function pointer(
  camera: { position: Point; target: Point },
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const fx = camera.target[0] - camera.position[0],
    fy = camera.target[1] - camera.position[1];
  const tx = to.x - from.x,
    ty = to.y - from.y;
  // turned anticlockwise from the way the camera looks, as the ground is seen from above; the screen turns clockwise
  // `|| 0`, so a pad dead ahead is a turn of nothing and not of minus nothing
  return Math.round((-Math.atan2(fx * ty - fy * tx, fx * tx + fy * ty) * 180) / Math.PI) || 0;
}

/** A time in seconds as minutes and seconds, the seconds always two figures. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** How finely the ring is drawn: its fill moves in fortieths, so it is written a few dozen times a load, and no more. */
const RING_STEPS = 40;

export class Hud {
  private readonly root: HTMLElement;
  private readonly arrow: SVGElement;
  private readonly goal: HTMLElement;
  private readonly far: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly fill: SVGCircleElement;
  private readonly ringWords: HTMLElement;
  private readonly card: HTMLElement;
  private readonly time: HTMLElement;
  private readonly button: HTMLButtonElement;
  /** What is on the page now, so nothing is written that has not changed. */
  private shown = { goal: '', far: '', turn: NaN, ring: -1, ringWords: '', done: false };

  constructor(again: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="top">
        <div class="bar"><svg class="arrow" viewBox="-13 -13 26 26" aria-hidden="true"><path d="M0,-11 L8,7 L0,3 L-8,7 Z" /></svg><span class="goal"></span><span class="far"></span></div>
        <div class="ring" hidden><svg viewBox="-15 -15 30 30" aria-hidden="true"><circle class="track" r="11" /><circle class="fill" r="11" transform="rotate(-90)" /></svg><span class="what"></span></div>
      </div>
      <div class="done" hidden><div class="card"><h2>Delivered!</h2><div class="time"></div><button type="button">Fly again</button></div></div>`;
    document.body.append(this.root);
    const find = <T extends Element>(selector: string) => this.root.querySelector(selector) as T;
    this.arrow = find<SVGElement>('.arrow');
    this.goal = find<HTMLElement>('.goal');
    this.far = find<HTMLElement>('.far');
    this.ring = find<HTMLElement>('.ring');
    this.fill = find<SVGCircleElement>('.fill');
    this.ringWords = find<HTMLElement>('.what');
    this.card = find<HTMLElement>('.done');
    this.time = find<HTMLElement>('.time');
    this.button = find<HTMLButtonElement>('button');
    const circle = 2 * Math.PI * 11;
    this.fill.style.strokeDasharray = `0 ${circle}`;
    this.button.addEventListener('click', again);
    addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.shown.done) {
        e.preventDefault();
        again();
      }
    });
  }

  /** On the screen, once the game is ready to be flown. */
  show(): void {
    this.root.hidden = false;
  }

  /** The words for where the delivery has got to, written only where they have changed. */
  draw(game: Game, camera: { position: Point; target: Point }): void {
    const d = game.delivery;
    if (this.shown.done || d.target < 0) return;
    const pad = game.island.pads[d.target];
    const h = game.helicopter;
    const goal =
      d.stage === 'pickup' ? `Pick up the parcel at the ${pad.site} pad` : `Deliver it to the ${pad.site} pad`;
    const far = `${Math.round(Math.hypot(pad.x - h.x, pad.y - h.y))} m`;
    const turn = pointer(camera, h, pad);
    const ring = d.ring > 0 ? Math.round((d.ring / DELIVERY.load) * RING_STEPS) : -1;
    const ringWords = d.stage === 'pickup' ? 'Loading the parcel' : 'Unloading the parcel';
    const s = this.shown;
    if (goal !== s.goal) this.goal.textContent = s.goal = goal;
    if (far !== s.far) this.far.textContent = s.far = far;
    if (turn !== s.turn) this.arrow.style.transform = `rotate(${(s.turn = turn)}deg)`;
    if (ring !== s.ring) {
      this.ring.hidden = ring < 0;
      if (ring >= 0) {
        const circle = 2 * Math.PI * 11;
        this.fill.style.strokeDasharray = `${(circle * ring) / RING_STEPS} ${circle}`;
      }
      s.ring = ring;
    }
    if (ringWords !== s.ringWords) this.ringWords.textContent = s.ringWords = ringWords;
  }

  /** The end, as the game tells it: the card, with the time it took. */
  delivered(seconds: number): void {
    this.time.textContent = `in ${clock(seconds)}`;
    this.card.hidden = false;
    this.ring.hidden = true;
    this.root.classList.add('ended');
    this.shown.done = true;
    this.button.focus({ preventScroll: true });
  }

  /** The start again: the card put away, and everything written afresh on the next draw. */
  again(): void {
    this.card.hidden = true;
    this.root.classList.remove('ended');
    this.shown = { goal: '', far: '', turn: NaN, ring: -1, ringWords: '', done: false };
    this.ring.hidden = true;
  }
}
