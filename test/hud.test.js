import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, adventureTierProgress, hudLayout, itemSlotView, hudTooltipView, renderHud } from '../src/systems/hud.js';
import { positionTooltip, normalizeTooltipData, createTooltip, attachTooltips } from '../src/ui/tooltip.js';

test('formatTime 三个样例', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(600), '10:00');
});

test('冒险四档进度：90s 一档，档内 0→1，封顶第 4 档', () => {
  assert.deepEqual(adventureTierProgress(0), { tier: 1, progress: 0 });
  assert.equal(adventureTierProgress(45).progress, 0.5);
  assert.deepEqual(adventureTierProgress(90), { tier: 2, progress: 0 });
  assert.equal(adventureTierProgress(359).tier, 4);
  assert.deepEqual(adventureTierProgress(360), { tier: 4, progress: 1 });
  assert.deepEqual(adventureTierProgress(999), { tier: 4, progress: 1 });
});

test('HUD 布局只使用传入 CSS viewport，五槽锚定左下且不读取物理 canvas', () => {
  const small = hudLayout({ width: 800, height: 600 });
  assert.equal(small.width, 800);
  assert.equal(small.height, 600);
  assert.equal(small.rightX, 784);
  assert.equal(small.weaponY, 592);
  assert.deepEqual(small.itemSlots[0], {
    id: 'medkit', x: 16, y: 520, width: 72, height: 48, iconX: 24, iconY: 528,
  });
  assert.deepEqual(small.itemSlots[4], {
    id: 'wall', x: 336, y: 520, width: 72, height: 48, iconX: 344, iconY: 528,
  });

  const wide = hudLayout({ width: 1600, height: 900 });
  assert.equal(wide.rightX, 1584);
  assert.equal(wide.itemSlots[0].y, 820);
  assert.notEqual(wide.rightX, small.rightX);
});

test('道具槽视图：图标、数字键、数量和空槽状态具体可断言', () => {
  assert.deepEqual(itemSlotView('medkit', { medkit: 2 }), {
    id: 'medkit', key: 1, name: '医疗包', desc: '立即回复 50% HP',
    icon: 'icon.item.medkit', count: 2, empty: false,
  });
  assert.deepEqual(itemSlotView('wall', { wall: 0 }), {
    id: 'wall', key: 5, name: '围墙', desc: '环形8段墙（每段耐久150）',
    icon: 'icon.item.wall', count: 0, empty: true,
  });
  assert.deepEqual(hudTooltipView(itemSlotView('medkit', { medkit: 2 })), {
    name: '医疗包', description: '立即回复 50% HP', value: '数量 2 · 数字键 1',
  });
});

test('tooltip 数据归一化与视口边界夹取', () => {
  assert.deepEqual(normalizeTooltipData({ name: '医疗包', description: '回复 HP', value: 2 }), {
    name: '医疗包', description: '回复 HP', value: '2',
  });
  assert.deepEqual(positionTooltip(
    { left: 100, top: 100, width: 40, height: 40, bottom: 140 },
    { width: 120, height: 60 },
    { width: 400, height: 300 },
  ), { left: 60, top: 32 });
  assert.deepEqual(positionTooltip(
    { left: 4, top: 2, width: 40, height: 20, bottom: 22 },
    { width: 100, height: 50 },
    { width: 320, height: 200 },
  ), { left: 8, top: 30 });
  assert.deepEqual(positionTooltip(
    { left: 300, top: 150, width: 20, height: 20, bottom: 170 },
    { width: 120, height: 60 },
    { width: 320, height: 200 },
  ), { left: 192, top: 82 });
});

test('无 DOM 时 createTooltip 是安全 no-op', () => {
  const savedDocument = globalThis.document;
  delete globalThis.document;
  const tooltip = createTooltip();
  assert.equal(tooltip.element, null);
  assert.doesNotThrow(() => {
    tooltip.show({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1, bottom: 1 }) }, {
      name: '测试', description: '说明', value: '1',
    });
    tooltip.hide();
    tooltip.destroy();
  });
  if (savedDocument === undefined) delete globalThis.document;
  else globalThis.document = savedDocument;
});

