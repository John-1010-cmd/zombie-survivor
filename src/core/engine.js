import { createLoop, advance } from './loop.js';

export function fitCanvas(canvas, ctx) {
  const win = globalThis.window;
  const cssWidth = Math.max(1, win?.innerWidth ?? canvas.clientWidth ?? canvas.width ?? 1);
  const cssHeight = Math.max(1, win?.innerHeight ?? canvas.clientHeight ?? canvas.height ?? 1);
  const dpr = Math.min(win?.devicePixelRatio || 1, 2);

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { width: cssWidth, height: cssHeight, dpr };
}

export function createEngine(canvas) {
  const ctx = canvas.getContext('2d');
  const loop = createLoop();
  let scene = null;
  let viewport = fitCanvas(canvas, ctx);
  let resizeQueued = false;

  function applyResize() {
    resizeQueued = false;
    viewport = fitCanvas(canvas, ctx);
    if (scene?.setViewport) scene.setViewport(viewport.width, viewport.height);
  }

  function scheduleResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(applyResize);
  }

  function frame(now) {
    const steps = advance(loop, now);
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    if (scene) {
      if (!scene.paused) for (let i = 0; i < steps; i++) scene.update(loop.step);
      scene.render(ctx, viewport);
    }
    requestAnimationFrame(frame);
  }

  if (globalThis.window?.addEventListener) {
    globalThis.window.addEventListener('resize', scheduleResize);
  }

  return {
    setScene(s) {
      scene = s;
      if (scene?.setViewport) scene.setViewport(viewport.width, viewport.height);
    },
    getViewport() {
      return Object.assign({}, viewport);
    },
    start() {
      requestAnimationFrame(frame);
    },
  };
}
