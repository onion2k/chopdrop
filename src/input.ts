/**
 * The player's hands: the keyboard (W S to fly, A D to turn, Space and Shift
 * for up and down, with the arrows doing what W A S D do) and touch, the
 * stick and the lever in `touch.ts`, whichever was used last. It turns them
 * into the helicopter's `Controls` and nothing more, so the game never sees
 * a key or a finger. Something other than a person, a test say, can hold the
 * controls instead; without that the browser tests could only fly by
 * pressing keys on a clock they do not keep.
 */
import type { Controls } from './helicopter';
import { TouchControls } from './touch';

export class Input {
  private down = new Set<string>();
  /** Controls held by something other than a person: read before the keyboard and touch while it is set. */
  override: Controls | null = null;
  /** How it is being flown: by the keys or by touch, whichever was used last. A key pressed switches to the keys. */
  by: 'keys' | 'touch' = 'keys';
  /** The stick and the lever, which the page feeds fingers to and draws. */
  readonly touch = new TouchControls();
  private readonly touched: Controls = { forward: 0, turn: 0, lift: 0 };

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.down.add(k);
      this.by = 'keys';
      // the page must not scroll, nor a held key click a button, under a player flying
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.key.toLowerCase()));
    // a key let go of in another window never sends its keyup, and would stay held
    addEventListener('blur', () => this.down.clear());
  }

  private is(...keys: string[]) {
    return keys.some((k) => this.down.has(k));
  }

  read(): Controls {
    if (this.override) return this.override;
    if (this.by === 'touch') return this.touch.read(this.touched);
    const forward = (this.is('w', 'arrowup') ? 1 : 0) - (this.is('s', 'arrowdown') ? 1 : 0);
    const turn = (this.is('a', 'arrowleft') ? 1 : 0) - (this.is('d', 'arrowright') ? 1 : 0);
    const lift = (this.is(' ') ? 1 : 0) - (this.is('shift') ? 1 : 0);
    return { forward, turn, lift };
  }
}
