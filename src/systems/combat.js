// 命中结算：弹道 vs 障碍/僵尸（空间网格加速）。纯逻辑模块，无 DOM 依赖。
import { circleHit, circleRectHit } from '../core/physics.js';
import { damageZombie } from '../entities/zombie.js';
import { MAX_ZOMBIE_R } from '../config/zombies.js';

export function resolveProjectileHits(projectiles, hash, obstacles, onKill, onHit) {
  for (const p of projectiles) {
    if (!p.alive) continue;
    // 1) 障碍检测：弹道视为 r=4 的圆
    let blocked = false;
    for (const o of obstacles) {
      if (o.kind === 'circle' ? circleHit(p.x, p.y, 4, o.x, o.y, o.r) : circleRectHit(p.x, p.y, 4, o)) {
        blocked = true;
        break;
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
      if (p.pierce > 0) { p.pierce--; continue; }
      p.alive = false;
      break;
    }
  }
}
