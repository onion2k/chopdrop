/**
 * The game played by a monkey: the real game, without the picture, driven
 * at random and made to do at random everything a player can make happen —
 * driving about, stopping, lining up on a ball and shoving it in, saving and
 * loading —
 * and checked after every few frames for anything that must always hold and
 * does not (`invariants.ts`), and for anything thrown.
 *
 * Only what a player could do. A monkey that did what no player can would
 * find bugs no player will. A new thing a player can do gets an action here.
 *
 * From a seed, so a failure can be played again exactly: `npm run fuzz --
 * --seed N` does, and prints what was done before it went wrong.
 */
import { FLOOR, HOLE } from '../src/arena';
import { Game, type GameEvents } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

const DT = 1 / 60;
/** How many frames between checks, when nothing has just been done. */
const CHECK_EVERY = 10;
/** How many of the last things done a failure reports. */
const LOG_TAIL = 25;

export interface FuzzFailure {
  seed: number;
  frame: number;
  problems: string[];
  /** The last things done before it, oldest first. */
  log: string[];
}

export interface FuzzResult {
  seed: number;
  frames: number;
  failure: FuzzFailure | null;
  /** How often each thing was done, and each event happened: to see that the monkey got about. */
  done: Record<string, number>;
  happened: Record<string, number>;
}

/** Play `frames` frames of the game at random from `seed`. */
export function fuzz(seed: number, frames: number): FuzzResult {
  // the monkey's own chance, apart from the game's, so what it decides does not shift what the game does
  const random = seeded(seed * 7 + 1);
  const happened: Record<string, number> = {};
  const done: Record<string, number> = {};
  const count = (into: Record<string, number>, key: string) => (into[key] = (into[key] ?? 0) + 1);
  const events: GameEvents = new Proxy(
    {},
    {
      get: (_, name: string) => () => count(happened, name),
    },
  );
  const log: string[] = [];
  let frame = 0;
  const fail = (problems: string[]): FuzzResult => ({
    seed,
    frames: frame,
    failure: { seed, frame, problems, log: log.slice(-LOG_TAIL) },
    done,
    happened,
  });

  try {
    let store = memoryStore();
    let game = new Game(new Progress(store), events, { random: seeded(seed) });
    let drive = { throttle: 0, steer: 0 };
    let busy = 0;
    const between = (a: number, b: number) => a + random() * (b - a);
    const did = (what: string) => {
      count(done, what);
      log.push(`frame ${frame}: ${what}`);
    };
    /** Everything a player can make happen, each as often as it is weighted. */
    const actions: [number, () => void][] = [
      [
        8,
        () => {
          drive = { throttle: random() < 0.8 ? 1 : -1, steer: between(-1, 1) };
          busy = Math.floor(between(20, 120));
          did('drive');
        },
      ],
      [
        2,
        () => {
          drive = { throttle: 0, steer: 0 };
          busy = Math.floor(between(10, 60));
          did('stop');
        },
      ],
      [
        1,
        () => {
          // a player can drive anywhere on the floor, so the monkey may simply be there
          game.sled.x = between(FLOOR.minX + 6, FLOOR.maxX - 6);
          game.sled.y = between(FLOOR.minY + 6, FLOOR.maxY - 6);
          game.sled.yaw = between(0, Math.PI * 2);
          game.sled.speed = 0;
          did('teleport');
        },
      ],
      [
        2,
        () => {
          // lined up behind a ball from the hole and driving at it, as a player pushing one in does
          const { world, sled } = game;
          const live = [...Array(world.count).keys()].filter((i) => world.alive[i]);
          if (!live.length) return;
          const i = live[Math.floor(random() * live.length)];
          const away = Math.hypot(world.x[i] - HOLE.x, world.y[i] - HOLE.y) || 1;
          const ux = (world.x[i] - HOLE.x) / away,
            uy = (world.y[i] - HOLE.y) / away;
          sled.x = Math.max(FLOOR.minX + 6, Math.min(FLOOR.maxX - 6, world.x[i] + ux * 6));
          sled.y = Math.max(FLOOR.minY + 6, Math.min(FLOOR.maxY - 6, world.y[i] + uy * 6));
          sled.yaw = Math.atan2(-uy, -ux);
          sled.speed = 0;
          drive = { throttle: 1, steer: 0 };
          busy = Math.floor(between(60, 240));
          did('aim');
        },
      ],
      [
        1,
        () => {
          // saved, and loaded again into a new game as a reload would: what was banked must be kept
          const bank = game.progress.bank;
          game.persist();
          store = memoryStore(store.json);
          game = new Game(new Progress(store), events, { random: seeded(seed + frame) });
          if (game.progress.bank !== bank) throw new Error(`the bank was ${bank} and loaded as ${game.progress.bank}`);
          did('reload');
        },
      ],
    ];
    const total = actions.reduce((n, [w]) => n + w, 0);
    const act = () => {
      let pick = random() * total;
      for (const [w, go] of actions) {
        if ((pick -= w) < 0) return go();
      }
    };

    for (frame = 1; frame <= frames; frame++) {
      if (busy > 0) busy--;
      else act();
      game.step(DT, drive);
      if (frame % CHECK_EVERY === 0) {
        const problems = checkInvariants(game);
        if (problems.length) return fail(problems);
      }
    }
    return { seed, frames, failure: null, done, happened };
  } catch (err) {
    return fail([`threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`]);
  }
}
