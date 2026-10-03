/**
 * What must always be true of the game, however it has been played: the
 * rules that, broken, are a bug whatever the feature was.
 *
 * The helicopter is made of numbers, inside the world's edge and between
 * the ground it stands on and the ceiling, never faster, steeper or more
 * banked than it is built to be, and never sinking through the ground it
 * stands on. The ground it says it stands on is the ground under it. The
 * clock only runs forward. With nothing going the mission reads as nothing;
 * a level going is at one of its steps past the first, and nothing starts
 * while it is. A best time is a time, and never slower than the level was
 * just done in. The helicopter is never inside anything solid. The tank fills only in the scoop's window over open
 * water, and each fire's patches are in a state it knows, counted right, and a fire that is not going is not left off
 * its start for longer than it waits to be lit again.
 *
 * Checked by the fuzzer after everything it does, and by the unit tests.
 * Each broken rule is a line saying what and where.
 */
import { CHASE, type ChaseCamera } from './chase';
import { washAt, type Wash } from './downwash';
import type { Game } from './game';
import { RADAR } from './finds';
import { FIRE, PATCH } from './fire';
import { HELICOPTER } from './helicopter';
import { TREE_STRIDE } from './island';
import type { TreeSize } from './meshes';
import { fireOf, inWindow, loadFor, onPad, type Step } from './mission';
import type { Sway } from './sway';
import { SCOOP, inScoop } from './water';

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
  out.push(...checkMission(game));
  out.push(...checkProgress(game));
  out.push(...checkSolids(game));
  out.push(...checkCollection(game));
  out.push(...checkFinds(game));
  out.push(...checkTank(game));
  out.push(...checkFires(game));
  return out;
}

/**
 * What must hold of the tank: its filling is a number from nothing to short of a full scoop, and above nothing only
 * with the tank not full and the helicopter in the scoop's window over open water, which is worked out here from the
 * helicopter and the island's water and not from anything the tank says of itself. The helicopter is read as it is now,
 * which is where the tank last stepped it unless a test or a teleport has moved it since.
 */
export function checkTank(game: Game): string[] {
  const { tank, helicopter: h } = game;
  if (!Number.isFinite(tank.filling) || tank.filling < 0 || tank.filling >= SCOOP.time)
    return [`the tank's filling reads ${tank.filling}, and runs from 0 to short of ${SCOOP.time}`];
  if (!(tank.filling > 0)) return [];
  if (tank.full) return [`the tank is full and filling: ${tank.filling.toFixed(3)} s of a scoop`];
  if (!inScoop(h, game.water.levelAt(h.x, h.y), h.speed))
    return [
      `the tank is filling, and the helicopter is not in the scoop's window: ${tank.filling.toFixed(3)} s with it ${h.height.toFixed(2)} up at ${h.speed.toFixed(2)} m/s${h.landed ? ' landed' : ''}`,
    ];
  return [];
}

/**
 * What must hold of the fires: each patch is in a state the game knows; the burning count is the patches burning and
 * no more than the fire has; a fire that is not going is lit again at its start once it has waited long enough (so
 * until then it may be off it, and after that it is not); and a fire level going has its fire burning, since it ends
 * the step none does.
 */
export function checkFires(game: Game): string[] {
  const out: string[] = [];
  const level = game.mission.level;
  let going: string | null = null;
  if (level) for (const step of level.steps) going ??= fireOf(step);
  for (const fire of game.fires) {
    const { id, states } = fire;
    let burning = 0;
    let known = true;
    for (let k = 0; k < states.length; k++) {
      const s = states[k];
      if (s === PATCH.burning) burning++;
      else if (s !== PATCH.unburnt && s !== PATCH.out) {
        out.push(`${id} has patch ${k} in no known state: ${s}`);
        known = false;
      }
    }
    if (!known) continue;
    if (fire.burning !== burning) out.push(`${id} counts ${fire.burning} burning, and ${burning} are`);
    if (fire.burning > states.length || fire.burning < 0)
      out.push(`${id} burns ${fire.burning} of ${states.length} patches`);
    if (id === going) {
      if (burning === 0) out.push(`${id} is going, and none of it burns`);
    } else if (!fire.atStart && !(fire.quiet < FIRE.relight + TOLERANCE))
      out.push(
        `${id} is not going and has been off its start for ${fire.quiet.toFixed(2)} s, and it is lit again after ${FIRE.relight}`,
      );
  }
  return out;
}

