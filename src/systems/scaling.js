// src/systems/scaling.js —— 统一数值管线（设计 §2）。纯函数，无 DOM 依赖，全模式共用。
// 怪物：最终值 = 图鉴基础 × 关卡倍率 × (1 + 局内分钟 × 增长率)；coin 沿用档位递增（不吃关卡倍率）。
// 武器：最终伤害 = 图鉴基础 × (1 + 0.2×局外等级) × (1 + 0.25×局内购买次数)。
// special 条目（Boss）仅豁免 hp/speed/damage 缩放，coin 仍按生成时刻档位递增（设计 §2.1 口径、§4.1 Boss 例外）。

export const MODE_SCALING = {
  endless:   { hpRatePerMin: 0.45, dmgRatePerMin: 0.225, speedRatePerMin: 0.02 },
  holdout10: { hpRatePerMin: 0.45, dmgRatePerMin: 0.225, speedRatePerMin: 0.02 },
  holdout20: { hpRatePerMin: 0.45, dmgRatePerMin: 0.225, speedRatePerMin: 0.02 },
  adventure: { hpRatePerMin: 0.35, dmgRatePerMin: 0.175, speedRatePerMin: 0.015 },
};

export function getModeScaling(mode) {
  return MODE_SCALING[mode] || MODE_SCALING.endless;
}

// 关卡倍率（局外）：hp/damage 与 speed 两条曲线；无尽/坚守恒 level 1
export function monsterLevelMult(level) {
  const l = Math.max(1, level);
  return { hpDmg: 1 + 0.6 * (l - 1), speed: 1 + 0.05 * (l - 1) };
}

// base = 图鉴条目。opts: { level = 冒险关卡序号, tier = 当前档位(coin 用), timeSec, mode }
// 返回 { hp, speed, damage, coin, aoeDamage }；hp/speed/damage 浮点，coin 已 Math.round
export function calcMonsterStats(base, { level = 1, tier = 1, timeSec = 0, mode = 'endless' } = {}) {
  if (base.special) {
    // Boss 仅豁免 hp/speed/damage 缩放；coin 仍按生成时刻档位递增（设计 §2.1 口径，用户裁定）
    return { hp: base.hp, speed: base.speed, damage: base.damage,
      coin: Math.round(base.coin * Math.min(4, 1 + 0.25 * (Math.max(1, tier) - 1))),
      aoeDamage: base.aoe ? base.aoe.damage : 0 };
  }
  const mult = monsterLevelMult(level);
  const rates = getModeScaling(mode);
  const minutes = timeSec / 60;
  return {
    hp: base.hp * mult.hpDmg * (1 + minutes * rates.hpRatePerMin),
    damage: base.damage * mult.hpDmg * (1 + minutes * rates.dmgRatePerMin),
    speed: base.speed * mult.speed * (1 + minutes * rates.speedRatePerMin),
    coin: Math.round(base.coin * Math.min(4, 1 + 0.25 * (Math.max(1, tier) - 1))),
    aoeDamage: base.aoe
      ? base.aoe.damage * mult.hpDmg * (1 + minutes * rates.dmgRatePerMin)
      : 0,
  };
}

// 武器伤害双乘区（线性，取代旧复利 1.25^n——2026-08-20 用户裁定）
export function weaponDamage(baseDamage, outLevel = 0, inRunCount = 0) {
  return baseDamage * (1 + 0.2 * outLevel) * (1 + 0.25 * inRunCount);
}
