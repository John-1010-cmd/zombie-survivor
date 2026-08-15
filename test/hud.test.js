import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime } from '../src/systems/hud.js';

test('formatTime 三个样例', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(600), '10:00');
});
