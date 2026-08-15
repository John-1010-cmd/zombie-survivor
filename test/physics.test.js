// test/physics.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleHit, circleRectHit, resolveCircleRect, slideCircleObstacles, createSpatialHash } from '../src/core/physics.js';

test('circleHit 相切不算撞，重叠算撞', () => {
  assert.equal(circleHit(0, 0, 10, 20, 0, 10), false);
  assert.equal(circleHit(0, 0, 10, 19, 0, 10), true);
});

test('circleRectHit 边/角/未命中', () => {
  const rect = { x: 0, y: 0, w: 100, h: 50 };
  assert.equal(circleRectHit(50, -5, 10, rect), true);   // 上边压入
  assert.equal(circleRectHit(-15, -15, 10, rect), false); // 角外
  assert.equal(circleRectHit(200, 200, 10, rect), false);
});

test('resolveCircleRect 推出后不再重叠', () => {
  const rect = { x: 0, y: 0, w: 100, h: 100 };
  const r = resolveCircleRect(50, -5, 10, rect);
  assert.equal(circleRectHit(r.x, r.y, 10, rect), false);
  // 圆心在矩形内部也能推出
  const r2 = resolveCircleRect(50, 50, 10, rect);
  assert.equal(circleRectHit(r2.x, r2.y, 10, rect), false);
});

test('slideCircleObstacles 同时处理圆与矩形障碍', () => {
  const e = { x: 5, y: 0, r: 10 };
  slideCircleObstacles(e, [{ kind: 'circle', x: 15, y: 0, r: 10 }]);
  assert.ok(Math.hypot(e.x - 15, e.y) >= 20 - 1e-9);
  const e2 = { x: 50, y: -5, r: 10 };
  slideCircleObstacles(e2, [{ kind: 'rect', x: 0, y: 0, w: 100, h: 100 }]);
  assert.equal(circleRectHit(e2.x, e2.y, 10, { x: 0, y: 0, w: 100, h: 100 }), false);
});

test('spatialHash 查询命中且跨格实体不重复', () => {
  const h = createSpatialHash(64);
  const big = { x: 64, y: 64, r: 40 }; // 横跨多个格
  const far = { x: 500, y: 500, r: 5 };
  h.insert(big); h.insert(far);
  const out = h.query(64, 64, 50);
  assert.equal(out.filter(e => e === big).length, 1);
  assert.equal(out.includes(far), false);
  h.clear();
  assert.equal(h.query(64, 64, 50).length, 0);
});
