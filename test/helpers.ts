/** What the tests share: a new game in memory, from a seed, with a note of every event it tells. */
import { Game, type GameEvents } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

export const DT = 1 / 60;
export const still = { throttle: 0, steer: 0 };

export function newGame(seed = 1, json: string | null = null) {
  const store = memoryStore(json);
  const told: string[] = [];
  const events: GameEvents = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) =>
          told.push(`${name} ${args.filter((a) => typeof a === 'number').join(' ')}`.trim()),
    },
  );
  const game = new Game(new Progress(store), events, { random: seeded(seed) });
  return { game, store, told };
}

/** Play `frames` frames still. */
export function settle(game: Game, frames = 120) {
  for (let f = 0; f < frames; f++) game.step(DT, still);
}
