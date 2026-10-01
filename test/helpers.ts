/** What the tests share: a new game in memory, from a seed. */
import { Game } from '../src/game';
import { seeded } from '../src/random';

export const DT = 1 / 60;

export function newGame(seed = 1) {
  return { game: new Game({ random: seeded(seed) }) };
}
