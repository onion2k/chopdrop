/**
 * The slow sweeps: a test that tries one thing over many cases (every structure against every package, a level from
 * every awkward place) takes seconds, and the quick check, which is the pre-commit hook, must stay under half a
 * minute. `sweep` hands such a test every case in the slow run (`npm run test:slow`, which `npm run check` makes) and
 * only the first in the quick one, so each sweep still has a representative in the hook. Without it the hook grows
 * with every level and every structure, until it is skipped.
 */
export const SLOW = process.env.CHOPDROP_SLOW === '1';

/** Every case in the slow run, and the first alone in the quick one. */
export function sweep<T>(cases: readonly T[]): readonly T[] {
  return SLOW ? cases : cases.slice(0, 1);
}
