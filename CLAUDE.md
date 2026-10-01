# Chopdrop: working on it

An arcade helicopter game: fly about, pick deliveries up and set them down
where they are wanted. TypeScript, Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the
physics from [artshape-physics](https://github.com/onion2k/artshape-physics).
The README says what the game is; this file says how it is made. The house
rules in `~/.claude/CLAUDE.md` apply too.

Nothing of the game is built yet. The template's stub, a sled shoving balls
into a hole, was taken out in the second commit, and the floor is empty
until the first features put the helicopter and the deliveries on it. The
first commit, `eda26d8`, has the stub and every gate that held it: it is
the model to copy from, and `git show eda26d8:<path>` reads any of it.

## The factory

This repo is a line that turns ideas into a browser game that loads fast,
draws fast and has no bugs, one feature at a time, and it holds those three
properties as numbers. Every change goes down the same line: a spec agreed,
tests written and seen failing, the change built, every gate run, the result
looked at, the report made with evidence, then a commit. The line does not
skip a station, and it stops when a gate is red: a red gate is fixed before
anything else lands, never skipped with `--no-verify` and never made green
by moving its baseline.

The three properties, and what holds each:

- **Bug free.** For now, the unit and smoke tests alone. The rules that must
  always hold go in `src/invariants.ts`, and the fuzzer hunts for them; both
  come back with the first thing on the floor (see below). Every bug found
  becomes a test that would have caught it and, where it is a rule, an
  invariant. The same seed gives the same game, so every failure can be
  played again.
- **Loads fast.** Boot time and the gzipped download are measured by
  `npm run perf` in headless Chromium and held to a budget and a baseline.
- **Draws fast.** A frame's cost at the standard view is measured by the
  same gate. A feature that cannot fit the budget gets a rung the game steps
  down to on a slower machine, not a pass.

## Budgets

Numbers, held by gates, on this machine at 1280×800:

| Property                                            | Budget                       | Held by |
| --------------------------------------------------- | ---------------------------- | ------- |
| Boot, page start to the frame loop running          | 3000 ms                      | `perf`  |
| Download, scripts and styles gzipped                | 400 kB; baseline to the byte | `perf`  |
| A frame drawn, the least of 24 at the standard view | 8 ms                         | `perf`  |

A budget is what the game may cost at all; a baseline is what it cost at
the last commit, held both ways, so a step toward a budget is noticed as
much as a step over it. The perf tolerances are the measured wobble of a
headless boot and a GPU frame, and say so in `smoke/judging.ts`. The
download does not wobble, so it is held to the byte: a change that adds to
it writes the perf baseline again and says by how much, and one that
should not have is looked into.

The first commit also held the physics' frame against reference arithmetic
(`bench`, baseline ± 15%), the pace of play (`pace:check`, baseline ± 20%)
and everything kept (ceilings in `scripts/leaks.ts`). Each comes back as a
row here with the first thing it can hold.

## Commands

    npm run dev            the game at http://localhost:5202
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook)
    npm run check          all of it: check:quick, then smoke with perf and look
    npm test               unit tests (Vitest, test/)
    npm run perf           boot, frame and download held to smoke/perf-baseline.json and the budget
    npm run smoke          the game in headless Chromium on the real GPU (Playwright, smoke/)
    npm run look           the scenes held to the pictures in smoke/screens, to the pixel

A unit test is allowed thirty seconds, and `vitest.config.ts` says why: the
limit is there to catch a test that never ends.

`npm run perf:update` and `npm run look:update` write a baseline again. Only
through `/gate-moved`, only for a change meant to move it, and the commit
says why. Look at every picture.

## How the code is laid out

- `src/game.ts` is the game without the picture: for now the walled floor
  and the clock, a step at a time. It knows nothing of the renderer or the
  page. What happens in it will be told through a `GameEvents` handed in, as
  the first commit's does.
- `src/main.ts` is the page. It draws the frame, and will turn the game's
  events into words on the screen. There is no game logic here.
- `src/debug.ts` is `window.game`, the test API: time, the seed, the camera
  and measuring. Each thing put on the floor gains here what a test needs to
  place it and read it back.
- Content (the floor and the rock round it) lives in `arena.ts`. Chance
  comes from `random.ts`, handed in. `scene.ts` is the arena as drawn.
- There is no physics, save or controls yet. `artshape-physics` stays pinned
  in `package.json`, and `src/physics.ts` comes back as the one door to it
  with the first body; nothing else imports the package. A change it needs
  goes in that repo, with a version bump here.

## Skills

In `.claude/skills`, and they come with every game copied from the
template: **/feature** builds one, spec and tests first; **/bug** fixes one,
reproduction first; **/gate-moved** decides what a moved baseline means
before anything is written; **/commit** commits in the house style.

## Bringing the gates back

