/**
 * The HUD's sums, headless: which way the arrow turns toward the pad as seen from the camera, the time as words, where
 * a level starts and how it is put, what the bar shows and the toast's life against game time.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS, theIsland } from '../src/arena';
import {
  TOAST,
  ToastQueue,
  barMode,
  clock,
  collectedWords,
  pointer,
  startPoint,
  startWords,
  toastShown,
  toastWords,
} from '../src/hud';

describe('the pointer', () => {
  // the camera looks along +x from the origin; the helicopter is at the origin
  const camera = { position: [0, 0, 10] as [number, number, number], target: [10, 0, 0] as [number, number, number] };
  const at = (x: number, y: number) => pointer(camera, { x: 0, y: 0 }, { x, y });

  it('points straight up the screen at a pad dead ahead', () => {
    expect(at(50, 0)).toBe(0);
  });

  it('turns anticlockwise for a pad to the left, clockwise for one to the right, and right round for one behind', () => {
    // +y is to the left of a camera looking along +x, as the island is seen from above
    expect(at(0, 50)).toBe(-90);
    expect(at(0, -50)).toBe(90);
    expect(Math.abs(at(-50, 0))).toBe(180);
    expect(at(50, 50)).toBe(-45);
  });

  it('turns with the camera and not with the helicopter', () => {
    const turned = { position: [0, 0, 10] as [number, number, number], target: [0, 10, 0] as [number, number, number] };
    expect(pointer(turned, { x: 0, y: 0 }, { x: 0, y: 50 })).toBe(0);
    expect(pointer(turned, { x: 5, y: 0 }, { x: 5, y: 50 })).toBe(0);
  });
});

describe('the clock', () => {
  it('reads minutes and seconds, the seconds always two figures and never rounded up', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(47.9)).toBe('0:47');
    expect(clock(61)).toBe('1:01');
    expect(clock(600)).toBe('10:00');
    expect(clock(-3)).toBe('0:00');
  });
});

describe('where a level starts', () => {
  const { pads } = theIsland();
  const level = (id: string) => LEVELS.find((l) => l.id === id)!;

  it('says "Land on the ... pad" for a delivery, by the site of its pickup pad', () => {
    expect(startWords(level('first-delivery'), pads)).toBe('Land on the meadow pad');
    expect(startWords(level('over-the-water'), pads)).toBe('Land on the rivermouth pad');
    expect(startWords(level('over-the-range'), pads)).toBe('Land on the meadow pad');
    expect(startWords(level('mountain-drop'), pads)).toBe('Land on the lakeside pad');
  });

  it('says where the first ring is for a trial, by the site of the pad nearest it', () => {
    expect(startWords(level('ring-trial'), pads)).toBe('Fly through the first ring, by the lakeside pad');
    expect(startWords(level('up-the-valley'), pads)).toBe('Fly through the first ring, by the meadow pad');
  });

  it('says "Fly ..." and the opening for a course', () => {
    expect(startWords(level('under-and-between'), pads)).toBe('Fly between the towers');
  });

  it('puts the start where the arrow points: the pickup pad, or the middle of the opening', () => {
    const first = level('first-delivery').steps[0] as { pad: number };
    expect(startPoint(level('first-delivery'), pads)).toEqual({ x: pads[first.pad].x, y: pads[first.pad].y });
    const ring = level('ring-trial').steps[0] as { x: number; y: number };
    expect(startPoint(level('ring-trial'), pads)).toEqual({ x: ring.x, y: ring.y });
    const gate = level('under-and-between').steps[0] as { x: number; y: number };
    expect(startPoint(level('under-and-between'), pads)).toEqual({ x: gate.x, y: gate.y });
  });
});

describe('the bar', () => {
  it('holds only the hint with nothing going and nothing guided, the way with a guide, and the level once one goes', () => {
    expect(barMode(false, false)).toBe('free');
    expect(barMode(false, true)).toBe('guided');
    expect(barMode(true, false)).toBe('going');
    // a level going outranks a guide left over from before it
    expect(barMode(true, true)).toBe('going');
  });

  it('is hidden while the toast shows with nothing going, back with the hint once it has gone, and never hides a level or a guide', () => {
    // the toast told at 10 is up until 13 game seconds, and the bar is quiet under it
    expect(barMode(false, false, toastShown(10, 11))).toBe('quiet');
    expect(barMode(false, false, toastShown(10, 12.99))).toBe('quiet');
    expect(barMode(false, false, toastShown(10, 13))).toBe('free');
    // a level that begins under the toast says its words
    expect(barMode(true, false, toastShown(10, 11))).toBe('going');
    expect(barMode(true, true, true)).toBe('going');
    // only the hint is hidden, and a guide is not the hint
    expect(barMode(false, true, true)).toBe('guided');
  });
});

describe('the toast', () => {
  it('is shown for three seconds of game time from the moment it is told, and then not', () => {
    expect(TOAST.seconds).toBe(3);
    expect(toastShown(10, 10)).toBe(true);
    expect(toastShown(10, 12.99)).toBe(true);
    expect(toastShown(10, 13)).toBe(false);
    expect(toastShown(10, 100)).toBe(false);
  });

  it('does not run on while the game is held, since the game time stands still', () => {
    // the panel holds the game, so `t` is the same on every frame drawn behind it
    for (let frame = 0; frame < 600; frame++) expect(toastShown(10, 11)).toBe(true);
  });

  it('says its title by kind, the time, and "New best" only for one', () => {
    expect(toastWords('delivery', 38.4, true)).toBe('Delivered! 0:38 ★ New best');
    expect(toastWords('rings', 61, false)).toBe('Trial complete! 1:01');
    expect(toastWords('course', 47.9, false)).toBe('Course complete! 0:47');
  });
});

describe("a collected structure's toast", () => {
  it('says "Collected", then the name and how many of how many, as the level toast says its time', () => {
    expect(collectedWords('the lakeside towers', 3, 7)).toBe('Collected the lakeside towers · 3 of 7');
    const queue = new ToastQueue(7);
    queue.collected('the lakeside towers', 3, 7, 10);
    expect(queue.update(10)).toMatchObject({
      title: 'Collected',
      left: 'the lakeside towers',
      sep: ' · ',
      right: '3 of 7',
      words: 'Collected the lakeside towers · 3 of 7',
    });
  });

  it('is shown for its own three seconds of game time, and then not', () => {
    const queue = new ToastQueue(7);
    expect(queue.update(0)).toBeNull();
    queue.collected('the gorge bridge', 1, 7, 10);
    expect(queue.update(12.99)).not.toBeNull();
    expect(queue.update(13)).toBeNull();
    expect(queue.update(500)).toBeNull();
  });

  it("waits for a level's toast that is showing, and is then shown for its own three seconds", () => {
    const queue = new ToastQueue(7);
    queue.level('delivery', 38.4, true, 10);
    queue.collected('the gorge bridge', 1, 7, 11);
    expect(queue.update(11)!.title).toBe('Delivered!');
    expect(queue.update(12.99)!.title).toBe('Delivered!');
    expect(queue.update(13)!.title).toBe('Collected');
    expect(queue.update(15.99)!.title).toBe('Collected');
    expect(queue.update(16)).toBeNull();
  });

  it('is told in turn, when two or three are collected while one shows', () => {
    const queue = new ToastQueue(7);
    queue.collected('the gorge bridge', 1, 7, 10);
    queue.collected('the west bridge', 2, 7, 11);
    queue.collected('the eastern towers', 3, 7, 12);
    expect(queue.waiting).toBe(2);
    expect(queue.update(12.5)!.words).toBe('Collected the gorge bridge · 1 of 7');
    expect(queue.update(13)!.words).toBe('Collected the west bridge · 2 of 7');
    expect(queue.update(15.99)!.words).toBe('Collected the west bridge · 2 of 7');
    expect(queue.update(16)!.words).toBe('Collected the eastern towers · 3 of 7');
    expect(queue.update(19)).toBeNull();
    expect(queue.waiting).toBe(0);
  });

  it('keeps its own time when it is looked at late: the next begins when the last ended, not when it was seen', () => {
    const queue = new ToastQueue(7);
    queue.collected('the gorge bridge', 1, 7, 10);
    queue.collected('the west bridge', 2, 7, 10.5);
    // nothing drawn between 10 and 14.5: the first ended at 13, so the second has 1.5 seconds left
    expect(queue.update(14.5)!.words).toBe('Collected the west bridge · 2 of 7');
    expect(queue.update(15.99)!.words).toBe('Collected the west bridge · 2 of 7');
    expect(queue.update(16)).toBeNull();
    // and one so late that all have gone leaves nothing
    queue.collected('a', 3, 7, 20);
    queue.collected('b', 4, 7, 20);
    expect(queue.update(100)).toBeNull();
  });

  it('is shown at once when nothing is showing, from the moment it is told', () => {
    const queue = new ToastQueue(7);
    queue.collected('the gorge bridge', 1, 7, 10);
    queue.update(20);
    queue.collected('the west bridge', 2, 7, 30);
    expect(queue.update(30)!.words).toBe('Collected the west bridge · 2 of 7');
    expect(queue.update(32.99)).not.toBeNull();
    expect(queue.update(33)).toBeNull();
  });

  it("is put after a level's toast that comes while it shows, and still shown whole", () => {
    const queue = new ToastQueue(7);
    queue.collected('the gorge bridge', 1, 7, 10);
    queue.level('rings', 61, false, 11);
    expect(queue.update(11)!.title).toBe('Trial complete!');
    expect(queue.update(13.99)!.title).toBe('Trial complete!');
    expect(queue.update(14)!.words).toBe('Collected the gorge bridge · 1 of 7');
    expect(queue.update(16.99)).not.toBeNull();
    expect(queue.update(17)).toBeNull();
  });

  it("is the level's toast alone that replaces a level's toast", () => {
    const queue = new ToastQueue(7);
    queue.level('delivery', 30, false, 10);
    queue.level('rings', 40, true, 11);
    expect(queue.update(11)!.words).toBe('Trial complete! 0:40 ★ New best');
    expect(queue.update(14)).toBeNull();
  });

  it('is a ring sized once, never growing past what it was given: the oldest waiting is let go', () => {
    const queue = new ToastQueue(3);
    expect(queue.capacity).toBe(3);
    for (let n = 1; n <= 9; n++) queue.collected(`s${n}`, n, 9, 10);
    expect(queue.waiting).toBe(3);
    expect(queue.update(10)!.words).toBe('Collected s1 · 1 of 9');
    const shown: string[] = [];
    for (let t = 13; t < 30; t += 3) {
      const now = queue.update(t);
      if (now) shown.push(now.left);
    }
    expect(shown).toEqual(['s7', 's8', 's9']);
  });

  it('is put away with everything waiting when the helicopter is put somewhere new', () => {
    const queue = new ToastQueue(7);
    queue.collected('the gorge bridge', 1, 7, 10);
    queue.collected('the west bridge', 2, 7, 10);
    queue.clear();
    expect(queue.update(10)).toBeNull();
    expect(queue.waiting).toBe(0);
  });

  it('counts each change of what is shown, so the page writes only then', () => {
    const queue = new ToastQueue(7);
    const was = queue.serial;
    queue.update(1);
    expect(queue.serial).toBe(was);
    queue.collected('the gorge bridge', 1, 7, 10);
    expect(queue.serial).toBe(was + 1);
    queue.update(11);
    queue.update(12);
    expect(queue.serial).toBe(was + 1);
    queue.update(13);
    expect(queue.serial).toBe(was + 2);
    queue.update(14);
    expect(queue.serial).toBe(was + 2);
  });

  it("hides the hint under it as it does under a level's", () => {
    const queue = new ToastQueue(7);
    queue.collected('the gorge bridge', 1, 7, 10);
    expect(barMode(false, false, queue.update(11) !== null)).toBe('quiet');
    expect(barMode(false, false, queue.update(13) !== null)).toBe('free');
  });
});
