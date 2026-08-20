// src/systems/behaviors.js —— 怪物行为注册表（设计 §4.2）。
// 新增机制怪：1) 此处注册行为模块  2) config/bestiary/monsters.js 条目声明 behavior 字段。
// 钩子签名 (z, dt?, ctx)；ctx = { player, deployables, damagePlayer(dmg), spawnRing(x,y,r), rng }（动作回调型）。
// AoE 数值在 createZombie 时已缓存缩放（与接触 damage 同乘区），此处直接取 z.aoe.damage，不再现算（设计 §4.3）。
// onSpawn/onHit 为预留钩子（本期无消费者，未接线）；behavior: null 全部跳过。
import { EXPLODER_FUSE_TIME, EXPLODER_TRIGGER_R } from '../config/bestiary/monsters.js';

const EXPLODER_TARGET_RANGE = 250; // 目标搜索半径：与现行僵尸 AI EDIBLE_RANGE 一致（部署物优先）

export const BEHAVIORS = {
  exploder: {
    // 接近目标开始引信；引信燃尽置 fuseDone 并死亡（自爆，由 game.js 清理循环走 killZombie 结算）。
    // 目标判定与现行僵尸 AI 一致（设计 §4.3）：250px 内最近存活部署物优先，否则玩家。
    onUpdate(z, dt, ctx) {
      if (z.fuseDone) return;
      if (z.fuse === undefined) {
        let d = Infinity;
        for (const e of ctx.deployables) {
          if (!e.alive) continue;
          const de = Math.hypot(e.x - z.x, e.y - z.y);
          if (de < d) d = de;
        }
        if (!(d <= EXPLODER_TARGET_RANGE)) d = Math.hypot(ctx.player.x - z.x, ctx.player.y - z.y);
        if (d <= EXPLODER_TRIGGER_R + z.r) z.fuse = 0;
        return;
      }
      z.fuse += dt;
      if (z.fuse >= EXPLODER_FUSE_TIME) {
        z.fuseDone = true;
        z.alive = false;
      }
    },
    // 仅引信燃尽的自爆才结算 AoE（用户裁定：引信中被击杀不爆）；对玩家与部署物生效
    onDeath(z, ctx) {
      if (!z.fuseDone || !z.aoe) return false;
      const r = z.aoe.radius;
      ctx.spawnRing(z.x, z.y, r);
      if (Math.hypot(ctx.player.x - z.x, ctx.player.y - z.y) <= r + ctx.player.r)
        ctx.damagePlayer(z.aoe.damage);
      for (const e of ctx.deployables) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - z.x, e.y - z.y) <= r + e.r) {
          e.hp -= z.aoe.damage;
          if (e.hp <= 0) e.alive = false;
        }
      }
      return true;
    },
  },
};
