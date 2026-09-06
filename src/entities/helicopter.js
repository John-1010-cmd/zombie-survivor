// src/entities/helicopter.js —— 坚守模式救援直升机（降落/登机状态机）。纯逻辑模块，无 DOM 依赖。
import { drawVisual, registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';

const LANDING_TIME = 3;
const BOARDING_TIME = 3;
export const HELICOPTER_VISUAL_ID = 'helicopter';

registerPart(HELICOPTER_VISUAL_ID, (ctx, size, params = {}, phase = 0) => {
  const r = size * 0.5;
  const progress = Math.max(0, Math.min(1, params.progress ?? 0));
  ctx.save();

  ctx.save();
  ctx.rotate(phase * 5);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fillRect(-r * 1.42, -r * 0.06, r * 2.84, r * 0.12);
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = 2;
  ctx.strokeRect(-r * 1.42, -r * 0.06, r * 2.84, r * 0.12);
  ctx.restore();

  ctx.fillStyle = PALETTE.neonDim;
  ctx.fillRect(-r * 0.92, -r * 0.13, r * 0.50, r * 0.26);
  ctx.fillStyle = PALETTE.panel;
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 9;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.neon;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = PALETTE.neon;
  ctx.beginPath();
  ctx.arc(r * 0.18, -r * 0.04, r * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = PALETTE.obstacle;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r * 0.30, r * 0.48);
  ctx.lineTo(-r * 0.46, r * 0.76);
  ctx.moveTo(r * 0.30, r * 0.48);
  ctx.lineTo(r * 0.46, r * 0.76);
  ctx.stroke();

  if (params.state === 'boarding') {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, r + 12, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
});

export function createHelicopter(x, y) {
  return { x, y, r: 60, state: 'landing', t: 0, visualId: HELICOPTER_VISUAL_ID };
}

export function updateHelicopter(h, player, dt) {
  if (h.state === 'landing') {
    h.t += dt;
    if (h.t >= LANDING_TIME) { h.state = 'waiting'; h.t = 0; }
    return 'none';
  }
  if (h.state === 'waiting') {
    const d = Math.hypot(player.x - h.x, player.y - h.y);
    if (d < h.r) { h.state = 'boarding'; h.t = 0; }
    return 'none';
  }
  if (h.state === 'boarding') {
    const d = Math.hypot(player.x - h.x, player.y - h.y);
    if (d >= h.r) { h.state = 'waiting'; h.t = 0; return 'none'; }
    h.t += dt;
    if (h.t >= BOARDING_TIME) { h.state = 'done'; return 'victory'; }
    return 'none';
  }
  return 'none';
}

export function renderHelicopter(ctx, h, phase = h.t) {
  drawVisual(ctx, h.visualId || HELICOPTER_VISUAL_ID, h.x, h.y, h.r * 2, {
    params: {
      state: h.state,
      progress: h.state === 'boarding' ? h.t / BOARDING_TIME : 0,
    },
    phase,
  });
}
