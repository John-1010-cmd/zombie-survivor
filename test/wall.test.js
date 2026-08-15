// test/wall.test.js —— 围墙：8 段环形、段心位置、耐久随强化。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWallRing } from '../src/entities/wall.js';

test('createWallRing 生成 8 段，每段 r18/耐久 150/alive', () => {
  const segs = createWallRing(0, 0, { hp: 0 });
  assert.equal(segs.length, 8);
  for (const s of segs) {
    assert.equal(s.r, 18);
    assert.equal(s.hp, 150);
    assert.equal(s.maxHp, 150);
    assert.equal(s.alive, true);
  }
});

test('段心位置：x + 120·cos(i/8·2π)（环形均匀分布）', () => {
  const segs = createWallRing(0, 0, { hp: 0 });
  for (let i = 0; i < 8; i++) {
    const ex = 120 * Math.cos((i / 8) * 2 * Math.PI);
    const ey = 120 * Math.sin((i / 8) * 2 * Math.PI);
    assert.ok(Math.abs(segs[i].x - ex) < 1e-9, `段 ${i} x`);
    assert.ok(Math.abs(segs[i].y - ey) < 1e-9, `段 ${i} y`);
  }
  // 抽查四向与 45°
  assert.equal(segs[0].x, 120);
  assert.equal(segs[0].y, 0);
  assert.ok(Math.abs(segs[2].x) < 1e-9 && Math.abs(segs[2].y - 120) < 1e-9);
  assert.ok(Math.abs(segs[4].x + 120) < 1e-9 && Math.abs(segs[4].y) < 1e-9);
  assert.ok(Math.abs(segs[6].x) < 1e-9 && Math.abs(segs[6].y + 120) < 1e-9);
  assert.ok(Math.abs(segs[1].x - 120 * Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(segs[1].y - 120 * Math.SQRT1_2) < 1e-9);
});

test('以 (x,y) 为圆心偏移', () => {
  const segs = createWallRing(100, 50, { hp: 0 });
  assert.equal(segs[0].x, 220);
  assert.equal(segs[0].y, 50);
  assert.ok(Math.abs(segs[2].x - 100) < 1e-9);
  assert.ok(Math.abs(segs[2].y - 170) < 1e-9);
});

test('耐久 = 150×1.5^wallEnhance.hp', () => {
  assert.equal(createWallRing(0, 0, { hp: 1 })[0].hp, 225);
  assert.equal(createWallRing(0, 0, { hp: 2 })[0].hp, 337.5);
  assert.equal(createWallRing(0, 0, { hp: 3 })[0].hp, 506.25);
  assert.equal(createWallRing(0, 0, { hp: 8 })[0].hp, 150 * 1.5 ** 8);
  // 未传强化 → 基值 150
  assert.equal(createWallRing(0, 0)[0].hp, 150);
});

test('每段独立：一处扣耐久/摧毁不影响他段', () => {
  const segs = createWallRing(0, 0, { hp: 0 });
  segs[0].hp -= 50;
  segs[0].alive = false;
  assert.equal(segs[1].hp, 150);
  assert.equal(segs[1].alive, true);
});
