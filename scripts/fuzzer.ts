/**
 * The game played by a monkey: the real game, without the picture, driven
 * at random and made to do at random everything a player can make happen —
 * flying about, letting go and sinking, hovering by tapping the lift,
 * climbing to the ceiling, landing, being somewhere
 * else, taking off from a pad, flying out to the edge of the world, up at a
 * hill, down onto a pad and low over a wood, bowing its trees — with the
 * chase camera following it as the page has it, and checked after every few frames for anything that must always
 * hold and does not (`invariants.ts`), and for anything thrown.
 *
 * The island is big and tall, so the monkey is put where the action is
 * rather than left to find it: heights are asked for above the ground
 * under it, and the runs start near what they run at.
 *
 * Only what a player could do. A monkey that did what no player can would
 * find bugs no player will. A new thing a player can do gets an action here.
 *
 * From a seed, so a failure can be played again exactly: `npm run fuzz --
 * --seed N` does, and prints what was done before it went wrong.
 */
import { Game } from '../src/game';
import { HELICOPTER, HOVER_LIFT, IDLE, type Controls } from '../src/helicopter';
import { ChaseCamera } from '../src/chase';
import { checkCamera, checkInvariants } from '../src/invariants';
import { TREE_STRIDE } from '../src/island';
import { TREE_KINDS } from '../src/arena';
import { treeSize } from '../src/meshes';
import { seeded } from '../src/random';

const DT = 1 / 60;
/** How many frames between checks, when nothing has just been done. */
const CHECK_EVERY = 10;
/** How many of the last things done a failure reports. */
const LOG_TAIL = 25;

export interface FuzzFailure {
  seed: number;
  frame: number;
  problems: string[];
  /** The last things done before it, oldest first. */
  log: string[];
}

export interface FuzzResult {
  seed: number;
  frames: number;
  failure: FuzzFailure | null;
  /** How often each thing was done, and each thing seen to happen: to see that the monkey got about. */
  done: Record<string, number>;
  happened: Record<string, number>;
}

