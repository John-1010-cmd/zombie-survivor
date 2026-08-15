// test/shop-ui.test.js —— showShop 渲染链路（catalogFor 接线回归）。
// 背景：2026-08-15 商店不唤出事故——ui/shop.js 丢失 catalogFor import，
// showShop 运行时抛 ReferenceError 并冻结 rAF 循环。此用例在 Node 下用
// 最小 DOM mock 持久锁定该链路。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// —— 最小 DOM mock（仅 showShop 所需表面）——
function mockDom() {
  const el = () => ({
    className: '', textContent: '', innerHTML: '', _kids: [],
    appendChild(n) { this._kids.push(n); },
    addEventListener() {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    replaceChildren(...ns) { this._kids = ns; },
    querySelector() { return null; },
  });
  const root = el();
  const doc = {
    getElementById: id => (id === 'shop' ? root : null),
    createElement: el,
    querySelectorAll: () => [],
  };
  return { root, doc };
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
