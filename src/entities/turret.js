// 部署物：固定火炮。逻辑与程序化视觉均无 DOM/图片依赖。
import { registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';
import { FIRE_TOLERANCE, TURN_RATE, normAngle, turnToward } from '../core/angles.js';

const TURRET_BASE = { damage: 25, fireRate: 0.5, projectileSpeed: 350, range: 350, aoe: 80 };
export const TURRET_VISUAL_ID = 'deployable.turret';

function turretStats(t) {
  const e = t.weapon.enhance || {};
  return {
    damage: TURRET_BASE.damage * Math.pow(1.25, e.damage || 0),
    fireRate: TURRET_BASE.fireRate * Math.pow(1.2, e.fireRate || 0),
    projectiles: 1 + (e.projectiles || 0),
    range: TURRET_BASE.range * Math.pow(1.2, e.range || 0),
    projectileSpeed: TURRET_BASE.projectileSpeed,
    aoe: TURRET_BASE.aoe,
  };
}

function drawTurretVisual(ctx, size, params = {}, phase = 0) {
  void phase;
  const r = size;
  const aim = params.aimAngle ?? 0;
  const ratio = params.maxHp > 0
    ? Math.max(0, Math.min(1, params.hp / params.maxHp))
    : 0;

  ctx.save();
  ctx.shadowColor = PALETTE.neonDim;
  ctx.shadowBlur = Math.max(3, r * 0.35);
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.82, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();

  ctx.fillStyle = PALETTE.textDim;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.42, Math.max(1, r * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.rotate(aim);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.beginPath();
  ctx.moveTo(-r * 0.18, -r * 0.24);
  ctx.lineTo(r * 1.02, -r * 0.24);
  ctx.lineTo(r * 1.12, -r * 0.16);
  ctx.lineTo(r * 1.12, r * 0.16);
  ctx.lineTo(r * 1.02, r * 0.24);
  ctx.lineTo(-r * 0.18, r * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();
  ctx.fillStyle = PALETTE.neon;
  ctx.fillRect(r * 1.02, -r * 0.28, r * 0.22, r * 0.56);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.3 + 0.7 * (1 - ratio);
  ctx.shadowColor = PALETTE.gold;
  ctx.shadowBlur = 8 + (1 - ratio) * 4;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2 + (1 - ratio) * 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.96, r * 0.76, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

registerPart(TURRET_VISUAL_ID, drawTurretVisual);

export function createTurret(x, y, enhance, initialAim = 0) {
  return {
    x, y, r: 20, hp: 200, maxHp: 200, alive: true,
    aimAngle: normAngle(initialAim),
    weapon: {
      id: 'turret',
      enhance: enhance || { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
      cooldown: 0,
    },
  };
}

// 自动开火：每帧索敌并追踪；cooldown 期间也转动炮管；进入 ±15° 后齐射。
// rng 保留签名兼容（单发无散射随机）。耐久归零（alive=false）后停火。
export function updateTurret(t, zombies, spawnProjectile, rng, dt) {
  if (!t.alive) return;
  if (!Number.isFinite(t.aimAngle)) t.aimAngle = normAngle(t.weapon.lastAim ?? 0);
  t.weapon.cooldown = Math.max(0, t.weapon.cooldown - dt);

  const s = turretStats(t);
  let best = null, bestD = s.range;
  for (const z of zombies) {
    if (!z.alive) continue;
    const d = Math.hypot(z.x - t.x, z.y - t.y);
    if (d <= s.range && d < bestD) { best = z; bestD = d; }
  }
  if (!best) return;

  const targetAngle = Math.atan2(best.y - t.y, best.x - t.x);
  t.aimAngle = turnToward(t.aimAngle, targetAngle, TURN_RATE * Math.max(0, dt));
  if (t.weapon.cooldown > 0) return;
  if (Math.abs(normAngle(targetAngle - t.aimAngle)) > FIRE_TOLERANCE) return;

  const angle = t.aimAngle;
  for (let i = 0; i < s.projectiles; i++) {
    spawnProjectile({
      x: t.x, y: t.y,
      angle,
      speed: s.projectileSpeed,
      damage: s.damage,
      range: s.range,
      pierce: 0,
      knockback: 0,
      aoe: s.aoe,
      muzzleFlash: { color: PALETTE.gold, count: 2, distance: t.r * 1.4 },
    });
  }
  t.weapon.cooldown = 1 / s.fireRate;
}