/** Play `frames` frames of the game at random from `seed`. */
export function fuzz(seed: number, frames: number): FuzzResult {
  // the monkey's own chance, apart from the game's, so what it decides does not shift what the game does
  const random = seeded(seed * 7 + 1);
  const happened: Record<string, number> = {};
  const done: Record<string, number> = {};
  const count = (into: Record<string, number>, key: string) => (into[key] = (into[key] ?? 0) + 1);
  const log: string[] = [];
  let frame = 0;
  const fail = (problems: string[]): FuzzResult => ({
    seed,
    frames: frame,
    failure: { seed, frame, problems, log: log.slice(-LOG_TAIL) },
    done,
    happened,
  });

  try {
    const game = new Game({ random: seeded(seed) });
    const heli = game.helicopter;
    // the camera as the page has it, over the ground and the treetops, put behind the helicopter wherever it is put
    const rig = new ChaseCamera(game.island.ground, game.canopy);
    rig.snap(heli);
    const sizes = TREE_KINDS.map(treeSize);
    const { bounds } = heli;
    const { ground, pads, trees, treeCount } = game.island;
    let controls: Controls = { ...IDLE };
    // how many frames the current thing is still held for, whether it is a landing, which ends when the skids touch,
    // and the rhythm the lift is tapped at, frames on and frames in all, if it is a hover
    const hold = { busy: 0, landing: false, tap: { on: 0, every: 0 }, wander: false };
    const between = (a: number, b: number) => a + random() * (b - a);
    const timesDone = (what: string) => done[what] ?? 0;
    const did = (what: string) => {
      count(done, what);
      log.push(`frame ${frame}: ${what}`);
    };
    // read afresh each time, so a step between two reads is seen
    const landed = () => heli.landed;
    const touchingEdge = () =>
      heli.x === bounds.minX || heli.x === bounds.maxX || heli.y === bounds.minY || heli.y === bounds.maxY;
    /** How many frames it takes to come down from its height at full tilt, and a second to spare, but not a whole mountain's worth. */
    const framesToLand = () => Math.min(300, Math.ceil((heli.height / HELICOPTER.climbSpeed) * 60) + 60);
    /** Somewhere over dry land, if a few tries find any: half the island is sea, and the hills are what the monkey is for. */
    const somewhereOnLand = (): [number, number] => {
      let x = 0,
        y = 0;
      for (let tries = 0; tries < 12; tries++) {
        x = between(bounds.minX, bounds.maxX);
        y = between(bounds.minY, bounds.maxY);
        if (ground.heightAt(x, y) > 2) break;
      }
      return [x, y];
    };
    /** Everything a player can make happen, each as often as it is weighted. */
    const actions: { name: string; weight: number; places?: boolean; go: () => void }[] = [
      {
        name: 'fly',
        weight: 8,
        go() {
          const r = random();
          controls = {
            forward: r < 0.7 ? 1 : r < 0.85 ? -1 : 0,
            turn: between(-1, 1),
            lift: Math.floor(random() * 3) - 1,
          };
          hold.busy = Math.floor(between(20, 120));
        },
      },
      {
        name: 'hover',
        weight: 2,
        go() {
          // held up by tapping the lift, as a player on keys holds a height: on for a frame or three, off for a few
          controls = { ...IDLE };
          hold.tap.on = 1 + Math.floor(random() * 3);
          hold.tap.every = hold.tap.on + 2 + Math.floor(random() * 5);
          hold.busy = Math.floor(between(60, 240));
        },
      },
      {
        name: 'let go',
        weight: 2,
        go() {
          // nothing held: it sinks, and lands if it is held long enough
          controls = { ...IDLE };
          hold.busy = Math.floor(between(60, 400));
        },
      },
      {
        name: 'climb',
        weight: 3,
        go() {
          controls = { forward: 0, turn: 0, lift: 1 };
          // the first climb, and every third after it, is held until the ceiling must have been reached, with two
          // seconds to turn round if it was sinking: from the sea that is a thousand frames, and so a run never leaves
          // the ceiling to chance
          const toCeiling = ((HELICOPTER.ceiling - heli.z) / HELICOPTER.climbSpeed) * 60 + 120;
          hold.busy = timesDone('climb') % 3 === 0 ? Math.ceil(toCeiling) : Math.floor(between(200, 400));
        },
      },
      {
        name: 'land',
        weight: 2,
        go() {
          controls = { forward: 0, turn: 0, lift: -1 };
          hold.busy = framesToLand();
          hold.landing = true;
        },
      },
      {
        name: 'teleport',
        places: true,
        weight: 2,
        go() {
          // a player can fly anywhere, at any height, so the monkey may simply be there
          const [x, y] = somewhereOnLand();
          heli.placeAbove(x, y, between(0, HELICOPTER.ceiling), between(-Math.PI, Math.PI));
        },
      },
      {
        name: 'take off',
        places: true,
        weight: 2,
        go() {
          // from a pad, as a player does: set down on one, and the stick pushed up, and sometimes forward
          const pad = pads[Math.floor(random() * pads.length)];
          heli.place(pad.x, pad.y, pad.z, pad.yaw + between(-0.5, 0.5));
          controls = { forward: random() < 0.5 ? 1 : 0, turn: between(-1, 1), lift: 1 };
          hold.busy = Math.floor(between(60, 200));
        },
      },
      {
        name: 'edge run',
        places: true,
        weight: 2,
        go() {
          // flown at the edge of the world from near it, as a player gone too far does: out at sea, at any height
          const along = random();
          const alongX = bounds.minX + along * (bounds.maxX - bounds.minX);
          const alongY = bounds.minY + along * (bounds.maxY - bounds.minY);
          const near = between(8, 50);
          const [px, py, yaw] = [
            [bounds.maxX - near, alongY, 0],
            [alongX, bounds.maxY - near, Math.PI / 2],
            [bounds.minX + near, alongY, Math.PI],
            [alongX, bounds.minY + near, -Math.PI / 2],
          ][Math.floor(random() * 4)];
          heli.placeAbove(px, py, between(2, 80), yaw);
          controls = { forward: 1, turn: 0, lift: 0 };
          hold.busy = Math.floor(between(180, 300));
        },
      },
      {
        name: 'hill run',
        places: true,
        weight: 3,
        go() {
          // flown low at land that rises ahead: a hill, a ridge, a mountain side, which sets it on the slope or has it climb
          let x = 0,
            y = 0,
            yaw = 0;
          for (let tries = 0; tries < 30; tries++) {
            [x, y] = somewhereOnLand();
            let rise = -Infinity;
            // the heading that rises most over the next sixty units, of eight
            for (let k = 0; k < 8; k++) {
              const a = (k * Math.PI) / 4;
              const gain = ground.heightAt(x + 60 * Math.cos(a), y + 60 * Math.sin(a)) - ground.heightAt(x, y);
              if (gain > rise) {
                rise = gain;
                yaw = a;
              }
            }
            if (rise > 12) break;
          }
          heli.placeAbove(x, y, between(0.5, 6), yaw);
          // a third of them climb as they go, and the rest only fly at it, holding their height by tapping the lift
          // about one frame in two or three, as a player does, since let go it would sink to the land before the hill
          controls = { forward: 1, turn: 0, lift: random() < 0.33 ? 1 : 0 };
          hold.busy = Math.floor(between(150, 300));
          if (controls.lift === 0) {
            hold.tap.on = 1;
            hold.tap.every = 2 + Math.floor(random() * 2);
          }
        },
      },
      {
        name: 'touch fly',
        weight: 3,
        go() {
          // a thumb on the stick, anywhere in its ring, and the lever anywhere on its travel or at its stop, as a phone
          // flies it: held where it is put, or wandering as a thumb does
          controls = {
            forward: between(-1, 1),
            turn: between(-1, 1),
            lift: random() < 0.4 ? HOVER_LIFT : between(-1, 1),
          };
          hold.wander = random() < 0.5;
          hold.busy = Math.floor(between(60, 300));
        },
      },
      {
        name: 'forest run',
        places: true,
        weight: 2,
        go() {
          // low over a tree, as a player comes down to a wood: hovered there, the trees bowed round it, or flown on
          // through the wood at full tilt, leaving them to spring back behind it
          const t = Math.floor(random() * treeCount) * TREE_STRIDE;
          heli.placeAbove(trees[t + 1], trees[t + 2], between(0.5, 12), between(-Math.PI, Math.PI));
          controls = random() < 0.5 ? { ...IDLE } : { forward: 1, turn: between(-0.3, 0.3), lift: 0 };
          hold.busy = Math.floor(between(120, 360));
        },
      },
      {
        name: 'pad landing',
        places: true,
        weight: 2,
        go() {
          // above a pad, coming down onto it, sometimes pushing on as it comes
          const pad = pads[Math.floor(random() * pads.length)];
          const spread = pad.radius * 0.8;
          heli.placeAbove(
            pad.x + between(-spread, spread),
            pad.y + between(-spread, spread),
            between(5, 60),
            between(-Math.PI, Math.PI),
          );
          controls = { forward: random() < 0.3 ? 1 : 0, turn: between(-0.5, 0.5), lift: -1 };
          hold.busy = framesToLand();
          hold.landing = true;
        },
      },
    ];
    const total = actions.reduce((n, a) => n + a.weight, 0);
    const act = () => {
      // everything is done once, in an order chosen by chance, before anything is chosen by weight, so that even a
      // short run does everything there is
      const untried = actions.filter((a) => timesDone(a.name) === 0);
      let chosen = actions[0];
      if (untried.length) chosen = untried[Math.floor(random() * untried.length)];
      else {
        let pick = random() * total;
        for (const a of actions) {
          if ((pick -= a.weight) < 0) {
            chosen = a;
            break;
          }
        }
      }
      chosen.go();
      if (chosen.places) rig.snap(heli);
      did(chosen.name);
    };

    for (frame = 1; frame <= frames; frame++) {
      if (hold.busy > 0) hold.busy--;
      else {
        hold.landing = false;
        hold.tap.every = 0;
        hold.wander = false;
        act();
      }
      if (hold.wander) {
        const drift = (v: number) => Math.max(-1, Math.min(1, v + between(-0.08, 0.08)));
        controls.forward = drift(controls.forward);
        controls.turn = drift(controls.turn);
        controls.lift = drift(controls.lift);
      }
      if (hold.tap.every > 0) controls.lift = frame % hold.tap.every < hold.tap.on ? 1 : 0;
      const wasLanded = landed();
      const wasFloor = heli.floor;
      const wasClimb = heli.vz;
      const wasZ = heli.z;
      const wasAtCeiling = heli.z === HELICOPTER.ceiling;
      const wasAtEdge = touchingEdge();
      const wasSwaying = game.sway.count;
      game.step(DT, controls);
      rig.step(DT, heli);
      if (wasSwaying === 0 && game.sway.count > 0) count(happened, 'trees swayed');
      if (wasSwaying > 0 && game.sway.count === 0) count(happened, 'trees settled');
      if (wasLanded && !landed()) count(happened, 'took off');
      if (!wasLanded && landed()) {
        count(happened, 'landed');
        // set down by the land rising to meet it: higher over the ground it had than its own fall could take it in a
        // frame, at the fastest it could have been coming down by the end of it
        const ownFall = Math.max(0, -wasClimb + HELICOPTER.climbAccel * DT) * DT;
        if (heli.floor > wasFloor && wasZ - wasFloor > ownFall) count(happened, 'met rising land');
      }
      if (!wasAtCeiling && heli.z === HELICOPTER.ceiling) count(happened, 'reached the ceiling');
      if (!wasAtEdge && touchingEdge()) count(happened, 'touched the edge');
      if (hold.landing && landed()) hold.busy = 0;
      if (frame % CHECK_EVERY === 0) {
        const problems = [...checkInvariants(game), ...checkCamera(rig, game, sizes)];
        if (problems.length) return fail(problems);
      }
    }
    return { seed, frames, failure: null, done, happened };
  } catch (err) {
    return fail([`threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`]);
  }
}
