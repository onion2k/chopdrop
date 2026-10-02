/**
 * The words on the screen: flying free, a hint that a crate is to be landed on or a start flown; shown the way, an
 * arrow turned toward the start of a level and how far off it is; and with a level going, what is wanted, at which pad or
 * which ring of how many, the arrow and distance to it and the clock from the level's beginning. The loader fills while
 * a parcel is loaded or unloaded, a button in the corner opens the panel, and a toast under the bar tells a level done
 * and goes after a few seconds of game time. It reads where the game has got to and is told the end by the game's
 * event; it writes to the page only when a word or a figure on it changes. Without it a player would not know where to
 * go, nor that they had got there.
 */
import type { Point } from './chase';
import type { Game } from './game';
import { DELIVERY, type Level, type LevelKind, type Step } from './mission';

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

/** The pads of the island as the words and the arrow need them: where each is, and what it is called. */
export interface PadWords {
  x: number;
  y: number;
  site: string;
}

/** The step a level begins with, which is where it starts. */
function firstOf(level: { steps: readonly Step[] }): Step {
  return level.steps[0];
}

/**
 * Where a level starts, as the panel and the HUD put it: a pickup, "Land on the meadow pad"; a ring, "Fly through the
 * first ring, by the lakeside pad", the pad being the one nearest the ring; an opening, "Fly between the towers". One
 * function, so what the panel says and what the bar says are the same words.
 */
export function startWords(level: { steps: readonly Step[] }, pads: readonly PadWords[]): string {
  const first = firstOf(level);
  if (first.kind === 'gate') return `Fly ${first.label}`;
  if (first.kind === 'ring') {
    let site = '';
    let nearest = Infinity;
    for (const pad of pads) {
      const d = Math.hypot(pad.x - first.x, pad.y - first.y);
      if (d < nearest) {
        nearest = d;
        site = pad.site;
      }
    }
    return `Fly through the first ring, by the ${site} pad`;
  }
  return `Land on the ${pads[first.pad].site} pad`;
}

/** Where the arrow points to start a level: the pad of a pickup, or the middle of its first ring or opening. */
export function startPoint(level: { steps: readonly Step[] }, pads: readonly PadWords[]): { x: number; y: number } {
  const first = firstOf(level);
  const at = first.kind === 'ring' || first.kind === 'gate' ? first : pads[first.pad];
  return { x: at.x, y: at.y };
}

/**
 * What the bar shows: the hint alone, flying free; the way to a start; or the level going. A level going outranks a
 * guide. Under a toast with nothing going and nothing guided it shows nothing, so the hint is not stacked over the
 * words that tell a level done; a level's words and a guide are never hidden.
 */
export function barMode(going: boolean, guided: boolean, toast = false): 'free' | 'guided' | 'going' | 'quiet' {
  return going ? 'going' : guided ? 'guided' : toast ? 'quiet' : 'free';
}

/** How long the toast is shown, in seconds of game time, so the game held behind the panel holds it too. */
export const TOAST = { seconds: 3 };

/** Whether a toast told at game time `from` is still shown at `now`. */
export function toastShown(from: number, now: number): boolean {
  return now >= from && now - from < TOAST.seconds;
}

/** What the toast says a level of each kind ends with. */
const DONE: Record<LevelKind, string> = {
  delivery: 'Delivered!',
  rings: 'Trial complete!',
  course: 'Course complete!',
};

/** The toast's words, as the test API reads them: the title by the kind of level, the time, and "New best" when it is one. */
export function toastWords(kind: LevelKind, seconds: number, best: boolean): string {
  return `${DONE[kind]} ${clock(seconds)}${best ? ' ★ New best' : ''}`;
}

/** The hint in the bar, flying free. */
const HINT = 'Land on a crate or fly a start';

/** How finely the loader is drawn: its fill moves in fortieths, so it is written a few dozen times a load, and no more. */
const LOADER_STEPS = 40;

