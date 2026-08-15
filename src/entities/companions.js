// 辅助武器：随行无人机 / 随行移动火炮 / 随行远程火炮。纯逻辑模块，无 DOM 依赖。
// 基值 per 迭代 03 数值裁定 §4；强化 per-type 分维，公式与 weaponStats 同乘区/加法
// （damage ×1.25^ / fireRate ×1.2^ / projectiles + / range ×1.2^）。
export const AUX_CONFIG = {
  drone: { name: '随行无人机', orbit: 90, damage: 6, fireRate: 2, projectileSpeed: 500, range: 250, aoe: 0 },
  gunner: { name: '随行移动火炮', follow: 60, damage: 15, fireRate: 1, projectileSpeed: 400, range: 320, aoe: 60 },
  sniper: { name: '随行远程火炮', follow: 100, damage: 30, fireRate: 0.4, projectileSpeed: 700, range: 500, aoe: 0 },
};

export function createAux() {
  return {
    counts: { drone: 0, gunner: 0, sniper: 0 },
    enhance: {
      drone: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
      gunner: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
      sniper: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
    },
    bodies: [],
    t: 0, // 环绕时间累计（drone 轨道角 = idx 均分 + t·2）
  };
}

// 单载体数值：基值缺省 projectiles 视为 1
export function auxStats(body) {
  const base = AUX_CONFIG[body.kind];
  const e = body.weapon.enhance || {};
  return {
    damage: base.damage * Math.pow(1.25, e.damage || 0),
    fireRate: base.fireRate * Math.pow(1.2, e.fireRate || 0),
    projectiles: (base.projectiles ?? 1) + (e.projectiles || 0),
    range: base.range * Math.pow(1.2, e.range || 0),
    projectileSpeed: base.projectileSpeed,
    aoe: base.aoe,
  };
}

// 按 counts 重建载体：每把独立 weapon（enhance 共享 type 级引用，已部署载体吃后续强化）
export function spawnAuxBodies(aux) {
  aux.bodies = [];
  for (const kind of Object.keys(AUX_CONFIG)) {
    for (let idx = 0; idx < aux.counts[kind]; idx++) {
      aux.bodies.push({
        kind, idx,
        weapon: { id: 'aux', base: AUX_CONFIG[kind], enhance: aux.enhance[kind], cooldown: 0 },
        x: 0, y: 0,
      });
    }
  }
}

// 运动 + 开火：
// - drone：环绕玩家（半径 orbit，角速 2rad/s，起始角按 idx 均分）
// - gunner/sniper：朝玩家后方 follow 偏移点插值（lerp 0.1）
// - 开火：索敌（range 内最近 alive）→ cooldown 制齐射，弹道透传 aoe
export function updateAuxBodies(aux, player, zombies, spawnProjectile, rng, dt) {
  aux.t += dt;
  for (const body of aux.bodies) {
    const base = AUX_CONFIG[body.kind];
    // 1) 运动
    if (body.kind === 'drone') {
      const a = (body.idx / aux.counts.drone) * 2 * Math.PI + aux.t * 2;
      body.x = player.x + base.orbit * Math.cos(a);
      body.y = player.y + base.orbit * Math.sin(a);
    } else {
      const fx = player.facing ?? 0;
      const tx = player.x - Math.cos(fx) * base.follow;
      const ty = player.y - Math.sin(fx) * base.follow;
      body.x += (tx - body.x) * 0.1;
      body.y += (ty - body.y) * 0.1;
    }
    // 2) 索敌开火
    body.weapon.cooldown = Math.max(0, body.weapon.cooldown - dt);
    if (body.weapon.cooldown > 0) continue;
    const s = auxStats(body);
    let best = null, bestD = s.range;
    for (const z of zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - body.x, z.y - body.y);
      if (d <= s.range && d < bestD) { best = z; bestD = d; }
    }
    if (!best) continue;
    const angle = Math.atan2(best.y - body.y, best.x - body.x);
    for (let i = 0; i < s.projectiles; i++) {
      spawnProjectile({
        x: body.x, y: body.y,
        angle,
        speed: s.projectileSpeed,
        damage: s.damage,
        range: s.range,
        pierce: 0,
        knockback: 60,
        aoe: s.aoe,
        arc: false,
        chain: 0,
      });
    }
    body.weapon.cooldown = 1 / s.fireRate;
  }
}
