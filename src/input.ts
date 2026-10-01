/**
 * The keyboard: W S to fly, A D to turn, Space and Shift for up and down,
 * with the arrows doing what W A S D do. It turns keys into the helicopter's
 * `Controls` and nothing more, so the game never sees a key. Something other
 * than a person, a test say, can hold the controls instead; without that the
 * browser tests could only fly by pressing keys on a clock they do not keep.
 */
import type { Controls } from './helicopter';

export class Input {
  private down = new Set<string>();
  /** Controls held by something other than a person: read before the keyboard while it is set. */
  override: Controls | null = null;

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.down.add(k);
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
    const forward = (this.is('w', 'arrowup') ? 1 : 0) - (this.is('s', 'arrowdown') ? 1 : 0);
    const turn = (this.is('a', 'arrowleft') ? 1 : 0) - (this.is('d', 'arrowright') ? 1 : 0);
    const lift = (this.is(' ') ? 1 : 0) - (this.is('shift') ? 1 : 0);
    return { forward, turn, lift };
  }
}
