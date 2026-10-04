/**
 * The words on the screen: flying free, a hint that a crate is to be landed on or a start flown; shown the way, an
 * arrow turned toward the start of a level and how far off it is; and with a level going, what is wanted, at which pad or
 * which ring of how many, the arrow and distance to it and the clock from the level's beginning. The loader fills while
 * a parcel is loaded or unloaded, a button in the corner opens the panel, and a toast under the bar tells a level done, a
 * structure collected or a package found and goes after a few seconds of game time, a structure's or a package's waiting
 * for the one before it. A badge in the other corner is the package radar: a grey dot when no package is within its range
 * and a gold one that sends out a ring at each ping when one is, which says nothing of where. It reads where the game has
 * got to and is told the end, each structure collected, each package found and each ping, by the game's events; it
 * writes to the page only when a word or a figure on it changes. Beside it is the bucket's button, always shown, which is
 * the tank's badge as well: grey with the key's tag while the bucket is in, an orange ring while it is out, and with water
 * drawn in it in blue when it is full. A click or a tap on it puts the bucket out or takes it in, as the key B does. The bucket's words
 * (press B for it, hover low over the water to fill it, fly over the flames to drop, or take it to the fire when shown the way) are the bar's for a fire, going or
 * guided to, and for the nearest fire flying free with the bucket out; the loader reads "Filling the bucket" and fills in blue as the
 * tank does, and "The walker climbs aboard" for a person boarding. Without it a player would not know where to go, nor
 * that they had got there.
 */
import type { Point } from './chase';
import { RADAR } from './finds';
import type { Game } from './game';
import { DELIVERY, fireOf, type Level, type LevelKind, type Step } from './mission';
import { SCOOP } from './water';

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
 * first ring, by the lakeside pad", the pad being the one nearest the ring; an opening, "Fly between the towers"; a fire, "Take the bucket to the fire by the west lake". One
 * function, so what the panel says and what the bar says are the same words.
 */
export function startWords(level: { steps: readonly Step[]; name?: string }, pads: readonly PadWords[]): string {
  const first = firstOf(level);
  if (first.kind === 'gate') return `Fly ${first.label}`;
  if (first.kind === 'winch') return `Winch up ${first.who} ${first.where}`;
  if (first.kind === 'board') return `Land beside ${first.who} ${first.where}`;
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
  // a fire is begun by coming to it with the bucket out, and has no pad: the words are from the fire's name, "Fire by the west lake"
  if (first.kind === 'arrive' || first.kind === 'fire')
    return level.name
      ? `Take the bucket to the ${level.name[0].toLowerCase()}${level.name.slice(1)}`
      : 'Take the bucket to the fire';
  return `Land on the ${pads[first.pad].site} pad`;
}

/** What a fire's words need beyond the step: how many patches burn, the bucket's state, and whether it is a finger that flies. */
export interface FireWords {
  burning: number;
  out: boolean;
  full: boolean;
  touch: boolean;
}
const NO_FIRE: FireWords = { burning: 0, out: false, full: false, touch: false };

/** Whether the bucket is out and empty, which is when the arrow points at the nearest water and not at the fire. */
export function needsWater(bucket: Readonly<{ out: boolean; full: boolean }>): boolean {
  return bucket.out && !bucket.full;
}

/** Whether the arrow points at the nearest water and not at the goal: a fire's step with the bucket out and empty. */
export function wantsWater(step: Step | undefined, bucket: Readonly<{ out: boolean; full: boolean }>): boolean {
  return fireOf(step) !== null && needsWater(bucket);
}

/**
 * What the bar says of a fire by the bucket, for a fire going, one guided to, and the nearest flying free with the bucket
 * out: in, press B for it ("Tap the bucket" where a finger flies, which has no key); out and empty, hover low over the
 * water to fill it; and out and full, fly over the flames to drop, and how many burn, since the drop falls from as high as
 * the window is and "low" is not asked of anyone. Shown the way to a fire (`guided`) the full bucket is only to be taken
 * there, the drop being for when it has come. One function, so every place the bar says it says the same.
 */
