/**
 * The bucket under the helicopter: when it hangs and where. It is hung only while the player has put it out, so that
 * every picture of a game with it in is as it was; and it hangs on a line of `BUCKET.line` from the skids, never with
 * its bottom below the ground under it, shortening its line as the helicopter comes down, sinking into open water as
 * it is let down onto it, and stowed where there is no room for it under the skids. Its bottom under the surface of open
 * water is what fills it. The scene draws what this says, the badge shows the tank by it and a drop falls from the
 * bucket's bottom; without it each would work out for itself where the bucket is, and they would not agree.
 *
 * It knows nothing of the helicopter or the game: it is handed the numbers, and writes its answer in place.
 */
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
  /** Whether the player has put it out, and not taken it in: a full bucket taken in is still full, and stowed. */
  out: boolean;
  /** Whether it is drawn: out, and with room to hang. */
  hung: boolean;
  /** Whether the tank is full, which shows as water in the bucket. */
  full: boolean;
  /** How long the line is, from the skids down to the bucket's top, where it hangs or would; 0 where there is no room. */
  line: number;
  /** The height of the bucket's bottom above the sea, which a drop falls from; the skids' where there is no room. */
  bottom: number;
}

/**
 * Whether a bucket whose bottom is at `bottom` is in the water whose surface is at `surface` (`NO_WATER` for none): its
 * bottom under it. The one rule, so that the fill, the rules and the scene say the same of a bucket that is just dipped.
 */
export function bucketInWater(bottom: number, surface: number): boolean {
  return bottom < surface;
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
