# Chopdrop: working on it

An arcade helicopter game: fly about, pick deliveries up and set them down
where they are wanted. TypeScript, Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the
physics from [artshape-physics](https://github.com/onion2k/artshape-physics).
The README says what the game is; this file says how it is made. The house
rules in `~/.claude/CLAUDE.md` apply too. What is in `src/` is still the
template's stub, a sled shoving balls into a hole, until the first features
replace it; where this file names the sled, the balls or the hole, it means
the stub.

## The factory

This repo is a line that turns ideas into a browser game that loads fast,
draws fast and has no bugs, one feature at a time, and it holds those three
properties as numbers from the first commit. Every change goes down the same
line: a spec agreed, tests written and seen failing, the change built, every
gate run, the result looked at, the report made with evidence, then a
commit. The line does not skip a station, and it stops when a gate is red:
a red gate is fixed before anything else lands, never skipped with
`--no-verify` and never made green by moving its baseline.

The three properties, and what holds each:

- **Bug free.** Every rule that must always hold is in `src/invariants.ts`,
  and the fuzzer hunts for it. Every bug found becomes a test that would
  have caught it and, where it is a rule, an invariant; there is no list of
  known issues, because a bug found is fixed before the next feature. The
  same seed gives the same game, so every failure can be played again.
- **Loads fast.** Boot time and the gzipped download are measured by
  `npm run perf` in headless Chromium and held to a budget and a baseline.
- **Draws fast.** A frame's cost at the standard view is measured by the
  same gate, and the physics' by `npm run bench`. A feature that cannot fit
  the budget gets a rung the game steps down to on a slower machine, not a
  pass.

## Budgets

Numbers, held by gates, on this machine at 1280×800:

| Property                                               | Budget                         | Held by      |
| ------------------------------------------------------ | ------------------------------ | ------------ |
| Boot, page start to the frame loop running             | 3000 ms                        | `perf`       |
| Download, scripts and styles gzipped                   | 400 kB; baseline to the byte   | `perf`       |
| A frame drawn, the least of 24 at the standard view    | 8 ms                           | `perf`       |
| The physics, a frame, against the reference arithmetic | baseline ± 15%                 | `bench`      |
| Pace, the autopilot's minutes to bank ten balls        | baseline ± 20%                 | `pace:check` |
| Anything kept: bodies, slots, save bytes, heap         | ceilings in `scripts/leaks.ts` | `leaks`      |

A budget is what the game may cost at all; a baseline is what it cost at
the last commit, held both ways, so a step toward a budget is noticed as
much as a step over it. The perf tolerances are the measured wobble of a
headless boot and a GPU frame, and say so in `smoke/judging.ts`. The
download does not wobble, so it is held to the byte: a change that adds to
it writes the perf baseline again and says by how much, and one that
should not have is looked into.

## Commands

    npm run dev            the game at http://localhost:5202
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook; ~10 s)
    npm run check          all of it: check:quick, fuzz, determinism, leaks, pace, bench, smoke with perf and look (~20 s)
    npm test               unit tests (Vitest, test/)
    npm run fuzz           the game played at random, rules checked; -- --seed N plays one failure again
    npm run determinism    the same seed played twice, hashed, to catch chance not from the seed
    npm run leaks          an hour of play, watching what must stay bounded (10 min of it in check)
    npm run pace           the autopilot's pace, seed by seed; pace:check holds it to its baseline
    npm run bench          the physics' frame time held to scripts/bench-baseline.json, both ways
    npm run perf           boot, frame and download held to smoke/perf-baseline.json and the budget
    npm run smoke          the game in headless Chromium on the real GPU (Playwright, smoke/)
    npm run look           the scenes held to the pictures in smoke/screens, to the pixel

A unit test is allowed thirty seconds, and `vitest.config.ts` says why: the
limit is there to catch a test that never ends, and how fast the game steps
is the bench's to hold.

`--update` on `pace:check` or `bench`, `npm run perf:update` and `npm run
look:update` write a baseline again. Only through `/gate-moved`, only for a
change meant to move it, and the commit says why. Look at every picture.
The bench writes its baseline from two readings, and only where they agree:
a baseline written while the machine is at other work fails every run after
it.

## How the code is laid out

- `src/game.ts` is the game without the picture: everything that happens in
  the arena, a step at a time. It tells what happened through `GameEvents`,
  and knows nothing of the renderer or the page.
- `src/main.ts` is the page. It turns those events into words on the screen
  and draws the frame. There is no game logic here.
- `src/debug.ts` is `window.game`, the test API. `src/invariants.ts` lists
  the rules that must always hold. `src/autopilot.ts` plays the game by
  itself, for the gates.
