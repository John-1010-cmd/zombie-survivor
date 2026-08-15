// src/config/weapons.js
export const WEAPONS = {
  pistol: { id: 'pistol', name: '手枪', damage: 12, fireRate: 2.0, projectileSpeed: 500, range: 600,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, knockback: 120, burst: 1, burstInterval: 0 },
  rifle: { id: 'rifle', name: '步枪', damage: 9, fireRate: 1.4, projectileSpeed: 600, range: 600,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, knockback: 100, burst: 3, burstInterval: 0.08 },
  mg: { id: 'mg', name: '机枪', damage: 5, fireRate: 8, projectileSpeed: 550, range: 550,
    projectiles: 1, spread: 6, pierce: 0, aoe: 0, knockback: 60, burst: 1, burstInterval: 0 },
};
export const WEAPON_MAX_LEVEL = 8;
export const ENHANCE_STATS = ['damage', 'fireRate', 'projectiles', 'range'];
export const STAT_LABEL = {
  damage: '伤害 +25%', fireRate: '攻速 +20%', projectiles: '弹道 +1', range: '攻击范围 +20%',
};
