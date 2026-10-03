/**
 * The tall column of smoke over each burning fire, as the sprites the renderer draws: soft puffs the game places itself
 * each frame, which cost nothing in the particle ring and have no range, so a fire is seen as a column from the far side
 * of the island, where the particles' smoke, which lives five seconds to fit the ring and rises thirty metres, is
 * a smudge or nothing. The particles stay for the dense dark base and the wash near the fire; this is the height.
 *
 * It is a pure function of the game's time and the fires: each puff is `phase` of the way up its climb, from where the
 * time says and where it began, so the same time draws the same column on every run, a paused frame draws it as it
 * stands, and it makes nothing. A puff within the rotor's wash is pushed out from under the hub, so the column bends
 * away under a helicopter. Without it a fire seen from afar is a glowing patch of ground, and a player flying about the
 * island does not know there is a fire to fight.
 */
import { SPRITE_CAPACITY, SPRITE_STRIDE } from 'artshape-render/game/particles';
import type { FirePlace } from './arena';
import { washAt, type Wash, type WashSource } from './downwash';
import { DRIFT, SMOKE, type FireView } from './effects';
import { HELICOPTER } from './helicopter';

/**
 * How the column looks. A fire's `puffs` each climb for `life` seconds, from `from` metres over the fire's middle, about
 * the treetops, to `rise` over it, drifting `drift` metres downwind as they go (the way the smoke's own wind blows, said
 * in `effects.ts`) and swelling from `size.from` to `size.to`. A puff's colour is the smoke's, from its dark to its pale
 * as it climbs. It is thin as it begins and as it ends, over the first `fadeIn` and the last `fadeOut` of its climb, and
 * `alpha` thick between, for a fire with all its patches burning; a fire with fewer is thinner by its share, but never
 * under `floor` of the whole, so a fire at its start is plainly seen. The wash pushes a puff out `push` metres at its strongest.
 * The column is 160 m tall and not 70 because the hills between a camera and a fire hide its lower half, and the particles'
 * own smoke covers the next: from 450 m only what is over the sky is seen, and seventy metres was all behind them.
 */
export const COLUMN = {
  puffs: 60,
  life: 40,
  from: 8,
  rise: 160,
  drift: 30,
  size: { from: 14, to: 56 },
  fadeIn: 0.1,
  fadeOut: 1 / 3,
  alpha: 1,
  floor: 0.8,
  push: 30,
};

/** How far through a unit a fire's column is begun, so that the three do not rise in step. The same golden fraction as the effects'. */
const OFFSET = 0.6180339887498949;

export class Column {
  /** How many puffs there can be at once, one fire's for each fire: the sprites the data has room for. */
  readonly capacity: number;
  /** The sprites of the last step, `SPRITE_STRIDE` floats each (position, size, colour, alpha), made once and written into. */
  readonly data: Float32Array;
  private readonly wash: Wash = { x: 0, y: 0, down: 0 };

  constructor(private readonly fires: readonly FirePlace[]) {
    this.capacity = fires.length * COLUMN.puffs;
    if (this.capacity > SPRITE_CAPACITY)
      throw new Error(
        `${fires.length} fires of ${COLUMN.puffs} puffs are more than the renderer's ${SPRITE_CAPACITY} sprites`,
      );
    this.data = new Float32Array(this.capacity * SPRITE_STRIDE);
  }

  /**
   * The puffs of every fire that burns, at game time `t`, written into `data`, and how many: the fires are `views`, in
   * the order of the places, and `source` is the rotor's wash if it is blowing. A fire that is out has none.
   */
  step(t: number, views: readonly FireView[], source?: Readonly<WashSource>): number {
    const { puffs, life, from, rise, drift, size, fadeIn, fadeOut, alpha, floor, push } = COLUMN;
    const dx = Math.cos(DRIFT.yaw),
      dy = Math.sin(DRIFT.yaw);
    const [dark, pale] = [SMOKE.colour, SMOKE.fade];
    const d = this.data;
    const w = this.wash;
    let n = 0;
    for (let f = 0; f < this.fires.length; f++) {
      const view = f < views.length ? views[f] : undefined;
      if (!view || view.burning <= 0) continue;
      const place = this.fires[f];
      const thick = alpha * Math.max(floor, view.burning / place.patches.length);
      const base = place.patches[0].z;
      for (let k = 0; k < puffs; k++) {
        const phase = (t / life + k / puffs + f * OFFSET) % 1;
        const climbed = phase < 0 ? phase + 1 : phase;
        let x = place.x + dx * drift * climbed,
          y = place.y + dy * drift * climbed;
        const z = base + from + (rise - from) * climbed;
        // a puff over the hub is over the rotor, whose air is blown down and out from under it and not up past it
        if (source && z <= source.z + HELICOPTER.size.mastTop) {
          washAt(source, x, y, z, w);
          x += w.x * push;
          y += w.y * push;
        }
        const o = n * SPRITE_STRIDE;
        d[o] = x;
        d[o + 1] = y;
        d[o + 2] = z;
        d[o + 3] = size.from + (size.to - size.from) * climbed;
        // it stays dark most of the way up and pales at the top, since pale smoke over a pale sky is not seen from afar
        const aged = climbed * climbed * climbed;
        d[o + 4] = dark[0] + (pale[0] - dark[0]) * aged;
        d[o + 5] = dark[1] + (pale[1] - dark[1]) * aged;
        d[o + 6] = dark[2] + (pale[2] - dark[2]) * aged;
        d[o + 7] = thick * Math.min(1, climbed / fadeIn, (1 - climbed) / fadeOut);
        n++;
      }
    }
    return n;
  }
}
