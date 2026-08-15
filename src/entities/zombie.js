import { ZOMBIES } from '../config/zombies.js';
import { slideCircleObstacles } from '../core/physics.js';

export function createZombie(typeId, x, y, tierCfg) {
  const c = ZOMBIES[typeId];
  return {
    type: typeId, x, y, r: c.radius,
    hp: c.hp * tierCfg.hpMult, maxHp: c.hp * tierCfg.hpMult,
    speed: c.speed * tierCfg.speedMult,
    damage: c.damage, xp: c.xp,
    knockbackResist: c.knockbackResist,
    kbx: 0, kby: 0, hitFlash: 0, alive: true,
  };
}

export function updateZombie(z, player, obstacles, dt) {
  const dx = player.x - z.x, dy = player.y - z.y;
  const d = Math.hypot(dx, dy) || 1;
  z.x += dx / d * z.speed * dt + z.kbx * dt;
  z.y += dy / d * z.speed * dt + z.kby * dt;
  const decay = Math.max(0, 1 - 6 * dt); // 击退指数衰减
  z.kbx *= decay; z.kby *= decay;
  slideCircleObstacles(z, obstacles);
  if (z.hitFlash > 0) z.hitFlash -= dt;
}

export function damageZombie(z, dmg, kb, angle) {
  z.hp -= dmg;
  z.hitFlash = 0.1;
  const f = kb * (1 - z.knockbackResist);
  z.kbx += Math.cos(angle) * f;
  z.kby += Math.sin(angle) * f;
  if (z.hp <= 0) { z.alive = false; return true; }
  return false;
}
