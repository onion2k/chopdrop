/**
 * The words on the screen: flying free, a hint that a crate is to be landed on or a start flown; shown the way, an
 * arrow turned toward the start of a level and how far off it is; and with a level going, what is wanted, at which pad or
 * which ring of how many, the arrow and distance to it and the clock from the level's beginning. The loader fills while
 * a parcel is loaded or unloaded, a button in the corner opens the panel, and a toast under the bar tells a level done or a
 * structure collected and goes after a few seconds of game time, a structure's waiting for the one before it. It reads
 * where the game has got to and is told the end, and each structure collected, by the game's events; it writes to the
 * page only when a word or a figure on it changes. Without it a player would not know where to go, nor that they had
 * got there.
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

/** The toast's words for a structure collected, as the test API reads them: "Collected the lakeside towers · 3 of 7". */
export function collectedWords(name: string, n: number, of: number): string {
  return `Collected ${name} · ${n} of ${of}`;
}

/**
 * A toast: the four places the card writes (its title, then the two halves of the line under it and what is between
 * them), the words as the test API reads them, whether it is a level's, and the game time it began to be shown at.
 */
export interface ToastText {
  title: string;
  left: string;
  sep: string;
  right: string;
  words: string;
  level: boolean;
  from: number;
}

/** A toast written over another's, field by field. */
function copy(to: ToastText, from: ToastText): void {
  to.title = from.title;
  to.left = from.left;
  to.sep = from.sep;
  to.right = from.right;
  to.words = from.words;
  to.level = from.level;
  to.from = from.from;
}

/**
 * What the card says and what waits behind it, in game time. A level's toast is shown at once; a structure's, told while
 * another shows, waits its turn and is then shown for `TOAST.seconds` of its own, counted from the moment the one before
 * it ended and not from when it was seen, so the same game shows the same toasts however often it is drawn. The waiting
 * are a ring of slots sized once, as many as there are structures to collect, since each can be told once: past that the
 * oldest waiting is let go. A level's toast that comes while a structure's shows takes the card, and the structure's
 * goes to the front of the queue, to be shown whole once it has gone. It makes nothing after it is built.
 */
export class ToastQueue {
  /** What is shown now, valid while `update` last returned it. */
  private readonly now: ToastText = blank();
  private readonly ring: ToastText[];
  private head = 0;
  private count = 0;
  private showing = false;
  /** Changes each time what is shown changes, to a toast or to none, so the page writes the card only then. */
  serial = 0;

  constructor(readonly capacity: number) {
    this.ring = Array.from({ length: capacity }, blank);
  }

  /** What is shown, as it was last brought up to date by `update`, or null. */
  get current(): ToastText | null {
    return this.showing ? this.now : null;
  }

  /** How many toasts wait behind the one shown. */
  get waiting(): number {
    return this.count;
  }

  /** What is shown at game time `now`, with the waiting one that is next brought up as each ends; null for nothing. */
  update(now: number): ToastText | null {
    while (this.showing && !toastShown(this.now.from, now)) {
      const ended = this.now.from + TOAST.seconds;
      if (this.count === 0) {
        this.showing = false;
        this.serial++;
        break;
      }
      copy(this.now, this.ring[this.head]);
      this.head = (this.head + 1) % this.capacity;
      this.count--;
      this.now.from = ended;
      this.serial++;
    }
    return this.showing ? this.now : null;
  }

  /** The end of a level of `kind`, taking `seconds`, told at game time `now`: shown at once. */
  level(kind: LevelKind, seconds: number, best: boolean, now: number): void {
    this.update(now);
    if (this.showing && !this.now.level) this.push(this.now, true);
    const t = this.now;
    t.title = DONE[kind];
    t.left = clock(seconds);
    t.sep = best ? ' · ' : '';
    t.right = best ? '★ New best' : '';
    t.words = toastWords(kind, seconds, best);
    t.level = true;
    t.from = now;
    this.showing = true;
    this.serial++;
  }

