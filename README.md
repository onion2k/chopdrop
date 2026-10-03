# Chopdrop

An arcade helicopter game for the browser: fly about, pick deliveries up,
and set them down where they are wanted. TypeScript and Vite, drawn with
WebGPU through [artshape-render](https://github.com/onion2k/artshape-render),
with the physics from
[artshape-physics](https://github.com/onion2k/artshape-physics). Started
from artshape-game-template in October 2026.

## What there is so far

A helicopter, and an island to fly it over, with a camera that chases it.
The island is 1,536 units square, land and sea, made once at boot from a
recipe of numbers and the same every time: a coast of bays and beaches,
hills and meadows, a snowy range in the north-west, gullies and valleys
cut where the rain would cut them, lakes, rivers from the hills to the sea,
some seven thousand trees of five kinds, which bow hard away from the
rotor's downwash and thrash in it when the helicopter comes down low over
them, and spring back when it has gone, water that sprays up in a ring
under it when it is low over a lake or the sea, and nine landing pads with
home on the south coast. Two
bridges in red steel cross gorges, and five pairs of red and white towers
stand on open ground: they are there in every level, and solid, and each is
collected the first time the helicopter flies under or between it, a toast
telling which and how many, a gold collar or gold rails left to show it.

The game opens flying free from home, with thirteen levels to find and
nothing locked. A level begins where its first step is done, one at a time,
and the best time on each is kept in the browser, the clock at the top of
the screen running from that first step. Four are deliveries: a crate waits
on a pad, and landing there and staying while the loader fills straps it
under the helicopter, puts a gold beacon over the pad it is wanted on, and
an arrow at the top of the screen points the way and says how far; land
there and stay, and it is delivered. Two are ring trials, begun by flying
through a first ring with a chequered flag on it: rings to fly through in
order, the one wanted lit gold, solid enough to knock the helicopter back,
six over the meadow and nine up a river valley. The last is a course begun
between the flagged towers: up the gorge and under the bridge, through three
rings over the hills, and down onto the shoulder pad. Three are rescues: a
walker in a wood, a swimmer cut off on a beach and a climber on a ledge each
wait under orange smoke, and holding a low hover over one for three seconds
winches them up, to be flown to the home pad. Three are fires, two in woods
by the lakes and one in the northern wood far from water, each under a
column of dark smoke the rotor's air pushes about: a bucket hangs on a line
while one is wanted, skimming a lake or the sea low and fast fills it, and
passing low over the flames lets it go, the first drop that hits beginning
the level. A fire spreads while it is fought, and is out when no patch
burns. A level's end is told
in a toast with its time, and flight carries on. Esc, or the corner button,
brings up the panel: every level, its best time and where it starts, a way
shown to any of them, the one going given up, and the structures ticked as
collected. Ten packages are hidden in woods across the island, in blue
crates: a radar in the corner pings when one is within 100 m, faster as it
is neared, and landing within 15 m of one finds it. The template's stub,
a sled shoving balls into a hole, was taken out in the second commit, and
the first commit keeps it as the model to copy from.

## How it is played

**W** and **S** fly forward and back, **A** and **D** turn, **Space** climbs
and **Shift** comes down fast; the arrows do what W A S D do. Let go of
Space and it settles into a gentle sink, a third of the climb, until it
lands, so a height is held by tapping Space. It starts landed on the home
pad, climbs to a ceiling of 220, above every peak, and sets down on
whatever is under it: a pad, a field, a lake, or a hillside that rises to
meet it, which it has to lift over.

On a phone it is flown by touch: a stick under the left thumb, which comes
up wherever the thumb lands, flies forward and back and turns; a lever under
the right, slid anywhere on that side, climbs at the top, holds the height
at its stop, sinks in the middle and comes down fast at the bottom, and
stays where it is left. A key pressed goes back to the keys.

## What is here

The gates that still have something to hold:

    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook)
    npm run fuzz           a monkey flies it, and the rules are checked
    npm run perf           boot time, a frame's cost and the download, held to a budget and a baseline
    npm run smoke          the real thing in headless Chromium on the GPU
    npm run look           what it looks like, held to a picture
    npm run determinism    the same seed, flown twice by the autopilot, the same game
    npm run leaks          an hour flown, and nothing kept that keeps growing
    npm run pace           how long the autopilot takes to fly each level, held to a baseline
    npm run check          all of it, and every level played to the end in the page

The bench and the save corpus held the stub, and went with it. Each comes
back from the first commit with the first feature that gives it something
to hold; `CLAUDE.md` says which brings back which.

The line every change goes down is in `CLAUDE.md` too: a spec agreed,
tests seen failing, the change built, every gate run, the result looked at,
a report with evidence, then a commit. A red gate stops the line until it
is fixed, and no baseline is moved to make it green.

## Layout

    src/game.ts        the game without the picture: the island, the helicopter, the mission, the clock
    src/mission.ts     the level going, if any: its steps, parcels picked up and delivered, rings and openings flown through, a landing
    src/starts.ts      what begins a level, with nothing going: a crate loaded, or a start ring or opening flown through
    src/solids.ts      what the helicopter cannot fly into: the bridge, the towers and the rings' tubes, which knock it back
    src/hud.ts         the words on the screen: the hint, what is wanted and where, and the toast at a level's end
    src/panel.ts       the panel: every level, its best time and where it starts, the way shown, and abandon
    src/progress.ts    the save: the best time on each level and the structures collected, kept in the browser
    src/collection.ts  the structures collected: an opening flown through, either way
    src/finds.ts       the hidden packages found, and the radar that hears the nearest
    src/water.ts       the tank: filled by skimming open water, emptied by a drop on a fire
    src/fire.ts        a fire's patches burning, out or not yet caught, spreading while its level is going
    src/autopilot.ts   a careful pilot that flies the level, which the gates play the game by
    src/helicopter.ts  the player's machine: how it flies over the ground, and its size
    src/main.ts        the page: the frame drawn
    src/input.ts       the keyboard or touch, whichever was used last, as the helicopter's controls
    src/touch.ts       the touch stick and lever: fingers in, controls out
    src/touch-view.ts  the touch controls as the page draws and feeds them
    src/chase.ts       the camera that follows it, above the ground and the treetops, and off the bridge and the towers
    src/canopy.ts      the crowns over a point: the camera keeps out of them as they lean, the autopilot over them
    src/downwash.ts    the air under the rotor, and how it blows at a point
    src/sway.ts        the trees in the downwash: which are moving, and how each leans
    src/tree-grid.ts   the trees sorted into squares, to find those near a point
    src/debug.ts       window.game, the test API
    src/invariants.ts  what must always hold
    src/arena.ts       content: the island's recipe, and the one island built from it
    src/island.ts      the generator: land, water, pads and trees, from a recipe
    src/heightfield.ts heights on a grid, and the algorithms that read one
    src/noise.ts       seeded noise, the same in Node and in the page
    src/scene.ts       the island and the helicopter as they are drawn
    src/effects.ts     the particles the page emits: flames, smoke, the rescue's flare, the water's spray
    src/bucket.ts      where the bucket hangs on its line, and when
    src/column.ts      the tall column of smoke over a burning fire, seen across the island
    src/meshes.ts      the shapes: the helicopter, five trees, a landing pad
    src/random.ts      chance, from one seed
    scripts/           the fuzzer, and the determinism, leak and pace gates
    test/              unit tests
    smoke/             Playwright: boots, flies, looks right, within budget
