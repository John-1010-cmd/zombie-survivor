// test/bestiary.test.js —— 图鉴数据完整性（设计 §4.1/§5 字段契约）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, MAX_ZOMBIE_R, playableMonsters } from '../src/config/bestiary/monsters.js';
import { DIFFICULTY_TIERS } from '../src/config/difficulty.js';
import { WEAPONS, SPECIAL_STATS } from '../src/config/bestiary/weapons.js';
import { weaponUpgradePrice } from '../src/config/economy.js';
import { monsterView, weaponView } from '../src/ui/bestiary.js';
import { SHAPES } from '../src/entities/render.js';

test('怪物清单 5 条：normal/fast/tank/boss/exploder，字段契约齐全', () => {
  assert.deepEqual(Object.keys(MONSTERS).sort(), ['boss', 'exploder', 'fast', 'normal', 'tank']);
  for (const m of Object.values(MONSTERS)) {
    for (const f of ['hp', 'speed', 'damage', 'coin', 'radius', 'cost'])
      assert.ok(m[f] > 0, `${m.id}.${f} 应为正数`);
    assert.ok(m.knockbackResist >= 0 && m.knockbackResist < 1, `${m.id}.knockbackResist`);
    assert.ok(typeof m.name === 'string' && m.name, `${m.id} 缺名称`);
    assert.ok(typeof m.desc === 'string' && m.desc, `${m.id} 缺图鉴描述`);
    assert.ok(m.visual && typeof m.visual.shape === 'string' && typeof m.visual.color === 'string',
      `${m.id} 缺 visual.shape/color`);
    assert.ok(m.behavior === null || typeof m.behavior === 'string', `${m.id}.behavior`);
    assert.equal(m.id in MONSTERS && MONSTERS[m.id] === m, true);
  }
});

test('迁移数值与旧版一致（normal/fast/tank/boss）', () => {
  assert.deepEqual(
    (({ id, name, hp, speed, damage, coin, radius, knockbackResist, cost }) =>
      ({ id, name, hp, speed, damage, coin, radius, knockbackResist, cost }))(MONSTERS.boss),
    { id: 'boss', name: '守门Boss', hp: 7040, speed: 20, damage: 40, coin: 50, radius: 41, knockbackResist: 0.95, cost: 999 },
  );
  assert.equal(MONSTERS.normal.hp, 30);
  assert.equal(MONSTERS.fast.speed, 140);
  assert.equal(MONSTERS.tank.cost, 6);
});

test('自爆僵尸条目：behavior=exploder、aoe 30/80、cost 2', () => {
  const e = MONSTERS.exploder;
  assert.equal(e.behavior, 'exploder');
  assert.deepEqual(e.aoe, { damage: 30, radius: 80 });
  assert.equal(e.cost, 2);
});

test('boss 标记 special；playableMonsters 默认排除 special、includeSpecial 包含（图鉴界面数据源，设计 §4.1/§7）', () => {
  assert.equal(MONSTERS.boss.special, true);
  assert.ok(!MONSTERS.normal.special && !MONSTERS.exploder.special);
  assert.deepEqual(playableMonsters().map(m => m.id).sort(), ['exploder', 'fast', 'normal', 'tank']);
  assert.deepEqual(playableMonsters({ includeSpecial: true }).map(m => m.id).sort(),
    ['boss', 'exploder', 'fast', 'normal', 'tank']);
});

