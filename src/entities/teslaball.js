// 电磁球：磁电弹命中后生成，沿弹道方向慢速移动并对周围僵尸周期电击。纯逻辑模块，无 DOM 依赖。
import { damageZombie } from './zombie.js';

const TICK_INTERVAL = 0.25; // 电击周期
const TICK_RADIUS = 30;     // 电击判定半径（球心到僵尸圆心距 ≤ TICK_RADIUS + z.r）
const KNOCKBACK = 60;

export function createTeslaBall(x, y, vx, vy, damage) {
  return { x, y, vx, vy, r: 22, damage, tickT: TICK_INTERVAL, life: 2.5, alive: true };
}

// 移动 + 周期电击；tick 时对半径内 alive 僵尸 damageZombie（击退背离球心）并回调
// onHit(z) / onKill(z)；life 耗尽 → alive=false。返回是否存活。
export function updateTeslaBall(b, zombies, dt, onHit, onKill) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.tickT -= dt;
  if (b.tickT <= 0) {
    for (const z of zombies) {
      if (!z.alive) continue;
      if (Math.hypot(z.x - b.x, z.y - b.y) > TICK_RADIUS + z.r) continue;
      const died = damageZombie(z, b.damage, KNOCKBACK, Math.atan2(z.y - b.y, z.x - b.x));
      onHit(z);
      if (died) onKill(z);
    }
    b.tickT = TICK_INTERVAL;
  }
  b.life -= dt;
  if (b.life <= 0) b.alive = false;
  return b.alive;
}
