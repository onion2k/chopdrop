/**
 * The game played by a monkey: the real game, without the picture, driven
 * at random and made to do at random everything a player can make happen —
 * flying about, letting go to hang where it is, coming down by the lift held down, tapping the lift,
 * climbing to the ceiling, landing, being somewhere
 * else, taking off from a pad, flying out to the edge of the world, up at a
 * hill, down onto a pad and low over a wood, bowing its trees, onto the
 * pad the parcel is wanted at and waiting there, down onto a level's start or
 * through it, being shown the way to one, giving up the level going, flying
 * at a ring from any side and through one in its turn, hovering over a person waiting to be winched up, in the
 * window and high, low or aside of it, landing beside the walker within and just past the reach of the boarding, being let down onto a
 * lake, the sea or a river, putting the bucket out and taking it in, dipping it into open water, skimming low over water
 * and flying over a fire at the edges of the drop — with the
 * chase camera following it as the page has it, and checked after every few frames for anything that must always
 * hold and does not (`invariants.ts`), and for anything thrown.
 *
 * The island is big and tall, so the monkey is put where the action is
 * rather than left to find it: heights are asked for above the ground
 * under it, and the runs start near what they run at. It comes back as a
 * player does, with a save in which some levels are done, as chance has it,
 * and starts flying free from home, with nothing going.
 *
 * Only what a player could do. A monkey that did what no player can would
 * find bugs no player will. A new thing a player can do gets an action here.
 *
 * From a seed, so a failure can be played again exactly: `npm run fuzz --
 * --seed N` does, and prints what was done before it went wrong.
 */
import { Game } from '../src/game';
import { BOARD, WINCH, type Step } from '../src/mission';
import { HELICOPTER, HOVER_LIFT, HOVER_OVER_WATER, IDLE, type Controls } from '../src/helicopter';
import { ChaseCamera } from '../src/chase';
import { checkCamera, checkInvariants } from '../src/invariants';
import { TREE_STRIDE } from '../src/island';
import { COLLECTIBLES, FIRES, LEVELS, PACKAGES, RESCUE_SPOTS, TREE_KINDS } from '../src/arena';
import { treeSize } from '../src/meshes';
import { Progress, memoryStore } from '../src/progress';
import { PATCH } from '../src/fire';
import { NO_WATER, SCOOP } from '../src/water';
import { seeded } from '../src/random';

const DT = 1 / 60;
/** How many frames between checks, when nothing has just been done. */
const CHECK_EVERY = 10;
/** How many times a seed's own level is tried before the run goes on without it. */
const OWED_TRIES = 6;
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

/**
 * The level named `id` begun where a player begins it: the helicopter put at the level's start first, and then the level
 * begun. Begun at once from wherever the helicopter happens to be, a rescue would be begun on its own destination, the
 * home pad, and end on the next step, which a player can never be at.
 */
export function beginAtStart(game: Game, id: string): void {
  game.moveToStart(id);
  game.begin(id);
}

/**
 * Play `frames` frames of the game at random from `seed`, flying free from home; with the level named `level` begun at
 * once, if given, so a level a player reaches only after flying to it is played as long as the first.
 */
