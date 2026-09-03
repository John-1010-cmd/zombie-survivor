// test/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_MAX_LEVEL, ENHANCE_STATS, STAT_LABEL } from '../src/config/bestiary/weapons.js';
import { ASSETS, ASSET_BY_ID } from '../src/config/assets.js';
import {
  DIFFICULTY_TIERS, getTier, getTierConfig, TIER_DURATION, STAT_CAP_TIER,
  GRACE_PERIOD, MAX_ZOMBIES, SURGE_CAP, tierStartTime,
  HOLDOUT10_TIERS, getHoldout10Tier, getHoldout10Config, MODES,
} from '../src/config/difficulty.js';

test('增强维度常量一致', () => {
  assert.equal(WEAPON_MAX_LEVEL, 8);
  assert.deepEqual([...ENHANCE_STATS].sort(), ['damage','fireRate','projectiles','range'].sort());
  for (const s of ENHANCE_STATS) assert.ok(STAT_LABEL[s]);
});

test('难度常量与档位边界', () => {
  assert.equal(TIER_DURATION, 180);
  assert.equal(STAT_CAP_TIER, 8);
  assert.equal(GRACE_PERIOD, 30);
  assert.equal(MAX_ZOMBIES, 400);
  assert.equal(SURGE_CAP, 48);
  assert.equal(getTier(0), 1);
  assert.equal(getTier(TIER_DURATION - 1), 1);
  assert.equal(getTier(TIER_DURATION), 2);
  assert.equal(getTier(TIER_DURATION * 8), 9);
});

test('预算表 ×1.5：档 1–8 依次 3/4.5/7/9/12/15/18/21；hpMult/speedMult/unlocks 已退役', () => {
  assert.deepEqual(DIFFICULTY_TIERS.map(t => t.budgetPerSec), [3, 4.5, 7, 9, 12, 15, 18, 21]);
  assert.deepEqual(DIFFICULTY_TIERS[0].weights, { normal: 1 });
  assert.deepEqual(DIFFICULTY_TIERS[3].weights, { normal: 0.5, fast: 0.3, tank: 0.2 });
  for (const t of DIFFICULTY_TIERS) {
    assert.ok(!('hpMult' in t), 'hpMult 已退役');
    assert.ok(!('speedMult' in t), 'speedMult 已退役');
    assert.ok(!('unlocks' in t), 'unlocks 已退役（死字段）');
  }
  // 无尽档 5 起引入自爆（设计 §4.3）
  assert.deepEqual(DIFFICULTY_TIERS[4].weights, { normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 });
  assert.deepEqual(DIFFICULTY_TIERS[6].weights, { normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 });
  assert.deepEqual(DIFFICULTY_TIERS[7].weights, { normal: 0.3, fast: 0.3, tank: 0.25, exploder: 0.15 });
});

test('档 9+：预算 = 档 8 + 4.5×(t-8)', () => {
  const cap = getTierConfig(TIER_DURATION * (STAT_CAP_TIER - 1)); // 档 8
  const t9 = getTierConfig(TIER_DURATION * 8);   // 档 9 起点
  const t10 = getTierConfig(TIER_DURATION * 9);
  const t12 = getTierConfig(TIER_DURATION * 11);
  assert.equal(t9.budgetPerSec, cap.budgetPerSec + 4.5);
  assert.equal(t10.budgetPerSec, cap.budgetPerSec + 9);
  assert.equal(t12.budgetPerSec, cap.budgetPerSec + 18);
});

test('预算随档单调不减', () => {
  for (let i = 1; i < 12; i++)
    assert.ok(getTierConfig(i * TIER_DURATION).budgetPerSec >= getTierConfig((i - 1) * TIER_DURATION).budgetPerSec);
});

test('tierStartTime：档 n 起点 = (n-1)×180', () => {
  assert.equal(tierStartTime(1), 0);
  assert.equal(tierStartTime(2), TIER_DURATION);
  assert.equal(tierStartTime(8), 1260);
  assert.equal(tierStartTime(9), 1440);
});

