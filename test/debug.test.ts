/** The test API's reading of the structures collected: what the browser tests will ask the page for. */
import { describe, expect, it } from 'vitest';
import { COLLECTIBLES, LEVELS, PACKAGES, RESCUE_SPOTS } from '../src/arena';
import { ChaseCamera } from '../src/chase';
import { createApi, type DebugHost } from '../src/debug';
import { Game } from '../src/game';
import { HOVER_LIFT } from '../src/helicopter';
import { seeded } from '../src/random';

function api(over: Partial<DebugHost> = {}) {
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
    crates: () => 0,
    people: () => 3,
    smoke: () => 3,
    rope: () => false,
    radar: () => ({ badge: 'quiet', step: 0 }),
    screen: () => 'flying',
    frame: () => 0,
    input: () => ({ by: 'keys', controls: { forward: 0, turn: 0, lift: 0 }, lever: 0 }),
    ...over,
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

describe('the test API and the packages found', () => {
  it('says what is found, in order, as a copy', () => {
    const { game, api: a } = api();
    expect(a.state().found).toEqual([]);
    game.progress.find('east-wood');
    game.progress.find('west-shore-wood');
    expect(a.state().found).toEqual(['east-wood', 'west-shore-wood']);
    a.state().found.push('x');
    expect(game.progress.found).toEqual(['east-wood', 'west-shore-wood']);
  });

  it('says what the radar hears and whether it pinged, as the last step left it', () => {
    const { game, api: a } = api();
    expect(a.state().radar).toEqual({ nearest: -1, pinged: false, badge: 'quiet', step: 0 });
    const p = PACKAGES[0];
    game.helicopter.place(p.x + 60, p.y, 30, 0);
    game.step(1 / 60);
    const { nearest, pinged } = a.state().radar;
    expect(nearest).toBeCloseTo(60, 9);
    expect(pinged).toBe(game.finds.pinged);
  });

  it("says the badge as the page has drawn it and how many crates are drawn, as the page's own say", () => {
    const { api: a } = api({ crates: () => 7, radar: () => ({ badge: 'heard', step: 4 }) });
    expect(a.state().crates).toBe(7);
    expect(a.state().radar).toMatchObject({ badge: 'heard', step: 4 });
  });

  it('lists each package with its place, as copies', () => {
    const { api: a } = api();
    const listed = a.content().packages;
    expect(listed).toEqual(PACKAGES.map(({ id, x, y, z }) => ({ id, x, y, z })));
    expect(listed[0]).not.toBe(PACKAGES[0]);
    listed[0].x += 1;
    expect(PACKAGES[0].x).not.toBe(listed[0].x);
  });

  it('keeps level, structure and package names apart, since the autopilot is told any of them by name', () => {
    const ids = [...LEVELS.map((l) => l.id), ...COLLECTIBLES.map((c) => c.id), ...PACKAGES.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the test API and the rescues', () => {
  it('lists each spot with its place and words, as copies, and its winch is in the level it begins', () => {
    const { api: a } = api();
    const listed = a.content().rescues;
    expect(listed).toEqual(RESCUE_SPOTS.map((spot) => ({ ...spot })));
    expect(listed[0]).not.toBe(RESCUE_SPOTS[0]);
    listed[0].x += 1;
    expect(RESCUE_SPOTS[0].x).not.toBe(listed[0].x);
    a.begin('wood-rescue');
    expect(a.state().mission.steps[0]).toMatchObject({ kind: 'winch', who: 'the walker' });
  });

  it('says who is being winched and how far up, and how many people are standing waiting', () => {
    const { game, api: a } = api();
    expect(a.state().winch).toEqual({ spot: null, share: 0 });
    expect([a.state().people, a.state().smoke, a.state().rope]).toEqual([3, 3, false]);
    const [spot] = RESCUE_SPOTS;
    a.teleport(spot.x, spot.y, 10);
    for (let f = 0; f < 90; f++) game.step(1 / 60, { forward: 0, turn: 0, lift: HOVER_LIFT });
    expect(a.state().winch.spot).toBe('wood-rescue');
    expect(a.state().winch.share).toBeCloseTo(game.starts.loading / 3, 6);
    expect(a.state().winch.share).toBeGreaterThan(0.3);
  });
});