/** What must hold of the solids: the helicopter is never inside one, its reach never past touching a ring's tube or a block. */
export function checkSolids(game: Game): string[] {
  const { depth, what } = game.solids.inside(game.helicopter);
  if (depth <= TOLERANCE) return [];
  return [`the helicopter is inside ${what}: its reach ${depth.toFixed(3)} past touching it`];
}

/**
 * What must hold of the structures collected: each one is a structure the game has, or one the save brought, as a later
 * game's save would; none is collected twice; and no more are counted than the game has. That what is collected only
 * grows within a game needs a history, and is held by the fuzzer, which has one.
 */
export function checkCollection(game: Game): string[] {
  const out: string[] = [];
  const { collection } = game;
  const seen = new Set<string>();
  for (const id of game.progress.collected) {
    if (seen.has(id)) out.push(`${id} is collected twice`);
    seen.add(id);
    if (!collection.brought.has(id) && !collection.collectibles.some((c) => c.id === id))
      out.push(`${id} is collected, and is no structure of the game's, nor one the save brought`);
  }
  if (!Number.isInteger(collection.count) || collection.count < 0 || collection.count > collection.collectibles.length)
    out.push(`${collection.count} collected, and there are only ${collection.collectibles.length}`);
  return out;
}

/**
 * What must hold of the packages found: each one is a package the game has, or one the save brought; none is found
 * twice; no more are counted than the game has; and the radar hears nothing beyond its range and exactly the nearest
 * package not yet found within it, never one that is found. That what is found only grows within a game needs a
 * history, and is held by the fuzzer. The radar is held to where the helicopter was when it last heard, not where it is
 * now, which a test or a teleport may have moved since.
 */
export function checkFinds(game: Game): string[] {
  const out: string[] = [];
  const { finds } = game;
  const seen = new Set<string>();
  for (const id of game.progress.found) {
    if (seen.has(id)) out.push(`${id} is found twice`);
    seen.add(id);
    if (!finds.brought.has(id) && !finds.places.some((p) => p.id === id))
      out.push(`${id} is found, and is no package of the game's, nor one the save brought`);
  }
  if (!Number.isInteger(finds.count) || finds.count < 0 || finds.count > finds.places.length)
    out.push(`${finds.count} found, and there are only ${finds.places.length}`);
  const { nearest } = finds;
  if (!Number.isFinite(nearest) || nearest < -1 || nearest > RADAR.range + TOLERANCE) {
    out.push(`the radar hears a package ${nearest.toFixed(2)} away, and its range is ${RADAR.range}`);
    return out;
  }
  let expected = -1;
  for (const p of finds.places) {
    if (finds.has(p.id)) continue;
    const d = Math.hypot(p.x - finds.heardX, p.y - finds.heardY);
    if (d <= RADAR.range && (expected < 0 || d < expected)) expected = d;
  }
  if (Math.abs(nearest - expected) > 1e-6) {
    const foundAt = finds.places.find(
      (p) => finds.has(p.id) && Math.abs(Math.hypot(p.x - finds.heardX, p.y - finds.heardY) - nearest) <= 1e-6,
    );
    if (foundAt) out.push(`the radar hears the package it found, ${nearest.toFixed(2)} away: ${foundAt.id}`);
    else if (nearest < 0) out.push(`the radar hears nothing, and a package is ${expected.toFixed(2)} away`);
    else out.push(`the radar hears ${nearest.toFixed(2)} away, and the nearest not found is ${expected.toFixed(2)}`);
  }
  return out;
}

