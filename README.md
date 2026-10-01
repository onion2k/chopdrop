# Chopdrop

An arcade helicopter game for the browser: fly about, pick deliveries up,
and set them down where they are wanted. TypeScript and Vite, drawn with
WebGPU through [artshape-render](https://github.com/onion2k/artshape-render),
with the physics from
[artshape-physics](https://github.com/onion2k/artshape-physics). Started
from artshape-game-template in October 2026.

## What there is so far

A helicopter, and a square floor walled in by rock to fly it over, with a
camera that chases it. There is nothing to deliver yet: the deliveries and
where they go come one feature at a time, through `/feature`. The
template's stub, a sled shoving balls into a hole, was taken out in the
second commit, and the first commit keeps it as the model to copy from.

## How it is played

**W** and **S** fly forward and back, **A** and **D** turn, **Space** climbs
and **Shift** comes down and lands; the arrows do what W A S D do. Let go,
and it hovers where it is. On a phone it can be watched but not flown yet:
touch controls are a feature still to come.

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

    src/game.ts        the game without the picture: the floor, the helicopter, the clock
    src/helicopter.ts  the player's machine: how it flies, and its size
    src/main.ts        the page: the frame drawn
    src/input.ts       the keyboard, as the helicopter's controls
    src/chase.ts       the camera that follows it
    src/debug.ts       window.game, the test API
    src/invariants.ts  what must always hold
    src/arena.ts       content: the floor and the rock round it
    src/scene.ts       the arena and the helicopter as they are drawn
    src/random.ts      chance, from one seed
    scripts/           the fuzzer
    test/              unit tests
    smoke/             Playwright: boots, flies, looks right, within budget
