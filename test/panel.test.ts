/** The panel's one sum, headless: how its subtitle counts the levels done. The rest of it is DOM, worked in smoke/panel.spec.ts. */
import { describe, expect, it } from 'vitest';
import { panelSubtitle } from '../src/panel';

describe('the subtitle', () => {
  it('counts the levels with a best time, and says how a level is found', () => {
    const rows = [{ best: 17 }, { best: null }, { best: 26.5 }, { best: null }];
    expect(panelSubtitle(rows)).toBe('2 of 4 done · land on a crate or fly a start, anywhere');
    expect(panelSubtitle([{ best: null }])).toBe('0 of 1 done · land on a crate or fly a start, anywhere');
    expect(panelSubtitle([{ best: 3 }, { best: 4 }])).toBe('2 of 2 done · land on a crate or fly a start, anywhere');
  });
});
