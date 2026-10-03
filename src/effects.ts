/**
 * What the page emits into the renderer's particles each frame it draws: the fires' flames and smoke, the rescue's
 * flare, and the spray and mist of a drop, and the rotor's air that pushes them about. Every stream has a rate in
 * particles per game second, kept in an accumulator, so the same time gives the same count however it is cut into
 * frames, and a source that is out of range, not burning or not waiting emits nothing at all. It is pure: handed where
 * things are and how much time has passed, it fills a list of `Emit` records it made once and says how many it filled,
 * and the page hands those to the renderer, which moves the particles only as it draws a frame. Without it the fires
 * would be glowing ground and nothing more, and a rescue's flare would be a stack of boxes.
 *
 * The renderer's pool is a ring of `PARTICLES.capacity` and takes at most `PARTICLES.emitters` bursts a frame. The ring is
 * filled in order and a particle is overwritten when it comes round again, so what must fit is not what is alive at once
 * but everything emitted over the longest life of any stream: the flames, which live a second, cycle it as fast as they
 * are born, and would take the smoke's from under it. So the rates are small, the longest life is short, and what is
 * emitted is held by the range each stream is cut off at and by a fire's smoke thickening only up to a cap:
 * `test/effects.test.ts` holds the worst case the model allows to within the pool, by the renderer's own rule. Chance is the renderer's own
 * hash, so nothing here draws on it.
 */
import type { Emit } from 'artshape-render/game/particles';
import type { Wash } from 'artshape-render/game/wash';
import type { FirePlace } from './arena';
import { DOWNWASH, washStrength } from './downwash';
import { PATCH } from './fire';
import { HELICOPTER } from './helicopter';
import type { Level } from './mission';

/**
 * The renderer's particle pool: the ring's size, which is its own default, and how many bursts it takes a frame, which
 * is its own limit too (`emit` says no past it), so this is said here once for the page to build the renderer by.
 */
export const PARTICLES = { capacity: 32768, emitters: 128 };

type Rgb = [number, number, number];

/** What a particle of a stream looks like and does, which is the same for every particle of it. */
interface Look {
  spread: number;
  life: number;
  lifeSpread: number;
  size: number;
  growth: number;
  colour: Rgb;
  /** The colour it ages into, if it changes. */
  fade?: Rgb;
  /** Nought adds light, as a flame does; above it hides what is behind, as smoke does. */
  alpha: number;
  gravity: number;
}

/** The longest a particle of a stream lives, in seconds. */
export function longest(look: Pick<Look, 'life' | 'lifeSpread'>): number {
  return look.life * (1 + look.lifeSpread);
}

/**
 * The flames on a burning patch, two streams: a hot orange core and lighter licks over it, which add light. They are
 * only seen from near, so a patch farther than `range` from the camera has none. A camera cannot be within it of two
 * fires, which the budget's test holds.
 */
export const FLAMES = {
  range: 120,
  core: {
    rate: 45,
    spread: 2.2,
    life: 0.9,
    lifeSpread: 0.4,
    size: 1.5,
    growth: -0.95,
    colour: [1.0, 0.36, 0.06] as Rgb,
    alpha: 0,
    gravity: -0.9,
    rise: 2,
    over: 0.3,
  },
  licks: {
    rate: 25,
    spread: 1.2,
    life: 0.7,
    lifeSpread: 0.3,
    size: 1,
    growth: -0.8,
    colour: [1.0, 0.75, 0.25] as Rgb,
    alpha: 0,
    gravity: -1.2,
    rise: 3.5,
    over: 0.6,
  },
};

/** Which way the wind takes the smoke and the flare's smoke, in radians over the ground, and how fast, in metres a second. */
export const DRIFT = { yaw: 0.9 + Math.PI / 2, speed: 4, off: 2 };

/**
 * The smoke over a burning fire, dark and dense at the flames and pale as it towers. A fire sends up `perPatch` a second
 * for each patch burning up to `cap` of them, shared among its burning patches, so a fire dying down thins and a very
 * large one is no thicker than a large one. Floating things feel a strong drag in the renderer, so it rises by a
 * negative gravity, some 6 m/s at its steady speed. It is seen from afar, so its `range` is wide.
 */
export const SMOKE = {
  range: 500,
  perPatch: 25,
  cap: 8,
  spread: 1.4,
  life: 5,
  lifeSpread: 0.25,
  size: 3,
  growth: 5,
  colour: [0.16, 0.15, 0.14] as Rgb,
  fade: [0.66, 0.67, 0.7] as Rgb,
  alpha: 0.8,
  gravity: -2,
  rise: 4,
  over: 3,
};