- Content (the floor, the hole, the balls) lives in `arena.ts`. The save
  lives in `progress.ts`. Chance comes from `random.ts`, handed in.
- `src/physics.ts` is the game's side of artshape-physics, and nothing else
  imports the package directly. A change a package needs goes in that repo,
  with a version bump here.

## Skills

In `.claude/skills`, and they come with every game copied from here:
**/feature** builds one, spec and tests first; **/bug** fixes one,
reproduction first; **/gate-moved** decides what a moved baseline means
before anything is written; **/commit** commits in the house style.

## Model features

What to copy the shape of, when building something new:

- **In the arena:** the ball and the hole. The ball is a body kind in
  `arena.ts`, drawn by `scene.ts`, banked by `game.ts`, counted by
  `invariants.ts`, read by `debug.ts`, and pictured in `smoke/look.spec.ts`.
  These are the stub's, and stay until the first feature lands and replaces
  them with the game's own.
- **Tools:** the fuzzer (`scripts/fuzzer.ts`), the pace gate
  (`scripts/pace.ts`) and the bench (`scripts/bench.ts`, its arithmetic in
  `scripts/benching.ts`). Each has unit tests of its own working parts. The
  bench passed a frame made thirty times slower until it was made to fail
  one on purpose: a gate is trusted once it has been seen to fail what it
  is for.
- **Test helpers:** `newGame(seed)` in `test/helpers.ts`, and `memoryStore`
  in `src/progress.ts` for a save that is not the player's.

## Replacing the stub

The stub gives way one feature at a time, through `/feature`, every gate
green at each step. `arena.ts` is the content and usually goes first; the
tile grid, the rock and the hole are the physics package's terms and can
stay. The ball is the one body kind: a new kind is a radius and a name in
the content, a mesh and a group in `scene.ts`, and a line in the invariants.
The sled is the player's machine and goes last, since the autopilot, the
fuzzer's `aim` and the smoke tests all drive it. When a thing a gate holds
goes, the gate is handed its replacement in the same change: a gate that
holds nothing is worse than none, because it looks like it does.

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
  be emptied somewhere, and its ceiling named in `scripts/leaks.ts`.
- **Loading is the first frame's business.** Everything the first frame
  needs is built before `ready`; everything else after it. A dependency is
  weighed against the download budget before it is added.
- **Every kind of thing is handled everywhere.** A new body kind, event,
  save field or scene has to work in every path it can reach.
- **Save compatibility.** A new save field needs a default in `progress.ts`
  and a save in the new shape in `test/saves/`; the corpus test fails until
  it is there.
- **Match the style.** Comments are full sentences in the house voice,
  saying why and not what. Prettier decides the formatting.

## Definition of done

The house's nine points, in `~/.claude/CLAUDE.md`. Here, they mean: unit
tests in `test/`, a stage in `smoke/progress.spec.ts`, an action in
`scripts/fuzzer.ts` and a rule in `src/invariants.ts`, a size in
`scripts/leaks.ts` for anything kept, the perf figures before and after in
the report and within budget, `measureFrame` in any other scene touched, and
a picture in `smoke/look.spec.ts`. `npm run check` green, and
`npm run fuzz -- --seeds 1-24` clean.

## Edge-case checklist

For anything new in the arena, check what it does:

- **the hole:** pushed down it
- **the sled:** shoved by it, driven over, pinned against the rock
- **save:** saved, reloaded, and loaded from an old save without the field
- **rock:** against the wall and in the corners; never left in rock
- **scale:** many at once, at capacity (`BODY_CAPACITY`); and what it costs
  a frame at that many
- **phone:** narrow screen, and a slower GPU: which rung it steps down to
- **the helicopter:** flown into, landed on, hovered over, caught in its
  downwash, lifted and carried by it
- **a delivery:** picked up, carried, set down where it is wanted and where
  it is not, dropped from height or at speed, picked up again after a drop,
  and two wanted at once
- **height:** on the ground, at the most the helicopter can climb to, and at
  rest in the air
- **the edge of the world:** flown at, carried past, dropped over
- **the camera:** following at full speed, and behind something tall

## Verifying in a browser

Use headless Playwright (`start()` in `smoke/game.ts`) for anything seen or
measured; the in-app browser pane pauses when hidden. Control time through
the API: `pause()`, `seed(n)`, then `step(frames)`, never a timeout. Never
write over the player's save; a test save goes in through `start(page, {
save })`.

## Commits

Commit only when asked, through `/commit`: a sentence summary in the house
voice, a body saying what changed and why, two commits when a refactor and
a feature land together. The pre-commit hook runs `check:quick`.
