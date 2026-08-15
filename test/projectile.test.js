// test/projectile.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectile, resetProjectile, updateProjectile } from '../src/entities/projectile.js';

test('createProjectile 返回默认字段', () => {
  assert.deepEqual(createProjectile(), {
    x: 0, y: 0, angle: 0, speed: 0, damage: 0, range: 0,
    traveled: 0, pierce: 0, knockback: 0, alive: true,
  });
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
