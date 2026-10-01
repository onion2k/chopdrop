/**
 * The pace gate: see `pace.ts`.
 *
 *   npm run pace                       the figures, level by level and seed by seed
 *   npm run pace:check                 held to scripts/pace-baseline.json
 *   npm run pace:check -- --update     the baseline written again, after a change meant to move it
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CHECK, compare, levels, median, paceRun, round } from './pace';

const BASELINE = 'scripts/pace-baseline.json';

function main() {
  const args = process.argv.slice(2);
  const started = performance.now();
  const figures: Record<string, number> = {};
  const stuck: string[] = [];
  for (const level of levels()) {
    const runs = CHECK.seeds.map((seed) => paceRun(level, seed));
    figures[level] = round(median(runs.map((r) => r.minutes)));
    const each = runs.map((r) => (r.finished ? `${r.minutes}` : 'stuck')).join(', ');
    console.log(`${level}: ${figures[level]} min to the end (seeds ${CHECK.seeds.join(', ')}: ${each})`);
    for (const r of runs.filter((r) => !r.finished))
      stuck.push(`seed ${r.seed} did not get to the end of ${level} in ${CHECK.capMinutes} min`);
  }
  console.log(`(${((performance.now() - started) / 1000).toFixed(1)} s)`);
  for (const line of stuck) console.error(`  ${line}`);
  if (stuck.length) process.exitCode = 1;
  if (!args.includes('--check')) return;

  if (args.includes('--update')) {
    if (stuck.length) {
      console.error('not written: fix these first');
      return;
    }
    writeFileSync(BASELINE, `${JSON.stringify({ levels: figures }, null, 2)}\n`);
    console.log('pace baseline written');
    return;
  }
  let baseline: { levels?: Record<string, number> };
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as { levels?: Record<string, number> };
  } catch {
    console.error('no baseline: run npm run pace:check -- --update first');
    process.exitCode = 1;
    return;
  }
  const wrong = compare(baseline.levels ?? {}, figures);
  console.log(`pace: ${wrong.length ? 'MOVED' : 'every level within tolerance'}`);
  if (wrong.length) {
    for (const line of wrong) console.error(`  ${line}`);
    console.error(
      `\nthe pacing moved beyond tolerance: if that was meant, npm run pace:check -- --update, and say why`,
    );
    process.exitCode = 1;
  }
}

main();
