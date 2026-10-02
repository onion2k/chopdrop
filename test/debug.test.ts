/** The test API's reading of the structures collected: what the browser tests will ask the page for. */
import { describe, expect, it } from 'vitest';
import { COLLECTIBLES } from '../src/arena';
import { ChaseCamera } from '../src/chase';
import { createApi, type DebugHost } from '../src/debug';
import { Game } from '../src/game';
import { seeded } from '../src/random';

function api() {
  const game = new Game({ random: seeded(1) });
  const rig = new ChaseCamera(game.island.ground, game.canopy, game.solids);
  const host = {
    game,
    rig,
    ready: () => true,
    bootMs: () => 0,
    paused: () => true,
    toast: () => null,
    gold: () => 0,
    screen: () => 'flying',
    frame: () => 0,
    input: () => ({ by: 'keys', controls: { forward: 0, turn: 0, lift: 0 }, lever: 0 }),
  } as unknown as DebugHost;
  return { game, api: createApi(host) };
}

describe('the test API and the structures collected', () => {
  it('says what is collected, in order', () => {
    const { game, api: a } = api();
    expect(a.state().collected).toEqual([]);
    game.progress.collect('gorge-bridge');
    game.progress.collect('shoulder-towers');
    expect(a.state().collected).toEqual(['gorge-bridge', 'shoulder-towers']);
    // a copy, so a test that changes it changes nothing of the game's
    a.state().collected.push('x');
    expect(game.progress.collected).toEqual(['gorge-bridge', 'shoulder-towers']);
  });

  it('lists each collectible with its name, its opening and its blocks, as copies', () => {
    const { api: a } = api();
    const listed = a.content().collectibles;
    expect(listed).toEqual(COLLECTIBLES.map(({ id, name, opening, blocks }) => ({ id, name, opening, blocks })));
    expect(listed[0]).not.toBe(COLLECTIBLES[0]);
    expect(listed[0].opening).not.toBe(COLLECTIBLES[0].opening);
    expect(listed[0].blocks[0]).not.toBe(COLLECTIBLES[0].blocks[0]);
    listed[0].opening.x += 100;
    expect(COLLECTIBLES[0].opening.x).not.toBe(listed[0].opening.x);
    const flagged = listed.find((c) => c.opening.flags)!;
    expect(flagged.opening.flags![0]).not.toBe(COLLECTIBLES.find((c) => c.id === flagged.id)!.opening.flags![0]);
  });
});
