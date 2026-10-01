/** The keyboard: WASD or the arrows to drive. Something other than a person, a test say, can hold the controls instead. */
import type { Drive } from './sled';

export class Input {
  private down = new Set<string>();
  /** Driving held by something other than a person: read before anything else while it is set. */
  override: Drive | null = null;

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.down.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.down.clear());
  }

  private is(...keys: string[]) {
    return keys.some((k) => this.down.has(k));
  }

  read(): Drive {
    if (this.override) return this.override;
    const throttle = (this.is('w', 'arrowup') ? 1 : 0) - (this.is('s', 'arrowdown') ? 1 : 0);
    const steer = (this.is('a', 'arrowleft') ? 1 : 0) - (this.is('d', 'arrowright') ? 1 : 0);
    return { throttle, steer };
  }
}
