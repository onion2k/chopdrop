/**
 * Chance, from one place. The game is handed a source of it and never
 * reaches for Math.random itself, which is what lets the same seed give the
 * same game twice: the fuzzer's replays, the determinism check and every
 * baseline gate rest on that.
 */
export type Random = () => number;

/** A number in [0, 1) from a seed: a small linear congruential generator, the same everywhere. */
export function seeded(seed: number): Random {
  let s = (seed * 2654435761 + 1) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
