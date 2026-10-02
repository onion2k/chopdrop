# Chopdrop: working on it

An arcade helicopter game: fly about, pick deliveries up and set them down
where they are wanted. TypeScript, Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the
physics from [artshape-physics](https://github.com/onion2k/artshape-physics).
The README says what the game is; this file says how it is made. The house
rules in `~/.claude/CLAUDE.md` apply too.

The helicopter is built, and the island it flies over: flown from the
keyboard or by touch, with a chase camera, over land and sea made at boot
from a recipe, its trees bowing in the rotor's downwash, seven structures
(two bridges and five pairs of towers) that stand solid in every level and
are collected by flying through them, and seven levels, four deliveries, two ring trials
and a course. The game opens flying free from home, nothing locked: a level
begins where its first step is done, on a pad with a crate waiting or
through a start ring or the towers, one at a time, and the best time on
each is kept in a save, with the structures collected. Ten hidden packages
with a radar are still to come (the plan is
`~/.claude/plans/glimmering-shimmying-wigderson.md`), and there is no
physics. The template's stub, a sled
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

The game itself is held too, played by the autopilot:

| Property                                              | Held to                                            | Held by       |
| ----------------------------------------------------- | -------------------------------------------------- | ------------- |
| Each level flown to its end, game minutes, median 1-4 | `scripts/pace-baseline.json`, each ± 2%, both ways | `pace:check`  |
| The same seed played twice is the same game           | seeds 1-6, 3600 frames, hashed every 300           | `determinism` |
| What is kept stays bounded over ten game minutes      | ceilings in `scripts/leaks.ts`                     | `leaks:check` |

The autopilot flies the same way every run and, with nothing in the game
drawing on chance yet, on every seed, so the pace does not wobble and is
held close; `pace.ts` says why. The first commit also held the physics'
frame against reference arithmetic (`bench`, baseline ± 15%), which comes
back with the first body.

## Commands

    npm run dev            the game at http://localhost:5202
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook)
    npm run check          all of it: check:quick, fuzz, determinism, leaks, pace, then smoke with perf and look (~70 s)
    npm test               unit tests (Vitest, test/)
    npm run fuzz           the game played at random, rules checked; -- --seed N plays one failure again,
                           -- --level ID begins one level at once on every seed
    npm run perf           boot, frame and download held to smoke/perf-baseline.json and the budget;
                           the chase and downwash views' frames told, not held
    npm run smoke          the game in headless Chromium on the real GPU (Playwright, smoke/)
    npm run look           the scenes held to the pictures in smoke/screens, to the pixel
    npm run determinism    seeds flown twice by the autopilot, the same each time
    npm run leaks          an hour flown, watching what is kept (leaks:check, in the check, is ten minutes)
    npm run pace           game minutes to fly each level to its end (pace:check holds them; -- --update writes them)

A unit test is allowed thirty seconds, and `vitest.config.ts` says why: the
limit is there to catch a test that never ends.

`npm run perf:update`, `npm run look:update` and `npm run pace:check --
--update` write a baseline again. Only
through `/gate-moved`, only for a change meant to move it, and the commit
says why. Look at every picture.

## How the code is laid out

- `src/game.ts` is the game without the picture: the island, the
  helicopter, the trees it has set swaying, the level going if one is, and
  its clock, a step at a time; `begin`, `abandon`, `guide` (the level the
  HUD shows the way to the start of), `home`, and `last`, the level last
  done. It knows nothing of the renderer or the page; what happens in it is
  told through the `GameEvents` handed in. With nothing going,
  `src/starts.ts` says when the helicopter has done a level's first step:
  a full load on a crate's pad, or a start ring or opening flown through;
  a pad a level ended on starts nothing until the helicopter lifts off.
  `src/mission.ts` is the level going, or none: `begin` starts it with its
  first step done, and its steps are done in order (a parcel picked up, a
  parcel dropped, a ring or an opening flown through, a landing), the
  loading that fills while the helicopter is landed on the pad it is wanted
  on (`onPad`, said once), a ring or a gate passed by one rule, `crossed`,
  the helicopter's middle crossing its opening the way it faces, and the
  clock from the first step; the levels themselves are content, `LEVELS` in
  `arena.ts`, each known by an `id` that is a name.
  `src/solids.ts` is what the helicopter cannot enter, the structures'
  blocks, kept, and the level's ring tubes, handed to it as the ground is:
  it is pushed out and knocked back. It also says how far a point is from
  the nearest block, for the camera.
- `src/helicopter.ts` is the player's machine: the flight, and the numbers
  and size in `HELICOPTER`, said once. It is handed a ground, an edge and
  the height of what it can stand on at every point, not the island.
