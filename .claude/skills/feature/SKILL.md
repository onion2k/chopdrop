---
name: feature
description: Build a feature from a short prompt, confidently, in any project that has a CLAUDE.md. Turns the prompt into a spec (acceptance criteria, edge cases, performance risk, test plan), gets it agreed, builds it test-first, and verifies it to the house definition of done with evidence. Use when the user asks for a new feature or a change to how the thing works or looks.
---

# /feature

Take a one-line feature request to a finished, verified feature. Follow the
phases in order. Do not start building until the user has agreed the spec.

The process here is the house's; the nouns are the project's. Before phase
1, read the project's CLAUDE.md for its commands, layout, model features,
test API, edge-case checklist and gates. If any of those is missing, say so
in the spec, find it from the code, and offer to write it into CLAUDE.md as
part of the work: the next feature should not have to look again.

Phases 1 and 2, understanding and the spec, are done in plan mode. Under
the `opusplan` model setting the stronger model works only in plan mode,
and the spec is where it counts: what is built is only as good as what was
agreed. So enter plan mode (`EnterPlanMode`) before phase 1 if the session
is not in it already, write the spec as the plan, and leave plan mode
(`ExitPlanMode`) only when the user has agreed it. Phase 3 on is built out
of plan mode, on whichever model the setting gives it.

Two kinds of feature come through here, and they are verified differently:
something **the user sees**, and a **tool**, which measures the project or
holds it to something. Phase 4 has a track for each.

## 1. Understand

- Read the relevant code before proposing anything: the core module the
  project's CLAUDE.md names, and whichever modules the feature touches.
- Find the nearest existing feature and how it is built, tested and shown.
  Use the model features CLAUDE.md names: one for things the user sees, one
  for tools.
- Note which paths from the project's edge-case checklist the feature can
  reach.

### Measure first, where the ask has a number in it

If the request names a figure — how long something takes, what a thing
should cost, how often something should happen — find out what that figure
is now, before writing a spec around it. A rough measurement is enough: a
short run, a sum over the content tables, an existing gate's output. Put it
in the spec.

A target agreed without a measurement is a target nobody knows the cost of.
Where the levers on offer cannot reach it, say so in the spec and give the
user the trade-off, rather than finding it out half way through the build.

## 2. Spec: show the user, and wait

Write a short spec and show it in chat. Keep it under a screen.

- **What:** the behaviour, in the user's terms.
- **Where it stands now:** the measurements from phase 1, for anything the
  request puts a number on.
- **Acceptance criteria:** numbered, each observable and testable.
- **Edge cases:** go through the project's checklist. Say what the feature
  does in each case that applies, and write "not reachable" for the rest.
- **Decisions:** only choices that are the user's to make: tuning feel,
  visuals, anything with more than one reasonable answer. Give a
  recommendation for each, and say what each would cost, from the
  measurements.
- **Performance risk:** what could cost boot time, download or frame time,
  against the project's budgets, and how it will be measured. For a tool,
  what it adds to the full check.
- **Test plan:**
  - unit tests, headless, on the core module
  - the end-to-end step through the test API
  - the fuzzer action, and any new invariant
  - the pictures to take
  - for a tool: the gate, its baseline, and how a change to it is told
    from noise

Ask the user to agree the spec or change it. Use AskUserQuestion only for
real decisions. The spec is the plan put to the user with `ExitPlanMode`:
their approval of it is the agreement, and nothing is built before it.

## 3. Build test-first

1. Write the acceptance criteria as failing tests.
   - Unit tests in the project's test directory, headless, with the seeded
     helpers the project's tests already use.
   - A step in the end-to-end test through the test API, paused and stepped.
   - Run them and see them fail for the right reason.
2. Build the feature. Logic goes in the core module or a module of its own,
   which is handed what it needs. The page only presents it through the
   core's events. Content goes where the project keeps content.
3. Extend the test API with whatever the tests need to set up or read the
   feature.
4. Add the fuzzer action: only what a user could do. Add any new always-true
   rule to the invariants.
5. Make the tests pass.

A tool is code like any other: its own working parts get their own unit
tests, not just the end-to-end run. A bug in the middle of a tool does not
throw — it quietly gives a wrong number, and an end-to-end run is a slow and
poor way to find it.

## 4. Verify: evidence, not belief

Do all of it, and keep the numbers and file paths for the report.

Both kinds:

- **The full check.** If a gate moved, rerun on other seeds before deciding
  it is real. Only update a baseline for an intended change, and say why.
- **The fuzzer** on the wider seed range the project's CLAUDE.md names,
  clean. Failures print a replay; fix the cause, never the check.
- **Mutation check.** Break the feature (or put the bug back), see the new
  tests fail, then restore it. A test that survives its mutation proves
  nothing: make it sharper until it fails.

Something the user sees, as well:

- **Performance.** The project's perf gate before and after (use
  `git stash` for the before), and the frame measured headless in any other
  scene the feature touches. Over budget is not done: the feature gets a
  rung the game steps down to, or is made cheaper.
- **Look.** Headless screenshots of the feature in every scene it appears
  in, at phone size if it has UI, and before/after where it changes
  something already there. Read every screenshot, and tune until it looks
  right.
- **The user's data.** If you used the dev browser, leave the user's save
  exactly as it was.

A tool, as well:

- **Trust the instrument before its figures.** Watch what it does, on
  several seeds, against behaviour already known to be good, and make it
  competent before reading anything into what it reports. A measuring tool
  that gets stuck, gives up early or plays badly reports a number that says
  more about the tool than the project.
- **The same seed gives the same answer**, run again and on another
  machine's core count.
- **Its gate holds both ways** where it is pacing or balance: quicker is as
  much a change as slower. Say what the tolerance is and why it is that
  wide.
- **What it costs the full check**, in seconds.

## 4a. When the evidence contradicts the spec

Stop and go back to phase 2. Do not tune towards a target the measurements
have just shown to be out of reach, and do not quietly pick a different one.

Report what was agreed, what the runs show, the options with their numbers,
and a recommendation. Build and land everything that stands regardless of
the answer — the tool, the gate, the tests, the docs — and leave the choice
open. Say plainly in the report and in the commit that it is still open.

## 5. Report

Report in chat, briefly:

- **Result:** what was built, in one or two sentences.
- **Acceptance criteria:** each one, and the test that proves it.
- **Checks:** results with numbers (tests, fuzz seeds and frames, each gate,
  frame costs before and after).
- **What the numbers show,** for a tool: what it says about the project now.
- **Bugs found and fixed** along the way, in the feature and in the tool
  itself.
- **Not verified:** anything you could not check, said plainly. A figure the
  tool cannot calibrate is not verified, however many runs back it.
- **CLAUDE.md:** anything added to it so the next feature finds its nouns.
- **Uncommitted:** say that nothing is committed until asked.
