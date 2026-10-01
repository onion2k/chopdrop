/**
 * The page: the game drawn, and what the player does to it. Everything that
 * happens in the arena happens in `game.ts`; this reads the keyboard, steps
 * the game and the chase camera on the fixed step, and draws the frame on the
 * game path of artshape-render. Every movement, the camera's too, is made in
 * `simulate`, so the same flight gives the same picture, and `draw` only
 * shows where things have got to. There is no game logic here.
 */
import { createContext } from 'artshape-render/gpu/context';
import { bakeEnvironment } from 'artshape-render/render/env';
import { LightPool } from 'artshape-render/game/lights';
import { GameRenderer } from 'artshape-render/game/renderer';
import { ChaseCamera, fovFor } from './chase';
import { createApi } from './debug';
import { frameCost } from './frame-cost';
import { Game } from './game';
import { Input } from './input';
import { seeded } from './random';
import { ARENA_BOX, Scene } from './scene';

/** How many millimetres a world unit is: the renderer fixes a few real sizes by it. */
const MM_PER_UNIT = 100;
const LIGHT_CAPACITY = 16,
  EFFECT_CAPACITY = 16,
  PARTICLE_CAPACITY = 1024;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;
const bootMsg = document.getElementById('bootMsg')!;
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

  // ---- the game ----

  const query = new URLSearchParams(location.search);
  // ?seed=N makes chance the same from before the game is built, for a test that wants the same arena every run
  const seed = query.get('seed');
  const game = new Game(seed !== null ? { random: seeded(+seed) } : {});

  // ---- the scene ----

  const scene = new Scene();
  renderer.setStatic(scene.static(game.solid));
  renderer.setDynamic(scene.dynamic());
  const lights = new LightPool(LIGHT_CAPACITY);
  lights.add({ position: [0, 0, 14], radius: 40, colour: [1, 0.85, 0.6], intensity: 30 });
  renderer.setLights(lights);

  // the rig's two points are the camera's own, written in place, so nothing is copied each frame
  const input = new Input();
  const rig = new ChaseCamera();
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

  /** Where the helicopter is now, written into the groups the renderer draws. */
  function upload() {
    scene.write(game.helicopter);
    scene.pools.forEach((pool, k) => renderer.move(k, pool, 1));
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
  stats.hidden = false;
  help.hidden = false;

  // ---- each frame ----

  let frames = 0;
  let smoothed = 0;
  function simulate(dt: number) {
    frames++;
    game.step(dt, input.read());
    rig.step(dt, game.helicopter);
  }
  function draw(dt: number) {
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