/**
 * What must hold of the player's best times: each one is a time, and the last level done has a time kept, and one no
 * slower than it was just done in, since a best time is only ever lowered. A level that ended as it began, which has no
 * time, is not held to one.
 */
export function checkProgress(game: Game): string[] {
  const out: string[] = [];
  for (const [id, seconds] of game.progress.best)
    if (!Number.isFinite(seconds) || seconds <= 0) out.push(`the best time on ${id} is ${seconds}, not a time`);
  const { last } = game;
  if (!last || !(last.seconds > 0)) return out;
  const best = game.progress.best.get(last.id);
  if (best === undefined) out.push(`${last.id} is done, and no time is kept for it`);
  else if (best > last.seconds + TOLERANCE)
    out.push(
      `the best time on ${last.id} is ${best.toFixed(3)} s, slower than the ${last.seconds.toFixed(3)} s it was just done in`,
    );
  return out;
}

/**
 * What must hold of the level going, or of nothing going. With nothing going, the mission reads as nothing: no step,
 * no pad or place wanted, no clock and no loading. With a level going, it is past its first step, which began it, and
 * short of its last, which ends it; the pad it wants is one of the island's; its loading is a number from nothing to
 * short of a full load, and runs only while the helicopter is landed on the pad it is wanted on; and its clock is a
 * number. A winch step's loading likewise runs only while the helicopter is in the window over the person, and short of
 * the hold. The starts' loader is a number from nothing to short of a full load (a winch's hold, in a rescue's window,
 * and a parcel's load otherwise), and runs only with nothing going and the helicopter landed on a pickup pad that is
 * not blocked or in the window of some rescue, since nothing starts while a level is going, nor from the pad a level
 * has just ended on.
 */
export function checkMission(game: Game): string[] {
  const out: string[] = [];
  const d = game.mission;
  const { starts } = game;
  const level = d.level;
  const winching = inSomeWindow(game);
  const startLimit = loadFor(winching ?? { kind: 'land', pad: 0 });
  if (!Number.isFinite(starts.loading) || starts.loading < 0 || starts.loading >= startLimit)
    out.push(`the starts' loading reads ${starts.loading}, and runs from 0 to short of ${startLimit}`);
  else if (starts.loading > 0) {
    if (level) out.push(`the starts are loading while a level is going: ${starts.loading.toFixed(3)}`);
    else if (!winching && !onPickupPad(game))
      out.push(
        `the starts' loading runs off a pickup pad or out of a rescue's window: ${starts.loading.toFixed(3)} with the helicopter not landed on a pickup pad that is not blocked, nor in a window`,
      );
  }
  if (!level) {
    if (d.next !== 0) out.push(`nothing is going, and the level is at step ${d.next}`);
    if (d.target !== -1) out.push(`nothing is going, and it wants pad ${d.target}`);
    if (d.goal !== null) out.push(`nothing is going, and it wants somewhere`);
    if (d.time !== 0) out.push(`nothing is going, and the clock reads ${d.time}`);
    if (d.loading !== 0) out.push(`nothing is going, and the loading reads ${d.loading}`);
    return out;
  }
  const steps = level.steps.length;
  if (!Number.isInteger(d.next) || d.next < 1 || d.next >= steps)
    return [...out, `no such step: the level is at step ${d.next} of ${steps}`];
  if (d.target < -1 || d.target >= game.island.pads.length || !Number.isInteger(d.target))
    return [...out, `no such pad: the level wants pad ${d.target} of ${game.island.pads.length}`];
  const step = d.current!;
  const limit = loadFor(step);
  if (!Number.isFinite(d.loading) || d.loading < 0 || d.loading >= limit)
    out.push(`the loading reads ${d.loading}, and runs from 0 to short of ${limit}`);
  else if (d.loading > 0 && step.kind === 'winch') {
    if (!inWindow(game.helicopter, step, groundAt(game)))
      out.push(`the loading runs out of the winch's window: ${d.loading.toFixed(3)} with the helicopter not in it`);
  } else if (d.loading > 0 && (d.target < 0 || !onPad(game.helicopter, game.island.pads[d.target])))
    out.push(`the loading runs off the pad: ${d.loading.toFixed(3)} with the helicopter not landed on pad ${d.target}`);
  if (!Number.isFinite(d.time) || d.time < 0) out.push(`the level's clock reads ${d.time}`);
  return out;
}