/** The rescue's flare: orange smoke at the person's feet that pales as it swells, as far seen as a fire's. */
export const FLARE = {
  range: 500,
  rate: 30,
  spread: 0.5,
  life: 5,
  lifeSpread: 0.2,
  size: 0.9,
  growth: 1.6,
  colour: [0.85, 0.36, 0.1] as Rgb,
  fade: [0.98, 0.82, 0.68] as Rgb,
  alpha: 0.85,
  gravity: -1.4,
  out: [1.2, 0.6, 0.3],
  velocity: [0.6, 0.3, 3],
};

/**
 * A drop's spray, a heavy fall from the bucket for a short `pour`, which stops at the ground there, and the mist it
 * kicks up where it lands, which rises and spreads.
 */
export const SPRAY = {
  pour: 0.5,
  rate: 1800,
  spread: 5,
  life: 2,
  lifeSpread: 0.25,
  size: 0.6,
  growth: 1.4,
  colour: [0.48, 0.66, 0.9] as Rgb,
  alpha: 0.7,
  gravity: 1,
  fall: 7,
};
export const MIST = {
  rate: 480,
  spread: 6,
  life: 1.6,
  lifeSpread: 0.3,
  size: 2.5,
  growth: 4,
  colour: [0.62, 0.68, 0.72] as Rgb,
  alpha: 0.45,
  gravity: -0.3,
  rise: 1.5,
  over: 1,
};

/**
 * The water the rotor throws up when the hub is low over open water: a ring of spray thrown out from under the rotor,
 * and a faint mist over the water. It is full from `full` metres of hub over the water and thins to nothing at `reach`.
 * Each ring is `n` emitters set round a circle of `radius` about the point under the hub, `over` above the water's face,
 * and the circle is turned by `turn` every frame drawn, the golden angle, so the spray is a ring and not `n` streams.
 */
export const ROTOR_SPRAY = {
  reach: 16,
  full: 4,
  turn: 2.39996,
  over: 0.2,
  ring: {
    n: 12,
    radius: 4.5,
    out: 10,
    up: 4,
    rate: 75,
    spread: 3,
    life: 0.9,
    lifeSpread: 0.3,
    size: 0.35,
    growth: 1.5,
    colour: [0.92, 0.96, 1] as Rgb,
    fade: [1, 1, 1] as Rgb,
    alpha: 0.6,
    gravity: 1,
  },
  mist: {
    n: 8,
    radius: 7,
    out: 5,
    up: 1.5,
    rate: 15,
    spread: 3,
    life: 2,
    lifeSpread: 0.3,
    size: 1.4,
    growth: 3.5,
    colour: [0.9, 0.94, 0.97] as Rgb,
    fade: [1, 1, 1] as Rgb,
    alpha: 0.14,
    gravity: -0.05,
  },
};

/**
 * The rotor's air as the renderer is told it: how fast it blows at full speed, in metres a second, which smoke takes
 * nearly all of. Its reach and width are the downwash's own, and its strength goes as the trees feel it.
 */
export const WASH = { speed: 14 };

/** How many pours there can be at once, since a drop needs a scoop before it and none overlaps; more told between two frames let the oldest go. */
const POURS = 4;

/** What the effects read of a fire: how each patch is, and how many burn. A `Fire` is one. */
export interface FireView {
  states: Uint8Array;
  burning: number;
}

/** Where a person waits, and whose they are. */
export interface Place {
  id: string;
  x: number;
  y: number;
  z: number;
}

/** The people waiting to be winched up, one for each level that begins with a winch, in the levels' order. */
export function rescuePeople(levels: readonly Pick<Level, 'id' | 'steps'>[]): Place[] {
  return levels.flatMap(({ id, steps: [first] }) =>
    first.kind === 'winch' ? [{ id, x: first.x, y: first.y, z: first.z }] : [],
  );
}

/**
 * Which people are waiting, written into `out` as one or nought for each, and how many: all of them but the one whose
 * level is `going` (they are aboard) and the one being `winched` (they are on the rope).
 */
export function waitingFlares(
  people: readonly { id: string }[],
  going: string | null,
  winched: string | null,
  out: Uint8Array,
): number {
  let n = 0;
  for (let k = 0; k < people.length; k++) {
    const waiting = people[k].id !== going && people[k].id !== winched;
    out[k] = waiting ? 1 : 0;
    if (waiting) n++;
  }
  return n;
}

