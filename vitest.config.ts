import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // A test is timed out only so that one which never ends is caught: how fast the game steps is the bench's to
    // hold, not this. Vitest's own five seconds failed tests at random in three games copied from here, each a test
    // that plays the real game for a few seconds, on a busy machine and on a CI runner a third the speed of the
    // one they were written on. The tests here take a thirtieth of a second at most; a game's will not.
    testTimeout: 30_000,
  },
});
