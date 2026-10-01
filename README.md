# Chopdrop

An arcade helicopter game for the browser: fly about, pick deliveries up,
and set them down where they are wanted. TypeScript and Vite, drawn with
WebGPU through [artshape-render](https://github.com/onion2k/artshape-render),
with the physics from
[artshape-physics](https://github.com/onion2k/artshape-physics). Started
from artshape-game-template in October 2026.

## Not a helicopter yet

Nothing of the game is built. `npm run dev` shows an empty square floor
walled in by rock, and that is all: the template's stub, a sled shoving
balls into a hole, was taken out in the second commit, and the first
commit keeps it as the model to copy from. The helicopter and the
deliveries come one feature at a time, through `/feature`.

## How it is played

Not settled yet: the helicopter's controls, what a delivery is and where
it goes are for the first features to decide. For now, drag to orbit the
camera and wheel to zoom.

## What is here

The gates that still have something to hold:

    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook)
    npm run perf           boot time, a frame's cost and the download, held to a budget and a baseline
    npm run smoke          the real thing in headless Chromium on the GPU
    npm run look           what it looks like, held to a picture
    npm run check          all of it

The fuzzer, the determinism check, the leak watch, the pace gate, the
bench, the save corpus and the play-through held the stub, and went with
it. Each comes back from the first commit with the first feature that
gives it something to hold; `CLAUDE.md` says which brings back which.

The line every change goes down is in `CLAUDE.md` too: a spec agreed,
tests seen failing, the change built, every gate run, the result looked at,
a report with evidence, then a commit. A red gate stops the line until it
is fixed, and no baseline is moved to make it green.

## Layout

    src/game.ts        the game without the picture: the walled floor and the clock
    src/main.ts        the page: the frame drawn
    src/debug.ts       window.game, the test API
    src/arena.ts       content: the floor and the rock round it
    src/scene.ts       the arena as it is drawn
    src/random.ts      chance, from one seed
    test/              unit tests
    smoke/             Playwright: boots, steps, looks right, within budget
