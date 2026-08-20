import { MONSTERS } from '../config/bestiary/monsters.js';
import { calcMonsterStats } from '../systems/scaling.js';
import { slideCircleObstacles } from '../core/physics.js';

// 数值统一走 scaling 管线（设计 §2.1）：
// opts = { level = 冒险关卡序号(无尽/坚守恒 1), tier = 当前档位(coin 递增用), timeSec, mode }
export function createZombie(typeId, x, y, opts = {}) {
  const c = MONSTERS[typeId];
  const s = calcMonsterStats(c, opts);
  return {
    type: typeId, x, y, r: c.radius,
    hp: s.hp, maxHp: s.hp,
    speed: s.speed, damage: s.damage, coin: s.coin,
    knockbackResist: c.knockbackResist,
    behavior: c.behavior || null,
    aoe: c.aoe ? { damage: s.aoeDamage, radius: c.aoe.radius } : undefined, // 缩放后 AoE
    fuseDone: false, // 行为状态位（exploder：引信燃尽标记，behaviors.js 读写）
    counted: false,  // killZombie 防重（战斗击杀即时结算，行为自杀在清理循环补结算）
    kbx: 0, kby: 0, hitFlash: 0, alive: true,
  };
}

// 部署物优先于玩家（挡路）：250px 内最近存活 edible → 朝其移动；接触则原地啃食
// （每秒 z.damage 耐久，hp≤0 置 alive=false）；否则追玩家。edibles=[{x,y,r,hp,alive}]
const EDIBLE_RANGE = 250;

export function updateZombie(z, player, obstacles, dt, edibles = []) {
  let edible = null, d = Infinity;
  for (const e of edibles) {
    if (!e.alive) continue;
    const de = Math.hypot(e.x - z.x, e.y - z.y);
    if (de < d) { d = de; edible = e; }
  }
  const decay = Math.max(0, 1 - 6 * dt); // 击退指数衰减（追谁都要衰减）
  if (edible && d <= EDIBLE_RANGE) {
    if (d <= z.r + edible.r) {
      // 接触：原地啃食，不移动
      edible.hp -= z.damage * dt;
      if (edible.hp <= 0) edible.alive = false;
    } else {
      z.x += (edible.x - z.x) / d * z.speed * dt + z.kbx * dt;
      z.y += (edible.y - z.y) / d * z.speed * dt + z.kby * dt;
    }
    z.kbx *= decay; z.kby *= decay;
    slideCircleObstacles(z, obstacles);
    if (z.hitFlash > 0) z.hitFlash -= dt;
    return;
  }
  const dx = player.x - z.x, dy = player.y - z.y;
  const dd = Math.hypot(dx, dy) || 1;
  z.x += dx / dd * z.speed * dt + z.kbx * dt;
  z.y += dy / dd * z.speed * dt + z.kby * dt;
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
