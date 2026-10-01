---
name: commit
description: Commit the work in the house style: the checks run first, a refactor and a feature split into two commits, baselines and pictures carried by the change that moved them, and a message that is a sentence summary in the house voice with a body saying what changed and why. Use when the user asks to commit.
---

# /commit

Commit only when asked, and then like this.

## 1. What is there

`git status` and `git diff`. Say what is in the working tree in a line, and
notice what should not be committed: `test-results/`, a player's save, a
baseline or picture that was written and not looked at.

## 2. Green first

`npm run check:quick` is the hook and runs anyway. If the change touches
anything a gate holds — the physics, the content, the pace, the look — run
`npm run check` and say the result. A commit with a gate red is not made;
`/gate-moved` decides what to do about it.

## 3. How many commits

- A refactor and a feature that land together are two commits, the
  refactor first, each green on its own.
- A baseline or picture written again goes in the same commit as the change
  that moved it, never on its own.
- A new save shape and its corpus file go together.

## 4. The message

Read the last few of `git log` and match them. A sentence summary in the
house voice, saying what the game does now that it did not; then a body
saying what changed and why, in prose, not a list of files. Where a figure
moved, the body says from what to what and why. Where something is still
open, the body says so.

## 5. Report

The commit hash and its summary line, what was left out of it and why, and
that nothing is pushed unless asked.
