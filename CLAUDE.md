# Chopdrop: working on it

An arcade helicopter game: fly about, pick deliveries up and set them down
where they are wanted. TypeScript, Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the
physics from [artshape-physics](https://github.com/onion2k/artshape-physics).
The README says what the game is; this file says how it is made. The house
rules in `~/.claude/CLAUDE.md` apply too.

The helicopter is built, and the island it flies over: flown from the
keyboard or by touch, with a chase camera, over land and sea made at boot
from a recipe, its trees bowing in the rotor's downwash, and one level: a
parcel picked up on the meadow pad and delivered to the hilltop pad. Nothing
else is: no second level, no physics and no save. The template's stub, a sled
shoving balls into a hole, was taken out in the second commit. The first commit, `eda26d8`, has the
stub and every gate that held it: it is the model to copy from, and
`git show eda26d8:<path>` reads any of it.

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

- **Bug free.** Every rule that must always hold is in `src/invariants.ts`,
  and the fuzzer hunts for it. Every bug found becomes a test that would
  have caught it and, where it is a rule, an invariant. The same seed gives
  the same game, so every failure can be played again.
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
    npm run check          all of it: check:quick, fuzz, then smoke with perf and look (~20 s)
    npm test               unit tests (Vitest, test/)
    npm run fuzz           the game played at random, rules checked; -- --seed N plays one failure again
    npm run perf           boot, frame and download held to smoke/perf-baseline.json and the budget;
                           the chase and downwash views' frames told, not held
    npm run smoke          the game in headless Chromium on the real GPU (Playwright, smoke/)
    npm run look           the scenes held to the pictures in smoke/screens, to the pixel

A unit test is allowed thirty seconds, and `vitest.config.ts` says why: the
limit is there to catch a test that never ends.

`npm run perf:update` and `npm run look:update` write a baseline again. Only
through `/gate-moved`, only for a change meant to move it, and the commit
says why. Look at every picture.

## How the code is laid out

- `src/game.ts` is the game without the picture: the island, the
  helicopter, the trees it has set swaying, the delivery and the clock, a
  step at a time, and `restart`. It knows nothing of the renderer or the
  page; what happens in it is told through the `GameEvents` handed in.
  `src/delivery.ts` is the level: the parcel's stages, the ring that fills
  while the helicopter is landed on the pad it is wanted on (`onPad`, said
  once), and the clock from the first lift-off; the levels themselves are
  content, `LEVELS` in `arena.ts`.
- `src/helicopter.ts` is the player's machine: the flight, and the numbers
  and size in `HELICOPTER`, said once. It is handed a ground, an edge and
  the height of what it can stand on at every point, not the island.
- `src/main.ts` is the page. It draws the frame, and turns the game's
  events into words on the screen through `src/hud.ts`: the objective, the
  arrow and distance to the pad wanted, the ring, and the card at the end
  with "Fly again". There is no game logic here.
  `src/input.ts` turns keys or touch into `Controls`, whichever was used
  last: the stick and the lever are worked out in `src/touch.ts`, fed
  fingers as numbers and tested headless, and drawn and fed by the page in
  `src/touch-view.ts`; `src/chase.ts` is the camera
  rig, stepped with the game so the pictures repeat, and handed the ground
  so that it stays above it and the canopy (`src/canopy.ts`, the top of the
  crowns over a point, built by `game.ts`) so that it is never in a tree,
  looking ahead along its way to rise in time.
- `src/downwash.ts` is the air under the rotor: `washAt` says how it blows
  at a point, from where the helicopter is and how fast its rotor turns.
  `src/sway.ts` is the trees in it, a pool of those moving, sized once, each
  sprung back upright and let go when it is still; `scene.ts` leans them
  from their feet by what it says. Both find the trees near a point through
  `src/tree-grid.ts`, the trees sorted into squares once.
- `src/debug.ts` is `window.game`, the test API: time, the seed, the
  helicopter (`fly`, whose lift of `HOVER_LIFT` holds the height, since
  nothing held sinks; `release`; `teleport`, which takes a height above the
  ground and not a height above the sea), the ground (`groundAt`), what is
  on the island (`content`: the pads, home, the bounds and the ceiling), the
  level (`state().delivery`, `events()`, which takes what the game has
  told, and `restart`), the trees (`treesNear`, each with its height and
  spread as drawn, and `sway`:
  which are moving and how each leans), the
  camera (`look` parks it, `chase` sends it back), how it is being flown
  (`state().input`: keys or touch, the controls read and the lever) and
  measuring. Real fingers come from `fingers` in `smoke/game.ts`, through
  Chromium's touch protocol, several at once. Each thing
  put on the island gains here what a test needs to place it and read it
  back.
- `src/invariants.ts` lists the rules that must always hold;
  `scripts/fuzzer.ts` plays the game at random and checks them.
- Content lives in `arena.ts`: the island's recipe, with every number
  named, and the one island built from it once. The generator is
  `island.ts`, the same for any recipe; `heightfield.ts` is the grid it
  works on, sampled on the triangles that are drawn, and the algorithms
  that read a grid (the flood, the flow, the distances); `noise.ts` is the
  seeded noise. Chance comes from `random.ts`, handed in. `scene.ts` is the
  island and the helicopter as drawn; `matrix.ts` places, tilts and spins;
  `meshes.ts` builds the shapes.
- There is no physics or save yet. `artshape-physics` stays pinned in
  `package.json`, and `src/physics.ts` comes back as the one door to it with
  the first body; nothing else imports the package. A change it needs goes
  in that repo, with a version bump here.

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

- **The save** (`src/progress.ts`, `test/saves/`, the save in
  `smoke/game.ts`'s `start`), with the first thing kept between visits. Its
  key is `chopdrop-save-v1`.
- **The physics, the bench and the body invariants** (`src/physics.ts`,
  `scripts/bench.ts`, `scripts/benching.ts`), with the first body on the
  island, a delivery most likely.
- **The autopilot, determinism, leaks and pace** (`src/autopilot.ts`,
  `scripts/determinism*.ts`, `scripts/leak*.ts`, `scripts/pace*.ts`), with
  the first thing the game can be played to: a delivery made. Pace becomes
  minutes to make a number of deliveries. The leak watch gains a line for
  the trees moving in the downwash (`sway.count`, its ceiling
  `SWAY.capacity`), held until then by the invariants.
- **The play-through** (`smoke/progress.spec.ts`), with the first thing a
  player can finish.

The invariants and the fuzzer came back with the helicopter.

## Model features

- **The helicopter**, for anything a player flies or that moves: its flight
  in `helicopter.ts`, handed the island's ground by `game.ts` and held
  between that and its ceiling; drawn by `scene.ts` as a group per colour
  and one per rotor, placed by `placeFrame` and `placePart`; followed by
  `chase.ts`, above the ground and the treetops; flown by `input.ts`; read
  and set by `debug.ts`; ruled by `invariants.ts`, the camera by
  `checkCamera`; played by the fuzzer's actions, the camera stepped beside
  it;
  flown by key in `smoke/game.spec.ts`, and pictured in
  `smoke/look.spec.ts` (`chase.png`, `turning.png`, and `clearing.png` for
  the camera over a wood).
- **The delivery**, for anything the player is asked to do: its stages in
  `delivery.ts`, its pads in `LEVELS`, stepped by `game.ts` after the
  helicopter and told through `GameEvents`; the crate and the beacon drawn
  by `scene.ts` from where it has got to; put into words by `hud.ts`; read
  and restarted through `debug.ts`; ruled by `checkDelivery`; flown by the
  fuzzer's "wanted pad" and "fly again"; flown through by key and by touch
  in `smoke/game.spec.ts`, and pictured (`level-loading.png`,
  `level-carrying.png`, `level-delivered.png`, and on a phone).
- **The island**, for anything on the land: its recipe in `arena.ts`,
  generated by `island.ts` from `heightfield.ts` and `noise.ts`, once, at
  boot. Its ground, the land and the water over it and the pads' tops, is
  what the helicopter and the camera stand on, on the very triangles that
  are drawn; `scene.ts` draws it as a group for each surface and each kind
  of water, the pads and the trees; `debug.ts` reads it through `content()`
  and `groundAt`; the invariants hold the helicopter to its ground; the
  fuzzer flies it, off the pads and onto them, and low at rising land.
- **The trees**, for scenery there are thousands of: placed by habitat in
  `island.ts`, shaped to about a hundred and fifty triangles a crown in
  `meshes.ts`, and drawn by `scene.ts` instanced, a trunk group and a crown
  group a kind, each tree's colour moved a little by its own shade. They
  are moving groups, since a still one cannot be written again, and a kind
  is written only on a frame one of its trees moves.
- **The downwash**, for anything the rotor's air moves: `washAt` in
  `downwash.ts`, taken by `sway.ts` for the trees, which `game.ts` steps
  after the helicopter; leaned by `scene.ts` with `lean`; read by `debug.ts`
  (`sway`); ruled by `checkSway` in `invariants.ts`, against the wash it
  was last stepped in; played by the fuzzer's forest run; brought down into
  a wood by key in `smoke/game.spec.ts`; pictured in `downwash.png`; its
  frame told by the perf gate in the wood at `WOOD` (`smoke/game.ts`).
- **The stub's ball**, for a body: a body kind in `arena.ts`, drawn by
  `scene.ts`, banked by `game.ts`, counted by `invariants.ts`, read by
  `debug.ts`, and pictured, all in `eda26d8`.
- **The gates** that are here now are each a model for the next: the perf gate
  (`smoke/perf.spec.ts`, its judging in `smoke/judging.ts`), the look gate
  (`smoke/look.spec.ts`, seen to fail a small button), the fuzzer (seen to
  fail a helicopter let past its ceiling, and one let past its top speed), and
  the frame's measuring (`src/frame-cost.ts`). A gate is trusted once it has
  been seen to fail what it is for.

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
other scene touched, and a picture in `smoke/look.spec.ts`. An action in
the fuzzer and a rule in the invariants for anything a player can do.
Every gate still to come back that the change gives something to hold is
brought back and handed it, as above: a size in `scripts/leaks.ts` for
anything kept, a stage in the play-through for anything a player can
finish. `npm run check` green, and `npm run fuzz -- --seeds 1-24` clean.

## Edge-case checklist

For anything new in the arena, check what it does:

- **the helicopter:** flown into, landed on, hovered over, caught in its
  downwash, lifted and carried by it
- **a delivery:** picked up, carried, set down where it is wanted and where
  it is not, dropped from height or at speed, picked up again after a drop,
  and two wanted at once
- **height:** on the ground, at the most the helicopter can climb to, and at
  rest in the air
- **the land and the edge of the world:** hills, water and the edge flown
  at, carried past, dropped over, in the corners; never left inside the
  land
- **the camera:** following at full speed, and behind something tall
- **save:** saved, reloaded, and loaded from an old save without the field
- **scale:** many at once, at capacity; and what it costs a frame at that
  many
- **phone:** narrow screen, touch where there is no keyboard, and a slower
  GPU: which rung it steps down to

## Verifying in a browser

Use headless Playwright (`start()` in `smoke/game.ts`) for anything seen or
measured; the in-app browser pane pauses when hidden. Control time through
the API: `pause()`, `seed(n)`, then `step(frames)`, never a timeout; fly
with `fly()` or real keys, and take a fixed view with `look()`. Never
write over the player's save; once there is one, a test save goes in
through `start(page, { save })`, as in the first commit.

## Commits

Commit only when asked, through `/commit`: a sentence summary in the house
voice, a body saying what changed and why, two commits when a refactor and
a feature land together. The pre-commit hook runs `check:quick`.
