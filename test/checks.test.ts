/**
 * What the checks themselves are held to. A check that fails for the
 * machine's reasons, and not the game's, is not believed the next time it
 * fails, and every game copied from here found one that did. What they
 * found is held here, so a game that rewrites its config is told what it
 * has dropped.
 */
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

describe('the checks', () => {
  it('give a test thirty seconds, so one that is only slow on a busy machine does not fail', ({ task }) => {
    // read from the runner and not from the config: what is held is the limit this test is itself run under
    expect(task.timeout).toBe(30_000);
  });

  it("lint this checkout, and not another session's worktree under it", async () => {
    const lint = new ESLint();
    for (const file of ['src/game.ts', 'scripts/bench.ts', 'test/game.test.ts', 'smoke/game.ts', 'vite.config.ts'])
      expect(await lint.isPathIgnored(`.claude/worktrees/another/${file}`), file).toBe(true);
    // the game itself is still linted: a config that ignored everything would have passed the lines above
    expect(await lint.isPathIgnored('src/game.ts')).toBe(false);
  });
});
