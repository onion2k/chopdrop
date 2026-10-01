/**
 * What must always be true of the game, however it has been played: the
 * rules that, broken, are a bug whatever the feature was.
 *
 * The helicopter is made of numbers, inside the world's edge and between
 * the ground it stands on and the ceiling, never faster, steeper or more
 * banked than it is built to be, and never sinking through the ground it
 * stands on. The ground it says it stands on is the ground under it. The
 * clock only runs forward.
 *
 * Checked by the fuzzer after everything it does, and by the unit tests.
 * Each broken rule is a line saying what and where.
 */
import { washAt, type Wash } from './downwash';
import type { Game } from './game';
import { HELICOPTER } from './helicopter';
import type { Sway } from './sway';

/** How far past a limit a number may be before it is a broken rule: the sums are floating point. */
const TOLERANCE = 1e-9;

export function checkInvariants(game: Game): string[] {
  const out: string[] = [];
  const h = game.helicopter;
  const where = `at ${h.x.toFixed(2)},${h.y.toFixed(2)},${h.z.toFixed(2)}`;

  const fields: [string, number][] = [
    ['x', h.x],
    ['y', h.y],
    ['z', h.z],
    ['floor', h.floor],
    ['yaw', h.yaw],
    ['vx', h.vx],
    ['vy', h.vy],
    ['vz', h.vz],
    ['yawRate', h.yawRate],
    ['pitch', h.pitch],
    ['roll', h.roll],
    ['rotor', h.rotor],
    ['rotorSpeed', h.rotorSpeed],
  ];
  const notNumbers = fields.filter(([, v]) => !Number.isFinite(v)).map(([name, v]) => `${name} is ${v}`);
  if (notNumbers.length) out.push(`not a number: the helicopter's ${notNumbers.join(', ')}`);
  else {
    const { bounds } = h;
    if (
      h.x < bounds.minX - TOLERANCE ||
      h.x > bounds.maxX + TOLERANCE ||
      h.y < bounds.minY - TOLERANCE ||
      h.y > bounds.maxY + TOLERANCE
    )
      out.push(`out of bounds: the helicopter is ${where}`);
    if (h.z < h.floor - TOLERANCE || h.z > HELICOPTER.ceiling + TOLERANCE)
      out.push(
        `out of height: the helicopter is ${where}, with the ground at ${h.floor.toFixed(2)} and a ceiling of ${HELICOPTER.ceiling}`,
      );
    const under = h.floorAt(h.x, h.y);
    if (Math.abs(h.floor - under) > TOLERANCE)
      out.push(
        `standing on the wrong ground: the helicopter ${where} has its floor at ${h.floor.toFixed(2)}, and ${under.toFixed(2)} is under it`,
      );
    if (h.speed > HELICOPTER.maxSpeed + TOLERANCE)
      out.push(`too fast: the helicopter goes ${h.speed.toFixed(3)} ${where}, and the most is ${HELICOPTER.maxSpeed}`);
    if (Math.abs(h.vz) > HELICOPTER.climbSpeed + TOLERANCE)
      out.push(`too fast up or down: the helicopter climbs at ${h.vz.toFixed(3)} ${where}`);
    if (Math.abs(h.pitch) > HELICOPTER.maxPitch + TOLERANCE)
      out.push(`too steep: the helicopter's pitch is ${h.pitch.toFixed(3)} ${where}`);
    if (Math.abs(h.roll) > HELICOPTER.maxRoll + TOLERANCE)
      out.push(`too banked: the helicopter's roll is ${h.roll.toFixed(3)} ${where}`);
    if (h.landed && h.vz < 0)
      out.push(`sinking: the helicopter is on the ground ${where} and falling at ${h.vz.toFixed(3)}`);
  }

  if (!Number.isFinite(game.t) || game.t < 0) out.push(`the clock reads ${game.t}`);
  out.push(...checkSway(game.sway));
  return out;
}

/** The wash at a tree, worked out afresh for each check, which may make one: it is not run each frame. */
const wash: Wash = { x: 0, y: 0, down: 0 };

/**
 * What must hold of the trees in the downwash: no more moving than there is room for, each where the pool says it
 * is, each lean a number and within the most a tree can lean or be pressed, and none kept that has stopped and that
 * the wash it was last stepped in did not reach, which is the rule that the pool empties. The wash is the one the
 * sway was stepped in and not where the helicopter is now, which a test or a teleport may have moved since.
 */
export function checkSway(sway: Sway): string[] {
  const source = sway.source;
  const out: string[] = [];
  if (sway.count > sway.capacity) {
    out.push(`more trees moving than there is room for: ${sway.count} in a pool of ${sway.capacity}`);
    return out;
  }
  const { trees, stride } = sway.trees;
  for (let k = 0; k < sway.count; k++) {
    const t = sway.tree[k];
    if (sway.slot(t) !== k) {
      out.push(`lost its place: tree ${t} is moving in place ${k}, and the pool has it at ${sway.slot(t)}`);
      continue;
    }
    const lx = sway.leanX[k],
      ly = sway.leanY[k],
      q = sway.squash[k];
    if (![lx, ly, q, sway.leanXRate[k], sway.leanYRate[k], sway.squashRate[k]].every(Number.isFinite)) {
      out.push(`not a number: tree ${t} leans ${lx}, ${ly}, pressed ${q}`);
      continue;
    }
    if (Math.hypot(lx, ly) > sway.maxLean + TOLERANCE)
      out.push(
        `leans too far: tree ${t} leans ${Math.hypot(lx, ly).toFixed(3)}, and the most is ${sway.maxLean.toFixed(3)}`,
      );
    if (Math.abs(q) > sway.maxSquash + TOLERANCE)
      out.push(`pressed too far: tree ${t} is pressed ${q.toFixed(3)}, and the most is ${sway.maxSquash.toFixed(3)}`);
    const o = t * stride;
    washAt(source, trees[o + 1], trees[o + 2], trees[o + 3], wash);
    if (wash.x === 0 && wash.y === 0 && wash.down === 0 && sway.still(k))
      out.push(`kept: tree ${t} is still and out of the wash, and is held in the pool`);
  }
  return out;
}