export function fuzz(seed: number, frames: number, level?: string): FuzzResult {
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
    // a player back for another go, with some levels done, any of them as chance says, none or all
    if (level !== undefined && !LEVELS.some((l) => l.id === level)) throw new Error(`there is no level "${level}"`);
    // and with some structures collected, any of them, and now and then one a later game has that this one does not
    const save = {
      best: Object.fromEntries(LEVELS.flatMap((l, k) => (random() < 0.5 ? [[l.id, 40 + 20 * k]] : []))),
      collected: [
        ...COLLECTIBLES.flatMap((c) => (random() < 0.3 ? [c.id] : [])),
        ...(random() < 0.2 ? ['from-a-later-game'] : []),
      ],
      // and some packages found, any of them, and now and then one a later game has
      found: [
        ...PACKAGES.flatMap((p) => (random() < 0.25 ? [p.id] : [])),
        ...(random() < 0.2 ? ['from-a-later-game'] : []),
      ],
    };
    const game = new Game({
      random: seeded(seed),
      progress: new Progress(memoryStore(JSON.stringify(save))),
      events: {
        started: (id) => count(happened, `started ${id}`),
        abandoned: () => count(happened, 'abandoned'),
        loaded: () => count(happened, 'loaded'),
        delivered: () => count(happened, 'delivered'),
        winched: () => count(happened, 'winched'),
        boarded: () => count(happened, 'boarded'),
        scooped: () => count(happened, 'scooped'),
        dropped: () => count(happened, 'dropped'),
        fireOut: () => count(happened, 'fire out'),
        passed: () => count(happened, 'passed a ring'),
        through: () => count(happened, 'through a gate'),
        landed: () => count(happened, 'landed where wanted'),
        collected: () => count(happened, 'collected'),
        found: () => count(happened, 'found'),
        finished: (_id, _seconds, best) => count(happened, best ? 'finished, a best time' : 'finished'),
      },
    });
    const heli = game.helicopter;
    // the game opens flying free, so a level is begun only where one is asked for
    if (level !== undefined) beginAtStart(game, level);
    // the camera as the page has it, over the ground and the treetops, put behind the helicopter wherever it is put
    const rig = new ChaseCamera(game.island.ground, game.crown, game.solids);
    rig.snap(heli);
    const sizes = TREE_KINDS.map(treeSize);
    const { bounds } = heli;
    const { ground, pads, trees, treeCount } = game.island;
    // how many structures were collected at the last check, which only ever goes up within a game
    let collectedAt = game.collection.count;
    // and how many packages were found, which the same holds of
    let foundAt = game.finds.count;
    let controls: Controls = { ...IDLE };
    // how many frames the current thing is still held for, whether it is a landing, which ends when the skids touch,
    // the rhythm the lift is tapped at, frames on and frames in all, if it is a hover, and whether it is a run of
    // openings, each lined up on as the last is passed, and the step it is at; and the action it goes on to when this one is done,
    // as a player fighting a fire dips and then drops, and dips again
    const hold = { busy: 0, landing: false, tap: { on: 0, every: 0 }, wander: false, run: false, at: 0, follow: '' };
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
    /**
     * Somewhere over water of the kind asked for, a lake, the sea, a river or any of them: a square of a lake or the
     * sea, or a point of a river's run, each as likely as the other, over the island's own maps. A river is found by
     * its points, which are over it by the same map as any water; open water is tried a few times for a square that
     * is, and a point on a beach is left to chance.
     */
    const somewhereWet = (kind: 'open' | 'any'): [number, number] => {
      const { lakes, sea, terrain, rivers } = game.island;
      const across = terrain.cols - 1;
      const pick = random();
      if (kind === 'any' && pick < 0.3 && rivers.length > 0) {
        const { points } = rivers[Math.floor(random() * rivers.length)];
        const k = Math.floor(random() * (points.length / 4)) * 4;
        return [points[k], points[k + 1]];
      }
      let x = 0,
        y = 0;
      for (let tries = 0; tries < 12; tries++) {
        let sq: number;
        if (random() < 0.5 && lakes.length > 0) {
          const lake = lakes[Math.floor(random() * lakes.length)];
          sq = lake.squares[Math.floor(random() * lake.squares.length)];
        } else {
          sq = Math.floor(random() * sea.length);
          for (let k = 0; k < 40 && sea[sq] === 0; k++) sq = Math.floor(random() * sea.length);
        }
        x = terrain.originX + ((sq % across) + random()) * terrain.cell;
        y = terrain.originY + (Math.floor(sq / across) + random()) * terrain.cell;
        if (game.waters.surfaceAt(x, y) !== NO_WATER) break;
      }
      return [x, y];
    };
    /** Whether it is pressed down onto the top of a structure, all but still: its middle over the top and inside its edges. */
    const restingOnTop = () =>
      Math.abs(heli.vz) < 0.5 &&
      game.solids.blocks.some((block) => {
        const c = Math.cos(block.yaw),
          s = Math.sin(block.yaw);
        const along = (heli.x - block.x) * c + (heli.y - block.y) * s;
        const across = -(heli.x - block.x) * s + (heli.y - block.y) * c;
        return (
          Math.abs(along) < block.length / 2 &&
          Math.abs(across) < block.width / 2 &&
          heli.z + HELICOPTER.size.middle > block.z + block.height
        );
      });
    /**
     * Over the pad `target`, down onto it, and waiting there as long as a player does, or not quite, or for `stay` more
     * frames for a load that must be waited out; whether there was a pad.
     */
    const downOnPad = (target: number, stay = 0): boolean => {
      if (target < 0) return false;
      const pad = pads[target];
      const spread = pad.radius * 0.5;
      heli.placeAbove(
        pad.x + between(-spread, spread),
        pad.y + between(-spread, spread),
        between(2, 30),
        between(-Math.PI, Math.PI),
      );
      controls = { forward: 0, turn: 0, lift: -1 };
      hold.busy = framesToLand() + stay + Math.floor(between(30, 150));
      return true;
    };
    /** Over the pad wanted, down onto it, and waiting there; whether a pad is wanted. */
    const downOnWantedPad = (): boolean => downOnPad(game.mission.target);
    /**
     * Lined up on `step` if it is a ring or an opening, before it on its axis, at its height and a little off its middle,
     * and flown at it, as a player who has it right does; whether it was one to line up on. From rest it covers 18 in
     * a second and a half and 44 in two and a half: through, and on past it.
     */
    const lineUpOn = (step: Step | undefined): boolean => {
      if (step?.kind !== 'ring' && step?.kind !== 'gate') return false;
      const back = between(10, 25);
      const ax = Math.cos(step.yaw),
        ay = Math.sin(step.yaw);
      const [off, up] =
        step.kind === 'ring'
          ? [between(-step.opening / 3, step.opening / 3), 0]
          : [between(-step.width / 6, step.width / 6), between(-step.height / 8, step.height / 8)];
      heli.place(
        step.x - ax * back - ay * off,
        step.y - ay * back + ax * off,
        step.z - HELICOPTER.size.middle + up,
        step.yaw,
      );
      controls = { forward: 1, turn: 0, lift: HOVER_LIFT };
      hold.busy = 150;
      hold.at = game.mission.next;
      return true;
    };
    /**
     * Lined up on a structure's opening, from either side, 10 to 25 back, its middle at the opening's height and a
     * little off its middle, and flown at it as `lineUpOn` flies a ring: through it, and on past.
     */
    const lineUpOnStructure = (): void => {
      const { opening } = COLLECTIBLES[Math.floor(random() * COLLECTIBLES.length)];
      const side = random() < 0.5 ? 1 : -1;
      const back = between(10, 25);
      const [ax, ay] = [Math.cos(opening.yaw), Math.sin(opening.yaw)];
      const off = between(-opening.width / 6, opening.width / 6);
      const up = between(-opening.height / 8, opening.height / 8);
      heli.place(
        opening.x + ax * side * back - ay * off,
        opening.y + ay * side * back + ax * off,
        opening.z - HELICOPTER.size.middle + up,
        opening.yaw + (side > 0 ? Math.PI : 0),
      );
      controls = { forward: 1, turn: 0, lift: HOVER_LIFT };
      hold.busy = 150;
    };
    /**
     * Over the person at `spot`, `up` over the ground there and `aside` from them in any direction, hovering as it is
     * put for four seconds: in the winch's window if it is within it, and out of it, high, low or to the side, if not.
     */
    const overRescue = (spot: (typeof RESCUE_SPOTS)[number], up: number, aside: number): void => {
      const round = between(-Math.PI, Math.PI);
      heli.placeAbove(
        spot.x + Math.cos(round) * aside,
        spot.y + Math.sin(round) * aside,
        up,
        between(-Math.PI, Math.PI),
      );
      controls = { forward: 0, turn: 0, lift: HOVER_LIFT };
      hold.busy = 240;
    };
    /**
     * Landed `away` from the walker at any bearing, and left sitting for as long as the boarding takes and a second more:
     * within the reach it begins the level, and just past it, or hovering over them, it does not. `hover` has it come
     * down from a few metres up instead, as a player lands.
     */
    const beside = (away: number, hover: boolean): void => {
      const walker = RESCUE_SPOTS.find((r) => r.by === 'land')!;
      const round = between(-Math.PI, Math.PI);
      heli.placeAbove(
        walker.x + Math.cos(round) * away,
        walker.y + Math.sin(round) * away,
        hover ? between(2, 12) : 0,
        between(-Math.PI, Math.PI),
      );
      controls = hover ? { forward: 0, turn: 0, lift: -1 } : { ...IDLE };
      hold.busy = Math.round((BOARD.hold + 1) * 60) + (hover ? framesToLand() : 0);
    };
    /**
     * Skimming over open water: a lake, or the sea, chosen from the island's water, `up` over it, at `speed`, along a
     * straight line from the square chosen, held for three seconds. The line is tried a few times for one that stays over
     * the water, which a player skimming a lake would fly, and left to chance if none does. Over the water it is held at
     * the hover, whatever it is put at.
     */
    const skimOver = (up: number, speed: number, run = 3): void => {
      const { lakes, sea, terrain } = game.island;
      const across = terrain.cols - 1;
      let x = 0,
        y = 0,
        yaw = 0;
      for (let tries = 0; tries < 12; tries++) {
        // a lake or the sea, each as likely as the other
        const pick = Math.floor(random() * (lakes.length + 1));
        let sq: number;
        if (pick < lakes.length) sq = lakes[pick].squares[Math.floor(random() * lakes[pick].squares.length)];
        else {
          sq = Math.floor(random() * sea.length);
          for (let k = 0; k < 40 && sea[sq] === 0; k++) sq = Math.floor(random() * sea.length);
        }
        x = terrain.originX + ((sq % across) + random()) * terrain.cell;
        y = terrain.originY + (Math.floor(sq / across) + random()) * terrain.cell;
        yaw = between(-Math.PI, Math.PI);
        const level = (d: number) => game.water.levelAt(x + Math.cos(yaw) * d, y + Math.sin(yaw) * d);
        if (
          Number.isFinite(level(0)) &&
          Number.isFinite(level(speed * run)) &&
          Number.isFinite(level(speed * run * 0.5))
        )
          break;
      }
      const level = game.water.levelAt(x, y);
      heli.place(x, y, (Number.isFinite(level) ? level : ground.heightAt(x, y)) + up, yaw);
      heli.vx = Math.cos(yaw) * speed;
      heli.vy = Math.sin(yaw) * speed;
      controls = { forward: speed / HELICOPTER.maxSpeed, turn: 0, lift: HOVER_LIFT };
      hold.busy = Math.round(run * 60);
    };
    /**
     * Over patch `k` of `fire`, `up` over the ground there, drifting slowly, for two seconds: with a full tank the water
     * falls from a window's height, and from one too high it does not.
     */
    const overFire = (fire: (typeof FIRES)[number], k: number, up: number): void => {
      const p = fire.patches[k];
      heli.placeAbove(p.x, p.y, up, between(-Math.PI, Math.PI));
      controls = { forward: between(0, 0.1), turn: 0, lift: HOVER_LIFT };
      hold.busy = 120;
    };
    /** The fire a player at a fire level is fighting, or any: the one the level going is about, else chance. */
    const aFire = (): (typeof FIRES)[number] => {
      const going = game.mission.level?.steps.find((step) => step.kind === 'fire');
      return (
        FIRES.find((f) => going?.kind === 'fire' && f.id === going.fire) ?? FIRES[Math.floor(random() * FIRES.length)]
      );
    };
    /** Lined up on the ring or the opening wanted. */
    const lineUp = (): boolean => lineUpOn(game.mission.current);
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
          // the lift tapped, as a player on keys nudges a height: on for a frame or three, off for a few, and let go it holds
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
          // nothing held: it hangs at its height, in the air or on the ground, however long it is left
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
          // a third of them climb as they go, and the rest only fly at it, nudging their height by tapping the lift
          // about one frame in two or three, as a player does
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
        name: 'wanted pad',
        places: true,
        weight: 5,
        go() {
          downOnWantedPad();
        },
      },
      {
        name: 'ring run',
        places: true,
        weight: 2,
        go() {
          // at one of the rings that are solid (the level going's, and every start) from any side, any height near it and
          // any speed, as a player who has misjudged one does: knocked off its tube, through it the wrong way, or round it
          const rings = game.solids.rings;
          if (!rings.length) return;
          const ring = rings[Math.floor(random() * rings.length)];
          const round = between(-Math.PI, Math.PI);
          const away = between(12, 40);
          const x = ring.x + Math.cos(round) * away,
            y = ring.y + Math.sin(round) * away;
          heli.place(
            x,
            y,
            ring.z - HELICOPTER.size.middle + between(-ring.opening, ring.opening),
            round + Math.PI + between(-0.4, 0.4),
          );
          controls = { forward: between(0.3, 1), turn: between(-0.2, 0.2), lift: HOVER_LIFT };
          hold.busy = Math.floor(between(60, 180));
        },
      },
      {
        name: 'through the ring',
        places: true,
        weight: 4,
        go() {
          // lined up on the ring wanted, before it, at its height, and through it as a player who has it right does,
          // and as often, on to the next and through that, as one who has the whole trial right
          if (game.mission.current?.kind !== 'ring') return;
          lineUp();
          hold.run = random() < 0.5;
        },
      },
      {
        name: 'through the gate',
        places: true,
        weight: 3,
        go() {
          // lined up on the opening wanted, the same, and on through the course as often
          if (game.mission.current?.kind !== 'gate') return;
          lineUp();
          hold.run = random() < 0.5;
        },
      },
      {
        name: 'through a structure',
        places: true,
        weight: 3,
        go: lineUpOnStructure,
      },
      {
        name: 'to a package',
        places: true,
        weight: 3,
        go() {
          // over a place a package lies, then let down onto the ground 10 to 20 m from it at any bearing, so that some
          // land within its 15 m and some just outside, and held until landed
          const p = PACKAGES[Math.floor(random() * PACKAGES.length)];
          const away = between(10, 20);
          const round = between(-Math.PI, Math.PI);
          heli.placeAbove(
            p.x + Math.cos(round) * away,
            p.y + Math.sin(round) * away,
            between(2, 30),
            between(-Math.PI, Math.PI),
          );
          controls = { forward: 0, turn: 0, lift: -1 };
          hold.busy = framesToLand();
          hold.landing = true;
        },
      },
      {
        name: 'to a rescue',
        places: true,
        weight: 3,
        go() {
          // over a place a person waits, 3 to 18 up and up to 8 across, held hovering: some are in the winch's window
          // and begin the rescue, and some are too high, too low or too far aside, and do not
          overRescue(RESCUE_SPOTS[Math.floor(random() * RESCUE_SPOTS.length)], between(3, 18), between(0, 8));
        },
      },
      {
        name: 'structure run',
        places: true,
        weight: 2,
        go() {
          // at the bridge or a tower from any side, high or low, fast or slow, as a player who has misjudged it does:
          // knocked off a face, a corner, the deck's underside or its top, or under it and out the other side
          const { blocks } = game.solids;
          const block = blocks[Math.floor(random() * blocks.length)];
          const round = between(-Math.PI, Math.PI);
          const away = Math.max(block.length, block.width) / 2 + between(8, 30);
          heli.place(
            block.x + Math.cos(round) * away,
            block.y + Math.sin(round) * away,
            between(block.z - 6, block.z + block.height + 4) - HELICOPTER.size.middle,
            round + Math.PI + between(-0.4, 0.4),
          );
          controls = {
            forward: between(0.3, 1),
            turn: between(-0.2, 0.2),
            lift: between(HOVER_LIFT - 0.3, HOVER_LIFT + 0.3),
          };
          hold.busy = Math.floor(between(60, 180));
        },
      },
      {
        name: 'onto a structure',
        places: true,
        weight: 1,
        go() {
          // over the deck or a tower's top, and let down by the lift held down or left to hang: it rests there, pressed
          // on it and never in it, and never landed, and pushed on, it slides off its edge
          const { blocks } = game.solids;
          const block = blocks[Math.floor(random() * blocks.length)];
          const along = between(-block.length / 2, block.length / 2),
            across = between(-block.width / 2, block.width / 2);
          const c = Math.cos(block.yaw),
            s = Math.sin(block.yaw);
          heli.place(
            block.x + along * c - across * s,
            block.y + along * s + across * c,
            block.z + block.height + HELICOPTER.size.rotorRadius - HELICOPTER.size.middle + between(0.5, 12),
            between(-Math.PI, Math.PI),
          );
          controls = { forward: random() < 0.3 ? between(0.2, 1) : 0, turn: 0, lift: random() < 0.5 ? -1 : 0 };
          hold.busy = Math.floor(between(120, 300));
        },
      },
      {
        name: 'to a start',
        places: true,
        weight: 4,
        go() {
          // at a level's start, whether or not one is going, since nothing may begin while one is: down onto a pickup
          // pad for as long as the load takes, or lined up on the first ring or opening and flown through it
          // the level the seed names, in turn, is gone to first and until it has begun (see `owed`), so that the seeds
          // between them reach every start however the other actions fall; those after are at random
          const at = owed() ? seed % LEVELS.length : Math.floor(random() * LEVELS.length);
          const start = LEVELS[at].steps[0];
          if (start.kind === 'pickup') downOnPad(start.pad, 90);
          else if (start.kind === 'winch') {
            // well inside the window, and held for longer than the hold
            const spot = RESCUE_SPOTS.find((r) => r.x === start.x && r.y === start.y)!;
            overRescue(spot, between(WINCH.low + 1, WINCH.high - 1), between(0, WINCH.reach - 2));
          } else if (start.kind === 'douse') {
            // the bucket out, the water first, hovered over at the end of the fire's run long enough to fill, and then a
            // drop from the middle of the window on the first of its patches, which is what begins it
            const fire = FIRES.find((f) => f.id === start.fire)!;
            game.setBucket(true);
            if (!game.tank.full) {
              const { from, to, z } = fire.run;
              heli.place(from.x, from.y, z + HOVER_OVER_WATER, Math.atan2(to.y - from.y, to.x - from.x));
              controls = { forward: 0, turn: 0, lift: HOVER_LIFT };
              hold.busy = Math.round((SCOOP.time + 1.5) * 60);
            } else overFire(fire, 0, between(12, 22));
          } else if (start.kind === 'board') {
            // landed beside the person, well inside the reach, and held for longer than the hold
            beside(between(4, BOARD.reach - 3), false);
          } else {
            lineUpOn(start);
            hold.run = random() < 0.5;
          }
        },
      },
      {
        name: 'skim',
        places: true,
        weight: 3,
        go() {
          // low over a lake or the sea at any height up to 3 m over it, which is under the hover, and any speed from 4 to
          // 14 m/s, along a line held for three seconds: it is held at the hover and never landed on the water, with the
          // bucket in or out as it was
          skimOver(between(0, 3), between(4, 14));
        },
      },
      {
        name: 'let down onto water',
        places: true,
        weight: 3,
        go() {
          // over a lake, the sea or a river, high or low, and let down by the lift held down, or held low a little: it is
          // eased onto the hover over the surface and is never landed, and flown on it may skim at the hover
          const [x, y] = somewhereWet('any');
          heli.placeAbove(x, y, between(2, 60), between(-Math.PI, Math.PI));
          controls = {
            forward: random() < 0.3 ? between(0.2, 1) : 0,
            turn: 0,
            lift: random() < 0.6 ? -1 : -between(0.1, 1),
          };
          hold.busy = framesToLand() + Math.floor(between(30, 150));
        },
      },
      {
        name: 'the bucket',
        weight: 2,
        go() {
          // the key or the badge, put out or taken in, at random and held for a while, with whatever is going
          game.setBucket(random() < 0.5);
          controls = { ...IDLE };
          hold.busy = Math.floor(between(30, 180));
        },
      },
      {
        name: 'dip',
        places: true,
        weight: 3,
        go() {
          // the bucket out, over a lake or the sea, and let down onto it: the bucket goes in at the line's length, and held
          // there for two seconds fills it, and one held there a moment less, or over a river, does not. A player fighting a
          // fire goes to the water of its run, so with a fire level going, or half the time, it is there
          game.setBucket(true);
          let x: number, y: number;
          if (game.mission.level?.kind === 'fire' || random() < 0.3) {
            const { from, to } = aFire().run;
            const along = between(0.15, 0.85);
            [x, y] = [from.x + (to.x - from.x) * along, from.y + (to.y - from.y) * along];
          } else [x, y] = somewhereWet(random() < 0.8 ? 'open' : 'any');
          heli.placeAbove(x, y, between(3, 12), between(-Math.PI, Math.PI));
          controls = { forward: 0, turn: 0, lift: -1 };
          hold.busy = framesToLand() + Math.round(between(SCOOP.time - 0.5, SCOOP.time + 1.5) * 60);
          if (game.mission.level?.kind === 'fire') hold.follow = 'over a fire';
        },
      },
      {
        name: 'beside a person',
        places: true,
        weight: 3,
        go() {
          // landed or coming down within the reach of the walker or just past it, at a bearing of any kind: within it, the
          // skids down, and held for three seconds, the person climbs aboard; past it, or over them, nothing happens
          const away = random() < 0.2 ? 0 : between(BOARD.reach - 7, BOARD.reach + 5);
          beside(away, random() < 0.4);
        },
      },
      {
        name: 'over a fire',
        places: true,
        weight: 3,
        go() {
          // over a patch of a fire, 12 to 35 m up, drifting: with a full tank and the bucket out some drop, and some are too
          // high, or have the bucket in, which a player who has come to a fire has mostly put out
          game.setBucket(random() < 0.85);
          const fire = aFire();
          const states = game.fire(fire.id).states;
          // a player flies at the flames: a patch that burns, if a few tries find one, and any if not
          let k = Math.floor(random() * fire.patches.length);
          for (let tries = 0; tries < 6 && states[k] !== PATCH.burning; tries++)
            k = Math.floor(random() * fire.patches.length);
          overFire(fire, k, between(12, 35));
          if (game.mission.level?.kind === 'fire') hold.follow = 'dip';
        },
      },
      {
        name: 'show the way',
        weight: 1,
        go() {
          // the panel's "Show the way", to any level or to none
          const at = Math.floor(random() * (LEVELS.length + 1));
          game.guide(at < LEVELS.length ? LEVELS[at].id : null);
        },
      },
      {
        name: 'abandon',
        weight: 1,
        go() {
          // the panel's "Abandon", whether or not a level is going
          game.abandon();
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
          // (or let down into it by the lift held down, eased onto the ground at the last, as a player lands in a clearing)
          const how = random();
          controls =
            how < 0.35
              ? { ...IDLE }
              : how < 0.7
                ? { forward: 1, turn: between(-0.3, 0.3), lift: 0 }
                : { forward: 0, turn: 0, lift: -1 };
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
    /**
     * Whether the level the seed names is still owed a start: no level was asked for, it has not begun, and it has not
     * been tried more than a handful of times, so a level that cannot begin shows in the seeds' coverage and does not
     * swallow the run. Held by design, since which level a seed reaches by chance moves whenever an action is added.
     */
    const owed = (): boolean =>
      level === undefined &&
      !happened[`started ${LEVELS[seed % LEVELS.length].id}`] &&
      timesDone('to a start') < OWED_TRIES;
    const act = () => {
      // everything is done once, in an order chosen by chance, before anything is chosen by weight, so that even a
      // short run does everything there is
      const untried = actions.filter((a) => timesDone(a.name) === 0);
      let chosen = actions[0];
      const follow = hold.follow;
      hold.follow = '';
      if (follow) chosen = actions.find((a) => a.name === follow)!;
      else if (owed()) chosen = actions.find((a) => a.name === 'to a start')!;
      else if (untried.length) chosen = untried[Math.floor(random() * untried.length)];
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
        hold.run = false;
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
      if (game.solids.touched) {
        // the solid touched: a structure, if the nearest is within its reach of its middle, and a ring if not
        const { middle, rotorRadius } = HELICOPTER.size;
        const block = game.solids.distanceAt(heli.x, heli.y, heli.z + middle) <= rotorRadius + 1e-6;
        count(happened, block ? 'knocked off a structure' : 'knocked off a ring');
        if (block && restingOnTop()) count(happened, 'rested on a structure');
      }
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
      // in a run of openings, the next lined up on as soon as the last is passed, and after the last, down onto the
      // pad wanted, if one is, as a course ends
      if (hold.run && game.mission.next !== hold.at) {
        if (lineUp()) {
          rig.snap(heli);
          log.push(`frame ${frame}: on to the next`);
        } else {
          hold.run = false;
          if (downOnWantedPad()) {
            rig.snap(heli);
            log.push(`frame ${frame}: down onto the pad wanted`);
          }
        }
      }
      if (frame % CHECK_EVERY === 0) {
        const problems = [...checkInvariants(game), ...checkCamera(rig, game, sizes)];
        // what is collected only grows within a game, which needs the count from the last check
        if (game.collection.count < collectedAt)
          problems.push(
            `the structures collected went down: ${collectedAt} at the last check, ${game.collection.count} now`,
          );
        collectedAt = game.collection.count;
        if (game.finds.count < foundAt)
          problems.push(`the packages found went down: ${foundAt} at the last check, ${game.finds.count} now`);
        foundAt = game.finds.count;
        if (problems.length) return fail(problems);
      }
    }
    return { seed, frames, failure: null, done, happened };
  } catch (err) {
    return fail([`threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`]);
  }
}
