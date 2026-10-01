/**
 * How long a frame of the game takes, held to what it took before.
 *
 *   npm run bench              measure, and fail if any scenario has moved by more than the tolerance, either way
 *   npm run bench -- --update  write what it takes now as the new baseline, from two readings that agree
 *
 * Two scenarios: the floor at rest, which is what most frames are; and the
 * autopilot pushing balls in, which is what a busy frame is. A game adds a
 * scenario for each way its frames get costly.
 *
 * A time on one machine is not a time on another, or on the same one with
 * something else running. So each scenario is held to the baseline as a
 * multiple of a fixed piece of arithmetic, timed just before and just after
 * each run, which goes faster and slower with the machine much as the game
 * does: a baseline written on one machine means something on another, and
 * on this one as it warms. Each scenario is run several times, fresh, in a
 * worker of its own, and the run that counts is the one that took least
 * against its reference, since noise only ever makes a run slower. Each is
 * run for long enough that its time is well clear of anything else the
 * machine does in passing: a frame here costs a thousandth of a millisecond.
 * The milliseconds are reported too.
 *
 * It holds both ways, as every baseline here does: a frame gone faster is
 * written into the baseline, so that giving the speed back later is seen.
 * And it counts what each scenario did, on a run of its own that is not
 * timed, and fails one that did not do what it is named for.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Autopilot } from '../src/autopilot';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { AGREE, TOLERANCE, agreed, bestRatio, did, judge, type Seen } from './benching';

const BASELINE = 'scripts/bench-baseline.json';
/** How many times each scenario is run: four let a slow moment through often enough to wobble the figure by a tenth. */
const RUNS = 8;
const DT = 1 / 60;

interface Result extends Seen {
  /** Milliseconds a frame, of the run that counts. */
  ms: number;
  /** That against the reference arithmetic. */
  relative: number;
  /** Milliseconds the reference took, beside that run. */
  ref: number;
}

interface Scenario {
  name: string;
  frames: number;
  /** The share of its frames a body is awake in, the least and the most, if it is doing what it is named for. */
  awake: readonly [number, number];
  /** The game as the timing starts, and what one timed frame of it is. */
  setup: () => { game: Game; frame: () => void };
}

/** A game from a seed, settled. */
function settled(seed: number): Game {
  const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed) });
  for (let f = 0; f < 180; f++) game.step(DT, { throttle: 0, steer: 0 });
  return game;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'the floor at rest',
    // a frame at rest costs so little that six hundred of them were timed in half a millisecond, and the figure
    // wobbled by a third from one run of the bench to the next
    frames: 20000,
    awake: [0, 0],
    setup: () => {
      const game = settled(1);
      return { game, frame: () => game.step(DT, { throttle: 0, steer: 0 }) };
    },
  },
  {
    name: 'the autopilot pushing balls in',
    // a few minutes of play and a couple of dozen balls banked: in ten seconds the autopilot banked one
    frames: 12000,
    awake: [0.25, 1],
    setup: () => {
      const game = settled(1);
      const pilot = new Autopilot(game);
      return { game, frame: () => pilot.step(DT) };
    },
  },
];

/**
 * The reference: typed-array arithmetic of the physics' own kind, a pass of
 * springs over a grid of points, the same work every time.
 */
function reference(): number {
  const n = 200_000;
  const x = new Float32Array(n),
    v = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.37) * 3;
  const t = performance.now();
  for (let pass = 0; pass < 40; pass++) {
    for (let i = 1; i < n - 1; i++) {
      const f = x[i - 1] + x[i + 1] - 2 * x[i];
      v[i] = v[i] * 0.99 + f * 0.1;
    }
    for (let i = 0; i < n; i++) x[i] += Math.sqrt(v[i] * v[i] + 1e-6) * Math.sign(v[i]) * 0.01;
  }
  return performance.now() - t;
}

/** Whether any body on the floor is awake. */
function anyAwake(game: Game): boolean {
  const { world } = game;
  for (let i = 0; i < world.count; i++) if (world.alive[i] && !world.asleep[i]) return true;
  return false;
}

