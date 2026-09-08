import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMeta, addGold } from '../src/core/meta.js';
import { WEAPONS } from '../src/config/bestiary/weapons.js';
import { upgradeView, showUpgrades } from '../src/ui/upgrades.js';
import { showMenu } from '../src/ui/menu.js';
import { createGameScene } from '../src/game.js';

function mockDom() {
  const el = (tag = 'div') => {
    const node = {
      tagName: tag.toUpperCase(),
      className: '', textContent: '', _innerHTML: '', _kids: [], dataset: {},
      classList: {
        _classes: new Set(),
        add(...cs) { cs.forEach(c => this._classes.add(c)); },
        remove(...cs) { cs.forEach(c => this._classes.delete(c)); },
        contains(c) { return this._classes.has(c); },
        toggle(c) { if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c); },
      },
      appendChild(n) { this._kids.push(n); n.parentNode = this; },
      prepend(n) { this._kids.unshift(n); n.parentNode = this; },
      addEventListener(evt, fn) {
        this._listeners = this._listeners || {};
        this._listeners[evt] = this._listeners[evt] || [];
        this._listeners[evt].push(fn);
      },
      dispatchEvent(evt) {
        const fns = this._listeners?.[evt.type] || [];
        for (const fn of fns) fn(evt);
      },
      setAttribute(name, value) { this[name] = String(value); },
      getAttribute(name) { return this[name] ?? null; },
      replaceWith() {},
      replaceChildren(...ns) { this._kids = ns; for (const n of ns) n.parentNode = this; },
      set innerHTML(html) {
        this._innerHTML = html;
        this._kids = [];
        const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>/g;
        let match;
        while ((match = tagRegex.exec(html)) !== null) {
          const tagName = match[1];
          if (tagName.startsWith('/')) continue;
          const attrStr = match[2];
          const child = el(tagName);
          const attrRegex = /([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
            const attrName = attrMatch[1];
            const attrVal = attrMatch[2] ?? '';
            if (attrName === 'class') {
              child.className = attrVal;
              attrVal.split(/\s+/).filter(Boolean).forEach(c => child.classList.add(c));
            } else if (attrName === 'id') {
              child.id = attrVal;
            } else if (attrName.startsWith('data-')) {
              const camel = attrName.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
              child.dataset[camel] = attrVal;
            } else {
              child.setAttribute(attrName, attrVal);
            }
          }
          this._kids.push(child);
          child.parentNode = this;
        }
      },
      get innerHTML() {
        return this._innerHTML || '';
      },
      querySelector(sel) {
        const list = this.querySelectorAll(sel);
        return list.length > 0 ? list[0] : null;
      },
      querySelectorAll(sel) {
        const res = [];
        let match = () => false;
        if (sel.startsWith('#')) {
          const id = sel.slice(1);
          match = n => n.id === id;
        } else if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          match = n => n.classList?.contains(cls) || n.className?.split(/\s+/).includes(cls);
        } else if (sel.startsWith('[')) {
          const attr = sel.replace(/[\[\]]/g, '');
          match = n => Boolean(n.dataset?.[attr] || n.dataset?.[attr.replace('data-', '')] || n[attr] !== undefined || n.getAttribute(attr) !== null);
        }
        collectDeep(this, match, res);
        return res;
      },
    };
    return node;
  };

  function findDeep(node, predicate) {
    if (predicate(node)) return node;
    for (const k of node._kids || []) {
      const found = findDeep(k, predicate);
      if (found) return found;
    }
    return null;
  }
  function collectDeep(node, predicate, acc) {
    if (predicate(node)) acc.push(node);
    for (const k of node._kids || []) collectDeep(k, predicate, acc);
  }

  const root = el('div');
  const doc = {
    getElementById: id => (id === 'upgrades' ? root : null),
    createElement: el,
    querySelectorAll: () => [],
  };
  return { root, doc };
}

let savedDocument;
before(() => { savedDocument = globalThis.document; });
after(() => { globalThis.document = savedDocument; });

