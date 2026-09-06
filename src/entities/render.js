// src/entities/render.js —— 实体渲染门面；注册源位于 core/visuals.js。
import { MONSTERS, EXPLODER_FUSE_TIME } from '../config/bestiary/monsters.js';
import { TRAIL_MAX } from './projectile.js';
import { SHAPES, drawVisual } from '../core/visuals.js';
import { SKINS } from '../config/skins.js';

export { SHAPES };

// 单怪绘制：发光描边 + 受击闪白 + 受伤后血条 + 引信闪烁膨胀（exploder fuse 中）。
export function renderZombie(ctx, z, timeSec) {
  const v = MONSTERS[z.type].visual;
  let r = z.r;
  let alpha = 1;
  if (z.fuse !== undefined && !z.fuseDone) {
    const t = Math.min(1, z.fuse / EXPLODER_FUSE_TIME);
    r = z.r * (1 + 0.25 * t);
    alpha = 0.55 + 0.45 * Math.sin(timeSec * 30);
  }

  ctx.globalAlpha = alpha;
  drawVisual(ctx, v.shape, z.x, z.y, r, { fillStyle: v.color });
  drawVisual(ctx, v.shape, z.x, z.y, r, {
    strokeStyle: v.color,
    lineWidth: 2,
    shadowColor: v.color,
    shadowBlur: 12 * (v.glow ?? 0.3),
  });
  ctx.globalAlpha = 1;

  if (z.hitFlash > 0) {
    ctx.globalAlpha = Math.min(1, z.hitFlash / 0.1);
    drawVisual(ctx, v.shape, z.x, z.y, r, { fillStyle: '#fff' });
    ctx.globalAlpha = 1;
  }

  if (z.hp < z.maxHp) {
    const bw = z.r * 2;
    const bh = 3;
    const x = z.x - bw / 2;
    const y = z.y - z.r - 8;
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

const WARNED_PLAYER_SKINS = new Set();
const DEFAULT_SKIN_ID = 'wastelandAdventurer';

function playerDirection(angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

function drawWhitePlayer(ctx, player) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(
    player.x + Math.cos(player.facing) * player.r,
    player.y + Math.sin(player.facing) * player.r,
  );
  ctx.stroke();
}

export function drawPlayer(ctx, player, timeSec, meta, { drawVisualFn = drawVisual } = {}) {
  const selected = meta?.skins?.selected ?? DEFAULT_SKIN_ID;
  const owned = meta?.skins?.owned;
  const skin = SKINS[selected]
    && (!Array.isArray(owned) || owned.includes(selected))
    ? SKINS[selected]
    : null;
  const warnKey = String(selected);
  let fallback = !skin;

  ctx.save();
  ctx.globalAlpha = player.invuln > 0
    ? 0.45 + 0.35 * Math.sin(timeSec * 24)
    : 1;
  if (skin) {
    const direction = playerDirection(player.facing);
    const index = player.moving ? player.walkFrame % skin.framesPerDirection : 0;
    try {
      const drawn = drawVisualFn(ctx, skin.sprite, player.x, player.y, player.r * 2, {
        frame: { direction, index },
        warn: false,
        onFallback: () => { fallback = true; },
      });
      if (drawn === false) fallback = true;
    } catch {
      fallback = true;
    }
  }
  if (fallback) {
    if (!WARNED_PLAYER_SKINS.has(warnKey)) {
      WARNED_PLAYER_SKINS.add(warnKey);
      console.warn(`皮肤 ${warnKey} 不可用，玩家回退白色圆球`);
    }
    drawWhitePlayer(ctx, player);
  }
  ctx.restore();
}
