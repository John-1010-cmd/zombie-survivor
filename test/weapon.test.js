// test/weapon.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { createWeapon, weaponStats, applyEnhancement, updateWeapon } from '../src/entities/weapon.js';
import { WEAPONS, WEAPON_MAX_LEVEL, STAT_MAX, STAT_LABEL, SPECIAL_STATS } from '../src/config/bestiary/weapons.js';

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

test('createWeapon 不再有 level 字段，enhance 八维归零（四维+四专属维）', () => {
  const w = createWeapon('pistol');
  assert.ok(!('level' in w), 'level 字段已删除');
  assert.deepEqual(w.enhance, {
    damage: 0, fireRate: 0, projectiles: 0, range: 0,
    fragCount: 0, fragDamage: 0, chainLen: 0, chainDmg: 0,
  });
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

test('七武器表：schema 齐全且数值与裁定一致（含新字段与射程下调）', () => {
  const ids = ['pistol', 'rifle', 'mg', 'rocket', 'grenade', 'tesla', 'sniperRifle'];
  assert.deepEqual(Object.keys(WEAPONS).sort(), [...ids].sort());
  const expect = {
    pistol:  { damage: 12, fireRate: 2.0, projectileSpeed: 500, range: 300, aoe: 0,   arc: false, chain: 0 },
    rifle:   { damage: 9,  fireRate: 1.4, projectileSpeed: 600, range: 320, aoe: 0,   arc: false, chain: 0 },
    mg:      { damage: 5,  fireRate: 8,   projectileSpeed: 550, range: 280, aoe: 0,   arc: false, chain: 0 },
    rocket:  { damage: 30, fireRate: 0.7, projectileSpeed: 350, range: 350, aoe: 90,  arc: false, chain: 0 },
    grenade: { damage: 25, fireRate: 0.6, projectileSpeed: 420, range: 330, aoe: 130, arc: true,  chain: 0 },
    tesla:   { damage: 14, fireRate: 1.2, projectileSpeed: 800, range: 260, aoe: 0,   arc: false, chain: 3 },
    sniperRifle: { damage: 60, fireRate: 0.5, projectileSpeed: 1200, range: 600, aoe: 0, arc: false, chain: 0 },
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

test('STAT_MAX / 既有常量', () => {
  assert.equal(STAT_MAX, 8);
  assert.equal(WEAPON_MAX_LEVEL, 8);
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

// ---------- 迭代05：专属维强化（fragCount/fragDamage/chainLen/chainDmg）----------

test('专属维强化：applyEnhancement 通用（STAT_MAX 上限、未知 stat 忽略）', () => {
  const w = createWeapon('tesla');
  applyEnhancement(w, 'fragCount');
  applyEnhancement(w, 'chainLen');
  assert.equal(w.enhance.fragCount, 1);
  assert.equal(w.enhance.chainLen, 1);
  applyEnhancement(w, 'bogus'); // 未知 stat：忽略，不产生 NaN 脏数据
  assert.equal(w.enhance.bogus, undefined);
  assert.equal(w.enhance.damage, 0);
  for (let i = 0; i < STAT_MAX; i++) applyEnhancement(w, 'fragCount');
  assert.equal(w.enhance.fragCount, STAT_MAX); // 满维后忽略
  applyEnhancement(w, 'fragCount');
  assert.equal(w.enhance.fragCount, STAT_MAX);
});

test('weaponStats 专属派生字段：fragCount/fragDmgMult/chainLen/chainDmgMult 随强化联动', () => {
  const w = createWeapon('grenade');
  let s = weaponStats(w);
  assert.equal(s.fragCount, 8); // 8 + 2×0
  assert.equal(s.fragDmgMult, 0.4); // 0.4×1.15^0
  assert.equal(s.chainLen, 3); // 3 + 0
  assert.equal(s.chainDmgMult, 1); // 1 + 0.05×0
  for (let i = 0; i < 4; i++) applyEnhancement(w, 'fragCount');
  for (let i = 0; i < 2; i++) applyEnhancement(w, 'fragDamage');
  applyEnhancement(w, 'chainLen');
  for (let i = 0; i < 2; i++) applyEnhancement(w, 'chainDmg');
  s = weaponStats(w);
  assert.equal(s.fragCount, 16); // 8+2×4
  assert.equal(s.fragDmgMult, 0.4 * Math.pow(1.15, 2));
  assert.equal(s.chainLen, 4); // 3+1
  assert.equal(s.chainDmgMult, 1 + 0.05 * 2);
  for (let i = 0; i < 4; i++) applyEnhancement(w, 'fragCount'); // 补满 8
  assert.equal(weaponStats(w).fragCount, 24); // 上限 24
});

test('grenade 开火弹带 frags（count=fragCount、dmg=主伤×fragDmgMult）；无专属维=8 发/40% 主伤', () => {
  const rng = mulberry32(7);
  const w = createWeapon('grenade');
  const owner = { x: 0, y: 0 };
  const z = { x: 200, y: 0, alive: true };
  const shots = [];
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.deepEqual(shots[0].frags, { count: 8, dmg: 25 * 0.4 });
  assert.equal(shots[0].aoe, 130); // 既有 aoe 不受影响
});

test('grenade 专属强化后 frags 数值联动（count 16、dmg×1.15²）', () => {
  const rng = mulberry32(8);
  const w = createWeapon('grenade');
  for (let i = 0; i < 4; i++) applyEnhancement(w, 'fragCount');
  for (let i = 0; i < 2; i++) applyEnhancement(w, 'fragDamage');
  const owner = { x: 0, y: 0 };
  const z = { x: 200, y: 0, alive: true };
  const shots = [];
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots[0].frags.count, 16);
  assert.ok(Math.abs(shots[0].frags.dmg - 25 * 0.4 * Math.pow(1.15, 2)) < 1e-9);
});

test('tesla 开火弹带 chain=chainLen、chainMult=0.8、chainDmgMult；专属强化联动', () => {
  const rng = mulberry32(9);
  const w = createWeapon('tesla');
  for (let i = 0; i < 2; i++) applyEnhancement(w, 'chainLen');
  applyEnhancement(w, 'chainDmg');
  const owner = { x: 0, y: 0 };
  const z = { x: 200, y: 0, alive: true };
  const shots = [];
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].chain, 5); // 3 + 2
  assert.equal(shots[0].chainMult, 0.8);
  assert.equal(shots[0].chainDmgMult, 1.05); // 1 + 0.05×1
});

test('非 grenade/tesla 弹不带 frags/chainMult/chainDmgMult', () => {
  const rng = mulberry32(10);
  const w = createWeapon('rocket');
  const owner = { x: 0, y: 0 };
  const z = { x: 200, y: 0, alive: true };
  const shots = [];
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots[0].frags, undefined);
  assert.equal(shots[0].chainMult, undefined);
  assert.equal(shots[0].chainDmgMult, undefined);
});

test('STAT_LABEL 增 4 专属维标签；SPECIAL_STATS 导出（grenade/tesla 各两条）', () => {
  assert.equal(STAT_LABEL.fragCount, '榴弹碎片 +2');
  assert.equal(STAT_LABEL.fragDamage, '二次伤害 +15%');
  assert.equal(STAT_LABEL.chainLen, '链路长度 +1');
  assert.equal(STAT_LABEL.chainDmg, '二次伤害 +5%');
  assert.deepEqual(SPECIAL_STATS, {
    grenade: ['fragCount', 'fragDamage'],
    tesla: ['chainLen', 'chainDmg'],
  });
});
