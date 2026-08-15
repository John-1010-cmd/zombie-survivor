// src/config/economy.js —— 银币经济数值：增强价格曲线、换武器价格、道具价格、提前难度奖励。纯逻辑，无 DOM 依赖。
import { WEAPON_BASE_PRICE } from './weapons.js';
export { WEAPON_BASE_PRICE }; // 转导出：商店价格入口统一走 economy.js

export const ENHANCE_BASE = 40;
export const ENHANCE_GROWTH = 1.5;
export const WEAPON_SWAP_PRICE = 80;
export const ITEM_PRICES = { medkit: 30, magnet: 25, bomb: 50 };
// 部署物价格（商店"道具"组 item 条目消费一致：ITEM_PRICES[id] ?? DEPLOY_PRICES[id]）
export const DEPLOY_PRICES = { turret: 120, wall: 100 };
// 辅助武器价格与数量上限（plan §4）
export const AUX_PRICES = { drone: 60, gunner: 90, sniper: 120 };
export const AUX_MAX = { drone: 3, gunner: 3, sniper: 2 };
export const EARLY_BONUS_PER_30S = 25;

// 四舍五入到 5 的倍数
function round5(x) {
  return Math.round(x / 5) * 5;
}

// 增强价格：40 × 1.5^已购增强总次数，取整到 5 的倍数
export function enhancePrice(ownedCount) {
  return round5(ENHANCE_BASE * Math.pow(ENHANCE_GROWTH, ownedCount));
}

// 换枪价格：round5(base × 1.4^全局已换枪次数)；第 1 把 = 基价（用户裁定：全局计数）
export function weaponPrice(base, boughtCount) {
  return round5(base * Math.pow(1.4, boughtCount));
}

// 道具价格：round5(base × 1.25^该道具已购次数)；消耗品温和递增，按道具 id 各自独立
export const ITEM_GROWTH = 1.25;
export function itemPrice(base, boughtCount) {
  return round5(base * Math.pow(ITEM_GROWTH, boughtCount));
}

// 提前难度奖励：每满 30 秒剩余时间奖励 25 银币
export function earlyTierBonus(remainingSec) {
  return Math.floor(remainingSec / 30) * EARLY_BONUS_PER_30S;
}
