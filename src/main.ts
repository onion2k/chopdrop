/**
 * The page: the game drawn, and what the player does to it. Everything that
 * happens in the arena happens in `game.ts`; this turns its events into
 * words on the screen and draws the frame, on the game path of
 * artshape-render. There is no game logic here.
 */
import { createContext } from 'artshape-render/gpu/context';
import { Orbit } from 'artshape-render/gpu/camera';
import { bakeEnvironment } from 'artshape-render/render/env';
import { LightPool } from 'artshape-render/game/lights';
import { GameRenderer } from 'artshape-render/game/renderer';
import { HOLE } from './arena';
import { createApi } from './debug';
import { frameCost } from './frame-cost';
import { Game, type GameEvents } from './game';
import { Input } from './input';
import { Progress } from './progress';
import { seeded } from './random';
import { ARENA_BOX, Scene } from './scene';

/** How many millimetres a world unit is: the renderer fixes a few real sizes by it. */
const MM_PER_UNIT = 100;
const LIGHT_CAPACITY = 16,
  EFFECT_CAPACITY = 16,
  PARTICLE_CAPACITY = 1024;
/** How many of the game's events the test API keeps, before the oldest go. */
const EVENTS_KEPT = 500;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;
const bootMsg = document.getElementById('bootMsg')!;
const bankPanel = document.getElementById('bank')!;
const bankText = bankPanel.querySelector('b')!;
const stats = document.getElementById('stats')!;
const help = document.getElementById('help')!;

main().catch((err: unknown) => {
  bootMsg.textContent = err instanceof Error ? err.message : String(err);
  console.error(err);
});

async function main() {
  // ---- the renderer ----

  const ctx = await createContext(canvas);
  bootMsg.textContent = 'compiling shaders…';
  const renderer = new GameRenderer(ctx, LIGHT_CAPACITY, EFFECT_CAPACITY, PARTICLE_CAPACITY, MM_PER_UNIT);
  renderer.look = {
    ...renderer.look,
    sunDir: [0.35, -0.3, 0.89],
    sunColour: [1, 0.96, 0.9],
    exposure: 1.1,
    ambient: 0.6,
    background: [0.04, 0.04, 0.05],
  };
  const env = bakeEnvironment(ctx, 'studio', { size: 128, mips: 6 });
  renderer.setEnvironment(env.specular, env.brdf, env.mips);
  renderer.camera.fov = 40;
  renderer.camera.near = 2;
  renderer.camera.far = 500;
  renderer.setSunShadow(ARENA_BOX);

  // ---- the game, and what it says has happened ----

  const query = new URLSearchParams(location.search);
  const progress = new Progress();
  const input = new Input();
  /** What has happened, a line each, for the test API. */
  const eventLog: string[] = [];
  const log = (line: string) => {
    eventLog.push(line);
    if (eventLog.length > EVENTS_KEPT) eventLog.splice(0, eventLog.length - EVENTS_KEPT);
  };
  const showBank = () => {
    bankText.textContent = String(progress.save.bank);
  };
  const events: GameEvents = {
    banked(_kind, x, y) {
      log(`banked ${x.toFixed(1)},${y.toFixed(1)}`);
      showBank();
    },
    dropped(_kind, x, y) {
      log(`dropped ${x.toFixed(1)},${y.toFixed(1)}`);
    },
  };
  // ?seed=N makes chance the same from before the first ball drops, for a test that wants the same arena every run
  const seed = query.get('seed');
  const game = new Game(progress, events, seed !== null ? { random: seeded(+seed) } : {});
  const { world, sled } = game;

  // ---- the scene ----

  const scene = new Scene();
  renderer.setStatic(scene.static(world.solid));
  renderer.setDynamic(scene.dynamic());
  const lights = new LightPool(LIGHT_CAPACITY);
  lights.add({ position: [HOLE.x, HOLE.y, 14], radius: 40, colour: [1, 0.85, 0.6], intensity: 30 });
  renderer.setLights(lights);

  const cam = renderer.camera;
  cam.target = [0, 0, 0];
  cam.position = [0, -70, 60];
  const orbit = new Orbit(cam, {
    element: canvas,
    minPolar: 0.2,
    maxPolar: 1.3,
    minDistance: 20,
    maxDistance: 160,
    rotateSpeed: 0.4,
    zoomSpeed: 0.8,
    panSpeed: 0,
    inertia: 0.5,
  });

  let width = 1,
    height = 1;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    cam.aspect = width / height;
    renderer.resize(width, height);
  };
  addEventListener('resize', resize);
  resize();

  function upload() {
    const balls = scene.write(world, sled);
    renderer.move(0, scene.balls, balls);
    renderer.move(1, scene.sled, 1);
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

  await renderer.ready;
  boot.classList.add('gone');
  bankPanel.hidden = false;
  stats.hidden = false;
  help.hidden = false;
  showBank();

  // ---- each frame ----

  let frames = 0;
  let smoothed = 0;
  function simulate(dt: number) {
    frames++;
    game.step(dt, input.read());
  }
  function draw(dt: number) {
    orbit.update();
    cam.update();
    upload();
    const t = performance.now();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', dt);
    smoothed += (performance.now() - t - smoothed) * 0.05;
    if (frames % 30 === 0) stats.textContent = `${smoothed.toFixed(1)} ms · ${world.live} on the floor`;
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
    setDrive: (d) => {
      input.override = d;
    },
    look(x, y, view) {
      cam.target = [x, y, 0];
      orbit.setSpherical(view);
      for (let i = 0; i < 400; i++) orbit.update();
    },
    measureFrame,
    events: eventLog,
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
