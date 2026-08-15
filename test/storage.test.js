// test/storage.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateBest } from '../src/core/storage.js';

test('首次纪录必然 isNew=true 且写入 endless', () => {
  const best = {};
  const r = updateBest(best, { time: 60, kills: 10, level: 3 });
  assert.equal(r.isNew, true);
  assert.deepEqual(r.best.endless, { time: 60, kills: 10, level: 3 });
});

test('更长时间刷新纪录', () => {
  const best = { endless: { time: 60, kills: 10, level: 3 } };
  const r = updateBest(best, { time: 90, kills: 20, level: 5 });
  assert.equal(r.isNew, true);
  assert.deepEqual(r.best.endless, { time: 90, kills: 20, level: 5 });
});

test('更短时间不刷新：返回原 best 引用不变且 isNew=false', () => {
  const best = { endless: { time: 90, kills: 20, level: 5 } };
  const r = updateBest(best, { time: 30, kills: 99, level: 9 });
  assert.equal(r.isNew, false);
  assert.equal(r.best, best); // 引用不变
  assert.deepEqual(best.endless, { time: 90, kills: 20, level: 5 }); // 内容不变
});

test('入参对象不被修改', () => {
  const best = { endless: { time: 60, kills: 10, level: 3 } };
  const stats = { time: 120, kills: 30, level: 7 };
  updateBest(best, stats);
  assert.deepEqual(best, { endless: { time: 60, kills: 10, level: 3 } });
  assert.deepEqual(stats, { time: 120, kills: 30, level: 7 });
});
