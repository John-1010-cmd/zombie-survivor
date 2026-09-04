import test from 'node:test';
import assert from 'node:assert/strict';
import { drawVisual } from '../src/core/visuals.js';
import { PALETTE } from '../src/config/palette.js';
import { FIRE_TOLERANCE, TURN_RATE } from '../src/core/angles.js';
import { createTurret, updateTurret, TURRET_VISUAL_ID } from '../src/entities/turret.js';

const rng = () => 0.5;
const EPSILON = 1e-9;

function targetAt(angle, distance = 100) {
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, alive: true };
}

function mockContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of [
    'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'fill', 'stroke', 'fillRect', 'rect',
  ]) {
    ctx[name] = (...args) => calls.push({ name, args });
  }
  return ctx;
}

test('createTurret 字段：位置/半径/耐久 200/alive/weapon/aimAngle', () => {
  const e = { damage: 0, fireRate: 0, projectiles: 0, range: 0 };
  const t = createTurret(100, 200, e);
  assert.equal(t.x, 100);
  assert.equal(t.y, 200);
  assert.equal(t.r, 20);
  assert.equal(t.hp, 200);
  assert.equal(t.maxHp, 200);
  assert.equal(t.alive, true);
  assert.equal(t.weapon.enhance, e);
  assert.equal(t.weapon.cooldown, 0);
  assert.equal(t.aimAngle, 0);
  assert.equal(createTurret(0, 0, e, Math.PI / 4).aimAngle, Math.PI / 4);
});

test('射程内僵尸触发开火：基础 25/0.5/350/350、aoe 80、pierce 0、炮口闪光', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const shots = [];
  updateTurret(t, [{ x: 100, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  const s = shots[0];
  assert.equal(s.x, 0);
  assert.equal(s.y, 0);
  assert.equal(s.angle, 0);
  assert.equal(t.aimAngle, 0);
  assert.equal(s.damage, 25);
  assert.equal(s.speed, 350);
  assert.equal(s.range, 350);
  assert.equal(s.pierce, 0);
  assert.equal(s.aoe, 80);
  assert.deepEqual(s.muzzleFlash, { color: PALETTE.gold, count: 2, distance: 28 });
});

test('cooldown = 1/fireRate（2s），冷却期间仍追踪，冷却结束后再开火', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const z = { x: 100, y: 0, alive: true };
  const shots = [];
  updateTurret(t, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.ok(Math.abs(t.weapon.cooldown - 2) < EPSILON);
  z.x = 0;
  z.y = 100;
  updateTurret(t, [z], s => shots.push(s), rng, 0.25);
  assert.equal(shots.length, 1);
  assert.ok(Math.abs(t.aimAngle - TURN_RATE * 0.25) < EPSILON);
  assert.ok(Math.abs(t.weapon.cooldown - 1.75) < EPSILON);
  updateTurret(t, [z], s => shots.push(s), rng, 1.75);
  assert.equal(shots.length, 2);
  assert.ok(Math.abs(shots[1].angle - Math.PI / 2) < EPSILON);
});

test('无目标时保持最近炮管朝向，同时正常扣减 cooldown', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 }, 0.7);
  t.weapon.cooldown = 0.5;
  updateTurret(t, [], () => {}, rng, 0.25);
  assert.equal(t.aimAngle, 0.7);
  assert.ok(Math.abs(t.weapon.cooldown - 0.25) < EPSILON);
});

test('目标在 ±15° 容差内开火，超出容差不发射', () => {
  const inside = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const insideShots = [];
  updateTurret(inside, [targetAt(Math.PI / 18)], s => insideShots.push(s), rng, 0);
  assert.equal(insideShots.length, 1);
  assert.equal(insideShots[0].angle, 0);
  assert.equal(inside.aimAngle, 0);
  assert.ok(Math.abs(Math.PI / 18) < FIRE_TOLERANCE);

  const outside = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const outsideShots = [];
  updateTurret(outside, [targetAt(Math.PI / 9)], s => outsideShots.push(s), rng, 0);
  assert.equal(outsideShots.length, 0);
  assert.ok(Math.abs(Math.PI / 9) > FIRE_TOLERANCE);
});

test('炮管跨越 ±pi 时沿短弧转动且受 240°/s 上限约束', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 }, Math.PI - 0.05);
  updateTurret(t, [targetAt(-Math.PI + 0.5)], () => {}, rng, 0.1);
  assert.ok(Math.abs(t.aimAngle - (Math.PI - 0.05 + TURN_RATE * 0.1)) < EPSILON);
});

test('射程外与死尸不开火', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const shots = [];
  updateTurret(t, [{ x: 500, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
  updateTurret(t, [{ x: 100, y: 0, alive: false }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
});

test('enhance 生效：乘区/加法同 weaponStats 公式；共享引用', () => {
  const e = { damage: 2, fireRate: 1, projectiles: 2, range: 1 };
  const t = createTurret(0, 0, e);
  const z = { x: 400, y: 0, alive: true };
  const shots = [];
  updateTurret(t, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 3);
  for (const s of shots) {
    assert.equal(s.damage, 25 * 1.25 ** 2);
    assert.equal(s.range, 350 * 1.2);
    assert.equal(s.speed, 350);
    assert.equal(s.aoe, 80);
  }
  assert.ok(Math.abs(t.weapon.cooldown - 1 / (0.5 * 1.2)) < EPSILON);
  e.damage = 3;
  updateTurret(t, [z], s => shots.push(s), rng, 10);
  assert.equal(shots[3].damage, 25 * 1.25 ** 3);
});

test('耐久归零（alive=false）后不再开火', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  t.alive = false;
  const shots = [];
  updateTurret(t, [{ x: 100, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
});

test('固定火炮 visual 已注册为组合绘制而非 circle 占位', () => {
  const ctx = mockContext();
  assert.equal(TURRET_VISUAL_ID, 'deployable.turret');
  assert.doesNotThrow(() => drawVisual(ctx, TURRET_VISUAL_ID, 10, 20, 20, {
    params: { aimAngle: Math.PI / 4, hp: 100, maxHp: 200 },
    phase: 0,
  }));
  const rotateCall = ctx.calls.find(call => call.name === 'rotate');
  assert.ok(rotateCall, '应当包含 rotate 调用');
  assert.ok(Math.abs(rotateCall.args[0] - Math.PI / 4) < EPSILON, 'rotate 角度应当等于传入的 aimAngle');
  assert.ok(ctx.calls.some(call => call.name === 'ellipse'));
  assert.ok(ctx.calls.some(call => call.name === 'lineTo'));
});