function measure(s: Scenario): Result {
  // the reference warmed up first, so its first times are not the compiler's
  for (let k = 0; k < 3; k++) reference();
  const best = bestRatio(RUNS, reference, () => {
    const { frame } = s.setup();
    const t = performance.now();
    for (let f = 0; f < s.frames; f++) frame();
    return (performance.now() - t) / s.frames;
  });
  // what the scenario did, counted on a run of its own: the same seed plays the same frames, and looking through
  // the bodies after every one would be a good part of a frame that costs this little
  const { game, frame } = s.setup();
  let awake = 0;
  for (let f = 0; f < s.frames; f++) {
    frame();
    if (anyAwake(game)) awake++;
  }
  return { ms: best.ms, relative: best.ratio, ref: best.ref, frames: s.frames, awake };
}

if (!isMainThread) {
  const { index } = workerData as { index: number };
  parentPort!.postMessage(measure(SCENARIOS[index]));
} else {
  await main();
}

/** Every scenario measured, one at a time, so none is timed while another runs beside it. */
async function reading(): Promise<Result[]> {
  const results: Result[] = [];
  for (let index = 0; index < SCENARIOS.length; index++) {
    results.push(
      await new Promise<Result>((resolve, reject) => {
        const worker = new Worker(new URL(`file://${process.argv[1]}`), { workerData: { index } });
        worker.once('message', resolve);
        worker.once('error', reject);
      }),
    );
  }
  return results;
}

async function main() {
  const update = process.argv.includes('--update');
  const results = await reading();

  // a scenario that did not do what it is named for is timed for nothing, and its figure is not worth keeping
  const idle = SCENARIOS.filter((s, k) => !did(results[k], s.awake));
  for (const s of idle) {
    const [least, most] = s.awake;
    console.error(
      `${s.name}: ${line(results[SCENARIOS.indexOf(s)])}, where it should be in ${least === most ? `${least * 100}%` : `${least * 100}% to ${most * 100}%`} of them`,
    );
  }
  if (idle.length) {
    console.error(
      `\n${idle.length} scenario${idle.length === 1 ? '' : 's'} did not do what ${idle.length === 1 ? 'it is' : 'they are'} named for: nothing is held, and nothing written`,
    );
    process.exitCode = 1;
    return;
  }

  if (update) {
    // read a second time, and written only where the two agree: see `agreed`
    const again = await reading();
    const middle = SCENARIOS.map((_, k) => agreed(results[k].relative, again[k].relative));
    SCENARIOS.forEach((s, k) =>
      console.log(
        `${s.name}: ${line(results[k])}, and ${again[k].relative.toPrecision(3)} read again${middle[k] === null ? ' (APART)' : ''}`,
      ),
    );
    if (middle.includes(null)) {
      console.error(
        `\nthe two readings are more than ${Math.round(AGREE * 100)}% apart: the machine is at other work, and nothing is written. Try again when it is quiet`,
      );
      process.exitCode = 1;
      return;
    }
    const out = Object.fromEntries(
      SCENARIOS.map((s, k) => [
        s.name,
        {
          relative: middle[k],
          ms: round((results[k].ms + again[k].ms) / 2),
          ref: round((results[k].ref + again[k].ref) / 2),
        },
      ]),
    );
    writeFileSync(BASELINE, `${JSON.stringify(out, null, 2)}\n`);
    console.log('baseline written, from the middle of the two');
    return;
  }

  let baseline: Partial<Record<string, { relative: number; ms: number }>>;
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as typeof baseline;
  } catch {
    console.error('no baseline: run npm run bench -- --update first');
    process.exitCode = 1;
    return;
  }
  let moved = 0;
  SCENARIOS.forEach((s, k) => {
    const now = results[k],
      was = baseline[s.name];
    if (!was) {
      console.log(`${s.name}: ${line(now)}, not in the baseline`);
      moved++;
      return;
    }
    const change = now.relative / was.relative - 1;
    const verdict = judge(was.relative, now.relative);
    if (verdict !== 'within tolerance') moved++;
    console.log(
      `${s.name}: ${line(now)}, ${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}% on the baseline (${verdict === 'within tolerance' ? verdict : verdict.toUpperCase()})`,
    );
  });
  if (moved) {
    console.error(
      `\n${moved} scenario${moved === 1 ? '' : 's'} moved from the baseline by more than ${TOLERANCE * 100}%: if that was meant, npm run bench -- --update, and say why`,
    );
    process.exitCode = 1;
  }
}

function line(r: Result): string {
  return `${r.ms.toPrecision(3)} ms a frame (${r.relative.toPrecision(3)} of the reference), a body awake in ${r.awake} of ${r.frames} frames`;
}

/** To three figures: a frame here is a thousandth of a millisecond, and four decimal places kept one figure of it. */
function round(n: number): number {
  return Number(n.toPrecision(3));
}