export function fireWords(
  bucket: Readonly<{ out: boolean; full: boolean }>,
  burning: number,
  touch: boolean,
  guided = false,
): string {
  if (!bucket.out) return touch ? 'Tap the bucket' : 'Press B for the bucket';
  if (!bucket.full) return 'Hover low over the water to fill the bucket';
  return guided ? 'Take the bucket to the fire' : `Fly over the flames to drop · ${burning} burning`;
}

/**
 * What the bar says of the step being done, by the level it is in: a ring "Fly through ring 2 of 6" (`ring` is which and
 * of how many), an opening "Fly under the bridge", a person "Hover over the walker", and a pad by its site, which a
 * rescue's landing says as the person aboard being flown to it ("Fly the walker to the home pad") and a delivery's
 * pickup and drop say as a parcel's, and a fire's by the bucket (`fireWords`). A person to be landed beside is "Land beside
 * the walker". One function, so the bar and the tests read the same words.
 */
export function stepWords(
  level: { kind: LevelKind; steps: readonly Step[] },
  step: Step,
  pads: readonly PadWords[],
  ring: { n: number; of: number },
  fire: Readonly<FireWords> = NO_FIRE,
): string {
  if (step.kind === 'ring') return `Fly through ring ${ring.n} of ${ring.of}`;
  if (step.kind === 'gate') return `Fly ${step.label}`;
  if (step.kind === 'winch') return `Hover over ${step.who}`;
  if (step.kind === 'board') return `Land beside ${step.who}`;
  if (step.kind === 'arrive' || step.kind === 'fire') return fireWords(fire, fire.burning, fire.touch);
  const site = pads[step.pad].site;
  if (step.kind === 'land') {
    const person =
      level.kind === 'rescue' ? level.steps.find((s) => s.kind === 'winch' || s.kind === 'board') : undefined;
    return person && 'who' in person ? `Fly ${person.who} to the ${site} pad` : `Land on the ${site} pad`;
  }
  return step.kind === 'pickup' ? `Pick up the parcel at the ${site} pad` : `Deliver it to the ${site} pad`;
}

/**
 * What the loader is for: a person winched, one climbing aboard, the bucket filling (its share above nothing), or a
 * parcel; the winch first, then the boarding.
 */
export function loaderKind(
  who: string | null,
  fill: number,
  boarding: string | null = null,
): 'winch' | 'board' | 'fill' | 'parcel' {
  return who !== null ? 'winch' : boarding !== null ? 'board' : fill > 0 ? 'fill' : 'parcel';
}

/**
 * What the loader says: the person being winched, if one is, then the one climbing aboard ("The walker climbs aboard"),
 * then "Filling the bucket", and otherwise a parcel loaded, or unloaded once a step other than a pickup is wanted.
 */
export function loaderWords(
  who: string | null,
  step: Step | undefined,
  filling = false,
  boarding: string | null = null,
): string {
  if (who !== null) return `Winching up ${who}`;
  if (boarding !== null) return `${boarding[0].toUpperCase()}${boarding.slice(1)} climbs aboard`;
  if (filling) return 'Filling the bucket';
  return step && step.kind !== 'pickup' ? 'Unloading the parcel' : 'Loading the parcel';
}

/** How finely the loader is drawn: its fill moves in fortieths, so it is written a few dozen times a load, and no more. */
const LOADER_STEPS = 40;

/** How far round the loader is filled, in fortieths, for a `share` of its load or hold run: −1 for none, and then it is hidden. */
export function loaderSteps(share: number): number {
  return share > 0 ? Math.round(share * LOADER_STEPS) : -1;
}

/** Where the arrow points to start a level: the pad of a pickup, or the middle of its first ring or opening. */
export function startPoint(
  level: { steps: readonly Step[] },
  pads: readonly PadWords[],
  fires: readonly { id: string; x: number; y: number }[] = [],
): { x: number; y: number } {
  const first = firstOf(level);
  // a fire's is the middle of the fire; one the game does not have is home
  const fire = fireOf(first) !== null ? fires.find((f) => f.id === fireOf(first)) : undefined;
  const at = fire ?? ('pad' in first ? pads[first.pad] : 'x' in first ? first : pads[0]);
  return { x: at.x, y: at.y };
}

