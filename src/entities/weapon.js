// 武器实例：增强计算、索敌、cooldown 开火与 burst 连发。纯逻辑模块，无 DOM 依赖。
import { WEAPONS, STAT_MAX } from '../config/weapons.js';

export function createWeapon(id) {
  return {
    id,
    spent: 0, // 该武器累计已花费的强化银币（换枪时全额返还）
    enhance: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
    cooldown: 0, burstLeft: 0, burstTimer: 0, aimAngle: 0,
  };
}

export function weaponStats(w) {
  const c = WEAPONS[w.id];
  return {
    damage: c.damage * Math.pow(1.25, w.enhance.damage),
    fireRate: c.fireRate * Math.pow(1.2, w.enhance.fireRate),
    projectiles: c.projectiles + w.enhance.projectiles,
    range: c.range * Math.pow(1.2, w.enhance.range),
    projectileSpeed: c.projectileSpeed,
    spread: c.spread,
    pierce: c.pierce,
    aoe: c.aoe || 0,
    arc: c.arc === true,
    chain: c.chain || 0,
    knockback: c.knockback,
    burst: c.burst,
    burstInterval: c.burstInterval,
  };
}

// per-stat 强化：每维独立上限 STAT_MAX（0–8），满维忽略
export function applyEnhancement(w, stat) {
  if (w.enhance[stat] >= STAT_MAX) return;
  w.enhance[stat] += 1;
}

function acquireTarget(w, owner, zombies, stats) {
  let best = null, bestD = stats.range;
  for (const z of zombies) {
    if (!z.alive) continue;
    const d = Math.hypot(z.x - owner.x, z.y - owner.y);
    if (d <= stats.range && d < bestD) { best = z; bestD = d; }
  }
  return best;
}

function fire(w, owner, target, stats, spawnProjectile, rng) {
  w.aimAngle = Math.atan2(target.y - owner.y, target.x - owner.x);
  const n = stats.projectiles;
  for (let i = 0; i < n; i++) {
    const fan = (i - (n - 1) / 2) * 0.12;
    const jitter = (rng() * 2 - 1) * stats.spread * Math.PI / 180;
    spawnProjectile({
      x: owner.x, y: owner.y,
      angle: w.aimAngle + fan + jitter,
      speed: stats.projectileSpeed,
      damage: stats.damage,
      range: stats.range,
      pierce: stats.pierce,
      knockback: stats.knockback,
      aoe: stats.aoe,
      arc: stats.arc,
      chain: stats.chain,
    });
  }
}

export function updateWeapon(w, owner, zombies, spawnProjectile, rng, dt) {
  w.cooldown = Math.max(0, w.cooldown - dt); // 钳到 0：无目标时不累积负值
  const stats = weaponStats(w);
  // burst 补发：每 burstInterval 一发，仍需有目标
  if (w.burstLeft > 0) {
    w.burstTimer -= dt;
    if (w.burstTimer <= 0) {
      const t = acquireTarget(w, owner, zombies, stats);
      if (t) {
        fire(w, owner, t, stats, spawnProjectile, rng);
        w.burstLeft -= 1;
        w.burstTimer = stats.burstInterval;
      }
    }
  }
  // cooldown 制常规开火
  if (w.cooldown > 0) return;
  const target = acquireTarget(w, owner, zombies, stats);
  if (!target) return;
  fire(w, owner, target, stats, spawnProjectile, rng);
  w.cooldown = 1 / stats.fireRate;
  if (stats.burst > 1) {
    w.burstLeft = stats.burst - 1;
    w.burstTimer = stats.burstInterval;
  }
}