The stub was the subject of most of the gates, so they went with it rather
than stand there holding nothing: a gate that holds nothing is worse than
none, because it looks like it does. Each comes back from `eda26d8` with
the first feature that gives it something to hold, in the same change, with
its `package.json` script, its place in `npm run check` and its unit tests:

- **The invariants and the fuzzer** (`src/invariants.ts`,
  `scripts/fuzzer.ts`, `scripts/fuzz.ts`), with the first thing a player can
  do: an action for each thing, and a rule for what must hold of it.
- **The save** (`src/progress.ts`, `test/saves/`, the save in
  `smoke/game.ts`'s `start`), with the first thing kept between visits. Its
  key is `chopdrop-save-v1`.
- **The physics, the bench and the body invariants** (`src/physics.ts`,
  `scripts/bench.ts`, `scripts/benching.ts`), with the first body on the
  floor, a delivery most likely.
- **The autopilot, determinism, leaks and pace** (`src/autopilot.ts`,
  `scripts/determinism*.ts`, `scripts/leak*.ts`, `scripts/pace*.ts`), with
  the first thing the game can be played to: a delivery made. Pace becomes
  minutes to make a number of deliveries.
- **The play-through** (`smoke/progress.spec.ts`), with the first thing a
  player can finish.

What the stub was built of is the shape to copy: the ball was a body kind
in `arena.ts`, drawn by `scene.ts`, banked by `game.ts`, counted by
`invariants.ts`, read by `debug.ts`, and pictured in `smoke/look.spec.ts`.
The gates that are here now are each a model for the next: the perf gate
(`smoke/perf.spec.ts`, its judging in `smoke/judging.ts`), the look gate
(`smoke/look.spec.ts`, seen to fail a small button), and the frame's
measuring (`src/frame-cost.ts`). A gate is trusted once it has been seen to
fail what it is for.

## Rules for the code

- **No tight coupling.** A module takes what it needs as arguments or
  options. It does not import game state, and lower modules do not import
  content. `main.ts` is the only place that wires everything together.
- **Chance is handed in.** `Game` takes a `random`; nothing in `src/` calls
  `Math.random` itself.
- **Nothing is made each frame.** Pools are sized once and written into;
  the renderer's groups are fixed and `move` writes them. A per-frame
  allocation is a frame-time bug and a garbage-collection stutter.
- **Nothing is kept for ever.** A list, map or cache that is added to has to
  be emptied somewhere, and its ceiling named in `scripts/leaks.ts`, which
  comes back with the first one.
- **Loading is the first frame's business.** Everything the first frame
  needs is built before `ready`; everything else after it. A dependency is
  weighed against the download budget before it is added.
- **Every kind of thing is handled everywhere.** A new body kind, event,
  save field or scene has to work in every path it can reach.
- **Save compatibility.** Once there is a save, a new field needs a default
  in `progress.ts` and a save in the new shape in `test/saves/`; the corpus
  test fails until it is there.
- **Match the style.** Comments are full sentences in the house voice,
  saying why and not what. Prettier decides the formatting.

## Definition of done

The house's nine points, in `~/.claude/CLAUDE.md`. Here, they mean: unit
tests in `test/`, a test in `smoke/` through the test API, the perf figures
before and after in the report and within budget, `measureFrame` in any
other scene touched, and a picture in `smoke/look.spec.ts`. Every gate the
change gives something to hold is brought back and handed it, as above:
an action in the fuzzer and a rule in the invariants for anything a player
can do, a size in `scripts/leaks.ts` for anything kept, a stage in the
play-through for anything a player can finish. `npm run check` green.

## Edge-case checklist

For anything new in the arena, check what it does:

- **the helicopter:** flown into, landed on, hovered over, caught in its
  downwash, lifted and carried by it
- **a delivery:** picked up, carried, set down where it is wanted and where
  it is not, dropped from height or at speed, picked up again after a drop,
  and two wanted at once
- **height:** on the ground, at the most the helicopter can climb to, and at
  rest in the air
- **the wall and the edge of the world:** flown at, carried past, dropped
  over, in the corners; never left inside the rock
- **the camera:** following at full speed, and behind something tall
- **save:** saved, reloaded, and loaded from an old save without the field
- **scale:** many at once, at capacity; and what it costs a frame at that
  many
- **phone:** narrow screen, touch where there is no keyboard, and a slower
  GPU: which rung it steps down to

## Verifying in a browser

Use headless Playwright (`start()` in `smoke/game.ts`) for anything seen or
measured; the in-app browser pane pauses when hidden. Control time through
the API: `pause()`, `seed(n)`, then `step(frames)`, never a timeout. Never
write over the player's save; once there is one, a test save goes in
through `start(page, { save })`, as in the first commit.

## Commits

Commit only when asked, through `/commit`: a sentence summary in the house
voice, a body saying what changed and why, two commits when a refactor and
a feature land together. The pre-commit hook runs `check:quick`.
