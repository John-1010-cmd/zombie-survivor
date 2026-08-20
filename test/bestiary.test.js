// test/bestiary.test.js —— 图鉴数据完整性（设计 §4.1/§5 字段契约）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, MAX_ZOMBIE_R, playableMonsters } from '../src/config/bestiary/monsters.js';
import { DIFFICULTY_TIERS } from '../src/config/difficulty.js';

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

test('难度表 weights 引用的怪物都存在（含无尽档 5 起的 exploder）', () => {
  for (const t of DIFFICULTY_TIERS)
    for (const id of Object.keys(t.weights)) assert.ok(MONSTERS[id], `档 ${t.tier} 引用未知怪物 ${id}`);
  for (const t of DIFFICULTY_TIERS.slice(4)) assert.ok(t.weights.exploder > 0, `档 ${t.tier} 应含 exploder`);
  assert.ok(MAX_ZOMBIE_R >= 41); // 不小于守门 Boss 半径
});
