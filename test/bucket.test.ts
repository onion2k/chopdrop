/**
 * The bucket under the helicopter, headless: when it hangs, and where, by pure sums at their edges, and the game's read
 * of it, which is what the scene draws, the badge shows and the test API says.
 */
import { describe, expect, it } from 'vitest';
import { FIRES, LEVELS } from '../src/arena';
import { BUCKET, bucketAt, bucketInWater, type BucketPose } from '../src/bucket';
import { HOVER_LIFT, HOVER_OVER_WATER } from '../src/helicopter';
import { NO_WATER } from '../src/water';
import { newGame } from './helpers';

const fresh = (): BucketPose => ({ out: false, hung: true, full: false, line: -1, bottom: NaN });
const at = (z: number, ground: number, overWater = false, landed = false) => {
  const out = fresh();
  bucketAt({ z, landed }, ground, overWater, out);
  return out;
};

describe('where the bucket hangs', () => {
  it('hangs its whole line from the helicopter when there is room under it, its bottom a line and its own height down', () => {
    const b = at(60, 20);
    expect(b.hung).toBe(true);
    expect(b.line).toBe(BUCKET.line);
    expect(b.bottom).toBeCloseTo(60 - BUCKET.line - BUCKET.height, 9);
  });

  it('has its whole line at the first height it fits and shortens it below that', () => {
    const fits = BUCKET.line + BUCKET.height;
    expect(at(20 + fits, 20).line).toBe(BUCKET.line);
    expect(at(20 + fits - 0.5, 20).line).toBeCloseTo(BUCKET.line - 0.5, 9);
  });

  it('is never below the ground under it: low over ground the line shortens to leave its bottom on it', () => {
    const b = at(24, 20);
    expect(b.hung).toBe(true);
    expect(b.line).toBeCloseTo(4 - BUCKET.height, 9);
    expect(b.bottom).toBeCloseTo(20, 9);
  });

  it('is stowed where there is no room for it under the skids: lower than its height over ground, and landed', () => {
    expect(at(20 + BUCKET.height - 0.01, 20).hung).toBe(false);
    const edge = at(20 + BUCKET.height, 20);
    expect(edge.hung).toBe(true);
    expect(edge.line).toBeCloseTo(0, 9);
    expect(at(20, 20, false, true).hung).toBe(false);
    // landed is stowed whatever is under it, even high on a mountain
    expect(at(80, 20, false, true).hung).toBe(false);
  });

  it('dips into open water, down to its top a hair under the surface, as the skids skim it', () => {
    // the skids 1.5 over the water, as the hover over it has them: the bucket's top is under the surface, which its line goes into
    const skim = at(30 + HOVER_OVER_WATER, 30, true);
    expect(skim.hung).toBe(true);
    expect(skim.bottom).toBeCloseTo(30 - BUCKET.height - BUCKET.dip, 9);
    expect(skim.line).toBeCloseTo(1.5 + BUCKET.dip, 9);
    expect(skim.bottom + BUCKET.height).toBeLessThan(30);
    // higher it hangs its whole line, over the water as anywhere
    expect(at(50, 30, true).line).toBe(BUCKET.line);
    // the same height over ground has it stowed or short, where water lets it sink
    expect(at(31.5, 30, false).line).toBeCloseTo(0.2, 9);
  });

  it('is stowed on the water at the surface only if landed, and hangs with a hair of line at the surface itself', () => {
    expect(at(30, 30, true).hung).toBe(true);
    expect(at(30, 30, true).line).toBeCloseTo(BUCKET.dip, 9);
    expect(at(30, 30, true, true).hung).toBe(false);
  });

  it('says its pose in the one record it is given, written over', () => {
    const out = fresh();
    bucketAt({ z: 60, landed: false }, 20, false, out);
    const hung = { ...out };
    bucketAt({ z: 20, landed: true }, 20, false, out);
    expect(out.hung).toBe(false);
    expect(hung.hung).toBe(true);
    // stowed, its bottom is the skids', so a drop from it falls from there
    expect(out.bottom).toBe(20);
    expect(out.line).toBe(0);
  });
});