/** The height of the ground at a point, as the game's island has it, which a winch's window is measured over. */
function groundAt(game: Game): (x: number, y: number) => number {
  return (x, y) => game.island.ground.heightAt(x, y);
}

/** The winch the helicopter is in the window of, of some level that begins with one; null for none. Not run each frame. */
function inSomeWindow(game: Game): Step | null {
  const at = groundAt(game);
  for (const level of game.levels) {
    const first = level.steps[0];
    if (first.kind === 'winch' && inWindow(game.helicopter, first, at)) return first;
  }
  return null;
}

/** Whether the helicopter is landed on a pad some level begins from, which is not the one blocked. */
function onPickupPad(game: Game): boolean {
  const { pads } = game.island;
  return game.levels.some((level) => {
    const first = level.steps[0];
    return first.kind === 'pickup' && first.pad !== game.starts.blocked && onPad(game.helicopter, pads[first.pad]);
  });
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

/**
 * What must hold of the chase camera over the island: chasing, it is never under the ground nor inside a tree's
 * crown, leaned as the sway has it, nor nearer a structure than its near plane, which would cut it open. A crown is
 * worked out here from the trees themselves (how tall each kind stands and how far it spreads, in `sizes` by kind),
 * not from the canopy the camera keeps over, so a canopy that runs under a crown is caught; and a structure from its
 * own box, not from the distances the camera keeps off. A parked camera is the tests' own, and is not held to it.
 */
export function checkCamera(camera: ChaseCamera, game: Game, sizes: readonly TreeSize[]): string[] {
  if (camera.mode !== 'chase') return [];
  const p = camera.position;
  if (!p.every(Number.isFinite)) return [`not a number: the camera is at ${p.join(', ')}`];
  const where = `at ${p.map((v) => v.toFixed(2)).join(',')}`;
  const out: string[] = [];
  const lowest = game.island.ground.heightAt(p[0], p[1]) + CHASE.minHeight;
  if (p[2] < lowest - TOLERANCE) out.push(`under the ground: the camera ${where} is under ${lowest.toFixed(2)}`);
  const { trees, treeCount } = game.island;
  const { sway } = game;
  for (let t = 0; t < treeCount; t++) {
    const o = t * TREE_STRIDE;
    const { top, radius } = sizes[trees[o]];
    const s = trees[o + 5];
    const k = sway.slot(t);
    const lean = k >= 0 ? Math.hypot(sway.leanX[k], sway.leanY[k]) : 0;
    const d = Math.hypot(p[0] - trees[o + 1], p[1] - trees[o + 2]);
    if (d < (radius + lean * top) * s && p[2] < trees[o + 3] + top * s) {
      out.push(
        `in a crown: the camera ${where} is inside tree ${t}, whose top is at ${(trees[o + 3] + top * s).toFixed(2)}`,
      );
      break;
    }
  }
  for (const block of game.solids.blocks) {
    // in the block's own frame: along it, across it, and up from its foot, and how far outside it each way
    const c = Math.cos(block.yaw),
      s = Math.sin(block.yaw);
    const along = (p[0] - block.x) * c + (p[1] - block.y) * s;
    const across = -(p[0] - block.x) * s + (p[1] - block.y) * c;
    const up = p[2] - block.z;
    const off = Math.hypot(
      Math.max(0, Math.abs(along) - block.length / 2),
      Math.max(0, Math.abs(across) - block.width / 2),
      Math.max(0, -up, up - block.height),
    );
    if (off < CHASE.near - TOLERANCE)
      out.push(`in a structure: the camera ${where} is ${off.toFixed(2)} from ${block.name}, nearer than it draws`);
  }
  return out;
}
