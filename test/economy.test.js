// test/economy.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENHANCE_BASE, ENHANCE_GROWTH, WEAPON_SWAP_PRICE,
  ITEM_PRICES, EARLY_BONUS_PER_30S, enhancePrice, earlyTierBonus,
} from '../src/config/economy.js';

test('经济常量正确', () => {
  assert.equal(ENHANCE_BASE, 40);
  assert.equal(ENHANCE_GROWTH, 1.5);
  assert.equal(WEAPON_SWAP_PRICE, 80);
  assert.deepEqual(ITEM_PRICES, { medkit: 30, magnet: 25, bomb: 50 });
  assert.equal(EARLY_BONUS_PER_30S, 25);
});

test('enhancePrice：40×1.5^n 四舍五入到 5 的倍数', () => {
  assert.equal(enhancePrice(0), 40);  // 40
  assert.equal(enhancePrice(1), 60);  // 60
  assert.equal(enhancePrice(2), 90);  // 90
  assert.equal(enhancePrice(3), 135); // 135
  assert.equal(enhancePrice(4), 205); // 202.5 → 205
  assert.equal(enhancePrice(5), 305); // 303.75 → 305
  assert.equal(enhancePrice(6), 455); // 455.625 → 455
  // 所有结果均为 5 的倍数
  for (let i = 0; i <= 10; i++) assert.equal(enhancePrice(i) % 5, 0);
});

test('earlyTierBonus：每满 30 秒 25 银币，向下取整', () => {
  assert.equal(earlyTierBonus(0), 0);
  assert.equal(earlyTierBonus(1), 0);
  assert.equal(earlyTierBonus(29), 0);
  assert.equal(earlyTierBonus(30), 25);
  assert.equal(earlyTierBonus(59), 25);
  assert.equal(earlyTierBonus(60), 50);
  assert.equal(earlyTierBonus(90), 75);
  assert.equal(earlyTierBonus(150), 125);
  assert.equal(earlyTierBonus(179), 125);
  assert.equal(earlyTierBonus(180), 150);
});