test('武器清单 7 条（6 迁移 + sniperRifle），必填字段契约齐全', () => {
  const ids = ['pistol', 'rifle', 'mg', 'rocket', 'grenade', 'tesla', 'sniperRifle'];
  assert.deepEqual(Object.keys(WEAPONS).sort(), [...ids].sort());
  for (const w of Object.values(WEAPONS)) {
    for (const f of ['id', 'name', 'desc', 'damage', 'fireRate', 'projectileSpeed', 'range',
      'projectiles', 'spread', 'pierce', 'aoe', 'arc', 'chain', 'knockback',
      'burst', 'burstInterval', 'basePrice', 'visual'])
      assert.ok(f in w, `${w.id} 缺必填字段 ${f}`);
    // 数值字段应为有限数值且 ≥ 0（arc 是布尔，不在其列）——Task 8 契约校验加固
    for (const f of ['damage', 'fireRate', 'projectileSpeed', 'range',
      'projectiles', 'spread', 'pierce', 'aoe', 'chain', 'knockback',
      'burst', 'burstInterval', 'basePrice'])
      assert.ok(Number.isFinite(w[f]) && w[f] >= 0, `${w.id}.${f} 应为有限数值且 ≥ 0`);
    for (const f of ['bulletShape', 'color', 'trail', 'hitParticles', 'muzzleGlow'])
      assert.ok(f in w.visual, `${w.id}.visual 缺 ${f}`);
  }
  // 迁移数值抽检 + 基价并入
  assert.equal(WEAPONS.pistol.damage, 12);
  assert.equal(WEAPONS.grenade.arc, true);
  assert.equal(WEAPONS.tesla.chain, 3);
  assert.equal(WEAPONS.pistol.basePrice, 40);
  assert.equal(WEAPONS.tesla.basePrice, 250);
  // 新武器：狙击枪（纯数值验证零代码新增）
  const s = WEAPONS.sniperRifle;
  assert.equal(s.damage, 60);
  assert.equal(s.pierce, 5);
  assert.equal(s.knockback, 200);
  assert.equal(s.basePrice, 200);
  // 专属维随图鉴迁入
  assert.deepEqual(SPECIAL_STATS, {
    grenade: ['fragCount', 'fragDamage'],
    tesla: ['chainLen', 'chainDmg'],
  });
});

test('武器局外升级价：round5(40×1.5^lv)，0→10 累计 4540', () => {
  assert.equal(weaponUpgradePrice(0), 40);
  assert.equal(weaponUpgradePrice(1), 60);
  assert.equal(weaponUpgradePrice(4), 205);
  assert.equal(weaponUpgradePrice(9), 1540);
  let sum = 0;
  for (let lv = 0; lv < 10; lv++) sum += weaponUpgradePrice(lv);
  assert.equal(sum, 4540);
});

test('难度表 weights 引用的怪物都存在（含无尽档 5 起的 exploder）', () => {
  for (const t of DIFFICULTY_TIERS)
    for (const id of Object.keys(t.weights)) assert.ok(MONSTERS[id], `档 ${t.tier} 引用未知怪物 ${id}`);
  for (const t of DIFFICULTY_TIERS.slice(4)) assert.ok(t.weights.exploder > 0, `档 ${t.tier} 应含 exploder`);
  assert.ok(MAX_ZOMBIE_R >= 41); // 不小于守门 Boss 半径
});

// —— 图鉴界面视图模型（设计 §7）——
test('怪物条目：未击杀 → ??? 占位；首次击杀 → 解锁（名称/描述/基础数值/累计击杀）', () => {
  const locked = monsterView(MONSTERS.exploder, {});
  assert.equal(locked.unlocked, false);
  assert.equal(locked.name, '???');
  const seen = monsterView(MONSTERS.exploder, { exploder: 1 });
  assert.equal(seen.unlocked, true);
  assert.equal(seen.name, '自爆僵尸');
  assert.equal(seen.kills, 1);
  assert.equal(seen.stats.hp, 40); // 图鉴基础值（关卡 1、局内 0 分钟口径）
});

test('武器条目：全部可见，携带局外等级与下一级提升', () => {
  const v = weaponView(WEAPONS.pistol, {});
  assert.equal(v.level, 0);
  assert.equal(v.maxed, false);
  assert.ok(Math.abs(v.nextDamage - 12 * 1.2) < 1e-9); // 每级 +20% 图鉴基础
  const maxed = weaponView(WEAPONS.pistol, { pistol: 10 });
  assert.equal(maxed.maxed, true);
});

// —— 形状注册表（设计 §9.1）：图鉴 visual.shape 必须已注册（只断言键存在，不测绘制）——
test('每个怪物的 visual.shape 都已注册画法', () => {
  for (const m of Object.values(MONSTERS))
    assert.ok(SHAPES[m.visual.shape], `${m.id}.visual.shape=${m.visual.shape} 未在 render.js 注册`);
  // 五种形状齐全
  assert.deepEqual(Object.keys(SHAPES).sort(), ['circle', 'diamond', 'hexagon', 'pentagon', 'triangle']);
});
