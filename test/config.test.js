// test/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_MAX_LEVEL, ENHANCE_STATS, STAT_LABEL } from '../src/config/weapons.js';
import { ZOMBIES, MAX_ZOMBIE_R } from '../src/config/zombies.js';
import { DIFFICULTY_TIERS, getTier, getTierConfig, TIER_DURATION, STAT_CAP_TIER } from '../src/config/difficulty.js';

test('武器字段完整且为正值，MVP 含 pistol/rifle/mg', () => {
  for (const id of ['pistol', 'rifle', 'mg']) {
    const w = WEAPONS[id];
    assert.ok(w, `缺武器 ${id}`);
    for (const f of ['damage','fireRate','projectileSpeed','range','projectiles','knockback'])
      assert.ok(w[f] > 0, `${id}.${f} 应为正数`);
    assert.ok(w.burst >= 1 && w.burstInterval >= 0);
    assert.equal(w.id, id);
  }
});

test('增强维度常量一致', () => {
  assert.equal(WEAPON_MAX_LEVEL, 8);
  assert.deepEqual([...ENHANCE_STATS].sort(), ['damage','fireRate','projectiles','range'].sort());
  for (const s of ENHANCE_STATS) assert.ok(STAT_LABEL[s]);
});

test('僵尸字段完整，权重引用的类型都存在', () => {
  for (const z of Object.values(ZOMBIES)) {
    for (const f of ['hp','speed','damage','xp','radius','cost']) assert.ok(z[f] > 0);
    assert.ok(z.knockbackResist >= 0 && z.knockbackResist < 1);
  }
  for (const t of DIFFICULTY_TIERS)
    for (const id of Object.keys(t.weights)) assert.ok(ZOMBIES[id], `档 ${t.tier} 引用未知僵尸 ${id}`);
  assert.ok(MAX_ZOMBIE_R >= 24); // 不小于坦克半径
});

test('档位边界与数值封顶规则（spec 用户修正 1）', () => {
  assert.equal(getTier(0), 1);
  assert.equal(getTier(TIER_DURATION - 1), 1);
  assert.equal(getTier(TIER_DURATION), 2);
  assert.equal(getTier(TIER_DURATION * 8), 9);
  const cap = getTierConfig(TIER_DURATION * (STAT_CAP_TIER - 1)); // 档 8
  const t9 = getTierConfig(TIER_DURATION * 8);
  const t10 = getTierConfig(TIER_DURATION * 9);
  assert.equal(t9.hpMult, cap.hpMult);      // 数值不再增长
  assert.equal(t9.speedMult, cap.speedMult);
  assert.equal(t9.budgetPerSec, cap.budgetPerSec + 3); // 仅预算递增
  assert.equal(t10.budgetPerSec, cap.budgetPerSec + 6);
});

test('预算随档单调不减', () => {
  for (let i = 1; i < 12; i++)
    assert.ok(getTierConfig(i * TIER_DURATION).budgetPerSec >= getTierConfig((i - 1) * TIER_DURATION).budgetPerSec);
});
