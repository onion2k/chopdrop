---
name: bug
description: Fix a bug from a report, a fuzz seed or something seen in play, reproduction first. Turns the report into a failing test that fails for the reported reason, adds the rule to the invariants if there is one, fixes the cause and not the check, and verifies it with the fuzzer and a mutation check. Use when the user reports something wrong, or a gate or the fuzzer has failed.
---

# /bug

Take a report of something wrong to a fix with a test that would have caught
it. Follow the phases in order. Nothing is fixed before it is reproduced.

## 1. Understand

- What was seen, where, and what should have happened instead. If the
  report is short on any of these, say what you are assuming.
- Read the code that owns the behaviour before proposing anything: the
  project's CLAUDE.md says where each thing lives.
- If it came from the fuzzer, play the seed again first:
  `npm run fuzz -- --seed N`, and read what was done before it went wrong.
  If it came from a gate, `/gate-moved` decides whether it is a bug at all.

## 2. Reproduce, as a test that fails for the right reason

- A unit test in `test/`, on the core module, headless, seeded: the smallest
  setup that shows it. Where the bug is only reachable through the page,
  a stage in the smoke play-through through the test API instead.
- Run it and see it fail, and check the failure is the reported thing and
  not a mistake in the test.
- If it cannot be reproduced, stop and say so, with what was tried. A fix
  without a reproduction is a guess, and the report says it is one.

## 3. Is it a rule?

If what went wrong is a state the game should never be in, whatever the
feature, write it into the invariants before the fix. The fuzzer then hunts
for it from now on, and the test in phase 2 may be as simple as the rule
holding.

## 4. Fix the cause

The smallest change that fixes the cause, in the module that owns it. Never
the check: a rule loosened, a tolerance widened or a test adjusted to pass
is not a fix, and the report must say if that was done and why.

Go through the project's edge-case checklist for what else the change can
reach, and add a test for each case that applies.

## 5. Verify

- The new test passes, and the whole of `npm run check` is green.
- `npm run fuzz -- --seeds 1-24` clean.
- **Mutation check:** take the fix out, see the new test fail, put it back.
- If the bug was in something seen, a picture of it fixed, looked at.

## 6. Report

- **Cause:** what was actually wrong, in a sentence or two.
- **Fix:** what changed, and where.
- **The test** that would have caught it, and any rule added.
- **Else affected:** what the change can reach, and what was checked.
- **Not verified:** anything you could not check, said plainly.
- Nothing is committed until asked.
