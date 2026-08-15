// 部署物：固定火炮。纯逻辑模块，无 DOM 依赖。
// 基值 per 迭代 03 数值裁定 §3（2026-08-15 射程再下调）：伤害 25 / 射速 0.5 / 弹速 350 / 射程 350 / aoe 80 / 耐久 200。
// 强化公式与 weaponStats 同乘区/加法（damage ×1.25^ / fireRate ×1.2^ / projectiles + / range ×1.2^），内部计算。
const TURRET_BASE = { damage: 25, fireRate: 0.5, projectileSpeed: 350, range: 350, aoe: 80 };

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

// enhance 需与 game.turretEnhance 同一引用：已部署炮台也吃后续强化
export function createTurret(x, y, enhance) {
  return {
    x, y, r: 20, hp: 200, maxHp: 200, alive: true,
    weapon: {
      id: 'turret',
      enhance: enhance || { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
      cooldown: 0,
    },
  };
}

// 自动开火：索敌（range 内最近 alive）→ 齐射 projectiles 发 → cooldown 制。
// rng 保留签名兼容（单发无散射随机）。耐久归零（alive=false）后停火。
export function updateTurret(t, zombies, spawnProjectile, rng, dt) {
  if (!t.alive) return;
  t.weapon.cooldown = Math.max(0, t.weapon.cooldown - dt);
  if (t.weapon.cooldown > 0) return;
  const s = turretStats(t);
  let best = null, bestD = s.range;
  for (const z of zombies) {
    if (!z.alive) continue;
    const d = Math.hypot(z.x - t.x, z.y - t.y);
    if (d <= s.range && d < bestD) { best = z; bestD = d; }
  }
  if (!best) return;
  const angle = Math.atan2(best.y - t.y, best.x - t.x);
  t.weapon.lastAim = angle; // 炮管朝向（渲染用）
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
    });
  }
  t.weapon.cooldown = 1 / s.fireRate;
}