/**
 * What the rotor's spray reads of the helicopter: where it is, its skids' height as the helicopter's is, and the level of
 * the open water under it, `-Infinity` where there is none (land, a river).
 */
export interface Air {
  x: number;
  y: number;
  z: number;
  level: number;
}

/** What each kind of burst emitted at the last step, in particles. */
export interface Counts {
  flames: number;
  smoke: number;
  flares: number;
  spray: number;
  wash: number;
}

/** How far through a unit a source is born, so that sources that start together do not all emit on the same frame. */
const phase = (i: number) => (i * 0.6180339887498949) % 1;

const NO_WASH: readonly Wash[] = [];

export class Effects {
  /** The bursts of the last step, the first `step` returned of them; made once and written into, as are their arrays. */
  readonly records: Emit[];
  /** What each kind emitted at the last step, in particles. */
  readonly counts: Counts = { flames: 0, smoke: 0, flares: 0, spray: 0, wash: 0 };
  /** How many flares are lit: the people waiting at the last step, whether or not one was born in it. */
  flaring = 0;

  private used = 0;
  private readonly fades: Rgb[];
  /** Where each fire's patches start in the accumulators, and the accumulators and whether each source has been born yet. */
  private readonly first: Uint32Array;
  private readonly core: Float64Array;
  private readonly licks: Float64Array;
  private readonly smoke: Float64Array;
  private readonly lit: Uint8Array;
  private readonly flare: Float64Array;
  private readonly flareLit: Uint8Array;
  /** The pours: where the bucket was, the ground below it, the seconds still to pour, and the spray's and mist's accumulators. */
  private readonly pour = new Float64Array(POURS * 4);
  private readonly left = new Float64Array(POURS);
  private readonly sprayAcc = new Float64Array(POURS);
  private readonly mistAcc = new Float64Array(POURS);
  private nextPour = 0;
  /** The rotor's spray: each emitter's accumulator, the ring's then the mist's, and the turn of the circles, in frames drawn. */
  private readonly airAcc = new Float64Array(ROTOR_SPRAY.ring.n + ROTOR_SPRAY.mist.n);
  private turn = 0;
  private readonly wash_: Wash = {
    position: [0, 0, 0],
    radius: HELICOPTER.size.rotorRadius,
    speed: 0,
    reach: DOWNWASH.depth,
  };
  private readonly washes: readonly Wash[];

  constructor(
    private readonly fires: readonly FirePlace[],
    private readonly people: readonly Place[],
  ) {
    this.first = new Uint32Array(fires.length + 1);
    fires.forEach((f, k) => (this.first[k + 1] = this.first[k] + f.patches.length));
    const patches = this.first[fires.length];
    this.core = new Float64Array(patches);
    this.licks = new Float64Array(patches);
    this.smoke = new Float64Array(patches);
    this.lit = new Uint8Array(patches * 3);
    this.flare = new Float64Array(people.length);
    this.flareLit = new Uint8Array(people.length);
    this.washes = [this.wash_];
    // room for every source to burst in one frame: two flames and a smoke on each patch, a flare for each person, and the
    // spray and mist of each pour and the rotor's ring and mist
    const room = patches * 3 + people.length + POURS * 2 + ROTOR_SPRAY.ring.n + ROTOR_SPRAY.mist.n;
    this.fades = Array.from({ length: room }, (): Rgb => [0, 0, 0]);
    this.records = Array.from({ length: room }, (): Emit => ({
      position: [0, 0, 0],
      velocity: [0, 0, 0],
      spread: 0,
      count: 0,
      life: 0,
      lifeSpread: 0,
      size: 0,
      growth: 0,
      colour: [0, 0, 0],
      alpha: 0,
      gravity: 0,
      floor: 0,
    }));
  }

  /**
   * A drop told: the water falls from (x, y, z), the bucket's bottom, to the ground at `floor` under it, for a short
   * pour that the next steps carry out. More than `POURS` told before they are is a crowd: the oldest is let go.
   */
  drop(x: number, y: number, z: number, floor: number): void {
    const k = this.nextPour;
    this.nextPour = (this.nextPour + 1) % POURS;
    this.pour[k * 4] = x;
    this.pour[k * 4 + 1] = y;
    this.pour[k * 4 + 2] = z;
    this.pour[k * 4 + 3] = floor;
    this.left[k] = SPRAY.pour;
    this.sprayAcc[k] = phase(k);
    this.mistAcc[k] = phase(k + 0.5);
  }

