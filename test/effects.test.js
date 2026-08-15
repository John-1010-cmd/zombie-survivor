import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { spawnParticles, updateParticles, spawnFloater, updateFloaters } from '../src/entities/effects.js';

test('spawnParticles 生成 n 个且颜色/坐标正确', () => {
  const arr = [];
  spawnParticles(arr, 100, 200, '#ff5533', 10, mulberry32(1));
  assert.equal(arr.length, 10);
  for (const p of arr) {
    assert.equal(p.x, 100);
    assert.equal(p.y, 200);
    assert.equal(p.color, '#ff5533');
    assert.equal(p.life, 0.4);
    assert.equal(p.maxLife, 0.4);
    assert.ok(p.r >= 2 && p.r < 4, `r=${p.r} 应在 [2,4)`);
    const sp = Math.hypot(p.vx, p.vy);
    assert.ok(sp >= 60 && sp <= 180, `速率 ${sp} 应在 [60,180]`);
  }
});

test('同种子粒子序列可复现', () => {
  const a = [], b = [];
  spawnParticles(a, 0, 0, '#fff', 8, mulberry32(42));
  spawnParticles(b, 0, 0, '#fff', 8, mulberry32(42));
  assert.deepEqual(a, b);
});

test('粒子按 vx/vy 位移且 life 递减', () => {
  const arr = [{ x: 0, y: 0, vx: 100, vy: 50, life: 0.4, maxLife: 0.4, color: '#fff', r: 2 }];
  updateParticles(arr, 0.1);
  assert.equal(arr[0].x, 10);
  assert.equal(arr[0].y, 5);
  assert.ok(Math.abs(arr[0].life - 0.3) < 1e-9);
});

test('swap-remove：死亡粒子移除、存活粒子保留', () => {
  const arr = [
    { x: 0, y: 0, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, color: '#fff', r: 2 },
    { x: 0, y: 0, vx: 0, vy: 0, life: 0.1, maxLife: 0.4, color: '#fff', r: 2 },
    { x: 0, y: 0, vx: 0, vy: 0, life: 0.3, maxLife: 0.4, color: '#fff', r: 2 },
  ];
  updateParticles(arr, 0.2); // 中间粒子 0.1-0.2 <= 0 死亡
  assert.equal(arr.length, 2);
  for (const p of arr) assert.ok(p.life > 0);
});

test('life 耗尽后数组收缩且无残留', () => {
  const arr = [];
  spawnParticles(arr, 0, 0, '#fff', 5, mulberry32(2));
  updateParticles(arr, 0.5); // 0.4 - 0.5 <= 0，全部耗尽
  assert.equal(arr.length, 0);
});

test('floater 随时间上浮（y 减小）且最终移除', () => {
  const arr = [];
  spawnFloater(arr, 50, 100, '25', '#ffd75e');
  assert.equal(arr.length, 1);
  assert.deepEqual(arr[0], { x: 50, y: 100, text: '25', color: '#ffd75e', life: 0.7 });
  updateFloaters(arr, 0.5);
  assert.equal(arr[0].y, 100 - 40 * 0.5); // 上浮 20px
  assert.ok(arr[0].y < 100);
  assert.ok(Math.abs(arr[0].life - 0.2) < 1e-9);
  updateFloaters(arr, 1); // 0.2 - 1 <= 0，移除
  assert.equal(arr.length, 0);
});
