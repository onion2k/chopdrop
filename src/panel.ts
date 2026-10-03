/**
 * The panel, over the island dimmed: a row for each level with its name, the best time on it and where it starts, and
 * on each row its own button, "Show the way", which points the HUD's arrow at the start, or "Abandon" on the row of the
 * level going. Esc or the HUD's corner button brings it up mid-flight and Esc or its cross puts it away; the game is
 * held behind it. Under the levels is a list of the structures, each ticked once it is collected, with how many of them,
 * and under that the hidden packages: how many are found, and a dot for each, filled gold as it is.
 * It is built once, from the levels, the pads, the structures and the packages, and written only when it is shown. It asks the page
 * to show the way, to abandon or to close. Without it a player would have nowhere to find what there is to fly, nor a
 * way to give a level up.
 */
import type { LevelRow } from './debug';
import { clock, startWords, type PadWords } from './hud';
import type { LevelKind, Step } from './mission';

/** What the panel's buttons do, which is the page's to say: show the way to a level, by its name; abandon; or close the panel and carry on. */
export interface PanelActions {
  guide: (id: string) => void;
  abandon: () => void;
  close: () => void;
}

/** The subtitle: how many levels are done, and the two ways a level is found. */
export function panelSubtitle(rows: readonly { best: number | null }[]): string {
  const done = rows.filter((row) => row.best !== null).length;
  return `${done} of ${rows.length} done · land on a crate or fly a start, anywhere`;
}

/**
 * The label a kind of level wears on its row, or null for one that wears none: only a rescue does, "Rescue", since its
 * name ("Wood rescue") says where and not what, and its start is a person and not a pad.
 */
export function kindLabel(kind: LevelKind): string | null {
  return kind === 'rescue' ? 'Rescue' : null;
}

/** The rescue label's icon, a figure with one arm up, drawn as the HUD's button is: strokes and fills in the text's own colour. */
const RESCUE_ICON =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="5" r="2.2" /><path d="M9 8.2v5.3M9 13.5l-2.6 4.5M9 13.5l2.6 4.5M9 10.2L5.8 12.6M9 10.2l3.4-5.4" /></svg>';

/** The structures section as words: its heading, how many are collected, and each by name without "the" with whether it is. */
export interface StructureRows {
  heading: string;
  count: string;
  items: { name: string; got: boolean }[];
}

/**
 * What the structures section says: each of `all`, in the game's order, by its name without the "the" it is spoken with,
 * got if its id is in `collected`; and the count of those the game has, so a name a later game's save brought is not one.
 */
export function structureRows(
  all: readonly { id: string; name: string }[],
  collected: readonly string[],
): StructureRows {
  const items = all.map(({ id, name }) => ({ name: name.replace(/^the /, ''), got: collected.includes(id) }));
  return { heading: 'Structures', count: `${items.filter((i) => i.got).length} of ${items.length}`, items };
}

/** The packages line as words: its heading, how many are found, the line whole, and a dot for each, true once found. */
export interface PackageRows {
  heading: string;
  count: string;
  line: string;
  dots: boolean[];
}

/**
 * What the packages line says: a dot for each of `all`, in the game's order, true if its id is in `found`; and the count
 * of those the game has, so a name a later game's save brought, or one named twice, is not one.
 */
export function packageRows(all: readonly { id: string }[], found: readonly string[]): PackageRows {
  const dots = all.map(({ id }) => found.includes(id));
  const count = `${dots.filter(Boolean).length} of ${dots.length}`;
  return { heading: 'Packages', count, line: `Packages · ${count}`, dots };
}

export class Panel {
  private readonly root: HTMLElement;
  private readonly rows: HTMLElement[] = [];
  private readonly sub: HTMLElement;
  private readonly structureCount: HTMLElement;
  private readonly structureItems: HTMLElement[] = [];
  private readonly packs: HTMLElement;
  private readonly packCount: HTMLElement;
  private readonly packDots: HTMLElement[] = [];
  private readonly close: HTMLButtonElement;
  /** The levels by their names, in the order of the rows, so a button says which it is for. */
  private readonly ids: string[];
  private open = false;
  /** The level going, as the panel was last shown it, so a button says which it does. */
  private going: string | null = null;

