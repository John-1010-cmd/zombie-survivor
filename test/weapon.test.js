// test/weapon.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { createWeapon, weaponStats, applyEnhancement, updateWeapon } from '../src/entities/weapon.js';
import { WEAPON_MAX_LEVEL } from '../src/config/weapons.js';

test('射程内无僵尸不开火，无冷却', () => {
  const w = createWeapon('pistol'); // range 600
  const owner = { x: 0, y: 0 };
  const shots = [];
  const rng = mulberry32(1);
  updateWeapon(w, owner, [], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
  assert.equal(w.cooldown, 0);
  // 僵尸在射程外同样不开火
  updateWeapon(w, owner, [{ x: 900, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
});

test('开火后 cooldown = 1/fireRate', () => {
  const w = createWeapon('pistol'); // fireRate 2.0
  const owner = { x: 0, y: 0 };
  const z = { x: 100, y: 0, alive: true };
  const shots = [];
  const rng = mulberry32(2);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.ok(Math.abs(w.cooldown - 1 / 2.0) < 1e-9);
  assert.equal(w.aimAngle, 0); // 目标在正东
});

test('rifle 一轮 burst 打出 3 发且间隔正确', () => {
  const w = createWeapon('rifle'); // burst 3, burstInterval 0.08, fireRate 1.4
  const owner = { x: 0, y: 0 };
  const z = { x: 200, y: 0, alive: true };
  const shots = [];
  const rng = mulberry32(3);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.equal(w.burstLeft, 2);
  assert.equal(w.burstTimer, 0.08);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.08);  // 满一个 burstInterval
  assert.equal(shots.length, 2);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.08);  // 再满一个 burstInterval
  assert.equal(shots.length, 3);
  assert.equal(w.burstLeft, 0);
  // 总耗时 0.176s < cooldown(1/1.4≈0.714)，确认 3 发均来自 burst 而非冷却重开
  assert.ok(w.cooldown > 0.5);
});

test('burst 补发时目标死亡则中止', () => {
  const w = createWeapon('rifle');
  const owner = { x: 0, y: 0 };
  const z = { x: 200, y: 0, alive: true };
  const shots = [];
  const rng = mulberry32(4);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  z.alive = false; // 首发后目标死亡
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.08);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.08);
  assert.equal(shots.length, 1);
});

test('applyEnhancement 后 weaponStats 数值正确', () => {
  const w = createWeapon('pistol');
  applyEnhancement(w, 'damage');
  applyEnhancement(w, 'fireRate');
  applyEnhancement(w, 'projectiles');
  applyEnhancement(w, 'range');
  const s = weaponStats(w);
  assert.equal(s.damage, 12 * 1.25);
  assert.equal(s.fireRate, 2 * 1.2);
  assert.equal(s.projectiles, 2);
  assert.equal(s.range, 600 * 1.2);
  assert.equal(s.projectileSpeed, 500);
  assert.equal(s.spread, 0);
  assert.equal(s.pierce, 0);
  assert.equal(s.aoe, 0);
  assert.equal(s.knockback, 120);
  assert.equal(s.burst, 1);
  assert.equal(s.burstInterval, 0);
  assert.equal(w.level, 5);
});

test('level 达上限后 applyEnhancement 无效', () => {
  const w = createWeapon('pistol');
  for (let i = 1; i < WEAPON_MAX_LEVEL; i++) applyEnhancement(w, 'damage');
  assert.equal(w.level, WEAPON_MAX_LEVEL);
  const before = weaponStats(w).damage;
  applyEnhancement(w, 'range');
  assert.equal(w.enhance.range, 0);
  assert.equal(w.level, WEAPON_MAX_LEVEL);
  assert.equal(weaponStats(w).damage, before);
});

test('enhance.projectiles=2 时一次开火产生 3 发扇形弹道', () => {
  const w = createWeapon('pistol'); // spread 0，无抖动
  applyEnhancement(w, 'projectiles');
  applyEnhancement(w, 'projectiles');
  const owner = { x: 0, y: 0 };
  const z = { x: 100, y: 0, alive: true };
  const shots = [];
  const rng = mulberry32(5);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 3);
  assert.equal(shots[0].angle, -0.12);
  assert.equal(shots[1].angle, 0);   // 中间一发指向目标
  assert.equal(shots[2].angle, 0.12);
  for (const s of shots) {
    assert.equal(s.x, 0);
    assert.equal(s.y, 0);
    assert.equal(s.speed, 500);
    assert.equal(s.damage, 12);
    assert.equal(s.range, 600);
    assert.equal(s.pierce, 0);
    assert.equal(s.knockback, 120);
  }
});
