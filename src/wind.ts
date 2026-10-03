/**
 * The island's wind: one for everything on it, brisk, gusting over seconds and turning once round in six minutes, all of
 * it worked out from the game's own time so that the same time blows the same wind on every run, a game held behind the
 * panel holds it, and a picture of smoke in it is the same every time. The renderer's particles ride it and the column of
 * sprites leans in it; neither works it out for itself. It is a sum of a few sines, so it costs a frame nothing, and it
 * writes into a record its caller made once. Without it the smoke would stand in straight columns on a day with no air.
 */

/**
 * The wind's numbers, each said once: its mean `speed` in metres a second, the `gusts` that vary it (each a `share` of the
 * speed, up and down, over a `period` in seconds, so that the two never fall in step), the seconds it takes to `turn`
 * once round, and the direction it blows in at the start, `yaw`, in radians over the ground, anticlockwise from the east.
 */
export const WIND = {
  speed: 6,
  gusts: [
    { share: 0.35, period: 7 },
    { share: 0.15, period: 2.3 },
  ],
  turn: 360,
  yaw: 0.6,
};

/** The wind as a velocity over the ground, in metres a second. */
export interface Wind {
  x: number;
  y: number;
}

/** A time that is not a number, or not finite, as nought: no wind is worked out from a time that is not one. */
const sane = (t: number): number => (Number.isFinite(t) ? t : 0);

/** How fast the wind blows at game time `t`, in metres a second: the mean with the gusts on it. */
export function windSpeed(t: number): number {
  const time = sane(t);
  let gust = 0;
  for (const g of WIND.gusts) gust += g.share * Math.sin((2 * Math.PI * time) / g.period);
  return WIND.speed * (1 + gust);
}

/** Which way the wind blows at game time `t`, in radians: the way it began, turning anticlockwise once round each `WIND.turn`. */
export function windYaw(t: number): number {
  return WIND.yaw + (2 * Math.PI * sane(t)) / WIND.turn;
}

/** The wind at game time `t`, written into `out` and returned, so that nothing is made. */
export function windAt(t: number, out: Wind): Wind {
  const speed = windSpeed(t);
  const yaw = windYaw(t);
  out.x = Math.cos(yaw) * speed;
  out.y = Math.sin(yaw) * speed;
  return out;
}