/** What the bar says of the level the way is shown to: the start's level by name; a fire's is said by the bucket (`fireWords`). */
export function guideWords(level: { name: string; steps: readonly Step[] }): string {
  return `To the start · ${level.name}`;
}

/** What the bucket's button shows: grey in, an orange ring out, and the same with water in it when it is out and full. */
export function bucketBadge(out: boolean, full: boolean): 'in' | 'out' | 'full' {
  return !out ? 'in' : full ? 'full' : 'out';
}

/**
 * What the bar shows: the hint alone, flying free; the way to a start; or the level going. A level going outranks a
 * guide. Under a toast with nothing going and nothing guided it shows nothing, so the hint is not stacked over the
 * words that tell a level done; a level's words and a guide are never hidden. Flying free with the bucket out and a fire
 * to fight (`fighting`) the bar is the guide's, the way to the water or the flames, in place of the hint.
 */
export function barMode(
  going: boolean,
  guided: boolean,
  toast = false,
  fighting = false,
): 'free' | 'guided' | 'going' | 'quiet' {
  return going ? 'going' : guided ? 'guided' : toast ? 'quiet' : fighting ? 'guided' : 'free';
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
  rescue: 'Rescued!',
  fire: 'Fire out!',
};

/** The toast's words, as the test API reads them: the title by the kind of level, the time, and "New best" when it is one. */
export function toastWords(kind: LevelKind, seconds: number, best: boolean): string {
  return `${DONE[kind]} ${clock(seconds)}${best ? ' ★ New best' : ''}`;
}

/** The toast's words for a structure collected, as the test API reads them: "Collected the lakeside towers · 3 of 7". */
export function collectedWords(name: string, n: number, of: number): string {
  return `Collected ${name} · ${n} of ${of}`;
}

/** The toast's words for a package found, as the test API reads them: "Package found · 3 of 10". */
export function foundWords(n: number, of: number): string {
  return `Package found · ${n} of ${of}`;
}

/**
 * How long a ring from the radar's dot takes to grow and fade, in seconds of game time, said once: the ring's age is
 * read from the game's clock and not the page's, so a picture of it is the same every run, and a game held behind the
 * panel holds it.
 */
export const RADAR_RING = 0.9;
/** How many steps the ring is drawn in over its life, so the page writes its style at most this many times a ping. */
export const RADAR_STEPS = 6;
/** How many rings the badge has: one for every ping that can be alive at once, at the fastest the radar pings. */
export const RADAR_RINGS = Math.ceil(RADAR_RING / RADAR.fastest);
/** A ring's diameter in pixels when it is first drawn and how much more it gains by its last step, and how bright it starts, against the badge's 44. */
const RING = { start: 12, grow: 32, opacity: 0.9 };

/** What the badge is: quiet, or hearing a package, and the step its newest ring is at, 0 for none. */
export interface RadarBadge {
  state: 'quiet' | 'heard';
  step: number;
}
/** What a ring looks like at a step: its diameter in pixels and its opacity, both nothing for step 0. */
export interface RadarRing {
  step: number;
  size: number;
  opacity: number;
}

/** Every badge and ring there can be, made once, so that working one out each frame makes nothing. */
const BADGES: readonly RadarBadge[] = [
  { state: 'quiet', step: 0 },
  ...Array.from({ length: RADAR_STEPS + 1 }, (_, step): RadarBadge => ({ state: 'heard', step })),
];
const RING_LOOKS: readonly RadarRing[] = Array.from({ length: RADAR_STEPS + 1 }, (_, step) => {
  const share = (step - 0.5) / RADAR_STEPS;
  return step === 0
    ? { step, size: 0, opacity: 0 }
    : { step, size: RING.start + RING.grow * share, opacity: RING.opacity * (1 - share) };
});

