// test/shop.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogFor, buy } from '../src/systems/shop.js';
import { createWeapon } from '../src/entities/weapon.js';
import { createInventory, itemCount } from '../src/systems/inventory.js';
import { enhancePrice, earlyTierBonus } from '../src/config/economy.js';
import { WEAPON_MAX_LEVEL } from '../src/config/weapons.js';

function makeGame(coins = 1000, weaponId = 'pistol') {
  return { coins, weapon: createWeapon(weaponId), inventory: createInventory() };
}

test('catalogFor 初始目录：4 增强 + 2 武器 + 3 道具 + 1 earlyTier', () => {
  const entries = catalogFor(makeGame(), 150);
  const enhance = entries.filter(e => e.kind === 'enhance');
  const weapons = entries.filter(e => e.kind === 'weapon');
  const items = entries.filter(e => e.kind === 'item');
  const early = entries.filter(e => e.kind === 'earlyTier');

  assert.equal(enhance.length, 4);
  assert.deepEqual(enhance.map(e => e.stat), ['damage', 'fireRate', 'projectiles', 'range']);
  for (const e of enhance) {
    assert.equal(e.owned, 0);
    assert.equal(e.price, enhancePrice(0));
  }
  assert.deepEqual(weapons.map(e => e.weapon).sort(), ['mg', 'rifle']);
  for (const e of weapons) assert.equal(e.price, 80);
  assert.deepEqual(items.map(e => e.item).sort(), ['bomb', 'magnet', 'medkit']);
  assert.deepEqual(items.map(e => e.price).sort((a, b) => a - b), [25, 30, 50]);
  assert.equal(early.length, 1);
  assert.equal(early[0].bonus, earlyTierBonus(150));
});

test('enhance 价格随已购总次数递增（owned 同步）', () => {
  const g = makeGame();
  let entries = catalogFor(g, 0);
  for (let i = 0; i < 3; i++) {
    assert.equal(buy(g, entries.find(e => e.kind === 'enhance')), true);
    entries = catalogFor(g, 0);
  }
  const enhance = entries.find(e => e.kind === 'enhance');
  assert.equal(enhance.owned, 3);
  assert.equal(enhance.price, enhancePrice(3));
});

test('武器满级后目录不再产出 enhance 条目', () => {
  const g = makeGame();
  for (let i = 1; i < WEAPON_MAX_LEVEL; i++) {
    assert.equal(buy(g, { kind: 'enhance', stat: 'damage', price: 1, owned: i - 1 }), true);
  }
  assert.equal(g.weapon.level, WEAPON_MAX_LEVEL);
  const entries = catalogFor(g, 0);
  assert.equal(entries.filter(e => e.kind === 'enhance').length, 0);
  assert.ok(entries.some(e => e.kind === 'weapon'));
  assert.ok(entries.some(e => e.kind === 'item'));
  assert.ok(entries.some(e => e.kind === 'earlyTier'));
});

test('weapon 条目排除当前武器', () => {
  const entries = catalogFor(makeGame(1000, 'mg'), 0);
  const weapons = entries.filter(e => e.kind === 'weapon');
  assert.deepEqual(weapons.map(e => e.weapon).sort(), ['rifle']);
});

test('earlyTier 在 bonus=0 时仍列出', () => {
  const entries = catalogFor(makeGame(), 0);
  const early = entries.filter(e => e.kind === 'earlyTier');
  assert.equal(early.length, 1);
  assert.equal(early[0].bonus, 0);
});

test('buy：余额不足返回 false 且无副作用', () => {
  const g = makeGame(10);
  assert.equal(buy(g, { kind: 'item', item: 'medkit', price: 30 }), false);
  assert.equal(g.coins, 10);
  assert.equal(itemCount(g.inventory, 'medkit'), 0);
});

test('buy enhance：扣款并提升武器，增强生效', () => {
  const g = makeGame(100);
  assert.equal(buy(g, { kind: 'enhance', stat: 'damage', price: 40, owned: 0 }), true);
  assert.equal(g.coins, 60);
  assert.equal(g.weapon.enhance.damage, 1);
  assert.equal(g.weapon.level, 2);
});

test('buy enhance：已满级返回 false 且不扣款', () => {
  const g = makeGame(1000);
  for (let i = 1; i < WEAPON_MAX_LEVEL; i++) {
    g.weapon.enhance.damage += 1;
    g.weapon.level += 1;
  }
  const before = g.coins;
  assert.equal(buy(g, { kind: 'enhance', stat: 'range', price: 1000, owned: 7 }), false);
  assert.equal(g.coins, before);
  assert.equal(g.weapon.enhance.range, 0);
  assert.equal(g.weapon.level, WEAPON_MAX_LEVEL);
});

test('buy weapon：替换武器（增强清零、等级重置）并扣款', () => {
  const g = makeGame(100, 'pistol');
  g.weapon.enhance.damage = 3;
  g.weapon.level = 4;
  assert.equal(buy(g, { kind: 'weapon', weapon: 'rifle', price: 80 }), true);
  assert.equal(g.coins, 20);
  assert.equal(g.weapon.id, 'rifle');
  assert.equal(g.weapon.level, 1);
  assert.equal(g.weapon.enhance.damage, 0);
});

test('buy item：扣款并入库 1 件', () => {
  const g = makeGame(50);
  assert.equal(buy(g, { kind: 'item', item: 'bomb', price: 50 }), true);
  assert.equal(g.coins, 0);
  assert.equal(itemCount(g.inventory, 'bomb'), 1);
});

test('earlyTier 不经 buy：返回 false 且无副作用', () => {
  const g = makeGame(999);
  assert.equal(buy(g, { kind: 'earlyTier', bonus: 25 }), false);
  assert.equal(g.coins, 999);
  assert.equal(g.weapon.level, 1);
});
