/**

 *
 *   npm run pace                       the figures, seed by seed
 *   npm run pace:check                 held to scripts/pace-baseline.json
 *   npm run pace:check -- --update     the baseline written again, after a change meant to move it
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CHECK, median, moved, paceRun, round } from './pace';

const BASELINE = 'scripts/pace-baseline.json';

function main() {
  const args = process.argv.slice(2);
  const started = performance.now();
  const runs = CHECK.seeds.map((seed) => paceRun(seed));
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const figure = round(median(runs.map((r) => r.minutes)));
  const stuck = runs.filter((r) => !r.finished);
  for (const r of runs)
    console.log(
      `seed ${r.seed}: ${r.finished ? `${r.minutes} min to bank ${CHECK.balls}` : `stuck at ${CHECK.capMinutes} min`}`,
    );
  console.log(`median ${figure} min (${seconds} s)`);
  for (const r of stuck) console.error(`  seed ${r.seed} did not bank ${CHECK.balls} balls in ${CHECK.capMinutes} min`);
  if (stuck.length) process.exitCode = 1;
  if (!args.includes('--check')) return;

  if (args.includes('--update')) {
    if (stuck.length) {
      console.error('not written: fix these first');
      return;
    }
    writeFileSync(BASELINE, `${JSON.stringify({ minutes: figure }, null, 2)}\n`);
    console.log('pace baseline written');
    return;
  }
  let baseline: { minutes: number };
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as { minutes: number };
  } catch {
    console.error('no baseline: run npm run pace:check -- --update first');
    process.exitCode = 1;
    return;
  }
  const out = moved(baseline.minutes, figure);
  console.log(`pace: ${baseline.minutes} -> ${figure} min (${out ? 'MOVED' : 'within tolerance'})`);
  if (out) {
    console.error(
      `\nthe pacing moved beyond tolerance: if that was meant, npm run pace:check -- --update, and say why`,
    );
    process.exitCode = 1;
  }
}

main();