  /**
   * The air of the rotor for the renderer: none while it idles, and otherwise one wash at its hub, written in place.
   * `h.z` is the skids' height, as the helicopter's is.
   */
  wash(h: Readonly<{ x: number; y: number; z: number; rotorSpeed: number }>): readonly Wash[] {
    const strength = washStrength(h.rotorSpeed);
    if (strength === 0) return NO_WASH;
    const w = this.wash_;
    w.position[0] = h.x;
    w.position[1] = h.y;
    w.position[2] = h.z + HELICOPTER.size.mastTop;
    w.speed = WASH.speed * strength;
    return this.washes;
  }

  /**
   * One frame of `dt` seconds drawn: the fires as `fires` say, in the order of the places, the people as `waiting` says
   * (one or nought each, in the order of the people), and the camera at `camera`. Writes this frame's bursts into
   * `records` and says how many. A step of no time emits nothing and keeps every accumulator, every pour and the last
   * `counts` as they were.
   */
  step(
    dt: number,
    fires: readonly FireView[],
    waiting: ArrayLike<number>,
    camera: readonly [number, number, number],
    air?: Readonly<Air>,
  ): number {
    this.used = 0;
    this.flaring = 0;
    for (let k = 0; k < this.people.length; k++) if (waiting[k]) this.flaring++;
    // a frame of no time, as the paused page draws sixty a second, emits nothing and leaves `counts` as the last frame
    // that moved left them, which is what the test API reads
    if (!(dt > 0)) return 0;
    const counts = this.counts;
    counts.flames = counts.smoke = counts.flares = counts.spray = counts.wash = 0;
    this.burn(dt, fires, camera);
    this.flares(dt, waiting, camera);
    this.pours(dt);
    if (air) this.rotorSpray(dt, air);
    return this.used;
  }

  /** A particle count for a source: the whole particles its accumulator has reached, taken from it. A source not born yet starts at its phase. */
  private take(acc: Float64Array, lit: Uint8Array, i: number, active: boolean, rate: number, dt: number): number {
    if (!active) {
      lit[i] = 0;
      return 0;
    }
    if (!lit[i]) {
      lit[i] = 1;
      acc[i] = phase(i);
    }
    acc[i] += rate * dt;
    const n = Math.floor(acc[i]);
    acc[i] -= n;
    return n;
  }

  /**
   * The next record, filled from a look: where it is born, how fast it goes, how many and the ground it dies on. Its
   * arrays are written in place. Past the room there is, the burst is lost; the room is for every source at once.
   */
  private put(
    look: Look,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    count: number,
    floor: number,
  ): void {
    if (this.used >= this.records.length) return;
    const r = this.records[this.used];
    r.position[0] = x;
    r.position[1] = y;
    r.position[2] = z;
    r.velocity[0] = vx;
    r.velocity[1] = vy;
    r.velocity[2] = vz;
    r.spread = look.spread;
    r.count = count;
    r.life = look.life;
    r.lifeSpread = look.lifeSpread;
    r.size = look.size;
    r.growth = look.growth;
    r.colour[0] = look.colour[0];
    r.colour[1] = look.colour[1];
    r.colour[2] = look.colour[2];
    r.alpha = look.alpha;
    r.gravity = look.gravity;
    r.floor = floor;
    if (look.fade) {
      const f = this.fades[this.used];
      f[0] = look.fade[0];
      f[1] = look.fade[1];
      f[2] = look.fade[2];
      r.fade = f;
    } else r.fade = undefined;
    this.used++;
  }

