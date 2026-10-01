/**
 * What the player has done, and where it is kept: the best time on each
 * level, by the level's name, in the browser's storage or, for the game run
 * without a page, in memory. Which levels are open is worked out from it and
 * never kept, so a level slotted into the list later opens by the same rule
 * as the rest, and a player's times stay with the levels they were flown on.
 *
 * A save is read as if anyone had written it. One that cannot be read at all
 * is refused, with the reason, and play starts fresh; it is written over only
 * once there is a time to keep. A time that is not a time, or a name that is
 * not a level's, is dropped, and the rest kept. A level the game does not
 * list is kept too, as a later game's save would have one. Without it a
 * player would start from the first level on every visit.
 */

/** The key the save is kept under in the browser: given out with the first save, so kept. */
export const KEY = 'chopdrop-save-v1';

export const SAVE = {
  /**
   * The most times a save may bring with it: room for every level there will be, and many more, so a save that has
   * been tampered with to hold thousands is cut short and not carried round in every game.
   */
  kept: 64,
};

/** What a level's name may be: words in small letters and figures, joined by hyphens, as `first-delivery`. */
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Where a level stands for the player: not yet to be flown, to be flown, or flown to the end at least once. */
export type Standing = 'locked' | 'open' | 'done';

/** The save as it is written: the best time on each level, in seconds, by its name. */
export interface SaveShape {
  best: Record<string, number>;
}

/** Where the save is kept. */
export interface SaveStore {
  load(): string | null;
  store(json: string): void;
}

/** The browser's storage, and nothing at all where there is none, or it will not be written. */
export function browserStore(key = KEY): SaveStore {
  return {
    load() {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    store(json) {
      try {
        localStorage.setItem(key, json);
      } catch {
        // a browser that will not keep it plays on, and keeps nothing
      }
    },
  };
}

/** A save kept in memory, starting from `json` if given: for the game run without a page. */
export function memoryStore(json: string | null = null): SaveStore & { json: string | null } {
  return {
    json,
    load() {
      return this.json;
    },
    store(next) {
      this.json = next;
    },
  };
}

/** Whether `seconds` is a time a level could be done in. */
function isTime(seconds: unknown): seconds is number {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
}

export class Progress {
  /** The best time on each level, in seconds, by its name. */
  readonly best = new Map<string, number>();
  /** Why the save in the store could not be read, if it could not; null if it was read, or there was none. */
  readonly refused: string | null = null;

  /** Loaded from the store; loading alone never writes. */
  constructor(private readonly saves: SaveStore = memoryStore()) {
    const json = saves.load();
    if (json !== null) this.refused = this.read(json);
  }

  /** Where the level at `index` in `ids` stands: done if it has a time, open if it is first or the one before is done. */
  standing(ids: readonly string[], index: number): Standing {
    if (this.best.has(ids[index])) return 'done';
    return index === 0 || this.best.has(ids[index - 1]) ? 'open' : 'locked';
  }

  /** The level to offer first, by its place in `ids`: the first open and not done, or the first if every one is done. */
  pick(ids: readonly string[]): number {
    for (let k = 0; k < ids.length; k++) if (this.standing(ids, k) === 'open') return k;
    return 0;
  }

  /** The level `id` done in `seconds`, kept if it is the best time on it yet; whether it was. */
  record(id: string, seconds: number): boolean {
    if (!NAME.test(id)) throw new Error(`"${id}" is not a level's name`);
    if (!isTime(seconds)) throw new Error(`${String(seconds)} is not a time`);
    const was = this.best.get(id);
    if (was !== undefined && was <= seconds) return false;
    this.best.set(id, seconds);
    return true;
  }

  /** The save as it is written. */
  toJSON(): SaveShape {
    return { best: Object.fromEntries(this.best) };
  }

  /** The save written to its store. */
  persist(): void {
    this.saves.store(JSON.stringify(this.toJSON()));
  }

  /** The save in `json` taken in, what can be read of it; why it could not be read at all, or null. */
  private read(json: string): string | null {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return 'it is not JSON';
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'it is not a table';
    const best = (raw as Record<string, unknown>).best;
    // a save from before there were times, the template's own, has none, and is a fresh start and not a broken save
    if (best === undefined) return null;
    if (typeof best !== 'object' || best === null || Array.isArray(best)) return 'its best times are not a table';
    // read as its own entries, so a name like `__proto__` is a name like any other, and is not a level's
    for (const [id, seconds] of Object.entries(best)) {
      if (this.best.size >= SAVE.kept) break;
      if (NAME.test(id) && isTime(seconds)) this.best.set(id, seconds);
    }
    return null;
  }
}
