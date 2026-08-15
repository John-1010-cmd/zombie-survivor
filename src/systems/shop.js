// src/systems/shop.js —— 商店目录生成与购买逻辑。纯逻辑，无 DOM 依赖。
// 分组目录（plan §6）：武器强化 / 更换武器 / 辅助武器 / 辅助强化 / 道具 / 风险
import { ENHANCE_STATS, STAT_MAX, SPECIAL_STATS } from '../config/weapons.js';
import { ITEM_IDS } from '../config/items.js';
import {
  ITEM_PRICES, DEPLOY_PRICES, AUX_PRICES, AUX_MAX,
  WEAPON_BASE_PRICE, weaponPrice, itemPrice, enhancePrice, earlyTierBonus,
} from '../config/economy.js';
import { createWeapon, applyEnhancement } from '../entities/weapon.js';
import { addItem } from './inventory.js';

const AUX_TYPES = ['drone', 'gunner', 'sniper'];
const TURRET_STATS = ['damage', 'fireRate', 'projectiles', 'range'];

// 生成分组商品目录。game = { coins, weapon, inventory, aux, turretEnhance, wallEnhance, weaponBought }
export function catalogFor(game, tierRemainingSec) {
  const w = game.weapon;

  // 武器强化：四维独立计价 + 当前武器的专属维（迭代 05：榴弹碎片/二次伤害、磁电链路/链伤），仅对应武器展示
  const weaponEnhance = [];
  const stats = [...ENHANCE_STATS, ...(SPECIAL_STATS[w.id] || [])];
  for (const stat of stats) {
    const owned = w.enhance[stat] ?? 0;
    if (owned >= STAT_MAX) continue;
    weaponEnhance.push({ kind: 'enhance', stat, price: enhancePrice(owned), owned });
  }

  // 更换武器：全部非当前武器（含手枪可回购），价格随**全局换枪次数**递增（用户裁定：维持全局计数）
  const weapons = [];
  for (const id of Object.keys(WEAPON_BASE_PRICE)) {
    if (id === w.id) continue;
    weapons.push({ kind: 'weapon', weapon: id, price: weaponPrice(WEAPON_BASE_PRICE[id], game.weaponBought ?? 0), refund: w.spent ?? 0 });
  }

  // 辅助武器：达数量上限下架；价格随**该类型**已购数量递增（各自独立计数）
  const aux = [];
  for (const id of AUX_TYPES) {
    if ((game.aux.counts[id] ?? 0) >= AUX_MAX[id]) continue;
    aux.push({ kind: 'aux', aux: id, price: weaponPrice(AUX_PRICES[id], game.aux.counts[id] ?? 0) });
  }

  // 辅助强化：per-type×4 维；价格/已购按**该维**已购次数（各自独立计价），单维满 STAT_MAX 下架该条目
  const auxEnhance = [];
  for (const id of AUX_TYPES) {
    for (const stat of ENHANCE_STATS) {
      const owned = game.aux.enhance[id][stat] ?? 0;
      if (owned >= STAT_MAX) continue;
      auxEnhance.push({ kind: 'auxEnhance', aux: id, stat, price: enhancePrice(owned), owned, owned0: (game.aux.counts[id] ?? 0) === 0 });
    }
  }

  // 道具：5 种（价格随**该道具**已购次数递增） + 道具强化（固定火炮四维 / 围墙耐久单维，各自独立计价）
  const items = [];
  for (const id of ITEM_IDS) {
    const base = ITEM_PRICES[id] ?? DEPLOY_PRICES[id];
    items.push({ kind: 'item', item: id, price: itemPrice(base, game.itemBought?.[id] ?? 0) });
  }
  for (const stat of TURRET_STATS) {
    const owned = game.turretEnhance[stat] ?? 0;
    if (owned >= STAT_MAX) continue;
    items.push({ kind: 'deployEnhance', target: 'turret', stat, price: enhancePrice(owned), owned });
  }
  const wallOwned = game.wallEnhance.hp ?? 0;
  if (wallOwned < STAT_MAX) {
    items.push({ kind: 'deployEnhance', target: 'wall', stat: 'hp', price: enhancePrice(wallOwned), owned: wallOwned });
  }

  // 风险：bonus 为 0 时仍列出（"无奖励"标注由 UI 负责）
  return [
    { group: '武器强化', entries: weaponEnhance },
    { group: '更换武器', entries: weapons },
    { group: '辅助武器', entries: aux },
    { group: '辅助强化', entries: auxEnhance },
    { group: '道具', entries: items },
    { group: '风险', entries: [{ kind: 'earlyTier', bonus: earlyTierBonus(tierRemainingSec) }] },
  ];
}

// 购买：余额不足 / 对应条目已达上限 / earlyTier（不经 buy）返回 false；成功扣款并生效
export function buy(game, entry) {
  if (entry.kind === 'earlyTier') return false;
  if (game.coins < entry.price) return false;

  if (entry.kind === 'enhance') {
    if (game.weapon.enhance[entry.stat] >= STAT_MAX) return false;
    game.coins -= entry.price;
    applyEnhancement(game.weapon, entry.stat);
    game.weapon.spent = (game.weapon.spent || 0) + entry.price; // 累计强化花费，换枪时返还
    return true;
  }
  if (entry.kind === 'weapon') {
    game.coins -= entry.price;
    game.coins += (game.weapon.spent || 0); // 返还旧武器强化花费（武器购买价不返还）
    game.weapon = createWeapon(entry.weapon); // 新武器 spent 天然 0
    game.weaponBought = (game.weaponBought ?? 0) + 1; // 全局换枪计数（用户裁定）
    return true;
  }
  if (entry.kind === 'aux') {
    if ((game.aux.counts[entry.aux] ?? 0) >= AUX_MAX[entry.aux]) return false;
    game.coins -= entry.price;
    game.aux.counts[entry.aux] += 1;
    return true;
  }
  if (entry.kind === 'auxEnhance') {
    if ((game.aux.counts[entry.aux] ?? 0) === 0) return false; // 未拥有该辅助：拒购不扣款
    if (game.aux.enhance[entry.aux][entry.stat] >= STAT_MAX) return false;
    game.coins -= entry.price;
    game.aux.enhance[entry.aux][entry.stat] += 1;
    return true;
  }
  if (entry.kind === 'deployEnhance') {
    if (entry.target === 'turret') {
      if (game.turretEnhance[entry.stat] >= STAT_MAX) return false;
      game.coins -= entry.price;
      game.turretEnhance[entry.stat] += 1;
    } else {
      if (game.wallEnhance.hp >= STAT_MAX) return false;
      game.coins -= entry.price;
      game.wallEnhance.hp += 1;
    }
    return true;
  }
  if (entry.kind === 'item') {
    game.coins -= entry.price;
    game.itemBought ??= {};
    game.itemBought[entry.item] = (game.itemBought[entry.item] ?? 0) + 1;
    addItem(game.inventory, entry.item, 1);
    return true;
  }
  return false;
}
