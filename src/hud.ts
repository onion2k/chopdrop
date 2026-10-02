/**
 * The words on the screen while a level is flown: what is wanted, at which
 * pad or which ring of how many, an arrow turned toward it from where the
 * camera looks and how far off it is, the clock from the first lift-off, the
 * loader filling while the parcel is loaded or unloaded, a button in the
 * corner back to the list of levels, and the card at the end with the
 * time, the best time on the level, and the ways on: the next level, the same
 * one again, or the list. It reads where the game has got to and is told the
 * end by the game's event; it writes to the page only when a word or a figure
 * on it changes. Without it a player would not know where to go, nor that
 * they had got there.
 */
import type { Point } from './chase';
import type { Game } from './game';
import { DELIVERY, type LevelKind } from './mission';

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

/** How finely the loader is drawn: its fill moves in fortieths, so it is written a few dozen times a load, and no more. */
const LOADER_STEPS = 40;

/** What the card says a level of each kind ends with. */
const DONE: Record<LevelKind, string> = {
  delivery: 'Delivered!',
  rings: 'Trial complete!',
  course: 'Course complete!',
};

/** What the HUD's buttons do, which is the page's to say: the level again, the next one, and the list of levels. */
export interface HudActions {
  again: () => void;
  next: () => void;
  levels: () => void;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly arrow: SVGElement;
  private readonly goal: HTMLElement;
  private readonly far: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly loader: HTMLElement;
  private readonly fill: SVGCircleElement;
  private readonly loaderWords: HTMLElement;
  private readonly card: HTMLElement;
  private readonly title: HTMLElement;
  private readonly time: HTMLElement;
  private readonly best: HTMLElement;
  private readonly next: HTMLButtonElement;
  private readonly again: HTMLButtonElement;
  /** What is on the page now, so nothing is written that has not changed. */
  private shown = { goal: '', far: '', clock: '', turn: NaN, loader: -1, loaderWords: '', done: false };
  /** Whether the list of levels is up over it: it is hidden, and its keys are the list's. */
  private away = false;

