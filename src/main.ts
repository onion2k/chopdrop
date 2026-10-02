/**
 * The page: the game drawn, and what the player does to it. Everything that
 * happens on the island happens in `game.ts`; this reads the keyboard, steps
 * the game and the chase camera on the fixed step, and draws the frame on the
 * game path of artshape-render, in a toon look: a sunny day on a toy island.
 * The game opens flying free; Esc or the corner button brings up the panel,
 * and a level done is told by the toast.
 * Every movement, the camera's too, is made in `simulate`, so the same flight
 * gives the same picture, and `draw` only shows where things have got to.
 * There is no game logic here.
 */
import { createContext } from 'artshape-render/gpu/context';
import { bakeEnvironment } from 'artshape-render/render/env';
import { noFog } from 'artshape-render/game/fog';
import { LightPool } from 'artshape-render/game/lights';
import { GameRenderer, type Look, type Post } from 'artshape-render/game/renderer';
import { CHASE, ChaseCamera, fovFor } from './chase';
import { COLLECTIBLES } from './arena';
import { Autopilot } from './autopilot';
import { createApi, levelRows } from './debug';
import { frameCost } from './frame-cost';
import { Game } from './game';
import { Hud } from './hud';
import { Input } from './input';
import { Panel } from './panel';
import { Progress, browserStore } from './progress';
import { seeded } from './random';
import { Scene } from './scene';
import { TouchView } from './touch-view';

/** How many millimetres a world unit is: the renderer fixes a few real sizes by it. */
const MM_PER_UNIT = 100;
/** The most of what the game has told that the page keeps for the test API to read. */
const EVENTS_KEPT = 500;
const LIGHT_CAPACITY = 16,
  EFFECT_CAPACITY = 16,
  PARTICLE_CAPACITY = 1024;

/**
 * How far the camera sees, in world units. The island is 1,500 across and the sea runs on to the horizon past it,
 * so this is far: the haze below has taken the sea and the sky to one colour well before it, and the end of the
 * world, where the sea plane is cut by the far plane, is never seen as an edge. Raising it to 30,000 with a sea
 * plane to match was tried, and the shallows, a quarter of a unit over that plane, were lost in the distance, so it stays.
 */
const FAR = 8000;

/**
 * The look, every number in one place. It is a toon look, which lights a surface at its own colour in a few soft
 * bands and not as a real surface is lit, so the colours in `scene.ts` are the colours seen. Its light is worked
 * out so that flat ground facing the sun shows its own colour almost as it is: the sun takes 0.4 of its colour
 * in a toon band, so `sunColour` times 0.4 and the sky's light add up to a little over one. A sun of 2.4 with
 * that sky washed every colour to pastel; the colours are saturated and clean at these, and not neon. The
 * renderer lights in linear light and shows it through a gamma of 2.2, which is why `scene.ts` writes its colours
 * as they look and converts them.
 */
const LOOK: Partial<Look> = {
  shading: 'toon',
  // high in the south-east: hillsides facing it are lit and those turned away are shaded, and shadows fall short, toward the north-west
  sunDir: [0.42, -0.35, 0.84],
  sunColour: [1.75, 1.62, 1.4],
  exposure: 1,
  ambient: 1,
  // the sky overhead, where the haze is thin: a clean blue that the haze pales toward the horizon
  background: [0.07, 0.3, 0.83],
  // a clean edge to every band where it crosses a curve, and a cool blue in the shade and in a shadow, not a darker grey
  bandSoftness: 0.06,
  shadeColour: [0.5, 0.55, 0.85],
  // a light edge on what turns from the camera, so a tree and the helicopter stand off the land behind them; small, since land seen at a graze takes it too and goes pale
  rim: 0.15,
  rimColour: [1, 0.95, 0.85],
  rimWidth: 0.25,
  // blue light from above and warm light bounced up from the grass, in place of the environment's grey
  skyLight: [0.36, 0.44, 0.56],
  groundLight: [0.32, 0.3, 0.2],
  // slopes shaded by the sun they take, so a hill shows its shape under a high sun
  form: 1.5,
  antialias: 'msaa',
};

/**
 * How the frame is brought to the screen: the soft shoulder, which shows a colour as it is until it nears white and
 * then eases it over keeping its hue (the filmic curve would pull the saturated colours to grey), and no grain, which
 * a clean toon world does not want. A touch of bloom and vignette, no more.
 */
const POST: Partial<Post> = { tone: 'soft', bloom: 0.15, vignette: 0.12, grain: 0 };

/**
 * The haze: a mist that lies low and thickens toward the horizon, in the colour of the sky there, so the far coast
 * and the sea fade into it, the sky pales from the blue overhead to the horizon, and the sea's cut edge at `FAR`
 * is gone (which also wants the open sea matte, as `scene.ts` has it: a glossy one reflects the horizon at a graze
 * and stays paler than the sky above it). It is lit by the sun as air is, so its `colour` is the horizon's colour divided by the sun and sky that
 * light it (about 1.95, 1.8 and 1.6 over the three channels). Its density is per world unit and falls off with
 * height over `height`, so near the sea a view is half gone in about 900 and at the helicopter's cruising
 * heights, a hundred up, in about 1,600; the land a few hundred away is only a little paler, and the mountains
 * seen from the sea are hazy.
 */
