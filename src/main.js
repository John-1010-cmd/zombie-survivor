// src/main.js（临时占位场景，Task 16 会被替换为菜单）
import { createEngine } from './core/engine.js';

const engine = createEngine(document.getElementById('game'));
engine.setScene({
  update() {},
  render(ctx) {
    ctx.fillStyle = '#1a2418'; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#eee'; ctx.font = '32px sans-serif';
    ctx.fillText('Zombie Survivor — 引擎就绪', 420, 360);
  },
});
engine.start();
