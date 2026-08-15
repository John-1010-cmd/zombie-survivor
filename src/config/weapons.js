// src/config/weapons.js
export const WEAPONS = {
  pistol: { id: 'pistol', name: '手枪', damage: 12, fireRate: 2.0, projectileSpeed: 500, range: 300,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 0, knockback: 120, burst: 1, burstInterval: 0 },
  rifle: { id: 'rifle', name: '步枪', damage: 9, fireRate: 1.4, projectileSpeed: 600, range: 320,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 0, knockback: 100, burst: 3, burstInterval: 0.08 },
  mg: { id: 'mg', name: '机枪', damage: 5, fireRate: 8, projectileSpeed: 550, range: 280,
    projectiles: 1, spread: 6, pierce: 0, aoe: 0, arc: false, chain: 0, knockback: 60, burst: 1, burstInterval: 0 },
  rocket: { id: 'rocket', name: '火箭炮', damage: 30, fireRate: 0.7, projectileSpeed: 350, range: 350,
    projectiles: 1, spread: 0, pierce: 0, aoe: 90, arc: false, chain: 0, knockback: 0, burst: 1, burstInterval: 0 },
  grenade: { id: 'grenade', name: '榴弹炮', damage: 25, fireRate: 0.6, projectileSpeed: 420, range: 330,
    projectiles: 1, spread: 0, pierce: 0, aoe: 130, arc: true, chain: 0, knockback: 0, burst: 1, burstInterval: 0 },
  tesla: { id: 'tesla', name: '磁电枪', damage: 14, fireRate: 1.2, projectileSpeed: 800, range: 260,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 3, knockback: 0, burst: 1, burstInterval: 0 },
};
export const STAT_MAX = 8; // 每维（damage/fireRate/projectiles/range）独立可购上限
export const WEAPON_MAX_LEVEL = 8; // 兼容既有引用（数值同 STAT_MAX）
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
// 商店基价（换枪价 = round5(base × 1.4^weaponBought)，见 config/economy.js weaponPrice）
export const WEAPON_BASE_PRICE = { pistol: 40, rifle: 80, mg: 80, rocket: 150, grenade: 200, tesla: 250 };
