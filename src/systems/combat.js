// 命中结算：弹道 vs 障碍/僵尸（空间网格加速）+ 炸弹 AoE + 火箭爆炸 + 磁电链电。纯逻辑模块，无 DOM 依赖。
import { circleHit, circleRectHit } from '../core/physics.js';
import { damageZombie } from '../entities/zombie.js';
import { MAX_ZOMBIE_R } from '../config/zombies.js';

// 炸弹/火箭 AoE：线性遍历，alive 且圆心距 ≤ radius + z.r 的僵尸受击（击退 200，方向背离爆心），按死亡回调。
// skip 可选：跳过指定僵尸（火箭主目标已单独结算，防双算）。
export function explode(x, y, radius, damage, zombies, onHit, onKill, skip = null) {
  for (const z of zombies) {
    if (z === skip || !z.alive) continue;
    if (Math.hypot(z.x - x, z.y - y) > radius + z.r) continue;
    const died = damageZombie(z, damage, 200, Math.atan2(z.y - y, z.x - x));
    onHit(z);
    if (died) onKill(z);
  }
}

export function resolveProjectileHits(projectiles, hash, obstacles, onKill, onHit, allZombies = null, opts = {}) {
  for (const p of projectiles) {
    if (!p.alive) continue;
    // 1) 障碍检测：弹道视为 r=4 的圆；arc 弹（榴弹抛射）无视障碍
    let blocked = false;
    if (p.arc !== true) {
      for (const o of obstacles) {
        if (o.kind === 'circle' ? circleHit(p.x, p.y, 4, o.x, o.y, o.r) : circleRectHit(p.x, p.y, 4, o)) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) { p.alive = false; continue; }
    // 2) 网格取候选，逐个跳过死尸并判定命中
    for (const z of hash.query(p.x, p.y, 4 + MAX_ZOMBIE_R)) {
      if (!z.alive) continue;
      if (!circleHit(p.x, p.y, 4, z.x, z.y, z.r)) continue;
      const died = damageZombie(z, p.damage, p.knockback, p.angle);
      onHit(z, p);
      if (died) onKill(z);
      // 3) aoe（火箭/榴弹）：主目标已结算，爆炸覆盖其余（跳过主目标与死尸防双算）
      if (p.aoe > 0) {
        const pool = allZombies || hash.query(p.x, p.y, p.aoe + MAX_ZOMBIE_R);
        explode(p.x, p.y, p.aoe, p.damage, pool,
          hz => onHit(hz, p), hz => onKill(hz), z);
        opts.onExplode?.(p.x, p.y, p.aoe);
        // 榴弹二次爆炸：aoe 结算后若带 frags → 交 game.js 生成碎片弹
        if (p.frags) opts.onFrag?.(p.x, p.y, p.frags);
      }
      // 4) chain（磁电）：自主目标起向 300px 内最近未链僵尸逐跳，伤害 ×chainMult^i×chainDmgMult
      if (p.chain > 0) {
        const pool = allZombies || hash.query(p.x, p.y, 300 + MAX_ZOMBIE_R);
        const chainMult = p.chainMult ?? 0.8;   // 弹未显式携带时按默认 0.8
        const chainDmgMult = p.chainDmgMult ?? 1;
        const chained = new Set([z]);
        const path = [{ x: z.x, y: z.y }]; // 特效链路：主目标起逐跳
        let cur = z;
        for (let i = 1; i <= p.chain; i++) {
          let next = null, nextD = 300;
          for (const c of pool) {
            if (chained.has(c) || !c.alive) continue;
            const d = Math.hypot(c.x - cur.x, c.y - cur.y);
            if (d < nextD) { next = c; nextD = d; }
          }
          if (!next) break;
          chained.add(next);
          path.push({ x: next.x, y: next.y });
          const died2 = damageZombie(next, p.damage * Math.pow(chainMult, i) * chainDmgMult, p.knockback,
            Math.atan2(next.y - cur.y, next.x - cur.x));
          onHit(next, p);
          if (died2) onKill(next);
          cur = next;
        }
        opts.onChain?.(path);
      }
      // 5) aoe/chain 弹不穿透：命中即消亡；常规弹按 pierce 决定是否继续
      if (p.aoe > 0 || p.chain > 0) { p.alive = false; break; }
      if (p.pierce > 0) { p.pierce--; continue; }
      p.alive = false;
      break;
    }
  }
}
