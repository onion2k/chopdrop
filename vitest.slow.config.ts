import { defineConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * The slow run: the same tests, with every case of each sweep in `test/slow.ts` tried and not only the first. Only the
 * files that hold a sweep are run, since the rest are quick and already in the quick check.
 */
export default defineConfig({
  test: {
    ...base.test,
    include: ['test/autopilot.test.ts'],
    env: { CHOPDROP_SLOW: '1' },
  },
});
