// src/config/bestiary/monsters.js —— 怪物图鉴（设计 §4）。替代 config/zombies.js。
// 新增种类：换皮换数值 → 加一条数据（behavior: null）即可；
//           新机制 → 先在 systems/behaviors.js 注册行为模块，再在此声明 behavior 字段。
// 字段契约：id/name/desc/hp/speed/damage/coin/radius/knockbackResist/cost/visual/behavior 必填；
//           aoe（仅 AoE 怪）、special（仅 boss）可选。数值缩放走 systems/scaling.js。
export const MONSTERS = {
  normal: {
    id: 'normal', name: '普通僵尸', desc: '最基础的感染者，成群结队地涌来。',
    hp: 30, speed: 70, damage: 8, coin: 1,
    radius: 14, knockbackResist: 0, cost: 1,
    visual: { shape: 'circle', color: '#6a8f6a', glow: 0.3 },
    behavior: null,
  },
  fast: {
    id: 'fast', name: '高速僵尸', desc: '速度极快的感染者，擅长包抄侧翼。',
    hp: 18, speed: 140, damage: 6, coin: 1,
    radius: 11, knockbackResist: 0, cost: 1,
    visual: { shape: 'triangle', color: '#c9c25a', glow: 0.3 },
    behavior: null,
  },
  tank: {
    id: 'tank', name: '坦克僵尸', desc: '皮糙肉厚的大型感染者，几乎不为击退所动。',
    hp: 220, speed: 40, damage: 20, coin: 5,
    radius: 24, knockbackResist: 0.8, cost: 6,
    visual: { shape: 'hexagon', color: '#a85a5a', glow: 0.3 },
    behavior: null,
  },
  boss: {
    id: 'boss', name: '守门Boss', desc: '守在撤离点的巨型感染者。只在坚守模式最后时刻出现。',
    hp: 7040, speed: 20, damage: 40, coin: 50,
    radius: 41, knockbackResist: 0.95, cost: 999,
    visual: { shape: 'pentagon', color: '#7a2f2f', glow: 0.5 },
    behavior: null,
    special: true, // 不走关卡倍率与局内增长（设计 §2.1 Boss 例外）；坚守隐藏期间图鉴界面不显示
  },
  exploder: {
    id: 'exploder', name: '自爆僵尸', desc: '接近目标后点燃引信，1.2 秒后自爆。趁引信未燃尽将其击毙！',
    hp: 40, speed: 90, damage: 5, coin: 3,
    radius: 13, knockbackResist: 0, cost: 2,
    visual: { shape: 'diamond', color: '#e08a3c', glow: 0.5 },
    behavior: 'exploder',
    aoe: { damage: 30, radius: 80 }, // AoE 与接触 damage 同乘区缩放（设计 §4.3）
  },
};

export const MAX_ZOMBIE_R = Math.max(...Object.values(MONSTERS).map(z => z.radius));

// 图鉴界面陈列：当前可达模式可出现的种类（special 条目在坚守隐藏期间不显示，设计 §7）。
// includeSpecial=true 时包含特殊条目（本期坚守恒隐藏、boss 恒不显示；恢复坚守时图鉴传 includeSpecial: true，
// 数据与击杀统计保留，恢复后自动出现）。
export function playableMonsters({ includeSpecial = false } = {}) {
  return Object.values(MONSTERS).filter(m => includeSpecial || !m.special);
}

// 自爆僵尸行为常量（设计 §4.3，本期新定数值，已确认）。
// 由 behaviors.js 与 render.js 共同 import，避免 entities→systems 反向依赖。
export const EXPLODER_FUSE_TIME = 1.2; // 引信时长
export const EXPLODER_TRIGGER_R = 50;  // 距当前目标触发距离（本期新定数值，已确认）
