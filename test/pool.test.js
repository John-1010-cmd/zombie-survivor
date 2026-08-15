import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../src/core/pool.js';

test('release 后 obtain 复用同一对象且 reset 生效', () => {
  const p = createPool(() => ({ v: 0 }), (o, v) => { o.v = v; });
  const a = p.obtain(1);
  assert.equal(a.v, 1);
  p.release(a);
  const b = p.obtain(2);
  assert.equal(a, b);
  assert.equal(b.v, 2);
});

test('size 反映空闲数量', () => {
  const p = createPool(() => ({}) , () => {});
  const a = p.obtain(), b = p.obtain();
  p.release(a); p.release(b);
  assert.equal(p.size, 2);
});
