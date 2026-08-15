// src/config/difficulty.js
export const TIER_DURATION = 180;
export const STAT_CAP_TIER = 8;
export const GRACE_PERIOD = 30;
export const MAX_ZOMBIES = 300;

export const DIFFICULTY_TIERS = [
  { tier: 1, budgetPerSec: 2,   weights: { normal: 1 },                          hpMult: 1,   speedMult: 1,    unlocks: ['normal'] },
  { tier: 2, budgetPerSec: 3,   weights: { normal: 0.7, fast: 0.3 },             hpMult: 1.5, speedMult: 1,    unlocks: ['fast'] },
  { tier: 3, budgetPerSec: 4.5, weights: { normal: 0.6, fast: 0.4 },             hpMult: 2.2, speedMult: 1.05, unlocks: [] },
  { tier: 4, budgetPerSec: 6,   weights: { normal: 0.5, fast: 0.3, tank: 0.2 },  hpMult: 3.2, speedMult: 1.05, unlocks: ['tank'] },
  { tier: 5, budgetPerSec: 8,   weights: { normal: 0.4, fast: 0.35, tank: 0.25 }, hpMult: 4.5, speedMult: 1.10, unlocks: [] },
  { tier: 6, budgetPerSec: 10,  weights: { normal: 0.4, fast: 0.35, tank: 0.25 }, hpMult: 6,   speedMult: 1.10, unlocks: [] },
  { tier: 7, budgetPerSec: 12,  weights: { normal: 0.35, fast: 0.35, tank: 0.3 }, hpMult: 8,   speedMult: 1.10, unlocks: [] },
  { tier: 8, budgetPerSec: 14,  weights: { normal: 0.35, fast: 0.35, tank: 0.3 }, hpMult: 10,  speedMult: 1.15, unlocks: [] },
];

export function getTier(timeSec) {
  return Math.floor(timeSec / TIER_DURATION) + 1;
}

export function getTierConfig(timeSec) {
  const t = getTier(timeSec);
  if (t <= DIFFICULTY_TIERS.length) return DIFFICULTY_TIERS[t - 1];
  const cap = DIFFICULTY_TIERS[STAT_CAP_TIER - 1];
  return { ...cap, tier: t, budgetPerSec: cap.budgetPerSec + 3 * (t - STAT_CAP_TIER) };
}
