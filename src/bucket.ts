/**
 * The bucket under the helicopter: when it hangs and where. It is hung only while it is in use, a fire level going or
 * shown the way or water in the tank, so that every picture of a game with no fire is as it was; and it hangs on a line
 * of `BUCKET.line` from the skids, never with its bottom below the ground under it, shortening its line as the helicopter
 * comes down, sinking into open water as the scoop skims it, and stowed where there is no room for it under the skids.
 * The scene draws what this says, the badge shows the tank by it and a drop falls from the bucket's bottom; without it
 * each would work out for itself where the bucket is, and they would not agree.
 *
 * It knows nothing of the helicopter or the game: it is handed the numbers, and writes its answer in place.
 */
import type { LevelKind } from './mission';

/**
 * The bucket's measure, each said once: the line it hangs on at most, how wide and how tall the bucket is, how thick the
 * line is, how far under the surface its top goes as it dips (a hair, so that it is not level with the water, whose
 * plane it would fight), and the water's top in it when the tank is full (how wide across, how thick, and how much its
 * colour is lit).
 */
export const BUCKET = {
  line: 5,
  width: 1.4,
  height: 1.3,
  rope: 0.06,
  dip: 0.1,
  water: { across: 1.2, thick: 0.06, glow: 1.2 },
};

/** Where the bucket is, as the scene draws it and the words read it. */
export interface BucketPose {
  /** Whether it is in use: a fire level going or shown the way, or the tank filling or full. */
  wanted: boolean;
  /** Whether it is drawn: in use, and with room to hang. */
  hung: boolean;
  /** Whether the tank is full, which shows as water in the bucket. */
  full: boolean;
  /** How long the line is, from the skids down to the bucket's top, where it hangs or would; 0 where there is no room. */
  line: number;
  /** The height of the bucket's bottom above the sea, which a drop falls from; the skids' where there is no room. */
  bottom: number;
}

/** Whether the bucket is in use: a fire level is going or shown the way, or the tank is filling or full. */
export function bucketWanted(
  going: LevelKind | null,
  guided: LevelKind | null,
  tank: Readonly<{ full: boolean; filling: number }>,
): boolean {
  return going === 'fire' || guided === 'fire' || tank.full || tank.filling > 0;
}

/**
 * The bucket for a helicopter with its skids at `h.z`, over `ground` (the height of what is under it: the land, or the
 * water's surface), written into `out`: its `hung`, `line` and `bottom`. It hangs on its whole line, or on as much as
 * leaves its bottom on the ground; over open water (`overWater`) it may sink until its top is `BUCKET.dip` under the
 * surface. Landed, or
 * with less room under the skids than the bucket is tall, it is stowed.
 */
export function bucketAt(
  h: Readonly<{ z: number; landed: boolean }>,
  ground: number,
  overWater: boolean,
  out: Pick<BucketPose, 'hung' | 'line' | 'bottom'>,
): void {
  const lowest = overWater ? ground - BUCKET.height - BUCKET.dip : ground;
  const room = h.z - lowest - BUCKET.height;
  if (h.landed || room < 0) {
    out.hung = false;
    out.line = 0;
    out.bottom = h.z;
    return;
  }
  out.hung = true;
  out.line = Math.min(BUCKET.line, room);
  out.bottom = h.z - out.line - BUCKET.height;
}
