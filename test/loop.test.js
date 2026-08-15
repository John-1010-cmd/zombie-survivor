import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoop, advance } from '../src/core/loop.js';

test('首帧不产生步进', () => {
  const l = createLoop();
  assert.equal(advance(l, 1000), 0);
});

test('间隔约 1/60 秒（17ms）产生 1 步', () => {
  const l = createLoop();
  advance(l, 1000);
  // 用整数毫秒：1000/60 的浮点值略小于 step，断言 1 步会因浮点误差失败
  assert.equal(advance(l, 1017), 1);
});

test('大间隔被钳制，不产生死亡螺旋', () => {
  const l = createLoop();
  advance(l, 1000);
  const steps = advance(l, 11000); // 10 秒
  assert.ok(steps <= 16, `steps=${steps} 应 <= 16（0.25s 钳制）`);
});

test('余数会累积到后续帧', () => {
  const l = createLoop();
  advance(l, 0);
  assert.equal(advance(l, 8), 0);   // 8ms 不足一步
  assert.equal(advance(l, 17), 1);  // 累计 17ms > 16.67ms
});
