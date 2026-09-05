// test/settlement.test.js —— 结算协议与收尾界面图标契约。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameScene } from '../src/game.js';
import { createZombie } from '../src/entities/zombie.js';
import { showGameOver } from '../src/ui/gameover.js';
import { showPause } from '../src/ui/pause.js';
import { showLevels } from '../src/ui/levels.js';
import { attachTooltips } from '../src/ui/tooltip.js';
import { ASSET_BY_ID } from '../src/config/assets.js';
import { ADVENTURE_LEVELS } from '../src/config/adventure.js';

function makeScene() {
  const canvas = { width: 800, height: 600 };
  const input = { state: {} };
  const onGameOver = () => {};
  return createGameScene({ canvas, input, mode: 'endless', audio: null, settings: {}, meta: null, onGameOver });
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
      add(name) { this._set.add(name); },
      remove(name) { this._set.delete(name); },
      contains(name) { return this._set.has(name); },
      has(name) { return this._set.has(name); },
    };
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.hidden = false;
    this._textContent = '';
  }

  get textContent() {
    return this._textContent;
  }
  set textContent(val) {
    this._textContent = String(val);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter(c => c !== child);
    child.parentNode = null;
    return child;
  }

  remove() {
    this.parentNode?.removeChild(this);
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

  getBoundingClientRect() {
    return { left: 10, top: 20, width: 100, height: 30, bottom: 50, right: 110 };
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.children.find(c => c.id === id || c.getAttribute('id') === id) || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const walk = node => {
      for (const child of node.children) {
        if (selector === '[data-tooltip-name]') {
          if (child.dataset.tooltipName !== undefined || child.getAttribute('data-tooltip-name') !== null) {
            matches.push(child);
          }
        } else if (selector === '[data-tooltip]') {
          if (child.dataset.tooltip !== undefined || child.getAttribute('data-tooltip') !== null) {
            matches.push(child);
          }
        } else if (selector.includes('[data-tooltip-name]') && selector.includes('[data-tooltip]')) {
          if (child.dataset.tooltipName !== undefined || child.dataset.tooltip !== undefined ||
              child.getAttribute('data-tooltip-name') !== null || child.getAttribute('data-tooltip') !== null) {
            matches.push(child);
          }
        } else if (selector === '.level-card:not(.locked)') {
          if (child.classList.contains('level-card') && !child.classList.contains('locked')) {
            matches.push(child);
          }
        }
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

function makeRoot() {
  const doc = {
    createElement(tag) {
      return new MockElement(tag, doc);
    },
    documentElement: { clientWidth: 1024, clientHeight: 768 },
  };
  const root = new MockElement('div', doc);
  root.ownerDocument = doc;
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
  const origQuerySelector = root.querySelector.bind(root);
  root.querySelector = selector => {
    const el = origQuerySelector(selector);
    if (el) return el;
    if (selector.startsWith('#')) {
      const fallback = new MockElement('button', doc);
      fallback.id = selector.slice(1);
      root.appendChild(fallback);
      return fallback;
    }
    return null;
  };
  return root;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertManifestIcon(root, id) {
  const asset = ASSET_BY_ID[id];
  assert.ok(asset, `${id} 必须存在于 ASSET_BY_ID`);
  const safeId = escapeRegExp(id);
  const safePath = escapeRegExp(asset.path);
  assert.match(root.innerHTML, new RegExp(`data-visual-id=["']${safeId}["']`), `${id} 未渲染`);
  assert.match(root.innerHTML, new RegExp(`src=["']${safePath}["']`), `${id} 未复用 manifest path`);
}

test('行为自杀：引信燃尽 alive=false，清理循环补 killZombie 结算一次（计 1 击杀，不双计）', () => {
  const scene = makeScene();
  scene.weapon.cooldown = 1e9;
  const p = scene.player;
  const e = createZombie('exploder', p.x + 40, p.y, { tier: 1, timeSec: 0, level: 1 });
  e.x = p.x + 40; e.y = p.y;
  const baseKills = scene.kills;
  scene.zombies.push(e);
  for (let i = 0; i < 120; i++) scene.update(1 / 60);
  assert.equal(e.fuseDone, true);
  assert.equal(e.alive, false);
  assert.equal(e.counted, true, '清理循环应补 killZombie（自爆）');
  assert.equal(scene.kills, baseKills + 1, '行为自杀只计 1 次击杀');
  assert.ok(!scene.zombies.includes(e), '结算后已从数组移除');
});

test('战斗击杀计 1 次，同帧清理循环不双计', () => {
  const scene = makeScene();
  const p = scene.player;
  const e = createZombie('normal', p.x + 40, p.y, { tier: 1, timeSec: 0, level: 1 });
  e.hp = 5; e.maxHp = 5;
  e.x = p.x + 40; e.y = p.y;
  const baseKills = scene.kills;
  scene.zombies.push(e);
  let guard = 0;
  while (!e.counted && guard++ < 200) scene.update(1 / 60);
  assert.equal(e.counted, true, '战斗击杀应计 1 次');
  assert.equal(e.alive, false);
  assert.equal(scene.kills - baseKills, 1, '战斗击杀只计 1 次，清理循环不再补计');
  assert.ok(!scene.zombies.includes(e), '结算后已从数组移除');
});

test('showGameOver：冒险结算使用金币 manifest 图标，并给奖励节点完整 tooltip', () => {
  const root = makeRoot();
  showGameOver(root, {
    time: 360, kills: 41, hp: 80, cleared: true, mode: 'adventure', gold: 200, firstClear: true,
  }, false, {
    onRestart() {}, onLevels() {}, onMenu() {},
  });
  assertManifestIcon(root, 'icon.currency.gold');
  assert.match(root.innerHTML, /class="settlement-reward"/);
  assert.match(root.innerHTML, /data-tooltip="[^"]*金币[^"]*200[^"]*首通奖励/);
  assert.match(root.innerHTML, /金币 \+200/);
});

test('showPause：设置控件保留文字可读性并覆盖 tooltip', () => {
  const root = makeRoot();
  showPause(root, { volume: 0.75, damageNumbers: true, screenShake: false }, {
    onResume() {}, onQuit() {}, onChange() {},
  });
  assert.match(root.innerHTML, /id="pause-volume"/);
  assert.match(root.innerHTML, /data-tooltip="音量：调整音量/);
  assert.match(root.innerHTML, /data-tooltip="伤害数字：/);
  assert.match(root.innerHTML, /data-tooltip="震屏：/);
  assert.match(root.innerHTML, /继续/);
  assert.match(root.innerHTML, /回主菜单/);
});

test('showLevels：余额和每个已解锁关卡奖励都复用金币 manifest ID', () => {
  const root = makeRoot();
  showLevels(root, {
    gold: 500,
    adventure: { unlocked: ADVENTURE_LEVELS.length, bestTimes: {} },
  }, () => {}, () => {});
  const count = (root.innerHTML.match(/data-visual-id="icon\.currency\.gold"/g) || []).length;
  assert.equal(count, ADVENTURE_LEVELS.length + 1, '余额 1 个 + 每关奖励 1 个金币图标');
  assertManifestIcon(root, 'icon.currency.gold');
  assert.match(root.innerHTML, /data-tooltip="[^"]*金币余额[^"]*500/);
  assert.match(root.innerHTML, /data-tooltip="[^"]*通关奖励[^"]*100[^"]*金币/);
});

test('showGameOver：接入 attachTooltips 并为结算奖励绑定可展示的 tooltip 覆盖层', () => {
  const root = makeRoot();
  showGameOver(root, {
    time: 360, kills: 41, hp: 80, cleared: true, mode: 'adventure', gold: 200, firstClear: true,
  }, false, {
    onRestart() {}, onLevels() {}, onMenu() {},
  });

  assert.ok(root.__tooltipController, '结算面板应当挂载 tooltip 控制器');
  const targets = root.querySelectorAll('[data-tooltip]');
  assert.equal(targets.length, 1, '应当发现结算奖励 tooltip 目标');

  const tooltipEl = root.__tooltipController.element;
  assert.ok(tooltipEl, '应当生成 tooltip DOM 节点');
  assert.equal(tooltipEl.hidden, true, '初始状态 tooltip 应隐藏');

  // 模拟鼠标悬停
  targets[0].dispatchEvent('mouseenter');
  assert.equal(tooltipEl.hidden, false, '悬停时 tooltip 应显示');

  const strong = tooltipEl.children.find(c => c.tagName === 'STRONG');
  const spans = tooltipEl.children.filter(c => c.tagName === 'SPAN');
  assert.equal(strong?.textContent, '金币奖励', '标题应为冒号前文本');
  assert.equal(spans[0]?.textContent, '金币 +200（首通奖励 ×2）', '描述应为冒号后文本');

  // 模拟鼠标移出
  targets[0].dispatchEvent('mouseleave');
  assert.equal(tooltipEl.hidden, true, '移出时 tooltip 应隐藏');

  // 销毁测试
  root.__tooltipController.destroy();
  assert.equal(targets[0].listeners.get('mouseenter')?.length || 0, 0, '销毁后应清理事件监听');
});

test('showPause：接入 attachTooltips 并为三项设置项绑定语义化 tooltip 覆盖层', () => {
  const root = makeRoot();
  showPause(root, { volume: 0.75, damageNumbers: true, screenShake: false }, {
    onResume() {}, onQuit() {}, onChange() {},
  });

  assert.ok(root.__tooltipController, '暂停面板应当挂载 tooltip 控制器');
  const targets = root.querySelectorAll('[data-tooltip]');
  assert.equal(targets.length, 3, '暂停面板应包含音量、伤害数字、震屏三个 tooltip 目标');

  const tooltipEl = root.__tooltipController.element;
  const strong = tooltipEl.children.find(c => c.tagName === 'STRONG');
  const spans = tooltipEl.children.filter(c => c.tagName === 'SPAN');

  // 1. 音量
  targets[0].dispatchEvent('mouseenter');
  assert.equal(strong?.textContent, '音量');
  assert.equal(spans[0]?.textContent, '调整音量');
  targets[0].dispatchEvent('mouseleave');
  assert.equal(tooltipEl.hidden, true);

  // 2. 伤害数字
  targets[1].dispatchEvent('mouseenter');
  assert.equal(strong?.textContent, '伤害数字');
  assert.equal(spans[0]?.textContent, '显示或隐藏战斗伤害数字');
  targets[1].dispatchEvent('mouseleave');

  // 3. 震屏
  targets[2].dispatchEvent('mouseenter');
  assert.equal(strong?.textContent, '震屏');
  assert.equal(spans[0]?.textContent, '受击和爆炸时启用或关闭屏幕震动');
  targets[2].dispatchEvent('mouseleave');

  root.__tooltipController.destroy();
  assert.equal(targets[0].listeners.get('mouseenter')?.length || 0, 0, '控制器销毁后监听器应清空');
});

test('showLevels：接入 attachTooltips 并为金币余额与通关奖励绑定 tooltip 覆盖层', () => {
  const root = makeRoot();
  showLevels(root, {
    gold: 500,
    adventure: { unlocked: ADVENTURE_LEVELS.length, bestTimes: {} },
  }, () => {}, () => {});

  assert.ok(root.__tooltipController, '关卡选择面板应当挂载 tooltip 控制器');
  const targets = root.querySelectorAll('[data-tooltip]');
  assert.equal(targets.length, ADVENTURE_LEVELS.length + 1, '包含 1 个余额和所有关卡通关奖励');

  const tooltipEl = root.__tooltipController.element;
  const strong = tooltipEl.children.find(c => c.tagName === 'STRONG');
  const spans = tooltipEl.children.filter(c => c.tagName === 'SPAN');

  // 余额 tooltip
  targets[0].dispatchEvent('mouseenter');
  assert.equal(strong?.textContent, '金币余额');
  assert.equal(spans[0]?.textContent, '500，当前可用于关卡奖励和外观解锁');
  targets[0].dispatchEvent('mouseleave');

  // 第 1 关奖励 tooltip（无冒号，整体作为标题/强调展示）
  targets[1].dispatchEvent('mouseenter');
  assert.equal(strong?.textContent, `通关奖励 ${ADVENTURE_LEVELS[0].goldReward} 金币（首通 ×2）`);
  assert.equal(spans[0]?.textContent, '');
  targets[1].dispatchEvent('mouseleave');

  root.__tooltipController.destroy();
  assert.equal(targets[0].listeners.get('mouseenter')?.length || 0, 0);
});

test('tooltip.js：attachTooltips 兼容 [data-tooltip] 裸属性并支持冒号拆分与无冒号文本', () => {
  const root = makeRoot();
  root.innerHTML = `
    <div id="item1" data-tooltip="名称：描述文本"></div>
    <div id="item2" data-tooltip="纯文本提示说明"></div>
    <div id="item3" data-tooltip-name="标准名" data-tooltip-description="标准描述" data-tooltip-value="100"></div>
  `;
  const controller = attachTooltips(root);
  assert.ok(controller);

  const targets = root.querySelectorAll('[data-tooltip-name], [data-tooltip]');
  assert.equal(targets.length, 3, '应发现全部 3 个 tooltip 目标');

  const tooltipEl = controller.element;
  const strong = tooltipEl.children.find(c => c.tagName === 'STRONG');
  const spans = tooltipEl.children.filter(c => c.tagName === 'SPAN');

  // item1: 冒号拆分
  targets[0].dispatchEvent('mouseenter');
  assert.equal(strong?.textContent, '名称');
  assert.equal(spans[0]?.textContent, '描述文本');

  // item2: 纯文本提示
  targets[1].dispatchEvent('mouseenter');
  assert.equal(strong?.textContent, '纯文本提示说明');
  assert.equal(spans[0]?.textContent, '');

  // item3: 既有三元组
  targets[2].dispatchEvent('mouseenter');
  assert.equal(strong?.textContent, '标准名');
  assert.equal(spans[0]?.textContent, '标准描述');
  assert.equal(spans[1]?.textContent, '100');

  controller.destroy();
  for (const t of targets) {
    assert.equal(t.listeners.get('mouseenter')?.length || 0, 0);
  }
});
