import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitCanvas, createEngine } from '../src/core/engine.js';

function makeCanvas() {
  const ctx = {
    transforms: [],
    setTransform(...args) { this.transforms.push(args); },
  };
  return {
    width: 1280,
    height: 720,
    style: {},
    ctx,
    getContext(kind) {
      assert.equal(kind, '2d');
      return ctx;
    },
  };
}

function restoreGlobal(name, value) {
  if (value === undefined) delete globalThis[name];
  else globalThis[name] = value;
}

test('fitCanvas 使用窗口 CSS 尺寸并把 DPR 限制为 2', () => {
  const oldWindow = globalThis.window;
  globalThis.window = { innerWidth: 801, innerHeight: 603, devicePixelRatio: 3 };
  try {
    const canvas = makeCanvas();
    const viewport = fitCanvas(canvas, canvas.ctx);
    assert.deepEqual(viewport, { width: 801, height: 603, dpr: 2 });
    assert.equal(canvas.style.width, '801px');
    assert.equal(canvas.style.height, '603px');
    assert.equal(canvas.width, 1602);
    assert.equal(canvas.height, 1206);
    assert.deepEqual(canvas.ctx.transforms[0], [2, 0, 0, 2, 0, 0]);
  } finally {
    restoreGlobal('window', oldWindow);
  }
});

test('resize 事件合并为一个 rAF，并只更新场景视口不重置场景', () => {
  const oldWindow = globalThis.window;
  const oldRequestAnimationFrame = globalThis.requestAnimationFrame;
  const resizeListeners = [];
  const rafQueue = [];
  globalThis.window = {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    addEventListener(type, listener) {
      assert.equal(type, 'resize');
      resizeListeners.push(listener);
    },
  };
  globalThis.requestAnimationFrame = callback => {
    rafQueue.push(callback);
    return rafQueue.length;
  };
  try {
    const canvas = makeCanvas();
    const engine = createEngine(canvas);
    const viewports = [];
    let updates = 0;
    const scene = {
      setViewport(width, height) { viewports.push({ width, height }); },
      update() { updates++; },
      render() {},
    };
    engine.setScene(scene);
    assert.deepEqual(engine.getViewport(), { width: 800, height: 600, dpr: 1 });
    assert.deepEqual(viewports, [{ width: 800, height: 600 }]);

    globalThis.window.innerWidth = 1024;
    globalThis.window.innerHeight = 768;
    globalThis.window.devicePixelRatio = 1.5;
    resizeListeners[0]();
    resizeListeners[0]();
    assert.equal(rafQueue.length, 1);

    rafQueue.shift()(16);
    assert.deepEqual(engine.getViewport(), { width: 1024, height: 768, dpr: 1.5 });
    assert.deepEqual(viewports, [
      { width: 800, height: 600 },
      { width: 1024, height: 768 },
    ]);
    assert.equal(canvas.width, 1536);
    assert.equal(canvas.height, 1152);
    assert.deepEqual(canvas.ctx.transforms[canvas.ctx.transforms.length - 1], [1.5, 0, 0, 1.5, 0, 0]);
    assert.equal(updates, 0);
  } finally {
    restoreGlobal('window', oldWindow);
    restoreGlobal('requestAnimationFrame', oldRequestAnimationFrame);
  }
});