/** What the HUD's one button does, which is the page's to say: open the panel. */
export interface HudActions {
  panel: () => void;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly arrow: SVGElement;
  private readonly goal: HTMLElement;
  private readonly far: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly loader: HTMLElement;
  private readonly fill: SVGCircleElement;
  private readonly loaderWords: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly title: HTMLElement;
  private readonly time: HTMLElement;
  private readonly sep: HTMLElement;
  private readonly best: HTMLElement;
  /** What is on the page now, so nothing is written that has not changed. */
  private shown = {
    mode: 'free' as 'free' | 'guided' | 'going' | 'quiet',
    goal: '',
    far: -1,
    clock: -1,
    turn: NaN,
    loader: -1,
    loaderWords: '',
    toast: false,
  };
  /** The level the way is shown to, and the point it starts at, worked out once when it changes and not every frame. */
  private guide: Level | null = null;
  private guideAt = { x: 0, y: 0 };
  private guideWords = '';
  /** The step the words were made for, and the words: made when the step changes and not every frame. */
  private stepFor: Step | null = null;
  private stepWords = '';
  /** The game time the toast was told at, and its words while it is shown. */
  private toldAt = -Infinity;
  private words: string | null = null;
  /** Whether the panel is up over it: it is hidden, and its keys are the panel's. */
  private away = false;

