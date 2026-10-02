/**
 * The panel, over the island dimmed: a row for each level with its name, the best time on it and where it starts, and
 * on each row its own button, "Show the way", which points the HUD's arrow at the start, or "Abandon" on the row of the
 * level going. Esc or the HUD's corner button brings it up mid-flight and Esc or its cross puts it away; the game is
 * held behind it. It is built once, from the levels and the pads, and written only when it is shown. It asks the page
 * to show the way, to abandon or to close. Without it a player would have nowhere to find what there is to fly, nor a
 * way to give a level up.
 */
import type { LevelRow } from './debug';
import { clock, startWords, type PadWords } from './hud';
import type { Step } from './mission';

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

export class Panel {
  private readonly root: HTMLElement;
  private readonly rows: HTMLElement[] = [];
  private readonly sub: HTMLElement;
  private readonly close: HTMLButtonElement;
  /** The levels by their names, in the order of the rows, so a button says which it is for. */
  private readonly ids: string[];
  private open = false;
  /** The level going, as the panel was last shown it, so a button says which it does. */
  private going: string | null = null;

  constructor(
    levels: readonly { id: string; name: string; steps: readonly Step[] }[],
    pads: readonly PadWords[],
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
      </div>`;
    document.body.append(this.root);
    const list = this.root.querySelector('.rows')!;
    levels.forEach((level, k) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="name"><span class="label"></span><span class="best" hidden></span><span class="now" hidden>· going</span></div><div class="where"></div><button type="button"></button>`;
      row.querySelector('.label')!.textContent = level.name;
      row.querySelector('.where')!.textContent = startWords(level, pads);
      row.querySelector('button')!.addEventListener('click', () => this.press(k));
      list.append(row);
      this.rows.push(row);
    });
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
   * in place of the one that shows the way. The first row's button has the focus, so Tab and Enter work.
   */
  show(rows: readonly LevelRow[], going: string | null): void {
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
