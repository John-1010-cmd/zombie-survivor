// test/adventure.test.js —— 冒险关卡表与金币奖励（设计 §3.2/§3.4）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVENTURE_LEVELS, ADVENTURE_TIER_DURATION, ADVENTURE_DURATION,
  adventureLevelById, adventureLevelIndex, makeAdventureCfg,
  clearGoldReward, failGoldReward,
} from '../src/config/adventure.js';
import { MONSTERS } from '../src/config/bestiary/monsters.js';

test('三关结构：每关 4 档 × 90s，weights 引用合法怪物 id', () => {
  assert.equal(ADVENTURE_LEVELS.length, 3);
  assert.equal(ADVENTURE_TIER_DURATION, 90);
  assert.equal(ADVENTURE_DURATION, 360);
  for (const lv of ADVENTURE_LEVELS) {
    assert.equal(lv.tiers.length, 4, lv.id);
    for (const t of lv.tiers) {
      assert.equal(t.duration, 90);
      assert.ok(t.budgetPerSec > 0);
      for (const id of Object.keys(t.weights)) assert.ok(MONSTERS[id], `${lv.id} 引用未知怪物 ${id}`);
    }
  }
  // 自爆仅出现在关 3 档 4（设计 §4.3）
  assert.ok(ADVENTURE_LEVELS[2].tiers[3].weights.exploder > 0);
  for (const lv of ADVENTURE_LEVELS.slice(0, 2))
    for (const t of lv.tiers) assert.ok(!('exploder' in t.weights));
});

test('关卡查找与 1 起序号', () => {
  assert.equal(adventureLevelById('l1').name, '城郊');
  assert.equal(adventureLevelById('bogus'), null);
  assert.equal(adventureLevelIndex('l1'), 1);
  assert.equal(adventureLevelIndex('l3'), 3);
});

test('makeAdventureCfg：90s 分段、封顶第 4 档', () => {
  const cfg = makeAdventureCfg(ADVENTURE_LEVELS[0]);
  assert.equal(cfg(0).tier, 1);
  assert.equal(cfg(89.9).tier, 1);
  assert.equal(cfg(90).tier, 2);
  assert.equal(cfg(270).tier, 4);
  assert.equal(cfg(359.9).tier, 4);
  assert.equal(cfg(0).budgetPerSec, 3);
  assert.equal(cfg(90).weights.fast, 0.3);
});

test('通关金币：首通 ×2，非首通原价', () => {
  const l1 = ADVENTURE_LEVELS[0];
  assert.equal(clearGoldReward(l1, true), 200);
  assert.equal(clearGoldReward(l1, false), 100);
  assert.equal(clearGoldReward(ADVENTURE_LEVELS[2], true), 480);
});

test('失败保底：round5(goldReward × 存活/360 × 50%)', () => {
  const l1 = ADVENTURE_LEVELS[0];
  assert.equal(failGoldReward(l1, 0), 0);
  assert.equal(failGoldReward(l1, 180), 25);  // 100×0.5×0.5
  assert.equal(failGoldReward(l1, 359), 50);  // 49.86 → 50
  assert.equal(failGoldReward(l1, 36), 5);    // 5
  for (const lv of ADVENTURE_LEVELS)
    for (const s of [0, 37, 90, 200, 359]) assert.equal(failGoldReward(lv, s) % 5, 0);
});