test('upgradeView：包含解锁状态、出战选中状态、价格与伤害计算', () => {
  const meta = defaultMeta(); // 只有 pistol 解锁，selected: 'pistol'
  meta.gold = 1000;

  // 手枪已解锁且出战中
  const pistolView = upgradeView(WEAPONS.pistol, meta);
  assert.equal(pistolView.id, 'pistol');
  assert.equal(pistolView.unlocked, true);
  assert.equal(pistolView.selected, true);
  assert.equal(pistolView.level, 0);
  assert.equal(pistolView.price, 40);
  assert.equal(pistolView.currentDamage, 12);
  assert.equal(pistolView.nextDamage, 14.4);
  assert.equal(pistolView.disabled, false);

  // 步枪未解锁，解锁价格 800 金币
  const rifleView = upgradeView(WEAPONS.rifle, meta);
  assert.equal(rifleView.id, 'rifle');
  assert.equal(rifleView.unlocked, false);
  assert.equal(rifleView.selected, false);
  assert.equal(rifleView.unlockPrice, 800);
  assert.equal(rifleView.currentDamage, 9);
  assert.equal(rifleView.disabled, false); // 余额 1000 >= 800 可解锁

  // 余额不足时未解锁武器 disabled = true
  meta.gold = 500;
  const poorRifleView = upgradeView(WEAPONS.rifle, meta);
  assert.equal(poorRifleView.disabled, true);
});

test('主菜单：按钮文案为「武器」', () => {
  const { root, doc } = mockDom();
  globalThis.document = doc;
  showMenu(root, null, {
    onAdventure: () => {},
    onEndless: () => {},
    onBestiary: () => {},
    onUpgrades: () => {},
    onSkins: () => {},
  });
  assert.match(root.innerHTML, /id="menu-upgrades"[^>]*>武器<\/button>/);
});

test('开局武器接入：createGameScene 读取 meta.weapons.selected 作为主武器', () => {
  const meta = defaultMeta();
  meta.weapons.owned.push('rifle');
  meta.weapons.selected = 'rifle';
  meta.weaponLevels.rifle = 2;

  const canvas = { clientWidth: 800, clientHeight: 600, width: 800, height: 600 };
  const scene = createGameScene({
    canvas,
    input: { onItem: () => {}, onEsc: () => {}, onDev: () => {} },
    mode: 'endless',
    audio: { play: () => {}, stop: () => {}, setVolume: () => {} },
    settings: {},
    meta,
  });

  assert.equal(scene.weapon.id, 'rifle');
  assert.equal(scene.weapon.outLevel, 2);
});

test('showUpgrades 渲染与交互：解锁、出战、升级', () => {
  const { root, doc } = mockDom();
  globalThis.document = doc;
  const meta = defaultMeta();
  meta.gold = 2000;

  let saved = 0;
  showUpgrades(root, meta, () => {}, () => { saved++; });

  assert.match(root.innerHTML, /<h2>武器<\/h2>/);
  assert.match(root.innerHTML, /金币余额：2000/);

  // 此时 rifle 未解锁
  assert.equal(meta.weapons.owned.includes('rifle'), false);

  // 点击解锁 rifle
  const unlockBtn = root.querySelectorAll('.upgrade-unlock').find(b => b.dataset.id === 'rifle');
  assert.ok(unlockBtn, '应有 rifle 解锁按钮');
  unlockBtn.dispatchEvent({ type: 'click', stopPropagation() {} });

  // 解锁成功：扣除 800 金币，拥有并出战 rifle，触发 onSave
  assert.equal(meta.gold, 1200);
  assert.equal(meta.weapons.owned.includes('rifle'), true);
  assert.equal(meta.weapons.selected, 'rifle');
  assert.ok(saved >= 1);

  // 点击出战 pistol
  const selectPistolBtn = root.querySelectorAll('.upgrade-select').find(b => b.dataset.id === 'pistol');
  assert.ok(selectPistolBtn, '应有 pistol 出战按钮');
  selectPistolBtn.dispatchEvent({ type: 'click', stopPropagation() {} });
  assert.equal(meta.weapons.selected, 'pistol');

  // 点击升级 pistol
  const upgradePistolBtn = root.querySelectorAll('.upgrade-buy').find(b => b.dataset.id === 'pistol');
  assert.ok(upgradePistolBtn, '应有 pistol 升级按钮');
  upgradePistolBtn.dispatchEvent({ type: 'click', stopPropagation() {} });
  assert.equal(meta.weaponLevels.pistol, 1);
  assert.equal(meta.gold, 1200 - 40);
});
