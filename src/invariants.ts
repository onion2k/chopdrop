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
import type { Game } from './game';
import { HELICOPTER } from './helicopter';

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
  return out;
}
