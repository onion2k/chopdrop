/**
 * The same seed, played twice, giving the same game, checked a hash at a time, so a run that parts from itself says
 * at which frame.
 *
 *   npm run determinism                    seeds 1-6, 3600 frames each
 *   npm run determinism -- --seeds 1-12 --frames 7200
 *
 * Everything that holds the game to a figure rests on this: the pace gate, the fuzzer replaying a failure by seed,
 * a bug reported with the seed it happened on. What breaks it is chance taken from somewhere other than the game's
 * own source, state left over in a module between runs, or an order that is not the same twice, and none of that
 * shows as a failure anywhere else, only as figures that wander.
 *
 * The autopilot flies the level and flies it again once it is delivered, so the two runs are played the same way
 * without a recording.
 */
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

const STAGES = ['pickup', 'carry', 'delivered'];

/**
 * Everything the game is at this moment, as one number in hex: where the helicopter is, how fast it is going and
 * how it is turned and tilted, its rotor; where the delivery has got to; every tree moving and how it leans; and the
 * clock. Two games with the same hash are the same game, down to the last bit of every float.
 */
export function hashGame(game: Game): string {
  const { helicopter: h, delivery: d, sway } = game;
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
  eat(STAGES.indexOf(d.stage));
  eat(d.ring);
  eat(d.time);
  eat(d.started ? 1 : 0);
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
  eat(game.t);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** A game from a seed, flown by the autopilot for `frames` frames, the level flown again each time it is delivered. */
export function* flight(seed: number, frames: number): Generator<Game> {
  const game = new Game({ random: seeded(seed) });
  const pilot = new Autopilot(game);
  for (let f = 1; f <= frames; f++) {
    pilot.step(DT);
    if (game.delivery.stage === 'delivered') game.restart();
    yield game;
  }
}

/** Play a seed twice, hashing every `every` frames, and say where the two runs first parted. */
export function playTwice({ seed, frames, every = 300, meddle }: TwiceOptions): TwiceResult {
  const passes: string[][] = [];
  for (let pass = 0; pass < 2; pass++) {
    const hashes: string[] = [];
    let f = 0;
    for (const game of flight(seed, frames)) {
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
