import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGem, updateGem } from '../src/entities/xpGem.js';

const PLAYER = { x: 0, y: 0, r: 16, pickupRadius: 80 };

test('createGem 初始字段完整', () => {
  const g = createGem(100, 200, 3);
  assert.equal(g.x, 100);
  assert.equal(g.y, 200);
  assert.equal(g.r, 8);
  assert.equal(g.value, 3);
  assert.equal(g.alive, true);
});

test('拾取半径外静止不动', () => {
  const g = createGem(100, 0, 1); // 距离 100 > 80
  assert.equal(updateGem(g, PLAYER, 0.5), false);
  assert.equal(g.x, 100);
  assert.equal(g.alive, true);
});

test('磁吸范围内以 400px/s 靠近，未接触不拾取', () => {
  const g = createGem(50, 0, 1); // 距离 50 < 80；0.1s 移动 40 → 剩 10
  assert.equal(updateGem(g, PLAYER, 0.1), false);
  assert.ok(Math.abs(g.x - 10) < 1e-9);
  assert.equal(g.alive, true);
});

test('进入接触距离即拾取：alive=false 且返回 true', () => {
  const g = createGem(30, 0, 1); // 30 < 16 + 8 + 10 = 34
  assert.equal(updateGem(g, PLAYER, 0.1), true);
  assert.equal(g.alive, false);
});

test('本步移动会越过玩家时直接拾取', () => {
  const g = createGem(50, 0, 1); // step = 400 × 0.5 = 200 ≥ 50
  assert.equal(updateGem(g, PLAYER, 0.5), true);
  assert.equal(g.alive, false);
});
