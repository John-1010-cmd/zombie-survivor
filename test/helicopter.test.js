// test/helicopter.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHelicopter, updateHelicopter, renderHelicopter,
  HELICOPTER_VISUAL_ID,
} from '../src/entities/helicopter.js';

function fakeCtx() {
  return {
    arcCount: 0,
    strokeCount: 0,
    fillCount: 0,
    fillRectCount: 0,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() { this.arcCount++; },
    fill() { this.fillCount++; },
    stroke() { this.strokeCount++; },
    fillRect() { this.fillRectCount++; },
    strokeRect() { this.strokeCount++; },
  };
}

test('直升机 visual id 已注册且组合视觉包含旋翼、机身、舷窗和登机光环', () => {
  const h = createHelicopter(0, 0);
  h.state = 'boarding';
  h.t = 1.5;
  const ctx = fakeCtx();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    renderHelicopter(ctx, h);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(HELICOPTER_VISUAL_ID, 'helicopter');
  assert.equal(h.visualId, HELICOPTER_VISUAL_ID);
  assert.equal(warnings.length, 0);
  assert.ok(ctx.arcCount >= 3);
  assert.ok(ctx.strokeCount >= 3);
  assert.ok(ctx.fillRectCount >= 2);
});

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
