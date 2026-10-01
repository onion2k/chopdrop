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
some seven thousand trees of five kinds, which bow away from the rotor's
downwash when the helicopter comes down low over them and spring back when
it has gone, and nine landing pads with home on the south coast.

The first level is a delivery: a crate waits on the meadow pad, a gold
beacon over it, and an arrow at the top of the screen points the way and
says how far. Land on the pad and stay while the ring fills, and the crate
is strapped under the helicopter and the beacon moves to the hilltop pad;
land there and stay, and it is delivered, with the time it took from the
first lift-off and a button to fly it again. More levels, and where they
go, come one feature at a time, through `/feature`. The template's stub,
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
    npm run check          all of it

The determinism check, the leak watch, the pace gate, the bench, the save
corpus and the play-through held the stub, and went with it. Each comes back from the first commit with the first feature that
gives it something to hold; `CLAUDE.md` says which brings back which.

The line every change goes down is in `CLAUDE.md` too: a spec agreed,
tests seen failing, the change built, every gate run, the result looked at,
a report with evidence, then a commit. A red gate stops the line until it
is fixed, and no baseline is moved to make it green.

## Layout

    src/game.ts        the game without the picture: the island, the helicopter, the delivery, the clock
    src/delivery.ts    the level: a parcel picked up on one pad and delivered to another
    src/hud.ts         the words on the screen: what is wanted, where, and the card at the end
    src/helicopter.ts  the player's machine: how it flies over the ground, and its size
    src/main.ts        the page: the frame drawn
    src/input.ts       the keyboard or touch, whichever was used last, as the helicopter's controls
    src/touch.ts       the touch stick and lever: fingers in, controls out
    src/touch-view.ts  the touch controls as the page draws and feeds them
    src/chase.ts       the camera that follows it, above the ground and the treetops
    src/canopy.ts      the top of the crowns over a point: what the camera keeps over
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
    src/meshes.ts      the shapes: the helicopter, five trees, a landing pad
    src/random.ts      chance, from one seed
    scripts/           the fuzzer
    test/              unit tests
    smoke/             Playwright: boots, flies, looks right, within budget
