import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, adventureTierProgress } from '../src/systems/hud.js';

test('formatTime 三个样例', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(600), '10:00');
});

test('冒险四档进度：90s 一档，档内 0→1，封顶第 4 档', () => {
  assert.deepEqual(adventureTierProgress(0), { tier: 1, progress: 0 });
  assert.equal(adventureTierProgress(45).progress, 0.5);
  assert.deepEqual(adventureTierProgress(90), { tier: 2, progress: 0 });
  assert.equal(adventureTierProgress(359).tier, 4);
  assert.deepEqual(adventureTierProgress(360), { tier: 4, progress: 1 });
  assert.deepEqual(adventureTierProgress(999), { tier: 4, progress: 1 }); // 封顶
});
