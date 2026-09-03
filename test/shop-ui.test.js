// test/shop-ui.test.js —— showShop 渲染链路（catalogFor 接线回归）。
// 背景：2026-08-15 商店不唤出事故——ui/shop.js 丢失 catalogFor import，
// showShop 运行时抛 ReferenceError 并冻结 rAF 循环。此用例在 Node 下用
// 最小 DOM mock 持久锁定该链路。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// —— 最小 DOM mock（仅 showShop 所需表面）——
function fakeCanvasContext() {
  return new Proxy({}, {
    get: (_target, key) => (key === 'canvas' ? {} : () => {}),
    set: () => true,
  });
}

function mockDom() {
  const el = tag => {
    const node = {
      tagName: tag,
      className: '', textContent: '', innerHTML: '', _kids: [],
      dataset: {}, style: {}, hidden: false,
      appendChild(child) { this._kids.push(child); child.parentNode = this; },
      prepend(child) { this._kids.unshift(child); child.parentNode = this; },
      addEventListener() {},
      setAttribute(name, value) { this[name] = String(value); },
      classList: { add() {}, remove() {}, contains() { return false; } },
      replaceChildren(...ns) { this._kids = ns; for (const n of ns) n.parentNode = this; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
    if (tag === 'canvas') node.getContext = () => fakeCanvasContext();
    return node;
  };
  const root = el('div');
  const doc = {
    body: el('body'),
    getElementById: id => (id === 'shop' ? root : null),
    createElement: tag => el(tag),
    querySelectorAll: () => [],
  };
  root.ownerDocument = doc;
  return { root, doc };
}

function flatten(node) {
  return [node, ...node._kids.flatMap(child => flatten(child))];
}

let savedDocument;
before(() => { savedDocument = globalThis.document; });
after(() => { globalThis.document = savedDocument; });

test('showShop：走近商店链路不抛错且渲染出分组条目（catalogFor 接线回归）', async () => {
  const { root, doc } = mockDom();
  globalThis.document = doc;
  const { showShop } = await import('../src/ui/shop.js');
  const { createWeapon } = await import('../src/entities/weapon.js');
  const { createInventory } = await import('../src/systems/inventory.js');
  const { createAux } = await import('../src/entities/companions.js');

  const game = {
    coins: 500,
    weapon: createWeapon('pistol'),
    inventory: createInventory(),
    aux: createAux(),
    turretEnhance: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
    wallEnhance: { hp: 0 },
    weaponBought: 0,
    itemBought: {},
    tierRemaining: 120,
  };

  let bought = null;
  assert.doesNotThrow(() => {
    showShop(root, game, {
      onBuy: e => { bought = e; },
      onEarlyTier: () => {},
      onClose: () => {},
    });
  }, 'showShop 渲染链路（catalogFor import）不得抛 ReferenceError');

  // 根节点应被填充分组内容（head/build/groups/button 四个子节点）
  assert.ok(root._kids.length >= 3, `面板子节点 ${root._kids.length} 应 ≥3`);
  const groupsWrap = root._kids[2]; // wrap.shop-groups
  assert.ok(groupsWrap._kids.length >= 5, `分组行 ${groupsWrap._kids.length} 应 ≥5（武器强化/更换武器/辅助武器/辅助强化/道具）`);
});

test('showShop：图标进入卡片，货币图标存在，未拥有辅助强化整行置灰', async () => {
  const { root, doc } = mockDom();
  globalThis.document = doc;
  const { showShop } = await import('../src/ui/shop.js');
  const { createWeapon } = await import('../src/entities/weapon.js');
  const { createInventory } = await import('../src/systems/inventory.js');
  const { createAux } = await import('../src/entities/companions.js');

  const game = {
    coins: 500,
    weapon: createWeapon('pistol'),
    inventory: createInventory(),
    aux: createAux(),
    turretEnhance: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
    wallEnhance: { hp: 0 },
    weaponBought: 0,
    itemBought: {},
    tierRemaining: 120,
  };

  showShop(root, game, { onBuy() {}, onEarlyTier() {}, onClose() {} });
  const nodes = flatten(root);
  assert.ok(nodes.some(n => n.dataset.visualId === 'icon.item.medkit'));
  assert.ok(nodes.some(n => n.dataset.visualId === 'icon.currency.silver'));
  assert.ok(nodes.some(n => n.className === 'shop-row aux-unowned'));
  assert.ok(nodes.filter(n => n.className === 'shop-row aux-unowned').length >= 3);
  const medkit = nodes.find(n => n.dataset.visualId === 'icon.item.medkit');
  assert.ok(medkit);
  assert.equal(medkit.dataset.tooltipName, '医疗包');
  assert.equal(medkit.dataset.tooltipDescription, '立即回复 50% HP');
  assert.equal(medkit.dataset.tooltipValue, '30 银币');
});

test('upgradeView：保留局外等级计算并提供武器图标', async () => {
  const { upgradeView } = await import('../src/ui/upgrades.js');
  const { WEAPONS } = await import('../src/config/bestiary/weapons.js');
  const v = upgradeView(WEAPONS.pistol, { gold: 100, weaponLevels: {} });
  assert.equal(v.id, 'pistol');
  assert.equal(v.icon, 'icon.weapon.pistol');
  assert.equal(v.level, 0);
  assert.equal(v.maxed, false);
  assert.equal(v.price, 40);
  assert.equal(v.currentDamage, 12);
  assert.equal(v.nextDamage, 14.4);
  assert.equal(v.disabled, false);
});