test('HOLDOUT10_TIERS：6 段、每段 100s，第 n 段取值同无尽档 n', () => {
  assert.equal(HOLDOUT10_TIERS.length, 6);
  assert.equal(getHoldout10Tier(0), 1);
  assert.equal(getHoldout10Tier(99), 1);
  assert.equal(getHoldout10Tier(100), 2);
  assert.equal(getHoldout10Tier(599), 6);
  for (let n = 1; n <= 6; n++) {
    const h = HOLDOUT10_TIERS[n - 1];
    const e = DIFFICULTY_TIERS[n - 1];
    assert.deepEqual(h.weights, e.weights, `段 ${n} weights`);
    assert.equal(h.budgetPerSec, e.budgetPerSec, `段 ${n} budgetPerSec`);
    const cfg = getHoldout10Config((n - 1) * 100);
    assert.equal(cfg.budgetPerSec, e.budgetPerSec, `段 ${n} config budgetPerSec`);
  }
});

test('HOLDOUT10 越界段：数值沿用第 6 段，仅预算 +4.5/段（与无尽 9+ 同构）', () => {
  const seg6 = HOLDOUT10_TIERS[5];
  const cfg = getHoldout10Config(600); // 段 7（越表，仅登机窗口可能出现）
  assert.deepEqual(cfg.weights, seg6.weights);
  assert.equal(cfg.budgetPerSec, seg6.budgetPerSec + 4.5);
});

test('MODES 字段：endless 无尽表、holdout10 压缩段表、holdout20 无尽表', () => {
  assert.equal(MODES.endless.getCfg, getTierConfig);
  assert.equal(MODES.holdout10.duration, 600);
  assert.equal(MODES.holdout10.getCfg, getHoldout10Config);
  assert.equal(MODES.holdout10.surgeFrom, 540);
  assert.equal(MODES.holdout10.bossAt, 540);
  assert.equal(MODES.holdout20.duration, 1200);
  assert.equal(MODES.holdout20.getCfg, getTierConfig);
  assert.equal(MODES.holdout20.surgeFrom, 1140);
  assert.equal(MODES.holdout20.bossAt, 1140);
});

test('图标 manifest：21 个稳定 ID、路径、128 尺寸与 prompt 版本完整', () => {
  const expected = [
    ['icon.weapon.pistol', 'assets/img/icons/weapons/pistol.png'],
    ['icon.weapon.rifle', 'assets/img/icons/weapons/rifle.png'],
    ['icon.weapon.mg', 'assets/img/icons/weapons/mg.png'],
    ['icon.weapon.rocket', 'assets/img/icons/weapons/rocket.png'],
    ['icon.weapon.grenade', 'assets/img/icons/weapons/grenade.png'],
    ['icon.weapon.tesla', 'assets/img/icons/weapons/tesla.png'],
    ['icon.weapon.sniperRifle', 'assets/img/icons/weapons/sniper-rifle.png'],
    ['icon.item.medkit', 'assets/img/icons/items/medkit.png'],
    ['icon.item.magnet', 'assets/img/icons/items/magnet.png'],
    ['icon.item.bomb', 'assets/img/icons/items/bomb.png'],
    ['icon.item.turret', 'assets/img/icons/items/turret.png'],
    ['icon.item.wall', 'assets/img/icons/items/wall.png'],
    ['icon.aux.drone', 'assets/img/icons/aux/drone.png'],
    ['icon.aux.gunner', 'assets/img/icons/aux/gunner.png'],
    ['icon.aux.sniper', 'assets/img/icons/aux/sniper.png'],
    ['icon.enhance.damage', 'assets/img/icons/enhance/damage.png'],
    ['icon.enhance.fireRate', 'assets/img/icons/enhance/fire-rate.png'],
    ['icon.enhance.projectiles', 'assets/img/icons/enhance/projectiles.png'],
    ['icon.enhance.range', 'assets/img/icons/enhance/range.png'],
    ['icon.currency.silver', 'assets/img/icons/currency/silver.png'],
    ['icon.currency.gold', 'assets/img/icons/currency/gold.png'],
  ];

  const icons = ASSETS.filter(asset => asset.id.startsWith('icon.'));
  assert.equal(icons.length, 21);
  assert.deepEqual(icons.map(a => [a.id, a.path]), expected);
  assert.equal(new Set(icons.map(a => a.id)).size, 21);
  for (const [id, path] of expected) {
    const asset = ASSET_BY_ID[id];
    assert.equal(asset.id, id);
    assert.equal(asset.path, path);
    assert.equal(asset.size, 128);
    assert.ok(['neon-cel-v1', 'placeholder-v0'].includes(asset.promptVersion));
    assert.equal(ASSET_BY_ID[id], asset);
  }
});
