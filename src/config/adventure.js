// src/config/adventure.js —— 冒险关卡表（设计 §3.2）。纯逻辑，无 DOM 依赖。
// 每关 4 档 × 90s = 360s，纯时间推进撑满即通关；档位结构不含 unlocks（死字段已退役，
// 怪物出现门控 = weights，设计 §2.1）。
import { round5 } from './economy.js';

export const ADVENTURE_TIER_DURATION = 90;
export const ADVENTURE_DURATION = 360; // 4 档 × 90s

export const ADVENTURE_LEVELS = [
  {
    id: 'l1', name: '城郊', goldReward: 100,
    tiers: [
      { duration: 90, budgetPerSec: 3, weights: { normal: 1 } },
      { duration: 90, budgetPerSec: 4.5, weights: { normal: 0.7, fast: 0.3 } },
      { duration: 90, budgetPerSec: 7, weights: { normal: 0.6, fast: 0.4 } },
      { duration: 90, budgetPerSec: 9, weights: { normal: 0.5, fast: 0.3, tank: 0.2 } },
    ],
  },
  {
    id: 'l2', name: '市区', goldReward: 160,
    tiers: [
      { duration: 90, budgetPerSec: 4, weights: { normal: 0.8, fast: 0.2 } },
      { duration: 90, budgetPerSec: 6, weights: { normal: 0.6, fast: 0.4 } },
      { duration: 90, budgetPerSec: 8.5, weights: { normal: 0.5, fast: 0.3, tank: 0.2 } },
      { duration: 90, budgetPerSec: 11, weights: { normal: 0.4, fast: 0.35, tank: 0.25 } },
    ],
  },
  {
    id: 'l3', name: '巢穴', goldReward: 240,
    tiers: [
      { duration: 90, budgetPerSec: 5, weights: { normal: 0.7, fast: 0.3 } },
      { duration: 90, budgetPerSec: 7.5, weights: { normal: 0.5, fast: 0.35, tank: 0.15 } },
      { duration: 90, budgetPerSec: 10, weights: { normal: 0.4, fast: 0.35, tank: 0.25 } },
      { duration: 90, budgetPerSec: 13, weights: { normal: 0.3, fast: 0.3, tank: 0.25, exploder: 0.15 } },
    ],
  },
];

export function adventureLevelById(id) {
  return ADVENTURE_LEVELS.find(l => l.id === id) || null;
}

// 1 起序号（关卡倍率/解锁进度用，设计 §2.1/§3.1）
export function adventureLevelIndex(id) {
  const i = ADVENTURE_LEVELS.findIndex(l => l.id === id);
  return i < 0 ? 1 : i + 1;
}

// 冒险刷怪配置（spawner 的 cfgFn）：tier 1–4 按 90s 分段，封顶第 4 档
export function makeAdventureCfg(level) {
  return timeSec => {
    const t = Math.min(level.tiers.length, Math.floor(timeSec / ADVENTURE_TIER_DURATION) + 1);
    return { tier: t, ...level.tiers[t - 1] };
  };
}

// 通关金币：首通 ×2（设计 §3.4）
export function clearGoldReward(level, isFirstClear) {
  return level.goldReward * (isFirstClear ? 2 : 1);
}

// 失败保底（死亡与主动退出都算）：round5(goldReward × 存活比例 × 50%)
export function failGoldReward(level, survivedSec) {
  return round5(level.goldReward * (survivedSec / ADVENTURE_DURATION) * 0.5);
}
