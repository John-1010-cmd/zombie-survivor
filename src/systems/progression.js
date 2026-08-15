import { WEAPONS, WEAPON_MAX_LEVEL, ENHANCE_STATS } from '../config/weapons.js';
import { pickWeighted } from '../core/rng.js';
import { createWeapon, applyEnhancement } from '../entities/weapon.js';

export function xpNeed(level) {
  return 10 + (level - 1) * 7;
}

export function addXp(player, amount) {
  player.xp += amount;
  let count = 0;
  while (player.xp >= xpNeed(player.level)) {
    player.xp -= xpNeed(player.level);
    player.level++;
    count++;
  }
  return count;
}

export function drawCards(weapon, rng) {
  const pool = [];
  if (weapon.level < WEAPON_MAX_LEVEL) {
    for (const stat of ENHANCE_STATS) pool.push({ type: 'enhance', stat });
  }
  for (const id of Object.keys(WEAPONS)) {
    if (id !== weapon.id) pool.push({ type: 'swap', weapon: id });
  }
  const remaining = pool.slice();
  const cards = [];
  while (cards.length < 4 && remaining.length > 0) {
    const weights = {};
    for (let i = 0; i < remaining.length; i++) weights[i] = 10;
    const idx = Number(pickWeighted(rng, weights)); // 对池内下标不放回抽取
    cards.push(remaining.splice(idx, 1)[0]);
  }
  while (cards.length < 4) cards.push({ type: 'heal' }); // MVP 兜底：升级永远有收益
  return cards;
}

export function applyCard(game, card) {
  if (card.type === 'enhance') applyEnhancement(game.weapon, card.stat);
  else if (card.type === 'swap') game.weapon = createWeapon(card.weapon); // 新武器 Lv1
  else game.player.hp = Math.min(game.player.maxHp, game.player.hp + game.player.maxHp * 0.5);
}
