// test/tooltip.test.js —— 全局 tooltip 生命周期、事件解绑与自动隐藏机制测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTooltip,
  attachTooltips,
  bindTooltip,
  hideTooltip,
  isElementConnected,
  isElementVisible,
} from '../src/ui/tooltip.js';

class MockNode {
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
    };
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.hidden = false;
    this._textContent = '';
    this.isConnected = true;
  }

  get textContent() { return this._textContent; }
  set textContent(val) { this._textContent = String(val); }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  appendChild(child) {
    child.parentNode = this;
    child.isConnected = this.isConnected;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter(c => c !== child);
    child.parentNode = null;
    child.isConnected = false;
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
    for (const fn of arr) fn({ target: this, type, ...event });
  }

  getBoundingClientRect() {
    return { left: 10, top: 20, width: 100, height: 30, bottom: 50, right: 110 };
  }

  querySelectorAll(selector) {
    const matches = [];
    const walk = node => {
      for (const child of node.children) {
        if (selector === '[data-tooltip-name]' && child.dataset.tooltipName) {
          matches.push(child);
        } else if (selector === '[data-tooltip]' && child.dataset.tooltip) {
          matches.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return matches;
  }
}

function createMockEnvironment() {
  const docListeners = new Map();
  const winListeners = new Map();

  const doc = {
    createElement(tag) { return new MockNode(tag, doc); },
    documentElement: { clientWidth: 1024, clientHeight: 768 },
    body: null,
    addEventListener(type, fn, opts) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener(type, fn, opts) {
      const arr = docListeners.get(type);
      if (!arr) return;
      docListeners.set(type, arr.filter(f => f !== fn));
    },
    dispatchEvent(type, event = {}) {
      const arr = docListeners.get(type) || [];
      for (const fn of arr) fn({ type, ...event });
    },
  };

  const win = {
    addEventListener(type, fn, opts) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    removeEventListener(type, fn, opts) {
      const arr = winListeners.get(type);
      if (!arr) return;
      winListeners.set(type, arr.filter(f => f !== fn));
    },
    dispatchEvent(type, event = {}) {
      const arr = winListeners.get(type) || [];
      for (const fn of arr) fn({ type, ...event });
    },
    innerWidth: 1024,
    innerHeight: 768,
  };

  doc.defaultView = win;
  const body = new MockNode('body', doc);
  body.isConnected = true;
  doc.body = body;

  return { doc, win, body, docListeners, winListeners };
}

test('isElementConnected 与 isElementVisible 检测逻辑', () => {
  const { doc, body } = createMockEnvironment();
  const parent = new MockNode('div', doc);
  const child = new MockNode('button', doc);
  body.appendChild(parent);
  parent.appendChild(child);

  assert.equal(isElementConnected(child), true);
  assert.equal(isElementVisible(child), true);

  // 隐藏祖先元素
  parent.classList.add('hidden');
  assert.equal(isElementVisible(child), false);
  parent.classList.remove('hidden');
  assert.equal(isElementVisible(child), true);

  // 元素设置 hidden 属性
  child.hidden = true;
  assert.equal(isElementVisible(child), false);
  child.hidden = false;

  // 元素被移除
  parent.removeChild(child);
  assert.equal(isElementConnected(child), false);
  assert.equal(isElementVisible(child), false);
});

test('hideTooltip：全局 hideTooltip() 可立即隐藏任何处于激活状态的 tooltip', () => {
  const { doc, body } = createMockEnvironment();
  const tooltip = createTooltip(body);
  const target = new MockNode('button', doc);
  body.appendChild(target);

  tooltip.show(target, { name: '标题', description: '说明' });
  assert.equal(tooltip.element.hidden, false);

  hideTooltip();
  assert.equal(tooltip.element.hidden, true);
});

test('全局事件触发隐藏：pointerdown, wheel, scroll, Escape, blur', () => {
  const { doc, win, body } = createMockEnvironment();
  const savedDoc = globalThis.document;
  const savedWin = globalThis.window;
  globalThis.document = doc;
  globalThis.window = win;

  try {
    const tooltip = createTooltip(body);
    const target = new MockNode('button', doc);
    body.appendChild(target);

    // 1. pointerdown 隐藏
    tooltip.show(target, { name: 'A', description: '1' });
    assert.equal(tooltip.element.hidden, false);
    doc.dispatchEvent('pointerdown');
    assert.equal(tooltip.element.hidden, true, 'pointerdown 应隐藏 tooltip');

    // 2. wheel 隐藏
    tooltip.show(target, { name: 'B', description: '2' });
    assert.equal(tooltip.element.hidden, false);
    doc.dispatchEvent('wheel');
    assert.equal(tooltip.element.hidden, true, 'wheel 应隐藏 tooltip');

    // 3. scroll 隐藏
    tooltip.show(target, { name: 'C', description: '3' });
    assert.equal(tooltip.element.hidden, false);
    doc.dispatchEvent('scroll');
    assert.equal(tooltip.element.hidden, true, 'scroll 应隐藏 tooltip');

    // 4. keydown Escape 隐藏
    tooltip.show(target, { name: 'D', description: '4' });
    assert.equal(tooltip.element.hidden, false);
    doc.dispatchEvent('keydown', { key: 'Escape' });
    assert.equal(tooltip.element.hidden, true, 'Escape 键应隐藏 tooltip');

    // 5. window blur 隐藏
    tooltip.show(target, { name: 'E', description: '5' });
    assert.equal(tooltip.element.hidden, false);
    win.dispatchEvent('blur');
    assert.equal(tooltip.element.hidden, true, 'window blur 应隐藏 tooltip');
  } finally {
    globalThis.document = savedDoc;
    globalThis.window = savedWin;
  }
});

test('目标节点移除时自动检测隐藏（isConnected === false）', async () => {
  const { doc, body } = createMockEnvironment();
  const tooltip = createTooltip(body);
  const container = new MockNode('div', doc);
  const target = new MockNode('button', doc);
  body.appendChild(container);
  container.appendChild(target);

  tooltip.show(target, { name: '待移除', description: '描述' });
  assert.equal(tooltip.element.hidden, false);

  // 模拟列表重渲染：容器移除该子节点
  container.removeChild(target);
  assert.equal(target.isConnected, false);

  // active checker 在短时间内自动检测并隐藏
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(tooltip.element.hidden, true, '节点脱离 DOM 后应自动隐藏');
  hideTooltip();
});

test('显示新 tooltip 时自动置换旧 tooltip，无多实例重叠残留', () => {
  const { doc, body } = createMockEnvironment();
  const tooltip1 = createTooltip(body);
  const tooltip2 = createTooltip(body);
  const target1 = new MockNode('button', doc);
  const target2 = new MockNode('button', doc);
  body.appendChild(target1);
  body.appendChild(target2);

  tooltip1.show(target1, { name: 'T1', description: '1' });
  assert.equal(tooltip1.element.hidden, false);

  tooltip2.show(target2, { name: 'T2', description: '2' });
  assert.equal(tooltip2.element.hidden, false);
  assert.equal(tooltip1.element.hidden, true, '显示 tooltip2 时 tooltip1 应被自动隐藏');
  hideTooltip();
});

test('祖先容器被隐藏（classList 包含 hidden）时自动隐藏 tooltip', async () => {
  const { doc, body } = createMockEnvironment();
  const tooltip = createTooltip(body);
  const panel = new MockNode('div', doc);
  const target = new MockNode('button', doc);
  body.appendChild(panel);
  panel.appendChild(target);

  tooltip.show(target, { name: '面板中的项目', description: '说明' });
  assert.equal(tooltip.element.hidden, false);

  // 模拟面板关闭：添加 .hidden 类
  panel.classList.add('hidden');

  // active checker 在短时间内自动检测并隐藏
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(tooltip.element.hidden, true, '面板关闭（添加 .hidden）后 tooltip 应自动隐藏');
  hideTooltip();
});

test('attachTooltips 控制器销毁时自动隐藏活跃 tooltip', () => {
  const { doc, body } = createMockEnvironment();
  const panel = new MockNode('div', doc);
  const target = new MockNode('button', doc);
  target.dataset.tooltipName = '测试道具';
  target.dataset.tooltipDescription = '测试描述';
  body.appendChild(panel);
  panel.appendChild(target);

  const controller = attachTooltips(panel);
  controller.show(target, { name: '测试道具', description: '测试描述' });
  assert.equal(controller.element.hidden, false);

  controller.destroy();
  assert.equal(controller.element.hidden, true, '销毁控制器时应隐藏 tooltip');
  hideTooltip();
});
