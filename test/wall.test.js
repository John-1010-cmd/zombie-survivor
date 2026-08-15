// test/wall.test.js —— 围墙：单段放置、字段、耐久随强化、无 ring 残留。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as wall from '../src/entities/wall.js';
import { createWallSegment } from '../src/entities/wall.js';

test('createWallSegment 生成单段 {x,y,r:22,hp:150,maxHp:150,alive:true}', () => {
  const seg = createWallSegment(0, 0, { hp: 0 });
  assert.equal(seg.x, 0);
  assert.equal(seg.y, 0);
  assert.equal(seg.r, 22);
  assert.equal(seg.hp, 150);
  assert.equal(seg.maxHp, 150);
  assert.equal(seg.alive, true);
});

test('以 (x,y) 为段心', () => {
  const seg = createWallSegment(100, 50, { hp: 0 });
  assert.equal(seg.x, 100);
  assert.equal(seg.y, 50);
});

test('耐久 = 150×1.5^wallEnhance.hp', () => {
  assert.equal(createWallSegment(0, 0, { hp: 1 }).hp, 225);
  assert.equal(createWallSegment(0, 0, { hp: 2 }).hp, 337.5);
  assert.equal(createWallSegment(0, 0, { hp: 3 }).hp, 506.25);
  assert.equal(createWallSegment(0, 0, { hp: 8 }).hp, 150 * 1.5 ** 8);
  // 未传强化 → 基值 150
  assert.equal(createWallSegment(0, 0).hp, 150);
  // maxHp 与 hp 同步
  const seg = createWallSegment(0, 0, { hp: 3 });
  assert.equal(seg.maxHp, seg.hp);
});

test('无 createWallRing 残留（导出不再包含 ring）', () => {
  assert.equal(wall.createWallRing, undefined);
  assert.equal(typeof wall.createWallSegment, 'function');
});
