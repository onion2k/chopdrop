/**
 * The sled driven by the game itself: for measuring how the game plays
 * without a person at the controls. It picks a ball, goes round it to the
 * far side from the hole, lines up, turns to face it, and drives it in;
 * then the next.
 *
 * Everything that holds the game to a figure — the pace gate, the
 * determinism check, the leak watch — plays through this, so it is a
 * measuring instrument first: it must get about, and not get stuck. A ball
 * it cannot get behind, or has spent too long on, is left alone for a while
 * and another taken.
 *
 * It is handed the game, and knows nothing of the page.
 */
import { FLOOR, HOLE, KIND_RADIUS } from './arena';
import type { Game } from './game';
import { SLED, type Drive } from './sled';

/** How far behind a ball, on the line from the hole, it lines up; and how near it must get to that spot. */
const RUN_UP = 6,
  LINED_UP = 2;
/** How far to the side of a ball it passes on the way round. */
const BESIDE = 5;
/** How often it looks up from what it is doing to think again, in seconds, and how long it gives one ball. */
const PLAN_EVERY = 0.25,
  GIVE_UP = 12;
/** How square on to the ball it has to be facing before it pushes, in radians. */
const AIMED = 0.12;
/** How long a ball given up on is left alone, in seconds. */
const SHUN_FOR = 20;
/** How far in from the floor's edge the sled can actually get: what `Sled` holds it to, and a little. */
const REACH = Math.hypot(SLED.half[0], SLED.half[1]) + Math.max(...KIND_RADIUS) * 2 + 1;

export class Autopilot {
  /** Which ball is being taken to the hole, or -1 between balls. */
  ball = -1;
  /** The balls given up on, and when each may be tried again; emptied as each comes due. */
  readonly shunned = new Map<number, number>();
  private phase: 'around' | 'lineUp' | 'aim' | 'push' = 'around';
  private planAt = 0;
  private since = 0;
  private target: [number, number] = [0, 0];
  /** Which way to face to push the ball at the hole, while aiming. */
  private facing = 0;

  constructor(readonly game: Game) {}

  /** One frame: think if it is time to, then drive. */
  step(dt: number) {
    const { game } = this;
    if (game.t >= this.planAt) {
      this.planAt = game.t + PLAN_EVERY;
      this.plan();
    }
    game.step(dt, this.drive());
  }

  private plan() {
    const { world, sled, t } = this.game;
    for (const [slot, until] of this.shunned) if (t >= until) this.shunned.delete(slot);
    // a ball is done with when it is gone, or has taken too long
    if (this.ball >= 0 && !world.alive[this.ball]) this.ball = -1;
    else if (this.ball >= 0 && t - this.since > GIVE_UP) {
      this.shunned.set(this.ball, t + SHUN_FOR);
      this.ball = -1;
    }
    if (this.ball < 0) {
      this.ball = this.pick();
      this.since = t;
      this.phase = 'around';
      if (this.ball < 0) return;
    }
    const bx = world.x[this.ball],
      by = world.y[this.ball];
    const away = Math.hypot(bx - HOLE.x, by - HOLE.y) || 1;
    // out from the hole through the ball: the run-up is along it, and the push is back down it;
    // for a ball by the wall, the nearest turn of that line the sled can get behind
    const [ux, uy] = pushLine(bx, by);
    const runUp = onFloor(bx + ux * RUN_UP, by + uy * RUN_UP);
    if (this.phase === 'around') {
      // on the hole's side of the ball: pass it on whichever side the sled is already nearer
      const side = (sled.x - bx) * -uy + (sled.y - by) * ux < 0 ? -1 : 1;
      const behind = (sled.x - bx) * ux + (sled.y - by) * uy > RUN_UP * 0.5;
      if (behind) this.phase = 'lineUp';
      else {
        this.target = onFloor(bx - uy * BESIDE * side, by + ux * BESIDE * side);
        if (Math.hypot(sled.x - this.target[0], sled.y - this.target[1]) < LINED_UP) this.phase = 'lineUp';
      }
    }
    if (this.phase === 'lineUp') {
      this.target = runUp;
      if (Math.hypot(sled.x - runUp[0], sled.y - runUp[1]) < LINED_UP) this.phase = 'aim';
    }
    if (this.phase === 'aim') {
      // stopped, turning to face the ball and the hole beyond it
      this.facing = Math.atan2(by - sled.y, bx - sled.x);
      if (Math.abs(turn(this.facing - sled.yaw)) < AIMED) this.phase = 'push';
    }
    if (this.phase === 'push') {
      // down the line the run-up was on, which is at the hole unless the ball was by the wall
      this.target = [bx - ux * away, by - uy * away];
      const c = Math.cos(sled.yaw),
        s = Math.sin(sled.yaw);
      const ahead = (bx - sled.x) * c + (by - sled.y) * s,
        aside = -(bx - sled.x) * s + (by - sled.y) * c;
      // the ball off the front of the sled: round again
      if (ahead < 0 || Math.abs(aside) > SLED.half[1]) this.phase = 'around';
      // at the rim, or the ball is over it: on its way in; the next one
      if (Math.hypot(sled.x - HOLE.x, sled.y - HOLE.y) < HOLE.radius + 2 || away < HOLE.radius) this.ball = -1;
    }
  }