  constructor(actions: HudActions) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <button type="button" class="to-levels" aria-label="Levels" title="Levels (Esc)"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="7" height="7" rx="2" /><rect x="11" y="2" width="7" height="7" rx="2" /><rect x="2" y="11" width="7" height="7" rx="2" /><rect x="11" y="11" width="7" height="7" rx="2" /></svg></button>
      <div class="top">
        <div class="bar"><svg class="arrow" viewBox="-13 -13 26 26" aria-hidden="true"><path d="M0,-11 L8,7 L0,3 L-8,7 Z" /></svg><span class="goal"></span><span class="far"></span><span class="clock"></span></div>
        <div class="loader" hidden><svg viewBox="-15 -15 30 30" aria-hidden="true"><circle class="track" r="11" /><circle class="fill" r="11" transform="rotate(-90)" /></svg><span class="what"></span></div>
      </div>
      <div class="done" hidden><div class="card"><h2></h2><div class="time"></div><div class="best"></div>
        <div class="actions"><button type="button" class="next"></button></div>
        <div class="actions"><button type="button" class="again">Fly again</button><button type="button" class="list">Levels</button></div>
      </div></div>`;
    document.body.append(this.root);
    const find = <T extends Element>(selector: string) => this.root.querySelector(selector) as T;
    this.arrow = find<SVGElement>('.arrow');
    this.goal = find<HTMLElement>('.goal');
    this.far = find<HTMLElement>('.far');
    this.clock = find<HTMLElement>('.clock');
    this.loader = find<HTMLElement>('.loader');
    this.fill = find<SVGCircleElement>('.fill');
    this.loaderWords = find<HTMLElement>('.what');
    this.card = find<HTMLElement>('.done');
    this.title = find<HTMLElement>('.card h2');
    this.time = find<HTMLElement>('.time');
    this.best = find<HTMLElement>('.card .best');
    this.next = find<HTMLButtonElement>('.next');
    this.again = find<HTMLButtonElement>('.again');
    const circle = 2 * Math.PI * 11;
    this.fill.style.strokeDasharray = `0 ${circle}`;
    this.next.addEventListener('click', actions.next);
    this.again.addEventListener('click', actions.again);
    find<HTMLButtonElement>('.list').addEventListener('click', actions.levels);
    find<HTMLButtonElement>('.to-levels').addEventListener('click', actions.levels);
    addEventListener('keydown', (e) => {
      // a key the list has already acted on, or one pressed while the list is up, is the list's
      if (e.defaultPrevented || this.away || this.root.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        actions.levels();
      } else if (e.key === 'Enter' && this.shown.done) {
        // the card's first way on: the next level, or the same one again after the last
        e.preventDefault();
        (this.next.hidden ? actions.again : actions.next)();
      }
    });
  }

  /** On the screen, once the game is ready to be flown. */
  show(): void {
    this.root.hidden = false;
  }

  /** Hidden while the list of levels is up over it, and shown again when it goes. */
  set listing(on: boolean) {
    this.away = on;
    this.root.classList.toggle('away', on);
  }

  /** Whether the card is up: the level is done. */
  get ended(): boolean {
    return this.shown.done;
  }

  /** The words for where the level has got to, written only where they have changed. */
  draw(game: Game, camera: { position: Point; target: Point }): void {
    const d = game.mission;
    const step = d.current;
    const goal = d.goal;
    if (this.away || this.shown.done || !step || !goal) return;
    const h = game.helicopter;
    const words =
      step.kind === 'ring'
        ? `Fly through ring ${d.ringNumber} of ${d.ringCount}`
        : step.kind === 'gate'
          ? `Fly ${step.label}`
          : step.kind === 'land'
            ? `Land on the ${game.island.pads[step.pad].site} pad`
            : step.kind === 'pickup'
              ? `Pick up the parcel at the ${game.island.pads[step.pad].site} pad`
              : `Deliver it to the ${game.island.pads[step.pad].site} pad`;
    const far = `${Math.round(Math.hypot(goal.x - h.x, goal.y - h.y))} m`;
    const time = clock(d.time);
    const turn = pointer(camera, h, goal);
    const loader = d.loading > 0 ? Math.round((d.loading / DELIVERY.load) * LOADER_STEPS) : -1;
    const loaderWords = step.kind === 'pickup' ? 'Loading the parcel' : 'Unloading the parcel';
    const s = this.shown;
    if (words !== s.goal) this.goal.textContent = s.goal = words;
    if (far !== s.far) this.far.textContent = s.far = far;
    if (time !== s.clock) this.clock.textContent = s.clock = time;
    if (turn !== s.turn) this.arrow.style.transform = `rotate(${(s.turn = turn)}deg)`;
    if (loader !== s.loader) {
      this.loader.hidden = loader < 0;
      if (loader >= 0) {
        const circle = 2 * Math.PI * 11;
        this.fill.style.strokeDasharray = `${(circle * loader) / LOADER_STEPS} ${circle}`;
      }
      s.loader = loader;
    }
    if (loaderWords !== s.loaderWords) this.loaderWords.textContent = s.loaderWords = loaderWords;
  }

  /**
   * The end, as the game tells it: the card, with what kind of level it was, the time it took, the best time on it
   * (null if none is kept, which only a level never lifted off from has) and whether this is it, and the next level's
   * name, or null after the last.
   */
  finished(kind: LevelKind, seconds: number, best: number | null, isBest: boolean, next: string | null): void {
    this.title.textContent = DONE[kind];
    this.time.textContent = `in ${clock(seconds)}`;
    this.best.hidden = best === null;
    this.best.textContent = isBest ? '★ New best' : `Best ${clock(best ?? 0)}`;
    this.next.hidden = next === null;
    this.next.textContent = `Next level: ${next ?? ''}`;
    this.card.hidden = false;
    this.loader.hidden = true;
    this.root.classList.add('ended');
    this.shown.done = true;
    (next === null ? this.again : this.next).focus({ preventScroll: true });
  }

  /** A level flown from the start: the card put away, and everything written afresh on the next draw. */
  fly(): void {
    this.card.hidden = true;
    this.root.classList.remove('ended');
    this.shown = { goal: '', far: '', clock: '', turn: NaN, loader: -1, loaderWords: '', done: false };
    this.loader.hidden = true;
  }
}