- `src/main.ts` is the page. It draws the frame, and turns the game's
  events into words on the screen through `src/hud.ts`: the hint while
  flying free, the way to a start when shown it, the objective, the arrow
  and distance to what is wanted, the loader, the corner button to the
  panel, and the toasts, a level's end or a structure collected, queued and
  each shown for game seconds. `src/panel.ts` is the panel (Esc or the
  corner button): every level, its best time and where it starts, "Show the
  way" and "Abandon", and the structures ticked as collected, holding the
  game while it is up. `src/scene.ts` draws a crate on the pad of every
  delivery not going, a chequered flag at every start, and a gold collar on
  each collected tower and gold rails on each collected bridge. There is no
  game logic here.
  `src/input.ts` turns keys or touch into `Controls`, whichever was used
  last: the stick and the lever are worked out in `src/touch.ts`, fed
  fingers as numbers and tested headless, and drawn and fed by the page in
  `src/touch-view.ts`; `src/chase.ts` is the camera
  rig, stepped with the game so the pictures repeat, and handed the ground
  so that it stays above it, the canopy (`src/canopy.ts`, the top of the
  crowns over a point, built by `game.ts`) so that it is never in a tree,
  looking ahead along its way to rise in time, and the solids, so that a
  structure between it and the helicopter draws it in, and one too near
  behind tilts its line up or down by the least that leaves it room.
- `src/downwash.ts` is the air under the rotor: `washAt` says how it blows
  at a point, from where the helicopter is and how fast its rotor turns.
  `src/sway.ts` is the trees in it, a pool of those moving, sized once, each
  sprung back upright and let go when it is still; `scene.ts` leans them
  from their feet by what it says. Both find the trees near a point through
  `src/tree-grid.ts`, the trees sorted into squares once.