  /** The ball whose run-up spot is nearest the sled, a ball it can get straight behind before one by the wall, leaving out the shunned. */
  private pick(): number {
    const { world, sled } = this.game;
    let best = -1,
      near = Infinity;
    for (let i = 0; i < world.count; i++) {
      if (!world.alive[i] || this.shunned.has(i)) continue;
      const [ux, uy, turned] = pushLine(world.x[i], world.y[i]);
      const [rx, ry] = onFloor(world.x[i] + ux * RUN_UP, world.y[i] + uy * RUN_UP);
      const d = Math.hypot(rx - sled.x, ry - sled.y) + (turned ? 1000 : 0);
      if (d < near) {
        near = d;
        best = i;
      }
    }
    return best;
  }

  /** Toward the target: turn to face it, and go as fast as the turn and the distance left allow. */
  private drive(): Drive {
    const { sled } = this.game;
    if (this.ball < 0) return { throttle: 0, steer: 0 };
    if (this.phase === 'aim')
      return { throttle: 0, steer: Math.max(-1, Math.min(1, turn(this.facing - sled.yaw) * 3)) };
    const diff = turn(Math.atan2(this.target[1] - sled.y, this.target[0] - sled.x) - sled.yaw);
    const steer = Math.max(-1, Math.min(1, diff * 2.5));
    if (this.phase === 'push') return { throttle: 1, steer };
    const left = Math.hypot(this.target[0] - sled.x, this.target[1] - sled.y);
    const throttle = Math.abs(diff) < 0.6 ? Math.max(0.35, Math.min(1, left / 8)) : Math.abs(diff) < 1.8 ? 0.35 : 0;
    return { throttle, steer };
  }
}

/** An angle brought within a half turn either way. */
function turn(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Which way to push a ball, as the unit line out from the hole through it:
 * straight, if the sled can get behind it on that line, or else the
 * nearest turn of it either way whose run-up is on the floor, and whether
 * it had to turn. A ball by the wall is pushed along it and off it, which
 * is not the hole, but is out of the corner it would otherwise stay in.
 */
function pushLine(bx: number, by: number): [number, number, boolean] {
  const away = Math.hypot(bx - HOLE.x, by - HOLE.y) || 1;
  const a = Math.atan2(by - HOLE.y, bx - HOLE.x);
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
    const ux = Math.cos(a + turn),
      uy = Math.sin(a + turn);
    const [rx, ry] = onFloor(bx + ux * RUN_UP, by + uy * RUN_UP);
    if (Math.hypot(rx - (bx + ux * RUN_UP), ry - (by + uy * RUN_UP)) < 0.5) return [ux, uy, turn !== 0];
  }
  return [(bx - HOLE.x) / away, (by - HOLE.y) / away, true];
}

/** A point the sled can actually reach: the same one, pulled in from the floor's edge. */
function onFloor(x: number, y: number): [number, number] {
  return [
    Math.max(FLOOR.minX + REACH, Math.min(FLOOR.maxX - REACH, x)),
    Math.max(FLOOR.minY + REACH, Math.min(FLOOR.maxY - REACH, y)),
  ];
}
