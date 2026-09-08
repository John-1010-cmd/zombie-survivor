// 部署物：围墙（单段放置）。逻辑与程序化视觉均无 DOM/图片依赖。
import { registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';

const WALL_BODY = Object.freeze([
  [-0.98, 0.28], [-0.86, -0.46], [-0.62, -0.72], [-0.35, -0.59],
  [-0.10, -0.80], [0.20, -0.61], [0.53, -0.74], [0.91, -0.38],
  [0.98, 0.30], [0.66, 0.70], [0.30, 0.60], [-0.12, 0.78],
  [-0.54, 0.64],
]);
const WALL_CRACKS = Object.freeze([
  Object.freeze([[-0.62, -0.18], [-0.43, 0.02], [-0.50, 0.25]]),
  Object.freeze([[-0.18, -0.47], [-0.04, -0.22], [-0.12, 0.08]]),
  Object.freeze([[0.22, -0.30], [0.08, -0.02], [0.20, 0.22]]),
  Object.freeze([[0.58, -0.10], [0.42, 0.12], [0.50, 0.36]]),
  Object.freeze([[-0.36, 0.24], [-0.20, 0.40], [-0.27, 0.60]]),
  Object.freeze([[0.00, 0.34], [0.15, 0.48], [0.10, 0.68]]),
]);
const WALL_STYLES = Object.freeze({
  intact: Object.freeze({ fillAlpha: 1, crackCount: 0, glowAlpha: 0.28 }),
  damaged: Object.freeze({ fillAlpha: 0.78, crackCount: 3, glowAlpha: 0.38 }),
  critical: Object.freeze({ fillAlpha: 0.55, crackCount: 6, glowAlpha: 0.5 }),
});

export const WALL_VISUAL_ID = 'deployable.wall';

export function wallDamageTier(hp, maxHp) {
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  if (ratio > 0.66) return 'intact';
  if (ratio > 0.33) return 'damaged';
  return 'critical';
}

function traceBody(ctx, size) {
  ctx.beginPath();
  for (let i = 0; i < WALL_BODY.length; i++) {
    const [x, y] = WALL_BODY[i];
    if (i === 0) ctx.moveTo(x * size, y * size);
    else ctx.lineTo(x * size, y * size);
  }
  ctx.closePath();
}

function traceCrenellations(ctx, size) {
  const base = -size * 0.40;
  const top = -size * 0.76;
  const left = -size * 0.86;
  const step = size * 0.28;
  const merlon = size * 0.15;
  ctx.beginPath();
  ctx.moveTo(left, base);
  for (let i = 0; i < 6; i++) {
    const x = left + i * step;
    ctx.lineTo(x, base);
    ctx.lineTo(x, top);
    ctx.lineTo(x + merlon, top);
    ctx.lineTo(x + merlon, base);
  }
  ctx.lineTo(size * 0.86, base);
  ctx.closePath();
}

function drawWallVisual(ctx, size, params = {}, phase = 0) {
  void phase;
  const tier = wallDamageTier(params.hp ?? 0, params.maxHp ?? 0);
  const style = WALL_STYLES[tier];

  ctx.save();
  ctx.globalAlpha = style.fillAlpha;
  ctx.shadowColor = PALETTE.neonDim;
  ctx.shadowBlur = Math.max(2, size * 0.25);
  ctx.fillStyle = PALETTE.obstacle;
  traceBody(ctx, size);
  ctx.fill();
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.stroke();

  ctx.fillStyle = PALETTE.panel;
  traceCrenellations(ctx, size);
  ctx.fill();
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = Math.max(1, size * 0.045);
  for (let i = 0; i < style.crackCount; i++) {
    const crack = WALL_CRACKS[i % WALL_CRACKS.length];
    ctx.beginPath();
    for (let j = 0; j < crack.length; j++) {
      const [x, y] = crack[j];
      if (j === 0) ctx.moveTo(x * size, y * size);
      else ctx.lineTo(x * size, y * size);
    }
    ctx.stroke();
  }

  ctx.save();
  ctx.globalAlpha = style.glowAlpha;
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 3 + size * 0.08;
  ctx.strokeStyle = PALETTE.neon;
  ctx.lineWidth = tier === 'critical' ? Math.max(2, size * 0.10) : Math.max(1, size * 0.07);
  traceCrenellations(ctx, size);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

registerPart(WALL_VISUAL_ID, drawWallVisual);

// 单段独立圆碰撞 r=22；基值耐久 150，每级 wallEnhance.hp 强化 +50%。
export function createWallSegment(x, y, wallEnhance) {
  const hp = 150 * Math.pow(1.5, (wallEnhance && wallEnhance.hp) || 0);
  return { x, y, r: 22, hp, maxHp: hp, alive: true };
}
