import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMeta } from '../src/core/meta.js';
import { SKINS } from '../src/config/skins.js';
import { skinView, applySkinAction, showSkins } from '../src/ui/skins.js';

function metaWithGold(gold) {
  const meta = defaultMeta();
  meta.gold = gold;
  return meta;
}

class MockElement {
  constructor(tagName = 'div', doc = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = doc;
    this.dataset = {};
    this.attributes = new Map();
    this.style = {};
    this.classList = {
      _set: new Set(),
      add: name => this.classList._set.add(name),
      remove: name => this.classList._set.delete(name),
      contains: name => this.classList._set.has(name),
    };
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.hidden = false;
    this.id = '';
    this._textContent = '';
  }

  get textContent() { return this._textContent; }
  set textContent(val) { this._textContent = String(val); }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...nodes) {
    this.children = [];
    for (const n of nodes) this.appendChild(n);
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const arr = this.listeners.get(type);
    if (!arr) return;
    this.listeners.set(type, arr.filter(f => f !== fn));
  }

  dispatchEvent(type, event = {}) {
    const arr = this.listeners.get(type) || [];
    for (const fn of arr) fn({ target: this, ...event });
  }

  click() {
    this.dispatchEvent('click');
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100, bottom: 100, right: 100 };
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const walk = node => {
      for (const child of node.children) {
        let matched = false;
        if (selector.startsWith('#')) {
          matched = child.id === selector.slice(1);
        } else if (selector.startsWith('.')) {
          const className = selector.slice(1);
          matched = child.classList.contains(className);
        } else if (selector.startsWith('[') && selector.endsWith(']')) {
          const attr = selector.slice(1, -1);
          matched = child.attributes.has(attr) || child.dataset[attr] !== undefined;
        }
        if (matched) matches.push(child);
        walk(child);
      }
    };
    walk(this);
    return matches;
  }
}

function parseMockHtml(html, doc) {
  const elements = [];
  const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1];
    const attrStr = match[2];
    if (tagName.startsWith('/')) continue;
    const el = new MockElement(tagName, doc);
    const attrRegex = /([a-zA-Z0-9-_:]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
      const attrName = attrMatch[1];
      const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      el.setAttribute(attrName, attrVal);
      if (attrName === 'id') el.id = attrVal;
      if (attrName === 'class') {
        attrVal.split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
      }
      if (attrName.startsWith('data-')) {
        const key = attrName.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        el.dataset[key] = attrVal;
      }
    }
    elements.push(el);
  }
  return elements;
}

function makeSkinsRoot() {
  const doc = {
    createElement(tag) {
      const el = new MockElement(tag, doc);
      if (tag === 'canvas') {
        el.width = 64;
        el.height = 64;
        el.getContext = () => null;
      }
      return el;
    },
    documentElement: { clientWidth: 1024, clientHeight: 768 },
  };
  doc.body = new MockElement('body', doc);
  const root = new MockElement('div', doc);
  root.classList.add('hidden');
  let innerHTML = '';
  Object.defineProperty(root, 'innerHTML', {
    get() { return innerHTML; },
    set(val) {
      innerHTML = String(val);
      root.children = parseMockHtml(innerHTML, doc);
      for (const child of root.children) {
        child.parentNode = root;
      }
    },
  });
  return { root, doc };
}

test('skinView：默认皮肤显示拥有、使用中、免费和立绘 ID', () => {
  const meta = defaultMeta();
  const view = skinView(SKINS.wastelandAdventurer, meta);
  assert.deepEqual(view, {
    id: 'wastelandAdventurer',
    name: '荒野冒险家',
    description: '在废土中寻找补给与出路的可靠冒险家。',
    portrait: 'skin.wastelandAdventurer.portrait',
    owned: true,
    selected: true,
    price: { currency: 'gold', amount: 0 },
    balance: 0,
    action: '使用中',
    disabled: true,
    affordable: true,
  });
});

test('skinView：未拥有皮肤显示解锁、价格和当前余额', () => {
  const meta = metaWithGold(900);
  const view = skinView(SKINS.neonMercenary, meta);
  assert.equal(view.owned, false);
  assert.equal(view.selected, false);
  assert.equal(view.action, '解锁');
  assert.equal(view.disabled, false);
  assert.equal(view.affordable, true);
  assert.equal(view.balance, 900);
  assert.deepEqual(view.price, { currency: 'gold', amount: 800 });
});

test('购买失败：金币不足不扣款、不加入 owned、不改变 selected', () => {
  const meta = metaWithGold(799);
  const result = applySkinAction(meta, 'neonMercenary');
  assert.deepEqual(result, {
    ok: false,
    reason: 'insufficient-gold',
    skinId: 'neonMercenary',
  });
  assert.equal(meta.gold, 799);
  assert.deepEqual(meta.skins, {
    owned: ['wastelandAdventurer'],
    selected: 'wastelandAdventurer',
  });
});