- `src/debug.ts` is `window.game`, the test API: time, the seed, the
  helicopter (`fly`, whose lift of `HOVER_LIFT` holds the height, since
  nothing held sinks; `release`; `teleport`, which takes a height above the
  floor, where the skids rest, and not a height above the sea), the ground
  (`groundAt`, and `floorAt`, which on a slope is higher, so a test that
  wants a height above the sea takes the floor from it), what is on the
  island (`content`: the pads, home, the bounds, the ceiling and the
  structures), the level (`state().mission`, `events()`, which takes what
  the game has told, as lines like `started ring-trial`, `through under the
bridge` and `landed 6`; `play`, which puts the helicopter at a level's
  start with nothing begun, `begin`, which begins it at once, `abandon`,
  `guide` and `home`; and `state().mission`, `guided`, `last` and `blocked`),
  the levels and the save (`levels`, `save`), what is on the screen
  (`state().screen`, flying or the panel, and `state().toast`), the trees (`treesNear`, each with its height and
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
  named, the one island built from it once, and the structures, each a
  block with a name and a kind. The generator is `island.ts`, the same for
  any recipe, which drops the trees from the ground the recipe clears; `heightfield.ts` is the grid it
  works on, sampled on the triangles that are drawn, and the algorithms
  that read a grid (the flood, the flow, the distances); `noise.ts` is the
  seeded noise. Chance comes from `random.ts`, handed in. `scene.ts` is the
  island and the helicopter as drawn; `matrix.ts` places, tilts and spins;
  `meshes.ts` builds the shapes.
- `src/progress.ts` is the save: the best time on each level by its
  name, and the structures collected by theirs, kept under
  `chopdrop-save-v1`, read as if anyone had written it.
  `src/collection.ts` is what has been collected: each structure's opening
  watched by `crossed`, either way through, whatever is going.
- There is no physics yet. `artshape-physics` stays pinned in
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

- **The physics, the bench and the body invariants** (`src/physics.ts`,
  `scripts/bench.ts`, `scripts/benching.ts`), with the first body on the
  island, a delivery most likely.
  The invariants and the fuzzer came back with the helicopter; the
  autopilot, determinism, leaks, pace and the play-through
  (`smoke/progress.spec.ts`, every level in turn) with the first level; the
  save (`test/saves/`) with the levels. The leak watch reads the
  heap and the memory behind typed arrays, which Node keeps apart: a pool
  kept for ever is in the second, and reading the heap alone let 345 MB of
  them by.

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
- **The mission**, for anything the player is asked to do: a kind of step
  in `mission.ts`, the steps of each level in `LEVELS`, stepped by
  `game.ts` after the helicopter and told through `GameEvents`; the crate
  and the beacon drawn by `scene.ts` from where it has got to; put into
  words by `hud.ts`; read and begun through `debug.ts`; ruled by
  `checkMission`; flown by the autopilot and by the fuzzer's "wanted pad";
  flown through by key and by touch in `smoke/free.spec.ts`, and pictured
  (`level-loading.png`, `level-carrying.png`, `toast.png`, and on a
  phone).
- **The structures**, for anything that stands on the island: built by
  `bridgeAt` or `towersAt` in `arena.ts`, a collectible in `COLLECTIBLES`
  with an `id` kept in saves, a name for the words, its opening and its
  blocks, each block in `STRUCTURES` with a name a broken rule says and a
  kind the scene paints by; placed by script and pinned in
  `test/levels.test.ts` (dry ground, the feet, the room under a deck, 150
  apart, every level's way clear of it or through its opening); the trees
  cleared from round it by the recipe's `trees.clear`; collected by
  `collection.ts`, told through `GameEvents`, kept by `progress.ts`, ruled
  by `checkCollection`, and flown through by the fuzzer's "through a
  structure" and the autopilot's `collect`; solid in `solids.ts`, ruled by `checkSolids`; drawn
  static by `scene.ts` in the chosen paint; kept off by the camera, ruled
  by `checkCamera`; gone round, over or out from under by the autopilot's
  `detour`; read by `debug.ts` (`content().structures`); flown at and set
  down on by the fuzzer's "structure run" and "onto a structure"; held on
  the ground, clear of the trees, with room under the deck, and clear of
  every other level's way, in `test/levels.test.ts`; pictured
  (`course-bridge.png`, `course-towers.png`, `camera-drawn-in.png`,
  `camera-over.png`, `course-phone.png`, `collected-towers.png`,
  `collected-bridge.png`, `collected-far.png`, `panel-structures.png`), and
  every picture that can see one written again.
- **The course**, for a level of more than one kind of step: `gate` and
  `land` steps in `mission.ts`, a gate passed by the ring's rule with a
  rectangle for its opening; put into words by `hud.ts`; flown by the
  autopilot; flown through by the fuzzer's "through the gate", and by a run
  of openings that ends on the pad wanted, started on the course by
  `fuzz -- --level`; flown by key and touch in `smoke/course.spec.ts`, and
  finished by the play-through.
- **The rings**, for anything solid or flown through: a `ring` step in
  `mission.ts`, its tube a solid in `solids.ts` that `game.ts` sets for the
  level; drawn by `scene.ts` (lit when wanted, white after, gone once
  passed); flown by the autopilot along its axis; ruled by `checkSolids`;
  flown at and through by the fuzzer's "ring run" and "through the ring";
  the courses held to their rules in `test/levels.test.ts`; flown by key
  and touch in `smoke/rings.spec.ts`; pictured (`rings.png`,
  `rings-valley.png`, `rings-phone.png`).
- **A level**, for anything a player can finish: its steps in `LEVELS`,
  its name in players' saves; begun by its first step through `starts.ts`,
  its start drawn by `scene.ts` (a crate, or a flag); a row on the panel
  (`panel.ts`), its best time kept by `game.ts` through `progress.ts` and
  ruled by `checkProgress`; flown to by the autopilot's `wanted`; begun,
  shown the way to and abandoned by the fuzzer's "to a start", "show the
  way" and "abandon", which comes back with a save; timed by `pace`, from
  home, on its own clock, flown in turn by `determinism` and `leaks`, and
  finished by the play-through through the panel; its pads pinned in
  `test/levels.test.ts`; the panel pictured (`panel.png`,
  `panel-phone.png`) and worked in `smoke/panel.spec.ts`, and its starts
  in `free.png`, `start-ring.png`, `start-towers.png` and `guided.png`.
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
- **The autopilot** (`src/autopilot.ts`), for anything a gate plays the
  game by: it flies the level as a careful player would, through the same
  `Controls`, drawing on no chance; `drive()` is read by the page when the
  test API turns it on. Each thing a player is asked to do must be flown
  by it, or the pace, determinism, leak and play-through gates stop
  reaching the game.
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
- **Save compatibility.** A new field needs a default in `progress.ts`
  and a save in the new shape in `test/saves/`; the corpus test fails until
  it is there. A level's `id` is in players' saves: it is never changed.
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
- **the camera:** following at full speed, behind something tall, under
  something low, and with no room behind the helicopter
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
write over the player's save: a test's goes in through
`start(page, { save })`, which boots flying free at home with nothing
begun: a test begins a level by doing its first step, or with `begin(id)`.

## Commits

Commit only when asked, through `/commit`: a sentence summary in the house
voice, a body saying what changed and why, two commits when a refactor and
a feature land together. The pre-commit hook runs `check:quick`.
