// test/projectile.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectile, resetProjectile, updateProjectile } from '../src/entities/projectile.js';

test('createProjectile 返回默认字段', () => {
  assert.deepEqual(createProjectile(), {
    x: 0, y: 0, angle: 0, speed: 0, damage: 0, range: 0,
    traveled: 0, pierce: 0, knockback: 0, aoe: 0, arc: false, chain: 0,
    frags: null, chainMult: 0.8, chainDmgMult: 1, alive: true,
    visual: null,
    trail: Array.from({ length: 8 }, () => ({ x: 0, y: 0 })),
    trailHead: 0, trailLen: 0,
  });
});

test('拖尾环形缓冲：≤8 点、复用预分配数组、无每帧分配', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 100, range: 10000 });
  assert.equal(p.trailLen, 0);
  for (let i = 0; i < 20; i++) updateProjectile(p, 0.1);
  assert.ok(p.trailLen <= 8);
  assert.equal(p.trail.length, 8); // 预分配定长
  const head = (p.trailHead - 1 + 8) % 8;
  assert.ok(p.trail[head].x < p.x);
});

test('弹道携带 visual（武器图鉴视觉描述），缺省为 null', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 1, range: 1, visual: { bulletShape: 'needle', color: '#aef', trail: 0.9 } });
  assert.equal(p.visual.bulletShape, 'needle');
  const q = createProjectile();
  assert.equal(q.visual, null);
});

test('resetProjectile 应用 opts 并重置 traveled/alive', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 10, y: 20, angle: 0.5, speed: 200, damage: 8, range: 400, pierce: 2, knockback: 60 });
  assert.equal(p.x, 10); assert.equal(p.y, 20);
  assert.equal(p.angle, 0.5); assert.equal(p.speed, 200);
  assert.equal(p.damage, 8); assert.equal(p.range, 400);
  assert.equal(p.pierce, 2); assert.equal(p.knockback, 60);
  assert.equal(p.traveled, 0); assert.equal(p.alive, true);
});

test('resetProjectile 透传 aoe/arc/chain（Object.assign 自然覆盖默认值）', () => {
  const p = createProjectile();
  assert.equal(p.aoe, 0); assert.equal(p.arc, false); assert.equal(p.chain, 0);
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 10, damage: 1, range: 100,
    aoe: 130, arc: true, chain: 3 });
  assert.equal(p.aoe, 130);
  assert.equal(p.arc, true);
  assert.equal(p.chain, 3);
  // 未提供的字段保留默认值
  const q = createProjectile();
  resetProjectile(q, { x: 0, y: 0, angle: 0, speed: 10, damage: 1, range: 100 });
  assert.equal(q.aoe, 0); assert.equal(q.arc, false); assert.equal(q.chain, 0);
});

test('沿 angle 方向前进 speed*dt 且 traveled 累计', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 100, damage: 1, range: 1000, pierce: 0, knockback: 0 });
  updateProjectile(p, 0.5);
  assert.ok(Math.abs(p.x - 50) < 1e-9);
  assert.ok(Math.abs(p.y - 0) < 1e-9);
  assert.ok(Math.abs(p.traveled - 50) < 1e-9);
});

test('traveled 未达 range 仍存活', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 100, damage: 1, range: 100, pierce: 0, knockback: 0 });
  updateProjectile(p, 0.5);
  assert.equal(p.alive, true);
});

test('traveled 达到 range 后 alive=false', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 100, damage: 1, range: 100, pierce: 0, knockback: 0 });
  updateProjectile(p, 1); // traveled == range
  assert.equal(p.alive, false);
});

test('createProjectile 默认带 frags/chainMult/chainDmgMult，reset 可透传覆盖', () => {
  const p = createProjectile();
  assert.equal(p.frags, null);
  assert.equal(p.chainMult, 0.8);
  assert.equal(p.chainDmgMult, 1);
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 10, damage: 1, range: 100,
    frags: { count: 8, dmg: 10 }, chainMult: 0.8, chainDmgMult: 1.1 });
  assert.deepEqual(p.frags, { count: 8, dmg: 10 });
  assert.equal(p.chainMult, 0.8);
  assert.equal(p.chainDmgMult, 1.1);
  // 未提供的字段保留默认值
  const q = createProjectile();
  resetProjectile(q, { x: 0, y: 0, angle: 0, speed: 10, damage: 1, range: 100 });
  assert.equal(q.frags, null);
  assert.equal(q.chainMult, 0.8);
  assert.equal(q.chainDmgMult, 1);
});
