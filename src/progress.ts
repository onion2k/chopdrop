/**
 * What the player has done, and where it is kept: the bank, in the
 * browser's storage or, for the game run without a page, anywhere. Old
 * saves must still load: a field a save does not have takes its default,
 * and a field it has that the game no longer knows is left alone.
 */
export interface Save {
  bank: number;
  banked: number;
}

/** Where the save is kept. */
export interface SaveStore {
  load(): string | null;
  store(json: string): void;
  clear(): void;
}

export const KEY = 'chopdrop-save-v1';

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
        /* fine */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        /* nothing to remove */
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
    clear() {
      this.json = null;
    },
  };
}

const fresh = (): Save => ({ bank: 0, banked: 0 });

/** A number from a save, or the default where it is missing or not a number. */
function number(from: Record<string, unknown>, key: string, or: number): number {
  const v = from[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : or;
}

export class Progress {
  readonly save: Save;

  /** Loaded from the store; loading alone never writes. */
  constructor(private readonly saves: SaveStore = browserStore()) {
    this.save = fresh();
    const json = saves.load();
    if (json === null) return;
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return;
    }
    if (typeof raw !== 'object' || raw === null) return;
    const from = raw as Record<string, unknown>;
    const d = fresh();
    this.save.bank = number(from, 'bank', d.bank);
    this.save.banked = number(from, 'banked', d.banked);
  }

  get bank() {
    return this.save.bank;
  }

  deposit(value: number) {
    this.save.bank += value;
    this.save.banked += value;
  }

  persist() {
    this.saves.store(JSON.stringify(this.save));
  }

  /** Start over: the save wiped, in memory and in the store. */
  reset() {
    Object.assign(this.save, fresh());
    this.saves.clear();
  }
}