  /** The structure `name` collected, the `n`th of `of`, told at game time `now`: shown at once if nothing is, and otherwise in its turn. */
  collected(name: string, n: number, of: number, now: number): void {
    this.update(now);
    if (this.showing) {
      this.push(
        {
          title: 'Collected',
          left: name,
          sep: ' · ',
          right: `${n} of ${of}`,
          words: collectedWords(name, n, of),
          level: false,
          from: 0,
        },
        false,
      );
      return;
    }
    const t = this.now;
    t.title = 'Collected';
    t.left = name;
    t.sep = ' · ';
    t.right = `${n} of ${of}`;
    t.words = collectedWords(name, n, of);
    t.level = false;
    t.from = now;
    this.showing = true;
    this.serial++;
  }

  /** Everything put away, shown and waiting. */
  clear(): void {
    if (this.showing) this.serial++;
    this.showing = false;
    this.head = 0;
    this.count = 0;
  }

  /** `toast` put in the ring, at the back, or at the front to be shown next; the oldest waiting is let go if it is full. */
  private push(toast: ToastText, front: boolean): void {
    if (this.capacity === 0) return;
    if (this.count === this.capacity) {
      // full: one goes to make room, the oldest waiting from the front, and from the back if this is to go in front of it, since that has waited longest
      if (front) this.count--;
      else {
        this.head = (this.head + 1) % this.capacity;
        this.count--;
      }
    }
    const slot = front ? (this.head + this.capacity - 1) % this.capacity : (this.head + this.count) % this.capacity;
    copy(this.ring[slot], toast);
    if (front) this.head = slot;
    this.count++;
  }
}

function blank(): ToastText {
  return { title: '', left: '', sep: '', right: '', words: '', level: false, from: 0 };
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
    toast: -1,
  };
  /** The level the way is shown to, and the point it starts at, worked out once when it changes and not every frame. */
  private guide: Level | null = null;
  private guideAt = { x: 0, y: 0 };
  private guideWords = '';
  /** The step the words were made for, and the words: made when the step changes and not every frame. */
  private stepFor: Step | null = null;
  private stepWords = '';
  /** The toast shown, and those waiting behind it. */
  private readonly toasts: ToastQueue;
  /** Whether the panel is up over it: it is hidden, and its keys are the panel's. */
  private away = false;

  /** `toasts` is how many structures there are to collect, which is the most that can wait behind a toast. */
  constructor(actions: HudActions, toasts: number) {
    this.toasts = new ToastQueue(toasts);
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
    return this.toasts.current?.words ?? null;
  }

  /**
   * The words for where the game has got to, written only where they have changed: the hint with nothing going; the way
   * to a start with a level guided to; and with a level going, what is wanted and the clock. The toast goes by game time.
   */
  draw(game: Game, camera: { position: Point; target: Point }): void {
    if (this.away) return;
    const s = this.shown;
    const d = game.mission;
    const toast = this.toasts.update(game.t);
    const on = toast !== null;
    // the card is written when what it shows changes, and not every frame
    if (this.toasts.serial !== s.toast) {
      s.toast = this.toasts.serial;
      this.toastBox.hidden = !on;
      if (toast) {
        this.title.textContent = toast.title;
        this.time.textContent = toast.left;
        this.sep.textContent = toast.sep;
        this.best.textContent = toast.right;
      }
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
   * and, if this is the best time on it yet, "New best". It is shown for `TOAST.seconds` of game time from `now`, ahead of
   * any structure's toast waiting.
   */
  finished(kind: LevelKind, seconds: number, isBest: boolean, now: number): void {
    this.toasts.level(kind, seconds, isBest, now);
  }

  /** A structure collected, as the game tells it, at game time `now`: its toast, now or in its turn after the one shown. */
  collected(name: string, n: number, of: number, now: number): void {
    this.toasts.collected(name, n, of, now);
  }

  /** The toast put away and everything written afresh on the next draw, as when the helicopter is put somewhere new. */
  fly(): void {
    this.toastBox.hidden = true;
    this.toasts.clear();
    this.guide = null;
    this.shown = {
      mode: this.shown.mode,
      goal: '',
      far: -1,
      clock: -1,
      turn: NaN,
      loader: -1,
      loaderWords: '',
      toast: -1,
    };
    this.loader.hidden = true;
  }
}
