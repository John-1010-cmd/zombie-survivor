// test/visuals.test.js —— 统一视觉注册表：图片预加载、失败回退与离屏缓存（设计 §1.2/§1.4/§9）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCaches, drawVisual, getLoadedImage, getVisualCanvas, preloadVisuals,
  registerImage, registerPart, registerShape, SHAPES, PARTS,
} from '../src/core/visuals.js';
import { SHAPES as facadeShapes } from '../src/entities/render.js';

function makeContext() {
  const calls = [];
  return {
    calls,
    beginPath() { calls.push(['beginPath']); },
    arc(...args) { calls.push(['arc', ...args]); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    closePath() { calls.push(['closePath']); },
    fill() { calls.push(['fill']); },
    stroke() { calls.push(['stroke']); },
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(...args) { calls.push(['translate', ...args]); },
    drawImage(...args) { calls.push(['drawImage', ...args]); },
  };
}

function makeCanvasFactory() {
  const created = [];
  return {
    created,
    createCanvas(width, height) {
      const ctx = makeContext();
      const canvas = {
        width,
        height,
        getContext(type) {
          assert.equal(type, '2d');
          return ctx;
        },
      };
      created.push({ canvas, ctx });
      return canvas;
    },
  };
}

class FakeImage {
  static instances = [];

  constructor() {
    FakeImage.instances.push(this);
  }

  set src(url) {
    this.url = url;
    queueMicrotask(() => {
      if (url.includes('missing')) this.onerror?.(new Error('404'));
      else this.onload?.();
    });
  }

  decode() {
    return Promise.resolve();
  }
}

class ControlledImage {
  static instances = [];
  static deferCounts = new Map();

  constructor() {
    ControlledImage.instances.push(this);
  }

  set src(url) {
    this.url = url;
    const remaining = ControlledImage.deferCounts.get(url) ?? 0;
    this.deferred = remaining > 0;
    if (this.deferred) ControlledImage.deferCounts.set(url, remaining - 1);
    else queueMicrotask(() => this.onload?.());
  }

  decode() {
    if (!this.deferred) return Promise.resolve();
    return new Promise(resolve => {
      this.resolveDecode = resolve;
    });
  }

  finishLoad() {
    this.onload?.();
  }

  finishDecode() {
    this.resolveDecode?.();
  }
}

test('render.js 兼容出口与 visuals.js 共享同一个 SHAPES 注册表', () => {
  assert.equal(facadeShapes, SHAPES);
  for (const id of ['circle', 'triangle', 'hexagon', 'pentagon', 'diamond'])
    assert.equal(typeof SHAPES[id], 'function', `${id} 未注册`);
  assert.equal(PARTS && typeof PARTS, 'object');
});

test('registerShape 只注册路径；drawVisual 传递坐标/半径并按 options 填充描边', () => {
  const id = 'test.shape.path';
  let received;
  registerShape(id, (ctx, x, y, r) => {
    received = { x, y, r };
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  });
  const ctx = makeContext();

  assert.equal(drawVisual(ctx, id, 12, 18, 7, {
    fillStyle: '#123456', strokeStyle: '#abcdef', lineWidth: 3,
  }), true);
  assert.deepEqual(received, { x: 12, y: 18, r: 7 });
  assert.equal(ctx.fillStyle, '#123456');
  assert.equal(ctx.strokeStyle, '#abcdef');
  assert.equal(ctx.lineWidth, 3);
  assert.equal(ctx.calls.filter(([name]) => name === 'fill').length, 1);
  assert.equal(ctx.calls.filter(([name]) => name === 'stroke').length, 1);
});

test('registerPart 的 drawFn 收到 ctx/size/params/phase，并在目标坐标绘制', () => {
  const id = 'test.part.eyes';
  const params = { style: 'angry', count: 2 };
  let received;
  registerPart(id, (ctx, size, gotParams, phase) => {
    received = { ctx, size, gotParams, phase };
    ctx.beginPath();
  });
  const ctx = makeContext();

  assert.equal(drawVisual(ctx, id, 4, 5, 9, { params, phase: 0.25 }), true);
  assert.equal(received.ctx, ctx);
  assert.equal(received.size, 9);
  assert.equal(received.gotParams, params);
  assert.equal(received.phase, 0.25);
  assert.deepEqual(ctx.calls.slice(0, 2), [['save'], ['translate', 4, 5]]);
  assert.deepEqual(ctx.calls.at(-1), ['restore']);
});

test('未知视觉 ID 回退到 circle，且同一 ID 只 console.warn 一次', () => {
  const id = 'test.visual.unknown';
  const ctx = makeContext();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  let first;
  let second;
  try {
    first = drawVisual(ctx, id, 3, 4, 5, { fillStyle: '#fff' });
    second = drawVisual(ctx, id, 3, 4, 5, { fillStyle: '#fff' });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(first, false);
  assert.equal(second, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /test\.visual\.unknown/);
  const arcs = ctx.calls.filter(([name]) => name === 'arc');
  assert.equal(arcs.length, 2);
  assert.deepEqual(arcs[0], ['arc', 3, 4, 5, 0, Math.PI * 2]);
  assert.equal(ctx.calls.filter(([name]) => name === 'fill').length, 2);
});

test('registerImage + preloadVisuals：成功解码后复用同一个 Image，clearCaches 后才重新加载', async () => {
  clearCaches();
  const originalImage = globalThis.Image;
  FakeImage.instances = [];
  globalThis.Image = FakeImage;
  const id = 'test.image.ok';
  const url = '/assets/test.png';
  try {
    registerImage(id, url);
    await preloadVisuals();
    assert.equal(FakeImage.instances.filter(image => image.url === url).length, 1);

    await preloadVisuals();
    assert.equal(FakeImage.instances.filter(image => image.url === url).length, 1);

    const ctx = makeContext();
    assert.equal(drawVisual(ctx, id, 10, 12, 8), true);
    const image = FakeImage.instances.find(item => item.url === url);
    const drawCall = ctx.calls.find(([name]) => name === 'drawImage');
    assert.equal(drawCall[1], image);
    assert.deepEqual(drawCall.slice(2), [2, 4, 16, 16]);

    clearCaches();
    await preloadVisuals();
    assert.equal(FakeImage.instances.filter(item => item.url === url).length, 2);
  } finally {
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});

test('图片加载失败回退 circle，且失败只输出一次 warning', async () => {
  clearCaches();
  const originalImage = globalThis.Image;
  const originalWarn = console.warn;
  const warnings = [];
  FakeImage.instances = [];
  globalThis.Image = FakeImage;
  console.warn = (...args) => warnings.push(args.join(' '));
  const id = 'test.image.missing';
  try {
    registerImage(id, '/assets/missing.png');
    await preloadVisuals();

    const factory = makeCanvasFactory();
    const canvas = getVisualCanvas(id, 32, { createCanvas: factory.createCanvas });
    assert.equal(canvas.width, 32);
    assert.equal(canvas.height, 32);
    assert.equal(factory.created.length, 1);
    assert.equal(factory.created[0].ctx.calls.filter(([name]) => name === 'arc').length, 1);

    drawVisual(factory.created[0].ctx, id, 16, 16, 8);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /test\.image\.missing/);
  } finally {
    console.warn = originalWarn;
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});

test('getVisualCanvas 按 id+size 命中；同尺寸复用、不同尺寸隔离，clearCaches 后重建', () => {
  clearCaches();
  const factory = makeCanvasFactory();
  const first = getVisualCanvas('circle', 32, { createCanvas: factory.createCanvas });
  const same = getVisualCanvas('circle', 32, { createCanvas: factory.createCanvas });
  const different = getVisualCanvas('circle', 48, { createCanvas: factory.createCanvas });

  assert.equal(first, same);
  assert.notEqual(first, different);
  assert.equal(factory.created.length, 2);
  assert.deepEqual([first.width, first.height], [32, 32]);
  assert.deepEqual([different.width, different.height], [48, 48]);

  clearCaches();
  const rebuilt = getVisualCanvas('circle', 32, { createCanvas: factory.createCanvas });
  assert.notEqual(rebuilt, first);
  assert.equal(factory.created.length, 3);
});

test('无 Image/DOM 时 preloadVisuals 不抛错，getVisualCanvas 返回安全尺寸对象', async () => {
  clearCaches();
  const originalImage = globalThis.Image;
  globalThis.Image = undefined;
  try {
    registerImage('test.image.no-runtime', '/assets/no-runtime.png');
    await assert.doesNotReject(preloadVisuals());
    const canvas = getVisualCanvas('circle', 24);
    assert.equal(canvas.width, 24);
    assert.equal(canvas.height, 24);
    assert.equal(typeof canvas.getContext, 'function');
  } finally {
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});

test('图片预加载成功后失效已缓存的 fallback Canvas', async () => {
  clearCaches();
  const originalImage = globalThis.Image;
  const id = 'test.image.cache-invalidation';
  const url = '/assets/cache-invalidation.png';
  const factory = makeCanvasFactory();
  ControlledImage.instances = [];
  ControlledImage.deferCounts = new Map([[url, 1]]);
  globalThis.Image = ControlledImage;
  try {
    registerImage(id, url);
    const fallback = getVisualCanvas(id, 32, { createCanvas: factory.createCanvas });
    const preload = preloadVisuals();
    const image = ControlledImage.instances.find(item => item.url === url);
    assert.ok(image);
    image.finishLoad();
    image.finishDecode();
    await preload;

    const canvas = getVisualCanvas(id, 32, { createCanvas: factory.createCanvas });
    assert.notEqual(canvas, fallback);
    assert.equal(factory.created.length, 2);
    const drawCall = factory.created[1].ctx.calls.find(([name]) => name === 'drawImage');
    assert.equal(drawCall[1], image);
  } finally {
    ControlledImage.deferCounts = new Map();
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});

test('清理并重新登记后忽略过期图片回调', async () => {
  clearCaches();
  const originalImage = globalThis.Image;
  const id = 'test.image.stale-callback';
  const oldUrl = '/assets/old.png';
  const newUrl = '/assets/new.png';
  ControlledImage.instances = [];
  ControlledImage.deferCounts = new Map([[oldUrl, 1], [newUrl, 1]]);
  globalThis.Image = ControlledImage;
  try {
    registerImage(id, oldUrl);
    const oldPreload = preloadVisuals();
    const oldImage = ControlledImage.instances.find(item => item.url === oldUrl);
    assert.ok(oldImage);

    clearCaches();
    registerImage(id, newUrl);
    const newPreload = preloadVisuals();
    const newImage = ControlledImage.instances.find(item => item.url === newUrl);
    assert.ok(newImage);
    newImage.finishLoad();
    newImage.finishDecode();
    await newPreload;

    oldImage.finishLoad();
    oldImage.finishDecode();
    await oldPreload;

    const ctx = makeContext();
    assert.equal(drawVisual(ctx, id, 10, 12, 8), true);
    const drawCall = ctx.calls.find(([name]) => name === 'drawImage');
    assert.equal(drawCall[1], newImage);
    assert.equal(drawCall[1].url, newUrl);
  } finally {
    ControlledImage.deferCounts = new Map();
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});

test('getLoadedImage 只读 IMAGE_CACHE，未注册/未加载/加载失败均返回 null 且不触发加载与告警', async () => {
  const originalWarn = console.warn;
  const warnedLogs = [];
  console.warn = msg => warnedLogs.push(msg);

  const originalImage = globalThis.Image;
  try {
    globalThis.Image = FakeImage;
    clearCaches();

    // 1. 未注册 id 返回 null
    assert.equal(getLoadedImage('unknown.id.never.registered'), null);
    assert.equal(warnedLogs.length, 0, 'getLoadedImage 查询未注册 id 不得产生 warning');

    // 2. 注册但未预加载返回 null
    registerImage('test.image.pending', 'assets/pending.png');
    assert.equal(getLoadedImage('test.image.pending'), null);
    assert.equal(warnedLogs.length, 0, 'getLoadedImage 查询未就绪 id 不得产生 warning');

    // 3. 加载失败返回 null
    registerImage('test.image.fail', 'assets/missing-asset.png');
    await preloadVisuals();
    assert.equal(getLoadedImage('test.image.fail'), null);

    // 4. 成功预加载后返回 Image 实例
    registerImage('test.image.ready', 'assets/ready.png');
    await preloadVisuals();
    const loaded = getLoadedImage('test.image.ready');
    assert.ok(loaded);
    assert.equal(loaded.url, 'assets/ready.png');

    // 5. clearCaches 后清空缓存返回 null
    clearCaches();
    assert.equal(getLoadedImage('test.image.ready'), null);
  } finally {
    console.warn = originalWarn;
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});
