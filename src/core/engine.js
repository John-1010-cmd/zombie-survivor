import { createLoop, advance } from './loop.js';

export function createEngine(canvas) {
  const ctx = canvas.getContext('2d');
  const loop = createLoop();
  let scene = null;
  function frame(now) {
    const steps = advance(loop, now);
    if (scene) {
      if (!scene.paused) for (let i = 0; i < steps; i++) scene.update(loop.step);
      scene.render(ctx);
    }
    requestAnimationFrame(frame);
  }
  return {
    setScene(s) { scene = s; },
    start() { requestAnimationFrame(frame); },
  };
}
