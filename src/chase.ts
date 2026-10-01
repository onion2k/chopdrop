/**
 * The camera rig: where the camera is and what it looks at, worked out
 * without the renderer. It follows the helicopter from behind and above,
 * easing after it so a turn is felt, or it is parked for a fixed view of
 * the island, which is what the tests' pictures and the perf gate's
 * standard view are taken from. It is handed the height of the ground, so
 * it keeps above the land it flies over and a parked view sits on it, and
 * the canopy, so it rides over a wood and never sits inside a tree.
 *
 * It is stepped with the game's fixed step and nothing else, so the same
 * flight gives the same pictures every run. Its two points are written in
 * place: the page hands them to the camera once, and nothing is made each
 * frame.
 */

export type Point = [number, number, number];

/** The height of the ground at a point, which the camera keeps above. */
export interface Heights {
  heightAt(x: number, y: number): number;
}

/** Ground that is level with the sea, for a camera that is not handed any. */
const LEVEL: Heights = { heightAt: () => 0 };

/** No trees, for a camera that is not handed any. */
const BARE: Heights = { heightAt: () => -Infinity };

/** What it follows. */
export interface Followed {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** A fixed view of a point: from `azimuth` round, `polar` down from straight above, `radius` away. */
export interface View {
  azimuth?: number;
  polar?: number;
  radius?: number;
}

/** Where it sits and how it moves. Units are world units, radians and degrees as marked; rates are per second. */
export const CHASE = {
  /** How far behind, and above, it settles. */
  back: 15,
  up: 6.5,
  /** The point it looks at: this far ahead of the helicopter, and this far above its skids. */
  ahead: 5,
  lookUp: 1.5,
  /** How quickly it closes on where it would settle, and its aim on what it looks at. */
  ease: 4,
  aimEase: 8,
  /** The lowest it goes above the ground under it, so it never looks up from under the land. */
  minHeight: 1.5,
  /** How far over the treetops it keeps: more than its near plane of 2, so a crown under it is never cut open. */
  overTrees: 2.5,
  /**
   * How far past the helicopter it looks along its way for crowns to keep over as it settles, and at how many points:
   * from where it settles to there is what it crosses in the next eight tenths of a second at top speed, so it rises
   * before a crown and not at it, and is held up against one only by the last few hundredths.
   */
  lookAhead: 5,
  lookPoints: 10,
  /** The view taken when parked, for whatever a caller leaves out. */
  park: { azimuth: -Math.PI / 2, polar: 0.95, radius: 90 },
  /** The vertical field of view at a screen as wide as it is tall or wider, and the most it widens to on a narrow one, in degrees. */
  fov: 40,
  maxFov: 75,
};

export class ChaseCamera {
  readonly position: Point = [0, 0, 0];
  readonly target: Point = [0, 0, 0];
  /** Following the helicopter, or held at a fixed view until told to chase again. */
  mode: 'chase' | 'parked' = 'chase';

  /** Following over `ground`, which is flat at sea level unless it is told, and over the trees in `canopy`, if any. */
  constructor(
    private readonly ground: Heights = LEVEL,
    private readonly canopy: Heights = BARE,
  ) {}

  /** One step of `dt` seconds after `f`, when chasing; nothing, when parked. */
  step(dt: number, f: Followed): void {
    if (this.mode === 'parked') return;
    const c = Math.cos(f.yaw),
      s = Math.sin(f.yaw);
    const k = 1 - Math.exp(-CHASE.ease * dt);
    const a = 1 - Math.exp(-CHASE.aimEase * dt);
    const p = this.position,
      t = this.target;
    p[0] += (f.x - c * CHASE.back - p[0]) * k;
    p[1] += (f.y - s * CHASE.back - p[1]) * k;
    p[2] += (this.settleHeight(f, f.x - c * CHASE.back, f.y - s * CHASE.back) - p[2]) * k;
    t[0] += (f.x + c * CHASE.ahead - t[0]) * a;
    t[1] += (f.y + s * CHASE.ahead - t[1]) * a;
    t[2] += (f.z + CHASE.lookUp - t[2]) * a;
    p[2] = Math.max(this.lowestAt(p[0], p[1]), p[2]);
  }

  /** Straight to where it would settle behind `f`, and chasing it from now on. */
  snap(f: Followed): void {
    this.mode = 'chase';
    const c = Math.cos(f.yaw),
      s = Math.sin(f.yaw);
    const p = this.position,
      t = this.target;
    p[0] = f.x - c * CHASE.back;
    p[1] = f.y - s * CHASE.back;
    p[2] = this.settleHeight(f, p[0], p[1]);
    t[0] = f.x + c * CHASE.ahead;
    t[1] = f.y + s * CHASE.ahead;
    t[2] = f.z + CHASE.lookUp;
  }

  /** Held looking at the ground at (x, y) from a fixed view, until `snap`. */
  park(x: number, y: number, view: View = {}): void {
    this.mode = 'parked';
    const a = view.azimuth ?? CHASE.park.azimuth;
    const polar = view.polar ?? CHASE.park.polar;
    const r = view.radius ?? CHASE.park.radius;
    const p = this.position,
      t = this.target;
    t[0] = x;
    t[1] = y;
    t[2] = this.ground.heightAt(x, y);
    p[0] = x + r * Math.sin(polar) * Math.cos(a);
    p[1] = y + r * Math.sin(polar) * Math.sin(a);
    p[2] = t[2] + r * Math.cos(polar);
  }

  /**
   * Where it would settle in height at (x, y) behind `f`: above it, never lower than the land and the trees there
   * allow, and over the crowns along its way from there to `lookAhead` past it, which it will cross before long.
   */
  private settleHeight(f: Followed, x: number, y: number): number {
    let h = Math.max(this.lowestAt(x, y), f.z + CHASE.up);
    const ax = f.x + Math.cos(f.yaw) * CHASE.lookAhead,
      ay = f.y + Math.sin(f.yaw) * CHASE.lookAhead;
    for (let k = 1; k <= CHASE.lookPoints; k++) {
      const t = k / CHASE.lookPoints;
      h = Math.max(h, this.canopy.heightAt(x + (ax - x) * t, y + (ay - y) * t) + CHASE.overTrees);
    }
    return h;
  }

  /** The lowest it may be at (x, y): over the ground there, and over the treetops, so it is never in the land nor in a tree. */
  private lowestAt(x: number, y: number): number {
    return Math.max(this.ground.heightAt(x, y) + CHASE.minHeight, this.canopy.heightAt(x, y) + CHASE.overTrees);
  }
}

/** The vertical field of view, in degrees, for a screen `aspect` wide to its height: wider on a narrow screen, so the sides are not lost. */
export function fovFor(aspect: number): number {
  if (aspect >= 1) return CHASE.fov;
  const half = (CHASE.fov * Math.PI) / 360;
  const fov = (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI;
  return Math.min(CHASE.maxFov, fov);
}
