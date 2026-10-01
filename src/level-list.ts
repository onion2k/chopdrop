/**
 * The list of levels, over the island dimmed: each level a tile, locked, open
 * or done, with the best time on it, one of them picked and a button to fly
 * it. The game opens on it, the card at the end of a level goes back to it,
 * and Esc or the HUD's corner button brings it up mid-flight, when it can be
 * closed again to carry on. It is built once, from the levels, and written
 * only when it is shown. It asks the page to fly a level or to close it; what
 * is open is the game's to say. Without it a player could fly only the first
 * level.
 */
import type { ListedLevel } from './game';
import { clock } from './hud';
import type { LevelKind } from './mission';

/** What the list's buttons do, which is the page's to say: fly a level, by its name, or close the list and carry on. */
export interface ListActions {
  fly: (id: string) => void;
  close: () => void;
}

/** What each kind of level is called on its tile, and the small picture beside it. */
const KINDS: Record<LevelKind, { label: string; icon: string }> = {
  delivery: {
    label: 'Delivery',
    icon: '<path d="M3 6 L10 3 L17 6 L17 14 L10 17 L3 14 Z M3 6 L10 9 L17 6 M10 9 L10 17" />',
  },
};

const LOCK = '<path d="M6 9 V6.5 a4 4 0 0 1 8 0 V9" /><rect x="4" y="9" width="12" height="9" rx="2" />';

export class LevelList {
  private readonly root: HTMLElement;
  private readonly tiles: HTMLButtonElement[] = [];
  private readonly go: HTMLButtonElement;
  private readonly sub: HTMLElement;
  private readonly close: HTMLButtonElement;
  /** The levels as the list was last shown them, and the one picked, by its place in the list. */
  private rows: readonly ListedLevel[] = [];
  private picked = 0;
  private open = false;

  constructor(
    levels: readonly { id: string; name: string; kind: LevelKind }[],
    private readonly actions: ListActions,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'levels';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="sheet" role="dialog" aria-label="Levels">
        <button type="button" class="close" aria-label="Back to the flight" title="Back to the flight (Esc)">✕</button>
        <h1>Chop<b>drop</b></h1>
        <div class="sub"></div>
        <div class="grid"></div>
        <button type="button" class="go"></button>
      </div>`;
    document.body.append(this.root);
    const grid = this.root.querySelector('.grid')!;
    levels.forEach(({ name, kind }, k) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'lv';
      tile.innerHTML = `<span class="n">${k + 1}<svg class="lock" viewBox="0 0 20 20" aria-hidden="true">${LOCK}</svg></span><span class="best" hidden></span><span class="name"></span><span class="kind"><svg viewBox="0 0 20 20" aria-hidden="true">${KINDS[kind].icon}</svg>${KINDS[kind].label}</span>`;
      tile.querySelector('.name')!.textContent = name;
      tile.addEventListener('click', () => this.pick(k));
      grid.append(tile);
      this.tiles.push(tile);
    });
    this.go = this.root.querySelector('.go')!;
    this.sub = this.root.querySelector('.sub')!;
    this.close = this.root.querySelector('.close')!;
    this.go.addEventListener('click', () => this.fly());
    this.close.addEventListener('click', () => actions.close());
    addEventListener('keydown', (e) => {
      // a key the HUD has already acted on is its own
      if (e.defaultPrevented || !this.open) return;
      const was = e.key;
      if (was === 'Enter') this.fly();
      else if (was === 'Escape') {
        if (!this.close.hidden) actions.close();
      } else if (was === 'ArrowRight' || was === 'ArrowDown') this.move(1);
      else if (was === 'ArrowLeft' || was === 'ArrowUp') this.move(-1);
      else return;
      e.preventDefault();
    });
  }

  /** Whether it is up: the game is held behind it. */
  get shown(): boolean {
    return this.open;
  }

  /**
   * Up over the island, with the levels as `rows` say, `picked` picked, and a way back to the flight if `resumable`,
   * which there is only while a level is being flown and not done.
   */
  show(rows: readonly ListedLevel[], picked: number, resumable: boolean): void {
    this.rows = rows;
    rows.forEach((row, k) => {
      const tile = this.tiles[k];
      tile.classList.remove('locked', 'open', 'done');
      tile.classList.add(row.standing);
      tile.disabled = row.standing === 'locked';
      const best = tile.querySelector<HTMLElement>('.best')!;
      best.hidden = row.best === null;
      best.textContent = row.best === null ? '' : clock(row.best);
    });
    const done = rows.filter((row) => row.standing === 'done').length;
    this.sub.textContent =
      done === rows.length
        ? `All ${rows.length} done · fly any again`
        : `${done} of ${rows.length} done · pick a level`;
    this.close.hidden = !resumable;
    this.pick(picked);
    this.root.hidden = false;
    this.open = true;
    this.go.focus({ preventScroll: true });
  }

  /** Put away. */
  hide(): void {
    this.root.hidden = true;
    this.open = false;
  }

  /** The level at `k` picked, unless it is locked. */
  private pick(k: number): void {
    if (this.rows[k].standing === 'locked') return;
    this.picked = k;
    this.tiles.forEach((tile, n) => {
      tile.classList.toggle('picked', n === k);
      tile.setAttribute('aria-pressed', String(n === k));
    });
    this.go.textContent = `Fly level ${k + 1} · ${this.rows[k].name}`;
  }

  /** The next level that is not locked, in `way` along the list, picked; past either end, the pick stays. */
  private move(way: number): void {
    for (let k = this.picked + way; k >= 0 && k < this.rows.length; k += way)
      if (this.rows[k].standing !== 'locked') {
        this.pick(k);
        return;
      }
  }

  private fly(): void {
    this.actions.fly(this.rows[this.picked].id);
  }
}
