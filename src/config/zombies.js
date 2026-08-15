// src/config/zombies.js
export const ZOMBIES = {
  normal: { id: 'normal', name: '普通僵尸', hp: 30, speed: 70, damage: 8, xp: 1,
    radius: 14, color: '#6a8f6a', knockbackResist: 0, cost: 1 },
  fast: { id: 'fast', name: '高速僵尸', hp: 18, speed: 140, damage: 6, xp: 1,
    radius: 11, color: '#c9c25a', knockbackResist: 0, cost: 1 },
  tank: { id: 'tank', name: '坦克僵尸', hp: 220, speed: 40, damage: 20, xp: 5,
    radius: 24, color: '#a85a5a', knockbackResist: 0.8, cost: 6 },
};
export const MAX_ZOMBIE_R = Math.max(...Object.values(ZOMBIES).map(z => z.radius));