  /** The flames of every burning patch in range and the smoke of every burning fire, by the camera's distance from each. */
  private burn(dt: number, views: readonly FireView[], camera: readonly [number, number, number]): void {
    const counts = this.counts;
    const flameReach = FLAMES.range;
    const smokeReach = SMOKE.range;
    const dx = Math.cos(DRIFT.yaw),
      dy = Math.sin(DRIFT.yaw);
    for (let f = 0; f < this.fires.length; f++) {
      const view = f < views.length ? views[f] : undefined;
      const { patches } = this.fires[f];
      // a fire's smoke is shared among its burning patches, so a big fire is no thicker than the cap says
      const share = view && view.burning > 0 ? (SMOKE.perPatch * Math.min(view.burning, SMOKE.cap)) / view.burning : 0;
      for (let k = 0; k < patches.length; k++) {
        const i = this.first[f] + k;
        const p = patches[k];
        const burning = view !== undefined && view.states[k] === PATCH.burning;
        const d = Math.hypot(p.x - camera[0], p.y - camera[1], p.z - camera[2]);
        const flames = burning && d <= flameReach;
        const nCore = this.take(this.core, this.lit, i * 3, flames, FLAMES.core.rate, dt);
        if (nCore > 0) {
          const c = FLAMES.core;
          this.put(c, p.x, p.y, p.z + c.over, 0, 0, c.rise, nCore, p.z);
          counts.flames += nCore;
        }
        const nLicks = this.take(this.licks, this.lit, i * 3 + 1, flames, FLAMES.licks.rate, dt);
        if (nLicks > 0) {
          const l = FLAMES.licks;
          this.put(l, p.x, p.y, p.z + l.over, 0, 0, l.rise, nLicks, p.z);
          counts.flames += nLicks;
        }
        const nSmoke = this.take(this.smoke, this.lit, i * 3 + 2, burning && d <= smokeReach, share, dt);
        if (nSmoke > 0) {
          this.put(
            SMOKE,
            p.x + dx * DRIFT.off,
            p.y + dy * DRIFT.off,
            p.z + SMOKE.over,
            dx * DRIFT.speed,
            dy * DRIFT.speed,
            SMOKE.rise,
            nSmoke,
            -1e9,
          );
          counts.smoke += nSmoke;
        }
      }
    }
  }

  /** A flare from each person waiting in range. */
  private flares(dt: number, waiting: ArrayLike<number>, camera: readonly [number, number, number]): void {
    for (let k = 0; k < this.people.length; k++) {
      const p = this.people[k];
      const active = !!waiting[k] && Math.hypot(p.x - camera[0], p.y - camera[1], p.z - camera[2]) <= FLARE.range;
      const n = this.take(this.flare, this.flareLit, k, active, FLARE.rate, dt);
      if (n === 0) continue;
      const [ox, oy, oz] = FLARE.out;
      const [vx, vy, vz] = FLARE.velocity;
      this.put(FLARE, p.x + ox, p.y + oy, p.z + oz, vx, vy, vz, n, -1e9);
      this.counts.flares += n;
    }
  }

  /**
   * The rotor's ring of spray and its mist while the hub is within `ROTOR_SPRAY.reach` of the open water under it, at
   * a strength that is full from `full` down. The circles turn by the golden angle every frame drawn, whether or not a
   * burst is born in it, so the same frames give the same ring.
   */
  private rotorSpray(dt: number, air: Readonly<Air>): void {
    this.turn += ROTOR_SPRAY.turn;
    const { reach, full, over } = ROTOR_SPRAY;
    const above = air.z + HELICOPTER.size.mastTop - air.level;
    if (!(above <= reach)) return;
    const strength = Math.min(1, (reach - above) / (reach - full));
    let a = 0;
    for (const look of [ROTOR_SPRAY.ring, ROTOR_SPRAY.mist]) {
      for (let k = 0; k < look.n; k++, a++) {
        this.airAcc[a] += look.rate * strength * dt;
        const n = Math.floor(this.airAcc[a]);
        if (n === 0) continue;
        this.airAcc[a] -= n;
        const angle = this.turn + (2 * Math.PI * k) / look.n;
        const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
        this.put(
          look,
          air.x + cos * look.radius,
          air.y + sin * look.radius,
          air.level + over,
          cos * look.out,
          sin * look.out,
          look.up,
          n,
          -1e9,
        );
        this.counts.wash += n;
      }
    }
  }

  /** The spray and mist of each pour still going, for as much of the frame as is left of it. */
  private pours(dt: number): void {
    for (let k = 0; k < POURS; k++) {
      if (this.left[k] <= 0) continue;
      const share = Math.min(dt, this.left[k]);
      this.left[k] -= share;
      const [x, y, z, floor] = [this.pour[k * 4], this.pour[k * 4 + 1], this.pour[k * 4 + 2], this.pour[k * 4 + 3]];
      this.sprayAcc[k] += SPRAY.rate * share;
      const spray = Math.floor(this.sprayAcc[k]);
      this.sprayAcc[k] -= spray;
      if (spray > 0) {
        this.put(SPRAY, x, y, z, 0, 0, -SPRAY.fall, spray, floor);
        this.counts.spray += spray;
      }
      this.mistAcc[k] += MIST.rate * share;
      const mist = Math.floor(this.mistAcc[k]);
      this.mistAcc[k] -= mist;
      if (mist > 0) {
        this.put(MIST, x, y, floor + MIST.over, 0, 0, MIST.rise, mist, -1e9);
        this.counts.spray += mist;
      }
    }
  }
}
