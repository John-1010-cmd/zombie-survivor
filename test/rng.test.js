import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pickWeighted } from '../src/core/rng.js';

test('同种子同序列', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});

test('值域 [0,1)', () => {
  const r = mulberry32(1);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test('0 权重永不命中，单权重必中', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 100; i++) {
    assert.equal(pickWeighted(r, { a: 0, b: 1 }), 'b');
  }
});

test('权重分布大致成比例', () => {
  const r = mulberry32(123);
  let a = 0;
  for (let i = 0; i < 10000; i++) if (pickWeighted(r, { a: 1, b: 3 }) === 'a') a++;
  assert.ok(a > 2000 && a < 3000, `a 命中 ${a} 次，期望约 2500`);
});
