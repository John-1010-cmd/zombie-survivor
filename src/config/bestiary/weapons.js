// src/config/bestiary/weapons.js —— 武器图鉴（设计 §5）。替代 config/weapons.js。
// 新增武器：纯数值 → 加一条数据即可在商店/图鉴出现；
//           带专属维 → 另需在 entities/weapon.js 的 weaponStats()/fire() 加分支（SPECIAL_STATS 只控商店展示）。
// 必填字段契约：id/name/desc/damage/fireRate/projectileSpeed/range/projectiles/spread/pierce/
//              aoe/arc/chain/knockback/burst/burstInterval/basePrice/visual（bestiary.test.js 校验）。
export const WEAPONS = {
  pistol: {
    id: 'pistol', icon: 'icon.weapon.pistol', name: '手枪', desc: '可靠的随身武器，均衡而稳定。',
    damage: 12, fireRate: 2.0, projectileSpeed: 500, range: 300,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 0,
    knockback: 120, burst: 1, burstInterval: 0, basePrice: 40,
    visual: { bulletShape: 'dot', color: '#ffe066', trail: 0.3, hitParticles: 6, muzzleGlow: 0.4 },
  },
  rifle: {
    id: 'rifle', icon: 'icon.weapon.rifle', name: '步枪', desc: '三连发点射，中距离压制利器。',
    damage: 9, fireRate: 1.4, projectileSpeed: 600, range: 320,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 0,
    knockback: 100, burst: 3, burstInterval: 0.08, basePrice: 80,
    visual: { bulletShape: 'bar', color: '#ffd75e', trail: 0.4, hitParticles: 6, muzzleGlow: 0.5 },
  },
  mg: {
    id: 'mg', icon: 'icon.weapon.mg', name: '机枪', desc: '泼洒弹雨压制尸潮，单发威力有限。',
    damage: 5, fireRate: 8, projectileSpeed: 550, range: 280,
    projectiles: 1, spread: 6, pierce: 0, aoe: 0, arc: false, chain: 0,
    knockback: 60, burst: 1, burstInterval: 0, basePrice: 80,
    visual: { bulletShape: 'dot', color: '#ffb04d', trail: 0.25, hitParticles: 4, muzzleGlow: 0.3 },
  },
  rocket: {
    id: 'rocket', icon: 'icon.weapon.rocket', name: '火箭炮', desc: '爆炸覆盖一片区域，稳扎稳打的重火力。',
    damage: 30, fireRate: 0.7, projectileSpeed: 350, range: 350,
    projectiles: 1, spread: 0, pierce: 0, aoe: 90, arc: false, chain: 0,
    knockback: 0, burst: 1, burstInterval: 0, basePrice: 150,
    visual: { bulletShape: 'polygon', color: '#f80', trail: 0.8, hitParticles: 16, muzzleGlow: 0.9 },
  },
  grenade: {
    id: 'grenade', icon: 'icon.weapon.grenade', name: '榴弹炮', desc: '抛射榴弹越过障碍，落地后二次爆炸碎片四射。',
    damage: 25, fireRate: 0.6, projectileSpeed: 420, range: 330,
    projectiles: 1, spread: 0, pierce: 0, aoe: 130, arc: true, chain: 0,
    knockback: 0, burst: 1, burstInterval: 0, basePrice: 200,
    visual: { bulletShape: 'polygon', color: '#e06a4d', trail: 0.8, hitParticles: 16, muzzleGlow: 0.9 },
  },
  tesla: {
    id: 'tesla', icon: 'icon.weapon.tesla', name: '磁电枪', desc: '链状电弧在敌群间跳跃传导。',
    damage: 14, fireRate: 1.2, projectileSpeed: 800, range: 260,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 3,
    knockback: 0, burst: 1, burstInterval: 0, basePrice: 250,
    visual: { bulletShape: 'arc', color: '#5ef', trail: 0.5, hitParticles: 8, muzzleGlow: 0.7 },
  },
  sniperRifle: {
    id: 'sniperRifle', icon: 'icon.weapon.sniperRifle', name: '狙击枪', desc: '超视距一击贯穿，光针所至尸骸洞穿。',
    damage: 60, fireRate: 0.5, projectileSpeed: 1200, range: 600,
    projectiles: 1, spread: 0, pierce: 5, aoe: 0, arc: false, chain: 0,
    knockback: 200, burst: 1, burstInterval: 0, basePrice: 200,
    visual: { bulletShape: 'needle', color: '#aef', trail: 0.9, hitParticles: 8, muzzleGlow: 0.8 },
  },
};

export const STAT_MAX = 8; // 每维（damage/fireRate/projectiles/range）独立可购上限
export const WEAPON_MAX_LEVEL = 8; // 兼容既有引用（数值同 STAT_MAX）；仅局内强化上限，局外金币等级上限见 core/meta.js 的 MAX_WEAPON_LEVEL(=10)
export const ENHANCE_STATS = ['damage', 'fireRate', 'projectiles', 'range'];
export const STAT_LABEL = {
  damage: '伤害 +25%', fireRate: '攻速 +20%', projectiles: '弹道 +1', range: '攻击范围 +20%',
  fragCount: '榴弹碎片 +2', fragDamage: '二次伤害 +15%', chainLen: '链路长度 +1', chainDmg: '二次伤害 +5%',
};
// 专属强化维（仅对应武器展示，不进通用四维；商店按武器 id 追加）
export const SPECIAL_STATS = {
  grenade: ['fragCount', 'fragDamage'],
  tesla: ['chainLen', 'chainDmg'],
};
