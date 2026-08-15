// test/coin.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCoin, updateCoin } from '../src/entities/coin.js';

const PLAYER = { x: 0, y: 0, r: 16, pickupRadius: 80 };

test('createCoin 初始字段完整', () => {
  const c = createCoin(100, 200, 3);
  assert.equal(c.x, 100);
  assert.equal(c.y, 200);
  assert.equal(c.r, 8);
  assert.equal(c.value, 3);
  assert.equal(c.alive, true);
});

test('普通模式：拾取半径外静止不动', () => {
  const c = createCoin(100, 0, 1); // 距离 100 > 80
  assert.equal(updateCoin(c, PLAYER, 0.5), false);
  assert.equal(c.x, 100);
  assert.equal(c.alive, true);
});

test('普通模式：磁吸范围内以 400px/s 靠近，未接触不拾取', () => {
  const c = createCoin(50, 0, 1); // 距离 50 < 80；0.1s 移动 40 → 剩 10
  assert.equal(updateCoin(c, PLAYER, 0.1), false);
  assert.ok(Math.abs(c.x - 10) < 1e-9);
  assert.equal(c.alive, true);
});

test('普通模式：进入接触距离即拾取：alive=false 且返回 true', () => {
  const c = createCoin(30, 0, 1); // 30 < 16 + 8 + 10 = 34
  assert.equal(updateCoin(c, PLAYER, 0.1), true);
  assert.equal(c.alive, false);
});

test('普通模式：本步移动会越过玩家时直接拾取', () => {
  const c = createCoin(50, 0, 1); // step = 400 × 0.5 = 200 ≥ 50
  assert.equal(updateCoin(c, PLAYER, 0.5), true);
  assert.equal(c.alive, false);
});

test('磁铁模式：无视拾取半径，远处以 1500px/s 直飞玩家', () => {
  const c = createCoin(300, 0, 1); // 距离 300 >> 80
  assert.equal(updateCoin(c, PLAYER, 0.1, true), false); // 飞 150 → 剩 150
  assert.ok(Math.abs(c.x - 150) < 1e-9);
  assert.equal(c.alive, true);
});

test('磁铁模式：飞抵玩家即拾取', () => {
  const c = createCoin(300, 0, 1); // step = 1500 × 0.2 = 300 恰好到达
  assert.equal(updateCoin(c, PLAYER, 0.2, true), true);
  assert.equal(c.alive, false);
});
