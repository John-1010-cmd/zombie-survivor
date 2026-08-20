// 武器实例：增强计算、索敌、cooldown 开火与 burst 连发。纯逻辑模块，无 DOM 依赖。
import { WEAPONS, STAT_MAX } from '../config/bestiary/weapons.js';
import { weaponDamage } from '../systems/scaling.js';

export function createWeapon(id, outLevel = 0) {
  return {
    id,
    outLevel, // 局外等级（金币升级，设计 §6.2）：换枪时按 meta 等级重建（shop.js）
    spent: 0, // 该武器累计已花费的强化银币（换枪时全额返还）
    enhance: { damage: 0, fireRate: 0, projectiles: 0, range: 0,
      fragCount: 0, fragDamage: 0, chainLen: 0, chainDmg: 0 },
    cooldown: 0, burstLeft: 0, burstTimer: 0, aimAngle: 0,
  };
}

export function weaponStats(w) {
  const c = WEAPONS[w.id];
  const e = w.enhance;
  return {
    damage: weaponDamage(c.damage, w.outLevel, e.damage), // 双乘区（设计 §2.2，线性取代旧复利）
    fireRate: c.fireRate * Math.pow(1.2, e.fireRate),
    projectiles: c.projectiles + e.projectiles,
    range: c.range * Math.pow(1.2, e.range),
    projectileSpeed: c.projectileSpeed,
    spread: c.spread,
    pierce: c.pierce,
    aoe: c.aoe || 0,
    arc: c.arc === true,
    chain: c.chain || 0,
    knockback: c.knockback,
    burst: c.burst,
    burstInterval: c.burstInterval,
    // 专属维派生（|| 0 兜底：旧存档/炮台 enhance 可能只有四维）
    fragCount: 8 + 2 * (e.fragCount || 0),        // 榴弹碎片：8 → 8+2n，上限 24
    fragDmgMult: 0.4 * Math.pow(1.15, e.fragDamage || 0), // 碎片伤害 = 主伤 × 0.4×1.15^n
    chainLen: 3 + (e.chainLen || 0),              // 链路：3 → 3+n，上限 11
    chainDmgMult: 1 + 0.05 * (e.chainDmg || 0),   // 每跳链伤乘区
  };
}

// per-stat 强化：每维独立上限 STAT_MAX（0–8），满维忽略；未知 stat 忽略
export function applyEnhancement(w, stat) {
  if (!(stat in w.enhance)) return;
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
    const opts = {
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
      visual: WEAPONS[w.id].visual, // 图鉴视觉描述（设计 §9.2），渲染层按 visual 绘制
    };
    // 专属弹道：榴弹带 frags（二次爆炸参数），磁电带链增强乘区
    if (w.id === 'grenade') {
      opts.frags = { count: stats.fragCount, dmg: stats.damage * stats.fragDmgMult };
    } else if (w.id === 'tesla') {
      opts.chain = stats.chainLen;
      opts.chainMult = 0.8;
      opts.chainDmgMult = stats.chainDmgMult;
    }
    spawnProjectile(opts);
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