describe('when it is in the water', () => {
  it('is its bottom under the surface, and not at it, and never in no water', () => {
    expect(bucketInWater(29.99, 30)).toBe(true);
    expect(bucketInWater(30, 30)).toBe(false);
    expect(bucketInWater(30.01, 30)).toBe(false);
    expect(bucketInWater(-1e9, NO_WATER)).toBe(false);
  });

  it('is so at the hover over water, whose floor puts the 5 m line, shortened, into it', () => {
    const b = at(30 + HOVER_OVER_WATER, 30, true);
    expect(bucketInWater(b.bottom, 30)).toBe(true);
    // and a hair over the line's own length it is out, where the bucket's bottom is at the surface
    const line = BUCKET.line + BUCKET.height;
    expect(bucketInWater(at(30 + line + 0.1, 30, true).bottom, 30)).toBe(false);
    expect(bucketInWater(at(30 + line - 0.1, 30, true).bottom, 30)).toBe(true);
  });
});

describe("the game's read of it", () => {
  it('is in, and stowed, with nothing to do with it, flying free', () => {
    const { game } = newGame();
    game.step(1 / 60);
    expect([game.bucket.out, game.bucket.hung]).toEqual([false, false]);
  });

  it('hangs once it is put out, high enough, and not while landed: stowed under the skids on the ground', () => {
    const { game } = newGame();
    game.setBucket(true);
    game.step(1 / 60);
    expect(game.bucket.out).toBe(true);
    // landed on the home pad: no room
    expect(game.bucket.hung).toBe(false);
    game.helicopter.placeAbove(game.helicopter.x, game.helicopter.y, 30, 0);
    game.step(1 / 60, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.bucket.hung).toBe(true);
    expect(game.bucket.line).toBe(BUCKET.line);
    expect(game.bucket.bottom).toBeCloseTo(game.helicopter.z - BUCKET.line - BUCKET.height, 6);
    game.setBucket(false);
    game.step(1 / 60, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.bucket.hung).toBe(false);
    // taken in, but where it would hang is still said, which a drop that has just emptied the tank falls from
    expect(game.bucket.bottom).toBeCloseTo(game.helicopter.z - BUCKET.line - BUCKET.height, 6);
  });

  it('is not hung by a fire level shown the way or going: only the player puts it out', () => {
    const { game } = newGame();
    game.guide(FIRES[0].id);
    game.helicopter.placeAbove(game.helicopter.x, game.helicopter.y, 30, 0);
    game.step(1 / 60, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.bucket.hung).toBe(false);
    game.begin(FIRES[0].id);
    game.step(1 / 60, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(game.bucket.out).toBe(false);
    expect(game.bucket.hung).toBe(false);
  });

  it('is stowed with the water in it that a bucket taken in keeps, which the badge does not show', () => {
    const { game } = newGame();
    game.tank.full = true;
    game.step(1 / 60);
    expect([game.bucket.out, game.bucket.full, game.bucket.hung]).toEqual([false, true, false]);
  });

  it('hangs while the tank fills, dips in the lake, and holds the water when full', () => {
    const { game } = newGame();
    const { run } = FIRES[0];
    game.setBucket(true);
    game.moveToStart(FIRES[0].id);
    const h = game.helicopter;
    let sawFull = false;
    let dipped = false;
    for (let f = 0; f < 600 && !sawFull; f++) {
      game.step(1 / 60, { forward: 0, turn: 0, lift: HOVER_LIFT });
      if (game.tank.filling > 0) {
        expect(game.bucket.hung).toBe(true);
        if (game.bucket.bottom < run.z) dipped = true;
      }
      sawFull = game.tank.full;
    }
    expect(h.z).toBeCloseTo(run.z + HOVER_OVER_WATER, 3);
    expect(sawFull).toBe(true);
    expect(dipped).toBe(true);
    expect(game.bucket.full).toBe(true);
  });

  it('is in the list of levels that a fire is one of, so there is a level to guide to', () => {
    expect(LEVELS.filter((l) => l.kind === 'fire').map((l) => l.id)).toEqual(FIRES.map((f) => f.id));
  });
});