  constructor(actions: HudActions) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <button type="button" class="to-levels" aria-label="Levels" title="Levels (Esc)"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="7" height="7" rx="2" /><rect x="11" y="2" width="7" height="7" rx="2" /><rect x="2" y="11" width="7" height="7" rx="2" /><rect x="11" y="11" width="7" height="7" rx="2" /></svg></button>
      <div class="top">
        <div class="bar" data-mode="free"><span class="hint"></span><svg class="arrow" viewBox="-13 -13 26 26" aria-hidden="true"><path d="M0,-11 L8,7 L0,3 L-8,7 Z" /></svg><span class="goal"></span><span class="far"></span><span class="clock"></span></div>
        <div class="loader" hidden><svg viewBox="-15 -15 30 30" aria-hidden="true"><circle class="track" r="11" /><circle class="fill" r="11" transform="rotate(-90)" /></svg><span class="what"></span></div>
        <div class="toast" hidden><h2></h2><div class="t"><span class="time"></span><span class="sep"></span><span class="b"></span></div></div>
      </div>`;
    document.body.append(this.root);
    const find = <T extends Element>(selector: string) => this.root.querySelector(selector) as T;
    this.bar = find<HTMLElement>('.bar');
    this.arrow = find<SVGElement>('.arrow');
    this.goal = find<HTMLElement>('.goal');
    this.far = find<HTMLElement>('.far');
    this.clock = find<HTMLElement>('.clock');
    this.loader = find<HTMLElement>('.loader');
    this.fill = find<SVGCircleElement>('.fill');
    this.loaderWords = find<HTMLElement>('.what');
    this.toastBox = find<HTMLElement>('.toast');
    this.title = find<HTMLElement>('.toast h2');
    this.time = find<HTMLElement>('.toast .time');
    this.sep = find<HTMLElement>('.toast .sep');
    this.best = find<HTMLElement>('.toast .b');
    find<HTMLElement>('.hint').textContent = HINT;
    const circle = 2 * Math.PI * 11;
    this.fill.style.strokeDasharray = `0 ${circle}`;
    find<HTMLButtonElement>('.to-levels').addEventListener('click', actions.panel);
    addEventListener('keydown', (e) => {
      // a key the panel has already acted on, or one pressed while the panel is up, is the panel's
      if (e.defaultPrevented || this.away || this.root.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        actions.panel();
      }
    });
  }

  /** On the screen, once the game is ready to be flown. */
  show(): void {
    this.root.hidden = false;
  }

  /** Hidden while the panel is up over it, and shown again when it goes. */
  set listing(on: boolean) {
    this.away = on;
    this.root.classList.toggle('away', on);
  }

  /** The toast's words while it is shown, or null. */
  get toast(): string | null {
    return this.words;
  }

  /**
   * The words for where the game has got to, written only where they have changed: the hint with nothing going; the way
   * to a start with a level guided to; and with a level going, what is wanted and the clock. The toast goes by game time.
   */
  draw(game: Game, camera: { position: Point; target: Point }): void {
    if (this.away) return;
    const s = this.shown;
    const d = game.mission;
    const on = this.words !== null && toastShown(this.toldAt, game.t);
    if (on !== s.toast) {
      this.toastBox.hidden = !on;
      s.toast = on;
      if (!on) this.words = null;
    }
    const step = d.current;
    const mode = barMode(step !== undefined, game.guided !== null, on);
    if (mode !== s.mode) {
      this.bar.dataset.mode = s.mode = mode;
      // the words for the new mode are written afresh below
      s.goal = '';
      s.far = -1;
      s.clock = -1;
      s.turn = NaN;
    }
    // the loader fills while the parcel of a level going is loaded or unloaded, or while a start's crate is loaded
    const loading = step ? d.loading : game.starts.loading;
    const loader = loading > 0 ? Math.round((loading / DELIVERY.load) * LOADER_STEPS) : -1;
    const loaderWords = step && step.kind !== 'pickup' ? 'Unloading the parcel' : 'Loading the parcel';
    if (loader !== s.loader) {
      this.loader.hidden = loader < 0;
      if (loader >= 0) {
        const circle = 2 * Math.PI * 11;
        this.fill.style.strokeDasharray = `${(circle * loader) / LOADER_STEPS} ${circle}`;
      }
      s.loader = loader;
    }
    if (loaderWords !== s.loaderWords) this.loaderWords.textContent = s.loaderWords = loaderWords;
    if (mode === 'free' || mode === 'quiet') return;

    const h = game.helicopter;
    let to: { x: number; y: number };
    let words: string;
    if (step) {
      const goal = d.goal!;
      to = goal;
      // the words are made when the step changes and not on every frame
      if (step !== this.stepFor) {
        this.stepFor = step;
        this.stepWords =
          step.kind === 'ring'
            ? `Fly through ring ${d.ringNumber} of ${d.ringCount}`
            : step.kind === 'gate'
              ? `Fly ${step.label}`
              : step.kind === 'land'
                ? `Land on the ${game.island.pads[step.pad].site} pad`
                : step.kind === 'pickup'
                  ? `Pick up the parcel at the ${game.island.pads[step.pad].site} pad`
                  : `Deliver it to the ${game.island.pads[step.pad].site} pad`;
      }
      words = this.stepWords;
      const time = Math.floor(d.time);
      if (time !== s.clock) this.clock.textContent = clock((s.clock = time));
    } else {
      // shown the way: the point is worked out once for the level, since the game does not change it
      if (game.guided !== this.guide) {
        this.guide = game.guided;
        this.guideAt = startPoint(game.guided!, game.island.pads);
        this.guideWords = `To the start · ${game.guided!.name}`;
      }
      to = this.guideAt;
      words = this.guideWords;
    }
    const far = Math.round(Math.hypot(to.x - h.x, to.y - h.y));
    const turn = pointer(camera, h, to);
    if (words !== s.goal) this.goal.textContent = s.goal = words;
    if (far !== s.far) this.far.textContent = `${(s.far = far)} m`;
    if (turn !== s.turn) this.arrow.style.transform = `rotate(${(s.turn = turn)}deg)`;
  }

  /**
   * The end, as the game tells it, at game time `now`: the toast, with the title by the kind of level, the time it took
   * and, if this is the best time on it yet, "New best". It is shown for `TOAST.seconds` of game time from `now`.
   */
  finished(kind: LevelKind, seconds: number, isBest: boolean, now: number): void {
    this.title.textContent = DONE[kind];
    this.time.textContent = clock(seconds);
    this.sep.textContent = isBest ? ' · ' : '';
    this.best.textContent = isBest ? '★ New best' : '';
    this.toastBox.hidden = false;
    this.shown.toast = true;
    this.toldAt = now;
    this.words = toastWords(kind, seconds, isBest);
  }

  /** The toast put away and everything written afresh on the next draw, as when the helicopter is put somewhere new. */
  fly(): void {
    this.toastBox.hidden = true;
    this.words = null;
    this.toldAt = -Infinity;
    this.guide = null;
    this.shown = {
      mode: this.shown.mode,
      goal: '',
      far: -1,
      clock: -1,
      turn: NaN,
      loader: -1,
      loaderWords: '',
      toast: false,
    };
    this.loader.hidden = true;
  }
}
