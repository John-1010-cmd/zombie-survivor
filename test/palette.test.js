import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, initPalette, onPaletteChange } from '../src/config/palette.js';

const DEFAULT_PALETTE = {
  bg: '#0e141d',
  panel: 'rgba(14,20,29,.92)',
  neon: '#45c8e0',
  neonDim: '#223846',
  gold: '#ffd75e',
  text: '#e8f0f8',
  textDim: '#9aaec0',
  ground: '#151d28',
  obstacle: '#3b4654',
  hudPanel: '#101923',
  boundary: '#223846',
};

function restoreGlobal(name, value) {
  if (value === undefined) delete globalThis[name];
  else globalThis[name] = value;
}

function installComputedStyle(values) {
  const oldDocument = globalThis.document;
  const oldGetComputedStyle = globalThis.getComputedStyle;
  globalThis.document = { documentElement: {} };
  globalThis.getComputedStyle = () => ({
    getPropertyValue(name) { return values[name] ?? ''; },
  });
  return () => {
    restoreGlobal('document', oldDocument);
    restoreGlobal('getComputedStyle', oldGetComputedStyle);
  };
}

test('Node 无 DOM 时使用安全默认色表', () => {
  const oldDocument = globalThis.document;
  const oldGetComputedStyle = globalThis.getComputedStyle;
  delete globalThis.document;
  delete globalThis.getComputedStyle;
  Object.assign(PALETTE, DEFAULT_PALETTE);
  try {
    assert.deepEqual(PALETTE, DEFAULT_PALETTE);
    assert.equal(initPalette(), PALETTE);
    assert.deepEqual(PALETTE, DEFAULT_PALETTE);
  } finally {
    restoreGlobal('document', oldDocument);
    restoreGlobal('getComputedStyle', oldGetComputedStyle);
  }
});

test('浏览器 initPalette 读取 CSS custom properties 并映射语义字段', () => {
  const values = {
    '--bg': '#101820',
    '--panel': 'rgba(16,24,32,.94)',
    '--neon': '#72ff9a',
    '--neon-dim': '#315b48',
    '--gold': '#ffe27a',
    '--text': '#f0fff4',
    '--text-dim': '#aac2b2',
    '--canvas-ground': '#14251b',
    '--canvas-obstacle': '#59616b',
    '--canvas-hud-panel': '#17261f',
    '--canvas-boundary': '#88f5ff',
  };
  const restore = installComputedStyle(values);
  Object.assign(PALETTE, DEFAULT_PALETTE);
  try {
    assert.equal(initPalette(), PALETTE);
    assert.deepEqual(PALETTE, {
      bg: '#101820',
      panel: 'rgba(16,24,32,.94)',
      neon: '#72ff9a',
      neonDim: '#315b48',
      gold: '#ffe27a',
      text: '#f0fff4',
      textDim: '#aac2b2',
      ground: '#14251b',
      obstacle: '#59616b',
      hudPanel: '#17261f',
      boundary: '#88f5ff',
    });
  } finally {
    restore();
    Object.assign(PALETTE, DEFAULT_PALETTE);
  }
});

test('令牌变化通知一次，重复读取不重复通知，取消订阅后停止通知', () => {
  const values = {
    '--bg': '#111b16',
    '--panel': 'rgba(17,27,22,.9)',
    '--neon': '#80ff9f',
    '--neon-dim': '#365f4a',
    '--gold': '#ffe88d',
    '--text': '#f4fff6',
    '--text-dim': '#b5cbb9',
    '--canvas-ground': '#19301f',
    '--canvas-obstacle': '#626a70',
    '--canvas-hud-panel': '#1b2d23',
    '--canvas-boundary': '#8fffff',
  };
  const restore = installComputedStyle(values);
  Object.assign(PALETTE, DEFAULT_PALETTE);
  const changes = [];
  let unsubscribe = () => {};
  try {
    unsubscribe = onPaletteChange(next => changes.push(Object.assign({}, next)));
    initPalette();
    initPalette();
    assert.equal(changes.length, 1);
    assert.equal(changes[0].neon, '#80ff9f');
    assert.equal(changes[0].boundary, '#8fffff');
    unsubscribe();
    values['--neon'] = '#ffffff';
    initPalette();
    assert.equal(changes.length, 1);
  } finally {
    unsubscribe();
    restore();
    Object.assign(PALETTE, DEFAULT_PALETTE);
  }
});
