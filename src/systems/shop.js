// src/systems/shop.js —— 商店目录生成与购买逻辑。纯逻辑，无 DOM 依赖。
import { ENHANCE_STATS, WEAPON_MAX_LEVEL } from '../config/weapons.js';
import { ITEM_IDS } from '../config/items.js';
import { ITEM_PRICES, WEAPON_SWAP_PRICE, enhancePrice, earlyTierBonus } from '../config/economy.js';
import { createWeapon, applyEnhancement } from '../entities/weapon.js';
import { addItem } from './inventory.js';

// 商店可换武器（当前武器除外；手枪为初始武器不可购回）
const SWAP_WEAPONS = ['rifle', 'mg'];

// 生成商品目录。game = { coins, weapon, inventory }
export function catalogFor(game, tierRemainingSec) {
  const entries = [];
  const w = game.weapon;

  if (w.level < WEAPON_MAX_LEVEL) {
    const owned = w.level - 1; // 已购增强总次数
    for (const stat of ENHANCE_STATS) {
      entries.push({ kind: 'enhance', stat, price: enhancePrice(owned), owned });
    }
  }
  for (const id of SWAP_WEAPONS) {
    if (id !== w.id) entries.push({ kind: 'weapon', weapon: id, price: WEAPON_SWAP_PRICE });
  }
  for (const id of ITEM_IDS) {
    entries.push({ kind: 'item', item: id, price: ITEM_PRICES[id] });
  }
  // bonus 为 0 时仍列出（"无奖励"标注由 UI 负责）
  entries.push({ kind: 'earlyTier', bonus: earlyTierBonus(tierRemainingSec) });

  return entries;
}

// 购买：余额不足 / 增强已达上限 / earlyTier（不经 buy）返回 false；成功扣款并生效
export function buy(game, entry) {
  if (entry.kind === 'earlyTier') return false;
  if (game.coins < entry.price) return false;

  if (entry.kind === 'enhance') {
    if (game.weapon.level >= WEAPON_MAX_LEVEL) return false;
    game.coins -= entry.price;
    applyEnhancement(game.weapon, entry.stat);
    return true;
  }
  if (entry.kind === 'weapon') {
    game.coins -= entry.price;
    game.weapon = createWeapon(entry.weapon);
    return true;
  }
  if (entry.kind === 'item') {
    game.coins -= entry.price;
    addItem(game.inventory, entry.item, 1);
    return true;
  }
  return false;
}
