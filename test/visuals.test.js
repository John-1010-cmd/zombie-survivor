// test/visuals.test.js —— 统一视觉注册表：图片预加载、失败回退与离屏缓存（设计 §1.2/§1.4/§9）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCaches, drawVisual, getLoadedImage, getVisualCanvas, preloadVisuals,
  registerImage, registerPart, registerShape, SHAPES, PARTS,
} from '../src/core/visuals.js';
import { SHAPES as facadeShapes, drawPlayer } from '../src/entities/render.js';
import { createPlayer } from '../src/entities/player.js';

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

test('atlas 与 crop 视觉就绪时精确传递 9 参 drawImage（切片与目标区域换算），未匹配帧显式回退', async () => {
  clearCaches();
  const originalImage = globalThis.Image;
  FakeImage.instances = [];
  globalThis.Image = FakeImage;

  try {
    const spriteId = 'skin.wastelandAdventurer.sprite';
    const portraitId = 'skin.wastelandAdventurer.portrait';
    const spritePath = 'assets/img/skins/wasteland-adventurer/sprite.png';

    registerImage(spriteId, spritePath);
    registerImage(portraitId, spritePath);
    await preloadVisuals();

    const spriteImage = getLoadedImage(spriteId);
    const portraitImage = getLoadedImage(portraitId);
    assert.ok(spriteImage, 'sprite 图片必须通过 FakeImage 预加载成功');
    assert.ok(portraitImage, 'portrait 图片必须通过 FakeImage 预加载成功');

    // ① sprite 切片：测试 right 方向第 0 帧，模拟生产路径 drawPlayer 传入 x=100, y=100, size=32
    {
      const ctx = makeContext();
      const drawn = drawVisual(ctx, spriteId, 100, 100, 32, {
        frame: { direction: 'right', index: 0 },
      });
      assert.equal(drawn, true, '图集切片绘制应返回 true');

      const drawCalls = ctx.calls.filter(([name]) => name === 'drawImage');
      assert.equal(drawCalls.length, 1, '应产生且仅产生 1 次 drawImage 调用');

      // 精确断言 9 参：(image, sx, sy, sw, sh, dx, dy, dw, dh)
      // right/frame 0: sx=256, sy=0, sw=128, sh=128
      // dest: x-size = 100-32 = 68, y-size = 100-32 = 68, size*2 = 64, size*2 = 64
      assert.equal(drawCalls[0][1], spriteImage, '参数 1 必须为预加载 Image 实例');
      assert.equal(drawCalls[0][2], 256, '参数 2 (sx) 必须来自 SKIN_FRAME_ORDER right/0');
      assert.equal(drawCalls[0][3], 0, '参数 3 (sy) 必须来自 SKIN_FRAME_ORDER right/0');
      assert.equal(drawCalls[0][4], 128, '参数 4 (sw) 必须为帧宽 128');
      assert.equal(drawCalls[0][5], 128, '参数 5 (sh) 必须为帧高 128');
      assert.equal(drawCalls[0][6], 68, '参数 6 (dx) 应为 x - size (100 - 32 = 68)');
      assert.equal(drawCalls[0][7], 68, '参数 7 (dy) 应为 y - size (100 - 32 = 68)');
      assert.equal(drawCalls[0][8], 64, '参数 8 (dw) 应为 size * 2 (32 * 2 = 64)');
      assert.equal(drawCalls[0][9], 64, '参数 9 (dh) 应为 size * 2 (32 * 2 = 64)');
    }

    // ①b 额外验证跨行跨列帧（up 方向第 1 帧），验证坐标换算无行列颠倒
    {
      const ctx = makeContext();
      const drawn = drawVisual(ctx, spriteId, 200, 150, 16, {
        frame: { direction: 'up', index: 1 },
      });
      assert.equal(drawn, true);
      const drawCalls = ctx.calls.filter(([name]) => name === 'drawImage');
      assert.equal(drawCalls.length, 1);
      // up/frame 1: sx=384, sy=128, sw=128, sh=128
      // dest: 200 - 16 = 184, 150 - 16 = 134, 16 * 2 = 32, 16 * 2 = 32
      assert.deepEqual(drawCalls[0].slice(1), [
        spriteImage,
        384, 128, 128, 128,
        184, 134, 32, 32,
      ]);
    }

    // ② portrait 的 crop 切片：x=50, y=50, size=24
    {
      const ctx = makeContext();
      const drawn = drawVisual(ctx, portraitId, 50, 50, 24);
      assert.equal(drawn, true, 'portrait crop 绘制应返回 true');

      const drawCalls = ctx.calls.filter(([name]) => name === 'drawImage');
      assert.equal(drawCalls.length, 1, '应产生且仅产生 1 次 drawImage 调用');

      // crop: sx=0, sy=0, sw=128, sh=128
      // dest: 50-24=26, 50-24=26, 24*2=48, 24*2=48
      assert.equal(drawCalls[0][1], portraitImage, '参数 1 必须为预加载 Image 实例');
      assert.equal(drawCalls[0][2], 0, '参数 2 (crop.x) 必须为 0');
      assert.equal(drawCalls[0][3], 0, '参数 3 (crop.y) 必须为 0');
      assert.equal(drawCalls[0][4], 128, '参数 4 (crop.width) 必须为 128');
      assert.equal(drawCalls[0][5], 128, '参数 5 (crop.height) 必须为 128');
      assert.equal(drawCalls[0][6], 26, '参数 6 (dx) 应为 50 - 24 = 26');
      assert.equal(drawCalls[0][7], 26, '参数 7 (dy) 应为 50 - 24 = 26');
      assert.equal(drawCalls[0][8], 48, '参数 8 (dw) 应为 24 * 2 = 48');
      assert.equal(drawCalls[0][9], 48, '参数 9 (dh) 应为 24 * 2 = 48');
    }

    // ③ frame 不匹配时显式回退而非静默画整图
    {
      const ctx = makeContext();
      let fallbackTriggered = false;
      const drawn = drawVisual(ctx, spriteId, 100, 100, 32, {
        frame: { direction: 'invalidDirection', index: 99 },
        onFallback: () => { fallbackTriggered = true; },
      });
      assert.equal(drawn, false, '未匹配帧应返回 false');
      assert.equal(fallbackTriggered, true, '未匹配帧应触发 onFallback 回调');
      const drawCalls = ctx.calls.filter(([name]) => name === 'drawImage');
      assert.equal(drawCalls.length, 0, '未匹配帧不得调用 drawImage（严禁静默画整图）');
      const arcs = ctx.calls.filter(([name]) => name === 'arc');
      assert.equal(arcs.length, 0, '提供 onFallback 时未匹配帧不得调用内置 paintFallback 绘制占位圆');
    }

    // ③b frame 不匹配且未提供 onFallback 时显式回退到内置 paintFallback
    {
      const ctx = makeContext();
      const drawn = drawVisual(ctx, spriteId, 100, 100, 32, {
        frame: { direction: 'invalidDirection', index: 99 },
        warn: false,
      });
      assert.equal(drawn, false);
      const drawCalls = ctx.calls.filter(([name]) => name === 'drawImage');
      assert.equal(drawCalls.length, 0, '未匹配帧不得调用 drawImage');
      const arcs = ctx.calls.filter(([name]) => name === 'arc');
      assert.equal(arcs.length, 1, '未提供 onFallback 时未匹配帧应调用内置 paintFallback');
      assert.deepEqual(arcs[0], ['arc', 100, 100, 32, 0, Math.PI * 2]);
    }
  } finally {
    clearCaches();
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});

test('图片未就绪或回退时，若调用方提供 onFallback 则跳过内置 paintFallback，未提供则绘制占位圆', () => {
  clearCaches();

  // 1. 未注册视觉 ID，提供 onFallback：只调回调，跳过内置 paintFallback（无 arc/fill）
  {
    const ctx = makeContext();
    let fallbackCalled = false;
    const drawn = drawVisual(ctx, 'unregistered.id', 100, 100, 16, {
      warn: false,
      onFallback: () => { fallbackCalled = true; },
    });
    assert.equal(drawn, false);
    assert.equal(fallbackCalled, true);
    const arcs = ctx.calls.filter(([name]) => name === 'arc');
    assert.equal(arcs.length, 0, '提供 onFallback 时不得调用内置 paintFallback 绘制占位圆');
  }

  // 2. 未注册视觉 ID，未提供 onFallback：调用内置 paintFallback
  {
    const ctx = makeContext();
    const drawn = drawVisual(ctx, 'unregistered.id.no.fallback', 100, 100, 16, {
      warn: false,
    });
    assert.equal(drawn, false);
    const arcs = ctx.calls.filter(([name]) => name === 'arc');
    assert.equal(arcs.length, 1, '未提供 onFallback 时应调用内置 paintFallback');
    assert.deepEqual(arcs[0], ['arc', 100, 100, 16, 0, Math.PI * 2]);
  }

  // 3. 已注册但未就绪图片，提供 onFallback：跳过内置 paintFallback
  {
    registerImage('test.pending.image', 'assets/pending.png');
    const ctx = makeContext();
    let fallbackCalled = false;
    const drawn = drawVisual(ctx, 'test.pending.image', 80, 80, 20, {
      warn: false,
      onFallback: () => { fallbackCalled = true; },
    });
    assert.equal(drawn, false);
    assert.equal(fallbackCalled, true);
    const arcs = ctx.calls.filter(([name]) => name === 'arc');
    assert.equal(arcs.length, 0, '未就绪图片提供 onFallback 时不得画内置占位圆');
  }

  // 4. 已注册但未就绪图片，未提供 onFallback：绘制内置占位圆
  {
    const ctx = makeContext();
    const drawn = drawVisual(ctx, 'test.pending.image', 80, 80, 20, {
      warn: false,
    });
    assert.equal(drawn, false);
    const arcs = ctx.calls.filter(([name]) => name === 'arc');
    assert.equal(arcs.length, 1);
    assert.deepEqual(arcs[0], ['arc', 80, 80, 20, 0, Math.PI * 2]);
  }

  // 5. 端到端验证：drawPlayer 在皮肤未就绪时仅回退绘制白色圆球小人，无内置霓绿占位圆双重绘制
  {
    const player = createPlayer(100, 100);
    const ctx = makeContext();
    drawPlayer(ctx, player, 0, {
      skins: { owned: ['wastelandAdventurer'], selected: 'wastelandAdventurer' },
    });
    const arcs = ctx.calls.filter(([name]) => name === 'arc');
    assert.equal(arcs.length, 1, 'drawPlayer 仅绘制白色小人圆，不得叠画霓绿占位圆');
    assert.equal(arcs[0][1], 100);
    assert.equal(arcs[0][2], 100);
    assert.equal(arcs[0][3], 16, '绘制半径必须为 player.r (16)，不得为 size (32)');
  }
});
