// test/shop-ui.test.js —— showShop 图标/manifest/tooltip 渲染链路。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_BY_ID } from '../src/config/assets.js';

function mockDom() {
  const el = (tag = 'div') => ({
    tagName: tag.toUpperCase(),
    className: '', textContent: '', innerHTML: '', _kids: [], dataset: {},
    appendChild(n) { this._kids.push(n); n.parentNode = this; },
    prepend(n) { this._kids.unshift(n); n.parentNode = this; },
    addEventListener() {},
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name] ?? null; },
    replaceWith() {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    replaceChildren(...ns) { this._kids = ns; for (const n of ns) n.parentNode = this; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const root = el('div');
  const doc = {
    getElementById: id => (id === 'shop' ? root : null),
    createElement: el,
    querySelectorAll: () => [],
  };
  return { root, doc };
}

function collectHtml(node) {
  const attrs = [];
  if (node.dataset) {
    for (const [k, v] of Object.entries(node.dataset)) {
      const attrName = 'data-' + k.replace(/([A-Z])/g, '-$1').toLowerCase();
      attrs.push(`${attrName}="${v}"`);
      if (k === 'tooltipName' || k === 'tooltip') {
        attrs.push(`data-tooltip="${v}"`);
      }
    }
  }
  const tagOpen = attrs.length > 0 ? `<${node.tagName || 'div'} ${attrs.join(' ')}>` : '';
  const tagClose = attrs.length > 0 ? `</${node.tagName || 'div'}>` : '';
  return [tagOpen, node.innerHTML, ...node._kids.flatMap(collectHtml), tagClose].join('\n');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let savedDocument;
before(() => { savedDocument = globalThis.document; });
after(() => { globalThis.document = savedDocument; });

test('showShop：分组链路渲染图标，所有 data-visual-id 都来自 ASSET_BY_ID', async () => {
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
  }, 'showShop 渲染链路不得抛错');
  assert.equal(bought, null);

  assert.ok(root._kids.length >= 3, `面板子节点 ${root._kids.length} 应 ≥3`);
  const groupsWrap = root._kids[2];
  assert.ok(groupsWrap._kids.length >= 4, `分组行 ${groupsWrap._kids.length} 应 ≥4`);

  const html = collectHtml(root);
  const ids = [...html.matchAll(/data-visual-id=["']([^"']+)["']/g)].map(m => m[1]);
  assert.ok(ids.length >= 5, `商店至少应渲染 5 个图标节点，实际 ${ids.length}`);
  for (const id of ids) assert.ok(ASSET_BY_ID[id], `${id} 不在 ASSET_BY_ID`);
  for (const id of [
    'icon.currency.silver', 'icon.weapon.pistol',
    'icon.aux.drone', 'icon.enhance.damage', 'icon.item.medkit',
  ]) {
    assert.ok(ASSET_BY_ID[id], `${id} 必须先登记 manifest`);
    assert.match(html, new RegExp(`data-visual-id=["']${escapeRegExp(id)}["']`), `${id} 未显示`);
  }
  assert.ok((html.match(/data-tooltip=/g) || []).length >= 6, '商店条目必须覆盖 tooltip');
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
