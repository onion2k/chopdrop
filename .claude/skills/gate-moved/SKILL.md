---
name: gate-moved
description: Decide what to do when a baseline gate moves: the bench, the pace gate, the drone or balance gate, or a look picture. Works out whether the swing is real, whether it was meant, and only then writes a new baseline with the reason in the commit. Use when npm run check fails on a gate's tolerance, or a figure has moved and the user asks whether it matters.
---

# /gate-moved

A gate that moved is a question, not a failure: is the swing real, and was
it meant? Answer both before touching the baseline. A baseline updated to
make the check pass holds the project to whatever it happened to do that
day.

## 1. What moved

Which gate, which figure, from what to what, and which way. Quicker is as
much a change as slower, for the bench as for pacing or balance: a frame
gone faster is written into the baseline, so that giving the speed back
later is seen.

## 2. Is it real?

Noise looks like a swing on few seeds or one run. Before believing it:

- **Pace, balance, drones:** run more seeds than the check does, by the
  gate's own option or by widening its seed list by hand, and compare the
  medians. A swing that holds on the wider run is real.
- **Bench:** run it again with nothing else running. Read the relative
  figure, not the milliseconds: the reference arithmetic is there to take
  the machine out of it, and does so while the machine has cores to spare.
  With most of them at other work the two do not slow alike, and the figure
  can read a sixth out either way.
- **The download:** it does not wobble, so a byte is real. Find what in
  the change added it (`npx vite build` at the change and its parent), and
  whether that is what the change is for.
- **A picture:** look at the three files a failure leaves in
  `test-results/`: the picture it was held to, what was drawn, and the
  difference. A change in the game is a shape; the GPU's own drift is
  scattered pixels. The template's picture does not drift at all, and is
  held to the pixel; where a game's does, draw the scene on twenty pages
  just booted and count the pixels that move at each threshold before
  choosing one, and never forgive a share of the picture: a button is
  seven hundred pixels of a million.

If it is not real, the tolerance is wrong. Say why it is set as it is (each
gate's file says), and widen it only with the reason written beside it.

## 3. Was it meant?

Find what in the change touches what the gate measures. If the change was
meant to move it, say by how much it was expected to and whether this is
that. If nothing in the change should have moved it, it is a bug: go to
`/bug` with the gate's figures as the report.

## 4. Then, and only then, the baseline

- `--update` on the gate, or `npm run look:update` for a picture.
- Look at what was written. A picture is read in full; a figure is checked
  against what phase 2 measured.
- The commit that carries the change carries the new baseline, and its
  message says the figure before and after and why it moved.

## 5. Report

- The figure before and after, and on how many seeds or runs.
- Real or noise, and how that was decided.
- Meant or not, and what in the change moved it.
- What was written, and what the commit will say.
- Nothing is committed until asked.
