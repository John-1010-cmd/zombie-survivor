// test/inventory.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInventory, addItem, useItem, itemCount } from '../src/systems/inventory.js';
import { ITEM_IDS, ITEMS } from '../src/config/items.js';

test('createInventory 五道具数量为 0，实例互不共享', () => {
  const a = createInventory();
  assert.deepEqual(a, { medkit: 0, magnet: 0, bomb: 0, turret: 0, wall: 0 });
  const b = createInventory();
  a.medkit = 5;
  assert.equal(b.medkit, 0);
});

test('addItem 默认加 1，可指定数量，可多次累加', () => {
  const inv = createInventory();
  addItem(inv, 'medkit');
  assert.equal(itemCount(inv, 'medkit'), 1);
  addItem(inv, 'medkit', 2);
  assert.equal(itemCount(inv, 'medkit'), 3);
  addItem(inv, 'bomb', 5);
  assert.equal(itemCount(inv, 'bomb'), 5);
  assert.equal(itemCount(inv, 'magnet'), 0);
  addItem(inv, 'turret');
  assert.equal(itemCount(inv, 'turret'), 1);
  addItem(inv, 'wall', 2);
  assert.equal(itemCount(inv, 'wall'), 2);
});

test('useItem：数量>0 才扣减并返回 true；空后返回 false 不为负', () => {
  const inv = createInventory();
  addItem(inv, 'magnet', 2);
  assert.equal(useItem(inv, 'magnet'), true);
  assert.equal(useItem(inv, 'magnet'), true);
  assert.equal(itemCount(inv, 'magnet'), 0);
  assert.equal(useItem(inv, 'magnet'), false);
  assert.equal(itemCount(inv, 'magnet'), 0);
  assert.equal(useItem(inv, 'wall'), false);
  addItem(inv, 'wall');
  assert.equal(useItem(inv, 'wall'), true);
  assert.equal(itemCount(inv, 'wall'), 0);
});

test('itemCount 初始为 0，随 add/use 变化', () => {
  const inv = createInventory();
  assert.equal(itemCount(inv, 'medkit'), 0);
  addItem(inv, 'medkit', 1);
  assert.equal(itemCount(inv, 'medkit'), 1);
  useItem(inv, 'medkit');
  assert.equal(itemCount(inv, 'medkit'), 0);
});

test('ITEMS 定义与 ITEM_IDS 按 key 升序一致', () => {
  assert.deepEqual(ITEM_IDS, ['medkit', 'magnet', 'bomb', 'turret', 'wall']);
  for (const id of ITEM_IDS) {
    assert.equal(ITEMS[id].id, id);
    assert.equal(itemCount(createInventory(), id), 0);
  }
  // key 升序：1 < 2 < 3 < 4 < 5
  const keys = ITEM_IDS.map(id => ITEMS[id].key);
  assert.deepEqual(keys, [1, 2, 3, 4, 5]);
});

test('turret/wall 条目字段与键位', () => {
  assert.equal(ITEMS.turret.name, '固定火炮');
  assert.equal(ITEMS.turret.key, 4);
  assert.ok(ITEMS.turret.desc.includes('耐久200'));
  assert.equal(ITEMS.wall.name, '围墙');
  assert.equal(ITEMS.wall.key, 5);
  assert.ok(ITEMS.wall.desc.includes('8段'));
});
