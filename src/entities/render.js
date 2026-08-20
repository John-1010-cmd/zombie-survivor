// src/entities/render.js —— 几何矢量渲染器（设计 §9，Infinitode 2 风）。
// 形状注册表：shape id → 路径函数（只描路径，填充/描边由 renderZombie 统一设色）。
// 新怪加形状 = 在此注册一个多边形画法 + 图鉴 visual.shape 引用。
// 弹道渲染（renderProjectiles，§9.2）：additive 混合发光弹道 + 渐隐拖尾，visual 驱动形状/配色。
// 渲染函数接收外部 ctx，不进单测（bestiary.test.js 只断言注册表键）。
import { MONSTERS, EXPLODER_FUSE_TIME } from '../config/bestiary/monsters.js';
import { TRAIL_MAX } from './projectile.js';

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

// 弹道渲染（设计 §9.2）：发光几何体 + 渐隐拖尾。additive 混合，渲染后恢复。
// 不进单测（需要真实 canvas ctx），联调时人工验证。
// 无 visual 弹道（turret/aux/碎片）的回退视觉：模块级冻结常量，循环内零分配（设计 §9.3 红线）
const FALLBACK_AOE = Object.freeze({ bulletShape: 'bar', color: '#f80', trail: 0.3 });
const FALLBACK_CHAIN = Object.freeze({ bulletShape: 'bar', color: '#5ef', trail: 0.3 });
const FALLBACK_DEFAULT = Object.freeze({ bulletShape: 'bar', color: '#ffe066', trail: 0.3 });
export function renderProjectiles(ctx, projectiles) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of projectiles) {
    // 无 visual 的弹道（turret/aux/碎片）保留旧配色语言：aoe 橙 / chain 青 / 常规黄
    const v = p.visual || (p.aoe > 0 ? FALLBACK_AOE : p.chain > 0 ? FALLBACK_CHAIN : FALLBACK_DEFAULT);
    for (let i = 0; i < p.trailLen; i++) {
      const idx = (p.trailHead - p.trailLen + i + TRAIL_MAX) % TRAIL_MAX;
      const t = p.trail[idx];
      ctx.globalAlpha = (i / p.trailLen) * 0.35 * (v.trail ?? 0.3);
      ctx.fillStyle = v.color;
      ctx.fillRect(t.x - 1.5, t.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = v.color;
    const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
    switch (v.bulletShape) {
      case 'dot':
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'needle':
        ctx.strokeStyle = v.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - dx * 14, p.y - dy * 14); ctx.lineTo(p.x + dx * 3, p.y + dy * 3); ctx.stroke();
        break;
      case 'polygon': {
        ctx.beginPath();
        ctx.moveTo(p.x + dx * 6, p.y + dy * 6);
        ctx.lineTo(p.x - dy * 4, p.y + dx * 4);
        ctx.lineTo(p.x - dx * 6, p.y - dy * 6);
        ctx.lineTo(p.x + dy * 4, p.y - dx * 4);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'arc':
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x, p.y + 5); ctx.lineTo(p.x - 4, p.y);
        ctx.closePath(); ctx.fill();
        break;
      default: // bar
        ctx.strokeStyle = v.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - dx * 5, p.y - dy * 5); ctx.lineTo(p.x + dx * 5, p.y + dy * 5); ctx.stroke();
    }
  }
  ctx.restore();
}