/**
 * The step a ring `age` seconds old is at: 0 before it begins and once it is spent, and from 1 to `RADAR_STEPS` over its
 * life. Pure, so a page and a test read the same one.
 */
export function ringStep(age: number): number {
  if (!(age >= 0) || age >= RADAR_RING) return 0;
  return Math.min(RADAR_STEPS, Math.floor((age / RADAR_RING) * RADAR_STEPS) + 1);
}

/** A ring `age` seconds old as it is drawn: how big and how faint, from its step. */
export function radarRing(age: number): RadarRing {
  return RING_LOOKS[ringStep(age)];
}

/**
 * The badge with the nearest package `nearest` away (−1 when none is in range) and its newest ring `since` seconds old:
 * quiet and ringless with nothing heard, and otherwise heard, the ring at its step. It is the same at any distance, since
 * the badge says nothing of where; the distance only decides the ping's pace, which `finds.ts` has.
 */
export function radarBadge(nearest: number, since: number): RadarBadge {
  return nearest < 0 ? BADGES[0] : BADGES[1 + ringStep(since)];
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
 * What the card says and what waits behind it, in game time. A level's toast is shown at once; a structure's or a package's, told while
 * another shows, waits its turn and is then shown for `TOAST.seconds` of its own, counted from the moment the one before
 * it ended and not from when it was seen, so the same game shows the same toasts however often it is drawn. The waiting
 * are a ring of slots sized once, as many as there are structures to collect and packages to find, since each can be told once: past that the
 * oldest waiting is let go. A level's toast that comes while another shows takes the card, and the other
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
    this.line('Collected', name, ' · ', `${n} of ${of}`, collectedWords(name, n, of), now);
  }

  /** A package found, the `n`th of `of`, told at game time `now`: shown at once if nothing is, and otherwise in its turn. */
  found(n: number, of: number, now: number): void {
    this.line('Package found', `${n} of ${of}`, '', '', foundWords(n, of), now);
  }

  /** A toast that is not a level's: shown at once if nothing is shown, and otherwise put at the back to wait. */
  private line(title: string, left: string, sep: string, right: string, words: string, now: number): void {
    this.update(now);
    if (this.showing) {
      this.push({ title, left, sep, right, words, level: false, from: 0 }, false);
      return;
    }
    const t = this.now;
    t.title = title;
    t.left = left;
    t.sep = sep;
    t.right = right;
    t.words = words;
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

/** What the words are for when no step and no level is: the nearest fire, flying free with the bucket out. */
const FIGHTING = {};

/** The hint in the bar, flying free. */
const HINT = 'Land on a crate or fly a start';

/** What the HUD's two buttons do, which is the page's to say: open the panel, and put the bucket out or take it in. */
export interface HudActions {
  panel: () => void;
  bucket: () => void;
}

/** The bucket's icon: a pail with its handle, and the water in it, which shows only while the button says it is full. */
const BUCKET_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pail" d="M5 8h14l-1.6 11.2a1.8 1.8 0 0 1-1.8 1.5H8.4a1.8 1.8 0 0 1-1.8-1.5z" /><path class="water" d="M6.2 13h11.6l-0.9 6a1.2 1.2 0 0 1-1.2 1H8.3a1.2 1.2 0 0 1-1.2-1z" /><path class="handle" d="M5 8c0-3 3.1-5 7-5s7 2 7 5" /></svg>`;

/** What the bucket's button says to a screen reader, by its state: the word is the button's name and `aria-pressed` says whether it is out. */
const BUCKET_LABEL = { in: 'Bucket, in', out: 'Bucket, out, empty', full: 'Bucket, out, full' };

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
    loaderKind: '',
    toast: -1,
    radar: '' as RadarBadge['state'] | '',
    step: -1,
    bucket: '' as 'in' | 'out' | 'full' | '',
  };
  /**
   * The radar's rings, one element each: the game time each was begun at (−infinity for none), the step each is drawn at
   * (−1 for not yet written), and which is begun next. Sized once.
   */
  private readonly radar: HTMLElement;
  private readonly bucket: HTMLButtonElement;
  private readonly rings: HTMLElement[] = [];
  private readonly pinged = new Float64Array(RADAR_RINGS).fill(-Infinity);
  private readonly ringStepShown = new Int8Array(RADAR_RINGS).fill(-1);
  private nextRing = 0;
  private lastPing = -Infinity;
  /** The level the way is shown to, and the point it starts at, worked out once when it changes and not every frame. */
  private guide: Level | null = null;
  private guideAt = { x: 0, y: 0 };
  private guideWords = '';
  /** What the words were made for, the key of what they were made from (the burning there are, the bucket, touch), and the words: made when either changes and not every frame. */
  private wordsFor: object | null = null;
  private wordsKey = -1;
  private words = '';
  /** What a fire's words are made from, written in place each frame the bar shows them so that nothing is made. */
  private readonly fireNow: FireWords = { burning: 0, out: false, full: false, touch: false };
  /** The burning patch the arrow points at, for a fire guided to or flown to free, written in place. */
  private readonly burningAt = { x: 0, y: 0, z: 0 };
  /** The toast shown, and those waiting behind it. */
  private readonly toasts: ToastQueue;
  /** Whether the panel is up over it: it is hidden, and its keys are the panel's. */
  private away = false;

  /** `toasts` is how many structures there are to collect and packages to find together, which is the most that can wait behind a toast. */
  constructor(actions: HudActions, toasts: number) {
    this.toasts = new ToastQueue(toasts);
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <button type="button" class="to-levels" aria-label="Levels" title="Levels (Esc)"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="7" height="7" rx="2" /><rect x="11" y="2" width="7" height="7" rx="2" /><rect x="2" y="11" width="7" height="7" rx="2" /><rect x="11" y="11" width="7" height="7" rx="2" /></svg></button>
      <div class="radar" data-state="quiet" role="img" aria-label="Package radar: nothing heard">${'<span class="ring"></span>'.repeat(RADAR_RINGS)}<span class="dot"></span></div>
      <button type="button" class="bucket" data-state="in" aria-pressed="false" aria-label="${BUCKET_LABEL.in}" title="Bucket (B)">${BUCKET_ICON}<span class="key" aria-hidden="true">B</span></button>
      <div class="top">
        <div class="bar" data-mode="free"><span class="hint"></span><svg class="arrow" viewBox="-13 -13 26 26" aria-hidden="true"><path d="M0,-11 L8,7 L0,3 L-8,7 Z" /></svg><span class="goal"></span><span class="far"></span><span class="clock"></span></div>
        <div class="loader" hidden><svg viewBox="-15 -15 30 30" aria-hidden="true"><circle class="track" r="11" /><circle class="fill" r="11" transform="rotate(-90)" /></svg><span class="what"></span></div>
        <div class="toast" hidden><h2></h2><div class="t"><span class="time"></span><span class="sep"></span><span class="b"></span></div></div>
      </div>`;
    document.body.append(this.root);
    const find = <T extends Element>(selector: string) => this.root.querySelector(selector) as T;
    this.radar = find<HTMLElement>('.radar');
    this.bucket = find<HTMLButtonElement>('.bucket');
    this.rings.push(...Array.from(this.radar.querySelectorAll<HTMLElement>('.ring')));
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
    this.bucket.addEventListener('click', () => {
      actions.bucket();
      // a button left focused would be clicked again by the Space that lifts the helicopter
      this.bucket.blur();
    });
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

  /** What the badge shows as it was last drawn: whether it hears a package, and the step its newest ring is at. */
  get radarShown(): { badge: RadarBadge['state']; step: number } {
    return { badge: this.shown.radar || 'quiet', step: Math.max(0, this.shown.step) };
  }

  /** What the bucket's button shows as it was last drawn: grey in, an orange ring out, and with water in it when it is full. */
  get badge(): 'in' | 'out' | 'full' {
    return this.shown.bucket || 'in';
  }

  /** Whether the helicopter is being flown by touch, which has no key: the words say "Tap the bucket". Set by the page each frame. */
  touch = false;

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
    this.drawRadar(game);
    this.drawBucket(game);
    const step = d.current;
    const burning = game.nearestFire();
    const fighting = game.bucket.out && burning !== null;
    const mode = barMode(step !== undefined, game.guided !== null, on, fighting);
    if (mode !== s.mode) {
      this.bar.dataset.mode = s.mode = mode;
      // the words for the new mode are written afresh below
      s.goal = '';
      s.far = -1;
      s.clock = -1;
      s.turn = NaN;
    }
    // the loader fills while the parcel of a level going is loaded or unloaded, while a start's crate is loaded, while a
    // person is winched up (by the winch's share of its hold) or climbs aboard (by the boarding's), or while the bucket is
    // filling, in blue; each by its own share and not a parcel's of its load
    const winch = game.winch;
    const board = game.board;
    const loading = step ? d.loading : game.starts.loading;
    const fill = game.tank.filling / SCOOP.time;
    const who = winch.spot !== null ? winch.who : null;
    const boarding = board.spot !== null ? board.who : null;
    const kind = loaderKind(who, fill, boarding);
    const share =
      kind === 'winch'
        ? winch.share
        : kind === 'board'
          ? board.share
          : kind === 'fill'
            ? fill
            : loading / DELIVERY.load;
    const loader = loaderSteps(share);
    const loadWords = loaderWords(who, step, kind === 'fill', boarding);
    if (kind !== s.loaderKind) this.loader.dataset.kind = s.loaderKind = kind;
    if (loader !== s.loader) {
      this.loader.hidden = loader < 0;
      if (loader >= 0) {
        const circle = 2 * Math.PI * 11;
        this.fill.style.strokeDasharray = `${(circle * loader) / LOADER_STEPS} ${circle}`;
      }
      s.loader = loader;
    }
    if (loadWords !== s.loaderWords) this.loaderWords.textContent = s.loaderWords = loadWords;
    if (mode === 'free' || mode === 'quiet') return;

    const h = game.helicopter;
    const bucket = game.bucket;
    let to: { x: number; y: number };
    // what the words are made for: the step going, the level guided to, or the fire flown to with the bucket out
    let subject: object;
    // a fire's words are by the bucket and the burning there are, and made again when any of them changes
    const fire = this.fireNow;
    fire.out = bucket.out;
    fire.full = bucket.full;
    fire.touch = this.touch;
    fire.burning = 0;
    if (step) {
      subject = step;
      const fireId = fireOf(step);
      if (fireId !== null) fire.burning = game.fire(fireId).burning;
      // a fire's arrow is to the nearest water with the bucket out and empty, and to the nearest patch burning otherwise
      to = wantsWater(step, bucket) ? game.nearestWater() : d.goal!;
    } else if (game.guided) {
      subject = game.guided;
      // shown the way: the point is worked out once for the level, since the game does not change it
      if (game.guided !== this.guide) {
        this.guide = game.guided;
        this.guideAt = startPoint(
          game.guided,
          game.island.pads,
          game.fires.map((f) => f.place),
        );
        this.guideWords = guideWords(game.guided);
      }
      to = this.guideAt;
      // to a fire it is the bucket's words and the way to its water or its flames, as for a level going
      const fireId = fireOf(game.guided.steps[0]);
      if (fireId !== null) {
        const guided = game.fire(fireId);
        fire.burning = guided.burning;
        to = needsWater(bucket)
          ? game.nearestWater()
          : guided.nearestBurning(h.x, h.y, this.burningAt)
            ? this.burningAt
            : to;
      }
    } else {
      // flying free with the bucket out: the nearest fire, which `fighting` says there is
      subject = FIGHTING;
      const nearest = burning!;
      fire.burning = nearest.burning;
      to = needsWater(bucket)
        ? game.nearestWater()
        : nearest.nearestBurning(h.x, h.y, this.burningAt)
          ? this.burningAt
          : h;
    }
    // the words are made when the subject changes, or a fire's count or the bucket does, and not on every frame
    const key = ((fire.burning * 2 + (fire.out ? 1 : 0)) * 2 + (fire.full ? 1 : 0)) * 2 + (fire.touch ? 1 : 0);
    if (subject !== this.wordsFor || key !== this.wordsKey) {
      this.wordsFor = subject;
      this.wordsKey = key;
      this.words = step
        ? stepWords(d.level!, step, game.island.pads, { n: d.ringNumber, of: d.ringCount }, fire)
        : game.guided
          ? fireOf(game.guided.steps[0]) !== null
            ? fireWords(fire, fire.burning, fire.touch, true)
            : this.guideWords
          : fireWords(fire, fire.burning, fire.touch);
    }
    const words = this.words;
    if (step) {
      const time = Math.floor(d.time);
      if (time !== s.clock) this.clock.textContent = clock((s.clock = time));
    }
    const far = Math.round(Math.hypot(to.x - h.x, to.y - h.y));
    const turn = pointer(camera, h, to);
    if (words !== s.goal) this.goal.textContent = s.goal = words;
    if (far !== s.far) this.far.textContent = `${(s.far = far)} m`;
    if (turn !== s.turn) this.arrow.style.transform = `rotate(${(s.turn = turn)}deg)`;
  }

  /**
   * The radar badge: grey and ringless with nothing heard, gold with a ring out from the dot for each ping that is still
   * going. A ring's age is the game's time since its ping, so the same game draws the same badge; an element is written
   * only when its step changes, which is at most `RADAR_STEPS` times a ping, and nothing is made.
   */
  private drawRadar(game: Game): void {
    const s = this.shown;
    const now = game.t;
    const badge = radarBadge(game.finds.nearest, now - this.lastPing);
    if (badge.state !== s.radar) {
      this.radar.dataset.state = s.radar = badge.state;
      this.radar.setAttribute(
        'aria-label',
        badge.state === 'quiet' ? 'Package radar: nothing heard' : 'Package radar: a package is near',
      );
      // a ring written for the other state is written again
      this.ringStepShown.fill(-1);
    }
    for (let k = 0; k < RADAR_RINGS; k++) {
      const step = badge.state === 'quiet' ? 0 : ringStep(now - this.pinged[k]);
      if (step === this.ringStepShown[k]) continue;
      this.ringStepShown[k] = step;
      const look = RING_LOOKS[step];
      const style = this.rings[k].style;
      style.width = style.height = `${look.size}px`;
      style.opacity = String(look.opacity);
    }
    s.step = badge.step;
  }

  /**
   * The bucket's button: grey in, an orange ring out, and with water in it blue when it is out and full, and for a screen
   * reader its name by state and whether it is pressed. Written only when it changes.
   */
  private drawBucket(game: Game): void {
    const bucket = game.bucket;
    const badge = bucketBadge(bucket.out, bucket.full);
    if (badge === this.shown.bucket) return;
    this.shown.bucket = badge;
    this.bucket.dataset.state = badge;
    this.bucket.setAttribute('aria-pressed', String(bucket.out));
    this.bucket.setAttribute('aria-label', BUCKET_LABEL[badge]);
  }

  /** A ping from the radar, as the game tells it, at game time `now`: a ring begins at the dot. */
  ping(now: number): void {
    this.pinged[this.nextRing] = this.lastPing = now;
    this.nextRing = (this.nextRing + 1) % RADAR_RINGS;
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

  /** A package found, as the game tells it, at game time `now`: its toast, now or in its turn after the one shown. */
  found(n: number, of: number, now: number): void {
    this.toasts.found(n, of, now);
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
      loaderKind: '',
      toast: -1,
      radar: '',
      step: -1,
      bucket: '',
    };
    // the rings of the last place are not carried to the new one
    this.pinged.fill(-Infinity);
    this.lastPing = -Infinity;
    this.ringStepShown.fill(-1);
    this.loader.hidden = true;
  }
}
