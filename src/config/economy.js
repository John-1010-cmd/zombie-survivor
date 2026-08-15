// src/config/economy.js —— 银币经济数值：增强价格曲线、换武器价格、道具价格、提前难度奖励。纯逻辑，无 DOM 依赖。
export const ENHANCE_BASE = 40;
export const ENHANCE_GROWTH = 1.5;
export const WEAPON_SWAP_PRICE = 80;
export const ITEM_PRICES = { medkit: 30, magnet: 25, bomb: 50 };
export const EARLY_BONUS_PER_30S = 25;

// 四舍五入到 5 的倍数
function round5(x) {
  return Math.round(x / 5) * 5;
}

// 增强价格：40 × 1.5^已购增强总次数，取整到 5 的倍数
export function enhancePrice(ownedCount) {
  return round5(ENHANCE_BASE * Math.pow(ENHANCE_GROWTH, ownedCount));
}

// 提前难度奖励：每满 30 秒剩余时间奖励 25 银币
export function earlyTierBonus(remainingSec) {
  return Math.floor(remainingSec / 30) * EARLY_BONUS_PER_30S;
}
