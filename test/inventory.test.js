// test/inventory.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInventory, addItem, useItem, itemCount } from '../src/systems/inventory.js';
import { ITEM_IDS, ITEMS } from '../src/config/items.js';

test('createInventory 三道具数量为 0，实例互不共享', () => {
  const a = createInventory();
  assert.deepEqual(a, { medkit: 0, magnet: 0, bomb: 0 });
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
});

test('useItem：数量>0 才扣减并返回 true；空后返回 false 不为负', () => {
  const inv = createInventory();
  addItem(inv, 'magnet', 2);
  assert.equal(useItem(inv, 'magnet'), true);
  assert.equal(useItem(inv, 'magnet'), true);
  assert.equal(itemCount(inv, 'magnet'), 0);
  assert.equal(useItem(inv, 'magnet'), false);
  assert.equal(itemCount(inv, 'magnet'), 0);
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
  assert.deepEqual(ITEM_IDS, ['medkit', 'magnet', 'bomb']);
  for (const id of ITEM_IDS) {
    assert.equal(ITEMS[id].id, id);
    assert.equal(itemCount(createInventory(), id), 0);
  }
  // key 升序：1 < 2 < 3
  const keys = ITEM_IDS.map(id => ITEMS[id].key);
  assert.deepEqual(keys, [1, 2, 3]);
});
