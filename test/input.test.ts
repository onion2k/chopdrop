/**
 * The keyboard's side of the bucket, headless: B is told to the page once for each press, and a held key, a chord with it
 * or any other key tells nothing. The keys that fly are read as they always were. The page's own listeners are stood in for
 * by a list, since there is no window here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/input';

type Handler = (e: Partial<KeyboardEvent> & { key: string }) => void;
let handlers: Record<string, Handler[] | undefined>;

beforeEach(() => {
  handlers = {};
  vi.stubGlobal('addEventListener', (type: string, fn: Handler) => (handlers[type] ??= []).push(fn));
});
afterEach(() => vi.unstubAllGlobals());

const press = (key: string, extra: Partial<KeyboardEvent> = {}) => {
  for (const fn of handlers.keydown ?? []) fn({ key, repeat: false, preventDefault: () => {}, ...extra });
};

describe('the bucket key', () => {
  it('tells the page once for each press of B, in either case', () => {
    const input = new Input();
    const told = vi.fn();
    input.onBucket = told;
    press('b');
    expect(told).toHaveBeenCalledTimes(1);
    press('B');
    expect(told).toHaveBeenCalledTimes(2);
  });

  it('tells nothing for a held key, a chord with it, or any other key', () => {
    const input = new Input();
    const told = vi.fn();
    input.onBucket = told;
    press('b', { repeat: true });
    press('b', { ctrlKey: true });
    press('b', { metaKey: true });
    press('b', { altKey: true });
    press('w');
    press(' ');
    expect(told).not.toHaveBeenCalled();
  });

  it('is not a control: the keys that fly are as they were, and the press changes none of them', () => {
    const input = new Input();
    input.onBucket = () => {};
    press('w');
    press('b');
    expect(input.read()).toEqual({ forward: 1, turn: 0, lift: 0 });
    expect(input.by).toBe('keys');
  });

  it('does nothing, and does not fail, with nobody listening', () => {
    const input = new Input();
    expect(() => press('b')).not.toThrow();
    expect(input.onBucket).toBeNull();
  });
});
