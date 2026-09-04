// test/map.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { circleHit, circleRectHit } from '../src/core/physics.js';
import {
  generateMap, MAP_SIZE, hashId, obstacleVariant,
  ROCK_VARIANT_COUNT, RECT_VARIANT_COUNT, obstacleVisualId,
} from '../src/systems/map.js';

const SHOP_POSITIONS = [[750, 750], [2250, 750], [750, 2250], [2250, 2250], [1500, 1150]];
const SHOP_R = 46;
const SHOP_INTERACT_R = 90;
const MIN_GAP = 150;

function boundsOf(o) {
  return o.kind === 'circle' ? { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 } : o;
}

function bboxOverlap(a, b, gap) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
         a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

test('生成 60 个障碍，同种子可复现', () => {
  const a = generateMap(mulberry32(1));
  const b = generateMap(mulberry32(1));
  assert.equal(a.obstacles.length, 60);
  assert.deepEqual(a.obstacles, b.obstacles);
  assert.equal(a.size, MAP_SIZE);
  assert.deepEqual(a.spawn, { x: MAP_SIZE / 2, y: MAP_SIZE / 2 });
});

test('出生点半径 200 内无障碍', () => {
  const m = generateMap(mulberry32(2));
  for (const o of m.obstacles) {
    const b = boundsOf(o);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    assert.ok(Math.hypot(cx - m.spawn.x, cy - m.spawn.y) >= 200);
  }
});

test('障碍两两包围盒膨胀 150 后不相交', () => {
  const m = generateMap(mulberry32(3));
  const bs = m.obstacles.map(boundsOf);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    assert.equal(bboxOverlap(bs[i], bs[j], MIN_GAP), false, `障碍 ${i} 与 ${j} 间距不足`);
  }
});

test('5 座商店位置固定且字段完整', () => {
  const m = generateMap(mulberry32(4));
  assert.equal(m.shops.length, 5);
  for (let i = 0; i < m.shops.length; i++) {
    const s = m.shops[i];
    assert.deepEqual([s.x, s.y], SHOP_POSITIONS[i]);
    assert.equal(s.r, SHOP_R);
    assert.equal(s.interactR, SHOP_INTERACT_R);
  }
});

test('障碍物避开商店（包围盒膨胀 150 不相交）', () => {
  const m = generateMap(mulberry32(5));
  const shopBoxes = m.shops.map(boundsOf);
  for (const o of m.obstacles) {
    const a = boundsOf(o);
    for (const b of shopBoxes) {
      assert.equal(bboxOverlap(a, b, MIN_GAP), false, '障碍与商店间距不足');
    }
  }
});

test('40 枚预撒银币（value=1）均不落在障碍内也不在商店内', () => {
  const m = generateMap(mulberry32(6));
  assert.equal(m.scatteredCoins.length, 40);
  for (const c of m.scatteredCoins) {
    assert.equal(c.value, 1);
    for (const o of m.obstacles) {
      if (o.kind === 'circle') assert.equal(circleHit(c.x, c.y, 8, o.x, o.y, o.r), false);
      else assert.equal(circleRectHit(c.x, c.y, 8, o), false);
    }
    for (const s of m.shops) {
      assert.equal(circleHit(c.x, c.y, 8, s.x, s.y, s.r), false);
    }
  }
});

test('障碍物有稳定 id，hash(id) 选择固定变体且圆/矩形数量保持 3/2 变体', () => {
  const a = generateMap(mulberry32(7));
  const b = generateMap(mulberry32(7));
  assert.equal(ROCK_VARIANT_COUNT, 3);
  assert.equal(RECT_VARIANT_COUNT, 2);
  assert.deepEqual(
    a.obstacles.map(o => o.id),
    Array.from({ length: 60 }, (_, i) => 'obstacle-' + i),
  );
  assert.deepEqual(
    a.obstacles.map(o => ({ id: o.id, kind: o.kind, variant: o.variant })),
    b.obstacles.map(o => ({ id: o.id, kind: o.kind, variant: o.variant })),
  );
  for (const o of a.obstacles) {
    const count = o.kind === 'circle' ? ROCK_VARIANT_COUNT : RECT_VARIANT_COUNT;
    assert.equal(o.variant, hashId(o.id) % count, `${o.id} 变体不是 hash(id) 结果`);
    assert.ok(o.variant >= 0 && o.variant < count);
    assert.equal(obstacleVariant(o.id, o.kind), o.variant);
  }
});

test('障碍物新增视觉字段但碰撞字段与视觉 id 映射不变', () => {
  const m = generateMap(mulberry32(8));
  for (const o of m.obstacles) {
    assert.equal(typeof o.id, 'string');
    assert.equal(typeof o.variant, 'number');
    if (o.kind === 'circle') {
      assert.equal(typeof o.x, 'number');
      assert.equal(typeof o.y, 'number');
      assert.equal(typeof o.r, 'number');
      assert.equal('w' in o, false);
      assert.equal(obstacleVisualId(o), 'scene.rock');
    } else {
      assert.equal(typeof o.x, 'number');
      assert.equal(typeof o.y, 'number');
      assert.equal(typeof o.w, 'number');
      assert.equal(typeof o.h, 'number');
      assert.equal('r' in o, false);
      assert.equal(obstacleVisualId({ ...o, variant: 0 }), 'scene.vehicle');
      assert.equal(obstacleVisualId({ ...o, variant: 1 }), 'scene.concrete');
    }
  }
});
