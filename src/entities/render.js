// src/entities/render.js —— 几何矢量渲染器（设计 §9，Infinitode 2 风）。
// 形状注册表：shape id → 路径函数（只描路径，填充/描边由 renderZombie 统一设色）。
// 新怪加形状 = 在此注册一个多边形画法 + 图鉴 visual.shape 引用。
// 渲染函数接收外部 ctx，不进单测（bestiary.test.js 只断言注册表键）。
import { MONSTERS, EXPLODER_FUSE_TIME } from '../config/bestiary/monsters.js';

// 正 n 边形路径（顶点朝上；rot 可调相位）
function poly(ctx, x, y, r, n, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export const SHAPES = {
  circle: (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); },
  triangle: (ctx, x, y, r) => poly(ctx, x, y, r, 3),
  hexagon: (ctx, x, y, r) => poly(ctx, x, y, r, 6),
  pentagon: (ctx, x, y, r) => poly(ctx, x, y, r, 5),
  diamond: (ctx, x, y, r) => poly(ctx, x, y, r, 4),
};

// 单怪绘制：发光描边 + 受击闪白 + 受伤后血条 + 引信闪烁膨胀（exploder fuse 中）
export function renderZombie(ctx, z, timeSec) {
  const v = MONSTERS[z.type].visual;
  // 引信中：膨胀 + 闪烁（设计 §4.3/§9.1）
  let r = z.r, alpha = 1;
  if (z.fuse !== undefined && !z.fuseDone) {
    const t = Math.min(1, z.fuse / EXPLODER_FUSE_TIME);
    r = z.r * (1 + 0.25 * t);
    alpha = 0.55 + 0.45 * Math.sin(timeSec * 30);
  }
  const shape = SHAPES[v.shape] || SHAPES.circle;
  ctx.globalAlpha = alpha;
  shape(ctx, z.x, z.y, r);
  ctx.fillStyle = v.color;
  ctx.fill();
  // 发光描边：同色 shadowBlur 低成本发光
  ctx.save();
  ctx.shadowColor = v.color;
  ctx.shadowBlur = 12 * (v.glow ?? 0.3);
  ctx.strokeStyle = v.color;
  ctx.lineWidth = 2;
  shape(ctx, z.x, z.y, r);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
  // 受击闪白（迁移自 game.js：hitFlash 0.1s 白色覆盖）
  if (z.hitFlash > 0) {
    ctx.globalAlpha = Math.min(1, z.hitFlash / 0.1);
    shape(ctx, z.x, z.y, r);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 受伤后才显示的血条（迁移自 game.js）
  if (z.hp < z.maxHp) {
    const bw = z.r * 2, bh = 3;
    const x = z.x - bw / 2, y = z.y - z.r - 8;
    ctx.fillStyle = '#a33';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#5eff8a';
    ctx.fillRect(x, y, bw * Math.max(0, z.hp / z.maxHp), bh);
  }
}
