/**
 * What drawing a frame costs, measured: `draw` is called and the GPU waited
 * for, a number of times, and the least taken. The samples are spaced by a
 * timeout, not an animation frame, since a hidden tab gets none. Whatever
 * else the machine is doing only ever adds time, so the least is the frame's
 * own cost: over forty pages just booted it read 0.171 to 0.178 ms, where
 * the lower quartile, which this used to take, read 0.173 to 0.219.
 *
 * A GPU runs as fast as it is kept busy. One that has sat idle, as it does
 * while the page boots, runs slow for a while; and one handed a frame at a
 * time, or ten that are over in two milliseconds, never comes up to speed at
 * all. Timed that way the frame here read anywhere from 0.19 to 0.36 ms on
 * the same code, and twice that a frame at a time. So the GPU is kept
 * drawing for a quarter of a second first, and each sample is as many frames
 * back to back as take ten milliseconds, shared among them. A browser's
 * clock ticks in tenths of a millisecond, too, and a frame timed alone is
 * read no finer.
 *
 * What it cannot do is read a frame while another program is on the GPU:
 * every sample then takes three times as long, for as long as that lasts.
 *
 * It is all by time and not by frames, so that it holds for a game whose
 * frame costs ten times this one's.
 */
export const SAMPLES = 24,
  /** How long each sample's frames take to draw, about, in milliseconds. */
  SAMPLE_MS = 10,
  /** The fewest frames in a sample, however long they take. */
  FEWEST = 10,
  /** How long the GPU is kept drawing before anything is timed, in milliseconds, unless told otherwise. */
  WARM_MS = 250;
/** The most frames in a sample: what a frame too small for the clock to see is given. */
const MOST = 2000;

export async function frameCost(draw: () => boolean, done: () => Promise<unknown>, warm = WARM_MS): Promise<number> {
  /** A lot of frames drawn back to back, and what one of them took; 0 where none was drawn, or too few to time. */
  const lot = async (frames: number) => {
    await new Promise((r) => setTimeout(r, 0));
    const start = performance.now();
    let drawn = 0;
    for (let k = 0; k < frames; k++) if (draw()) drawn++;
    await done();
    return drawn ? (performance.now() - start) / drawn : 0;
  };
  // the GPU brought up to speed, in lots as long as the samples will be: at least one, which says how many frames
  // that is
  let frames = FEWEST,
    least = Infinity;
  for (let drawing = 0, first = true; first || drawing < warm; first = false) {
    const frame = await lot(frames);
    drawing += frame * frames;
    if (frame > 0) {
      // by the quickest lot there has been: one held up by something else would make the samples short
      least = Math.min(least, frame);
      frames = Math.min(MOST, Math.max(FEWEST, Math.ceil(SAMPLE_MS / least)));
    } else if (warm <= 0 || !Number.isFinite(warm)) break;
    else {
      // nothing drawn, or too little for the clock to see: the time still has to pass, and more frames are tried
      drawing += SAMPLE_MS;
      frames = Math.min(MOST, frames * 2);
    }
  }
  const times: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const frame = await lot(frames);
    if (frame > 0) times.push(frame);
  }
  if (!times.length) return 0;
  return Math.min(...times);
}
