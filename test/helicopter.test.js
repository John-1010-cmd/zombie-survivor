// test/helicopter.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHelicopter, updateHelicopter } from '../src/entities/helicopter.js';

test('createHelicopter 初始字段完整', () => {
  const h = createHelicopter(100, 200);
  assert.equal(h.x, 100);
  assert.equal(h.y, 200);
  assert.equal(h.r, 60);
  assert.equal(h.state, 'landing');
  assert.equal(h.t, 0);
});

test('landing 累计 3 秒后转为 waiting 且计时清零', () => {
  const h = createHelicopter(0, 0);
  const player = { x: 0, y: 0, r: 16 };
  assert.equal(updateHelicopter(h, player, 1), 'none');
  assert.equal(h.state, 'landing');
  assert.equal(h.t, 1);
  assert.equal(updateHelicopter(h, player, 2), 'none');
  assert.equal(h.state, 'waiting');
  assert.equal(h.t, 0);
});

test('waiting 中玩家圆心距 < 60 进入 boarding', () => {
  const h = createHelicopter(0, 0);
  h.state = 'waiting';
  const player = { x: 59, y: 0, r: 16 }; // 距离 59 < 60
  assert.equal(updateHelicopter(h, player, 1), 'none');
  assert.equal(h.state, 'boarding');
});

test('waiting 中玩家圆心距恰 60 不登机（严格小于）', () => {
  const h = createHelicopter(0, 0);
  h.state = 'waiting';
  const player = { x: 60, y: 0, r: 16 };
  assert.equal(updateHelicopter(h, player, 1), 'none');
  assert.equal(h.state, 'waiting');
  assert.equal(h.t, 0);
});

test('boarding 累计 3 秒满 → victory 且 state=done', () => {
  const h = createHelicopter(0, 0);
  h.state = 'boarding';
  const player = { x: 0, y: 0, r: 16 };
  assert.equal(updateHelicopter(h, player, 2.5), 'none');
  assert.equal(h.state, 'boarding');
  assert.equal(h.t, 2.5);
  assert.equal(updateHelicopter(h, player, 0.5), 'victory');
  assert.equal(h.state, 'done');
});

test('boarding 中途玩家离开 → 重置回 waiting 且计时清零', () => {
  const h = createHelicopter(0, 0);
  h.state = 'boarding';
  h.t = 2; // 已登机 2 秒
  const player = { x: 61, y: 0, r: 16 };
  assert.equal(updateHelicopter(h, player, 0.1), 'none');
  assert.equal(h.state, 'waiting');
  assert.equal(h.t, 0);
});

test('done 状态保持，不再返回 victory', () => {
  const h = createHelicopter(0, 0);
  h.state = 'done';
  assert.equal(updateHelicopter(h, { x: 0, y: 0, r: 16 }, 1), 'none');
  assert.equal(h.state, 'done');
});