  constructor(
    levels: readonly { id: string; name: string; kind: LevelKind; steps: readonly Step[] }[],
    pads: readonly PadWords[],
    private readonly structures: readonly { id: string; name: string }[],
    private readonly packages: readonly { id: string }[],
    private readonly actions: PanelActions,
  ) {
    this.ids = levels.map((level) => level.id);
    this.root = document.createElement('div');
    this.root.id = 'panel';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="sheet" role="dialog" aria-label="Levels">
        <button type="button" class="close" aria-label="Back to the flight" title="Back to the flight (Esc)">✕</button>
        <h1>Chop<b>drop</b></h1>
        <div class="sub"></div>
        <div class="rows"></div>
        <div class="structures"><h3>Structures<span class="n"></span></h3><div class="list"></div></div>
        <div class="packs"><h3>Packages<span class="n"></span></h3><div class="dots"></div></div>
      </div>`;
    document.body.append(this.root);
    const list = this.root.querySelector('.rows')!;
    levels.forEach((level, k) => {
      const row = document.createElement('div');
      row.className = 'row';
      const kind = kindLabel(level.kind);
      if (kind) row.classList.add(level.kind);
      row.innerHTML = `<div class="name"><span class="label"></span>${kind ? `<span class="kind">${RESCUE_ICON}${kind}</span>` : ''}<span class="best" hidden></span><span class="now" hidden>· going</span></div><div class="where"></div><button type="button"></button>`;
      row.querySelector('.label')!.textContent = level.name;
      row.querySelector('.where')!.textContent = startWords(level, pads);
      row.querySelector('button')!.addEventListener('click', () => this.press(k));
      list.append(row);
      this.rows.push(row);
    });
    const things = this.root.querySelector('.structures .list')!;
    for (const { name } of structureRows(structures, []).items) {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `<span class="mark"></span><span class="what"></span>`;
      item.querySelector('.what')!.textContent = name;
      things.append(item);
      this.structureItems.push(item);
    }
    const dots = this.root.querySelector('.packs .dots')!;
    for (let k = 0; k < packages.length; k++) {
      const dot = document.createElement('span');
      dot.className = 'd';
      dots.append(dot);
      this.packDots.push(dot);
    }
    this.packs = this.root.querySelector('.packs')!;
    this.packCount = this.root.querySelector('.packs .n')!;
    this.structureCount = this.root.querySelector('.structures .n')!;
    this.sub = this.root.querySelector('.sub')!;
    this.close = this.root.querySelector('.close')!;
    this.close.addEventListener('click', () => actions.close());
    addEventListener('keydown', (e) => {
      // a key the HUD has already acted on is its own
      if (e.defaultPrevented || !this.open) return;
      if (e.key !== 'Escape') return;
      e.preventDefault();
      actions.close();
    });
  }

  /** Whether it is up: the game is held behind it. */
  get shown(): boolean {
    return this.open;
  }

  /**
   * Up over the island, with each level as `rows` say, and the one named `going` marked, with a button to abandon it
   * in place of the one that shows the way; the structures ticked that `collected` names; and the packages' dots filled
   * for those `found` names, written afresh each time. The first row's button has
   * the focus, so Tab and Enter work.
   */
  show(
    rows: readonly LevelRow[],
    going: string | null,
    collected: readonly string[] = [],
    found: readonly string[] = [],
  ): void {
    rows.forEach((row, k) => {
      const el = this.rows[k];
      const best = el.querySelector<HTMLElement>('.best')!;
      best.hidden = row.best === null;
      best.textContent = row.best === null ? '' : clock(row.best);
      const now = row.id === going;
      el.classList.toggle('going', now);
      el.querySelector<HTMLElement>('.now')!.hidden = !now;
      el.querySelector('button')!.textContent = now ? 'Abandon' : 'Show the way';
    });
    this.sub.textContent = panelSubtitle(rows);
    const words = structureRows(this.structures, collected);
    this.structureCount.textContent = words.count;
    words.items.forEach(({ got }, k) => {
      const item = this.structureItems[k];
      item.classList.toggle('got', got);
      item.querySelector('.mark')!.textContent = got ? '✓' : '';
    });
    const packs = packageRows(this.packages, found);
    this.packCount.textContent = packs.count;
    this.packs.setAttribute('aria-label', packs.line);
    packs.dots.forEach((got, k) => this.packDots[k].classList.toggle('got', got));
    this.going = going;
    this.root.hidden = false;
    this.open = true;
    this.rows[0].querySelector('button')!.focus({ preventScroll: true });
  }

  /** Put away. */
  hide(): void {
    this.root.hidden = true;
    this.open = false;
  }

  /** The button on row `k` pressed: abandon, if the level on it is going, and otherwise show the way to it. */
  private press(k: number): void {
    const id = this.ids[k];
    if (id === this.going) this.actions.abandon();
    else this.actions.guide(id);
  }
}
