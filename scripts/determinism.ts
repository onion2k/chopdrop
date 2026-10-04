/**
 * The same seed, played twice, giving the same game, checked a hash at a time, so a run that parts from itself says
 * at which frame.
 *
 *   npm run determinism                    seeds 1-13, 5400 frames each
 *   npm run determinism -- --seeds 1-12 --frames 7200
 *
 * Everything that holds the game to a figure rests on this: the pace gate, the fuzzer replaying a failure by seed,
 * a bug reported with the seed it happened on. What breaks it is chance taken from somewhere other than the game's
 * own source, state left over in a module between runs, or an order that is not the same twice, and none of that
 * shows as a failure anywhere else, only as figures that wander.
 *
 * The autopilot is told the levels in turn, from home, and goes to each one's start and does it, so the two runs are
 * played the same way without a recording.
 */
import { LEVELS } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { Game } from '../src/game';
import { seeded } from '../src/random';

const DT = 1 / 60;

export interface TwiceOptions {
  seed: number;
  frames: number;
  /** How many frames between hashes. */
  every?: number;
  /** For testing the check itself: something done to the game at each step of a pass. */
  meddle?: (game: Game, pass: number, frame: number) => void;
}

export interface TwiceResult {
  seed: number;
  frames: number;
  /** The frame the two runs first parted at, or null if they never did. */
  diverged: number | null;
  /** The hashes of the first run, one per checkpoint. */
  checkpoints: string[];
  note: string;
}

/**
 * Everything the game is at this moment, as one number in hex: where the helicopter is, how fast it is going and
 * how it is turned and tilted, its rotor; which level is going (−1 for none) and where it has got to; what the starts
 * are loading and which pad they have blocked; the level guided to (−1 for none); every tree moving and how it leans;
 * the best times kept; the structures collected, how many and which, in order; the packages found, the same, with
 * what the radar hears and its clock; the tank, full and how far it is filled, how much of a pour is left, whether the bucket is out, and the state of each fire's patches in
 * order; and the clock. Two games with the same hash are the same game, down to the last
 * bit of every float.
 */
export function hashGame(game: Game): string {
  const { helicopter: h, mission: d, sway } = game;
  // FNV-1a over the bits, which is enough to catch a helicopter a thousandth out of place
  let hash = 0x811c9dc5;
  const bits = new DataView(new ArrayBuffer(8));
  const eat = (n: number) => {
    bits.setFloat64(0, n);
    for (let b = 0; b < 8; b++) {
      hash ^= bits.getUint8(b);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  for (const n of [h.x, h.y, h.z, h.floor, h.vx, h.vy, h.vz, h.yaw, h.yawRate, h.pitch, h.roll, h.rotor, h.rotorSpeed])
    eat(n);
  eat(d.level ? game.levels.indexOf(d.level) : -1);
  eat(d.next);
  eat(d.loading);
  eat(d.time);
  eat(game.starts.loading);
  eat(game.starts.blocked);
  eat(game.guided ? game.levels.indexOf(game.guided) : -1);
  eat(sway.count);
  for (let k = 0; k < sway.count; k++) {
    eat(sway.tree[k]);
    eat(sway.leanX[k]);
    eat(sway.leanY[k]);
    eat(sway.squash[k]);
    eat(sway.leanXRate[k]);
    eat(sway.leanYRate[k]);
    eat(sway.squashRate[k]);
  }
  eat(game.progress.best.size);
  for (const seconds of game.progress.best.values()) eat(seconds);
  eat(game.collection.count);
  for (const id of game.collection.ids) for (let k = 0; k < id.length; k++) eat(id.charCodeAt(k));
  eat(game.finds.count);
  for (const id of game.finds.ids) for (let k = 0; k < id.length; k++) eat(id.charCodeAt(k));
  eat(game.finds.nearest);
  eat(game.finds.until);
  eat(game.tank.full ? 1 : 0);
  eat(game.tank.filling);
  eat(game.pour);
  eat(game.bucket.out ? 1 : 0);
  for (const fire of game.fires) for (let k = 0; k < fire.states.length; k++) eat(fire.states[k]);
  eat(game.t);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * The default run: seeds 1 to `seeds`, `frames` each. A flight gets from home to the start of one level and not much
 * further, so thirteen seeds, each beginning at its own level, are what it takes for the run to begin all thirteen. The
 * far fire is the slowest to begin, since its water is 500 m from home and it takes the first drop to do it: 88 s
 * of game, so a run is 90 s and not the minute the ten before it took.
 */
export const DEFAULT = { seeds: 13, frames: 5400 };

/**
 * Which level a seed's flight begins at, of `count`: each seed its own in turn, so that the default run begins every
 * level, and the rescues at the end of the list are played by the gate and not only by the long runs.
 */
export function startingLevel(seed: number, count: number): number {
  return (seed - 1) % count;
}

/**
 * A game from a seed, flown by the autopilot for `frames` frames from home: told the levels in turn, from the one at
 * `first` (the first by default), and the next each time one is done, with the first again after the last.
 */
export function* flight(seed: number, frames: number, first = 0): Generator<Game> {
  const game = new Game({ random: seeded(seed) });
  const pilot = new Autopilot(game);
  let at = first;
  let seen = game.last;
  pilot.wanted = game.levels[at].id;
  for (let f = 1; f <= frames; f++) {
    pilot.step(DT);
    if (game.last !== seen) {
      seen = game.last;
      at = (at + 1) % game.levels.length;
      pilot.wanted = game.levels[at].id;
    }
    yield game;
  }
}

/** Play a seed twice, hashing every `every` frames, and say where the two runs first parted. */
export function playTwice({ seed, frames, every = 300, meddle }: TwiceOptions): TwiceResult {
  const passes: string[][] = [];
  for (let pass = 0; pass < 2; pass++) {
    const hashes: string[] = [];
    let f = 0;
    for (const game of flight(seed, frames, startingLevel(seed, LEVELS.length))) {
      f++;
      meddle?.(game, pass, f);
      if (f % every === 0) hashes.push(hashGame(game));
    }
    passes.push(hashes);
  }
  const [one, two] = passes;
  const at = one.findIndex((h, k) => h !== two[k]);
  if (at < 0) return { seed, frames, diverged: null, checkpoints: one, note: `seed ${seed}: the same, twice` };
  const frame = (at + 1) * every;
  return {
    seed,
    frames,
    diverged: frame,
    checkpoints: one,
    note: `seed ${seed}: the two runs parted by frame ${frame} (${one[at]} against ${two[at]}); the last they agreed on was ${at ? `frame ${at * every}` : 'the start'}`,
  };
}
