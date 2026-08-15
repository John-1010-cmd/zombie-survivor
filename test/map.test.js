// test/map.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { circleHit, circleRectHit } from '../src/core/physics.js';
import { generateMap, MAP_SIZE } from '../src/systems/map.js';

function boundsOf(o) {
  return o.kind === 'circle' ? { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 } : o;
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
    const a = bs[i], b = bs[j];
    const overlap = a.x < b.x + b.w + 150 && a.x + a.w + 150 > b.x &&
                    a.y < b.y + b.h + 150 && a.y + a.h + 150 > b.y;
    assert.equal(overlap, false, `障碍 ${i} 与 ${j} 间距不足`);
  }
});

test('40 颗预撒经验球均不落在障碍内', () => {
  const m = generateMap(mulberry32(4));
  assert.equal(m.scatteredGems.length, 40);
  for (const g of m.scatteredGems) {
    assert.equal(g.value, 1);
    for (const o of m.obstacles) {
      if (o.kind === 'circle') assert.equal(circleHit(g.x, g.y, 8, o.x, o.y, o.r), false);
      else assert.equal(circleRectHit(g.x, g.y, 8, o), false);
    }
  }
});
