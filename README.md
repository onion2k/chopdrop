# Chopdrop

An arcade helicopter game for the browser: fly about, pick deliveries up,
and set them down where they are wanted. TypeScript and Vite, drawn with
WebGPU through [artshape-render](https://github.com/onion2k/artshape-render),
with the physics from
[artshape-physics](https://github.com/onion2k/artshape-physics). Started
from artshape-game-template in October 2026.

## Not a helicopter yet

What is in `src/` is still the template's stub, and not Chopdrop: a sled on
a square floor, shoving balls into a hole. `npm run dev` shows that. It
gives way to the game one feature at a time, through `/feature`, every gate
green at each step.

## How it is played

Not settled yet: the helicopter's controls, what a delivery is and where
it goes are for the first features to decide. The stub drives with
**W A S D** or the arrows; drag to orbit the camera, wheel to zoom.

## What is here

Every gate a finished game has, at the size of one thing, ready to be added
to:

    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook)
    npm run fuzz           a monkey plays it, and the rules are checked
    npm run determinism    the same seed played twice, hashed
    npm run leaks          a long game, watching what must stay bounded
    npm run pace:check     how it plays, held to a baseline both ways
    npm run bench          what the physics costs a frame, held to a baseline
    npm run perf           boot time, a frame's cost and the download, held to a budget and a baseline
    npm run smoke          the real thing in headless Chromium on the GPU
    npm run look           what it looks like, held to a picture
    npm run check          all of it

The line every change goes down is in `CLAUDE.md`: a spec agreed, tests
seen failing, the change built, every gate run, the result looked at, a
report with evidence, then a commit. A red gate stops the line until it is
fixed, and no baseline is moved to make it green.

## Layout

    src/game.ts        the game without the picture
    src/main.ts        the page: events into words, the frame drawn
    src/debug.ts       window.game, the test API
    src/invariants.ts  what must always hold
    src/autopilot.ts   the game played by itself, for the gates
    src/arena.ts       content: the floor, the hole, the balls
    src/progress.ts    the save, and where it is kept
    src/physics.ts     the game's side of artshape-physics
    src/scene.ts       the arena as it is drawn
    src/sled.ts        the player's machine
    scripts/           the gates, each with its baseline beside it
    test/              unit tests, and a corpus of every save shape
    smoke/             Playwright: boots, drives, plays through, looks right