const HAZE = {
  density: 8e-4,
  base: 0,
  height: 160,
  colour: [0.23, 0.38, 0.59] as [number, number, number],
  ambient: 0.2,
  anisotropy: 0,
  reach: FAR,
  steps: 16,
  cones: 0,
};

const canvas = document.getElementById('view') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;
const bootMsg = document.getElementById('bootMsg')!;
const stats = document.getElementById('stats')!;
const help = document.getElementById('help')!;

/** A frame to the browser, so what the page has just said is on the screen before the thread is busy; a hidden page gets no frames, so it waits no longer than a moment for one. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
    setTimeout(resolve, 100);
  });
}

main().catch((err: unknown) => {
  bootMsg.textContent = err instanceof Error ? err.message : String(err);
  console.error(err);
});

async function main() {
  // ---- the renderer ----

  const ctx = await createContext(canvas);
  bootMsg.textContent = 'compiling shaders…';
  const renderer = new GameRenderer(ctx, LIGHT_CAPACITY, EFFECT_CAPACITY, PARTICLE_CAPACITY, MM_PER_UNIT);
  renderer.look = { ...renderer.look, ...LOOK };
  renderer.post = { ...renderer.post, ...POST };
  renderer.fog = { ...noFog(MM_PER_UNIT), ...HAZE };
  const env = bakeEnvironment(ctx, 'daylight', { size: 128, mips: 6 });
  renderer.setEnvironment(env.specular, env.brdf, env.mips);
  renderer.camera.fov = 40;
  renderer.camera.near = CHASE.near;
  renderer.camera.far = FAR;

  // ---- the game ----

  // the island takes most of a second to build, on the one thread, so the page is given a frame to say so first
  bootMsg.textContent = 'building the island…';
  await nextFrame();
  const query = new URLSearchParams(location.search);
  // ?seed=N makes chance the same from before the game is built, for a test that wants the same game every run
  const seed = query.get('seed');
  /**
   * What the game has told, written down for the test API, which takes it away as it reads it; the oldest go once
   * there are `EVENTS_KEPT`, so a page left open never keeps more.
   */
  const told: string[] = [];
  const tell = (line: string) => {
    told.push(line);
    if (told.length > EVENTS_KEPT) told.shift();
  };
  // what the player has done, from the browser's storage: a save that cannot be read is said so, and begun afresh
  const progress = new Progress(browserStore());
  if (progress.refused)
    console.warn(
      `The save could not be read (${progress.refused}), so the game starts afresh, and writes over it once a level is done.`,
    );
  // built before the game, which tells it the end; what its button does is below, where the game is put back
  const hud = new Hud({ panel: showPanel }, COLLECTIBLES.length);
  const game = new Game({
    ...(seed !== null ? { random: seeded(+seed) } : {}),
    progress,
    events: {
      started: (id) => tell(`started ${id}`),
      abandoned: (id) => tell(`abandoned ${id}`),
      loaded: (pad) => tell(`loaded ${pad}`),
      delivered: (pad) => tell(`delivered ${pad}`),
      passed: (ring, of) => tell(`passed ${ring} ${of}`),
      through: (label) => tell(`through ${label}`),
      landed: (pad) => tell(`landed ${pad}`),
      collected: (id, n, of) => {
        tell(`collected ${id} ${n} ${of}`);
        hud.collected(COLLECTIBLES.find((c) => c.id === id)!.name, n, of, game.t);
      },
      finished: (id, seconds, best) => {
        tell(`finished ${id} ${seconds.toFixed(2)}${best ? ' best' : ''}`);
        const level = game.levels.find((l) => l.id === id)!;
        hud.finished(level.kind, seconds, best, game.t);
      },
    },
  });
  const panel = new Panel(game.levels, game.island.pads, game.collection.collectibles, {
    guide: (id) => {
      game.guide(id);
      carryOn();
    },
    abandon: () => {
      game.abandon();
      carryOn();
    },
    close: carryOn,
  });

  // ---- the scene ----

  bootMsg.textContent = 'laying out the land…';
  await nextFrame();
  const scene = new Scene();
  renderer.setStatic(scene.static(game.island, game.solids.blocks));
  renderer.setDynamic(scene.dynamic(game.island));
  renderer.setSunShadow(scene.shadowBox);
  // there is no lamp on the island: the sun is all the light there is
  renderer.setLights(new LightPool(LIGHT_CAPACITY));

  // the rig's two points are the camera's own, written in place, so nothing is copied each frame
  const input = new Input();
  // a phone shows its touch controls from the start; anything else, once a finger is put on it
  if (matchMedia('(pointer: coarse)').matches) input.by = 'touch';
  const touchView = new TouchView(input, document.getElementById('stage')!);
  /** The helicopter put at the start of the level named `id`, nothing begun: the camera behind it, the lever down and the toast and the panel put away. */
  function play(id: string) {
    game.moveToStart(id);
    rig.snap(game.helicopter);
    input.touch.reset();
    hud.fly();
    carryOn();
  }
  /** Flying free from home again: the camera behind the helicopter, the lever down and the toast and the panel put away. */
  function home() {
    game.home();
    rig.snap(game.helicopter);
    input.touch.reset();
    hud.fly();
    carryOn();
  }
  /**
   * The panel up, and the game held behind it. Fingers on the glass are let go, so none is left holding the stick.
   */
  function showPanel() {
    input.touch.release();
    panel.show(levelRows(game), game.mission.level?.id ?? null, game.collection.ids);
    hud.listing = true;
    document.body.classList.add('listing');
  }
  /** The panel put away, and the game going on from where it was held. */
  function carryOn() {
    panel.hide();
    hud.listing = false;
    document.body.classList.remove('listing');
  }
  /** The autopilot, when the test API has it flying in place of the player; never otherwise. */
  let pilot: Autopilot | null = null;
  /** What the helicopter was flown with at the last step, copied, for the test API. */
  const flown = { forward: 0, turn: 0, lift: 0 };
  const rig = new ChaseCamera(game.island.ground, game.canopy, game.solids);
  rig.snap(game.helicopter);
  const cam = renderer.camera;
  cam.position = rig.position;
  cam.target = rig.target;

  let width = 1,
    height = 1;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    cam.aspect = width / height;
    cam.fov = fovFor(cam.aspect);
    renderer.resize(width, height);
  };
  addEventListener('resize', resize);
  resize();

  /** Where the helicopter is now, written into the groups the renderer draws, and only the groups that moved. */
  function upload() {
    scene.write(game.helicopter, game.sway, game.mission, game.collection.ids);
    scene.pools.forEach((pool, k) => {
      if (scene.changed[k]) renderer.move(k, pool);
    });
  }

  /** Whether a frame is being measured: the frame loop stands still while one is. */
  let measuring = false;

  /**
   * What a frame of the scene as it stands costs, drawn to a texture of our own rather than the canvas, so no wait
   * to be shown is counted. The frame loop draws nothing meanwhile: its frame, sixty times a second, fell in one
   * sample in three and read as a frame taking twice as long.
   */
  async function measureFrame(warm?: number): Promise<number> {
    const target = ctx.device.createTexture({
      label: 'measuring target',
      size: [width, height],
      format: ctx.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const view = target.createView();
    measuring = true;
    try {
      return await frameCost(
        () => {
          upload();
          return renderer.frame(view, 'redraw', 1 / 60);
        },
        () => ctx.device.queue.onSubmittedWorkDone(),
        warm,
      );
    } finally {
      measuring = false;
      target.destroy();
    }
  }

  // the four-sample builds are compiled before the first frame, so it is smooth from the start
  await renderer.prepare();
  boot.classList.add('gone');
  stats.hidden = false;
  help.hidden = false;
  hud.show();

  // ---- each frame ----

  let frames = 0;
  let smoothed = 0;
  function simulate(dt: number) {
    // held while the panel is up: nothing moves, the camera neither, until it goes
    if (panel.shown) return;
    frames++;
    const controls = pilot ? pilot.drive() : input.read();
    flown.forward = controls.forward;
    flown.turn = controls.turn;
    flown.lift = controls.lift;
    game.step(dt, controls);
    rig.step(dt, game.helicopter);
  }
  function draw(dt: number) {
    touchView.draw(panel.shown);
    hud.draw(game, rig);
    upload();
    cam.update();
    const t = performance.now();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', dt);
    smoothed += (performance.now() - t - smoothed) * 0.05;
    if (frames % 30 === 0) stats.textContent = `${smoothed.toFixed(1)} ms`;
  }

  // ---- the test API, and the frame loop ----

  // ?paused=1 starts the game stopped where it was built, so a test sees the
  // same arena every run: no frame of its own has run, and every one after is
  // the test's, of a length it chose
  let paused = query.has('paused');
  let ready = false;
  let bootMs = 0;
  window.game = createApi({
    game,
    ready: () => ready,
    bootMs: () => bootMs,
    paused: () => paused,
    setPaused: (p) => {
      paused = p;
    },
    simulate,
    draw,
    frame: () => frames,
    rig,
    setControls: (c) => {
      input.override = c;
    },
    input: () => ({ by: input.by, controls: { ...flown }, lever: input.touch.lever }),
    events: () => told.splice(0),
    home,
    play,
    screen: () => (panel.shown ? 'panel' : 'flying'),
    toast: () => hud.toast,
    gold: () => scene.gold,
    setAutopilot: (on, id) => {
      pilot = on ? new Autopilot(game) : null;
      // a level or a structure: their names never clash, and one that is neither is refused by name
      if (pilot && id !== undefined) {
        if (game.collection.collectibles.some((c) => c.id === id)) pilot.collect = id;
        else pilot.wanted = id;
      }
    },
    measureFrame,
  });

  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (measuring) return;
    if (paused) {
      draw(0);
      return;
    }
    simulate(dt);
    draw(dt);
  };
  ready = true;
  bootMs = performance.now();
  requestAnimationFrame(frame);
}
