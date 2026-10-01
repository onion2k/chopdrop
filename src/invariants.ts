/**
 * What must always be true of the game, however it has been played: the
 * rules that, broken, are a bug whatever the feature was.
 *
 * Every body is a number and out of the rock. The floor has its balls, no
 * more and no fewer. The bank is a whole number that only ever grew. The
 * sled is on the floor.
 *
 * Checked by the fuzzer after everything it does, by the test API on asking,
 * and by the unit tests. Each broken rule is a line saying what and where.
 */
import { BALLS, FLOOR, KINDS, KIND_NAME, onFloor } from './arena';
import type { Game } from './game';

/** How many broken rules of one sort are reported before the rest are only counted. */
const EACH = 3;

export function checkInvariants(game: Game): string[] {
  const out: string[] = [];
  const { world, sled, progress } = game;
  const report = (sort: string, found: string[]) => {
    if (!found.length) return;
    out.push(...found.slice(0, EACH).map((f) => `${sort}: ${f}`));
    if (found.length > EACH) out.push(`${sort}: and ${found.length - EACH} more`);
  };
  const at = (i: number) =>
    `${KIND_NAME[world.kind[i]] ?? `kind ${world.kind[i]}`} ${i} at ${world.x[i].toFixed(1)},${world.y[i].toFixed(1)},${world.z[i].toFixed(1)}`;

  const notNumbers: string[] = [],
    buried: string[] = [];
  let live = 0;
  for (let i = 0; i < world.count; i++) {
    if (!world.alive[i]) continue;
    live++;
    if (world.kind[i] >= KINDS) {
      notNumbers.push(`slot ${i} is of no kind (${world.kind[i]})`);
      continue;
    }
    const values = [world.x[i], world.y[i], world.z[i], world.vx[i], world.vy[i], world.vz[i]];
    if (!values.every(Number.isFinite)) notNumbers.push(at(i));
    else if (!world.carried[i] && !onFloor(world.solid, world.x[i], world.y[i])) buried.push(at(i));
  }
  report('not a number', notNumbers);
  report('in the rock', buried);
  if (live !== world.live) out.push(`the world counts ${world.live} live, and has ${live}`);
  if (live !== BALLS) out.push(`the floor has ${live} balls, not ${BALLS}`);

  const { bank, banked } = progress.save;
  if (!Number.isInteger(bank) || bank < 0) out.push(`the bank is ${bank}`);
  if (!Number.isInteger(banked) || banked < bank) out.push(`banked ${banked} in all, with ${bank} in the bank`);

  if (![sled.x, sled.y, sled.yaw, sled.speed].every(Number.isFinite))
    out.push(`the sled is at ${sled.x},${sled.y} facing ${sled.yaw} at ${sled.speed}`);
  else if (sled.x < FLOOR.minX || sled.x > FLOOR.maxX || sled.y < FLOOR.minY || sled.y > FLOOR.maxY)
    out.push(`the sled is off the floor at ${sled.x.toFixed(1)},${sled.y.toFixed(1)}`);
  return out;
}