test('attachTooltips 重复调用不累积事件监听器，旧监听器被清理', () => {
  const listeners = new Map();
  function makeElement(tag) {
    const el = {
      tagName: tag,
      dataset: { tooltipName: '医疗包', tooltipDescription: '回复 HP', tooltipValue: '1' },
      style: {},
      hidden: false,
      children: [],
      appendChild(child) { this.children.push(child); child.parentNode = this; },
      removeChild(child) { this.children = this.children.filter(c => c !== child); child.parentNode = null; },
      addEventListener(type, fn) {
        if (!listeners.has(this)) listeners.set(this, []);
        listeners.get(this).push({ type, fn });
      },
      removeEventListener(type, fn) {
        if (!listeners.has(this)) return;
        listeners.set(this, listeners.get(this).filter(l => !(l.type === type && l.fn === fn)));
      },
      setAttribute() {},
      querySelectorAll(selector) {
        if (selector === '[data-tooltip-name]') return this.children.filter(c => c.dataset?.tooltipName);
        return [];
      },
    };
    return el;
  }

  const root = makeElement('div');
  const target = makeElement('button');
  root.appendChild(target);

  const doc = {
    createElement: tag => makeElement(tag),
  };
  root.ownerDocument = doc;

  // 第一次挂载
  attachTooltips(root);
  const count1 = listeners.get(target)?.length || 0;
  assert.equal(count1, 4); // mouseenter, focus, mouseleave, blur

  // 第二次挂载（如更新 inventory 后再次调用）
  attachTooltips(root);
  const count2 = listeners.get(target)?.length || 0;
  assert.equal(count2, 4, '重复调用 attachTooltips 不应使目标节点的监听器数量翻倍');

  // 第三次挂载
  attachTooltips(root);
  const count3 = listeners.get(target)?.length || 0;
  assert.equal(count3, 4, '多次调用仍保持单组监听器');

  // 销毁 controller 应清理监听器
  root.__tooltipController.destroy();
  const countAfterDestroy = listeners.get(target)?.length || 0;
  assert.equal(countAfterDestroy, 0, '销毁控制器后应移除全部监听器');
});

function mockHudCtx() {
  const calls = [];
  const ctx = { calls };
  for (const name of ['fillRect', 'strokeRect', 'fillText', 'beginPath', 'arc', 'stroke', 'drawImage']) {
    ctx[name] = (...args) => calls.push({ name, args });
  }
  return ctx;
}

function hudGame(hp) {
  return {
    player: { hp, maxHp: 100 },
    mode: 'endless',
    time: 0,
    kills: 0,
    coins: 0,
    inventory: {},
    weapon: { id: 'pistol', enhance: { damage: 0, fireRate: 0, projectiles: 0, range: 0 } },
    aux: { counts: { drone: 0, gunner: 0, sniper: 0 } },
  };
}

test('HUD 血量文本取整且不为负', () => {
  const ctx = mockHudCtx();
  renderHud(ctx, hudGame(55.836500000000005), { width: 800, height: 600 });
  const hpCall = ctx.calls.find(c => c.name === 'fillText' && typeof c.args[0] === 'string' && c.args[0].includes('/100'));
  assert.ok(hpCall, '应当渲染血量文本');
  assert.equal(hpCall.args[0], '56/100', '浮点血量应向上取整显示');

  const ctx2 = mockHudCtx();
  renderHud(ctx2, hudGame(-6.2244999999999871), { width: 800, height: 600 });
  const hpCall2 = ctx2.calls.find(c => c.name === 'fillText' && typeof c.args[0] === 'string' && c.args[0].includes('/100'));
  assert.ok(hpCall2, '应当渲染血量文本');
  assert.equal(hpCall2.args[0], '0/100', '负血量应钳制为 0');
});
