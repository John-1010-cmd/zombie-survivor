import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { WEAPONS, WEAPON_MAX_LEVEL } from '../src/config/weapons.js';
import { createWeapon } from '../src/entities/weapon.js';
import { xpNeed, addXp, drawCards, applyCard } from '../src/systems/progression.js';

test('xpNeed 曲线：10、17、24、31', () => {
  assert.equal(xpNeed(1), 10);
  assert.equal(xpNeed(2), 17);
  assert.equal(xpNeed(3), 24);
  assert.equal(xpNeed(4), 31);
});

test('一次加 100 经验连升多级且返回正确次数', () => {
  const p = { xp: 0, level: 1 };
  const n = addXp(p, 100);
  assert.equal(n, 4); // 10 + 17 + 24 + 31 = 82，余 18 不足第 5 级所需 38
  assert.equal(p.level, 5);
  assert.equal(p.xp, 18);
});

test('经验恰好达到所需时正好升一级，余量归零', () => {
  const p = { xp: 0, level: 1 };
  assert.equal(addXp(p, xpNeed(1)), 1);
  assert.equal(p.level, 2);
  assert.equal(p.xp, 0);
});

test('drawCards 恒返回 4 张，非 heal 卡按 type+stat/weapon 判重不重复', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const cards = drawCards(createWeapon('pistol'), mulberry32(seed));
    assert.equal(cards.length, 4);
    const keys = cards
      .filter(c => c.type !== 'heal')
      .map(c => c.type + ':' + (c.stat || c.weapon));
    assert.equal(new Set(keys).size, keys.length, `seed=${seed} 出现重复卡 ${JSON.stringify(cards)}`);
  }
});

test('同种子抽卡结果可复现', () => {
  const a = drawCards(createWeapon('rifle'), mulberry32(7));
  const b = drawCards(createWeapon('rifle'), mulberry32(7));
  assert.deepEqual(a, b);
});

test('weapon.level=8 时池里无 enhance 卡，heal 补足 2 张', () => {
  const w = createWeapon('pistol');
  w.level = WEAPON_MAX_LEVEL;
  const cards = drawCards(w, mulberry32(1));
  assert.equal(cards.length, 4);
  assert.equal(cards.filter(c => c.type === 'enhance').length, 0);
  assert.equal(cards.filter(c => c.type === 'swap').length, 2); // rifle + mg
  assert.equal(cards.filter(c => c.type === 'heal').length, 2);
});

test('只有 1 种武器可换时 4 张中含 heal 填充', () => {
  const saved = WEAPONS.mg;
  delete WEAPONS.mg; // 本进程内临时只剩 rifle 可换，finally 恢复
  try {
    const w = createWeapon('pistol');
    w.level = WEAPON_MAX_LEVEL; // 满级 → 池内仅 1 张 swap
    const cards = drawCards(w, mulberry32(1));
    assert.equal(cards.length, 4);
    assert.equal(cards.filter(c => c.type === 'swap').length, 1);
    assert.equal(cards.filter(c => c.type === 'heal').length, 3);
  } finally {
    WEAPONS.mg = saved;
  }
});

test('applyCard swap 后 weapon 为目标 id 且 level=1', () => {
  const game = { player: { hp: 50, maxHp: 100 }, weapon: createWeapon('pistol') };
  applyCard(game, { type: 'swap', weapon: 'mg' });
  assert.equal(game.weapon.id, 'mg');
  assert.equal(game.weapon.level, 1);
});

test('applyCard enhance 使当前武器等级 +1（spec §4.2）', () => {
  const game = { player: { hp: 100, maxHp: 100 }, weapon: createWeapon('pistol') };
  applyCard(game, { type: 'enhance', stat: 'damage' });
  assert.equal(game.weapon.id, 'pistol');
  assert.equal(game.weapon.level, 2);
});

test('applyCard heal 回 maxHp 的 50%，且不超过 maxHp', () => {
  const g1 = { player: { hp: 40, maxHp: 100 }, weapon: null };
  applyCard(g1, { type: 'heal' });
  assert.equal(g1.player.hp, 90);
  const g2 = { player: { hp: 90, maxHp: 100 }, weapon: null };
  applyCard(g2, { type: 'heal' });
  assert.equal(g2.player.hp, 100);
});