test('购买成功：按注册表价格扣金币、加入 owned 并自动选中', () => {
  const meta = metaWithGold(800);
  const result = applySkinAction(meta, 'neonMercenary');
  assert.deepEqual(result, {
    ok: true,
    action: 'purchased',
    skinId: 'neonMercenary',
  });
  assert.equal(meta.gold, 0);
  assert.deepEqual(meta.skins, {
    owned: ['wastelandAdventurer', 'neonMercenary'],
    selected: 'neonMercenary',
  });
});

test('已有皮肤选用：只改变 selected，不改变金币和 owned', () => {
  const meta = metaWithGold(17);
  meta.skins.owned.push('nightHunter');
  const beforeOwned = [...meta.skins.owned];
  const result = applySkinAction(meta, 'nightHunter');
  assert.deepEqual(result, {
    ok: true,
    action: 'selected',
    skinId: 'nightHunter',
  });
  assert.equal(meta.gold, 17);
  assert.deepEqual(meta.skins.owned, beforeOwned);
  assert.equal(meta.skins.selected, 'nightHunter');
});

test('showSkins：渲染单行容器 .skin-row，无详情预览框 .skin-detail 与 #skin-action', () => {
  const { root, doc } = makeSkinsRoot();
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  try {
    const meta = metaWithGold(1000);
    showSkins(root, meta, () => {}, () => {});
    assert.equal(root.classList.contains('hidden'), false);
    assert.ok(root.querySelector('.skin-row'), '必须包含单行横滚容器 .skin-row');
    assert.equal(root.querySelector('.skin-detail'), null, '必须移除右侧详情预览框 .skin-detail');
    assert.equal(root.querySelector('#skin-action'), null, '必须移除旧的外置操作按钮 #skin-action');
    assert.equal(root.innerHTML.includes('skin-detail'), false, 'HTML 中不应残留 skin-detail');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('showSkins：每张皮肤卡片自包含立绘预览、名称与状态，点击直接购买或出战', () => {
  const { root, doc } = makeSkinsRoot();
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  try {
    const meta = metaWithGold(900);
    let saved = 0;
    showSkins(root, meta, () => {}, () => { saved++; });

    const cards = root.querySelectorAll('.skin-card');
    assert.equal(cards.length, Object.keys(SKINS).length);

    // 每张卡片自包含立绘与状态
    const wastelandCard = cards.find(c => c.dataset.skinId === 'wastelandAdventurer');
    const neonCard = cards.find(c => c.dataset.skinId === 'neonMercenary');
    assert.ok(wastelandCard, '包含默认皮肤卡');
    assert.ok(neonCard, '包含霓虹佣兵卡');

    // 状态与立绘槽位在卡片内
    assert.ok(root.innerHTML.includes('使用中'));
    assert.ok(root.innerHTML.includes('800 金币') || root.innerHTML.includes('800'));

    // 点击未拥有的霓虹佣兵（余额 900 >= 800）：直接购买并选中
    neonCard.click();
    assert.equal(meta.gold, 100);
    assert.equal(meta.skins.selected, 'neonMercenary');
    assert.ok(meta.skins.owned.includes('neonMercenary'));
    assert.equal(saved, 1);

    // 重新获取卡片（因 render 更新了 innerHTML），点击荒野冒险家（已拥有）：直接出战选用
    const updatedWastelandCard = root.querySelectorAll('.skin-card').find(c => c.dataset.skinId === 'wastelandAdventurer');
    updatedWastelandCard.click();
    assert.equal(meta.skins.selected, 'wastelandAdventurer');
    assert.equal(saved, 2);
  } finally {
    globalThis.document = prevDoc;
  }
});

test('showSkins：未拥有且金币不足时点击提示购买失败，不扣款', () => {
  const { root, doc } = makeSkinsRoot();
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  try {
    const meta = metaWithGold(500);
    let saved = 0;
    showSkins(root, meta, () => {}, () => { saved++; });

    const neonCard = root.querySelectorAll('.skin-card').find(c => c.dataset.skinId === 'neonMercenary');
    neonCard.click();
    assert.equal(meta.gold, 500, '金币不足不扣款');
    assert.equal(meta.skins.selected, 'wastelandAdventurer', '未改变选中皮肤');
    assert.equal(saved, 0);
    assert.ok(root.innerHTML.includes('购买失败：金币不足'));
  } finally {
    globalThis.document = prevDoc;
  }
});

test('showSkins：卡片携带描述信息，取消/返回按钮正常触发 onBack', () => {
  const { root, doc } = makeSkinsRoot();
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  try {
    const meta = metaWithGold(0);
    let backed = false;
    showSkins(root, meta, () => { backed = true; }, () => {});

    // 每张卡片带描述 tooltip 相关属性
    const cards = root.querySelectorAll('.skin-card');
    for (const card of cards) {
      assert.ok(card.getAttribute('data-tooltip-name') || card.dataset.tooltipName, '卡片应有 tooltip 名称');
    }

    // 取消/返回按钮
    const backBtn = root.querySelector('#skins-back');
    assert.ok(backBtn, '保留返回/取消按钮');
    backBtn.click();
    assert.equal(backed, true);
    assert.equal(root.classList.contains('hidden'), true);
  } finally {
    globalThis.document = prevDoc;
  }
});
