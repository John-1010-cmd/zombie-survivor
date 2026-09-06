// 电磁球：磁电弹命中后生成，沿弹道方向慢速移动并对周围僵尸周期电击。纯逻辑模块，无 DOM 依赖。
import { damageZombie } from './zombie.js';
import { drawVisual, registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';

const TICK_INTERVAL = 0.25;
const TICK_RADIUS = 30;
const KNOCKBACK = 60;
export const MINE_VISUAL_ID = 'mine';
export const TESLA_BALL_VISUAL_ID = 'teslaBall';

registerPart(MINE_VISUAL_ID, (ctx, size, params = {}, phase = 0) => {
  const r = size * 0.5;
  const range = params.range ?? r * 3;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.fillRect(-r * 0.62, -r * 0.20, r * 1.24, r * 0.40);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.obstacle;
  ctx.beginPath();
  ctx.arc(0, r * 0.04, r * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = PALETTE.gold;
  ctx.shadowBlur = 8;
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(0, -r * 0.14, r * 0.16 + Math.sin(phase * 8) * r * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
});

registerPart(TESLA_BALL_VISUAL_ID, (ctx, size, params = {}, phase = 0) => {
  const r = params.radius ?? size * 0.5;
  ctx.save();
  const coreRadius = r * (1 + 0.10 * Math.sin(phase * 18));
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 14;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = PALETTE.neon;
  ctx.beginPath();
  ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = PALETTE.neon;
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    const spin = phase * (i === 0 ? 4 : -3) + i * Math.PI * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.35 + i * 0.16), spin, spin + Math.PI * 1.35);
    ctx.stroke();
  }
  if (Math.sin(phase * 16) > -0.25) {
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a = phase * 3 + i * Math.PI * 2 / 3;
      const x0 = Math.cos(a) * r * 1.0;
      const y0 = Math.sin(a) * r * 1.0;
      const x1 = Math.cos(a + 0.22) * r * 1.45;
      const y1 = Math.sin(a + 0.22) * r * 1.45;
      const x2 = Math.cos(a - 0.12) * r * 1.78;
      const y2 = Math.sin(a - 0.12) * r * 1.78;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.restore();
});

export function createTeslaBall(x, y, vx, vy, damage) {
  return {
    x, y, vx, vy, r: 12, damage,
    tickT: TICK_INTERVAL, life: 2.5, alive: true,
    visualId: TESLA_BALL_VISUAL_ID,
  };
}

export function renderTeslaBall(ctx, ball, phase) {
  drawVisual(ctx, ball.visualId || TESLA_BALL_VISUAL_ID, ball.x, ball.y, ball.r * 2, {
    params: { radius: ball.r },
    phase,
  });
}

export function updateTeslaBall(b, zombies, dt, onHit, onKill) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.tickT -= dt;
  if (b.tickT <= 0) {
    for (const z of zombies) {
      if (!z.alive) continue;
      if (Math.hypot(z.x - b.x, z.y - b.y) > TICK_RADIUS + z.r) continue;
      const died = damageZombie(z, b.damage, KNOCKBACK, Math.atan2(z.y - b.y, z.x - b.x));
      onHit(z);
      if (died) onKill(z);
    }
    b.tickT = TICK_INTERVAL;
  }
  b.life -= dt;
  if (b.life <= 0) b.alive = false;
  return b.alive;
}
