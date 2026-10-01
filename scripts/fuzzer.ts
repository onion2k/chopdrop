/**
 * The game played by a monkey: the real game, without the picture, driven
 * at random and made to do at random everything a player can make happen —
 * flying about, hovering, climbing to the ceiling, landing, and being
 * somewhere else — and checked after every few frames for anything that
 * must always hold and does not (`invariants.ts`), and for anything thrown.
 *
 * Only what a player could do. A monkey that did what no player can would
 * find bugs no player will. A new thing a player can do gets an action here.
 *
 * From a seed, so a failure can be played again exactly: `npm run fuzz --
 * --seed N` does, and prints what was done before it went wrong.
 */
import { Game } from '../src/game';
import { HELICOPTER, IDLE, type Controls } from '../src/helicopter';
import { checkInvariants } from '../src/invariants';
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
  /** How often each thing was done, and each thing seen to happen: to see that the monkey got about. */
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
    const game = new Game({ random: seeded(seed) });
    const heli = game.helicopter;
    const { bounds } = heli;
    let controls: Controls = { ...IDLE };
    // how many frames the current thing is still held for, and whether it is a landing, which ends when the skids touch
    const hold = { busy: 0, landing: false };
    const between = (a: number, b: number) => a + random() * (b - a);
    const did = (what: string) => {
      count(done, what);
      log.push(`frame ${frame}: ${what}`);
    };
    // read afresh each time, so a step between two reads is seen
    const landed = () => heli.z === 0;
    const touchingEdge = () =>
      heli.x === bounds.minX || heli.x === bounds.maxX || heli.y === bounds.minY || heli.y === bounds.maxY;
    /** Everything a player can make happen, each as often as it is weighted. */
    const actions: [number, () => void][] = [
      [
        8,
        () => {
          const r = random();
          controls = {
            forward: r < 0.7 ? 1 : r < 0.85 ? -1 : 0,
            turn: between(-1, 1),
            lift: Math.floor(random() * 3) - 1,
          };
          hold.busy = Math.floor(between(20, 120));
          did('fly');
        },
      ],
      [
        2,
        () => {
          controls = { ...IDLE };
          hold.busy = Math.floor(between(10, 60));
          did('hover');
        },
      ],
      [
        3,
        () => {
          controls = { forward: 0, turn: 0, lift: 1 };
          hold.busy = Math.floor(between(200, 400));
          did('climb');
        },
      ],
      [
        2,
        () => {
          controls = { forward: 0, turn: 0, lift: -1 };
          hold.busy = 400;
          hold.landing = true;
          did('land');
        },
      ],
      [
        1,
        () => {
          // a player can fly anywhere, at any height, so the monkey may simply be there
          heli.place(
            between(bounds.minX, bounds.maxX),
            between(bounds.minY, bounds.maxY),
            between(0, HELICOPTER.ceiling),
            between(-Math.PI, Math.PI),
          );
          did('teleport');
        },
      ],
      [
        1,
        () => {
          // flown at a wall from the middle of somewhere, as a player gone too far does
          const wall = Math.floor(random() * 4);
          heli.place(
            between(bounds.minX, bounds.maxX),
            between(bounds.minY, bounds.maxY),
            between(2, HELICOPTER.ceiling),
            [0, Math.PI / 2, Math.PI, -Math.PI / 2][wall],
          );
          controls = { forward: 1, turn: 0, lift: 0 };
          hold.busy = Math.floor(between(180, 300));
          did('edge run');
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
      if (hold.busy > 0) hold.busy--;
      else {
        hold.landing = false;
        act();
      }
      const wasLanded = landed();
      const wasAtCeiling = heli.z === HELICOPTER.ceiling;
      const wasAtEdge = touchingEdge();
      game.step(DT, controls);
      if (wasLanded && !landed()) count(happened, 'took off');
      if (!wasLanded && landed()) count(happened, 'landed');
      if (!wasAtCeiling && heli.z === HELICOPTER.ceiling) count(happened, 'reached the ceiling');
      if (!wasAtEdge && touchingEdge()) count(happened, 'touched the edge');
      if (hold.landing && landed()) hold.busy = 0;
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
