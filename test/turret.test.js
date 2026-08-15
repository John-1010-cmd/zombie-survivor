// test/turret.test.js —— 固定火炮：创建字段、耐久、自动开火（aoe 80）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurret, updateTurret } from '../src/entities/turret.js';

const rng = () => 0.5;

test('createTurret 字段：位置/半径/耐久 200/alive/weapon', () => {
  const e = { damage: 0, fireRate: 0, projectiles: 0, range: 0 };
  const t = createTurret(100, 200, e);
  assert.equal(t.x, 100);
  assert.equal(t.y, 200);
  assert.equal(t.r, 20);
  assert.equal(t.hp, 200);
  assert.equal(t.maxHp, 200);
  assert.equal(t.alive, true);
  assert.equal(t.weapon.enhance, e); // 共享引用：已部署炮台吃后续强化
  assert.equal(t.weapon.cooldown, 0);
});

test('射程内僵尸触发开火：基础 25/0.5/350/450、aoe 80、pierce 0', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const shots = [];
  updateTurret(t, [{ x: 100, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  const s = shots[0];
  assert.equal(s.x, 0);
  assert.equal(s.y, 0);
  assert.equal(s.angle, 0); // 目标正东
  assert.equal(s.damage, 25);
  assert.equal(s.speed, 350);
  assert.equal(s.range, 450);
  assert.equal(s.pierce, 0);
  assert.equal(s.aoe, 80);
});

test('cooldown = 1/fireRate（2s），冷却未满不重复开火', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const z = { x: 100, y: 0, alive: true };
  const shots = [];
  updateTurret(t, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.ok(Math.abs(t.weapon.cooldown - 2) < 1e-9);
  updateTurret(t, [z], s => shots.push(s), rng, 1.0); // 冷却剩 1s
  assert.equal(shots.length, 1);
  updateTurret(t, [z], s => shots.push(s), rng, 1.0); // 冷却归零
  assert.equal(shots.length, 2);
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
  const z = { x: 500, y: 0, alive: true }; // 基础射程 450 外，强化 range=1 → 540 内
  const shots = [];
  updateTurret(t, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 3); // projectiles 1+2
  for (const s of shots) {
    assert.equal(s.damage, 25 * 1.25 ** 2);
    assert.equal(s.range, 450 * 1.2);
    assert.equal(s.speed, 350);
    assert.equal(s.aoe, 80);
  }
  assert.ok(Math.abs(t.weapon.cooldown - 1 / (0.5 * 1.2)) < 1e-9);
  // 部署后强化仍生效（共享引用）
  e.damage = 3;
  updateTurret(t, [z], s => shots.push(s), rng, 10); // 冷却到点
  assert.equal(shots[3].damage, 25 * 1.25 ** 3);
});

test('耐久归零（alive=false）后不再开火', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  t.alive = false;
  const shots = [];
  updateTurret(t, [{ x: 100, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
});
