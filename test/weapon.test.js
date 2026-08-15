// test/weapon.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { createWeapon, weaponStats, applyEnhancement, updateWeapon } from '../src/entities/weapon.js';
import { WEAPONS, WEAPON_MAX_LEVEL, STAT_MAX, WEAPON_BASE_PRICE } from '../src/config/weapons.js';

test('射程内无僵尸不开火，无冷却', () => {
  const w = createWeapon('pistol'); // range 300
  const owner = { x: 0, y: 0 };
  const shots = [];
  const rng = mulberry32(1);
  updateWeapon(w, owner, [], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
  assert.equal(w.cooldown, 0);
  // 僵尸在射程外同样不开火（新射程 300，450 已在圈外）
  updateWeapon(w, owner, [{ x: 450, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
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
  assert.equal(s.range, 300 * 1.2);
  assert.equal(s.projectileSpeed, 500);
  assert.equal(s.spread, 0);
  assert.equal(s.pierce, 0);
  assert.equal(s.aoe, 0);
  assert.equal(s.arc, false);
  assert.equal(s.chain, 0);
  assert.equal(s.knockback, 120);
  assert.equal(s.burst, 1);
  assert.equal(s.burstInterval, 0);
});

test('createWeapon 不再有 level 字段，enhance 四维归零', () => {
  const w = createWeapon('pistol');
  assert.ok(!('level' in w), 'level 字段已删除');
  assert.deepEqual(w.enhance, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
});

test('createWeapon 初始 spent 为 0（换枪返还累计用）', () => {
  const w = createWeapon('pistol');
  assert.equal(w.spent, 0);
});

test('单维达 STAT_MAX 后 applyEnhancement 忽略，其他维仍可强化', () => {
  const w = createWeapon('pistol');
  for (let i = 0; i < STAT_MAX; i++) applyEnhancement(w, 'damage');
  assert.equal(w.enhance.damage, STAT_MAX);
  assert.equal(weaponStats(w).damage, 12 * Math.pow(1.25, STAT_MAX));
  applyEnhancement(w, 'damage'); // 满维：忽略
  assert.equal(w.enhance.damage, STAT_MAX);
  assert.equal(weaponStats(w).damage, 12 * Math.pow(1.25, STAT_MAX));
  applyEnhancement(w, 'range'); // 其他维不受影响
  assert.equal(w.enhance.range, 1);
  assert.equal(w.enhance.fireRate, 0);
  assert.equal(weaponStats(w).range, 300 * 1.2);
});

test('六武器表：schema 齐全且数值与裁定一致（含新字段与射程下调）', () => {
  const ids = ['pistol', 'rifle', 'mg', 'rocket', 'grenade', 'tesla'];
  assert.deepEqual(Object.keys(WEAPONS).sort(), [...ids].sort());
  const expect = {
    pistol:  { damage: 12, fireRate: 2.0, projectileSpeed: 500, range: 300, aoe: 0,   arc: false, chain: 0 },
    rifle:   { damage: 9,  fireRate: 1.4, projectileSpeed: 600, range: 320, aoe: 0,   arc: false, chain: 0 },
    mg:      { damage: 5,  fireRate: 8,   projectileSpeed: 550, range: 280, aoe: 0,   arc: false, chain: 0 },
    rocket:  { damage: 30, fireRate: 0.7, projectileSpeed: 350, range: 350, aoe: 90,  arc: false, chain: 0 },
    grenade: { damage: 25, fireRate: 0.6, projectileSpeed: 420, range: 330, aoe: 130, arc: true,  chain: 0 },
    tesla:   { damage: 14, fireRate: 1.2, projectileSpeed: 800, range: 260, aoe: 0,   arc: false, chain: 3 },
  };
  for (const id of ids) {
    const c = WEAPONS[id];
    assert.ok(c, `缺武器 ${id}`);
    assert.equal(c.id, id);
    assert.ok(c.name, `${id} 缺名称`);
    assert.equal(c.damage, expect[id].damage, `${id}.damage`);
    assert.equal(c.fireRate, expect[id].fireRate, `${id}.fireRate`);
    assert.equal(c.projectileSpeed, expect[id].projectileSpeed, `${id}.projectileSpeed`);
    assert.equal(c.range, expect[id].range, `${id}.range`);
    assert.equal(c.aoe, expect[id].aoe, `${id}.aoe`);
    assert.equal(c.arc, expect[id].arc, `${id}.arc`);
    assert.equal(c.chain, expect[id].chain, `${id}.chain`);
    // 既有 schema 字段齐全
    assert.ok(Number.isInteger(c.projectiles) && c.projectiles >= 1, `${id}.projectiles`);
    assert.equal(typeof c.spread, 'number', `${id}.spread`);
    assert.ok(Number.isInteger(c.pierce) && c.pierce >= 0, `${id}.pierce`);
    assert.equal(typeof c.knockback, 'number', `${id}.knockback`);
    assert.ok(Number.isInteger(c.burst) && c.burst >= 1, `${id}.burst`);
    assert.equal(typeof c.burstInterval, 'number', `${id}.burstInterval`);
  }
});

test('STAT_MAX / WEAPON_BASE_PRICE / 既有常量', () => {
  assert.equal(STAT_MAX, 8);
  assert.equal(WEAPON_MAX_LEVEL, 8);
  assert.deepEqual(WEAPON_BASE_PRICE, { pistol: 40, rifle: 80, mg: 80, rocket: 150, grenade: 200, tesla: 250 });
});

test('weaponStats 透传 aoe/arc/chain（默认 0/false/0）', () => {
  assert.equal(weaponStats(createWeapon('rocket')).aoe, 90);
  assert.equal(weaponStats(createWeapon('grenade')).aoe, 130);
  assert.equal(weaponStats(createWeapon('grenade')).arc, true);
  assert.equal(weaponStats(createWeapon('tesla')).chain, 3);
  const p = weaponStats(createWeapon('pistol'));
  assert.equal(p.aoe, 0);
  assert.equal(p.arc, false);
  assert.equal(p.chain, 0);
});

test('新武器开火弹道携带 aoe/arc/chain 字段', () => {
  const rng = mulberry32(6);
  const cases = [
    ['rocket', { aoe: 90, arc: false, chain: 0 }],
    ['grenade', { aoe: 130, arc: true, chain: 0 }],
    ['tesla', { aoe: 0, arc: false, chain: 3 }],
  ];
  for (const [id, expect] of cases) {
    const w = createWeapon(id);
    const owner = { x: 0, y: 0 };
    const z = { x: 200, y: 0, alive: true };
    const shots = [];
    updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
    assert.equal(shots.length, 1, `${id} 应开火`);
    assert.equal(shots[0].aoe, expect.aoe, `${id} 弹道 aoe`);
    assert.equal(shots[0].arc, expect.arc, `${id} 弹道 arc`);
    assert.equal(shots[0].chain, expect.chain, `${id} 弹道 chain`);
  }
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
    assert.equal(s.range, 300);
    assert.equal(s.pierce, 0);
    assert.equal(s.knockback, 120);
    assert.equal(s.aoe, 0);
    assert.equal(s.arc, false);
    assert.equal(s.chain, 0);
  }
});
