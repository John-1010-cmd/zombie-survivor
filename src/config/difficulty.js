// src/config/difficulty.js
export const TIER_DURATION = 180;
export const STAT_CAP_TIER = 8;
export const GRACE_PERIOD = 30;
export const MAX_ZOMBIES = 400;
export const SURGE_CAP = 48;

// 无尽模式难度阶梯（预算 ×1.5，档 3 取整为 7）
// hpMult/speedMult/unlocks 已退役：数值增长走 systems/scaling.js（设计 §2.1），
// “某档起出现某怪”直接写进该档 weights（unlocks 原为零读取死字段）。
export const DIFFICULTY_TIERS = [
  { tier: 1, budgetPerSec: 3,   weights: { normal: 1 } },
  { tier: 2, budgetPerSec: 4.5, weights: { normal: 0.7, fast: 0.3 } },
  { tier: 3, budgetPerSec: 7,   weights: { normal: 0.6, fast: 0.4 } },
  { tier: 4, budgetPerSec: 9,   weights: { normal: 0.5, fast: 0.3, tank: 0.2 } },
  { tier: 5, budgetPerSec: 12,  weights: { normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 } },
  { tier: 6, budgetPerSec: 15,  weights: { normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 } },
  { tier: 7, budgetPerSec: 18,  weights: { normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 } },
  { tier: 8, budgetPerSec: 21,  weights: { normal: 0.3, fast: 0.3, tank: 0.25, exploder: 0.15 } },
];

export function getTier(timeSec) {
  return Math.floor(timeSec / TIER_DURATION) + 1;
}

export function getTierConfig(timeSec) {
  const t = getTier(timeSec);
  if (t <= DIFFICULTY_TIERS.length) return DIFFICULTY_TIERS[t - 1];
  const cap = DIFFICULTY_TIERS[STAT_CAP_TIER - 1];
  return { ...cap, tier: t, budgetPerSec: cap.budgetPerSec + 4.5 * (t - STAT_CAP_TIER) };
}

// 提前难度：档 n 的起始时刻（时间轴快进目标）
export function tierStartTime(tier) {
  return (tier - 1) * TIER_DURATION;
}

// 坚守 10 分钟：6 段 × 100s，第 n 段取无尽档 n 的数值（weights/budgetPerSec）
const HOLDOUT10_SEGMENT = 100;
export const HOLDOUT10_TIERS = DIFFICULTY_TIERS.slice(0, 6).map((t, i) => ({
  tier: i + 1,
  weights: t.weights,
  budgetPerSec: t.budgetPerSec,
}));

export function getHoldout10Tier(t) {
  return Math.floor(t / HOLDOUT10_SEGMENT) + 1;
}

export function getHoldout10Config(t) {
  const seg = getHoldout10Tier(t);
  if (seg <= HOLDOUT10_TIERS.length) return HOLDOUT10_TIERS[seg - 1];
  const cap = HOLDOUT10_TIERS[HOLDOUT10_TIERS.length - 1];
  return { ...cap, tier: seg, budgetPerSec: cap.budgetPerSec + 4.5 * (seg - HOLDOUT10_TIERS.length) };
}

// 模式定义：endless 用无尽表；holdout10 用 6×100s 压缩段（spec §5.3）；holdout20 用无尽表；
// surgeFrom 起预算 ×1.5；bossAt 为守门 Boss 注入时刻
export const MODES = {
  endless: { getCfg: getTierConfig },
  holdout10: { duration: 600, getCfg: getHoldout10Config, surgeFrom: 540, bossAt: 540 },
  holdout20: { duration: 1200, getCfg: getTierConfig, surgeFrom: 1140, bossAt: 1140 },
};
