// test/scaling.test.js —— 统一数值管线（设计 §2）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODE_SCALING, getModeScaling, monsterLevelMult, calcMonsterStats, weaponDamage,
} from '../src/systems/scaling.js';

const normal = { hp: 30, speed: 70, damage: 8, coin: 1, special: false };
const exploder = { hp: 40, speed: 90, damage: 5, coin: 3, aoe: { damage: 30, radius: 80 } };
const boss = { hp: 7040, speed: 20, damage: 40, coin: 50, special: true };

test('各模式增长率（设计 §2.1 表）', () => {
  assert.deepEqual(getModeScaling('endless'), { hpRatePerMin: 0.45, dmgRatePerMin: 0.225, speedRatePerMin: 0.02 });
  assert.deepEqual(getModeScaling('holdout10'), MODE_SCALING.endless);
  assert.deepEqual(getModeScaling('holdout20'), MODE_SCALING.endless);
  assert.deepEqual(getModeScaling('adventure'), { hpRatePerMin: 0.35, dmgRatePerMin: 0.175, speedRatePerMin: 0.015 });
  assert.deepEqual(getModeScaling('bogus'), MODE_SCALING.endless); // 未知模式回退无尽
});

test('关卡倍率：关 1 ×1.0、关 2 ×1.6、关 3 ×2.2；speed 单独小率', () => {
  assert.deepEqual(monsterLevelMult(1), { hpDmg: 1, speed: 1 });
  assert.deepEqual(monsterLevelMult(2), { hpDmg: 1.6, speed: 1.05 });
  assert.deepEqual(monsterLevelMult(3), { hpDmg: 2.2, speed: 1.1 });
  assert.deepEqual(monsterLevelMult(0), monsterLevelMult(1)); // 关卡下限 1
});

test('无尽 21 分钟 hp ≈ ×10.45（旧表第 8 档锚点）；damage 率 = hp 率一半', () => {
  const s = calcMonsterStats(normal, { level: 1, tier: 8, timeSec: 1260, mode: 'endless' });
  assert.ok(Math.abs(s.hp - 30 * 10.45) < 1e-9);
  assert.ok(Math.abs(s.damage - 8 * (1 + 0.225 * 21)) < 1e-9);
  assert.ok(Math.abs(s.speed - 70 * (1 + 0.02 * 21)) < 1e-9);
});

test('冒险通关时刻（360s）hp ×3.1；关卡倍率与局内增长相乘', () => {
  const s = calcMonsterStats(normal, { level: 1, tier: 4, timeSec: 360, mode: 'adventure' });
  assert.ok(Math.abs(s.hp - 30 * 3.1) < 1e-9);
  // 关 3 同刻：×2.2 × 3.1
  const s3 = calcMonsterStats(normal, { level: 3, tier: 4, timeSec: 360, mode: 'adventure' });
  assert.ok(Math.abs(s3.hp - 30 * 2.2 * 3.1) < 1e-9);
});

test('coin 档位递增：基值 × min(4, 1+0.25×(档-1))，Math.round 取整，不吃关卡倍率', () => {
  assert.equal(calcMonsterStats(normal, { tier: 1 }).coin, 1);
  assert.equal(calcMonsterStats(normal, { tier: 5 }).coin, 2);   // ×2
  assert.equal(calcMonsterStats(normal, { tier: 13 }).coin, 4);  // 封顶 ×4
  assert.equal(calcMonsterStats(normal, { tier: 99 }).coin, 4);
  assert.equal(calcMonsterStats(normal, { level: 3, tier: 5 }).coin, 2); // 关卡倍率不影响 coin
});

test('AoE 基伤走 damage 同乘区；无 aoe 字段的怪 aoeDamage=0', () => {
  const s = calcMonsterStats(exploder, { level: 2, tier: 4, timeSec: 60, mode: 'adventure' });
  assert.ok(Math.abs(s.aoeDamage - 30 * 1.6 * (1 + 0.175 * 1)) < 1e-9);
  assert.equal(calcMonsterStats(normal, {}).aoeDamage, 0);
});

test('Boss（special）仅豁免 hp/speed/damage 缩放，coin 仍按档位递增（设计 §2.1 口径）', () => {
  const s = calcMonsterStats(boss, { level: 3, tier: 8, timeSec: 9999, mode: 'adventure' });
  assert.equal(s.hp, 7040);   // hp 不缩放
  assert.equal(s.speed, 20);  // speed 不缩放
  assert.equal(s.damage, 40); // damage 不缩放
  assert.equal(s.aoeDamage, 0);
  // coin 随生成时刻档位递增：T5=50×2=100、T13=50×4=200
  assert.equal(calcMonsterStats(boss, { tier: 5 }).coin, 100);
  assert.equal(calcMonsterStats(boss, { tier: 13 }).coin, 200);
});

test('武器伤害双乘区（设计 §2.2）：线性 1+0.2×局外等级、1+0.25×局内次数', () => {
  assert.equal(weaponDamage(12, 0, 0), 12);
  assert.equal(weaponDamage(12, 10, 0), 36);      // 局外满级 ×3
  assert.equal(weaponDamage(12, 0, 8), 36);       // 局内满维 ×3（取代旧复利 1.25^8≈5.96）
  assert.equal(weaponDamage(12, 10, 8), 108);     // 双乘区叠乘
});
