# UI / 视觉全面改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 zombie-survivor 的 UI 与视觉从几何原型升级为暗黑霓虹赛璐璐体系——响应式铺满画布、统一视觉注册表、全套 PNG 图标、火炮/围墙/辅助武器/场景组合建模、主角皮肤系统、图鉴强关联。

**Architecture:** 混合美术路线：UI 图标与主角皮肤使用 k3-256k 生成的 128×128 透明底 PNG（manifest 登记）；障碍物、补给站、暗色草地、地雷、特斯拉球与直升机优先使用场景 PNG 精灵/纹理，图片未就绪或加载失败时保留程序化 fallback；怪物、弹道、部署物、辅助武器与纯 UI 覆盖层保持程序化几何矢量，统一收口到 `src/core/visuals.js` 注册表（形状+部件+图片三类视觉，游戏内与图鉴同源渲染）。响应式 canvas = 窗口×min(DPR,2)，逻辑坐标保持 CSS 像素。

**Tech Stack:** 原生 JavaScript ES Modules + Canvas 2D；无构建工具；测试 `node --test`（node:test + node:assert/strict）；图片资产经 gpt-image-review 技能由 k3-256k 生成与审美评审；编码/文档/截图验收由 gpt-5.6-luna-fast 执行。

**Spec:** `docs/superpowers/specs/2026-09-02-ui-visual-overhaul-design.md`（本计划逐项实现该 spec；执行者须同读）

> 2026-09-04 修订：新增 Task 15A/15B，Task 16/17 场景物件改 PNG 精灵路线，依据 spec 0.2a（docs/superpowers/specs/2026-09-02-ui-visual-overhaul-design.md）。

## Global Constraints

- 技术栈：原生 ES Modules + Canvas 2D，无构建工具、无框架；禁止引入新依赖。
- 测试：`npm test` = `node --test`；TDD——先写/改测试再实现；每任务一次 commit，提交信息用中文 `UI改造任务N: …` 风格。
- 性能红线：DPR 上限 `min(devicePixelRatio, 2)`；现有满载压测场景连续 5s 平均帧时 ≤20ms；地形 tile 预渲染平铺、禁止每帧重建；`getVisualCanvas` 按 `id+size` 键控缓存；同帧 `drawImage` 次数受控。
- 色彩：canvas 内禁止新增硬编码十六进制色值，一律走 `src/config/palette.js` 的 `PALETTE`（与 `style.css :root` 同源）。
- 资产：UI PNG 统一 128×128 透明底并使用 prompt 模板 `neon-cel-v1`；场景 PNG 按 Task 15A 的 256×256/128×128 原子尺寸并使用 `neon-cel-scene-v1`（模板均为 `docs/superpowers/visual-asset-prompt-template.md`）；出图先样图验收再批量；不合格不登记 manifest；生成失败用程序化 fallback（`promptVersion: 'placeholder-v0'`）先保证代码不阻塞。
- 非目标（spec §12，严禁触碰）：音频、`src/core/storage.js`（`zs_best`/`zs_settings`）、武器伤害公式、玩法逻辑数值（怪物数值/刷怪预算/AI/碰撞/地图尺寸/商店半径/部署物耐久/辅助武器 orbit 与角速）。
- 接口契约：跨任务的函数名/字段名/视觉 ID 以各任务 `Interfaces` 块为准，禁止改名。
- 验收：每个任务包完成后用 webbridge 实景截图与 spec 目标逐项核对；不能只凭 import/编译通过判定完成。
- Node 测试不依赖真实 PNG 像素与 DOM：配置字段/manifest/契约断言即可；无 DOM 环境使用 palette 安全默认值。

---

### Task 1: Canvas 调色板令牌与视觉缓存失效通知

**Files:**
- Create: `src/config/palette.js`
- Test: `test/palette.test.js`

**Interfaces:**
- Consumes: 无前置任务接口；浏览器运行时读取 `document.documentElement` 的 CSS `:root` 令牌，Node 测试无 DOM 时不读取外部对象。
- Produces: `export const PALETTE`，字段固定为 `bg`、`panel`、`neon`、`neonDim`、`gold`、`text`、`textDim`、`ground`、`obstacle`、`hudPanel`、`boundary`；`export function initPalette()`；`export function onPaletteChange(listener)`，返回取消订阅函数，供后续 `visuals.js` 注册 `clearCaches`。

- [ ] **Step 1: 写失败测试**

在 `test/palette.test.js` 写入完整测试，覆盖 Node 安全默认、浏览器 `getComputedStyle` 映射，以及令牌真正变化时通知一次、重复读取不重复通知、取消订阅后不再通知：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, initPalette, onPaletteChange } from '../src/config/palette.js';

const DEFAULT_PALETTE = {
  bg: '#0d1210',
  panel: 'rgba(13,18,16,.92)',
  neon: '#5eff8a',
  neonDim: '#2a4a3a',
  gold: '#ffd75e',
  text: '#e6f2ea',
  textDim: '#9fb5a8',
  ground: '#1a2418',
  obstacle: '#4a4a52',
  hudPanel: '#122019',
  boundary: '#2a4a3a',
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/palette.test.js`

Expected: FAIL，首先报 `ERR_MODULE_NOT_FOUND`，因为 `../src/config/palette.js` 尚未创建。

- [ ] **Step 3: 最小实现**

创建 `src/config/palette.js`。默认值与 `style.css :root` 同源；浏览器只覆盖存在的 CSS 令牌，`--canvas-boundary` 缺失时复用 `--neon-dim`；任何实际变化都以快照通知订阅者，Node 无 DOM 时恢复安全默认且不抛异常：

```js
const DEFAULT_PALETTE = {
  bg: '#0d1210',
  panel: 'rgba(13,18,16,.92)',
  neon: '#5eff8a',
  neonDim: '#2a4a3a',
  gold: '#ffd75e',
  text: '#e6f2ea',
  textDim: '#9fb5a8',
  ground: '#1a2418',
  obstacle: '#4a4a52',
  hudPanel: '#122019',
  boundary: '#2a4a3a',
};
const PALETTE_KEYS = [
  'bg', 'panel', 'neon', 'neonDim', 'gold', 'text', 'textDim',
  'ground', 'obstacle', 'hudPanel', 'boundary',
];

export const PALETTE = Object.assign({}, DEFAULT_PALETTE);
const listeners = new Set();

function readToken(styles, name, fallback) {
  const value = styles.getPropertyValue(name);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function applyPalette(next) {
  const changed = PALETTE_KEYS.some(key => PALETTE[key] !== next[key]);
  if (!changed) return;
  Object.assign(PALETTE, next);
  const snapshot = Object.assign({}, PALETTE);
  for (const listener of listeners) listener(snapshot);
}

export function onPaletteChange(listener) {
  if (typeof listener !== 'function') throw new TypeError('listener 必须是函数');
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initPalette() {
  const doc = globalThis.document;
  const getStyles = globalThis.getComputedStyle || globalThis.window?.getComputedStyle;
  if (!doc?.documentElement || typeof getStyles !== 'function') {
    applyPalette(DEFAULT_PALETTE);
    return PALETTE;
  }

  const styles = getStyles.call(globalThis.window || globalThis, doc.documentElement);
  const next = {
    bg: readToken(styles, '--bg', DEFAULT_PALETTE.bg),
    panel: readToken(styles, '--panel', DEFAULT_PALETTE.panel),
    neon: readToken(styles, '--neon', DEFAULT_PALETTE.neon),
    neonDim: readToken(styles, '--neon-dim', DEFAULT_PALETTE.neonDim),
    gold: readToken(styles, '--gold', DEFAULT_PALETTE.gold),
    text: readToken(styles, '--text', DEFAULT_PALETTE.text),
    textDim: readToken(styles, '--text-dim', DEFAULT_PALETTE.textDim),
    ground: readToken(styles, '--canvas-ground', DEFAULT_PALETTE.ground),
    obstacle: readToken(styles, '--canvas-obstacle', DEFAULT_PALETTE.obstacle),
    hudPanel: readToken(styles, '--canvas-hud-panel', DEFAULT_PALETTE.hudPanel),
    boundary: readToken(
      styles,
      '--canvas-boundary',
      readToken(styles, '--neon-dim', DEFAULT_PALETTE.boundary),
    ),
  };
  applyPalette(next);
  return PALETTE;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/palette.test.js`

Expected: 3 个用例全部 PASS；随后运行 `npm test`，现有测试全部 PASS，Node 测试环境不因 `document` 缺失报错。

- [ ] **Step 5: 提交**

```bash
git add src/config/palette.js test/palette.test.js
git commit -m "UI改造任务1: 新增 Canvas 调色板令牌"
```

### Task 2: 响应式 Canvas、DPR 上限与动态相机视口

**Files:**
- Modify: `src/core/engine.js:1-19`
- Modify: `src/core/camera.js:1-14`
- Modify: `src/main.js:1-31,101-133`
- Modify: `src/game.js:51-65,89-130,524-718`
- Create: `test/resize.test.js`
- Modify: `test/camera.test.js:1-24`

**Interfaces:**
- Consumes: Task 1 的 `initPalette()`；现有 `createCamera(w, h)` 与场景 `{ update(dt), render(ctx), paused }` 接口。
- Produces: `export function fitCanvas(canvas, ctx) → { width, height, dpr }`；`createEngine(canvas)` 启动时同步 fit、监听 `window.resize` 并以单个 rAF 合并 resize，额外提供 `getViewport() → { width, height, dpr }`；相机实例提供 `setViewport(w, h)`；游戏场景提供 `viewport` 与 `setViewport(w, h)`，并以 `render(ctx, viewport)` 接收逻辑 CSS 视口。

- [ ] **Step 1: 写失败测试**

新建 `test/resize.test.js`，并把 `test/camera.test.js` 完整改写为 CSS 逻辑视口断言。测试使用最小 Canvas/2D 假对象，不创建 DOM、不读取真实 PNG：

```js
// test/resize.test.js
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
```

将 `test/camera.test.js` 替换为：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { createCamera, updateCamera, addShake } from '../src/core/camera.js';

test('跟随并夹紧在传入的 CSS 逻辑视口', () => {
  const cam = createCamera(800, 600);
  updateCamera(cam, { x: 0, y: 0 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 0);
  assert.equal(cam.y, 0);
  updateCamera(cam, { x: 3000, y: 3000 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 2200);
  assert.equal(cam.y, 2400);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 1100);
  assert.equal(cam.y, 1200);
});

test('setViewport 更新相机逻辑宽高而不改变位置与震屏状态', () => {
  const cam = createCamera(1280, 720);
  cam.x = 300;
  cam.y = 400;
  cam.shakeMag = 8;
  cam.shakeT = 0.1;
  assert.equal(cam.setViewport(640, 360), cam);
  assert.equal(cam.viewW, 640);
  assert.equal(cam.viewH, 360);
  assert.equal(cam.x, 300);
  assert.equal(cam.y, 400);
  assert.equal(cam.shakeMag, 8);
  assert.equal(cam.shakeT, 0.1);
});

test('震屏偏移在 0.15s 后归零', () => {
  const cam = createCamera(800, 600);
  const rng = mulberry32(9);
  addShake(cam, 8);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, rng, 0.05);
  assert.ok(cam.offX !== 0 || cam.offY !== 0);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, rng, 0.2);
  assert.equal(cam.offX, 0);
  assert.equal(cam.offY, 0);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/resize.test.js`

Expected: FAIL，报 `The requested module '../src/core/engine.js' does not provide an export named 'fitCanvas'`。

Run: `node --test test/camera.test.js`

Expected: FAIL，`cam.setViewport is not a function`；固定 1280×720 断言也尚未改为 CSS 视口目标。

- [ ] **Step 3: 最小实现**

将 `src/core/engine.js` 替换为以下完整实现。构造引擎时同步执行一次 `fitCanvas`；resize 回调只排队一个 rAF；每帧在场景绘制前重新写入 DPR transform，并把逻辑视口作为第二参数传给 `scene.render`：

```js
import { createLoop, advance } from './loop.js';

export function fitCanvas(canvas, ctx) {
  const win = globalThis.window;
  const cssWidth = Math.max(1, win?.innerWidth ?? canvas.clientWidth ?? canvas.width ?? 1);
  const cssHeight = Math.max(1, win?.innerHeight ?? canvas.clientHeight ?? canvas.height ?? 1);
  const dpr = Math.min(win?.devicePixelRatio || 1, 2);

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { width: cssWidth, height: cssHeight, dpr };
}

export function createEngine(canvas) {
  const ctx = canvas.getContext('2d');
  const loop = createLoop();
  let scene = null;
  let viewport = fitCanvas(canvas, ctx);
  let resizeQueued = false;

  function applyResize() {
    resizeQueued = false;
    viewport = fitCanvas(canvas, ctx);
    if (scene?.setViewport) scene.setViewport(viewport.width, viewport.height);
  }

  function scheduleResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(applyResize);
  }

  function frame(now) {
    const steps = advance(loop, now);
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    if (scene) {
      if (!scene.paused) for (let i = 0; i < steps; i++) scene.update(loop.step);
      scene.render(ctx, viewport);
    }
    requestAnimationFrame(frame);
  }

  if (globalThis.window?.addEventListener) {
    globalThis.window.addEventListener('resize', scheduleResize);
  }

  return {
    setScene(s) {
      scene = s;
      if (scene?.setViewport) scene.setViewport(viewport.width, viewport.height);
    },
    getViewport() {
      return Object.assign({}, viewport);
    },
    start() {
      requestAnimationFrame(frame);
    },
  };
}
```

将 `src/core/camera.js` 替换为以下完整实现，保留现有相机字段和震屏逻辑，只增加实例方法 `setViewport(w, h)`：

```js
export function createCamera(viewW, viewH) {
  return {
    x: 0,
    y: 0,
    viewW,
    viewH,
    shakeMag: 0,
    shakeT: 0,
    offX: 0,
    offY: 0,
    setViewport(w, h) {
      this.viewW = w;
      this.viewH = h;
      return this;
    },
  };
}

export function addShake(cam, mag) {
  cam.shakeMag = mag;
  cam.shakeT = 0.15;
}

export function updateCamera(cam, target, mapSize, rng, dt) {
  cam.x = Math.max(0, Math.min(mapSize - cam.viewW, target.x - cam.viewW / 2));
  cam.y = Math.max(0, Math.min(mapSize - cam.viewH, target.y - cam.viewH / 2));
  if (cam.shakeT > 0) {
    cam.shakeT -= dt;
    const m = cam.shakeMag * Math.max(0, cam.shakeT) / 0.15;
    cam.offX = (rng() * 2 - 1) * m || 0;
    cam.offY = (rng() * 2 - 1) * m || 0;
  } else {
    cam.offX = 0;
    cam.offY = 0;
  }
}
```

在 `src/main.js` 的 import 区加入 `import { initPalette } from './config/palette.js';`，并在元素引用完成后、`createEngine` 前调用 `initPalette()`；对应启动片段应为：

```js
const canvas = document.getElementById('game');
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const shopEl = document.getElementById('shop');
const gameoverEl = document.getElementById('gameover');
const devEl = document.getElementById('dev');
const levelsEl = document.getElementById('levels');
const bestiaryEl = document.getElementById('bestiary');
const upgradesEl = document.getElementById('upgrades');

initPalette();
const engine = createEngine(canvas);
const settings = loadSettings();
const audio = createAudio(settings);
const meta = loadMeta();
let currentScene = null;
```

在 `startGame` 的 `createGameScene` 参数对象中紧跟 `canvas,` 插入以下真实字段：

```js
  viewport: engine.getViewport(),
```

在 `src/game.js` 中将依赖解构、视口初始化和相机创建替换为：

```js
export function createGameScene(deps) {
  const {
    canvas,
    viewport: initialViewport = null,
    input,
    mode = 'endless',
    levelId = null,
    audio,
    settings,
    meta = null,
    onGameOver,
  } = deps;
  const isAdventure = mode === 'adventure';
  const advLevel = isAdventure ? adventureLevelById(levelId) : null;
  if (isAdventure && !advLevel) throw new Error('未知冒险关卡: ' + levelId);
  const modeCfg = isAdventure ? null : (MODES[mode] || MODES.endless);
  const cfgFn = isAdventure ? makeAdventureCfg(advLevel) : modeCfg.getCfg;
  const segLen = isAdventure ? ADVENTURE_TIER_DURATION : (mode === 'holdout10' ? HOLDOUT10_SEGMENT : TIER_DURATION);
  const scalingCtx = { mode, level: isAdventure ? adventureLevelIndex(levelId) : 1 };

  const rng = mulberry32((Math.random() * 2 ** 31) | 0);
  const map = generateMap(rng);
  const player = createPlayer(map.spawn.x, map.spawn.y);
  const viewport = {
    width: Math.max(1, initialViewport?.width ?? canvas.clientWidth ?? canvas.width ?? 1),
    height: Math.max(1, initialViewport?.height ?? canvas.clientHeight ?? canvas.height ?? 1),
  };
  const camera = createCamera(viewport.width, viewport.height);
```

在当前 `const scene = {` 定义之前加入视口更新函数，并把 `viewport`、`setViewport` 放入场景公开接口：

```js
  function setViewport(width, height) {
    viewport.width = Math.max(1, width);
    viewport.height = Math.max(1, height);
    camera.setViewport(viewport.width, viewport.height);
  }

  const scene = {
    update,
    render,
    viewport,
    setViewport,
    paused: false,
```

将 `src/game.js` 的 `render` 函数签名和所有仅用于屏幕清除/横幅居中的物理 Canvas 尺寸引用替换为逻辑视口引用；不改动本任务范围外的场景颜色和实体渲染逻辑：

```js
  function render(ctx, renderViewport = viewport) {
    const W = renderViewport.width;
    const H = renderViewport.height;
    ctx.fillStyle = '#1a2418';
    ctx.fillRect(0, 0, W, H);
```

在同一 `render` 函数中，把横幅的两处尺寸引用替换为：

```js
      ctx.fillRect(W / 2 - 220, 60, 440, 56);
      ctx.fillStyle = '#ffd75e';
      ctx.font = '34px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(scene.banner.text, W / 2, 99);
```

把 `renderHud(ctx, scene);` 替换为 `renderHud(ctx, scene, renderViewport);`。这样清屏、横幅和后续 HUD 都使用 CSS 逻辑视口；`canvas.width`、`canvas.height` 不再参与相机或屏幕布局。

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/resize.test.js`

Expected: 2 个用例全部 PASS，包含 `{ width: 801, height: 603, dpr: 2 }`、物理尺寸 `1602×1206`、`setTransform(2,0,0,2,0,0)` 与 resize rAF 合并。

Run: `node --test test/camera.test.js`

Expected: 3 个用例全部 PASS，中心视口为 `800×600`，`setViewport(640,360)` 不重置位置/震屏字段。

Run: `npm test`

Expected: 全部现有测试 PASS；resize 只调用场景 `setViewport`，不调用 `update`，不改变实体、弹道、计时器或战斗逻辑。

- [ ] **Step 5: 提交**

```bash
git add src/core/engine.js src/core/camera.js src/main.js src/game.js test/resize.test.js test/camera.test.js
git commit -m "UI改造任务2: 响应式画布与动态相机视口"
```

### Task 3: HUD 四角锚定、逻辑视口布局与全视口 Canvas CSS

**Files:**
- Modify: `index.html:10-18`
- Modify: `style.css:12-31`
- Modify: `src/systems/hud.js:1-108`
- Modify: `test/hud.test.js:1-18`

**Interfaces:**
- Consumes: Task 1 的 `PALETTE`；Task 2 的 `scene.viewport` 与 `render(ctx, viewport)`；`ITEM_IDS` 五槽顺序、`WEAPONS`、`ENHANCE_STATS`、`STAT_LABEL`、`AUX_CONFIG` 和 `adventureTierProgress` 现有数据接口。
- Produces: `renderHud(ctx, game, viewport)`，只读取传入的 `viewport.width` / `viewport.height`，不读取 `ctx.canvas.width` / `ctx.canvas.height`；HUD 颜色全部来自 `PALETTE`；`style.css :root` 提供 `--canvas-ground`、`--canvas-obstacle`、`--canvas-hud-panel`、`--canvas-boundary`，Canvas 与 `#ui-overlay` 都跟随窗口视口。

- [ ] **Step 1: 写失败测试**

将 `test/hud.test.js` 替换为以下完整测试。录制上下文不提供 `canvas` 字段，旧实现会因读取 `ctx.canvas.width` 直接失败；新断言同时锁定四角坐标、五个槽位、颜色令牌、动态窄视口和右下短提示：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/config/palette.js';
import { formatTime, adventureTierProgress, renderHud } from '../src/systems/hud.js';

function makeContext() {
  const ctx = {
    calls: [],
    font: '',
    textAlign: 'left',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      this.calls.push({ op: 'fillRect', args: [x, y, w, h], fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
    },
    strokeRect(x, y, w, h) {
      this.calls.push({ op: 'strokeRect', args: [x, y, w, h], strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha });
    },
    fillText(text, x, y) {
      this.calls.push({ op: 'fillText', args: [text, x, y], fillStyle: this.fillStyle, textAlign: this.textAlign, globalAlpha: this.globalAlpha });
    },
  };
  return ctx;
}

function makeGame() {
  return {
    player: { hp: 75, maxHp: 100 },
    coins: 7,
    time: 65,
    mode: 'endless',
    kills: 12,
    weapon: {
      id: 'pistol',
      enhance: { damage: 1, fireRate: 2, projectiles: 0, range: 3 },
    },
    inventory: { medkit: 2, magnet: 1, bomb: 0, turret: 1, wall: 0 },
    aux: { counts: { drone: 1, gunner: 0, sniper: 0 } },
  };
}

function textCalls(ctx) {
  return ctx.calls.filter(call => call.op === 'fillText');
}

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

test('renderHud 使用传入逻辑视口并按四角锚定，颜色来自 PALETTE', () => {
  const ctx = makeContext();
  renderHud(ctx, makeGame(), { width: 800, height: 600 });
  const hpBackground = ctx.calls.find(call => call.op === 'fillRect' && call.args[0] === 16 && call.args[1] === 16 && call.args[2] === 220 && call.args[3] === 16);
  assert.ok(hpBackground);
  assert.equal(hpBackground.fillStyle, PALETTE.hudPanel);
  const texts = textCalls(ctx);
  assert.ok(texts.some(call => call.args[0] === '01:05' && call.args[1] === 784 && call.args[2] === 24 && call.fillStyle === PALETTE.text));
  assert.ok(texts.some(call => call.args[0] === '击杀 12' && call.args[1] === 784 && call.args[2] === 44 && call.fillStyle === PALETTE.text));
  assert.ok(texts.some(call => call.args[0].includes('手枪') && call.args[1] === 16 && call.args[2] === 584 && call.fillStyle === PALETTE.text));
  const slotStrokes = ctx.calls.filter(call => call.op === 'strokeRect');
  assert.equal(slotStrokes.length, 5);
  assert.deepEqual(slotStrokes.map(call => call.args[0]), [16, 118, 220, 322, 424]);
  assert.ok(slotStrokes.every(call => call.args[1] === 554 && call.args[2] === 96 && call.args[3] === 22));
});

test('窄视口仍使用动态右边界，右下只绘制交互提示，倒计时警示使用 PALETTE.gold', () => {
  const ctx = makeContext();
  const game = makeGame();
  game.mode = 'holdout10';
  game.duration = 100;
  game.time = 50;
  game.interactionPrompt = '靠近商店';
  renderHud(ctx, game, { width: 400, height: 300 });
  const texts = textCalls(ctx).filter(call => call.args[1] === 384);
  assert.deepEqual(texts.map(call => call.args[0]), ['00:50', '击杀 12', '靠近商店']);
  assert.equal(texts[0].fillStyle, PALETTE.gold);
  assert.equal(texts[2].args[2], 284);
  const slotStrokes = ctx.calls.filter(call => call.op === 'strokeRect');
  assert.equal(slotStrokes.length, 5);
  for (const call of slotStrokes) assert.ok(call.args[0] + call.args[2] <= 384);
  assert.equal(ctx.calls.filter(call => call.op === 'fillText' && call.args[1] === 1264).length, 0);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/hud.test.js`

Expected: FAIL，旧 `renderHud(ctx, game)` 读取不存在的 `ctx.canvas.width`，报 `TypeError: Cannot read properties of undefined (reading 'width')`。

- [ ] **Step 3: 最小实现**

将 `src/systems/hud.js` 替换为以下完整实现。布局只使用传入的逻辑 CSS 像素视口；左上绘制血条/银币，右上绘制时间/击杀，左下固定五个道具槽和武器信息，右下只在存在 `game.interactionPrompt` 时绘制短提示；Canvas 颜色全部从 `PALETTE` 读取：

```js
// src/systems/hud.js —— HUD 渲染（逻辑 CSS 视口）+ formatTime 纯函数。
import { WEAPONS, ENHANCE_STATS, STAT_LABEL } from '../config/bestiary/weapons.js';
import { ITEMS, ITEM_IDS } from '../config/items.js';
import { AUX_CONFIG } from '../entities/companions.js';
import { ADVENTURE_TIER_DURATION, ADVENTURE_LEVELS } from '../config/adventure.js';
import { PALETTE } from '../config/palette.js';

const HUD_MARGIN = 16;
const HP_BAR_WIDTH = 220;
const HP_BAR_HEIGHT = 16;
const SLOT_GAP = 6;
const SLOT_HEIGHT = 22;

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

const ADVENTURE_TIER_COUNT = Math.max(...ADVENTURE_LEVELS.map(l => l.tiers.length));
export function adventureTierProgress(timeSec) {
  const tier = Math.min(ADVENTURE_TIER_COUNT, Math.floor(timeSec / ADVENTURE_TIER_DURATION) + 1);
  const progress = Math.min(1, Math.max(0, (timeSec - (tier - 1) * ADVENTURE_TIER_DURATION) / ADVENTURE_TIER_DURATION));
  return { tier, progress };
}

function fillRectWithAlpha(ctx, color, alpha, x, y, width, height) {
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = previousAlpha;
}

export function renderHud(ctx, game, viewport) {
  const W = viewport.width;
  const H = viewport.height;
  const barW = Math.min(HP_BAR_WIDTH, Math.max(80, W - HUD_MARGIN * 2));
  const barH = HP_BAR_HEIGHT;
  const topX = HUD_MARGIN;
  const topY = HUD_MARGIN;
  ctx.font = '12px sans-serif';

  ctx.fillStyle = PALETTE.hudPanel;
  ctx.fillRect(topX, topY, barW, barH);
  const hpFrac = Math.max(0, Math.min(1, game.player.hp / game.player.maxHp));
  ctx.fillStyle = PALETTE.neon;
  ctx.fillRect(topX, topY, barW * hpFrac, barH);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(game.player.hp + '/' + game.player.maxHp, topX + barW / 2, topY + 13);

  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText('银币 ' + game.coins, topX, topY + barH + 20);

  ctx.textAlign = 'right';
  let timeColor = PALETTE.text;
  let timeText;
  if (game.mode === 'endless' || game.mode === 'adventure') {
    timeText = formatTime(game.time);
  } else {
    const remain = Math.max(0, (game.duration || 0) - game.time);
    timeText = formatTime(remain);
    if (remain <= 60) timeColor = PALETTE.gold;
  }
  ctx.fillStyle = timeColor;
  ctx.fillText(timeText, W - HUD_MARGIN, topY + 8);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('击杀 ' + game.kills, W - HUD_MARGIN, topY + 28);

  if (game.mode === 'adventure') {
    const progressState = adventureTierProgress(game.time);
    const segmentGap = 6;
    const segmentWidth = Math.min(90, Math.max(32, (W - HUD_MARGIN * 2 - segmentGap * 3) / 4));
    const segmentHeight = 8;
    const totalWidth = segmentWidth * 4 + segmentGap * 3;
    const x0 = (W - totalWidth) / 2;
    const y0 = W >= 520 ? HUD_MARGIN : HUD_MARGIN + 48;
    for (let i = 1; i <= 4; i++) {
      const x = x0 + (i - 1) * (segmentWidth + segmentGap);
      fillRectWithAlpha(ctx, PALETTE.neonDim, 0.35, x, y0, segmentWidth, segmentHeight);
      if (i < progressState.tier) {
        ctx.fillStyle = PALETTE.neon;
        ctx.fillRect(x, y0, segmentWidth, segmentHeight);
      } else if (i === progressState.tier) {
        ctx.fillStyle = PALETTE.neon;
        ctx.fillRect(x, y0, segmentWidth * progressState.progress, segmentHeight);
        ctx.strokeStyle = PALETTE.neon;
        ctx.strokeRect(x + 0.5, y0 + 0.5, segmentWidth - 1, segmentHeight - 1);
      }
    }
  }

  ctx.textAlign = 'left';
  const slotWidth = Math.min(96, Math.max(32, (W - HUD_MARGIN * 2 - SLOT_GAP * 4) / ITEM_IDS.length));
  const infoY = H - HUD_MARGIN;
  const slotY = infoY - 30;
  let slotX = HUD_MARGIN;
  for (const id of ITEM_IDS) {
    const item = ITEMS[id];
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(slotX, slotY, slotWidth, SLOT_HEIGHT);
    ctx.strokeStyle = PALETTE.neonDim;
    ctx.strokeRect(slotX + 0.5, slotY + 0.5, slotWidth - 1, SLOT_HEIGHT - 1);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(item.key + ' ' + item.name + '×' + (game.inventory[id] || 0), slotX + 6, slotY + 15);
    slotX += slotWidth + SLOT_GAP;
  }

  ctx.fillStyle = PALETTE.text;
  const dims = ENHANCE_STATS.map(s => `${STAT_LABEL[s].split(' ')[0]}${game.weapon.enhance[s]}`).join(' ');
  let info = WEAPONS[game.weapon.id].name + ' · ' + dims;
  const aux = game.aux;
  if (aux && Object.values(aux.counts).some(n => n > 0)) {
    info += ' · 辅助 ' + Object.entries(aux.counts).filter(([, n]) => n > 0)
      .map(([k, n]) => `${AUX_CONFIG[k].name}×${n}`).join(' ');
  }
  ctx.fillText(info, HUD_MARGIN, infoY);

  if (game.interactionPrompt) {
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(game.interactionPrompt, W - HUD_MARGIN, H - HUD_MARGIN);
  }
  ctx.textAlign = 'left';
}
```

将 `index.html` 改为去掉 Canvas 的固定 `width` / `height` 属性，并将所有覆盖层放入 `#ui-overlay`，每个现有面板标记为 `.interactive`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zombie Survivor</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="game"></canvas>
  <div id="ui-overlay">
    <div id="menu" class="overlay interactive"></div>
    <div id="pause" class="overlay interactive hidden"></div>
    <div id="shop" class="overlay interactive hidden"></div>
    <div id="gameover" class="overlay interactive hidden"></div>
    <div id="dev" class="overlay interactive hidden"></div>
    <div id="levels" class="overlay interactive hidden"></div>
    <div id="bestiary" class="overlay interactive hidden"></div>
    <div id="upgrades" class="overlay interactive hidden"></div>
  </div>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

将 `style.css` 的文件内容更新为以下完整版本；保留既有面板类和交互选择器，只新增语义 Canvas 令牌、全视口 Canvas，以及与 Canvas 同层的 `#ui-overlay`：

```css
/* style.css —— UI 全面翻新（任务15，设计 §8）
   设计令牌（全界面统一规范）：
     深色底        #0d1210
     面板底        rgba(13,18,16,.92)
     霓虹描边      1px #5eff8a（次级 #2a4a3a）
     圆角          8px
     按钮          .btn（主）/ .btn-dim（次），hover 发光过渡
     字号          标题 28 / 正文 14 / 小字 12
     间距          8 的倍数
   基底类：.card（卡片基底，各界面以修饰类叠加） */

:root {
  --bg: #0d1210;
  --panel: rgba(13,18,16,.92);
  --neon: #5eff8a;
  --neon-dim: #2a4a3a;
  --gold: #ffd75e;
  --text: #e6f2ea;
  --text-dim: #9fb5a8;
  --radius: 8px;
  --canvas-ground: #1a2418;
  --canvas-obstacle: #4a4a52;
  --canvas-hud-panel: #122019;
  --canvas-boundary: var(--neon-dim);
}

html, body { margin: 0; width: 100%; height: 100%; background: var(--bg); overflow: hidden; }
#game { display: block; width: 100%; height: 100%; margin: 0; background: var(--bg); }
#ui-overlay { position: absolute; inset: 0; pointer-events: none; }
#ui-overlay .interactive { pointer-events: auto; }

/* —— 覆盖层面板基底：深色半透明底 + 霓虹几何描边 + 统一内边距 —— */
.overlay { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px; padding: 24px;
  background: rgba(5,8,7,.78); color: var(--text);
  font-family: "Microsoft YaHei", system-ui, sans-serif; font-size: 14px;
  box-sizing: border-box; }
.overlay > * { max-width: 100%; }
.overlay h1 { font-size: 28px; margin: 0 0 8px; color: var(--neon);
  text-shadow: 0 0 12px rgba(94,255,138,.5); }
.overlay h2 { font-size: 28px; margin: 0 0 8px; color: var(--neon);
  text-shadow: 0 0 12px rgba(94,255,138,.4); }
.overlay p { margin: 2px 0; color: var(--text-dim); }
.hidden { display: none; }

/* —— 按钮：.btn 主 / .btn-dim 次，hover 发光过渡 —— */
.btn { font-size: 14px; padding: 8px 24px; cursor: pointer; color: var(--neon);
  background: var(--panel); border: 1px solid var(--neon); border-radius: var(--radius);
  font-family: inherit; transition: box-shadow .15s ease, color .15s ease, border-color .15s ease; }
.btn:hover:not(:disabled) { box-shadow: 0 0 12px rgba(94,255,138,.45); color: #c8ffd9; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn-dim { color: var(--text-dim); border-color: var(--neon-dim); }
.btn-dim:hover:not(:disabled) { box-shadow: 0 0 8px rgba(94,255,138,.25); color: var(--text); }

/* —— 卡片基底：商店条目 / 关卡卡片 / 图鉴卡片 / 升级行共用 —— */
.card { background: var(--panel); border: 1px solid var(--neon-dim);
  border-radius: var(--radius); padding: 8px 16px; cursor: pointer;
  text-align: center; transition: border-color .15s ease, box-shadow .15s ease; }
.card:hover { border-color: var(--neon); box-shadow: 0 0 10px rgba(94,255,138,.3); }
.card h3, .card h4 { margin: 0 0 4px; color: var(--gold); font-size: 14px; }
.card p { margin: 2px 0; font-size: 12px; color: var(--text-dim); }
.card.locked, .card.disabled { opacity: .45; cursor: not-allowed; }
.card.locked:hover, .card.disabled:hover { border-color: var(--neon-dim); box-shadow: none; }

/* 主菜单 */
#menu h1 { color: var(--gold); text-shadow: 0 0 12px rgba(255,215,94,.4); margin-bottom: 8px; }
#menu .btn { display: block; width: 280px; margin: 8px 0; font-size: 16px; }

/* 暂停菜单（ui/pause.js） */
.pause-row { display: flex; gap: 12px; align-items: center; font-size: 14px; }
.pause-row input[type="range"] { width: 216px; accent-color: var(--neon); }
.pause-row input[type="checkbox"] { accent-color: var(--neon); }
.pause-buttons { display: flex; gap: 24px; margin-top: 8px; }

/* 商店（ui/shop.js）—— 迭代 03 分组布局 */
#shop { justify-content: flex-start; padding-top: 24px; overflow-y: auto; }
.shop-head h2 { margin: 0 0 4px; color: var(--gold); text-shadow: 0 0 12px rgba(255,215,94,.4); }
.shop-coins { margin: 0; font-size: 16px; color: var(--gold); }
.build { margin: 8px 0 0; text-align: center; color: var(--text-dim); }
.build-head { font-size: 16px; color: var(--text); }
.build-stat { font-size: 12px; }
.shop-groups { display: flex; flex-direction: column; gap: 16px; max-width: 1064px; }
.shop-row { display: flex; flex-direction: column; }
.shop-row-title { margin: 0 0 8px; font-size: 14px; color: var(--neon);
  border-left: 4px solid var(--neon); padding-left: 8px; }
.shop-list { display: flex; flex-wrap: wrap; gap: 8px; }
.shop-item { width: 168px; padding: 8px 8px; }
.shop-item .shop-price { color: var(--gold); font-weight: bold; }

/* 结算 */
#gameover h2 { color: var(--gold); margin-bottom: 8px; }
#gameover .btn { display: block; width: 240px; margin: 8px 0; }

/* 冒险关卡选择（ui/levels.js） */
.level-cards { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center;
  max-width: 1064px; }
.level-card { width: 192px; padding: 16px; }

/* 武器升级（ui/upgrades.js） */
.upgrade-list { display: flex; flex-direction: column; gap: 8px; width: 400px; max-width: 100%; }
.upgrade-row { display: flex; align-items: center; gap: 16px; text-align: left; cursor: default; }
.upgrade-row:hover { border-color: var(--neon-dim); box-shadow: none; }
.upgrade-row h4 { flex: 1; }
.upgrade-row h4 span { color: var(--text-dim); font-weight: normal; font-size: 12px; }
.upgrade-row p { margin: 0; }
.upgrade-buy { padding: 8px 16px; white-space: nowrap; }

/* 图鉴（ui/bestiary.js） */
.bestiary-tabs { display: flex; gap: 8px; }
.bestiary-tabs .btn.active { box-shadow: 0 0 12px rgba(94,255,138,.45); color: #c8ffd9; }
.bestiary-grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
  max-width: 1064px; }
.bestiary-card { width: 200px; cursor: default; }
.bestiary-card:hover { border-color: var(--neon-dim); box-shadow: none; }
.bestiary-swatch { width: 32px; height: 32px; margin: 0 auto 8px;
  border: 1px solid var(--neon-dim); border-radius: var(--radius); }
.bestiary-note { font-size: 12px; }

/* 开发者菜单（ui/dev.js）—— ` 键开关 */
#dev h2 { color: var(--neon); margin-bottom: 8px; }
.dev-head { text-align: center; }
.dev-buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 520px; }

/* FPS 常驻读数（ui/dev.js，任务12返修）：右上角小字，pointer-events 穿透，默认 hidden */
#dev-fps-fixed { position: fixed; top: 8px; right: 16px; padding: 2px 8px;
  background: var(--panel); color: var(--neon); border: 1px solid var(--neon-dim);
  border-radius: 4px; font: 12px/1.4 monospace; pointer-events: none; }
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/hud.test.js`

Expected: 5 个用例全部 PASS；宽视口右边界为 `784`、底部信息基线为 `584`，窄视口右边界为 `384`，五个槽位都不越过安全右边界。

Run: `npm test`

Expected: 全部测试 PASS；HUD 不再读取物理 Canvas 尺寸，Canvas 内 HUD 色值只来自 `PALETTE`，既有武器、道具、辅助武器和冒险进度数值保持不变。

Run: `npm start`

Expected: 浏览器中 Canvas 铺满窗口，无 1280×720 固定裁剪或大屏留白；缩放窗口后下一帧 HUD 仍贴合四角，覆盖层位于 Canvas 上方且按钮可交互。

- [ ] **Step 5: 提交**

```bash
git add index.html style.css src/systems/hud.js test/hud.test.js
git commit -m "UI改造任务3: HUD四角锚定与全视口画布布局"
```
### Task 4: 形状/部件统一视觉注册表与实体渲染门面

**Files:**
- Create: `src/core/visuals.js`
- Modify: `src/entities/render.js:1-122`
- Test: `test/visuals.test.js`（并回归 `test/bestiary.test.js:9,125-131` 的 `SHAPES` 兼容出口）

**Interfaces:**
- Consumes: `PALETTE.neon`（任务包 1 的安全默认颜色）；现有 `MONSTERS[type].visual` 的 `{ shape, color, glow }` 字段只由 `renderZombie` 读取，本任务不修改 `src/config/bestiary/monsters.js` 或 `src/entities/zombie.js`。
- Produces: `registerShape(id, pathFn)`, `registerPart(id, drawFn)`, `drawVisual(ctx, id, x, y, size, options?)`，以及兼容导出的 `SHAPES`（`Record<string, (ctx, x, y, r) => void>`）和部件表 `PARTS`；`src/entities/render.js` 继续导出同一个 `SHAPES` 对象，并保留 `renderZombie(ctx, z, timeSec)`、`renderProjectiles(ctx, projectiles)` 门面。

- [ ] **Step 1: 写失败测试**

在 `test/visuals.test.js` 写入完整测试。测试只使用记录 Canvas 调用的假上下文，不创建真实 DOM 或 PNG；未知 ID 连续绘制两次时只允许一条警告，并必须画出 circle 回退路径。

```js
// test/visuals.test.js —— 统一视觉注册表：形状、部件、未知 ID 回退（设计 §1.2/§1.4）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  drawVisual, registerPart, registerShape, SHAPES, PARTS,
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
  };
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/visuals.test.js`

Expected: FAIL，Node 报 `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '../src/core/visuals.js'`（新测试的首个注册表 import 无法解析）。

- [ ] **Step 3: 最小实现**

新建 `src/core/visuals.js`，将 `src/entities/render.js:10-26` 的 `poly()` 与五个 `SHAPES` 路径原样迁入；注册函数只保存回调，不在路径函数中设置颜色。`drawVisual` 对形状使用半径 `size`，对部件先平移到 `(x, y)` 再调用 `drawFn(ctx, size, options.params ?? {}, options.phase ?? 0)`；所有未知 ID 都用 `PALETTE.neon` 绘制 circle 并通过同一个 warning key 只警告一次。

```js
// src/core/visuals.js —— 形状、程序化部件与统一绘制入口（设计 §1.2）。
// pathFn 只描路径；颜色、描边和发光由 drawVisual 的 options 控制。
import { PALETTE } from '../config/palette.js';

export const SHAPES = Object.create(null);
export const PARTS = Object.create(null);

const warned = new Set();

function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

// 正 n 边形路径（顶点朝上；rot 可调相位）。
function poly(ctx, x, y, r, n, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function paintPath(ctx, pathFn, x, y, r, options) {
  ctx.save();
  if (options.shadowColor !== undefined) ctx.shadowColor = options.shadowColor;
  if (options.shadowBlur !== undefined) ctx.shadowBlur = options.shadowBlur;
  pathFn(ctx, x, y, r);
  const fillStyle = options.fillStyle ?? options.fill ?? options.color;
  if (fillStyle !== undefined) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  const strokeStyle = options.strokeStyle ?? options.stroke;
  if (strokeStyle !== undefined) {
    ctx.strokeStyle = strokeStyle;
    if (options.lineWidth !== undefined) ctx.lineWidth = options.lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

function paintFallback(ctx, x, y, r, options) {
  paintPath(ctx, SHAPES.circle, x, y, r, {
    ...options,
    fillStyle: options.fillStyle ?? options.fill ?? options.color ?? PALETTE.neon,
    strokeStyle: options.strokeStyle ?? options.stroke ?? PALETTE.neon,
  });
}

export function registerShape(id, pathFn) {
  if (typeof id !== 'string' || id.length === 0 || typeof pathFn !== 'function')
    throw new TypeError('registerShape(id, pathFn) requires a non-empty id and function');
  SHAPES[id] = pathFn;
  return pathFn;
}

export function registerPart(id, drawFn) {
  if (typeof id !== 'string' || id.length === 0 || typeof drawFn !== 'function')
    throw new TypeError('registerPart(id, drawFn) requires a non-empty id and function');
  PARTS[id] = drawFn;
  return drawFn;
}

export function drawVisual(ctx, id, x, y, size, options = {}) {
  const settings = options ?? {};
  const shape = SHAPES[id];
  if (shape) {
    paintPath(ctx, shape, x, y, size, settings);
    return true;
  }

  const part = PARTS[id];
  if (part) {
    ctx.save();
    ctx.translate(x, y);
    part(ctx, size, settings.params ?? {}, settings.phase ?? 0);
    ctx.restore();
    return true;
  }

  warnOnce(`unknown:${id}`, `[visuals] 未知视觉 ID "${id}"，回退 circle 占位`);
  paintFallback(ctx, x, y, size, settings);
  return false;
}

registerShape('circle', (ctx, x, y, r) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
});
registerShape('triangle', (ctx, x, y, r) => poly(ctx, x, y, r, 3));
registerShape('hexagon', (ctx, x, y, r) => poly(ctx, x, y, r, 6));
registerShape('pentagon', (ctx, x, y, r) => poly(ctx, x, y, r, 5));
registerShape('diamond', (ctx, x, y, r) => poly(ctx, x, y, r, 4));
```

`src/entities/render.js` 改为渲染门面：保留弹道绘制代码和既有常量，导出来自 `visuals.js` 的同一份 `SHAPES`；`renderZombie` 的填充与带 shadow 的描边分成两次 `drawVisual` 调用，以保持旧版“填充不带 shadow、描边带 shadow、受击闪白和血条逐帧顺序”不变。不要修改 `src/config/bestiary/monsters.js` 的 `{ shape, color, glow }` schema，也不要把 visual 拷贝进 `src/entities/zombie.js`。

```js
// src/entities/render.js —— 实体渲染门面；注册源位于 core/visuals.js。
import { MONSTERS, EXPLODER_FUSE_TIME } from '../config/bestiary/monsters.js';
import { TRAIL_MAX } from './projectile.js';
import { SHAPES, drawVisual } from '../core/visuals.js';

export { SHAPES };

// 单怪绘制：发光描边 + 受击闪白 + 受伤后血条 + 引信闪烁膨胀（exploder fuse 中）。
export function renderZombie(ctx, z, timeSec) {
  const v = MONSTERS[z.type].visual;
  let r = z.r;
  let alpha = 1;
  if (z.fuse !== undefined && !z.fuseDone) {
    const t = Math.min(1, z.fuse / EXPLODER_FUSE_TIME);
    r = z.r * (1 + 0.25 * t);
    alpha = 0.55 + 0.45 * Math.sin(timeSec * 30);
  }

  ctx.globalAlpha = alpha;
  drawVisual(ctx, v.shape, z.x, z.y, r, { fillStyle: v.color });
  drawVisual(ctx, v.shape, z.x, z.y, r, {
    strokeStyle: v.color,
    lineWidth: 2,
    shadowColor: v.color,
    shadowBlur: 12 * (v.glow ?? 0.3),
  });
  ctx.globalAlpha = 1;

  if (z.hitFlash > 0) {
    ctx.globalAlpha = Math.min(1, z.hitFlash / 0.1);
    drawVisual(ctx, v.shape, z.x, z.y, r, { fillStyle: '#fff' });
    ctx.globalAlpha = 1;
  }

  if (z.hp < z.maxHp) {
    const bw = z.r * 2;
    const bh = 3;
    const x = z.x - bw / 2;
    const y = z.y - z.r - 8;
    ctx.fillStyle = '#a33';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#5eff8a';
    ctx.fillRect(x, y, bw * Math.max(0, z.hp / z.maxHp), bh);
  }
}

// 弹道渲染（设计 §9.2）：发光几何体 + 渐隐拖尾。additive 混合，渲染后恢复。
// 无 visual 的弹道（turret/aux/碎片）的回退视觉：模块级冻结常量，循环内零分配。
const FALLBACK_AOE = Object.freeze({ bulletShape: 'bar', color: '#f80', trail: 0.3 });
const FALLBACK_CHAIN = Object.freeze({ bulletShape: 'bar', color: '#5ef', trail: 0.3 });
const FALLBACK_DEFAULT = Object.freeze({ bulletShape: 'bar', color: '#ffe066', trail: 0.3 });
export function renderProjectiles(ctx, projectiles) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of projectiles) {
    const v = p.visual || (p.aoe > 0 ? FALLBACK_AOE : p.chain > 0 ? FALLBACK_CHAIN : FALLBACK_DEFAULT);
    for (let i = 0; i < p.trailLen; i++) {
      const idx = (p.trailHead - p.trailLen + i + TRAIL_MAX) % TRAIL_MAX;
      const t = p.trail[idx];
      ctx.globalAlpha = (i / p.trailLen) * 0.35 * (v.trail ?? 0.3);
      ctx.fillStyle = v.color;
      ctx.fillRect(t.x - 1.5, t.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = v.color;
    const dx = Math.cos(p.angle);
    const dy = Math.sin(p.angle);
    switch (v.bulletShape) {
      case 'dot':
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'needle':
        ctx.strokeStyle = v.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - dx * 14, p.y - dy * 14); ctx.lineTo(p.x + dx * 3, p.y + dy * 3); ctx.stroke();
        break;
      case 'polygon': {
        ctx.beginPath();
        ctx.moveTo(p.x + dx * 6, p.y + dy * 6);
        ctx.lineTo(p.x - dy * 4, p.y + dx * 4);
        ctx.lineTo(p.x - dx * 6, p.y - dy * 6);
        ctx.lineTo(p.x + dy * 4, p.y - dx * 4);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'arc':
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x, p.y + 5); ctx.lineTo(p.x - 4, p.y);
        ctx.closePath(); ctx.fill();
        break;
      default:
        ctx.strokeStyle = v.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - dx * 5, p.y - dy * 5); ctx.lineTo(p.x + dx * 5, p.y + dy * 5); ctx.stroke();
    }
  }
  ctx.restore();
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/visuals.test.js test/bestiary.test.js && npm test`

Expected: PASS；`visuals.test.js` 的形状、部件、回退和一次性 warning 全部通过，`test/bestiary.test.js` 仍能从 `entities/render.js` 读取五个旧 `SHAPES` 键，全量 `node:test` 绿灯。

- [ ] **Step 5: 提交**

```bash
git add src/core/visuals.js src/entities/render.js test/visuals.test.js
git commit -m "UI改造任务4: 迁移 SHAPES 并统一视觉注册表门面"
```

---

### Task 5: 图片预加载与 `id+size` 离屏视觉缓存

**Files:**
- Modify: `src/core/visuals.js:1-98`（Task 4 新建全文件，追加图片与缓存）
- Modify: `test/visuals.test.js:1-96`（Task 4 创建全文件，扩展测试）

**Interfaces:**
- Consumes: `registerShape(id, pathFn)`, `registerPart(id, drawFn)`, `drawVisual(ctx, id, x, y, size, options?)`, `SHAPES`、`PARTS` 与 `PALETTE.neon`；图片 URL 由后续任务包的 `ASSETS` manifest 逐条调用 `registerImage` 登记。
- Produces: `registerImage(id, url)`, `preloadVisuals() → Promise`, `getVisualCanvas(id, size, options?) → canvas`（缓存键严格为 `id+size`），`clearCaches()`；图片解码缓存、失败状态和离屏 Canvas 缓存分层，图片失败/未预加载/未知 ID 都回退 circle 并对同一原因只 `console.warn` 一次。

- [ ] **Step 1: 写失败测试**

把 `test/visuals.test.js` 替换为下面的完整版本。成功图片由 Node 内的 `FakeImage` 驱动，离屏 Canvas 由 `createCanvas(width, height)` 工厂驱动；测试不读取真实 PNG 像素，只断言 URL、Image 实例复用、Canvas 尺寸、缓存身份、失败回退和 warning 数量。

```js
// test/visuals.test.js —— 统一视觉注册表：图片预加载、失败回退与离屏缓存（设计 §1.2/§1.4/§9）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCaches, drawVisual, getVisualCanvas, preloadVisuals,
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/visuals.test.js`

Expected: FAIL，Node 报 `The requested module '../src/core/visuals.js' does not provide an export named 'clearCaches'`（Task 4 版本尚未提供图片与离屏缓存接口）。

- [ ] **Step 3: 最小实现**

在 Task 4 的 `src/core/visuals.js` 中保留既有形状、部件和回退实现，追加三层状态：`IMAGE_URLS` 登记 URL，`IMAGE_CACHE` 保存解码后的 Image，`VISUAL_CANVAS_CACHE` 只按 `${id}:${size}` 保存离屏 Canvas。`preloadVisuals()` 使用 `globalThis.Image`；Node 没有 Image 时记录失败并 resolve `null`，不抛异常。图片加载成功后先等待 `decode()`（存在时），失败则标记失败、warning 一次，后续同步绘制走 circle。`getVisualCanvas()` 优先使用调用方提供的 `options.createCanvas(width, height)`，浏览器再依次使用 `document.createElement('canvas')` / `OffscreenCanvas`，无 DOM 时返回只含尺寸和 `getContext() => null` 的安全对象。`clearCaches()` 清理解码/失败/进行中状态和离屏缓存，但不删除注册表；重新 `registerImage` 时同时失效该 ID 的图片与离屏缓存。

本任务不生成 PNG，因此不调用 `gpt-image-review`；只消费后续任务包由 `ASSETS` manifest 登记的 URL。若联调时 URL 暂缺，保持本实现的程序化 circle 占位并先把对应占位条目登记为 `promptVersion: 'placeholder-v0'`，后续再按 `neon-cel-v1` 模板经 `gpt-image-review` 先行确认 1 张皮肤样图和 1 张武器图标样图，逐张完成风格一致性、透明底完整性、缩小辨识度、令牌融合度四维验收，合格后入库并登记 manifest，再只替换 URL；本任务的 Node 测试不依赖真实图片。

```js
// src/core/visuals.js —— 统一视觉注册表、图片预加载和 id+size 离屏缓存。
import { PALETTE } from '../config/palette.js';

export const SHAPES = Object.create(null);
export const PARTS = Object.create(null);

const warned = new Set();
const IMAGE_URLS = new Map();
const IMAGE_CACHE = new Map();
const IMAGE_PROMISES = new Map();
const FAILED_IMAGES = new Set();
const VISUAL_CANVAS_CACHE = new Map();

function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

function poly(ctx, x, y, r, n, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function paintPath(ctx, pathFn, x, y, r, options) {
  ctx.save();
  if (options.shadowColor !== undefined) ctx.shadowColor = options.shadowColor;
  if (options.shadowBlur !== undefined) ctx.shadowBlur = options.shadowBlur;
  pathFn(ctx, x, y, r);
  const fillStyle = options.fillStyle ?? options.fill ?? options.color;
  if (fillStyle !== undefined) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  const strokeStyle = options.strokeStyle ?? options.stroke;
  if (strokeStyle !== undefined) {
    ctx.strokeStyle = strokeStyle;
    if (options.lineWidth !== undefined) ctx.lineWidth = options.lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

function paintFallback(ctx, x, y, r, options) {
  paintPath(ctx, SHAPES.circle, x, y, r, {
    ...options,
    fillStyle: options.fillStyle ?? options.fill ?? options.color ?? PALETTE.neon,
    strokeStyle: options.strokeStyle ?? options.stroke ?? PALETTE.neon,
  });
}

function invalidateCanvasCache(id) {
  const prefix = `${id}:`;
  for (const key of VISUAL_CANVAS_CACHE.keys())
    if (key.startsWith(prefix)) VISUAL_CANVAS_CACHE.delete(key);
}

export function registerShape(id, pathFn) {
  if (typeof id !== 'string' || id.length === 0 || typeof pathFn !== 'function')
    throw new TypeError('registerShape(id, pathFn) requires a non-empty id and function');
  SHAPES[id] = pathFn;
  return pathFn;
}

export function registerPart(id, drawFn) {
  if (typeof id !== 'string' || id.length === 0 || typeof drawFn !== 'function')
    throw new TypeError('registerPart(id, drawFn) requires a non-empty id and function');
  PARTS[id] = drawFn;
  return drawFn;
}

export function registerImage(id, url) {
  if (typeof id !== 'string' || id.length === 0 || typeof url !== 'string' || url.length === 0)
    throw new TypeError('registerImage(id, url) requires non-empty id and url');
  IMAGE_URLS.set(id, url);
  IMAGE_CACHE.delete(id);
  IMAGE_PROMISES.delete(id);
  FAILED_IMAGES.delete(id);
  invalidateCanvasCache(id);
  return url;
}

function loadImage(id) {
  if (IMAGE_CACHE.has(id)) return Promise.resolve(IMAGE_CACHE.get(id));
  if (IMAGE_PROMISES.has(id)) return IMAGE_PROMISES.get(id);

  const url = IMAGE_URLS.get(id);
  const ImageCtor = globalThis.Image;
  if (typeof ImageCtor !== 'function') {
    FAILED_IMAGES.add(id);
    warnOnce(`image:${id}`, `[visuals] 图片视觉 "${id}" 无法加载，回退 circle 占位`);
    const unavailable = Promise.resolve(null);
    IMAGE_PROMISES.set(id, unavailable);
    return unavailable;
  }

  const promise = new Promise(resolve => {
    let image;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      FAILED_IMAGES.add(id);
      warnOnce(`image:${id}`, `[visuals] 图片视觉 "${id}" 加载失败，回退 circle 占位`);
      resolve(null);
    };
    const succeed = async () => {
      try {
        if (typeof image.decode === 'function') await image.decode();
      } catch {
        fail();
        return;
      }
      if (settled) return;
      settled = true;
      IMAGE_CACHE.set(id, image);
      resolve(image);
    };

    try {
      image = new ImageCtor();
      image.onload = succeed;
      image.onerror = fail;
      image.src = url;
    } catch {
      fail();
    }
  });
  IMAGE_PROMISES.set(id, promise);
  return promise;
}

export function preloadVisuals() {
  return Promise.all([...IMAGE_URLS.keys()].map(id => loadImage(id)));
}

export function drawVisual(ctx, id, x, y, size, options = {}) {
  const settings = options ?? {};
  const shape = SHAPES[id];
  if (shape) {
    paintPath(ctx, shape, x, y, size, settings);
    return true;
  }

  const part = PARTS[id];
  if (part) {
    ctx.save();
    ctx.translate(x, y);
    part(ctx, size, settings.params ?? {}, settings.phase ?? 0);
    ctx.restore();
    return true;
  }

  if (IMAGE_URLS.has(id)) {
    const image = IMAGE_CACHE.get(id);
    if (image) {
      ctx.drawImage(image, x - size, y - size, size * 2, size * 2);
      return true;
    }
    if (!FAILED_IMAGES.has(id))
      warnOnce(`image:${id}`, `[visuals] 图片视觉 "${id}" 尚未预加载，回退 circle 占位`);
    paintFallback(ctx, x, y, size, settings);
    return false;
  }

  warnOnce(`unknown:${id}`, `[visuals] 未知视觉 ID "${id}"，回退 circle 占位`);
  paintFallback(ctx, x, y, size, settings);
  return false;
}

function createCanvas(size, options) {
  if (typeof options.createCanvas === 'function') return options.createCanvas(size, size);
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(size, size);
  return { width: size, height: size, getContext: () => null };
}

export function getVisualCanvas(id, size, options = {}) {
  if (!Number.isFinite(size) || size <= 0)
    throw new RangeError('getVisualCanvas(id, size) requires a positive finite size');
  const pixelSize = Math.max(1, Math.round(size));
  const key = `${id}:${pixelSize}`;
  if (VISUAL_CANVAS_CACHE.has(key)) return VISUAL_CANVAS_CACHE.get(key);

  const canvas = createCanvas(pixelSize, options ?? {});
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext?.('2d');
  if (ctx) drawVisual(ctx, id, pixelSize / 2, pixelSize / 2, pixelSize / 2, options);
  VISUAL_CANVAS_CACHE.set(key, canvas);
  return canvas;
}

export function clearCaches() {
  IMAGE_CACHE.clear();
  IMAGE_PROMISES.clear();
  FAILED_IMAGES.clear();
  VISUAL_CANVAS_CACHE.clear();
}

registerShape('circle', (ctx, x, y, r) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
});
registerShape('triangle', (ctx, x, y, r) => poly(ctx, x, y, r, 3));
registerShape('hexagon', (ctx, x, y, r) => poly(ctx, x, y, r, 6));
registerShape('pentagon', (ctx, x, y, r) => poly(ctx, x, y, r, 5));
registerShape('diamond', (ctx, x, y, r) => poly(ctx, x, y, r, 4));
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/visuals.test.js test/bestiary.test.js && npm test`

Expected: PASS；成功图片同 URL 只创建一个 `FakeImage`，相同 `id+size` 只创建一个离屏 Canvas，不同尺寸各自独立，失败图片和未知/未预加载 ID 都画 circle 并只警告一次；无 Image/DOM 的 Node 用例不抛错，全量 `node:test` 绿灯。

- [ ] **Step 5: 提交**

```bash
git add src/core/visuals.js test/visuals.test.js
git commit -m "UI改造任务5: 接入图片预加载与 id+size 离屏缓存"
```
### Task 6: 图标出图管线与唯一 manifest

**Files:**
- Create: `docs/superpowers/visual-asset-prompt-template.md`
- Create: `docs/superpowers/visual-asset-review-2026-09-02.md`
- Create: `src/config/assets.js`
- Modify: `src/main.js:1-31,162-163`
- Test: `test/config.test.js:1-99`
- Create: `assets/img/icons/weapons/*.png`
- Create: `assets/img/icons/items/*.png`
- Create: `assets/img/icons/aux/*.png`
- Create: `assets/img/icons/enhance/*.png`
- Create: `assets/img/icons/currency/*.png`

**Interfaces:**
- Consumes: `registerImage(id, url)`、`preloadVisuals() → Promise` from `src/core/visuals.js`（任务包 2）；`WEAPONS`、`ITEM_IDS`、`AUX_CONFIG` 的稳定 ID。
- Produces: `ASSETS`（`Array<{ id: string, path: string, size: 128, promptVersion: string }>`）；`ASSET_BY_ID`（以 manifest ID 为键的同一条目映射）；启动时为每条 manifest 调用 `registerImage` 并触发 `preloadVisuals()`，后续任务可直接调用 `getVisualCanvas(id, size, options?)`。

- [ ] **Step 1: 写失败测试**

在 `test/config.test.js` 顶部的 import 区增加 manifest import，并在文件末尾追加以下完整用例；允许失败回退条目的 `promptVersion` 为 `placeholder-v0`，但 ID、路径、尺寸仍必须完整，不能通过删除条目规避缺图：

```js
import { ASSETS, ASSET_BY_ID } from '../src/config/assets.js';


test('图标 manifest：21 个稳定 ID、路径、128 尺寸与 prompt 版本完整', () => {
  const expected = [
    ['icon.weapon.pistol', 'assets/img/icons/weapons/pistol.png'],
    ['icon.weapon.rifle', 'assets/img/icons/weapons/rifle.png'],
    ['icon.weapon.mg', 'assets/img/icons/weapons/mg.png'],
    ['icon.weapon.rocket', 'assets/img/icons/weapons/rocket.png'],
    ['icon.weapon.grenade', 'assets/img/icons/weapons/grenade.png'],
    ['icon.weapon.tesla', 'assets/img/icons/weapons/tesla.png'],
    ['icon.weapon.sniperRifle', 'assets/img/icons/weapons/sniper-rifle.png'],
    ['icon.item.medkit', 'assets/img/icons/items/medkit.png'],
    ['icon.item.magnet', 'assets/img/icons/items/magnet.png'],
    ['icon.item.bomb', 'assets/img/icons/items/bomb.png'],
    ['icon.item.turret', 'assets/img/icons/items/turret.png'],
    ['icon.item.wall', 'assets/img/icons/items/wall.png'],
    ['icon.aux.drone', 'assets/img/icons/aux/drone.png'],
    ['icon.aux.gunner', 'assets/img/icons/aux/gunner.png'],
    ['icon.aux.sniper', 'assets/img/icons/aux/sniper.png'],
    ['icon.enhance.damage', 'assets/img/icons/enhance/damage.png'],
    ['icon.enhance.fireRate', 'assets/img/icons/enhance/fire-rate.png'],
    ['icon.enhance.projectiles', 'assets/img/icons/enhance/projectiles.png'],
    ['icon.enhance.range', 'assets/img/icons/enhance/range.png'],
    ['icon.currency.silver', 'assets/img/icons/currency/silver.png'],
    ['icon.currency.gold', 'assets/img/icons/currency/gold.png'],
  ];

  const icons = ASSETS.filter(asset => asset.id.startsWith('icon.'));
  assert.equal(icons.length, 21);
  assert.deepEqual(icons.map(a => [a.id, a.path]), expected);
  assert.equal(new Set(icons.map(a => a.id)).size, 21);
  for (const [id, path] of expected) {
    const asset = ASSET_BY_ID[id];
    assert.equal(asset.id, id);
    assert.equal(asset.path, path);
    assert.equal(asset.size, 128);
    assert.ok(['neon-cel-v1', 'placeholder-v0'].includes(asset.promptVersion));
    assert.equal(ASSET_BY_ID[id], asset);
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/config.test.js`

Expected: FAIL with `Cannot find module '../src/config/assets.js'`（manifest import 尚不存在）。

- [ ] **Step 3: 最小实现**

先建立目录并执行出图流程。所有 prompt 都从 `neon-cel-v1` 模板派生，不把怪物概念稿或皮肤资产混入本任务的 21 个图标 manifest：

```bash
mkdir -p assets/img/icons/weapons assets/img/icons/items assets/img/icons/aux assets/img/icons/enhance assets/img/icons/currency
mkdir -p docs/superpowers/visual-asset-reviews/2026-09-02
```

把下列原文不改字地写入 `docs/superpowers/visual-asset-prompt-template.md`，文件中的模板名固定为 `neon-cel-v1`：

```text
暗黑霓虹赛璐璐风，[主体对象]，[用途/姿态]，深色底适配，霓绿/金描边发光，45°俯视微侧视角，单个主体居中，128×128 透明底 PNG，轮廓清晰、块面分明、可在 24/32/48/64px 显示，禁止文字、数字、水印和背景杂物。
```

调用 `gpt-image-review` 技能完成出图，出图使用 gpt-image-2/CLIProxyAPI，审美复核使用 `k3-256k`；不要把 gpt-image-2 加入 Kimi 的 `[models]`，也不要通过 `/v1/responses` 调用。严格先出两张样图，再批量：

```bash
node C:/Users/developer/.kimi-code/skills/gpt-image-review/gen-image.js "Dark neon cel-shaded pistol icon for a zombie-survivor game, centered single object, deep charcoal-compatible transparent background, neon green and gold glowing outline, 45-degree top-down slight side view, crisp silhouette, separated cel-shaded planes, no text, numbers, watermark, or background clutter." --quality low --size 1024x1024 --out docs/superpowers/visual-asset-reviews/2026-09-02/weapon-pistol-sample-v1.png
node C:/Users/developer/.kimi-code/skills/gpt-image-review/gen-image.js "Dark neon cel-shaded wasteland adventurer character sprite sample, centered single full-body character, deep charcoal-compatible transparent background, neon green and gold glowing outline, 45-degree top-down slight side view, readable at small size, no text, numbers, watermark, or background clutter." --quality low --size 1024x1024 --out docs/superpowers/visual-asset-reviews/2026-09-02/skin-wasteland-adventurer-sample-v1.png
```

把两张样图交给 `gpt-image-review` 的 k3 评审回合，评审提示必须包含绝对图片路径、原始需求和四项验收维度：风格一致性、透明底完整性、缩小后的辨识度、与霓绿/金色设计令牌的融合度。任一维度不合格就用完整修订 prompt 重出，最多迭代 3 轮；每一轮保留 `-v1.png/-v2.png/-v3.png` 与同名 `.md` 评审记录，合格样图才是批量风格基准。样图复核通过后，再用同一模板批量生成并逐张验收以下 21 个运行时图标：

```text
武器：pistol、rifle、mg、rocket、grenade、tesla、sniperRifle
道具：medkit、magnet、bomb、turret、wall
辅助：drone、gunner、sniper
强化：damage、fireRate、projectiles、range
货币：silver、gold
```

每张终稿都必须先以 `--quality low --size 1024x1024` 草图迭代，再以通过的 prompt 使用 `--quality high` 生成终稿；将终稿裁切/缩放为 128×128、保持透明通道后，分别入库 `assets/img/icons/weapons/`、`items/`、`aux/`、`enhance/`、`currency/`，文件名严格使用小写 kebab-case（`sniper-rifle.png`、`fire-rate.png`）。把文件名、manifest ID、`size: 128`、`promptVersion`、四项审美结论和是否重出写入 `docs/superpowers/visual-asset-review-2026-09-02.md`；只有四项均通过的图片才登记为 `neon-cel-v1`。

生成失败、透明底损坏或三轮审美迭代仍不合格时，不删除 manifest 条目，也不让 UI 引用不存在的新 ID：保留目标 `id` 与 `path`，将该条目的 `promptVersion` 登记为精确的 `'placeholder-v0'`，由任务包 2 的 `drawVisual/getVisualCanvas` 程序化 circle 占位和一次性 `console.warn` 继续运行；后续补图只替换同一路径文件并把该条目改回 `neon-cel-v1`，不改配置引用。

创建 `src/config/assets.js`：

```js
// src/config/assets.js —— UI 图标唯一 manifest（设计 §3.2/§3.3）。
// 21 个图标统一 128×128 原子源图；运行时显示尺寸由 getVisualCanvas(id, size) 缓存生成。
export const ASSETS = [
  { id: 'icon.weapon.pistol', path: 'assets/img/icons/weapons/pistol.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.rifle', path: 'assets/img/icons/weapons/rifle.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.mg', path: 'assets/img/icons/weapons/mg.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.rocket', path: 'assets/img/icons/weapons/rocket.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.grenade', path: 'assets/img/icons/weapons/grenade.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.tesla', path: 'assets/img/icons/weapons/tesla.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.sniperRifle', path: 'assets/img/icons/weapons/sniper-rifle.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.item.medkit', path: 'assets/img/icons/items/medkit.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.item.magnet', path: 'assets/img/icons/items/magnet.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.item.bomb', path: 'assets/img/icons/items/bomb.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.item.turret', path: 'assets/img/icons/items/turret.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.item.wall', path: 'assets/img/icons/items/wall.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.aux.drone', path: 'assets/img/icons/aux/drone.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.aux.gunner', path: 'assets/img/icons/aux/gunner.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.aux.sniper', path: 'assets/img/icons/aux/sniper.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.enhance.damage', path: 'assets/img/icons/enhance/damage.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.enhance.fireRate', path: 'assets/img/icons/enhance/fire-rate.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.enhance.projectiles', path: 'assets/img/icons/enhance/projectiles.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.enhance.range', path: 'assets/img/icons/enhance/range.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.currency.silver', path: 'assets/img/icons/currency/silver.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.currency.gold', path: 'assets/img/icons/currency/gold.png', size: 128, promptVersion: 'neon-cel-v1' },
];

export const ASSET_BY_ID = Object.fromEntries(ASSETS.map(asset => [asset.id, asset]));
```

后续皮肤任务向 `ASSETS` 追加条目时，必须在追加完成后重新构造 `ASSET_BY_ID`（或把所有条目一次性放入同一数组后再构造），确保新增的 `skin.*` ID 也能从同一映射读取；图标测试只筛选 `icon.` 前缀，不能把后续皮肤条目误算进 21 个图标。

在 `src/main.js` 的 manifest import 区增加 `ASSETS`、`registerImage`、`preloadVisuals`，并在创建 engine/settings/meta 后、首次 `showMenuScreen()` 前登记并预加载，保持预加载失败由 visuals 自身回退，不阻塞菜单：

```js
import { registerImage, preloadVisuals } from './core/visuals.js';
import { ASSETS } from './config/assets.js';

for (const asset of ASSETS) registerImage(asset.id, asset.path);
void preloadVisuals();
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/config.test.js`

Expected: PASS，manifest 用例确认 21 条、ID 唯一、所有尺寸为 128，prompt 版本只允许 `neon-cel-v1` 或 `placeholder-v0`。

Run: `npm test`

Expected: PASS；Node 测试不读取 PNG 像素，也不因浏览器图片预加载而需要 DOM。

Run: `node --input-type=module -e "import { ASSETS, ASSET_BY_ID } from './src/config/assets.js'; const icons = ASSETS.filter(a => a.id.startsWith('icon.')); console.log(icons.length, Object.keys(ASSET_BY_ID).length, icons.every(a => a.size === 128));"`

Expected: 输出 `21 21 true`（Task 6 阶段 ASSET_BY_ID 只有图标；后续皮肤资产追加后，测试仍只统计 `icon.` 前缀）。

- [ ] **Step 5: 提交**

```bash
git add docs/superpowers/visual-asset-prompt-template.md docs/superpowers/visual-asset-review-2026-09-02.md src/config/assets.js src/main.js test/config.test.js assets/img/icons/weapons/pistol.png assets/img/icons/weapons/rifle.png assets/img/icons/weapons/mg.png assets/img/icons/weapons/rocket.png assets/img/icons/weapons/grenade.png assets/img/icons/weapons/tesla.png assets/img/icons/weapons/sniper-rifle.png assets/img/icons/items/medkit.png assets/img/icons/items/magnet.png assets/img/icons/items/bomb.png assets/img/icons/items/turret.png assets/img/icons/items/wall.png assets/img/icons/aux/drone.png assets/img/icons/aux/gunner.png assets/img/icons/aux/sniper.png assets/img/icons/enhance/damage.png assets/img/icons/enhance/fire-rate.png assets/img/icons/enhance/projectiles.png assets/img/icons/enhance/range.png assets/img/icons/currency/silver.png assets/img/icons/currency/gold.png
git commit -m "UI改造任务6: 建立 neon-cel-v1 图标资产管线与 manifest"
```

---

### Task 7: 配置表补齐图标字段

**Files:**
- Modify: `src/config/items.js:2-8`
- Modify: `src/config/bestiary/weapons.js:6-56`
- Modify: `src/entities/companions.js:5-9`
- Test: `test/config.test.js:1-99`
- Test: `test/weapon.test.js:1-148`
- Test: `test/companions.test.js:1-24`

**Interfaces:**
- Consumes: `ASSET_BY_ID` from `src/config/assets.js`；`ITEM_IDS`；七个 `WEAPONS` ID；三项 `AUX_CONFIG` ID；弹道 `visual` 字段及其既有数值。
- Produces: `ITEMS[id].visual.icon = 'icon.item.<id>'`；`WEAPONS[id].icon = 'icon.weapon.<id>'` 且 `WEAPONS[id].visual` 仍只描述弹道；`AUX_CONFIG[id].icon = 'icon.aux.<id>'`，供 Task 8/9 通过 `getVisualCanvas` 读取，不改变任何价格、伤害、射速、射程、orbit 或强化公式。

- [ ] **Step 1: 写失败测试**

在 `test/config.test.js` 的既有武器 import 中加入 `WEAPONS`，增加 `ITEMS`、`ITEM_IDS`、`AUX_CONFIG` import，并复用 Task 6 已加入的 `ASSET_BY_ID` import；然后追加以下完整契约用例：

```js
import { WEAPON_MAX_LEVEL, ENHANCE_STATS, STAT_LABEL, WEAPONS } from '../src/config/bestiary/weapons.js';
import { ITEMS, ITEM_IDS } from '../src/config/items.js';
import { AUX_CONFIG } from '../src/entities/companions.js';
// ASSET_BY_ID 沿用 Task 6 在本文件顶部加入的 import。


test('道具/武器/辅助配置均引用已登记 manifest 图标', () => {
  for (const id of ITEM_IDS) {
    const icon = ITEMS[id].visual.icon;
    assert.equal(icon, `icon.item.${id}`);
    assert.equal(ASSET_BY_ID[icon].id, icon);
  }
  for (const id of ['pistol', 'rifle', 'mg', 'rocket', 'grenade', 'tesla', 'sniperRifle']) {
    const icon = WEAPONS[id].icon;
    assert.equal(icon, `icon.weapon.${id}`);
    assert.equal(ASSET_BY_ID[icon].id, icon);
  }
  for (const id of ['drone', 'gunner', 'sniper']) {
    const icon = AUX_CONFIG[id].icon;
    assert.equal(icon, `icon.aux.${id}`);
    assert.equal(ASSET_BY_ID[icon].id, icon);
  }
});
```

将 `test/weapon.test.js` 的“七武器表”循环中、已有 `assert.equal(c.id, id);` 后面加入以下断言；它与原有弹道字段断言并存：

```js
assert.equal(c.icon, `icon.weapon.${id}`, `${id}.icon`);
for (const field of ['bulletShape', 'color', 'trail', 'hitParticles', 'muzzleGlow'])
  assert.ok(field in c.visual, `${id}.visual.${field}`);
```

将 `test/companions.test.js` 的 AUX_CONFIG 精确值断言改成以下完整对象，保留后续 orbit/角速/开火断言不动：

```js
assert.deepEqual(AUX_CONFIG.drone, {
  name: '随行无人机', icon: 'icon.aux.drone', orbit: 90,
  damage: 6, fireRate: 2, projectileSpeed: 500, range: 250, aoe: 0,
});
assert.deepEqual(AUX_CONFIG.gunner, {
  name: '随行移动火炮', icon: 'icon.aux.gunner', orbit: 60,
  damage: 15, fireRate: 1, projectileSpeed: 400, range: 320, aoe: 60,
});
assert.deepEqual(AUX_CONFIG.sniper, {
  name: '随行远程火炮', icon: 'icon.aux.sniper', orbit: 100,
  damage: 30, fireRate: 0.4, projectileSpeed: 700, range: 500, aoe: 0,
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/config.test.js test/weapon.test.js test/companions.test.js`

Expected: FAIL with `undefined !== 'icon.item.medkit'`、`undefined !== 'icon.weapon.pistol'` 或 AUX_CONFIG 深比较缺少 `icon` 字段；原有数值与弹道断言仍应保留。

- [ ] **Step 3: 最小实现**

把 `src/config/items.js` 的五条数据改为：

```js
export const ITEMS = {
  medkit: { id: 'medkit', name: '医疗包', key: 1, desc: '立即回复 50% HP', visual: { icon: 'icon.item.medkit' } },
  magnet: { id: 'magnet', name: '磁铁', key: 2, desc: '吸附全场银币', visual: { icon: 'icon.item.magnet' } },
  bomb: { id: 'bomb', name: '炸弹', key: 3, desc: '半径 350 爆炸，伤害 250', visual: { icon: 'icon.item.bomb' } },
  turret: { id: 'turret', name: '固定火炮', key: 4, desc: '部署自动炮台（耐久200）', visual: { icon: 'icon.item.turret' } },
  wall: { id: 'wall', name: '围墙', key: 5, desc: '环形8段墙（每段耐久150）', visual: { icon: 'icon.item.wall' } },
};
```

把 `src/config/bestiary/weapons.js` 的七条数据各增加本体 `icon`，并保留原 `visual` 对象原样作为弹道配置；完整结果如下：

```js
export const WEAPONS = {
  pistol: {
    id: 'pistol', icon: 'icon.weapon.pistol', name: '手枪', desc: '可靠的随身武器，均衡而稳定。',
    damage: 12, fireRate: 2.0, projectileSpeed: 500, range: 300,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 0,
    knockback: 120, burst: 1, burstInterval: 0, basePrice: 40,
    visual: { bulletShape: 'dot', color: '#ffe066', trail: 0.3, hitParticles: 6, muzzleGlow: 0.4 },
  },
  rifle: {
    id: 'rifle', icon: 'icon.weapon.rifle', name: '步枪', desc: '三连发点射，中距离压制利器。',
    damage: 9, fireRate: 1.4, projectileSpeed: 600, range: 320,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 0,
    knockback: 100, burst: 3, burstInterval: 0.08, basePrice: 80,
    visual: { bulletShape: 'bar', color: '#ffd75e', trail: 0.4, hitParticles: 6, muzzleGlow: 0.5 },
  },
  mg: {
    id: 'mg', icon: 'icon.weapon.mg', name: '机枪', desc: '泼洒弹雨压制尸潮，单发威力有限。',
    damage: 5, fireRate: 8, projectileSpeed: 550, range: 280,
    projectiles: 1, spread: 6, pierce: 0, aoe: 0, arc: false, chain: 0,
    knockback: 60, burst: 1, burstInterval: 0, basePrice: 80,
    visual: { bulletShape: 'dot', color: '#ffb04d', trail: 0.25, hitParticles: 4, muzzleGlow: 0.3 },
  },
  rocket: {
    id: 'rocket', icon: 'icon.weapon.rocket', name: '火箭炮', desc: '爆炸覆盖一片区域，稳扎稳打的重火力。',
    damage: 30, fireRate: 0.7, projectileSpeed: 350, range: 350,
    projectiles: 1, spread: 0, pierce: 0, aoe: 90, arc: false, chain: 0,
    knockback: 0, burst: 1, burstInterval: 0, basePrice: 150,
    visual: { bulletShape: 'polygon', color: '#f80', trail: 0.8, hitParticles: 16, muzzleGlow: 0.9 },
  },
  grenade: {
    id: 'grenade', icon: 'icon.weapon.grenade', name: '榴弹炮', desc: '抛射榴弹越过障碍，落地后二次爆炸碎片四射。',
    damage: 25, fireRate: 0.6, projectileSpeed: 420, range: 330,
    projectiles: 1, spread: 0, pierce: 0, aoe: 130, arc: true, chain: 0,
    knockback: 0, burst: 1, burstInterval: 0, basePrice: 200,
    visual: { bulletShape: 'polygon', color: '#e06a4d', trail: 0.8, hitParticles: 16, muzzleGlow: 0.9 },
  },
  tesla: {
    id: 'tesla', icon: 'icon.weapon.tesla', name: '磁电枪', desc: '链状电弧在敌群间跳跃传导。',
    damage: 14, fireRate: 1.2, projectileSpeed: 800, range: 260,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 3,
    knockback: 0, burst: 1, burstInterval: 0, basePrice: 250,
    visual: { bulletShape: 'arc', color: '#5ef', trail: 0.5, hitParticles: 8, muzzleGlow: 0.7 },
  },
  sniperRifle: {
    id: 'sniperRifle', icon: 'icon.weapon.sniperRifle', name: '狙击枪', desc: '超视距一击贯穿，光针所至尸骸洞穿。',
    damage: 60, fireRate: 0.5, projectileSpeed: 1200, range: 600,
    projectiles: 1, spread: 0, pierce: 5, aoe: 0, arc: false, chain: 0,
    knockback: 200, burst: 1, burstInterval: 0, basePrice: 200,
    visual: { bulletShape: 'needle', color: '#aef', trail: 0.9, hitParticles: 8, muzzleGlow: 0.8 },
  },
};
```

把 `src/entities/companions.js` 的 AUX_CONFIG 改为只增加 `icon` 字段，其余数值保持当前实际值：

```js
export const AUX_CONFIG = {
  drone: { name: '随行无人机', icon: 'icon.aux.drone', orbit: 90, damage: 6, fireRate: 2, projectileSpeed: 500, range: 250, aoe: 0 },
  gunner: { name: '随行移动火炮', icon: 'icon.aux.gunner', orbit: 60, damage: 15, fireRate: 1, projectileSpeed: 400, range: 320, aoe: 60 },
  sniper: { name: '随行远程火炮', icon: 'icon.aux.sniper', orbit: 100, damage: 30, fireRate: 0.4, projectileSpeed: 700, range: 500, aoe: 0 },
};
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/config.test.js test/weapon.test.js test/companions.test.js`

Expected: PASS；新增 icon/manifest 断言通过，武器的 `visual.bulletShape/color/trail/hitParticles/muzzleGlow`、七武器数值、辅助 orbit `90/60/100` 和角速 `2.2/1.4/1.0` 全部保持原断言。

Run: `npm test`

Expected: PASS，未触碰音频、存储、伤害公式、经济价格或玩法逻辑。

- [ ] **Step 5: 提交**

```bash
git add src/config/items.js src/config/bestiary/weapons.js src/entities/companions.js test/config.test.js test/weapon.test.js test/companions.test.js
git commit -m "UI改造任务7: 补齐道具、武器与辅助武器图标字段"
```

---

### Task 8: 商店与武器升级卡片接入图标

**Files:**
- Create: `src/ui/icon.js`
- Modify: `src/ui/shop.js:4-125`
- Modify: `src/ui/upgrades.js:3-50`
- Modify: `style.css:69-82,93-100`
- Test: `test/shop.test.js:1-369`
- Test: `test/shop-ui.test.js:1-64`

**Interfaces:**
- Consumes: `getVisualCanvas(id, size, options?) → canvas` from `src/core/visuals.js`；`ASSET_BY_ID`/配置 icon 字段；现有 `catalogFor(game, tierRemainingSec, opts)`、`buy(game, entry)`；`weaponLevel(meta, id)` 与 `weaponUpgradePrice(level)`。
- Produces: `createIconCanvas(id, size = 48) → HTMLCanvasElement`（将缓存视觉复制到独立 DOM canvas，避免同一缓存节点被多个卡片重复挂载）；`entryView(entry, game)` 返回既有 `title/desc/price` 加 `icon/value`；`upgradeView(weapon, meta)` 返回 `id/icon/level/maxed/price/currentDamage/nextDamage/disabled`；商店/升级卡片带 `data-visual-id`、`data-tooltip-name`、`data-tooltip-description`、`data-tooltip-value`，供 Task 9 的 DOM tooltip 绑定；辅助强化仍按 drone/gunner/sniper 分行，未拥有类型的整行 class 为 `aux-unowned` 且购买行为不变。

- [ ] **Step 1: 写失败测试**

在 `test/shop.test.js` 增加 UI 展示模型 import，并在文件末尾追加：

```js
import { entryView } from '../src/ui/shop.js';


test('商店展示模型为各类条目提供 manifest 图标', () => {
  const game = makeGame();
  assert.equal(entryView({ kind: 'item', item: 'medkit', price: 30 }, game).icon, 'icon.item.medkit');
  assert.equal(entryView({ kind: 'weapon', weapon: 'rifle', price: 80, refund: 0 }, game).icon, 'icon.weapon.rifle');
  assert.equal(entryView({ kind: 'aux', aux: 'drone', price: 60 }, game).icon, 'icon.aux.drone');
  assert.equal(entryView({ kind: 'enhance', stat: 'damage', price: 40, owned: 0 }, game).icon, 'icon.enhance.damage');
  assert.equal(entryView({ kind: 'auxEnhance', aux: 'sniper', stat: 'range', price: 40, owned: 0 }, game).icon, 'icon.enhance.range');
  assert.equal(entryView({ kind: 'deployEnhance', target: 'wall', stat: 'hp', price: 40, owned: 0 }, game).icon, 'icon.item.wall');
  assert.equal(entryView({ kind: 'earlyTier', bonus: 25 }, game).icon, 'icon.currency.silver');
});
```

在 `test/shop-ui.test.js` 把最小 DOM mock 扩展为可记录 canvas 子节点、`dataset` 和 `prepend` 的版本，并追加图标/置灰断言；完整 mock 与用例为：

```js
function fakeCanvasContext() {
  return new Proxy({}, {
    get: (_target, key) => (key === 'canvas' ? {} : () => {}),
    set: () => true,
  });
}

function mockDom() {
  const el = tag => {
    const node = {
      tagName: tag,
      className: '', textContent: '', innerHTML: '', _kids: [],
      dataset: {}, style: {}, hidden: false,
      appendChild(child) { this._kids.push(child); child.parentNode = this; },
      prepend(child) { this._kids.unshift(child); child.parentNode = this; },
      addEventListener() {},
      setAttribute(name, value) { this[name] = String(value); },
      classList: { add() {}, remove() {}, contains() { return false; } },
      replaceChildren(...ns) { this._kids = ns; for (const n of ns) n.parentNode = this; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
    if (tag === 'canvas') node.getContext = () => fakeCanvasContext();
    return node;
  };
  const root = el('div');
  const doc = {
    body: el('body'),
    getElementById: id => (id === 'shop' ? root : null),
    createElement: tag => el(tag),
    querySelectorAll: () => [],
  };
  root.ownerDocument = doc;
  return { root, doc };
}

function flatten(node) {
  return [node, ...node._kids.flatMap(child => flatten(child))];
}

test('showShop：图标进入卡片，货币图标存在，未拥有辅助强化整行置灰', async () => {
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

  showShop(root, game, { onBuy() {}, onEarlyTier() {}, onClose() {} });
  const nodes = flatten(root);
  assert.ok(nodes.some(n => n.dataset.visualId === 'icon.item.medkit'));
  assert.ok(nodes.some(n => n.dataset.visualId === 'icon.currency.silver'));
  assert.ok(nodes.some(n => n.className === 'shop-row aux-unowned'));
  assert.ok(nodes.filter(n => n.className === 'shop-row aux-unowned').length >= 3);
});
```

在 `test/shop-ui.test.js` 末尾再追加一个不依赖真实 DOM/PNG 的升级展示模型用例：

```js
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/shop.test.js test/shop-ui.test.js`

Expected: FAIL with `The requested module '../src/ui/shop.js' does not provide an export named 'entryView'`（随后还会缺少 `upgradeView`）；现有商店购买/目录逻辑的测试失败信息不得被吞掉。

- [ ] **Step 3: 最小实现**

创建 `src/ui/icon.js`，所有 DOM 卡片都从同一缓存 canvas 复制到独立节点；不创建新的 `Image`，也不把同一个缓存节点同时挂到多个父节点：

```js
// src/ui/icon.js —— UI 卡片图标节点工厂。
import { getVisualCanvas } from '../core/visuals.js';

export function createIconCanvas(id, size = 48) {
  const source = getVisualCanvas(id, size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'ui-icon';
  canvas.dataset.visualId = id;
  canvas.setAttribute('aria-hidden', 'true');
  const target = canvas.getContext?.('2d');
  if (target && source) target.drawImage(source, 0, 0, size, size);
  return canvas;
}
```

在 `src/ui/shop.js` 引入 `createIconCanvas`，将 `entryView` 改为导出函数并返回以下完整分支；既有标题、说明和价格文本保持不变：

```js
import { createIconCanvas } from './icon.js';

export function entryView(entry, game) {
  const max = STAT_MAX;
  if (entry.kind === 'enhance') {
    return {
      title: STAT_LABEL[entry.stat], desc: `当前 ${entry.owned}/${max} 级`, price: entry.price,
      icon: `icon.enhance.${entry.stat}`, value: `等级 ${entry.owned}/${max}`,
    };
  }
  if (entry.kind === 'weapon') {
    const refundNote = (entry.refund ?? 0) > 0 ? `（返还强化 ${entry.refund} 银币）` : '';
    return {
      title: WEAPONS[entry.weapon].name, desc: `更换主武器（增强清零）${refundNote}`, price: entry.price,
      icon: WEAPONS[entry.weapon].icon, value: `${entry.price} 银币`,
    };
  }
  if (entry.kind === 'aux') {
    const c = AUX_CONFIG[entry.aux];
    return {
      title: c.name,
      desc: `数量 ${game.aux.counts[entry.aux]}/${AUX_MAX[entry.aux]}（再买 +1）· 伤害${c.damage} 射速${c.fireRate} 射程${c.range}`,
      price: entry.price, icon: c.icon,
      value: `${entry.price} 银币`,
    };
  }
  if (entry.kind === 'auxEnhance') {
    return {
      title: `${AUX_CONFIG[entry.aux].name} · ${STAT_LABEL[entry.stat]}`,
      desc: `当前 ${entry.owned}/${max} 级`, price: entry.price,
      icon: `icon.enhance.${entry.stat}`, value: `等级 ${entry.owned}/${max}`,
    };
  }
  if (entry.kind === 'deployEnhance') {
    const label = entry.target === 'turret' ? `固定火炮 · ${STAT_LABEL[entry.stat]}` : '围墙 · 每段耐久 +50%';
    const icon = entry.target === 'turret' ? ITEMS.turret.visual.icon : ITEMS.wall.visual.icon;
    return {
      title: label, desc: `当前 ${entry.owned}/${max} 级`, price: entry.price,
      icon, value: `等级 ${entry.owned}/${max}`,
    };
  }
  if (entry.kind === 'item') {
    const it = ITEMS[entry.item];
    return {
      title: it.name, desc: `${it.desc}（持有 ${game.inventory[entry.item] || 0}）`, price: entry.price,
      icon: it.visual.icon, value: `${entry.price} 银币`,
    };
  }
  return {
    title: '提前进入下一档',
    desc: entry.bonus > 0 ? `下一档立即到来，奖励 ${entry.bonus} 银币` : '下一档立即到来（无奖励）',
    price: null, icon: 'icon.currency.silver', value: `${entry.bonus} 银币`,
  };
}
```

将 `buildEntryEl` 的 DOM 创建段替换为下面的完整实现；`data-*` 是 Task 9 的 tooltip 数据入口，辅助强化每一张卡仍按 `owned0` 禁用：

```js
function buildEntryEl(entry, game, handlers) {
  const { onBuy, onEarlyTier } = handlers;
  const v = entryView(entry, game);
  const el = document.createElement('div');
  const affordable = v.price === null || game.coins >= v.price;
  const disabled = !affordable || entry.owned0 === true;
  el.className = 'card shop-item' + (disabled ? ' disabled' : '');
  el.dataset.visualId = v.icon;
  el.dataset.tooltipName = v.title;
  el.dataset.tooltipDescription = v.desc;
  el.dataset.tooltipValue = v.value;
  el.innerHTML = `<h4>${v.title}</h4><p>${v.desc}</p>` +
    (v.price !== null ? `<p class="shop-price">${v.price} 银币</p>` : '');
  el.prepend(createIconCanvas(v.icon, 48));
  if (v.price !== null) {
    const currency = createIconCanvas('icon.currency.silver', 24);
    currency.className = 'currency-icon';
    el.appendChild(currency);
  }
  el.addEventListener('click', () => {
    if (entry.kind === 'earlyTier') onEarlyTier(entry.bonus);
    else if (!disabled) onBuy(entry);
  });
  return el;
}
```

在 `showShop` 中，先保留现有 `catalogFor` 分组及回调，再在 header/build 中插入图标，并给辅助强化子行增加整行状态：

```js
head.innerHTML = `<h2>商店</h2><p class="shop-coins">银币：${game.coins}</p>`;
head.prepend(createIconCanvas('icon.currency.silver', 24));

build.innerHTML = `<div class="build-head">${WEAPONS[game.weapon.id].name}</div><div class="build-stat">${dims}</div>`;
build.prepend(createIconCanvas(WEAPONS[game.weapon.id].icon, 48));
```

把辅助强化分组中当前的 `sub.className = 'shop-row';` 替换为：

```js
sub.className = 'shop-row' + ((game.aux.counts[t.aux] ?? 0) === 0 ? ' aux-unowned' : '');
```

在 `src/ui/upgrades.js` 引入 `createIconCanvas`，增加纯展示模型，并让现有 render 使用模型字段；购买回调、金币扣除和重新渲染逻辑保持原样：

```js
import { createIconCanvas } from './icon.js';

export function upgradeView(w, meta) {
  const level = weaponLevel(meta, w.id);
  const maxed = level >= 10;
  const price = maxed ? null : weaponUpgradePrice(level);
  const currentDamage = w.damage * (1 + 0.2 * level);
  const nextDamage = maxed ? null : w.damage * (1 + 0.2 * (level + 1));
  return {
    id: w.id, icon: w.icon, level, maxed, price,
    currentDamage, nextDamage,
    disabled: maxed || meta.gold < price,
  };
}
```

将升级行模板中每个 row 改为带 `data-visual-id` 与 tooltip 数据的版本，并在 `rootEl.innerHTML = ...` 后插入缓存图标：

```js
const v = upgradeView(w, meta);
return `
  <div class="card upgrade-row"
       data-visual-id="${v.icon}"
       data-tooltip-name="${w.name}"
       data-tooltip-description="${w.desc}"
       data-tooltip-value="伤害 ${Math.round(v.currentDamage)}${v.maxed ? '' : ` → ${Math.round(v.nextDamage)}`}">
    <h4>${w.name} <span>Lv ${v.level}/10</span></h4>
    <p>伤害 ${Math.round(v.currentDamage)}${v.maxed ? '（已满级）' : ` → ${Math.round(v.nextDamage)}`}</p>
    <button class="btn upgrade-buy" data-id="${w.id}"${v.disabled ? ' disabled' : ''}${v.maxed ? '' : ' data-currency-icon="icon.currency.gold"'}>
      ${v.maxed ? '满级' : `升级（${v.price} 金币）`}
    </button>
  </div>`;
```

紧接着 `rootEl.innerHTML` 后增加：

```js
for (const row of rootEl.querySelectorAll('.upgrade-row[data-visual-id]'))
  row.prepend(createIconCanvas(row.dataset.visualId, 48));
for (const button of rootEl.querySelectorAll('.upgrade-buy[data-currency-icon]')) {
  const currency = createIconCanvas(button.dataset.currencyIcon, 24);
  currency.className = 'currency-icon';
  button.prepend(currency);
}
```

在 `style.css` 的商店/升级段追加以下规则，确保 icon 不挤掉卡片文字，且未拥有辅助强化表现为整行低对比度：

```css
.ui-icon { width: 48px; height: 48px; display: block; object-fit: contain; }
.currency-icon { width: 24px; height: 24px; display: inline-block; vertical-align: middle; object-fit: contain; margin: 0 4px; }
.shop-head { display: flex; flex-direction: column; align-items: center; }
.shop-item .ui-icon { margin: 0 auto 4px; }
.shop-row.aux-unowned { opacity: .45; }
.shop-row.aux-unowned .shop-row-title { color: var(--text-dim); border-color: var(--neon-dim); }
.upgrade-row .ui-icon { flex: 0 0 auto; margin: 0; }
.upgrade-row .currency-icon { flex: 0 0 auto; }
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/shop.test.js test/shop-ui.test.js`

Expected: PASS；目录数量、价格、购买副作用、辅助强化三类分行和 `owned0` 购买限制全部保持，UI mock 能找到 `icon.item.medkit`、`icon.currency.silver` 与至少三条 `aux-unowned` 行，`upgradeView` 返回 `icon.weapon.pistol` 与原伤害/价格数值。

Run: `npm test`

Expected: PASS。

启动浏览器实景验收：

```bash
npm start
```

用 webbridge 打开本地页面，进入商店和武器升级界面，在一个窄视口与一个宽视口分别截图；核对武器/道具/辅助/强化/银币或金币图标均为透明底、辅助强化仍按三类分行且未拥有整行置灰，图标未触发重复解码。截图与 manifest ID 一一核对后再进入 Task 9。

- [ ] **Step 5: 提交**

```bash
git add src/ui/icon.js src/ui/shop.js src/ui/upgrades.js style.css test/shop.test.js test/shop-ui.test.js
git commit -m "UI改造任务8: 商店与武器升级卡片接入图标"
```

---

### Task 9: HUD 五槽图标与边界安全 tooltip

**Files:**
- Create: `src/ui/tooltip.js`
- Modify: `src/systems/hud.js:1-108`
- Modify: `src/ui/shop.js:47-125`
- Modify: `src/ui/upgrades.js:7-50`
- Modify: `src/ui/bestiary.js:5-68`
- Modify: `style.css:23-25,69-110`
- Test: `test/hud.test.js:1-18`
- Test: `test/shop-ui.test.js:1-64`

**Interfaces:**
- Consumes: `renderHud(ctx, game, viewport)` 与 Task 1 的 CSS 逻辑视口、`#ui-overlay` 覆盖层；`PALETTE` 的 `{ bg, panel, neon, neonDim, gold, text, textDim, ground, obstacle, hudPanel, boundary }`；`getVisualCanvas(id, size, options?)`；Task 8 的 `createIconCanvas`、`data-tooltip-*` 与配置 icon 字段。
- Produces: `hudLayout(viewport)`；`itemSlotView(id, inventory)`；`hudTooltipView(slot)`；`positionTooltip(anchorRect, tooltipRect, viewport)`；`normalizeTooltipData(data)`；`createTooltip(root?)`；`bindTooltip(target, tooltip, data)`；`attachTooltips(root)`。HUD 固定 5 槽、非空槽绘制图标/数字键/数量角标、空槽绘制低对比锁定框；DOM tooltip 显示名称/说明/数值，并以 `getBoundingClientRect()` 手动夹在视口内，不依赖尚未广泛可用的 CSS Anchor Positioning。

- [ ] **Step 1: 写失败测试**

把 `test/hud.test.js` 保留现有 `formatTime` 与 `adventureTierProgress` 两个用例，并在 import 区及文件末尾增加以下完整测试代码：

```js
import { hudLayout, itemSlotView, hudTooltipView } from '../src/systems/hud.js';
import { positionTooltip, normalizeTooltipData, createTooltip } from '../src/ui/tooltip.js';


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
```

在 `test/shop-ui.test.js` 的 showShop 用例最后追加以下 tooltip 数据钩子断言，确保 Task 8 的卡片能被 Task 9 的委托绑定：

```js
const nodes = flatten(root);
const medkit = nodes.find(n => n.dataset.visualId === 'icon.item.medkit');
assert.ok(medkit);
assert.equal(medkit.dataset.tooltipName, '医疗包');
assert.equal(medkit.dataset.tooltipDescription, '立即回复 50% HP');
assert.equal(medkit.dataset.tooltipValue, '30 银币');
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/hud.test.js test/shop-ui.test.js`

Expected: FAIL with `The requested module '../src/systems/hud.js' does not provide an export named 'hudLayout'` 或 `Cannot find module '../src/ui/tooltip.js'`；现有时间与冒险进度用例仍应被发现并执行。

- [ ] **Step 3: 最小实现**

创建 `src/ui/tooltip.js`。使用手动 `getBoundingClientRect()` 作为跨浏览器 fallback；不引入 polyfill 或外部依赖，所有文本通过 `textContent` 写入，避免配置文本被当作 HTML：

```js
// src/ui/tooltip.js —— DOM 覆盖层 tooltip；位置计算保持纯函数可单测。
const VIEWPORT_GAP = 8;

export function normalizeTooltipData(data = {}) {
  return {
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    value: String(data.value ?? ''),
  };
}

export function positionTooltip(anchorRect, tooltipRect, viewport) {
  const width = Math.max(1, Number(viewport.width) || 1);
  const height = Math.max(1, Number(viewport.height) || 1);
  const maxLeft = Math.max(VIEWPORT_GAP, width - tooltipRect.width - VIEWPORT_GAP);
  const maxTop = Math.max(VIEWPORT_GAP, height - tooltipRect.height - VIEWPORT_GAP);
  const left = Math.min(
    maxLeft,
    Math.max(VIEWPORT_GAP, anchorRect.left + (anchorRect.width - tooltipRect.width) / 2),
  );
  let top = anchorRect.top - tooltipRect.height - VIEWPORT_GAP;
  if (top < VIEWPORT_GAP) top = anchorRect.bottom + VIEWPORT_GAP;
  return {
    left,
    top: Math.min(maxTop, Math.max(VIEWPORT_GAP, top)),
  };
}

function noOpTooltip() {
  return { element: null, show() {}, hide() {}, destroy() {} };
}

export function createTooltip(root = null) {
  const doc = root?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const parent = root || doc?.body;
  if (!doc?.createElement || !parent) return noOpTooltip();

  const element = doc.createElement('div');
  element.className = 'ui-tooltip';
  element.setAttribute('role', 'tooltip');
  element.hidden = true;
  const name = doc.createElement('strong');
  const description = doc.createElement('span');
  const value = doc.createElement('span');
  value.className = 'ui-tooltip-value';
  element.appendChild(name);
  element.appendChild(description);
  element.appendChild(value);
  parent.appendChild(element);

  const show = (anchor, rawData) => {
    const data = normalizeTooltipData(rawData);
    name.textContent = data.name;
    description.textContent = data.description;
    value.textContent = data.value;
    value.hidden = !data.value;
    element.hidden = false;
    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = element.getBoundingClientRect();
    const viewport = {
      width: Number(globalThis.innerWidth) || doc.documentElement?.clientWidth || 1,
      height: Number(globalThis.innerHeight) || doc.documentElement?.clientHeight || 1,
    };
    const p = positionTooltip(anchorRect, tooltipRect, viewport);
    element.style.left = `${p.left}px`;
    element.style.top = `${p.top}px`;
  };
  const hide = () => { element.hidden = true; };
  const destroy = () => {
    if (element.parentNode?.removeChild) element.parentNode.removeChild(element);
    else element.remove?.();
  };
  return { element, show, hide, destroy };
}

export function bindTooltip(target, tooltip, data) {
  const show = () => tooltip.show(target, data);
  target.addEventListener('mouseenter', show);
  target.addEventListener('focus', show);
  target.addEventListener('mouseleave', tooltip.hide);
  target.addEventListener('blur', tooltip.hide);
  return target;
}

export function attachTooltips(root) {
  if (!root) return noOpTooltip();
  root.__tooltipController?.destroy?.();
  const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const tooltip = createTooltip(doc?.body || root);
  const targets = root.querySelectorAll?.('[data-tooltip-name]') || [];
  for (const target of targets) {
    bindTooltip(target, tooltip, {
      name: target.dataset.tooltipName,
      description: target.dataset.tooltipDescription,
      value: target.dataset.tooltipValue,
    });
  }
  root.__tooltipController = tooltip;
  return tooltip;
}
```

在 `src/systems/hud.js` import 区加入 `PALETTE`、`getVisualCanvas` 和 `attachTooltips`，并追加以下纯布局/视图函数；五槽坐标使用传入的 CSS viewport，不能读取 `ctx.canvas.width/height`：

```js
import { PALETTE } from '../config/palette.js';
import { getVisualCanvas } from '../core/visuals.js';
import { attachTooltips } from '../ui/tooltip.js';

const HUD_MARGIN = 16;
const ITEM_SLOT_WIDTH = 72;
const ITEM_SLOT_HEIGHT = 48;
const ITEM_GAP = 8;
const ITEM_BOTTOM = 32;
const ITEM_ICON_SIZE = 32;

export function hudLayout(viewport = {}) {
  const width = Math.max(1, Number(viewport.width) || 1);
  const height = Math.max(1, Number(viewport.height) || 1);
  const itemSlots = ITEM_IDS.map((id, index) => {
    const x = HUD_MARGIN + index * (ITEM_SLOT_WIDTH + ITEM_GAP);
    const y = height - ITEM_BOTTOM - ITEM_SLOT_HEIGHT;
    return {
      id, x, y, width: ITEM_SLOT_WIDTH, height: ITEM_SLOT_HEIGHT,
      iconX: x + 8, iconY: y + 8,
    };
  });
  return {
    width, height, leftX: HUD_MARGIN, rightX: width - HUD_MARGIN,
    itemSlots, weaponY: height - 8,
  };
}

export function itemSlotView(id, inventory = {}) {
  const item = ITEMS[id];
  const count = inventory[id] || 0;
  return {
    id, key: item.key, name: item.name, desc: item.desc,
    icon: item.visual.icon, count, empty: count === 0,
  };
}

export function hudTooltipView(slot) {
  return {
    name: slot.name,
    description: slot.desc,
    value: `数量 ${slot.count} · 数字键 ${slot.key}`,
  };
}

function syncHudTooltips(game, layout) {
  if (typeof document === 'undefined') return;
  const overlay = document.getElementById('ui-overlay');
  if (!overlay) return;
  let root = overlay.querySelector('#hud-tooltip-targets');
  if (!root) {
    root = document.createElement('div');
    root.id = 'hud-tooltip-targets';
    root.className = 'hud-tooltip-targets';
    overlay.appendChild(root);
  }
  const slots = ITEM_IDS.map(id => itemSlotView(id, game.inventory));
  const signature = `${layout.width}x${layout.height}|${slots.map(s => `${s.id}:${s.count}`).join(',')}`;
  for (let i = 0; i < slots.length; i++) {
    const target = root.children[i] || document.createElement('button');
    if (!target.parentNode) root.appendChild(target);
    const slot = layout.itemSlots[i];
    const view = slots[i];
    target.type = 'button';
    target.className = 'hud-tooltip-anchor';
    target.tabIndex = 0;
    target.setAttribute('aria-label', view.name);
    target.dataset.tooltipName = view.name;
    target.dataset.tooltipDescription = view.desc;
    target.dataset.tooltipValue = hudTooltipView(view).value;
    target.style.left = `${slot.x}px`;
    target.style.top = `${slot.y}px`;
    target.style.width = `${slot.width}px`;
    target.style.height = `${slot.height}px`;
    target.hidden = false;
  }
  for (let i = slots.length; i < root.children.length; i++) root.children[i].hidden = true;
  if (root.dataset.tooltipSignature !== signature) {
    root.dataset.tooltipSignature = signature;
    attachTooltips(root);
  }
}
```

在 Task 1 已改为 `renderHud(ctx, game, viewport)` 的 HUD 函数中，保留上方血条、计时、击杀和冒险进度的 palette/逻辑实现，只把三槽旧文字区域整体替换为以下完整五槽绘制段，并把右上横坐标改为 `layout.rightX`、底部武器信息基线改为 `layout.weaponY`：

```js
const layout = hudLayout(viewport);
const W = layout.width;
const H = layout.height;

// 左下：5 个道具槽；非空槽从 id+size 离屏缓存贴图，空槽只画低对比锁定框。
ctx.textAlign = 'left';
const slots = ITEM_IDS.map(id => itemSlotView(id, game.inventory));
for (let i = 0; i < slots.length; i++) {
  const view = slots[i];
  const slot = layout.itemSlots[i];
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.strokeRect(slot.x + 0.5, slot.y + 0.5, slot.width - 1, slot.height - 1);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(String(view.key), slot.x + 6, slot.y + 14);
  if (view.empty) {
    ctx.beginPath();
    ctx.arc(slot.x + slot.width / 2, slot.y + 19, 7, Math.PI, 0);
    ctx.strokeStyle = PALETTE.neonDim;
    ctx.stroke();
    ctx.strokeRect(slot.x + slot.width / 2 - 9, slot.y + 19, 18, 14);
  } else {
    ctx.drawImage(getVisualCanvas(view.icon, ITEM_ICON_SIZE), slot.iconX, slot.iconY, ITEM_ICON_SIZE, ITEM_ICON_SIZE);
    ctx.fillStyle = PALETTE.neonDim;
    ctx.fillRect(slot.x + slot.width - 24, slot.y + slot.height - 20, 18, 16);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(String(view.count), slot.x + slot.width - 14, slot.y + slot.height - 8);
  }
}

// 底部当前武器信息仍使用逻辑 CSS viewport，不使用物理 canvas 尺寸。
ctx.fillStyle = PALETTE.text;
const dims = ENHANCE_STATS.map(s => `${STAT_LABEL[s].split(' ')[0]}${game.weapon.enhance[s]}`).join(' ');
let info = WEAPONS[game.weapon.id].name + ' · ' + dims;
const aux = game.aux;
if (aux && Object.values(aux.counts).some(n => n > 0)) {
  info += ' · 辅助 ' + Object.entries(aux.counts).filter(([, n]) => n > 0)
    .map(([k, n]) => `${AUX_CONFIG[k].name}×${n}`).join(' ');
}
ctx.fillText(info, layout.leftX, layout.weaponY);
syncHudTooltips(game, layout);
```

在 `src/ui/shop.js` 的 `showShop` 结束处、`src/ui/upgrades.js` 的 `render` 完成 DOM 与事件监听后调用 `attachTooltips(rootEl)`；在 `src/ui/bestiary.js` 增加 icon/tooltip 接入。图鉴的 `weaponView` 返回值增加 `icon: w.icon`，怪物卡保留 Task 7 之前的 `color` 数据直到后续怪物视觉任务；完整的武器卡 DOM 改法为：

```js
import { createIconCanvas } from './icon.js';
import { attachTooltips } from './tooltip.js';

export function weaponView(w, weaponLevels) {
  const level = weaponLevels[w.id] ?? 0;
  return {
    id: w.id, name: w.name, desc: w.desc, icon: w.icon,
    level, maxed: level >= 10,
    damage: w.damage, nextDamage: w.damage * (1 + 0.2 * (level + 1)),
    nextDelta: Math.round(w.damage * 0.2),
    stats: { fireRate: w.fireRate, range: w.range, pierce: w.pierce },
  };
}

// showBestiary 的武器卡模板使用 data-*，不再渲染 .bestiary-swatch：
<div class="card bestiary-card"
     data-visual-id="${v.icon}"
     data-tooltip-name="${v.name}"
     data-tooltip-description="${v.desc}"
     data-tooltip-value="伤害 ${v.damage} · 射程 ${v.stats.range}">
  <h4>${v.name}</h4><p>${v.desc}</p>
  <p>伤害 ${v.damage} · 射速 ${v.stats.fireRate}/s · 射程 ${v.stats.range}</p>
  <p>局外等级 Lv ${v.level}/10${v.maxed ? '（已满级）' : ` · 下一级伤害 +${v.nextDelta}`}</p>
</div>

// rootEl.innerHTML 设置完成后：
for (const card of rootEl.querySelectorAll('.bestiary-card[data-visual-id]'))
  card.prepend(createIconCanvas(card.dataset.visualId, 48));
attachTooltips(rootEl);
```

对商店和升级同样在 DOM 更新完成后调用 `attachTooltips(rootEl)`，以便重复打开/购买重渲染时销毁旧 controller 后重新绑定，不累积事件监听。向 `style.css` 增加覆盖层、HUD 命中区和 tooltip 样式：

```css
#ui-overlay { position: absolute; inset: 0; pointer-events: none; }
#ui-overlay .interactive, #ui-overlay .hud-tooltip-anchor { pointer-events: auto; }
.hud-tooltip-targets { position: absolute; inset: 0; pointer-events: none; }
.hud-tooltip-anchor {
  position: absolute; padding: 0; border: 0; background: transparent;
  pointer-events: auto; opacity: 0; cursor: help;
}
.ui-tooltip {
  position: fixed; z-index: 20; max-width: 240px; padding: 8px 10px;
  display: flex; flex-direction: column; gap: 4px;
  pointer-events: none; color: var(--text); background: var(--panel);
  border: 1px solid var(--neon); border-radius: var(--radius);
  box-shadow: 0 0 12px rgba(94,255,138,.35); font-size: 12px;
}
.ui-tooltip strong { color: var(--gold); font-size: 14px; }
.ui-tooltip span { color: var(--text-dim); }
.ui-tooltip .ui-tooltip-value { color: var(--neon); }
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/hud.test.js test/shop-ui.test.js`

Expected: PASS；HUD 布局在 `800×600` 与 `1600×900` 使用不同右锚点和底部 y，五个槽的 icon/key/count/empty 视图字段精确匹配，tooltip 位置在上方空间不足时翻到下方并在左右/下边界夹取，无 DOM 时安全返回 no-op。

Run: `npm test`

Expected: PASS。

启动浏览器并用 webbridge 做实景验收：

```bash
npm start
```

至少截图一个小视口、一个宽视口和一个高 DPR 视口；在 HUD 中验证 5 槽图标、数字键和数量角标，空槽为低对比锁定框；悬停商店、升级、图鉴武器卡和 HUD 槽位，确认 tooltip 含名称/说明/数值且靠近四边时不出屏。记录截图对应的 manifest ID、CSS viewport、DPR 与 tooltip 边界结果，不把 PNG 像素断言写进 Node 测试。

- [ ] **Step 5: 提交**

```bash
git add src/ui/tooltip.js src/systems/hud.js src/ui/shop.js src/ui/upgrades.js src/ui/bestiary.js style.css test/hud.test.js test/shop-ui.test.js
git commit -m "UI改造任务9: HUD五槽图标与边界安全tooltip"
```
### Task 10: 共享最短弧角度工具与主角朝向插值

**Files:**
- Create: `src/core/angles.js`
- Modify: `src/entities/player.js:1-21`
- Test: `test/player.test.js`

**Interfaces:**
- Consumes: 现有 `createPlayer(x, y)` 与 `updatePlayer(p, input, obstacles, mapSize, dt)`；无前序任务包接口。
- Produces: `TURN_RATE = 240 * Math.PI / 180`、`FIRE_TOLERANCE = Math.PI / 12`、`normAngle(a)`、`turnToward(current, target, maxDelta)`；`updatePlayer` 继续保持原参数和移动/碰撞/受伤语义，只把 `p.facing` 改为最短弧插值。

- [ ] **Step 1: 写失败测试**

将 `test/player.test.js` 改为以下完整内容。新增断言先导入尚不存在的 `src/core/angles.js`，并明确验证角速度上限、跨越 `±π` 的短弧方向，以及原有移动/碰撞/受伤行为不变。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer, damagePlayer } from '../src/entities/player.js';
import { circleRectHit } from '../src/core/physics.js';
import { FIRE_TOLERANCE, TURN_RATE, normAngle, turnToward } from '../src/core/angles.js';

const IDLE = { up: false, down: false, left: false, right: false };
const EPSILON = 1e-12;

test('向右移动 1 秒前进 speed 距离', () => {
  const p = createPlayer(1500, 1500);
  updatePlayer(p, { ...IDLE, right: true }, [], 3000, 1);
  assert.ok(Math.abs(p.x - (1500 + p.speed)) < 1e-6);
});

test('斜向移动速度不叠加（归一化）', () => {
  const p = createPlayer(1500, 1500);
  updatePlayer(p, { ...IDLE, right: true, up: true }, [], 3000, 1);
  const moved = Math.hypot(p.x - 1500, p.y - 1500);
  assert.ok(Math.abs(moved - p.speed) < 1e-6);
});

test('被矩形障碍挡住且不陷入', () => {
  const rect = { kind: 'rect', x: 1600, y: 1400, w: 100, h: 200 };
  const p = createPlayer(1500, 1500);
  for (let i = 0; i < 60; i++) updatePlayer(p, { ...IDLE, right: true }, [rect], 3000, 1 / 60);
  assert.equal(circleRectHit(p.x, p.y, p.r, rect), false);
});

test('地图边界夹紧', () => {
  const p = createPlayer(10, 10);
  updatePlayer(p, { ...IDLE, left: true, up: true }, [], 3000, 1);
  assert.ok(p.x >= p.r && p.y >= p.r);
});

test('受伤 0.5s 无敌帧', () => {
  const p = createPlayer(1500, 1500);
  assert.equal(damagePlayer(p, 20), true);
  assert.equal(p.hp, 80);
  assert.equal(damagePlayer(p, 20), false);
  assert.equal(p.hp, 80);
  updatePlayer(p, IDLE, [], 3000, 0.6);
  assert.equal(damagePlayer(p, 20), true);
  assert.equal(p.hp, 60);
});

test('角度工具导出已确认常量并把角度归一到最短差值', () => {
  assert.equal(TURN_RATE, 240 * Math.PI / 180);
  assert.equal(FIRE_TOLERANCE, Math.PI / 12);
  assert.ok(Math.abs(normAngle(3 * Math.PI / 2) + Math.PI / 2) < EPSILON);
  assert.ok(Math.abs(normAngle(-3 * Math.PI / 2) - Math.PI / 2) < EPSILON);
});

test('turnToward 每次最多转 TURN_RATE×dt，未超限时准确到达目标', () => {
  const maxDelta = TURN_RATE * 0.1;
  assert.ok(Math.abs(turnToward(0, Math.PI / 2, maxDelta) - maxDelta) < EPSILON);
  assert.ok(Math.abs(turnToward(0, Math.PI / 2, Math.PI) - Math.PI / 2) < EPSILON);
});

test('turnToward 跨越 ±pi 时选择短弧并保持连续角度', () => {
  const current = Math.PI - 0.05;
  const target = -Math.PI + 0.05;
  assert.ok(Math.abs(turnToward(current, target, 0.2) - (Math.PI + 0.05)) < EPSILON);
});

test('玩家 facing 按 240°/s 上限插值而不是瞬时跳转', () => {
  const p = createPlayer(1500, 1500);
  updatePlayer(p, { ...IDLE, up: true }, [], 3000, 0.1);
  assert.ok(Math.abs(p.facing + TURN_RATE * 0.1) < EPSILON);
  assert.ok(Math.abs(p.facing + Math.PI / 2) > EPSILON);
});

test('玩家 facing 跨越 ±pi 沿短弧转动', () => {
  const p = createPlayer(1500, 1500);
  p.facing = Math.PI - 0.05;
  updatePlayer(p, { ...IDLE, left: true, up: true }, [], 3000, 0.1);
  const expected = Math.PI - 0.05 + TURN_RATE * 0.1;
  assert.ok(Math.abs(p.facing - expected) < EPSILON);
  assert.ok(p.facing > Math.PI - 0.05);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/player.test.js`

Expected: FAIL，首先报 `ERR_MODULE_NOT_FOUND: Cannot find module .../src/core/angles.js`；此时不是删除或放宽新增断言，而是继续实现角度模块。

- [ ] **Step 3: 最小实现**

新建 `src/core/angles.js`，并将 `src/entities/player.js` 替换为以下完整实现。`turnToward` 只归一化目标差值，不把返回角度重新折回 `[-π, π]`，从而让跨边界的连续朝向不会在数值表示上跳变。

```js
// src/core/angles.js —— 所有视觉朝向共用的最短弧角度工具。
export const TURN_RATE = 240 * Math.PI / 180;
export const FIRE_TOLERANCE = Math.PI / 12;

export function normAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function turnToward(current, target, maxDelta) {
  const delta = normAngle(target - current);
  const limit = Math.max(0, maxDelta);
  if (Math.abs(delta) <= limit) return current + delta;
  return current + Math.sign(delta) * limit;
}
```

```js
import { slideCircleObstacles } from '../core/physics.js';
import { TURN_RATE, turnToward } from '../core/angles.js';

export function createPlayer(x, y) {
  return { x, y, r: 16, hp: 100, maxHp: 100, speed: 180,
    pickupRadius: 80, invuln: 0, xp: 0, level: 1, facing: 0 };
}

export function updatePlayer(p, input, obstacles, mapSize, dt) {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    p.x += dx / len * p.speed * dt;
    p.y += dy / len * p.speed * dt;
    p.facing = turnToward(p.facing, Math.atan2(dy, dx), TURN_RATE * Math.max(0, dt));
  }
  p.x = Math.max(p.r, Math.min(mapSize - p.r, p.x));
  p.y = Math.max(p.r, Math.min(mapSize - p.r, p.y));
  slideCircleObstacles(p, obstacles);
  if (p.invuln > 0) p.invuln -= dt;
}

export function damagePlayer(p, dmg) {
  if (p.invuln > 0) return false;
  p.hp -= dmg;
  p.invuln = 0.5;
  return true;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/player.test.js && npm test`

Expected: `test/player.test.js` 的 10 个用例全部 PASS，随后 `npm test` 全量 PASS；既有移动、碰撞和受伤断言的数值不变。

- [ ] **Step 5: 提交**

```bash
git add src/core/angles.js src/entities/player.js test/player.test.js
git commit -m "UI改造任务10: 新增最短弧角度工具并平滑主角朝向"
```

---

### Task 11: 固定火炮平滑瞄准与组合视觉

**Files:**
- Modify: `src/entities/turret.js:1-59`
- Modify: `src/game.js:18-21,154-177,617-637`
- Test: `test/turret.test.js`

**Interfaces:**
- Consumes: `TURN_RATE`、`FIRE_TOLERANCE`、`normAngle`、`turnToward`；任务包 2 的 `registerPart(id, drawFn)` 与 `drawVisual(ctx, id, x, y, size, options?)`；任务包 1 的 `PALETTE` 语义字段；任务包 3 已登记的固定火炮 UI 图标仍由 `ITEMS.turret.visual.icon` 提供，本任务不生成图片。
- Produces: `TURRET_VISUAL_ID = 'deployable.turret'`；`createTurret(x, y, enhance, initialAim = 0)` 返回顶层 `aimAngle`；`updateTurret` 在 cooldown 期间持续更新 `aimAngle`，只在 `FIRE_TOLERANCE` 内发射，并在弹道选项上提供现有粒子特效管线消费的 `muzzleFlash` 字段。

- [ ] **Step 1: 写失败测试**

将 `test/turret.test.js` 改为以下完整内容。测试同时锁定顶层 `aimAngle`、短弧/240°/s 限制、cooldown 期间追踪、无目标保持朝向、±15° 容差、炮口闪光元数据与注册表 visual；mock context 只记录 Canvas 调用，不依赖 DOM 或 PNG 像素。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawVisual } from '../src/core/visuals.js';
import { PALETTE } from '../src/config/palette.js';
import { FIRE_TOLERANCE, TURN_RATE } from '../src/core/angles.js';
import { createTurret, updateTurret, TURRET_VISUAL_ID } from '../src/entities/turret.js';

const rng = () => 0.5;
const EPSILON = 1e-9;

function targetAt(angle, distance = 100) {
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, alive: true };
}

function mockContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of [
    'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'fill', 'stroke', 'fillRect', 'rect',
  ]) {
    ctx[name] = (...args) => calls.push({ name, args });
  }
  return ctx;
}

test('createTurret 字段：位置/半径/耐久 200/alive/weapon/aimAngle', () => {
  const e = { damage: 0, fireRate: 0, projectiles: 0, range: 0 };
  const t = createTurret(100, 200, e);
  assert.equal(t.x, 100);
  assert.equal(t.y, 200);
  assert.equal(t.r, 20);
  assert.equal(t.hp, 200);
  assert.equal(t.maxHp, 200);
  assert.equal(t.alive, true);
  assert.equal(t.weapon.enhance, e);
  assert.equal(t.weapon.cooldown, 0);
  assert.equal(t.aimAngle, 0);
  assert.equal(createTurret(0, 0, e, Math.PI / 4).aimAngle, Math.PI / 4);
});

test('射程内僵尸触发开火：基础 25/0.5/350/350、aoe 80、pierce 0、炮口闪光', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const shots = [];
  updateTurret(t, [{ x: 100, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  const s = shots[0];
  assert.equal(s.x, 0);
  assert.equal(s.y, 0);
  assert.equal(s.angle, 0);
  assert.equal(t.aimAngle, 0);
  assert.equal(s.damage, 25);
  assert.equal(s.speed, 350);
  assert.equal(s.range, 350);
  assert.equal(s.pierce, 0);
  assert.equal(s.aoe, 80);
  assert.deepEqual(s.muzzleFlash, { color: PALETTE.gold, count: 2, distance: 28 });
});

test('cooldown = 1/fireRate（2s），冷却期间仍追踪，冷却结束后再开火', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const z = { x: 100, y: 0, alive: true };
  const shots = [];
  updateTurret(t, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.ok(Math.abs(t.weapon.cooldown - 2) < EPSILON);
  z.x = 0;
  z.y = 100;
  updateTurret(t, [z], s => shots.push(s), rng, 0.25);
  assert.equal(shots.length, 1);
  assert.ok(Math.abs(t.aimAngle - TURN_RATE * 0.25) < EPSILON);
  assert.ok(Math.abs(t.weapon.cooldown - 1.75) < EPSILON);
  updateTurret(t, [z], s => shots.push(s), rng, 1.75);
  assert.equal(shots.length, 2);
  assert.ok(Math.abs(shots[1].angle - Math.PI / 2) < EPSILON);
});

test('无目标时保持最近炮管朝向，同时正常扣减 cooldown', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 }, 0.7);
  t.weapon.cooldown = 0.5;
  updateTurret(t, [], () => {}, rng, 0.25);
  assert.equal(t.aimAngle, 0.7);
  assert.ok(Math.abs(t.weapon.cooldown - 0.25) < EPSILON);
});

test('目标在 ±15° 容差内开火，超出容差不发射', () => {
  const inside = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const insideShots = [];
  updateTurret(inside, [targetAt(Math.PI / 18)], s => insideShots.push(s), rng, 0);
  assert.equal(insideShots.length, 1);
  assert.equal(insideShots[0].angle, 0);
  assert.equal(inside.aimAngle, 0);
  assert.ok(Math.abs(Math.PI / 18) < FIRE_TOLERANCE);

  const outside = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const outsideShots = [];
  updateTurret(outside, [targetAt(Math.PI / 9)], s => outsideShots.push(s), rng, 0);
  assert.equal(outsideShots.length, 0);
  assert.ok(Math.abs(Math.PI / 9) > FIRE_TOLERANCE);
});

test('炮管跨越 ±pi 时沿短弧转动且受 240°/s 上限约束', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 }, Math.PI - 0.05);
  updateTurret(t, [targetAt(-Math.PI + 0.05)], () => {}, rng, 0.1);
  assert.ok(Math.abs(t.aimAngle - (Math.PI - 0.05 + TURN_RATE * 0.1)) < EPSILON);
});

test('射程外与死尸不开火', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  const shots = [];
  updateTurret(t, [{ x: 500, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
  updateTurret(t, [{ x: 100, y: 0, alive: false }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
});

test('enhance 生效：乘区/加法同 weaponStats 公式；共享引用', () => {
  const e = { damage: 2, fireRate: 1, projectiles: 2, range: 1 };
  const t = createTurret(0, 0, e);
  const z = { x: 400, y: 0, alive: true };
  const shots = [];
  updateTurret(t, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 3);
  for (const s of shots) {
    assert.equal(s.damage, 25 * 1.25 ** 2);
    assert.equal(s.range, 350 * 1.2);
    assert.equal(s.speed, 350);
    assert.equal(s.aoe, 80);
  }
  assert.ok(Math.abs(t.weapon.cooldown - 1 / (0.5 * 1.2)) < EPSILON);
  e.damage = 3;
  updateTurret(t, [z], s => shots.push(s), rng, 10);
  assert.equal(shots[3].damage, 25 * 1.25 ** 3);
});

test('耐久归零（alive=false）后不再开火', () => {
  const t = createTurret(0, 0, { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  t.alive = false;
  const shots = [];
  updateTurret(t, [{ x: 100, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
});

test('固定火炮 visual 已注册为组合绘制而非 circle 占位', () => {
  const ctx = mockContext();
  assert.equal(TURRET_VISUAL_ID, 'deployable.turret');
  assert.doesNotThrow(() => drawVisual(ctx, TURRET_VISUAL_ID, 10, 20, 20, {
    aimAngle: Math.PI / 4, hp: 100, maxHp: 200, phase: 0,
  }));
  assert.ok(ctx.calls.some(call => call.name === 'rotate'));
  assert.ok(ctx.calls.some(call => call.name === 'ellipse'));
  assert.ok(ctx.calls.some(call => call.name === 'lineTo'));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/turret.test.js`

Expected: FAIL，现有模块没有导出 `TURRET_VISUAL_ID`，Node 报 `SyntaxError: The requested module '../src/entities/turret.js' does not provide an export named 'TURRET_VISUAL_ID'`；实现后再处理 `aimAngle`、容差和 visual 断言。

- [ ] **Step 3: 最小实现**

将 `src/entities/turret.js` 替换为以下完整实现。注册表中的炮台 visual 只使用 `registerPart` 的局部 `(ctx, size, params, phase)` 契约；底座、铆钉、炮管、炮口制退器和耐久发光描边均为程序化几何，炮口闪光不在 visual 中重复绘制，而是通过 `muzzleFlash` 交给现有粒子管线。

```js
// 部署物：固定火炮。逻辑与程序化视觉均无 DOM/图片依赖。
import { registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';
import { FIRE_TOLERANCE, TURN_RATE, normAngle, turnToward } from '../core/angles.js';

const TURRET_BASE = { damage: 25, fireRate: 0.5, projectileSpeed: 350, range: 350, aoe: 80 };
export const TURRET_VISUAL_ID = 'deployable.turret';

function turretStats(t) {
  const e = t.weapon.enhance || {};
  return {
    damage: TURRET_BASE.damage * Math.pow(1.25, e.damage || 0),
    fireRate: TURRET_BASE.fireRate * Math.pow(1.2, e.fireRate || 0),
    projectiles: 1 + (e.projectiles || 0),
    range: TURRET_BASE.range * Math.pow(1.2, e.range || 0),
    projectileSpeed: TURRET_BASE.projectileSpeed,
    aoe: TURRET_BASE.aoe,
  };
}

function drawTurretVisual(ctx, size, params = {}, phase = 0) {
  void phase;
  const r = size;
  const aim = params.aimAngle ?? 0;
  const ratio = params.maxHp > 0
    ? Math.max(0, Math.min(1, params.hp / params.maxHp))
    : 0;

  ctx.save();
  ctx.shadowColor = PALETTE.neonDim;
  ctx.shadowBlur = Math.max(3, r * 0.35);
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.82, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();

  ctx.fillStyle = PALETTE.textDim;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.42, Math.max(1, r * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.rotate(aim);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.beginPath();
  ctx.moveTo(-r * 0.18, -r * 0.24);
  ctx.lineTo(r * 1.02, -r * 0.24);
  ctx.lineTo(r * 1.12, -r * 0.16);
  ctx.lineTo(r * 1.12, r * 0.16);
  ctx.lineTo(r * 1.02, r * 0.24);
  ctx.lineTo(-r * 0.18, r * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();
  ctx.fillStyle = PALETTE.neon;
  ctx.fillRect(r * 1.02, -r * 0.28, r * 0.22, r * 0.56);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.3 + 0.7 * (1 - ratio);
  ctx.shadowColor = PALETTE.gold;
  ctx.shadowBlur = 8 + (1 - ratio) * 4;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2 + (1 - ratio) * 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.96, r * 0.76, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

registerPart(TURRET_VISUAL_ID, drawTurretVisual);

export function createTurret(x, y, enhance, initialAim = 0) {
  return {
    x, y, r: 20, hp: 200, maxHp: 200, alive: true,
    aimAngle: normAngle(initialAim),
    weapon: {
      id: 'turret',
      enhance: enhance || { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
      cooldown: 0,
    },
  };
}

// 自动开火：每帧索敌并追踪；cooldown 期间也转动炮管；进入 ±15° 后齐射。
// rng 保留签名兼容（单发无散射随机）。耐久归零（alive=false）后停火。
export function updateTurret(t, zombies, spawnProjectile, rng, dt) {
  if (!t.alive) return;
  if (!Number.isFinite(t.aimAngle)) t.aimAngle = normAngle(t.weapon.lastAim ?? 0);
  t.weapon.cooldown = Math.max(0, t.weapon.cooldown - dt);

  const s = turretStats(t);
  let best = null, bestD = s.range;
  for (const z of zombies) {
    if (!z.alive) continue;
    const d = Math.hypot(z.x - t.x, z.y - t.y);
    if (d <= s.range && d < bestD) { best = z; bestD = d; }
  }
  if (!best) return;

  const targetAngle = Math.atan2(best.y - t.y, best.x - t.x);
  t.aimAngle = turnToward(t.aimAngle, targetAngle, TURN_RATE * Math.max(0, dt));
  if (t.weapon.cooldown > 0) return;
  if (Math.abs(normAngle(targetAngle - t.aimAngle)) > FIRE_TOLERANCE) return;

  const angle = t.aimAngle;
  for (let i = 0; i < s.projectiles; i++) {
    spawnProjectile({
      x: t.x, y: t.y,
      angle,
      speed: s.projectileSpeed,
      damage: s.damage,
      range: s.range,
      pierce: 0,
      knockback: 0,
      aoe: s.aoe,
      muzzleFlash: { color: PALETTE.gold, count: 2, distance: t.r * 1.4 },
    });
  }
  t.weapon.cooldown = 1 / s.fireRate;
}
```

在 `src/game.js` 中保留现有 `spawnProjectile` 的池化与音效语义，只增加炮口闪光到已有 `spawnParticles` 管线的桥接，并把导入和渲染段改成以下内容：

```js
// import 区
import { createAux, spawnAuxBodies, updateAuxBodies } from './entities/companions.js';
import { createTurret, updateTurret, TURRET_VISUAL_ID } from './entities/turret.js';
import { createTeslaBall, updateTeslaBall } from './entities/teslaball.js';
import { createWallSegment } from './entities/wall.js';
// ...
import { drawVisual } from './core/visuals.js';
```

```js
function spawnProjectile(opts) {
  if (activeProjectiles >= MAX_PROJECTILES) return;
  const { muzzleFlash, ...projectileOpts } = opts;
  if (muzzleFlash && scene.particles.length < MAX_PARTICLES) {
    const distance = muzzleFlash.distance ?? 20;
    const mx = opts.x + Math.cos(opts.angle) * distance;
    const my = opts.y + Math.sin(opts.angle) * distance;
    spawnParticles(particlePool, scene.particles, mx, my,
      muzzleFlash.color, muzzleFlash.count ?? 2, rng);
  }
  // 池化复用对象可能残留旧字段，统一归一。
  const fromPlayer = projectileOpts.fromPlayer;
  const o = {
    aoe: 0, arc: false, chain: 0, pierce: 0, knockback: 0,
    frags: null, chainMult: 0.8, chainDmgMult: 1,
    ...projectileOpts,
  };
  const p = projPool.obtain(o);
  activeProjectiles++;
  projectiles.push(p);
  lastShotAngle = o.angle;
  if (fromPlayer) {
    const sid = scene.weapon.id === 'mg' ? 'shootMG' : 'shoot';
    if (sid !== lastShotSoundId || scene.time - lastShotSound > 0.12) {
      lastShotSound = scene.time;
      lastShotSoundId = sid;
      sound(sid);
    }
  }
}
```

将当前 `src/game.js:617-637` 的内联圆座、线段炮管和橙色耐久弧整段删除，替换为：

```js
// 固定火炮：组合式程序化 visual，炮口闪光由 spawnProjectile 的现有效果管线负责
for (const t of scene.turrets) {
  drawVisual(ctx, TURRET_VISUAL_ID, t.x, t.y, t.r, {
    aimAngle: t.aimAngle,
    hp: t.hp,
    maxHp: t.maxHp,
    phase: scene.time,
  });
}
```

这一步不新增图片贴图、不开新的伤害或冷却分支；`game.js` 只组装实体状态并调用 `drawVisual`。

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/turret.test.js && npm test`

Expected: `test/turret.test.js` 的 10 个用例全部 PASS，随后全量 `npm test` PASS；手动用 webbridge 截取一帧部署火炮战斗画面，确认炮管在 cooldown 期间仍连续转向、底座/铆钉/多边形炮管/制退器可见，受损状态是发光描边而非旧耐久弧，炮口粒子没有被 visual 重复绘制。

- [ ] **Step 5: 提交**

```bash
git add src/entities/turret.js src/game.js test/turret.test.js
git commit -m "UI改造任务11: 固定火炮平滑瞄准与组合视觉"
```

---

### Task 12: 模块化石墙段与三档受损视觉

**Files:**
- Modify: `src/entities/wall.js:1-6`
- Modify: `src/game.js:18-21,602-615`
- Test: `test/wall.test.js`

**Interfaces:**
- Consumes: 任务包 2 的 `registerPart(id, drawFn)` 与 `drawVisual(ctx, id, x, y, size, options?)`；任务包 1 的 `PALETTE.obstacle`、`PALETTE.panel`、`PALETTE.neon`、`PALETTE.neonDim`、`PALETTE.textDim`；现有 `createWallSegment(x, y, wallEnhance)` 的半径和耐久公式。
- Produces: `WALL_VISUAL_ID = 'deployable.wall'`、`wallDamageTier(hp, maxHp)`；`createWallSegment` 仍返回 `{ x, y, r: 22, hp, maxHp, alive: true }`，墙体渲染由 `drawVisual` 读取 `{ hp, maxHp, phase }`，不再存在绿色耐久弧或 `createWallRing`。

- [ ] **Step 1: 写失败测试**

将 `test/wall.test.js` 改为以下完整内容。旧的半径、基准耐久、强化公式、坐标和无 ring 导出断言全部保留；新增断言精确锁定 `>0.66`、`0.33 < ratio <= 0.66`、`<=0.33` 三个边界，并用 mock Canvas 验证注册表 visual 走多边形/裂缝绘制。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawVisual } from '../src/core/visuals.js';
import { createWallSegment, WALL_VISUAL_ID, wallDamageTier } from '../src/entities/wall.js';
import * as wall from '../src/entities/wall.js';

function mockContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of [
    'save', 'restore', 'translate', 'rotate', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'fill', 'stroke', 'fillRect', 'rect',
  ]) {
    ctx[name] = (...args) => calls.push({ name, args });
  }
  return ctx;
}

test('createWallSegment 生成单段 {x,y,r:22,hp:150,maxHp:150,alive:true}', () => {
  const seg = createWallSegment(0, 0, { hp: 0 });
  assert.equal(seg.x, 0);
  assert.equal(seg.y, 0);
  assert.equal(seg.r, 22);
  assert.equal(seg.hp, 150);
  assert.equal(seg.maxHp, 150);
  assert.equal(seg.alive, true);
});

test('以 (x,y) 为段心', () => {
  const seg = createWallSegment(100, 50, { hp: 0 });
  assert.equal(seg.x, 100);
  assert.equal(seg.y, 50);
});

test('耐久 = 150×1.5^wallEnhance.hp', () => {
  assert.equal(createWallSegment(0, 0, { hp: 1 }).hp, 225);
  assert.equal(createWallSegment(0, 0, { hp: 2 }).hp, 337.5);
  assert.equal(createWallSegment(0, 0, { hp: 3 }).hp, 506.25);
  assert.equal(createWallSegment(0, 0, { hp: 8 }).hp, 150 * 1.5 ** 8);
  assert.equal(createWallSegment(0, 0).hp, 150);
  const seg = createWallSegment(0, 0, { hp: 3 });
  assert.equal(seg.maxHp, seg.hp);
});

test('无 createWallRing 残留（导出不再包含 ring）', () => {
  assert.equal(wall.createWallRing, undefined);
  assert.equal(typeof wall.createWallSegment, 'function');
});

test('墙体耐久三档阈值：>0.66 完好，>0.33 且≤0.66 破损，≤0.33 濒危', () => {
  assert.equal(wallDamageTier(67, 100), 'intact');
  assert.equal(wallDamageTier(66, 100), 'damaged');
  assert.equal(wallDamageTier(34, 100), 'damaged');
  assert.equal(wallDamageTier(33, 100), 'critical');
  assert.equal(wallDamageTier(0, 100), 'critical');
});

test('围墙 visual 已注册为不规则多边形、垛口和裂缝组合', () => {
  const ctx = mockContext();
  assert.equal(WALL_VISUAL_ID, 'deployable.wall');
  assert.doesNotThrow(() => drawVisual(ctx, WALL_VISUAL_ID, 0, 0, 22, {
    hp: 33, maxHp: 150, phase: 0,
  }));
  assert.ok(ctx.calls.some(call => call.name === 'lineTo'));
  assert.ok(ctx.calls.some(call => call.name === 'stroke'));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/wall.test.js`

Expected: FAIL，现有 `src/entities/wall.js` 没有导出 `WALL_VISUAL_ID`，Node 报 `SyntaxError: The requested module '../src/entities/wall.js' does not provide an export named 'WALL_VISUAL_ID'`。

- [ ] **Step 3: 最小实现**

将 `src/entities/wall.js` 替换为以下完整实现。`WALL_BODY`、`WALL_CRACKS` 和档位样式是模块级冻结数据，不在每帧创建随机变体；墙顶描边单独走霓虹发光路径，替代旧绿色耐久弧。

```js
// 部署物：围墙（单段放置）。逻辑与程序化视觉均无 DOM/图片依赖。
import { registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';

const WALL_BODY = Object.freeze([
  [-0.98, 0.28], [-0.86, -0.46], [-0.62, -0.72], [-0.35, -0.59],
  [-0.10, -0.80], [0.20, -0.61], [0.53, -0.74], [0.91, -0.38],
  [0.98, 0.30], [0.66, 0.70], [0.30, 0.60], [-0.12, 0.78],
  [-0.54, 0.64],
]);
const WALL_CRACKS = Object.freeze([
  Object.freeze([[-0.62, -0.18], [-0.43, 0.02], [-0.50, 0.25]]),
  Object.freeze([[-0.18, -0.47], [-0.04, -0.22], [-0.12, 0.08]]),
  Object.freeze([[0.22, -0.30], [0.08, -0.02], [0.20, 0.22]]),
  Object.freeze([[0.58, -0.10], [0.42, 0.12], [0.50, 0.36]]),
  Object.freeze([[-0.36, 0.24], [-0.20, 0.40], [-0.27, 0.60]]),
  Object.freeze([[0.00, 0.34], [0.15, 0.48], [0.10, 0.68]]),
]);
const WALL_STYLES = Object.freeze({
  intact: Object.freeze({ fillAlpha: 1, crackCount: 0, glowAlpha: 0.55 }),
  damaged: Object.freeze({ fillAlpha: 0.78, crackCount: 3, glowAlpha: 0.75 }),
  critical: Object.freeze({ fillAlpha: 0.55, crackCount: 6, glowAlpha: 1 }),
});

export const WALL_VISUAL_ID = 'deployable.wall';

export function wallDamageTier(hp, maxHp) {
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  if (ratio > 0.66) return 'intact';
  if (ratio > 0.33) return 'damaged';
  return 'critical';
}

function traceBody(ctx, size) {
  ctx.beginPath();
  for (let i = 0; i < WALL_BODY.length; i++) {
    const [x, y] = WALL_BODY[i];
    if (i === 0) ctx.moveTo(x * size, y * size);
    else ctx.lineTo(x * size, y * size);
  }
  ctx.closePath();
}

function traceCrenellations(ctx, size) {
  const base = -size * 0.40;
  const top = -size * 0.76;
  const left = -size * 0.86;
  const step = size * 0.28;
  const merlon = size * 0.15;
  ctx.beginPath();
  ctx.moveTo(left, base);
  for (let i = 0; i < 6; i++) {
    const x = left + i * step;
    ctx.lineTo(x, base);
    ctx.lineTo(x, top);
    ctx.lineTo(x + merlon, top);
    ctx.lineTo(x + merlon, base);
  }
  ctx.lineTo(size * 0.86, base);
  ctx.closePath();
}

function drawWallVisual(ctx, size, params = {}, phase = 0) {
  void phase;
  const tier = wallDamageTier(params.hp ?? 0, params.maxHp ?? 0);
  const style = WALL_STYLES[tier];

  ctx.save();
  ctx.globalAlpha = style.fillAlpha;
  ctx.shadowColor = PALETTE.neonDim;
  ctx.shadowBlur = Math.max(2, size * 0.25);
  ctx.fillStyle = PALETTE.obstacle;
  traceBody(ctx, size);
  ctx.fill();
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.stroke();

  ctx.fillStyle = PALETTE.panel;
  traceCrenellations(ctx, size);
  ctx.fill();
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = Math.max(1, size * 0.045);
  for (let i = 0; i < style.crackCount; i++) {
    const crack = WALL_CRACKS[i % WALL_CRACKS.length];
    ctx.beginPath();
    for (let j = 0; j < crack.length; j++) {
      const [x, y] = crack[j];
      if (j === 0) ctx.moveTo(x * size, y * size);
      else ctx.lineTo(x * size, y * size);
    }
    ctx.stroke();
  }

  ctx.save();
  ctx.globalAlpha = style.glowAlpha;
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 6 + size * 0.16;
  ctx.strokeStyle = PALETTE.neon;
  ctx.lineWidth = tier === 'critical' ? Math.max(2, size * 0.10) : Math.max(1, size * 0.07);
  traceCrenellations(ctx, size);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

registerPart(WALL_VISUAL_ID, drawWallVisual);

// 单段独立圆碰撞 r=22；基值耐久 150，每级 wallEnhance.hp 强化 +50%。
export function createWallSegment(x, y, wallEnhance) {
  const hp = 150 * Math.pow(1.5, (wallEnhance && wallEnhance.hp) || 0);
  return { x, y, r: 22, hp, maxHp: hp, alive: true };
}
```

在 `src/game.js` 中把导入和当前 `src/game.js:602-615` 的墙体内联渲染改为：

```js
import { createWallSegment, WALL_VISUAL_ID } from './entities/wall.js';
```

```js
// 围墙：模块化石墙段，耐久档位由 visual 根据 hp/maxHp 决定
for (const seg of scene.walls) {
  drawVisual(ctx, WALL_VISUAL_ID, seg.x, seg.y, seg.r, {
    hp: seg.hp,
    maxHp: seg.maxHp,
    phase: scene.time,
  });
}
```

不得改动 `createWallSegment` 的碰撞半径、放置位置、耐久成长、`alive` 清理或围墙无上限规则；本任务只移除 `ctx.arc` 耐久弧并替换为注册表视觉。

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/wall.test.js && npm test`

Expected: `test/wall.test.js` 的 6 个用例全部 PASS，随后全量 `npm test` PASS；手动用 webbridge 截取完好、`hp/maxHp=0.66`、`hp/maxHp=0.33` 三种墙体画面，确认垛口、裂缝密度、填充亮度和墙顶霓虹描边按三档变化，且不再出现绿色圆弧。

- [ ] **Step 5: 提交**

```bash
git add src/entities/wall.js src/game.js test/wall.test.js
git commit -m "UI改造任务12: 模块化石墙段与三档受损视觉"
```

---

### Task 13: 三类辅助武器组合模型与平滑指向

**Files:**
- Modify: `src/entities/companions.js:1-94`
- Modify: `src/game.js:18-21,642-661`
- Test: `test/companions.test.js`

**Interfaces:**
- Consumes: 任务包 2 的 `registerPart(id, drawFn)` 与 `drawVisual(ctx, id, x, y, size, options?)`；任务包 4 的 `TURN_RATE` 与 `turnToward`；任务包 3 已写入 `AUX_CONFIG[kind].icon` 的三个稳定图标 ID；现有 `AUX_CONFIG` 的 orbit/数值和 `ORBIT_SPEED`。
- Produces: `AUX_VISUAL_IDS = { drone: 'aux.drone', gunner: 'aux.gunner', sniper: 'aux.sniper' }`；每条 `AUX_CONFIG` 保持 `icon` 并新增 `visual`；每个载体有 `aimAngle`，gunner/sniper 在 cooldown 期间持续平滑指向；`updateAuxBodies` 保持 orbit 半径、角速、索敌范围、伤害、射速、弹道参数不变，并为 gunner/sniper 提供 `muzzleFlash` 元数据。

- [ ] **Step 1: 写失败测试**

将 `test/companions.test.js` 改为以下完整内容。现有 orbit、角速、载体顺序、数值强化和开火断言全部保留；配置断言增加 `icon`/`visual`，新增 gunner/sniper cooldown 期间的 `aimAngle` 插值、炮口闪光以及三类 visual 注册断言。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawVisual } from '../src/core/visuals.js';
import { PALETTE } from '../src/config/palette.js';
import { TURN_RATE } from '../src/core/angles.js';
import {
  createAux, spawnAuxBodies, updateAuxBodies, auxStats,
  AUX_CONFIG, AUX_VISUAL_IDS, ORBIT_SPEED,
} from '../src/entities/companions.js';

const rng = () => 0.5;
const EPSILON = 1e-9;

function mockContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of [
    'save', 'restore', 'translate', 'rotate', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'fill', 'stroke', 'fillRect', 'rect',
  ]) {
    ctx[name] = (...args) => calls.push({ name, args });
  }
  return ctx;
}

test('createAux 结构：counts/增强四维/bodies/t', () => {
  const aux = createAux();
  assert.deepEqual(aux.counts, { drone: 0, gunner: 0, sniper: 0 });
  for (const kind of ['drone', 'gunner', 'sniper'])
    assert.deepEqual(aux.enhance[kind], { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  assert.deepEqual(aux.bodies, []);
  assert.equal(aux.t, 0);
});

test('AUX_CONFIG 基值、icon 和 visual per 契约：三种均 orbit（无 follow）', () => {
  assert.deepEqual(AUX_CONFIG.drone, {
    name: '随行无人机', icon: 'icon.aux.drone', visual: 'aux.drone',
    orbit: 90, damage: 6, fireRate: 2, projectileSpeed: 500, range: 250, aoe: 0,
  });
  assert.deepEqual(AUX_CONFIG.gunner, {
    name: '随行移动火炮', icon: 'icon.aux.gunner', visual: 'aux.gunner',
    orbit: 60, damage: 15, fireRate: 1, projectileSpeed: 400, range: 320, aoe: 60,
  });
  assert.deepEqual(AUX_CONFIG.sniper, {
    name: '随行远程火炮', icon: 'icon.aux.sniper', visual: 'aux.sniper',
    orbit: 100, damage: 30, fireRate: 0.4, projectileSpeed: 700, range: 500, aoe: 0,
  });
  assert.equal('follow' in AUX_CONFIG.gunner, false);
  assert.equal('follow' in AUX_CONFIG.sniper, false);
});

test('ORBIT_SPEED 角速 per 契约：drone 2.2 / gunner 1.4 / sniper 1.0', () => {
  assert.deepEqual(ORBIT_SPEED, { drone: 2.2, gunner: 1.4, sniper: 1.0 });
});

test('spawnAuxBodies 按 counts 重建：数量/顺序/weapon 结构/共享增强/aimAngle', () => {
  const aux = createAux();
  aux.counts.drone = 2;
  aux.counts.gunner = 1;
  aux.counts.sniper = 2;
  spawnAuxBodies(aux);
  assert.equal(aux.bodies.length, 5);
  assert.deepEqual(aux.bodies.map(b => b.kind), ['drone', 'drone', 'gunner', 'sniper', 'sniper']);
  assert.deepEqual(aux.bodies.map(b => b.idx), [0, 1, 0, 0, 1]);
  for (const b of aux.bodies) {
    assert.equal(b.weapon.id, 'aux');
    assert.equal(b.weapon.base, AUX_CONFIG[b.kind]);
    assert.equal(b.weapon.enhance, aux.enhance[b.kind]);
    assert.equal(b.weapon.cooldown, 0);
    assert.equal(b.aimAngle, 0);
  }
  aux.counts.drone = 0;
  aux.counts.gunner = 0;
  aux.counts.sniper = 0;
  spawnAuxBodies(aux);
  assert.deepEqual(aux.bodies, []);
});

test('drone 环绕：angle = idx 均分 + t·2.2，位置 = player + orbit·dir', () => {
  const aux = createAux();
  aux.counts.drone = 2;
  spawnAuxBodies(aux);
  const player = { x: 10, y: 20, facing: 0 };
  updateAuxBodies(aux, player, [], () => {}, rng, 0.25);
  assert.ok(Math.abs(aux.bodies[0].x - (10 + 90 * Math.cos(0.55))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[0].y - (20 + 90 * Math.sin(0.55))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[1].x - (10 + 90 * Math.cos(Math.PI + 0.55))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[1].y - (20 + 90 * Math.sin(Math.PI + 0.55))) < 1e-6);
  updateAuxBodies(aux, player, [], () => {}, rng, 0.25);
  assert.ok(Math.abs(aux.bodies[0].x - (10 + 90 * Math.cos(1.1))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[0].y - (20 + 90 * Math.sin(1.1))) < 1e-6);
});

test('gunner/sniper 环绕：orbit 半径、角度按各自角速随时间变化', () => {
  const aux = createAux();
  aux.counts.gunner = 1;
  aux.counts.sniper = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  updateAuxBodies(aux, player, [], () => {}, rng, 0.25);
  const g = aux.bodies[0];
  const s = aux.bodies[1];
  assert.ok(Math.abs(g.x - 60 * Math.cos(0.35)) < 1e-6);
  assert.ok(Math.abs(g.y - 60 * Math.sin(0.35)) < 1e-6);
  assert.ok(Math.abs(s.x - 100 * Math.cos(0.25)) < 1e-6);
  assert.ok(Math.abs(s.y - 100 * Math.sin(0.25)) < 1e-6);
  for (const [b, orbit] of [[g, 60], [s, 100]]) {
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    assert.ok(Math.abs(d - orbit) <= 5, `距玩家 ${d} 应在 orbit(${orbit})±5 内`);
  }
  const gx0 = g.x, gy0 = g.y;
  updateAuxBodies(aux, player, [], () => {}, rng, 0.5);
  assert.ok(Math.hypot(g.x - gx0, g.y - gy0) > 1);
  assert.ok(Math.abs(g.x - 60 * Math.cos(1.05)) < 1e-6);
  assert.ok(Math.abs(g.y - 60 * Math.sin(1.05)) < 1e-6);
  assert.ok(Math.abs(s.x - 100 * Math.cos(0.75)) < 1e-6);
  assert.ok(Math.abs(s.y - 100 * Math.sin(0.75)) < 1e-6);
});

test('同类型多体：起始角按 idx 均分（dt=0 即起始角）', () => {
  const aux = createAux();
  aux.counts.gunner = 2;
  spawnAuxBodies(aux);
  const player = { x: 10, y: 20, facing: 0 };
  updateAuxBodies(aux, player, [], () => {}, rng, 0);
  assert.ok(Math.abs(aux.bodies[0].x - (10 + 60)) < 1e-6);
  assert.ok(Math.abs(aux.bodies[0].y - 20) < 1e-6);
  assert.ok(Math.abs(aux.bodies[1].x - (10 - 60)) < 1e-6);
  assert.ok(Math.abs(aux.bodies[1].y - 20) < 1e-6);
});

test('drone 开火：cooldown 制、基础数值、死尸不触发', () => {
  const aux = createAux();
  aux.counts.drone = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  const shots = [];
  const z = { x: 100, y: 0, alive: true };
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  const s = shots[0];
  assert.equal(s.damage, 6);
  assert.equal(s.speed, 500);
  assert.equal(s.range, 250);
  assert.equal(s.pierce, 0);
  assert.equal(s.knockback, 60);
  assert.equal(s.aoe, 0);
  assert.equal(s.arc, false);
  assert.equal(s.chain, 0);
  assert.equal(s.muzzleFlash, undefined);
  assert.ok(Math.abs(aux.bodies[0].weapon.cooldown - 0.5) < EPSILON);
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.5);
  assert.equal(shots.length, 2);
  z.alive = false;
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 2);
  assert.equal(shots.length, 2);
});

test('gunner/sniper 开火：aoe 60 / 长射程 500，炮口闪光颜色来自 palette', () => {
  const aux = createAux();
  aux.counts.gunner = 1;
  aux.counts.sniper = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  const shots = [];
  const z = { x: 450, y: 0, alive: true };
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].damage, 30);
  assert.equal(shots[0].speed, 700);
  assert.equal(shots[0].range, 500);
  assert.equal(shots[0].aoe, 0);
  assert.deepEqual(shots[0].muzzleFlash, {
    color: PALETTE.auxSniper ?? PALETTE.neon, count: 2, distance: 22,
  });
  assert.equal(aux.bodies[0].weapon.cooldown, 0);
  const shots2 = [];
  const z2 = { x: 50, y: 0, alive: true };
  updateAuxBodies(aux, player, [z2], s => shots2.push(s), rng, 0.016);
  assert.equal(shots2.length, 1);
  assert.equal(shots2[0].aoe, 60);
  assert.equal(shots2[0].damage, 15);
  assert.equal(shots2[0].range, 320);
  assert.equal(shots2[0].speed, 400);
  assert.equal(shots2[0].knockback, 60);
  assert.deepEqual(shots2[0].muzzleFlash, {
    color: PALETTE.auxGunner ?? PALETTE.gold, count: 2, distance: 14,
  });
  assert.ok(Math.abs(aux.bodies[0].weapon.cooldown - 1) < EPSILON);
});

test('aux 强化：per-type 乘区/加法公式，已部署载体吃后续强化', () => {
  const aux = createAux();
  aux.counts.drone = 1;
  aux.enhance.drone.damage = 2;
  aux.enhance.drone.fireRate = 1;
  aux.enhance.drone.projectiles = 1;
  aux.enhance.drone.range = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  const shots = [];
  const z = { x: 100, y: 0, alive: true };
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 2);
  for (const s of shots) {
    assert.equal(s.damage, 6 * 1.25 ** 2);
    assert.equal(s.range, 250 * 1.2);
    assert.equal(s.aoe, 0);
  }
  assert.ok(Math.abs(aux.bodies[0].weapon.cooldown - 1 / (2 * 1.2)) < 1e-9);
  aux.enhance.drone.damage = 3;
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 1);
  assert.equal(shots[2].damage, 6 * 1.25 ** 3);
});

test('auxStats 公式独立可用', () => {
  const aux = createAux();
  aux.counts.sniper = 1;
  spawnAuxBodies(aux);
  const b = aux.bodies[0];
  const s = auxStats(b);
  assert.equal(s.damage, 30);
  assert.equal(s.fireRate, 0.4);
  assert.equal(s.projectiles, 1);
  assert.equal(s.range, 500);
  assert.equal(s.projectileSpeed, 700);
  assert.equal(s.aoe, 0);
  aux.enhance.sniper.projectiles = 2;
  assert.equal(auxStats(b).projectiles, 3);
});

test('gunner/sniper aimAngle 在 cooldown 期间按 240°/s 平滑追踪', () => {
  const aux = createAux();
  aux.counts.gunner = 1;
  aux.counts.sniper = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  const z = { x: -100, y: 0, alive: true };
  const shots = [];
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0);
  assert.equal(shots.length, 2);
  assert.equal(aux.bodies[0].aimAngle, 0);
  assert.equal(aux.bodies[1].aimAngle, 0);
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.1);
  assert.equal(shots.length, 2);
  assert.ok(Math.abs(aux.bodies[0].aimAngle + TURN_RATE * 0.1) < EPSILON);
  assert.ok(Math.abs(aux.bodies[1].aimAngle + TURN_RATE * 0.1) < EPSILON);
});

test('三类辅助 visual 均已注册，场内绘制只走程序化 drawVisual', () => {
  for (const kind of ['drone', 'gunner', 'sniper']) {
    const ctx = mockContext();
    assert.equal(AUX_VISUAL_IDS[kind], `aux.${kind}`);
    assert.equal(AUX_CONFIG[kind].visual, AUX_VISUAL_IDS[kind]);
    assert.doesNotThrow(() => drawVisual(ctx, AUX_CONFIG[kind].visual, 0, 0, 14, {
      aimAngle: Math.PI / 4, phase: 0.5,
    }));
    assert.ok(ctx.calls.some(call => call.name === 'stroke'), `${kind} 应有发光描边`);
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/companions.test.js`

Expected: FAIL，现有 `src/entities/companions.js` 没有导出 `AUX_VISUAL_IDS`，Node 报 `SyntaxError: The requested module '../src/entities/companions.js' does not provide an export named 'AUX_VISUAL_IDS'`；补齐 visual 注册和 icon/visual 配置后再验证数值回归。

- [ ] **Step 3: 最小实现**

将 `src/entities/companions.js` 替换为以下完整实现。`icon` 保留任务包 3 的 manifest ID，`visual` 是场内程序化 ID；颜色只从 `PALETTE` 读取，允许主题提供可选 `auxDrone`/`auxGunner`/`auxSniper` token，Node 安全默认分别回退到 `neon`、`gold`、`neon`。旋翼相位只传给 `drawVisual`，不参与 orbit 角度；gunner/sniper 的弹道角仍保留原索敌目标角，避免改变攻击逻辑。

```js
// 辅助武器：随行无人机 / 随行移动火炮 / 随行远程火炮。
// orbit、索敌、数值和弹道逻辑保持原语义；场内模型登记到统一 visual registry。
import { registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';
import { TURN_RATE, turnToward } from '../core/angles.js';

export const AUX_VISUAL_IDS = Object.freeze({
  drone: 'aux.drone',
  gunner: 'aux.gunner',
  sniper: 'aux.sniper',
});

export const AUX_CONFIG = {
  drone: {
    name: '随行无人机', icon: 'icon.aux.drone', visual: AUX_VISUAL_IDS.drone,
    orbit: 90, damage: 6, fireRate: 2, projectileSpeed: 500, range: 250, aoe: 0,
  },
  gunner: {
    name: '随行移动火炮', icon: 'icon.aux.gunner', visual: AUX_VISUAL_IDS.gunner,
    orbit: 60, damage: 15, fireRate: 1, projectileSpeed: 400, range: 320, aoe: 60,
  },
  sniper: {
    name: '随行远程火炮', icon: 'icon.aux.sniper', visual: AUX_VISUAL_IDS.sniper,
    orbit: 100, damage: 30, fireRate: 0.4, projectileSpeed: 700, range: 500, aoe: 0,
  },
};

export const ORBIT_SPEED = { drone: 2.2, gunner: 1.4, sniper: 1.0 };

function auxAccent(kind) {
  if (kind === 'gunner') return PALETTE.auxGunner ?? PALETTE.gold;
  if (kind === 'sniper') return PALETTE.auxSniper ?? PALETTE.neon;
  return PALETTE.auxDrone ?? PALETTE.neon;
}

function drawDroneVisual(ctx, size, params = {}, phase = 0) {
  void params;
  const r = size;
  const accent = auxAccent('drone');
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = Math.max(3, r * 0.45);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, r * 0.08);
  for (let i = 0; i < 4; i++) {
    const armAngle = Math.PI / 4 + i * Math.PI / 2;
    const ax = Math.cos(armAngle) * r * 0.72;
    const ay = Math.sin(armAngle) * r * 0.72;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(phase * 8 + i * Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, 0);
    ctx.lineTo(r * 0.25, 0);
    ctx.moveTo(0, -r * 0.25);
    ctx.lineTo(0, r * 0.25);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGunnerVisual(ctx, size, params = {}, phase = 0) {
  void phase;
  const r = size;
  const accent = auxAccent('gunner');
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = Math.max(3, r * 0.42);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.25, r * 0.72, r * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();
  ctx.fillStyle = PALETTE.panel;
  for (const x of [-r * 0.48, r * 0.48]) {
    ctx.beginPath();
    ctx.arc(x, r * 0.35, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.stroke();
  }
  ctx.save();
  ctx.rotate(params.aimAngle ?? 0);
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, -r * 0.18);
  ctx.lineTo(r * 0.98, -r * 0.18);
  ctx.lineTo(r * 1.08, -r * 0.10);
  ctx.lineTo(r * 1.08, r * 0.10);
  ctx.lineTo(r * 0.98, r * 0.18);
  ctx.lineTo(-r * 0.12, r * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(r * 0.98, -r * 0.24, r * 0.18, r * 0.48);
  ctx.restore();
  ctx.restore();
}

function drawSniperVisual(ctx, size, params = {}, phase = 0) {
  const r = size;
  const accent = auxAccent('sniper');
  ctx.save();
  ctx.translate(0, Math.sin(phase * 3) * r * 0.08);
  ctx.shadowColor = accent;
  ctx.shadowBlur = Math.max(3, r * 0.50);
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.25, r * 0.76, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();
  ctx.save();
  ctx.rotate(params.aimAngle ?? 0);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.beginPath();
  ctx.moveTo(-r * 0.10, -r * 0.14);
  ctx.lineTo(r * 1.50, -r * 0.10);
  ctx.lineTo(r * 1.58, 0);
  ctx.lineTo(r * 1.50, r * 0.10);
  ctx.lineTo(-r * 0.10, r * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(r * 1.45, -r * 0.15, r * 0.20, r * 0.30);
  ctx.restore();
  ctx.restore();
}

registerPart(AUX_VISUAL_IDS.drone, drawDroneVisual);
registerPart(AUX_VISUAL_IDS.gunner, drawGunnerVisual);
registerPart(AUX_VISUAL_IDS.sniper, drawSniperVisual);

export function createAux() {
  return {
    counts: { drone: 0, gunner: 0, sniper: 0 },
    enhance: {
      drone: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
      gunner: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
      sniper: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
    },
    bodies: [],
    t: 0,
  };
}

export function auxStats(body) {
  const base = AUX_CONFIG[body.kind];
  const e = body.weapon.enhance || {};
  return {
    damage: base.damage * Math.pow(1.25, e.damage || 0),
    fireRate: base.fireRate * Math.pow(1.2, e.fireRate || 0),
    projectiles: (base.projectiles ?? 1) + (e.projectiles || 0),
    range: base.range * Math.pow(1.2, e.range || 0),
    projectileSpeed: base.projectileSpeed,
    aoe: base.aoe,
  };
}

export function spawnAuxBodies(aux) {
  aux.bodies = [];
  for (const kind of Object.keys(AUX_CONFIG)) {
    for (let idx = 0; idx < aux.counts[kind]; idx++) {
      aux.bodies.push({
        kind, idx, aimAngle: 0,
        weapon: { id: 'aux', base: AUX_CONFIG[kind], enhance: aux.enhance[kind], cooldown: 0 },
        x: 0, y: 0,
      });
    }
  }
}

export function updateAuxBodies(aux, player, zombies, spawnProjectile, rng, dt) {
  aux.t += dt;
  for (const body of aux.bodies) {
    const base = AUX_CONFIG[body.kind];
    const a = (body.idx / aux.counts[body.kind]) * 2 * Math.PI + aux.t * ORBIT_SPEED[body.kind];
    body.x = player.x + base.orbit * Math.cos(a);
    body.y = player.y + base.orbit * Math.sin(a);

    const s = auxStats(body);
    let best = null, bestD = s.range;
    for (const z of zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - body.x, z.y - body.y);
      if (d <= s.range && d < bestD) { best = z; bestD = d; }
    }

    let targetAngle = 0;
    if (best) {
      targetAngle = Math.atan2(best.y - body.y, best.x - body.x);
      if (body.kind !== 'drone')
        body.aimAngle = turnToward(body.aimAngle, targetAngle, TURN_RATE * Math.max(0, dt));
    }

    body.weapon.cooldown = Math.max(0, body.weapon.cooldown - dt);
    if (body.weapon.cooldown > 0 || !best) continue;

    const muzzleFlash = body.kind === 'gunner'
      ? { color: auxAccent('gunner'), count: 2, distance: 14 }
      : body.kind === 'sniper'
        ? { color: auxAccent('sniper'), count: 2, distance: 22 }
        : undefined;
    for (let i = 0; i < s.projectiles; i++) {
      spawnProjectile({
        x: body.x, y: body.y,
        angle: targetAngle,
        speed: s.projectileSpeed,
        damage: s.damage,
        range: s.range,
        pierce: 0,
        knockback: 60,
        aoe: s.aoe,
        arc: false,
        chain: 0,
        muzzleFlash,
      });
    }
    body.weapon.cooldown = 1 / s.fireRate;
  }
}
```

在 `src/game.js` 中保留任务包 11 已导入的 `drawVisual`，并把辅助导入及当前 `src/game.js:642-661` 的三分支内联几何替换为：

```js
import {
  createAux, spawnAuxBodies, updateAuxBodies, AUX_CONFIG,
} from './entities/companions.js';
```

```js
// 辅助武器：visual ID 来自 AUX_CONFIG；phase 只驱动旋翼/悬浮动画，不改变 orbit
for (const b of scene.aux.bodies) {
  const size = b.kind === 'sniper' ? 16 : b.kind === 'gunner' ? 14 : 12;
  drawVisual(ctx, AUX_CONFIG[b.kind].visual, b.x, b.y, size, {
    aimAngle: b.aimAngle,
    phase: scene.time,
  });
}
```

不得引入图片贴图或每帧 `drawImage`；不得改动 `aux.t`、`ORBIT_SPEED`、orbit 半径、索敌半径、射击数值、弹道字段、辅助强化购买语义。drone 的旋翼只在 visual 局部 `rotate(phase * 8 + i * π/2)`，gunner/sniper 的平滑角度只更新 `aimAngle`，原目标角仍用于实际弹道。

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/companions.test.js && npm test`

Expected: `test/companions.test.js` 的 13 个用例全部 PASS，随后全量 `npm test` PASS；手动用 webbridge 截取同时拥有三类辅助武器的战斗画面，确认 drone 中央圆舱/四臂/旋翼青霓动画、gunner 轮式底盘/短炮管/橙金闪光、sniper 悬浮平台/长枪管/窄长闪光均可见，炮管在 cooldown 期间连续追踪，orbit 半径和角速未改变。

- [ ] **Step 5: 提交**

```bash
git add src/entities/companions.js src/game.js test/companions.test.js
git commit -m "UI改造任务13: 三类辅助武器组合模型与平滑指向"
```
### Task 14: 障碍物稳定 id 与哈希变体视觉

**Files:**
- Modify: `src/systems/map.js:3-59`
- Modify: `src/game.js:7,524-544`
- Test: `test/map.test.js:1-83`

**Interfaces:**
- Consumes: `PALETTE` from `src/config/palette.js`；`registerPart(id, drawFn(ctx,size,params,phase))`、`drawVisual(ctx, id, x, y, size, options?)` from `src/core/visuals.js`
- Produces: `hashId(id) → number`；`obstacleVariant(id, kind) → number`；`obstacleVisualId(obstacle) → string`；`renderObstacle(ctx, obstacle) → void`；`ROCK_VARIANT_COUNT = 3`、`RECT_VARIANT_COUNT = 2`；`generateMap(rng)` 返回的每个障碍新增稳定 `id` 与 `variant`，并继续保留 `kind/x/y/r` 或 `kind/x/y/w/h`

本任务不生成 PNG。岩石、废弃车辆和混凝土块按 §12 保持 Canvas 程序化几何，所有几何通过视觉注册表的 `registerPart` 登记；`drawVisual` 的 `options` 约定为 `{ params, phase }`，部件在局部原点绘制。不得改动 `createSpatialHash(64)`、`hash.clear()/insert()` 与 `resolveProjectileHits()` 的空间网格流程；障碍生成继续使用 `rng() < 0.5` 的圆/矩形比例。

- [ ] **Step 1: 写失败测试**

将 `test/map.test.js` 顶部的 map import 扩展为：

```js
import {
  generateMap, MAP_SIZE, hashId, obstacleVariant,
  ROCK_VARIANT_COUNT, RECT_VARIANT_COUNT, obstacleVisualId,
} from '../src/systems/map.js';
```

在现有 6 个用例后追加以下完整用例：

```js
test('障碍物有稳定 id，hash(id) 选择固定变体且圆/矩形数量保持 3/2 变体', () => {
  const a = generateMap(mulberry32(7));
  const b = generateMap(mulberry32(7));
  assert.equal(ROCK_VARIANT_COUNT, 3);
  assert.equal(RECT_VARIANT_COUNT, 2);
  assert.deepEqual(
    a.obstacles.map(o => o.id),
    Array.from({ length: 60 }, (_, i) => 'obstacle-' + i),
  );
  assert.deepEqual(
    a.obstacles.map(o => ({ id: o.id, kind: o.kind, variant: o.variant })),
    b.obstacles.map(o => ({ id: o.id, kind: o.kind, variant: o.variant })),
  );
  for (const o of a.obstacles) {
    const count = o.kind === 'circle' ? ROCK_VARIANT_COUNT : RECT_VARIANT_COUNT;
    assert.equal(o.variant, hashId(o.id) % count, `${o.id} 变体不是 hash(id) 结果`);
    assert.ok(o.variant >= 0 && o.variant < count);
    assert.equal(obstacleVariant(o.id, o.kind), o.variant);
  }
});

test('障碍物新增视觉字段但碰撞字段与视觉 id 映射不变', () => {
  const m = generateMap(mulberry32(8));
  for (const o of m.obstacles) {
    assert.equal(typeof o.id, 'string');
    assert.equal(typeof o.variant, 'number');
    if (o.kind === 'circle') {
      assert.equal(typeof o.x, 'number');
      assert.equal(typeof o.y, 'number');
      assert.equal(typeof o.r, 'number');
      assert.equal('w' in o, false);
      assert.equal(obstacleVisualId(o), 'scene.rock');
    } else {
      assert.equal(typeof o.x, 'number');
      assert.equal(typeof o.y, 'number');
      assert.equal(typeof o.w, 'number');
      assert.equal(typeof o.h, 'number');
      assert.equal('r' in o, false);
      assert.equal(obstacleVisualId({ ...o, variant: 0 }), 'scene.vehicle');
      assert.equal(obstacleVisualId({ ...o, variant: 1 }), 'scene.concrete');
    }
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/map.test.js`

Expected: FAIL with `SyntaxError: The requested module '../src/systems/map.js' does not provide an export named 'hashId'`。

- [ ] **Step 3: 最小实现**

将 `src/systems/map.js` 改为以下实现；新增字段只在障碍生成时写入，不改变随机取值顺序、碰撞字段、60 个障碍、圆/矩形 50/50 选择、空间碰撞使用的对象形状或 150px 间距规则：

```js
import { circleHit, circleRectHit } from '../core/physics.js';
import { drawVisual, registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';

export const MAP_SIZE = 3000;
const OBSTACLE_COUNT = 60;
const MIN_GAP = 150;
const SAFE_RADIUS = 200;
const COIN_COUNT = 40;
export const SHOP_R = 46;
export const SHOP_INTERACT_R = 90;
export const SHOP_POSITIONS = [[750, 750], [2250, 750], [750, 2250], [2250, 2250], [1500, 1150]];
export const ROCK_VARIANT_COUNT = 3;
export const RECT_VARIANT_COUNT = 2;
export const ROCK_VISUAL_ID = 'scene.rock';
export const VEHICLE_VISUAL_ID = 'scene.vehicle';
export const CONCRETE_VISUAL_ID = 'scene.concrete';

function boundsOf(o) {
  return o.kind === 'circle' ? { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 } : o;
}

function farEnough(cand, obstacles, reserved) {
  const a = boundsOf(cand);
  const all = reserved ? obstacles.concat(reserved) : obstacles;
  for (const o of all) {
    const b = boundsOf(o);
    if (a.x < b.x + b.w + MIN_GAP && a.x + a.w + MIN_GAP > b.x &&
        a.y < b.y + b.h + MIN_GAP && a.y + a.h + MIN_GAP > b.y) return false;
  }
  return true;
}

function insideObstacle(x, y, r, obstacles) {
  return obstacles.some(o => o.kind === 'circle'
    ? circleHit(x, y, r, o.x, o.y, o.r)
    : circleRectHit(x, y, r, o));
}

export function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function obstacleVariant(id, kind) {
  const count = kind === 'circle' ? ROCK_VARIANT_COUNT : RECT_VARIANT_COUNT;
  return hashId(id) % count;
}

export function obstacleVisualId(obstacle) {
  if (obstacle.kind === 'circle') return ROCK_VISUAL_ID;
  return obstacle.variant % 2 === 0 ? VEHICLE_VISUAL_ID : CONCRETE_VISUAL_ID;
}

const ROCK_POINTS = [
  [[-0.82, -0.10], [-0.55, -0.72], [0.02, -0.84], [0.72, -0.55], [0.86, 0.08], [0.48, 0.74], [-0.22, 0.82], [-0.78, 0.48]],
  [[-0.88, 0.06], [-0.64, -0.63], [-0.12, -0.86], [0.56, -0.72], [0.88, -0.08], [0.65, 0.62], [0.05, 0.86], [-0.68, 0.56]],
  [[-0.78, -0.28], [-0.38, -0.80], [0.28, -0.78], [0.82, -0.30], [0.76, 0.42], [0.20, 0.86], [-0.52, 0.70], [-0.88, 0.20]],
];

function traceRock(ctx, points, r, ox = 0, oy = 0, sx = 1, sy = 1) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const px = ox + points[i][0] * r * sx;
    const py = oy + points[i][1] * r * sy;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

registerPart(ROCK_VISUAL_ID, (ctx, size, params = {}) => {
  const r = size * 0.5;
  const points = ROCK_POINTS[(params.variant ?? 0) % ROCK_VARIANT_COUNT];
  ctx.save();
  traceRock(ctx, points, r);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fill();
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 7;
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = PALETTE.text;
  traceRock(ctx, points, r, 0, -r * 0.18, 0.62, 0.28);
  ctx.fill();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = PALETTE.hudPanel;
  traceRock(ctx, points, r, 0, r * 0.24, 0.74, 0.25);
  ctx.fill();
  ctx.restore();
});

registerPart(VEHICLE_VISUAL_ID, (ctx, size, params = {}) => {
  const w = params.width ?? size;
  const h = params.height ?? size * 0.62;
  ctx.save();
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
  ctx.fillStyle = PALETTE.neonDim;
  ctx.fillRect(-w * 0.30, -h * 0.28, w * 0.60, h * 0.24);
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(-w * 0.24, -h * 0.24, w * 0.20, h * 0.16);
  ctx.fillRect(w * 0.04, -h * 0.24, w * 0.20, h * 0.16);
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.beginPath();
  ctx.arc(-w * 0.30, h * 0.42, Math.max(5, h * 0.13), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.30, h * 0.42, Math.max(5, h * 0.13), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = 2;
  ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
  ctx.restore();
});

registerPart(CONCRETE_VISUAL_ID, (ctx, size, params = {}) => {
  const w = params.width ?? size;
  const h = params.height ?? size * 0.62;
  ctx.save();
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
  ctx.fillStyle = PALETTE.neonDim;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(-w * 0.5, -h * 0.5, w, h * 0.18);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w * 0.34, -h * 0.28);
  ctx.lineTo(-w * 0.08, h * 0.24);
  ctx.lineTo(w * 0.12, -h * 0.06);
  ctx.lineTo(w * 0.34, h * 0.28);
  ctx.moveTo(-w * 0.08, -h * 0.38);
  ctx.lineTo(w * 0.02, -h * 0.08);
  ctx.lineTo(w * 0.28, -h * 0.30);
  ctx.stroke();
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
  ctx.restore();
});

export function renderObstacle(ctx, obstacle) {
  const circle = obstacle.kind === 'circle';
  const x = circle ? obstacle.x : obstacle.x + obstacle.w * 0.5;
  const y = circle ? obstacle.y : obstacle.y + obstacle.h * 0.5;
  const size = circle ? obstacle.r * 2 : Math.max(obstacle.w, obstacle.h);
  const params = circle
    ? { variant: obstacle.variant }
    : { variant: obstacle.variant, width: obstacle.w, height: obstacle.h };
  drawVisual(ctx, obstacleVisualId(obstacle), x, y, size, { params, phase: 0 });
}

export function generateMap(rng) {
  const cx = MAP_SIZE / 2, cy = MAP_SIZE / 2;
  const shops = SHOP_POSITIONS.map(([x, y]) => ({ x, y, r: SHOP_R, interactR: SHOP_INTERACT_R }));
  const obstacles = [];
  let guard = 0;
  while (obstacles.length < OBSTACLE_COUNT && guard++ < 3000) {
    const x = 100 + rng() * (MAP_SIZE - 200);
    const y = 100 + rng() * (MAP_SIZE - 200);
    if (Math.hypot(x - cx, y - cy) < SAFE_RADIUS + 80) continue;
    const cand = rng() < 0.5
      ? { kind: 'circle', x, y, r: 20 + rng() * 40 }
      : { kind: 'rect', x: x - 30 - rng() * 50, y: y - 30 - rng() * 50, w: 60 + rng() * 100, h: 60 + rng() * 100 };
    if (farEnough(cand, obstacles, shops)) {
      const id = 'obstacle-' + obstacles.length;
      obstacles.push({ ...cand, id, variant: obstacleVariant(id, cand.kind) });
    }
  }
  const scatteredCoins = [];
  guard = 0;
  while (scatteredCoins.length < COIN_COUNT && guard++ < 2000) {
    const x = 50 + rng() * (MAP_SIZE - 100);
    const y = 50 + rng() * (MAP_SIZE - 100);
    if (Math.hypot(x - cx, y - cy) < SAFE_RADIUS) continue;
    if (insideObstacle(x, y, 8, obstacles)) continue;
    if (shops.some(s => circleHit(x, y, 8, s.x, s.y, s.r))) continue;
    scatteredCoins.push({ x, y, value: 1 });
  }
  return { size: MAP_SIZE, spawn: { x: cx, y: cy }, obstacles, shops, scatteredCoins };
}
```

将 `src/game.js:7` 的 import 改为：

```js
import { generateMap, MAP_SIZE, renderObstacle } from './systems/map.js';
```

将 `render(ctx)` 中原 `ctx.fillStyle = '#4a4a52'` 及圆/矩形 `fill` 循环替换为：

```js
for (const o of map.obstacles) renderObstacle(ctx, o);
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/map.test.js`

Expected: PASS（8 个用例）。

Run: `npm test`

Expected: PASS（全量用例通过；地图尺寸、障碍数量、碰撞字段、出生点安全半径、商店和银币断言均保持绿色）。随后用 webbridge 在游戏战斗场景截图，确认同一种子下岩石轮廓/高光/阴影稳定，矩形对象分别呈现车辆或混凝土块，未出现每帧重新随机变体。

- [ ] **Step 5: 提交**

```bash
git add src/systems/map.js src/game.js test/map.test.js
git commit -m "UI改造任务14: 障碍物稳定 id 与哈希变体视觉"
```

### Task 15: 霓虹补给站与交互半径脉动

**Files:**
- Modify: `src/systems/map.js:3-59`
- Modify: `src/game.js:7,546-566`
- Test: `test/map.test.js:1-83`

**Interfaces:**
- Consumes: `SHOP_POSITIONS`、`SHOP_R`、`SHOP_INTERACT_R`、`renderObstacle(ctx, obstacle)` from Task 14；`registerPart(id, drawFn(ctx,size,params,phase))`、`drawVisual(ctx, id, x, y, size, options?)` from `src/core/visuals.js`；`PALETTE.neon`、`PALETTE.neonDim`、`PALETTE.gold`、`PALETTE.panel`、`PALETTE.text`
- Produces: `shopPulseState(timeSec, distance, interactR) → { active, alpha, scale }`；`renderShop(ctx, shop, player, timeSec) → void`；`SUPPLY_STATION_VISUAL_ID = 'scene.supplyStation'`；`SHOP_LABEL = 'SUPPLY'`

本任务不生成 PNG。补给站棚屋、招牌和范围光环是程序化 Canvas 部件；“店”字不再绘制，改为 `SUPPLY` 短标签与招牌内的箱体图标组合。位置仍来自 5 座 `SHOP_POSITIONS`，交互判定仍使用 `interactR = 90`。

- [ ] **Step 1: 写失败测试**

将 `test/map.test.js` 的 map import 扩展为：

```js
import {
  generateMap, MAP_SIZE, hashId, obstacleVariant,
  ROCK_VARIANT_COUNT, RECT_VARIANT_COUNT, obstacleVisualId,
  SHOP_INTERACT_R, shopPulseState, SUPPLY_STATION_VISUAL_ID, SHOP_LABEL,
} from '../src/systems/map.js';
```

在 Task 14 的用例后追加：

```js
test('霓虹补给站保持 5 座与 90px 交互半径，提示使用图标短标签', () => {
  const m = generateMap(mulberry32(9));
  assert.equal(m.shops.length, 5);
  for (const s of m.shops) assert.equal(s.interactR, SHOP_INTERACT_R);
  assert.equal(SHOP_INTERACT_R, 90);
  assert.equal(SUPPLY_STATION_VISUAL_ID, 'scene.supplyStation');
  assert.equal(SHOP_LABEL, 'SUPPLY');
});

test('补给站交互光环只改变 alpha/scale，90px 边界仍为严格小于', () => {
  const idle = shopPulseState(0, 90, SHOP_INTERACT_R);
  const active = shopPulseState(0, 89, SHOP_INTERACT_R);
  const peak = shopPulseState(Math.PI / 8, 0, SHOP_INTERACT_R);
  assert.equal(idle.active, false);
  assert.equal(active.active, true);
  assert.ok(Math.abs(active.alpha - 0.25) < 1e-12);
  assert.ok(Math.abs(active.scale - 1.025) < 1e-12);
  assert.ok(Math.abs(peak.alpha - 0.34) < 1e-12);
  assert.ok(Math.abs(peak.scale - 1.05) < 1e-12);
  assert.notEqual(active.scale, peak.scale);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/map.test.js`

Expected: FAIL with `SyntaxError: The requested module '../src/systems/map.js' does not provide an export named 'shopPulseState'`。

- [ ] **Step 3: 最小实现**

在 Task 14 的 `src/systems/map.js` 末尾追加以下完整补给站视觉实现。`shopPulseState` 不修改商店逻辑，只计算渲染参数；`renderShop` 仍只把 `shop.interactR` 作为交互半径来源：

```js
export const SUPPLY_STATION_VISUAL_ID = 'scene.supplyStation';
export const SHOP_LABEL = 'SUPPLY';

export function shopPulseState(timeSec, distance, interactR = SHOP_INTERACT_R) {
  const wave = (Math.sin(timeSec * 4) + 1) * 0.5;
  return {
    active: distance < interactR,
    alpha: 0.16 + 0.18 * wave,
    scale: 1 + 0.05 * wave,
  };
}

registerPart(SUPPLY_STATION_VISUAL_ID, (ctx, size, params = {}) => {
  const r = size * 0.5;
  const active = params.active === true;
  const ringAlpha = active ? params.alpha ?? 0.2 : 0.08;
  const ringScale = active ? params.scale ?? 1 : 1;
  const interactR = params.interactR ?? SHOP_INTERACT_R;
  ctx.save();
  ctx.globalAlpha = ringAlpha;
  ctx.strokeStyle = PALETTE.neon;
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = active ? 12 : 5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, interactR * ringScale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(-r * 0.62, -r * 0.12, r * 1.24, r * 0.66);
  ctx.fillStyle = PALETTE.neonDim;
  ctx.beginPath();
  ctx.moveTo(-r * 0.76, -r * 0.12);
  ctx.lineTo(0, -r * 0.66);
  ctx.lineTo(r * 0.76, -r * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 7;
  ctx.strokeStyle = PALETTE.neon;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeRect(-r * 0.62, -r * 0.12, r * 1.24, r * 0.66);
  ctx.shadowBlur = 0;

  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(-r * 0.22, -r * 0.48, r * 0.44, r * 0.24);
  ctx.strokeStyle = PALETTE.panel;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.11, -r * 0.44);
  ctx.lineTo(-r * 0.11, -r * 0.28);
  ctx.moveTo(r * 0.11, -r * 0.44);
  ctx.lineTo(r * 0.11, -r * 0.28);
  ctx.stroke();
  ctx.restore();
});

export function renderShop(ctx, shop, player, timeSec) {
  const distance = Math.hypot(player.x - shop.x, player.y - shop.y);
  const pulse = shopPulseState(timeSec, distance, shop.interactR);
  drawVisual(ctx, SUPPLY_STATION_VISUAL_ID, shop.x, shop.y, shop.r * 2, {
    params: {
      active: pulse.active,
      alpha: pulse.alpha,
      scale: pulse.scale,
      interactR: shop.interactR,
    },
    phase: timeSec,
  });
  ctx.save();
  ctx.fillStyle = PALETTE.text;
  ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(SHOP_LABEL, shop.x, shop.y + shop.r + 18);
  if (distance < shop.interactR + 120) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('AUTO OPEN', shop.x, shop.y - shop.r - 14);
  }
  ctx.restore();
}
```

将 `src/game.js:7` 的 import 改为：

```js
import { generateMap, MAP_SIZE, renderObstacle, renderShop } from './systems/map.js';
```

将 `render(ctx)` 中原 `// 商店建筑` 至该循环结束的 `src/game.js:546-566` 替换为：

```js
for (const s of map.shops) renderShop(ctx, s, player, scene.time);
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/map.test.js`

Expected: PASS（10 个用例；5 座位置、`r=46`、`interactR=90` 和障碍避让用例继续通过）。

Run: `npm test`

Expected: PASS。随后用 webbridge 截图验证每座商店为棚屋、霓绿招牌描边、低成本脉动交互环和 `SUPPLY` 短标签/箱体图标；玩家进入 90px 内才进入 active 光环状态，自动打开商店的现有行为不变。

- [ ] **Step 5: 提交**

```bash
git add src/systems/map.js src/game.js test/map.test.js
git commit -m "UI改造任务15: 霓虹补给站与交互半径脉动"
```

### Task 15A: 场景物件 PNG 资产包（车道 B 出图，非代码任务）

**类型**: 资产生成，走 gpt-image-review 出图管线 + k3-256k 审美迭代（spec 0.2a、§3.3 出图规则、§8 审美流程）。本任务不修改代码。

**交付清单**（透明底 PNG、主体居中、45° 俯视微侧、暗黑霓虹赛璐璐风、与 palette 霓绿/金令牌融合）:

| 资产 id（供 15B 登记） | 文件路径 | 原子尺寸 | 说明 |
|---|---|---|---|
| `scene.obstacle.rock.0/1/2` | `assets/img/scene/obstacles/rock-0.png` 等 3 张 | 256×256 | 岩石 3 变体，不规则 silhouette，场内显示约 60–90px |
| `scene.obstacle.vehicle.0/1` | `assets/img/scene/obstacles/vehicle-0.png` 等 2 张 | 256×256 | 废弃车辆 2 变体，俯视残骸感 |
| `scene.obstacle.concrete.0/1` | `assets/img/scene/obstacles/concrete-0.png` 等 2 张 | 256×256 | 混凝土块 2 变体 |
| `scene.supplyStation` | `assets/img/scene/supply-station.png` | 256×256 | 霓虹补给站棚屋主体，**不含文字**（SUPPLY 标签由代码绘制） |
| `scene.terrain.grass` | `assets/img/scene/terrain/grass-tile.png` | 256×256 | 暗色草地**无缝可平铺**纹理，四边连续无接缝，整体明度低于 PALETTE.bg 一档 |
| `scene.mine` | `assets/img/scene/mine.png` | 128×128 | 地雷主体，不含警示光环（覆盖层程序化） |
| `scene.teslaBall` | `assets/img/scene/tesla-ball.png` | 128×128 | 电磁球主体，青霓色调，不含电弧 |
| `scene.helicopter` | `assets/img/scene/helicopter.png` | 256×256 | 直升机机身主体，旋翼区域留透明（旋翼由程序化层旋转绘制） |

**流程约束**:
- 每资产先生成 1 张样图送 k3-256k 审美（维度：风格一致性、透明底完整性、场内目标尺寸辨识度、令牌融合度；草地另验无缝性），PASS 后定稿，不达标重出。
- prompt 模板以 docs/superpowers/visual-asset-prompt-template.md 为底，promptVersion 记 `neon-cel-scene-v1`。
- prompt、版本与审美结论写入 docs/ 资产记录（沿用既有资产记录文件格式）。
- 本任务只做资产与记录；`src/config/assets.js` 登记与渲染接线属 Task 15B。

**验收**: 12 张资产全部 k3 PASS 并落盘到上表路径；资产记录更新完毕。

### Task 15B: 场景物件图片加载与障碍物/补给站 PNG 渲染（含程序化 fallback）

**Files:**
- Modify: `src/core/visuals.js`（新增导出）
- Modify: `src/config/assets.js`（追加 scene.* 条目）
- Modify: `src/systems/map.js`（障碍物/补给站渲染路径；行号已漂移，按内容定位）
- Test: `test/map.test.js`、visuals 对应测试文件

**Interfaces:**
- Consumes: `registerImage(id, url)`、`drawVisual(ctx, id, x, y, size, options)`、Task 14 的 `ROCK_VISUAL_ID/VEHICLE_VISUAL_ID/CONCRETE_VISUAL_ID/renderObstacle/obstacleVisualId/obstacleVariant`、Task 15 的 `renderShop/shopPulseState/SUPPLY_LABEL 机制`、Task 15A 的 12 张 PNG
- Produces: `getLoadedImage(id) → HTMLImageElement | null`（新增导出，只读 IMAGE_CACHE，不触发加载、不 warn；未注册/未就绪/失败均返回 null）

**背景契约（必须先读码确认）**:
- `src/core/visuals.js` 的 `drawVisual` 查找顺序为 SHAPES → PARTS → IMAGE_URLS；图片未就绪时回退 `paintFallback` 圆形占位。因此本任务**不直接**把障碍物注册为纯图片视觉，而是保留 Task 14/15 的程序化部件注册，在部件回调内部做"有图贴图、无图走原程序化路径"的混合渲染。
- `drawVisual` 的图片分支把图绘在以 (x,y) 为中心、`2*size` 边长的盒内；部件分支由部件自控坐标。部件内贴图请自行用 `ctx.drawImage(img, ...)` 精确控制。
- drawVisual 动态参数必须嵌套在 `{ params: {...}, phase }` 下传递（visuals.js 只透传 settings.params，顶层参数被静默丢弃）。

**实现契约**:
1. `visuals.js` 新增并导出 `getLoadedImage(id)`：IMAGE_CACHE 命中返回 image，否则 null。
2. `assets.js` 追加 12 条 `scene.*` manifest 条目（id/路径/尺寸/promptVersion 与 Task 15A 表一致）；确认启动注册与 `preloadVisuals()` 自动覆盖新 id；若有测试断言 ASSETS 数量或键集合，同步更新为新契约。
3. 障碍物变体扩展：`RECT_VARIANT_COUNT` 由 2 提为 4——variant 0/1 → 废弃车辆（`scene.obstacle.vehicle.0/1`），variant 2/3 → 混凝土块（`scene.obstacle.concrete.${variant-2}`）；圆形岩石 3 变体 → `scene.obstacle.rock.${variant % 3}`。`obstacleVisualId` 与相关映射同步修订，同 id 同精灵的确定性不变（沿用 hashId，不消费 rng）。
4. `renderObstacle` 混合渲染：进入部件/渲染函数后先 `getLoadedImage(spriteId)`，有图则按障碍实际尺寸居中 `ctx.drawImage`（圆形用 `2r×2r`，矩形用 `w×h`）并直接返回；无图走 Task 14 既有程序化路径，一字不改。
5. `renderShop` 混合渲染：主体先查 `getLoadedImage('scene.supplyStation')`，有图则居中贴图（尺寸按 SHOP_R 比例，参考 Task 15 棚屋包围盒）；`SUPPLY` 标签与 `shopPulseState` 交互光环覆盖层维持程序化不变；无图走 Task 15 棚屋组合。
6. 性能：`drawImage` 仅来自缓存；禁止每帧 `new Image`、禁止每帧解码；失败路径不重复 warn（沿用 warnOnce）。

**TDD 步骤**:
1. 先写失败测试：`getLoadedImage` 未注册 id 返回 null；`obstacleVisualId`/映射的四变体新契约；mock ctx 下探针断言——图像就绪时到达 `drawImage` 的实际实参（源图、坐标、宽高），未就绪时程序化路径的 fill/stroke 调用真实发生；assets.js 含 12 条 scene.* 条目。
2. 确认 RED 后实现至 GREEN，再跑全量 `npm test`（当前基线 322，加上新用例须全绿）。
3. webbridge 局内截图对照 `.superpowers/sdd/2026-09-02-ui-visual-overhaul/obstacle-before-ingame.png`，确认障碍物/补给站呈现 PNG 精灵且交互光环/标签仍在。

**Git 纪律（必须逐条遵守）**: 所有 git 命令带 `-c core.protectNTFS=false`；禁止 `git add -A`，只显式 add 本任务文件；提交前 `git status --short` 核对暂存集无意外删除；提交信息 `UI改造任务15B: 场景物件图片加载与障碍物/补给站 PNG 渲染`；提交后 `git show --stat HEAD` 验证只含预期文件；报告写入 `.superpowers/sdd/2026-09-02-ui-visual-overhaul/task-15b-report.md`（该目录被 gitignore，需 `add -f`）并随同一提交。

**Depends on**: Task 15A（资产落盘）。若资产未就绪，本任务可先完成代码与测试（fallback 路径全覆盖），实景截图项待资产到位后补。

### Task 16: 暗色草地 PNG 纹理 tile、霓虹边界与场景 palette 化

> 2026-09-04 修订：地形 tile 由程序化噪点改为 PNG 纹理（spec 0.2a）；边界与 palette 化范围不变。

**Files:**
- Modify: `src/systems/map.js:3-59`
- Modify: `src/game.js:3-35,154-305,524-717`
- Test: `test/map.test.js:1-83`

**Interfaces:**
- Consumes: `PALETTE` 的 `ground`、`obstacle`、`neon`、`neonDim`、`boundary`、`hudPanel`、`gold`、`text`、`textDim` 字段；Task 14 的 `renderObstacle(ctx, obstacle)`；Task 15 的 `renderShop(ctx, shop, player, timeSec)`；Task 15B 的 `getLoadedImage(id)` 与 `scene.terrain.grass` 缓存纹理；Task 1 相机的 `viewW/viewH` CSS 逻辑视口与 HUD 的 `renderHud(ctx, scene, viewport)`
- Produces: `TERRAIN_TILE_SIZE = 128`；`createTerrainTile(palette, canvasFactory, imageLoader) → canvas|null`；`createTerrainRenderer({ palette, canvasFactory, imageLoader }) → { draw(ctx, viewport), getTile(), getBuildCount(), invalidate() }`；`draw(ctx, viewport)` 只按可见世界范围平铺离屏 tile，调色板键变化后只重建一次

本任务不生成 PNG 资产。地形 tile 在地图初始化时通过 Task 15B 的 `getLoadedImage('scene.terrain.grass')` 读取缓存纹理，一次性合成离屏 tile，可按 `PALETTE` 对纹理着色/调暗；图片未就绪时只绘制 `PALETTE.ground` 纯色基底。之后按可见世界范围平铺该合成 tile；palette 键变化时重建一次，resize 只改变可见 viewport，不触发每帧重建。地面、霓虹边界和所有 `game.js` 场景绘制颜色继续使用 `PALETTE` 语义字段。

- [ ] **Step 1: 写失败测试**

将 `test/map.test.js` 的 map import 再扩展为：

```js
import {
  generateMap, MAP_SIZE, hashId, obstacleVariant,
  ROCK_VARIANT_COUNT, RECT_VARIANT_COUNT, obstacleVisualId,
  SHOP_INTERACT_R, shopPulseState, SUPPLY_STATION_VISUAL_ID, SHOP_LABEL,
  TERRAIN_TILE_SIZE, createTerrainRenderer,
} from '../src/systems/map.js';
```

在 Task 15B 的用例后追加以下 Node 安全测试。通过注入 `canvasFactory` 统计离屏 canvas 创建次数，并注入缓存纹理探针确认合成阶段的 `drawImage` 源来自 `scene.terrain.grass` 已缓存图片；不创建真实 DOM 或读取 PNG 文件：

```js
function fakeTileFactory(counter) {
  return size => {
    counter.count++;
    const tileCtx = {
      fillStyle: '',
      globalAlpha: 1,
      fillRect() { counter.fillRectCount++; },
      drawImage(source, ...args) { counter.textureDraws.push({ source, args }); },
    };
    return {
      width: size,
      height: size,
      getContext: () => tileCtx,
    };
  };
}

const TERRAIN_PALETTE = {
  ground: '#101810',
  obstacle: '#303840',
  neon: '#5eff8a',
  neonDim: '#2a4a3a',
};

test('地形 tile 在初始化后只生成一次，draw 按可见范围平铺缓存合成 tile 且不逐帧重建', () => {
  assert.equal(TERRAIN_TILE_SIZE, 128);
  const counter = { count: 0, fillRectCount: 0, textureDraws: [] };
  const cachedTexture = { id: 'scene.terrain.grass' };
  const renderer = createTerrainRenderer({
    palette: TERRAIN_PALETTE,
    canvasFactory: fakeTileFactory(counter),
    imageLoader: id => id === 'scene.terrain.grass' ? cachedTexture : null,
  });
  const target = {
    drawImageSources: [],
    drawImage(source, ...args) { this.drawImageSources.push({ source, args }); },
  };
  const viewport = { x: 0, y: 0, width: 256, height: 128 };
  renderer.draw(target, viewport);
  renderer.draw(target, viewport);
  assert.equal(counter.count, 1);
  assert.equal(renderer.getBuildCount(), 1);
  assert.equal(target.drawImageSources.length, 2);
  assert.equal(counter.textureDraws.length, 1);
  assert.equal(counter.textureDraws[0].source, cachedTexture);
  assert.deepEqual(counter.textureDraws[0].args, [0, 0, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE]);
  assert.ok(target.drawImageSources.every(item => item.source === renderer.getTile()));
  assert.equal(renderer.getTile().width, TERRAIN_TILE_SIZE);
});

test('地形 palette 变化只触发一次重建，连续 draw 不重复生成', () => {
  const counter = { count: 0, fillRectCount: 0, textureDraws: [] };
  const cachedTexture = { id: 'scene.terrain.grass' };
  const palette = { ...TERRAIN_PALETTE };
  const renderer = createTerrainRenderer({
    palette,
    canvasFactory: fakeTileFactory(counter),
    imageLoader: () => cachedTexture,
  });
  const target = { drawImage() {} };
  const viewport = { x: 64, y: 64, width: 64, height: 64 };
  renderer.draw(target, viewport);
  palette.ground = '#182018';
  renderer.draw(target, viewport);
  renderer.draw(target, viewport);
  assert.equal(counter.count, 2);
  assert.equal(counter.textureDraws.length, 2);
  assert.equal(renderer.getBuildCount(), 2);
  renderer.invalidate();
  renderer.draw(target, viewport);
  assert.equal(counter.count, 3);
  assert.equal(counter.textureDraws.length, 3);
});

test('地形图片未就绪时回退到纯色基底，不尝试绘制未缓存纹理', () => {
  const counter = { count: 0, fillRectCount: 0, textureDraws: [] };
  const renderer = createTerrainRenderer({
    palette: TERRAIN_PALETTE,
    canvasFactory: fakeTileFactory(counter),
    imageLoader: () => null,
  });
  renderer.draw({ drawImage() {} }, { x: 0, y: 0, width: 64, height: 64 });
  assert.equal(counter.count, 1);
  assert.equal(counter.textureDraws.length, 0);
  assert.ok(counter.fillRectCount >= 1);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/map.test.js`

Expected: FAIL with `SyntaxError: The requested module '../src/systems/map.js' does not provide an export named 'TERRAIN_TILE_SIZE'`。

- [ ] **Step 3: 最小实现**

在 Task 15B 的 `getLoadedImage` 和 `scene.terrain.grass` manifest 已可用前提下，在 `src/systems/map.js` 末尾追加以下离屏 tile 实现。`defaultCanvasFactory` 在 Node 中返回 `null`，浏览器中才创建 canvas；生产路径的 `imageLoader` 默认读取图片缓存，测试可注入已缓存纹理或 `null`，不得在这里创建 `Image`：

```js
import { getLoadedImage } from '../core/visuals.js';

export const TERRAIN_TILE_SIZE = 128;

function defaultCanvasFactory(size) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function terrainPaletteKey(palette) {
  return String(palette.ground) + '|' + String(palette.obstacle) + '|' +
    String(palette.neon) + '|' + String(palette.neonDim);
}

export function createTerrainTile(
  palette = PALETTE,
  canvasFactory = defaultCanvasFactory,
  imageLoader = getLoadedImage,
) {
  const canvas = canvasFactory(TERRAIN_TILE_SIZE);
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  canvas.width = TERRAIN_TILE_SIZE;
  canvas.height = TERRAIN_TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const source = typeof imageLoader === 'function'
    ? imageLoader('scene.terrain.grass')
    : null;
  if (source && typeof ctx.drawImage === 'function') {
    ctx.drawImage(source, 0, 0, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
  } else {
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export function createTerrainRenderer({
  palette = PALETTE,
  canvasFactory = defaultCanvasFactory,
  imageLoader = getLoadedImage,
} = {}) {
  let tile = null;
  let builtKey = null;
  let buildCount = 0;

  function ensureTile() {
    const key = terrainPaletteKey(palette);
    if (key !== builtKey) {
      tile = createTerrainTile(palette, canvasFactory, imageLoader);
      builtKey = key;
      buildCount++;
    }
    return tile;
  }

  function draw(ctx, viewport) {
    const current = ensureTile();
    if (!current || !ctx || typeof ctx.drawImage !== 'function') return;
    const x0 = Math.floor(viewport.x / TERRAIN_TILE_SIZE) * TERRAIN_TILE_SIZE;
    const y0 = Math.floor(viewport.y / TERRAIN_TILE_SIZE) * TERRAIN_TILE_SIZE;
    const x1 = viewport.x + viewport.width;
    const y1 = viewport.y + viewport.height;
    for (let x = x0; x < x1; x += TERRAIN_TILE_SIZE) {
      for (let y = y0; y < y1; y += TERRAIN_TILE_SIZE)
        ctx.drawImage(current, x, y, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
    }
  }

  function invalidate() {
    tile = null;
    builtKey = null;
  }

  return {
    draw,
    getTile: ensureTile,
    getBuildCount: () => buildCount,
    invalidate,
  };
}
```

在 `src/game.js` import 区加入 palette 与地形渲染器：

```js
import { generateMap, MAP_SIZE, renderObstacle, renderShop, createTerrainRenderer } from './systems/map.js';
import { PALETTE } from './config/palette.js';
```

在 `const map = generateMap(rng);` 后创建一次场景级 renderer，并立即合成一次地形 tile；把 renderer 挂到 scene 以便调试检查缓存次数：

```js
const map = generateMap(rng);
const terrain = createTerrainRenderer({ palette: PALETTE });
terrain.getTile();
const player = createPlayer(map.spawn.x, map.spawn.y);
```

在 scene 对象中加入：

```js
terrain,
```

把 `src/game.js:524-717` 的 `render(ctx)` 替换为以下版本。该版本使用 CSS 逻辑 viewport，不读取物理 `canvas.width/height`；围墙、火炮、范围圈、银币、辅助武器、玩家、特斯拉球和横幅的颜色也全部从 `PALETTE` 取值：

```js
function render(ctx) {
  const viewport = {
    x: camera.x,
    y: camera.y,
    width: camera.viewW,
    height: camera.viewH,
  };
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  ctx.save();
  ctx.translate(-camera.x + camera.offX, -camera.y + camera.offY);
  terrain.draw(ctx, viewport);

  ctx.save();
  ctx.strokeStyle = PALETTE.boundary;
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.restore();

  for (const o of map.obstacles) renderObstacle(ctx, o);
  for (const s of map.shops) renderShop(ctx, s, player, scene.time);

  if (!isAdventure && modeCfg.duration && rescueAlerted && !scene.helicopter) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = PALETTE.neon;
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const range = weaponStats(scene.weapon).range;
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(player.x, player.y, range, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = PALETTE.gold;
  for (const c of scene.coinsOnGround) {
    const s = 3 + Math.min(c.value, 5);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - s);
    ctx.lineTo(c.x + s, c.y);
    ctx.lineTo(c.x, c.y + s);
    ctx.lineTo(c.x - s, c.y);
    ctx.closePath();
    ctx.fill();
  }

  for (const seg of scene.walls) {
    ctx.fillStyle = PALETTE.obstacle;
    ctx.beginPath();
    ctx.arc(seg.x, seg.y, seg.r, 0, Math.PI * 2);
    ctx.fill();
    if (seg.hp < seg.maxHp) {
      ctx.strokeStyle = PALETTE.neon;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(seg.x, seg.y, seg.r + 4, -Math.PI / 2, -Math.PI / 2 + (seg.hp / seg.maxHp) * Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const t of scene.turrets) {
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.textDim;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    const aim = t.weapon.lastAim ?? 0;
    ctx.lineTo(t.x + Math.cos(aim) * t.r * 1.4, t.y + Math.sin(aim) * t.r * 1.4);
    ctx.stroke();
    if (t.hp < t.maxHp) {
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r + 5, -Math.PI / 2, -Math.PI / 2 + (t.hp / t.maxHp) * Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const z of scene.zombies) renderZombie(ctx, z, scene.time);

  for (const b of scene.aux.bodies) {
    ctx.fillStyle = b.kind === 'drone' ? PALETTE.neon : b.kind === 'gunner' ? PALETTE.gold : PALETTE.neonDim;
    ctx.beginPath();
    if (b.kind === 'gunner') {
      ctx.rect(b.x - 6, b.y - 6, 12, 12);
    } else if (b.kind === 'sniper') {
      ctx.moveTo(b.x, b.y - 8);
      ctx.lineTo(b.x + 6, b.y);
      ctx.lineTo(b.x, b.y + 8);
      ctx.lineTo(b.x - 6, b.y);
      ctx.closePath();
    } else {
      ctx.moveTo(b.x, b.y - 7);
      ctx.lineTo(b.x + 6, b.y + 5);
      ctx.lineTo(b.x - 6, b.y + 5);
      ctx.closePath();
    }
    ctx.fill();
  }

  if (scene.helicopter) renderHelicopter(ctx, scene.helicopter, scene.time);

  if (player.invuln > 0) ctx.globalAlpha = 0.45 + 0.35 * Math.sin(scene.time * 24);
  ctx.fillStyle = PALETTE.text;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.text;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + Math.cos(player.facing) * player.r, player.y + Math.sin(player.facing) * player.r);
  ctx.stroke();

  renderProjectiles(ctx, projectiles);

  for (const b of scene.teslaBalls) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = PALETTE.neon;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = PALETTE.neon;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 5 + Math.sin(scene.time * 20) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  renderParticles(ctx, scene.particles);
  renderFloaters(ctx, scene.floaters);
  renderEffects(ctx, scene.effects);

  ctx.restore();
  ctx.textAlign = 'left';

  if (scene.banner && scene.time < scene.banner.until) {
    const alpha = 0.45 + 0.35 * Math.sin(scene.time * 8);
    ctx.globalAlpha = Math.max(0.15, Math.min(1, alpha));
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(viewport.width / 2 - 220, 60, 440, 56);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '34px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(scene.banner.text, viewport.width / 2, 99);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  renderHud(ctx, scene, viewport);
}
```

同时把 `src/game.js:184-305` 中仍由场景事件绘制的颜色字面量替换为以下实际表达式，禁止保留十六进制颜色：

```js
opts.visual?.color ?? PALETTE.gold
PALETTE.neon
visual.color ?? PALETTE.gold
PALETTE.gold
PALETTE.text
PALETTE.gold
PALETTE.textDim
PALETTE.neon
PALETTE.neon
PALETTE.gold
PALETTE.gold
PALETTE.text
PALETTE.text
PALETTE.gold
PALETTE.text
PALETTE.gold
PALETTE.neon
```

这些表达式按现行出现顺序对应 `#ffe066`、`#5eff8a`、`#ffe066`、`#ffd75e`、`#f88`、`#f80`、`#99a`、`#4d4`、`#5ef`、`#f80`、`#ffd75e`、`#f55`、`#f55`、`#ffd75e`、`#f55`、`#ffd75e`、`#5ef`；只替换颜色来源，不改变粒子数量、掉落概率、伤害、计时或购买逻辑。

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/map.test.js`

Expected: PASS（13 个用例；地形 tile 初始化、可见范围平铺、palette 变化重建、缓存纹理来源和未就绪 fallback 断言通过）。

Run: `npm test`

Expected: PASS。随后用 webbridge 在窄视口、宽视口和高 DPR 视口分别截图：地面为暗色 PNG 草地纹理（图片未就绪时为纯色 fallback），tile 只在初始化或 palette 变化时重建、不随每帧重建；边界为霓虹警戒线；地图 3000×3000、相机夹紧和 HUD 逻辑视口不因 DPR 放大；截图核对 `game.js` 场景没有旧的 `#1a2418`、`#4a4a52` 等硬编码颜色。

- [ ] **Step 5: 提交**

```bash
git add src/systems/map.js src/game.js test/map.test.js
git commit -m "UI改造任务16: 暗色 PNG 草地纹理与场景 palette 化"
```

### Task 17: 地雷、特斯拉球与直升机组合视觉

> 2026-09-04 修订：三实体由纯程序化组合改为 PNG 主体 + 程序化动效层（spec 0.2a）；逻辑与数值约束不变。

**Files:**
- Modify: `src/entities/teslaball.js:1-31`
- Modify: `src/entities/helicopter.js:1-73`
- Modify: `src/game.js:15,20,663,682-693`
- Test: `test/teslaball.test.js:1-70`
- Test: `test/helicopter.test.js:1-69`

**Interfaces:**
- Consumes: `getLoadedImage(id)`、`registerPart(id, drawFn(ctx,size,params,phase))`、`drawVisual(ctx, id, x, y, size, options?)` from `src/core/visuals.js`；Task 15A/15B 的 `scene.mine`、`scene.teslaBall`、`scene.helicopter` PNG manifest 与缓存；`PALETTE.neon`、`PALETTE.neonDim`、`PALETTE.gold`、`PALETTE.panel`、`PALETTE.obstacle`；`createTeslaBall/updateTeslaBall` 与 `createHelicopter/updateHelicopter` 的现有逻辑签名；Task 16 的 palette 化场景 render
- Produces: `MINE_VISUAL_ID = 'scene.mine'`；`TESLA_BALL_VISUAL_ID = 'scene.teslaBall'`；`HELICOPTER_VISUAL_ID = 'scene.helicopter'`；`createTeslaBall(...)` 返回新增 `visualId: TESLA_BALL_VISUAL_ID`；`createHelicopter(...)` 返回新增 `visualId: HELICOPTER_VISUAL_ID`；`renderTeslaBall(ctx, ball, phase) → void`；`renderHelicopter(ctx, helicopter, phase = helicopter.t) → void`

本任务不生成 PNG 资产。地雷使用 `scene.mine` PNG 主体 + 程序化中心警示光与范围环覆盖层；特斯拉球使用 `scene.teslaBall` PNG 主体 + 青霓色程序化环绕电弧与周期闪电；直升机使用 `scene.helicopter` PNG 机身主体 + 按动画相位旋转的程序化旋翼与登机进度光环。所有逻辑数值、状态机、生命周期和交互规则保持不变：不新增 mine 伤害逻辑，不改变特斯拉球的 `tickT=0.25`、`life=2.5`、`r=12`、击退或回调，不改变直升机半径 60、降落 3s、登机 3s 和状态机返回值。PNG 未就绪或加载失败时，沿用现有内联几何绘制作为 fallback。`drawVisual` 的 `options` 使用 `{ params, phase }`，注册部件在局部原点绘制。

- [ ] **Step 1: 写失败测试**

将 `test/teslaball.test.js` 的 import 改为：

```js
import {
  createTeslaBall, updateTeslaBall, renderTeslaBall,
  MINE_VISUAL_ID, TESLA_BALL_VISUAL_ID,
} from '../src/entities/teslaball.js';
import { drawVisual } from '../src/core/visuals.js';
```

在现有 `T1` 常量后加入 fake Canvas 2D 上下文，并把第一个字段测试的期望对象增加 `visualId`。Node 测试不预加载真实场景 PNG，专门验证图片未就绪时的 fallback 几何与程序化动效层仍然绘制；浏览器联调再确认 `getLoadedImage` 命中时主体走 `drawImage`：

```js
function fakeCtx() {
  return {
    arcCount: 0,
    strokeCount: 0,
    fillCount: 0,
    fillRectCount: 0,
    drawImageCount: 0,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() { this.arcCount++; },
    fill() { this.fillCount++; },
    stroke() { this.strokeCount++; },
    fillRect() { this.fillRectCount++; },
    strokeRect() { this.strokeCount++; },
    drawImage() { this.drawImageCount++; },
  };
}

test('createTeslaBall 字段齐全：r12 / tick 0.25 / life 2.5 / alive / visualId', () => {
  const b = createTeslaBall(10, 20, 30, 40, 50);
  assert.deepEqual(b, {
    x: 10, y: 20, vx: 30, vy: 40, r: 12, damage: 50,
    tickT: 0.25, life: 2.5, alive: true, visualId: 'scene.teslaBall',
  });
});

test('mine 与 teslaBall PNG visual id 已注册，图片未就绪时保留 fallback 与动效层', () => {
  assert.equal(MINE_VISUAL_ID, 'scene.mine');
  assert.equal(TESLA_BALL_VISUAL_ID, 'scene.teslaBall');
  const ctx = fakeCtx();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    renderTeslaBall(ctx, createTeslaBall(0, 0, 0, 0, 10), 0);
    drawVisual(ctx, MINE_VISUAL_ID, 0, 0, 48, {
      params: { range: 80 },
      phase: 0,
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 0);
  assert.equal(ctx.drawImageCount, 0);
  assert.ok(ctx.arcCount >= 3);
  assert.ok(ctx.strokeCount >= 2);
});
```

将 `test/helicopter.test.js` 的 import 改为：

```js
import {
  createHelicopter, updateHelicopter, renderHelicopter,
  HELICOPTER_VISUAL_ID,
} from '../src/entities/helicopter.js';
```

在 import 后加入同样的 fake context（使用以下完整代码，避免任何 DOM 或真实图片依赖；Node 路径验证 PNG 未就绪时的 fallback）:

```js
function fakeCtx() {
  return {
    arcCount: 0,
    strokeCount: 0,
    fillCount: 0,
    fillRectCount: 0,
    drawImageCount: 0,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() { this.arcCount++; },
    fill() { this.fillCount++; },
    stroke() { this.strokeCount++; },
    fillRect() { this.fillRectCount++; },
    strokeRect() { this.strokeCount++; },
    drawImage() { this.drawImageCount++; },
  };
}

test('直升机 PNG visual id 已注册且图片未就绪时保留旋翼、fallback 机身和登机光环', () => {
  const h = createHelicopter(0, 0);
  h.state = 'boarding';
  h.t = 1.5;
  const ctx = fakeCtx();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    renderHelicopter(ctx, h);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(HELICOPTER_VISUAL_ID, 'scene.helicopter');
  assert.equal(h.visualId, HELICOPTER_VISUAL_ID);
  assert.equal(warnings.length, 0);
  assert.equal(ctx.drawImageCount, 0);
  assert.ok(ctx.arcCount >= 3);
  assert.ok(ctx.strokeCount >= 3);
  assert.ok(ctx.fillRectCount >= 2);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/teslaball.test.js test/helicopter.test.js`

Expected: FAIL with `SyntaxError: The requested module '../src/entities/teslaball.js' does not provide an export named 'MINE_VISUAL_ID'`。

- [ ] **Step 3: 最小实现**

将 `src/entities/teslaball.js` 改为以下实现。`scene.mine` 与 `scene.teslaBall` 仍通过 `registerPart` 进入统一视觉注册表；部件先查 `getLoadedImage`，命中时绘制 PNG 主体，再叠加程序化动效，未命中时只用现有内联几何作为 fallback。地雷只提供视觉，不创建或修改炸弹实体；特斯拉球的逻辑函数保持原样：

```js
import { damageZombie } from './zombie.js';
import { drawVisual, getLoadedImage, registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';

const TICK_INTERVAL = 0.25;
const TICK_RADIUS = 30;
const KNOCKBACK = 60;
export const MINE_VISUAL_ID = 'scene.mine';
export const TESLA_BALL_VISUAL_ID = 'scene.teslaBall';

registerPart(MINE_VISUAL_ID, (ctx, size, params = {}, phase = 0) => {
  const r = size * 0.5;
  const range = params.range ?? r * 3;
  const image = getLoadedImage(MINE_VISUAL_ID);
  ctx.save();
  if (image) {
    ctx.drawImage(image, -r, -r, r * 2, r * 2);
  } else {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(-r * 0.62, -r * 0.20, r * 1.24, r * 0.40);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.obstacle;
    ctx.beginPath();
    ctx.arc(0, r * 0.04, r * 0.46, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowColor = PALETTE.gold;
  ctx.shadowBlur = 8;
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(0, -r * 0.14, r * 0.16 + Math.sin(phase * 8) * r * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
});

registerPart(TESLA_BALL_VISUAL_ID, (ctx, size, params = {}, phase = 0) => {
  const r = params.radius ?? size * 0.5;
  const image = getLoadedImage(TESLA_BALL_VISUAL_ID);
  ctx.save();
  if (image) {
    ctx.drawImage(image, -r, -r, r * 2, r * 2);
  } else {
    const coreRadius = r * (1 + 0.10 * Math.sin(phase * 18));
    ctx.shadowColor = PALETTE.neon;
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = PALETTE.neon;
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = PALETTE.neon;
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    const spin = phase * (i === 0 ? 4 : -3) + i * Math.PI * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.35 + i * 0.16), spin, spin + Math.PI * 1.35);
    ctx.stroke();
  }
  if (Math.sin(phase * 16) > -0.25) {
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a = phase * 3 + i * Math.PI * 2 / 3;
      const x0 = Math.cos(a) * r * 1.0;
      const y0 = Math.sin(a) * r * 1.0;
      const x1 = Math.cos(a + 0.22) * r * 1.45;
      const y1 = Math.sin(a + 0.22) * r * 1.45;
      const x2 = Math.cos(a - 0.12) * r * 1.78;
      const y2 = Math.sin(a - 0.12) * r * 1.78;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.restore();
});

export function createTeslaBall(x, y, vx, vy, damage) {
  return {
    x, y, vx, vy, r: 12, damage,
    tickT: TICK_INTERVAL, life: 2.5, alive: true,
    visualId: TESLA_BALL_VISUAL_ID,
  };
}

export function renderTeslaBall(ctx, ball, phase) {
  drawVisual(ctx, ball.visualId || TESLA_BALL_VISUAL_ID, ball.x, ball.y, ball.r * 2, {
    params: { radius: ball.r },
    phase,
  });
}

export function updateTeslaBall(b, zombies, dt, onHit, onKill) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.tickT -= dt;
  if (b.tickT <= 0) {
    for (const z of zombies) {
      if (!z.alive) continue;
      if (Math.hypot(z.x - b.x, z.y - b.y) > TICK_RADIUS + z.r) continue;
      const died = damageZombie(z, b.damage, KNOCKBACK, Math.atan2(z.y - b.y, z.x - b.x));
      onHit(z);
      if (died) onKill(z);
    }
    b.tickT = TICK_INTERVAL;
  }
  b.life -= dt;
  if (b.life <= 0) b.alive = false;
  return b.alive;
}
```

将 `src/entities/helicopter.js` 改为以下实现；`updateHelicopter` 的状态分支、距离比较和 3s 常量保持原样，`renderHelicopter` 只负责把状态参数交给注册部件。部件先绘制 `scene.helicopter` PNG 机身主体（旋翼区域保持透明），再叠加按动画相位旋转的程序化旋翼和登机进度光环；图片未就绪时，机身、尾部、舷窗和着陆架沿用现有内联几何 fallback：

```js
import { drawVisual, getLoadedImage, registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';

const LANDING_TIME = 3;
const BOARDING_TIME = 3;
export const HELICOPTER_VISUAL_ID = 'scene.helicopter';

registerPart(HELICOPTER_VISUAL_ID, (ctx, size, params = {}, phase = 0) => {
  const r = size * 0.5;
  const progress = Math.max(0, Math.min(1, params.progress ?? 0));
  const image = getLoadedImage(HELICOPTER_VISUAL_ID);
  ctx.save();

  if (image) {
    ctx.drawImage(image, -r, -r, r * 2, r * 2);
  } else {
    ctx.fillStyle = PALETTE.neonDim;
    ctx.fillRect(-r * 0.92, -r * 0.13, r * 0.50, r * 0.26);
    ctx.fillStyle = PALETTE.panel;
    ctx.shadowColor = PALETTE.neon;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.neon;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = PALETTE.neon;
    ctx.beginPath();
    ctx.arc(r * 0.18, -r * 0.04, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = PALETTE.obstacle;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.30, r * 0.48);
    ctx.lineTo(-r * 0.46, r * 0.76);
    ctx.moveTo(r * 0.30, r * 0.48);
    ctx.lineTo(r * 0.46, r * 0.76);
    ctx.stroke();
  }

  ctx.save();
  ctx.rotate(phase * 5);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fillRect(-r * 1.42, -r * 0.06, r * 2.84, r * 0.12);
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = 2;
  ctx.strokeRect(-r * 1.42, -r * 0.06, r * 2.84, r * 0.12);
  ctx.restore();

  if (params.state === 'boarding') {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, r + 12, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
});

export function createHelicopter(x, y) {
  return { x, y, r: 60, state: 'landing', t: 0, visualId: HELICOPTER_VISUAL_ID };
}

export function updateHelicopter(h, player, dt) {
  if (h.state === 'landing') {
    h.t += dt;
    if (h.t >= LANDING_TIME) { h.state = 'waiting'; h.t = 0; }
    return 'none';
  }
  if (h.state === 'waiting') {
    const d = Math.hypot(player.x - h.x, player.y - h.y);
    if (d < h.r) { h.state = 'boarding'; h.t = 0; }
    return 'none';
  }
  if (h.state === 'boarding') {
    const d = Math.hypot(player.x - h.x, player.y - h.y);
    if (d >= h.r) { h.state = 'waiting'; h.t = 0; return 'none'; }
    h.t += dt;
    if (h.t >= BOARDING_TIME) { h.state = 'done'; return 'victory'; }
    return 'none';
  }
  return 'none';
}

export function renderHelicopter(ctx, h, phase = h.t) {
  drawVisual(ctx, h.visualId || HELICOPTER_VISUAL_ID, h.x, h.y, h.r * 2, {
    params: {
      state: h.state,
      progress: h.state === 'boarding' ? h.t / BOARDING_TIME : 0,
    },
    phase,
  });
}
```

将 `src/game.js:20` 的 import 改为：

```js
import { createTeslaBall, updateTeslaBall, renderTeslaBall } from './entities/teslaball.js';
```

将 `src/game.js:682-693` 的内联电磁球绘制替换为：

```js
for (const b of scene.teslaBalls) renderTeslaBall(ctx, b, scene.time);
```

直升机调用点改为 `renderHelicopter(ctx, scene.helicopter, scene.time)`，只把场景时间作为旋翼动画相位传入，状态机与 3s 计时不改道；地雷只登记 `MINE_VISUAL_ID`，不得向 `explode`、`updateTeslaBall` 或任何伤害计算注入新分支。

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/teslaball.test.js test/helicopter.test.js`

Expected: PASS（15 个用例；特斯拉球字段、0.25s 电击周期、2.5s 生命周期、伤害/击退回调，以及直升机降落/登机状态机全部通过）。

Run: `npm test`

Expected: PASS。随后用 webbridge 截图并实景核对：地雷视觉注册后可被 `drawVisual(ctx, 'scene.mine', ...)` 使用且未知 id 警告数为 0；图片就绪时三实体均显示 PNG 主体，地雷叠加中心警示光与范围环，特斯拉球叠加青霓环绕电弧和周期闪电，直升机叠加旋翼和登机进度光环；图片未就绪时对应现有内联几何 fallback 仍可用；场景行为仍保持 2.5s、3s/3s 和半径 60 的原有口径。

- [ ] **Step 5: 提交**

```bash
git add src/entities/teslaball.js src/entities/helicopter.js src/game.js test/teslaball.test.js test/helicopter.test.js
git commit -m "UI改造任务17: 地雷特斯拉球与直升机组合视觉"
```
### Task 18: 皮肤注册表与 meta version 2 迁移

**Files:**
- Create: `src/config/skins.js`
- Create: `test/skins.test.js`
- Modify: `src/core/meta.js:4-50`
- Test: `test/meta.test.js`

**Interfaces:**
- Consumes: 现有 `src/core/meta.js` 的 `loadMeta()`、`saveMeta()`、`addGold()`、`spendGold()`、`recordKill()`、`recordAdventureResult()` 语义；保留 `zs_meta` 存储键，不读取或修改 `src/core/storage.js`。
- Produces: `export const SKINS`；`META_VERSION = 2`；`defaultMeta().skins = { owned: ['wastelandAdventurer'], selected: 'wastelandAdventurer' }`；`loadMeta()`/`saveMeta()` 可持久化 `skins.owned` 与 `skins.selected`；`normalizeMeta` 只接受 `SKINS` 中存在的皮肤 ID，供任务 19 的 `drawPlayer` 与任务 20 的 `showSkins` 使用。

- [ ] **Step 1: 写失败测试**

用 `node:test` 增加皮肤注册表契约，并把 `test/meta.test.js` 的 version 1 预期改成 version 2。测试不创建 DOM、不读取 PNG 像素，只检查字段、manifest 之外的存档字段和精确迁移结果。

`test/skins.test.js` 完整内容：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS } from '../src/config/skins.js';

test('首发皮肤清单与 schema 完整', () => {
  assert.deepEqual(Object.keys(SKINS).sort(), [
    'neonMercenary',
    'nightHunter',
    'wastelandAdventurer',
  ]);
  for (const skin of Object.values(SKINS)) {
    assert.equal(typeof skin.id, 'string');
    assert.equal(typeof skin.name, 'string');
    assert.equal(typeof skin.portrait, 'string');
    assert.equal(typeof skin.sprite, 'string');
    assert.equal(skin.frameSize, 128);
    assert.deepEqual(skin.directions, ['down', 'left', 'right', 'up']);
    assert.equal(skin.framesPerDirection, 2);
    assert.deepEqual(Object.keys(skin.price).sort(), ['amount', 'currency']);
    assert.equal(skin.price.currency, 'gold');
    assert.ok(Number.isInteger(skin.price.amount) && skin.price.amount >= 0);
    assert.equal(typeof skin.description, 'string');
    assert.ok(skin.description.length > 0);
    assert.equal(SKINS[skin.id], skin);
  }
});

test('荒野冒险家免费且是默认皮肤', () => {
  assert.deepEqual(SKINS.wastelandAdventurer, {
    id: 'wastelandAdventurer',
    name: '荒野冒险家',
    portrait: 'skin.wastelandAdventurer.portrait',
    sprite: 'skin.wastelandAdventurer.sprite',
    frameSize: 128,
    directions: ['down', 'left', 'right', 'up'],
    framesPerDirection: 2,
    price: { currency: 'gold', amount: 0 },
    description: '在废土中寻找补给与出路的可靠冒险家。',
  });
});

test('付费皮肤注册表默认价格为 800 与 1500 金币', () => {
  assert.equal(SKINS.neonMercenary.price.amount, 800);
  assert.equal(SKINS.nightHunter.price.amount, 1500);
  assert.equal(SKINS.neonMercenary.price.currency, 'gold');
  assert.equal(SKINS.nightHunter.price.currency, 'gold');
});
```

`test/meta.test.js` 完整内容：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  META_VERSION, defaultMeta, loadMeta, saveMeta,
  addGold, spendGold, weaponLevel, recordKill, recordAdventureResult,
} from '../src/core/meta.js';

function setFakeStorage(raw) {
  const store = new Map(Object.entries(raw));
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
  return store;
}
function clearFakeStorage() {
  delete globalThis.localStorage;
}

test('defaultMeta 结构定稿（version 2 + 默认皮肤）', () => {
  clearFakeStorage();
  assert.equal(META_VERSION, 2);
  assert.deepEqual(defaultMeta(), {
    version: 2,
    gold: 0,
    weaponLevels: {},
    adventure: { unlocked: 1, firstClear: {}, bestTimes: {} },
    bestiaryKills: {},
    skins: {
      owned: ['wastelandAdventurer'],
      selected: 'wastelandAdventurer',
    },
  });
});

test('金币收支：addGold 累加；spendGold 余额不足返回 false 不扣款', () => {
  const m = defaultMeta();
  addGold(m, 200);
  assert.equal(m.gold, 200);
  assert.equal(spendGold(m, 150), true);
  assert.equal(m.gold, 50);
  assert.equal(spendGold(m, 100), false);
  assert.equal(m.gold, 50);
});

test('weaponLevel 缺省 0；recordKill 累计', () => {
  const m = defaultMeta();
  assert.equal(weaponLevel(m, 'pistol'), 0);
  m.weaponLevels.pistol = 3;
  assert.equal(weaponLevel(m, 'pistol'), 3);
  assert.equal(recordKill(m, 'normal'), 1);
  assert.equal(recordKill(m, 'normal'), 2);
  assert.equal(m.bestiaryKills.normal, 2);
});

test('冒险结算：首通标记 + 解锁 N+1（封顶总关数）', () => {
  const m = defaultMeta();
  const r1 = recordAdventureResult(m, 'l1', 1, 3, true, 360);
  assert.equal(r1.isFirstClear, true);
  assert.equal(m.adventure.unlocked, 2);
  const r2 = recordAdventureResult(m, 'l1', 1, 3, true, 360);
  assert.equal(r2.isFirstClear, false);
  const r3 = recordAdventureResult(m, 'l3', 3, 3, true, 360);
  assert.equal(m.adventure.unlocked, 3);
  assert.equal(r3.isFirstClear, true);
});

test('冒险失败不解锁；最佳成绩 cleared 优先，其次比存活秒数', () => {
  const m = defaultMeta();
  recordAdventureResult(m, 'l1', 1, 3, false, 200);
  assert.equal(m.adventure.unlocked, 1);
  assert.deepEqual(m.adventure.bestTimes.l1, { cleared: false, timeSec: 200 });
  recordAdventureResult(m, 'l1', 1, 3, false, 100);
  assert.deepEqual(m.adventure.bestTimes.l1, { cleared: false, timeSec: 200 });
  recordAdventureResult(m, 'l1', 1, 3, true, 360);
  assert.deepEqual(m.adventure.bestTimes.l1, { cleared: true, timeSec: 360 });
});

test('无 localStorage（Node）：loadMeta 回默认、saveMeta 不抛错', () => {
  clearFakeStorage();
  assert.deepEqual(loadMeta(), defaultMeta());
  assert.doesNotThrow(() => saveMeta(defaultMeta()));
});

test('读写往返；坏 JSON / 版本不符 / 字段类型错误逐项回退、合法字段保留', () => {
  setFakeStorage({});
  const m = defaultMeta();
  addGold(m, 500);
  m.weaponLevels.pistol = 2;
  saveMeta(m);
  assert.equal(loadMeta().gold, 500);
  assert.equal(loadMeta().weaponLevels.pistol, 2);

  setFakeStorage({ zs_meta: '{oops' });
  assert.deepEqual(loadMeta(), defaultMeta());

  setFakeStorage({
    zs_meta: JSON.stringify({ version: 0, gold: 300, weaponLevels: { pistol: 99 }, adventure: { unlocked: 2 } }),
  });
  const loaded = loadMeta();
  assert.equal(loaded.version, 2);
  assert.equal(loaded.gold, 300);
  assert.equal(loaded.weaponLevels.pistol, undefined);
  assert.equal(loaded.adventure.unlocked, 2);
  assert.deepEqual(loaded.skins, {
    owned: ['wastelandAdventurer'],
    selected: 'wastelandAdventurer',
  });
  clearFakeStorage();
});

test('version 1 或缺失 skins 自动迁移，保留合法局外字段', () => {
  setFakeStorage({
    zs_meta: JSON.stringify({
      version: 1,
      gold: 321,
      weaponLevels: { pistol: 4 },
      adventure: { unlocked: 2, firstClear: { l1: true }, bestTimes: {} },
      bestiaryKills: { normal: 7 },
    }),
  });
  const loaded = loadMeta();
  assert.equal(loaded.version, 2);
  assert.equal(loaded.gold, 321);
  assert.equal(loaded.weaponLevels.pistol, 4);
  assert.equal(loaded.adventure.unlocked, 2);
  assert.equal(loaded.bestiaryKills.normal, 7);
  assert.deepEqual(loaded.skins, {
    owned: ['wastelandAdventurer'],
    selected: 'wastelandAdventurer',
  });
  clearFakeStorage();
});

test('skins owned 只保留注册表 ID 且 selected 不属于 owned 时回退默认', () => {
  setFakeStorage({
    zs_meta: JSON.stringify({
      version: 2,
      skins: { owned: ['nightHunter', 'bogus', 'nightHunter', 7], selected: 'bogus' },
    }),
  });
  assert.deepEqual(loadMeta().skins, {
    owned: ['wastelandAdventurer', 'nightHunter'],
    selected: 'wastelandAdventurer',
  });
  clearFakeStorage();
});

test('合法 selected 必须属于 owned 时保留选中皮肤', () => {
  setFakeStorage({
    zs_meta: JSON.stringify({
      version: 2,
      skins: { owned: ['nightHunter'], selected: 'nightHunter' },
    }),
  });
  assert.deepEqual(loadMeta().skins, {
    owned: ['wastelandAdventurer', 'nightHunter'],
    selected: 'nightHunter',
  });
  clearFakeStorage();
});

test('皮肤字段读写往返', () => {
  setFakeStorage({});
  const m = defaultMeta();
  m.skins.owned.push('neonMercenary');
  m.skins.selected = 'neonMercenary';
  saveMeta(m);
  assert.deepEqual(loadMeta().skins, {
    owned: ['wastelandAdventurer', 'neonMercenary'],
    selected: 'neonMercenary',
  });
  clearFakeStorage();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/skins.test.js test/meta.test.js`

Expected: FAIL，首先因 `../src/config/skins.js` 尚不存在而报告 `ERR_MODULE_NOT_FOUND`；即使暂时提供空模块，`META_VERSION` 仍为 `1`、`defaultMeta()` 仍缺少 `skins` 字段，测试会继续明确指出这些契约差异。

- [ ] **Step 3: 最小实现**

新建 `src/config/skins.js`，价格只作为注册表数据读取，金额旁保留“平衡可调”注释，购买逻辑不写死 800 或 1500：

```js
// src/config/skins.js —— 主角皮肤注册表（设计 §6.2）。
export const SKINS = {
  wastelandAdventurer: {
    id: 'wastelandAdventurer',
    name: '荒野冒险家',
    portrait: 'skin.wastelandAdventurer.portrait',
    sprite: 'skin.wastelandAdventurer.sprite',
    frameSize: 128,
    directions: ['down', 'left', 'right', 'up'],
    framesPerDirection: 2,
    price: { currency: 'gold', amount: 0 },
    description: '在废土中寻找补给与出路的可靠冒险家。',
  },
  neonMercenary: {
    id: 'neonMercenary',
    name: '霓虹雇佣兵',
    portrait: 'skin.neonMercenary.portrait',
    sprite: 'skin.neonMercenary.sprite',
    frameSize: 128,
    directions: ['down', 'left', 'right', 'up'],
    framesPerDirection: 2,
    price: { currency: 'gold', amount: 800 }, // 平衡可调
    description: '在霓虹废墟中执行高风险护送任务的雇佣兵。',
  },
  nightHunter: {
    id: 'nightHunter',
    name: '暗夜猎手',
    portrait: 'skin.nightHunter.portrait',
    sprite: 'skin.nightHunter.sprite',
    frameSize: 128,
    directions: ['down', 'left', 'right', 'up'],
    framesPerDirection: 2,
    price: { currency: 'gold', amount: 1500 }, // 平衡可调
    description: '潜伏在夜色与废墟边缘的冷静猎手。',
  },
};
```

将 `src/core/meta.js` 改为以下完整实现；旧存档仍从 `zs_meta` 读取，`src/core/storage.js` 不做任何改动：

```js
// src/core/meta.js —— 局外存档：金币、武器等级、冒险进度、图鉴击杀和皮肤。
import { SKINS } from '../config/skins.js';

const META_KEY = 'zs_meta';
export const META_VERSION = 2;
const MAX_WEAPON_LEVEL = 10;
const DEFAULT_SKIN_ID = 'wastelandAdventurer';

export function defaultMeta() {
  return {
    version: META_VERSION,
    gold: 0,
    weaponLevels: {},
    adventure: { unlocked: 1, firstClear: {}, bestTimes: {} },
    bestiaryKills: {},
    skins: {
      owned: [DEFAULT_SKIN_ID],
      selected: DEFAULT_SKIN_ID,
    },
  };
}

function isRegisteredSkin(id) {
  return typeof id === 'string'
    && Object.prototype.hasOwnProperty.call(SKINS, id);
}

function defaultSkins() {
  return { owned: [DEFAULT_SKIN_ID], selected: DEFAULT_SKIN_ID };
}

function normalizeSkins(raw, sourceVersion) {
  if (sourceVersion < META_VERSION || !raw || typeof raw !== 'object' || Array.isArray(raw))
    return defaultSkins();
  const owned = [];
  if (Array.isArray(raw.owned)) {
    for (const id of raw.owned) {
      if (isRegisteredSkin(id) && !owned.includes(id)) owned.push(id);
    }
  }
  if (!owned.includes(DEFAULT_SKIN_ID)) owned.unshift(DEFAULT_SKIN_ID);
  const selected = typeof raw.selected === 'string' && owned.includes(raw.selected)
    ? raw.selected
    : DEFAULT_SKIN_ID;
  return { owned, selected };
}

function normalizeMeta(parsed) {
  const m = defaultMeta();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return m;
  const sourceVersion = Number.isInteger(parsed.version) ? parsed.version : 1;

  if (typeof parsed.gold === 'number' && Number.isFinite(parsed.gold) && parsed.gold >= 0)
    m.gold = Math.floor(parsed.gold);
  if (parsed.weaponLevels && typeof parsed.weaponLevels === 'object' && !Array.isArray(parsed.weaponLevels)) {
    for (const [id, lv] of Object.entries(parsed.weaponLevels)) {
      if (Number.isInteger(lv) && lv >= 0 && lv <= MAX_WEAPON_LEVEL) m.weaponLevels[id] = lv;
    }
  }
  if (parsed.adventure && typeof parsed.adventure === 'object' && !Array.isArray(parsed.adventure)) {
    const a = parsed.adventure;
    if (Number.isInteger(a.unlocked) && a.unlocked >= 1) m.adventure.unlocked = a.unlocked;
    if (a.firstClear && typeof a.firstClear === 'object' && !Array.isArray(a.firstClear)) {
      for (const [id, value] of Object.entries(a.firstClear)) {
        if (value === true) m.adventure.firstClear[id] = true;
      }
    }
    if (a.bestTimes && typeof a.bestTimes === 'object' && !Array.isArray(a.bestTimes)) {
      for (const [id, value] of Object.entries(a.bestTimes)) {
        if (value && typeof value === 'object' && typeof value.timeSec === 'number' && Number.isFinite(value.timeSec)) {
          m.adventure.bestTimes[id] = { cleared: value.cleared === true, timeSec: value.timeSec };
        }
      }
    }
  }
  if (parsed.bestiaryKills && typeof parsed.bestiaryKills === 'object' && !Array.isArray(parsed.bestiaryKills)) {
    for (const [id, count] of Object.entries(parsed.bestiaryKills)) {
      if (Number.isInteger(count) && count >= 0) m.bestiaryKills[id] = count;
    }
  }
  m.skins = normalizeSkins(parsed.skins, sourceVersion);
  return m;
}

export function loadMeta() {
  try {
    if (typeof localStorage === 'undefined') return defaultMeta();
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return defaultMeta();
    return normalizeMeta(JSON.parse(raw));
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // 存储不可用时静默忽略，保持既有保护边界。
  }
}

export function addGold(meta, n) {
  meta.gold += Math.floor(n);
  return meta.gold;
}

export function spendGold(meta, n) {
  if (meta.gold < n) return false;
  meta.gold -= n;
  return true;
}

export function weaponLevel(meta, id) {
  return meta.weaponLevels[id] ?? 0;
}

export function recordKill(meta, monsterId) {
  meta.bestiaryKills[monsterId] = (meta.bestiaryKills[monsterId] ?? 0) + 1;
  return meta.bestiaryKills[monsterId];
}

export function recordAdventureResult(meta, levelId, levelIndex, levelCount, cleared, timeSec) {
  const isFirstClear = cleared && !meta.adventure.firstClear[levelId];
  if (cleared) {
    meta.adventure.firstClear[levelId] = true;
    meta.adventure.unlocked = Math.min(levelCount, Math.max(meta.adventure.unlocked, levelIndex + 1));
  }
  const old = meta.adventure.bestTimes[levelId];
  const oldCleared = old ? old.cleared === true : false;
  const better = !old || (cleared && !oldCleared) || (cleared === oldCleared && timeSec > old.timeSec);
  if (better) meta.adventure.bestTimes[levelId] = { cleared, timeSec };
  return { isFirstClear };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/skins.test.js test/meta.test.js`

Expected: PASS（`test/skins.test.js` 3 个用例、`test/meta.test.js` 11 个用例，共 14 个用例），默认皮肤、version 1 迁移、注册表白名单和合法 selected 保留全部通过。

Run: `npm test`

Expected: 全量测试通过；`test/storage.test.js` 仍只验证 `zs_best` 与 `zs_settings`，不会出现 `zs_meta` 之外的存储变化。

- [ ] **Step 5: 提交**

```bash
git add src/config/skins.js src/core/meta.js test/skins.test.js test/meta.test.js
git commit -m "UI改造任务18: 新增皮肤注册表并迁移 meta version 2"
```

---

### Task 19: 皮肤精灵资产与玩家渲染回退

**Files:**
- Create: `assets/img/skins/wasteland-adventurer/sprite.png`
- Create: `assets/img/skins/neon-mercenary/sprite.png`
- Create: `assets/img/skins/night-hunter/sprite.png`
- Create: `docs/superpowers/visual-assets/skins-2026-09-02.md`
- Modify: `src/config/assets.js:ASSETS 与 ASSET_BY_ID 的 manifest 定义区`
- Modify: `src/entities/player.js:3-20`
- Modify: `src/entities/render.js:1-122`
- Modify: `src/game.js:31-36,665-677`
- Test: `test/player.test.js`
- Test: `test/skins.test.js`

**Interfaces:**
- Consumes: 任务 18 的 `SKINS`、`defaultMeta()` 与 `meta.skins.selected`；任务包 3 的 `ASSETS`、`ASSET_BY_ID`；任务包 2 的 `drawVisual(ctx, id, x, y, size, options?)` 与图片缓存。沿用这一函数签名并约定皮肤调用的 `options.frame = { direction, index }`、`options.onFallback` 与 `options.warn`：图片未知、加载失败或图集裁剪失败时调用 `onFallback`，`warn:false` 时不重复打印通用警告。
- Produces: `drawPlayer(ctx, player, timeSec, meta, options?)`；`createPlayer()` 返回的 `moving`、`walkFrame`、`walkClock` 字段；三款皮肤的 `skin.<id>.portrait` 与 `skin.<id>.sprite` manifest 条目；精灵图集固定为四列 `down/left/right/up`、两行帧 `0/1`，每帧 128×128，图集 512×256。任务 20 通过 `getVisualCanvas(skin.portrait, size, { frame: { direction: 'down', index: 0 } })` 复用同一资产包。

- [ ] **Step 1: 写失败测试**

先把玩家动画、选中皮肤精灵 ID、方向/帧裁剪和白色圆球回退写进测试。`test/player.test.js` 使用假的 Canvas 2D 上下文；不加载真实图片、不比较 PNG 像素。

`test/player.test.js` 完整内容：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer, damagePlayer } from '../src/entities/player.js';
import { circleRectHit } from '../src/core/physics.js';
import { drawPlayer } from '../src/entities/render.js';

const IDLE = { up: false, down: false, left: false, right: false };

function mockCtx() {
  const calls = [];
  return {
    calls,
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); },
    arc(...args) { calls.push(['arc', ...args]); },
    fill() { calls.push('fill'); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    stroke() { calls.push('stroke'); },
  };
}

test('向右移动 1 秒前进 speed 距离', () => {
  const p = createPlayer(1500, 1500);
  updatePlayer(p, { ...IDLE, right: true }, [], 3000, 1);
  assert.ok(Math.abs(p.x - (1500 + p.speed)) < 1e-6);
});

test('斜向移动速度不叠加（归一化）', () => {
  const p = createPlayer(1500, 1500);
  updatePlayer(p, { ...IDLE, right: true, up: true }, [], 3000, 1);
  const moved = Math.hypot(p.x - 1500, p.y - 1500);
  assert.ok(Math.abs(moved - p.speed) < 1e-6);
});

test('被矩形障碍挡住且不陷入', () => {
  const rect = { kind: 'rect', x: 1600, y: 1400, w: 100, h: 200 };
  const p = createPlayer(1500, 1500);
  for (let i = 0; i < 60; i++) updatePlayer(p, { ...IDLE, right: true }, [rect], 3000, 1 / 60);
  assert.equal(circleRectHit(p.x, p.y, p.r, rect), false);
});

test('地图边界夹紧', () => {
  const p = createPlayer(10, 10);
  updatePlayer(p, { ...IDLE, left: true, up: true }, [], 3000, 1);
  assert.ok(p.x >= p.r && p.y >= p.r);
});

test('受伤 0.5s 无敌帧', () => {
  const p = createPlayer(1500, 1500);
  assert.equal(damagePlayer(p, 20), true);
  assert.equal(p.hp, 80);
  assert.equal(damagePlayer(p, 20), false);
  assert.equal(p.hp, 80);
  updatePlayer(p, IDLE, [], 3000, 0.6);
  assert.equal(damagePlayer(p, 20), true);
  assert.equal(p.hp, 60);
});

test('移动两帧切换，停止时回到第 0 帧', () => {
  const p = createPlayer(1500, 1500);
  assert.equal(p.moving, false);
  assert.equal(p.walkFrame, 0);
  updatePlayer(p, { ...IDLE, right: true }, [], 3000, 0.13);
  assert.equal(p.moving, true);
  assert.equal(p.walkFrame, 1);
  updatePlayer(p, { ...IDLE, right: true }, [], 3000, 0.13);
  assert.equal(p.walkFrame, 0);
  updatePlayer(p, IDLE, [], 3000, 0.01);
  assert.equal(p.moving, false);
  assert.equal(p.walkFrame, 0);
  assert.equal(p.walkClock, 0);
});

test('drawPlayer 按 selected、方向和停止帧调用 drawVisual', () => {
  const p = createPlayer(100, 100);
  p.facing = 0;
  const ctx = mockCtx();
  let call = null;
  drawPlayer(ctx, p, 0, {
    skins: { owned: ['wastelandAdventurer', 'neonMercenary'], selected: 'neonMercenary' },
  }, {
    drawVisualFn: (...args) => {
      call = args;
      return true;
    },
  });
  assert.equal(call[1], 'skin.neonMercenary.sprite');
  assert.equal(call[2], 100);
  assert.equal(call[3], 100);
  assert.equal(call[4], 32);
  assert.deepEqual(call[5].frame, { direction: 'right', index: 0 });
});

test('drawPlayer 图片回退和无效 ID 每个 ID 只警告一次，并画白色圆球与朝向线', () => {
  const originalWarn = console.warn;
  const messages = [];
  console.warn = message => messages.push(String(message));
  try {
    const invalid = createPlayer(20, 30);
    const invalidCtx = mockCtx();
    drawPlayer(invalidCtx, invalid, 0, { skins: { owned: [], selected: 'missingSkin' } });
    drawPlayer(invalidCtx, invalid, 0, { skins: { owned: [], selected: 'missingSkin' } });
    assert.equal(messages.length, 1);
    assert.match(messages[0], /missingSkin/);
    assert.ok(invalidCtx.calls.some(call => Array.isArray(call) && call[0] === 'arc'));
    assert.ok(invalidCtx.calls.some(call => Array.isArray(call) && call[0] === 'lineTo'));

    const failed = createPlayer(40, 50);
    const failedCtx = mockCtx();
    drawPlayer(failedCtx, failed, 0, {
      skins: { owned: ['nightHunter'], selected: 'nightHunter' },
    }, {
      drawVisualFn: (targetCtx, id, x, y, size, options) => {
        options.onFallback();
        return false;
      },
    });
    assert.equal(messages.length, 2);
    assert.match(messages[1], /nightHunter/);
    assert.ok(failedCtx.calls.some(call => Array.isArray(call) && call[0] === 'arc'));
    assert.ok(failedCtx.calls.some(call => Array.isArray(call) && call[0] === 'lineTo'));
  } finally {
    console.warn = originalWarn;
  }
});
```

将下面两项 manifest 断言追加到任务 18 的 `test/skins.test.js`，并把文件整理为以下完整内容：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS } from '../src/config/skins.js';
import { ASSET_BY_ID } from '../src/config/assets.js';

test('首发皮肤清单与 schema 完整', () => {
  assert.deepEqual(Object.keys(SKINS).sort(), [
    'neonMercenary',
    'nightHunter',
    'wastelandAdventurer',
  ]);
  for (const skin of Object.values(SKINS)) {
    assert.equal(typeof skin.id, 'string');
    assert.equal(typeof skin.name, 'string');
    assert.equal(typeof skin.portrait, 'string');
    assert.equal(typeof skin.sprite, 'string');
    assert.equal(skin.frameSize, 128);
    assert.deepEqual(skin.directions, ['down', 'left', 'right', 'up']);
    assert.equal(skin.framesPerDirection, 2);
    assert.deepEqual(Object.keys(skin.price).sort(), ['amount', 'currency']);
    assert.equal(skin.price.currency, 'gold');
    assert.ok(Number.isInteger(skin.price.amount) && skin.price.amount >= 0);
    assert.equal(typeof skin.description, 'string');
    assert.ok(skin.description.length > 0);
    assert.equal(SKINS[skin.id], skin);
  }
});

test('荒野冒险家免费且是默认皮肤', () => {
  assert.equal(SKINS.wastelandAdventurer.price.amount, 0);
  assert.equal(SKINS.wastelandAdventurer.price.currency, 'gold');
  assert.equal(SKINS.wastelandAdventurer.portrait, 'skin.wastelandAdventurer.portrait');
  assert.equal(SKINS.wastelandAdventurer.sprite, 'skin.wastelandAdventurer.sprite');
});

test('付费皮肤注册表默认价格为 800 与 1500 金币', () => {
  assert.equal(SKINS.neonMercenary.price.amount, 800);
  assert.equal(SKINS.nightHunter.price.amount, 1500);
});

test('每款皮肤都有 128px portrait crop 和 512x256 八帧 sprite manifest', () => {
  const pathById = {
    wastelandAdventurer: 'assets/img/skins/wasteland-adventurer/sprite.png',
    neonMercenary: 'assets/img/skins/neon-mercenary/sprite.png',
    nightHunter: 'assets/img/skins/night-hunter/sprite.png',
  };
  const expectedFrameOrder = [
    { direction: 'down', frame: 0, x: 0, y: 0, width: 128, height: 128 },
    { direction: 'left', frame: 0, x: 128, y: 0, width: 128, height: 128 },
    { direction: 'right', frame: 0, x: 256, y: 0, width: 128, height: 128 },
    { direction: 'up', frame: 0, x: 384, y: 0, width: 128, height: 128 },
    { direction: 'down', frame: 1, x: 0, y: 128, width: 128, height: 128 },
    { direction: 'left', frame: 1, x: 128, y: 128, width: 128, height: 128 },
    { direction: 'right', frame: 1, x: 256, y: 128, width: 128, height: 128 },
    { direction: 'up', frame: 1, x: 384, y: 128, width: 128, height: 128 },
  ];
  for (const skin of Object.values(SKINS)) {
    const sprite = ASSET_BY_ID[skin.sprite];
    const portrait = ASSET_BY_ID[skin.portrait];
    assert.ok(sprite, `${skin.id}.sprite manifest 缺失`);
    assert.ok(portrait, `${skin.id}.portrait manifest 缺失`);
    assert.equal(sprite.path, pathById[skin.id]);
    assert.equal(portrait.path, pathById[skin.id]);
    assert.equal(sprite.size, 128);
    assert.equal(portrait.size, 128);
    assert.equal(sprite.promptVersion, 'neon-cel-v1');
    assert.equal(portrait.promptVersion, 'neon-cel-v1');
    assert.deepEqual(sprite.atlas, {
      width: 512,
      height: 256,
      frameSize: 128,
      columns: 4,
      rows: 2,
      frameOrder: expectedFrameOrder,
    });
    assert.deepEqual(portrait.crop, { x: 0, y: 0, width: 128, height: 128 });
  }
});

test('manifest ID 与 skins.js 的 portrait/sprite 引用一一对应', () => {
  for (const skin of Object.values(SKINS)) {
    assert.equal(ASSET_BY_ID[skin.portrait].id, skin.portrait);
    assert.equal(ASSET_BY_ID[skin.sprite].id, skin.sprite);
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/player.test.js test/skins.test.js`

Expected: FAIL；`test/player.test.js` 报 `does not provide an export named 'drawPlayer'`，并且 manifest 断言会报告 `skin.<id>.portrait` 或 `skin.<id>.sprite` 缺失。失败发生在最小实现之前，不通过删除断言消除。

- [ ] **Step 3: 最小实现**

先按设计 §8.1 执行资产生产，再登记 manifest：

1. 调用 `gpt-image-review` 技能，经 CLIProxyAPI 使用 `k3-256k`，读取 `neon-cel-v1` 模板；模板正文使用设计 §3.3 的固定句式：`暗黑霓虹赛璐璐风，[主体对象]，[用途/姿态]，深色底适配，霓绿/金描边发光，45°俯视微侧视角，单个主体居中，128×128 透明底 PNG，轮廓清晰、块面分明、可在 24/32/48/64px 显示，禁止文字、数字、水印和背景杂物。`
2. 样图先行：只生成 `wastelandAdventurer/down/frame-0` 一张 128×128 透明底赛璐璐小人样图；用四个维度逐项验收：风格一致性、透明底完整性、缩小到 24px 后的辨识度、与霓绿/金色设计令牌的融合度。任一维度不通过就用同一模板重出，四项通过后才批量生成其余 23 帧。
3. 批量生成三款皮肤的 `down/left/right/up × frame 0/1`，每帧都是 128×128 透明底小人；每款把八帧编排为 512×256 图集，列顺序固定为 `down,left,right,up`，行顺序固定为帧 `0,1`。将合格图集分别保存到 `assets/img/skins/wasteland-adventurer/sprite.png`、`assets/img/skins/neon-mercenary/sprite.png`、`assets/img/skins/night-hunter/sprite.png`。
4. 逐张记录四维度审美结论；不合格版本不进入 `assets/img/skins/`，也不允许写入最终的 `neon-cel-v1` manifest。若生成 API 失败或在本次交付前没有合格 PNG，先用程序化白色圆球/朝向线作为运行时占位，仍登记相同的 manifest ID 与裁剪信息，并把对应 `promptVersion` 登记为 `'placeholder-v0'`；取得合格 PNG 后只替换图集并把该条目的 `promptVersion` 改回 `'neon-cel-v1'`，不改 `SKINS` ID 或 UI 引用。
5. 在 `src/config/assets.js` 现有 `ASSETS` 数组末尾、`ASSET_BY_ID` 派生表达式之前，加入以下可直接执行的 manifest 定义。`ASSET_BY_ID` 继续由 `Object.fromEntries(ASSETS.map(asset => [asset.id, asset]))` 派生，不建立第二份皮肤 map：

```js
const SKIN_FRAME_ORDER = [
  { direction: 'down', frame: 0, x: 0, y: 0, width: 128, height: 128 },
  { direction: 'left', frame: 0, x: 128, y: 0, width: 128, height: 128 },
  { direction: 'right', frame: 0, x: 256, y: 0, width: 128, height: 128 },
  { direction: 'up', frame: 0, x: 384, y: 0, width: 128, height: 128 },
  { direction: 'down', frame: 1, x: 0, y: 128, width: 128, height: 128 },
  { direction: 'left', frame: 1, x: 128, y: 128, width: 128, height: 128 },
  { direction: 'right', frame: 1, x: 256, y: 128, width: 128, height: 128 },
  { direction: 'up', frame: 1, x: 384, y: 128, width: 128, height: 128 },
];

const SKIN_ASSETS = [
  {
    id: 'skin.wastelandAdventurer.portrait',
    path: 'assets/img/skins/wasteland-adventurer/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    crop: { x: 0, y: 0, width: 128, height: 128 },
  },
  {
    id: 'skin.wastelandAdventurer.sprite',
    path: 'assets/img/skins/wasteland-adventurer/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    atlas: {
      width: 512,
      height: 256,
      frameSize: 128,
      columns: 4,
      rows: 2,
      frameOrder: SKIN_FRAME_ORDER,
    },
  },
  {
    id: 'skin.neonMercenary.portrait',
    path: 'assets/img/skins/neon-mercenary/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    crop: { x: 0, y: 0, width: 128, height: 128 },
  },
  {
    id: 'skin.neonMercenary.sprite',
    path: 'assets/img/skins/neon-mercenary/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    atlas: {
      width: 512,
      height: 256,
      frameSize: 128,
      columns: 4,
      rows: 2,
      frameOrder: SKIN_FRAME_ORDER,
    },
  },
  {
    id: 'skin.nightHunter.portrait',
    path: 'assets/img/skins/night-hunter/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    crop: { x: 0, y: 0, width: 128, height: 128 },
  },
  {
    id: 'skin.nightHunter.sprite',
    path: 'assets/img/skins/night-hunter/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    atlas: {
      width: 512,
      height: 256,
      frameSize: 128,
      columns: 4,
      rows: 2,
      frameOrder: SKIN_FRAME_ORDER,
    },
  },
];

ASSETS.push(...SKIN_ASSETS);
```

在 `src/entities/player.js` 保留移动、碰撞、速度和受伤逻辑，只加入动画状态；每 0.12 秒切换一次两帧，停止输入立即回到第 0 帧：

```js
import { slideCircleObstacles } from '../core/physics.js';

const WALK_FRAME_TIME = 0.12;

export function createPlayer(x, y) {
  return {
    x, y, r: 16, hp: 100, maxHp: 100, speed: 180,
    pickupRadius: 80, invuln: 0, xp: 0, level: 1, facing: 0,
    moving: false, walkFrame: 0, walkClock: 0,
  };
}

export function updatePlayer(p, input, obstacles, mapSize, dt) {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  p.moving = Boolean(dx || dy);
  if (p.moving) {
    const len = Math.hypot(dx, dy);
    p.x += dx / len * p.speed * dt;
    p.y += dy / len * p.speed * dt;
    p.facing = Math.atan2(dy, dx);
    p.walkClock += dt;
    if (p.walkClock >= WALK_FRAME_TIME) {
      p.walkFrame = (p.walkFrame + Math.floor(p.walkClock / WALK_FRAME_TIME)) % 2;
      p.walkClock %= WALK_FRAME_TIME;
    }
  } else {
    p.walkFrame = 0;
    p.walkClock = 0;
  }
  p.x = Math.max(p.r, Math.min(mapSize - p.r, p.x));
  p.y = Math.max(p.r, Math.min(mapSize - p.r, p.y));
  slideCircleObstacles(p, obstacles);
  if (p.invuln > 0) p.invuln -= dt;
}

export function damagePlayer(p, dmg) {
  if (p.invuln > 0) return false;
  p.hp -= dmg;
  p.invuln = 0.5;
  return true;
}
```

在 `src/entities/render.js` 的 import 区加入 `SKINS` 和任务包 2 的 `drawVisual`，并加入以下玩家渲染门面。`drawVisual` 成功时可以返回 `true`，失败时返回 `false`；回调仍是失败判定的首选，因此不依赖图片的 DOM 或 PNG 像素状态：

```js
import { SKINS } from '../config/skins.js';
import { drawVisual } from '../core/visuals.js';

const WARNED_PLAYER_SKINS = new Set();
const DEFAULT_SKIN_ID = 'wastelandAdventurer';

function playerDirection(angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

function drawWhitePlayer(ctx, player) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(
    player.x + Math.cos(player.facing) * player.r,
    player.y + Math.sin(player.facing) * player.r,
  );
  ctx.stroke();
}

export function drawPlayer(ctx, player, timeSec, meta, { drawVisualFn = drawVisual } = {}) {
  const selected = meta?.skins?.selected ?? DEFAULT_SKIN_ID;
  const owned = meta?.skins?.owned;
  const skin = SKINS[selected]
    && (!Array.isArray(owned) || owned.includes(selected))
    ? SKINS[selected]
    : null;
  const warnKey = String(selected);
  let fallback = !skin;

  ctx.save();
  ctx.globalAlpha = player.invuln > 0
    ? 0.45 + 0.35 * Math.sin(timeSec * 24)
    : 1;
  if (skin) {
    const direction = playerDirection(player.facing);
    const index = player.moving ? player.walkFrame % skin.framesPerDirection : 0;
    try {
      const drawn = drawVisualFn(ctx, skin.sprite, player.x, player.y, player.r * 2, {
        frame: { direction, index },
        warn: false,
        onFallback: () => { fallback = true; },
      });
      if (drawn === false) fallback = true;
    } catch {
      fallback = true;
    }
  }
  if (fallback) {
    if (!WARNED_PLAYER_SKINS.has(warnKey)) {
      WARNED_PLAYER_SKINS.add(warnKey);
      console.warn(`皮肤 ${warnKey} 不可用，玩家回退白色圆球`);
    }
    drawWhitePlayer(ctx, player);
  }
  ctx.restore();
}
```

把 `src/game.js:665-677` 的内联白色圆球替换为 `drawPlayer(ctx, player, scene.time, meta)`，并把 import 改成：

```js
import { renderZombie, renderProjectiles, drawPlayer } from './entities/render.js';
```

渲染位置保持在直升机之后、弹道之前，替换后的调用为：

```js
// 玩家：selected 皮肤精灵，资源异常时由 drawPlayer 绘制白色圆球与朝向线
drawPlayer(ctx, player, scene.time, meta);
```

上面代码块中的行首空格在实际文件中去掉，保持与 `renderZombie` 等调用的缩进一致。受击闪白只保留 `globalAlpha` 闪烁，玩家半径、碰撞、移动和伤害数值不变。

同时创建 `docs/superpowers/visual-assets/skins-2026-09-02.md`，记录完整 prompt、三张图集路径、八帧坐标、`promptVersion` 和四维度审美结论；合格版本的记录内容如下：

```markdown
# 主角皮肤资产记录

- Prompt 技能：gpt-image-review
- 模型：k3-256k
- 模板版本：neon-cel-v1
- 原子帧：128×128、透明底、赛璐璐小人
- 图集：每款 512×256，列 down/left/right/up，行 frame 0/1

## 资产

| 皮肤 ID | 文件 | manifest ID | promptVersion |
|---|---|---|---|
| wastelandAdventurer | assets/img/skins/wasteland-adventurer/sprite.png | skin.wastelandAdventurer.sprite / skin.wastelandAdventurer.portrait | neon-cel-v1 |
| neonMercenary | assets/img/skins/neon-mercenary/sprite.png | skin.neonMercenary.sprite / skin.neonMercenary.portrait | neon-cel-v1 |
| nightHunter | assets/img/skins/night-hunter/sprite.png | skin.nightHunter.sprite / skin.nightHunter.portrait | neon-cel-v1 |

## 四维度审美验收

| 资产 | 风格一致性 | 透明底完整性 | 24px 辨识度 | 令牌融合度 | 结论 |
|---|---|---|---|---|---|
| wastelandAdventurer | 通过 | 通过 | 通过 | 通过 | 入库 |
| neonMercenary | 通过 | 通过 | 通过 | 通过 | 入库 |
| nightHunter | 通过 | 通过 | 通过 | 通过 | 入库 |
```

如果某款仍处于失败回退状态，资产表中该款 `promptVersion` 写为 `placeholder-v0`，并明确记录“程序化白色圆球回退已启用”；合格 PNG 入库后再更新为 `neon-cel-v1`，不能让 UI 引用未登记的路径。

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/player.test.js test/skins.test.js`

Expected: PASS（`test/player.test.js` 8 个用例、`test/skins.test.js` 5 个用例），玩家停止帧、移动帧、四向映射、selected sprite ID、无效皮肤警告和图片失败回退全部通过。

Run: `file assets/img/skins/wasteland-adventurer/sprite.png assets/img/skins/neon-mercenary/sprite.png assets/img/skins/night-hunter/sprite.png`

Expected: 三个文件均报告 PNG 图像且尺寸为 `512 x 256`；Node 测试仍只断言 manifest 的尺寸和裁剪字段，不读取像素。

Run: `npm test`

Expected: 全量测试通过，现有 `test/player.test.js` 的移动、碰撞和受伤断言保持绿色。

Run: `npx serve .`

Expected: 用 webbridge 打开本地游戏并截图验证：四方向移动时每款皮肤在两帧之间切换，停止时使用当前方向第 0 帧；将一条 sprite 路径临时改为无效 URL 后刷新，游戏循环继续运行且玩家显示白色圆球与朝向线。

- [ ] **Step 5: 提交**

```bash
git add assets/img/skins/wasteland-adventurer/sprite.png assets/img/skins/neon-mercenary/sprite.png assets/img/skins/night-hunter/sprite.png docs/superpowers/visual-assets/skins-2026-09-02.md src/config/assets.js src/entities/player.js src/entities/render.js src/game.js test/player.test.js test/skins.test.js
git commit -m "UI改造任务19: 接入主角三套皮肤精灵与渲染回退"
```

---

### Task 20: 主菜单外观入口与皮肤选择界面

**Files:**
- Create: `src/ui/skins.js`
- Create: `test/skins-ui.test.js`
- Modify: `src/ui/menu.js:1-27`
- Modify: `src/main.js:7-15,17-25,135-162`
- Modify: `index.html:10-19`
- Modify: `style.css:23-61,88-111`
- Test: `test/skins-ui.test.js`

**Interfaces:**
- Consumes: 任务 18 的 `SKINS`、`defaultMeta()`、`spendGold(meta, n)`、`saveMeta(meta)` 与 `meta.skins`；任务包 3 的 `ASSET_BY_ID` 与 `icon.currency.gold`；任务包 2 的 `getVisualCanvas(id, size, options?)`；现有 `showMenu(rootEl, best, handlers)` 的 `handlers.onAdventure/onEndless/onBestiary/onUpgrades`。
- Produces: `skinView(skin, meta)`；`applySkinAction(meta, skinId)`；`showSkins(rootEl, meta, onBack, onSave)`；主菜单 `handlers.onSkins` 与 `#menu-skins`；`index.html` 的 `#skins.overlay`；外观界面的 `#skin-portrait`、`#skin-action`、`#skins-back`、`#skins-message` 和当前金币显示。预览卡点击只改变局部 `previewId`，只有“选用”或购买成功才改变 `meta.skins.selected`；“取消/返回”只隐藏界面并调用 `onBack()`，不调用 `onSave()`。

- [ ] **Step 1: 写失败测试**

新建 `test/skins-ui.test.js`，只测试纯函数边界和金币/存档状态，不依赖 DOM、Canvas 或 PNG。完整内容：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMeta } from '../src/core/meta.js';
import { SKINS } from '../src/config/skins.js';
import { skinView, applySkinAction } from '../src/ui/skins.js';

function metaWithGold(gold) {
  const meta = defaultMeta();
  meta.gold = gold;
  return meta;
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/skins-ui.test.js`

Expected: FAIL，因 `../src/ui/skins.js` 尚不存在而报告 `ERR_MODULE_NOT_FOUND`；测试尚未进入 DOM 或真实图片路径，失败原因只指向待创建的 UI 纯函数模块。

- [ ] **Step 3: 最小实现**

新建 `src/ui/skins.js`。预览卡不写入 meta；购买与选用统一通过 `applySkinAction`，购买价格只读取 `skin.price.amount`，余额不足时返回精确的 `insufficient-gold`，渲染层把它显示为“购买失败：金币不足”：

```js
// src/ui/skins.js —— 主菜单外观选择（DOM 胶水，设计 §6.4）。
import { SKINS } from '../config/skins.js';
import { spendGold } from '../core/meta.js';
import { ASSET_BY_ID } from '../config/assets.js';
import { getVisualCanvas } from '../core/visuals.js';

const DEFAULT_SKIN_ID = 'wastelandAdventurer';
const GOLD_ICON_ID = 'icon.currency.gold';

export function skinView(skin, meta) {
  const owned = Array.isArray(meta?.skins?.owned) && meta.skins.owned.includes(skin.id);
  const selected = meta?.skins?.selected === skin.id;
  const affordable = owned || (skin.price.currency === 'gold' && meta.gold >= skin.price.amount);
  return {
    id: skin.id,
    name: skin.name,
    description: skin.description,
    portrait: skin.portrait,
    owned,
    selected,
    price: { ...skin.price },
    balance: meta.gold,
    action: selected ? '使用中' : owned ? '选用' : '解锁',
    disabled: selected,
    affordable,
  };
}

export function applySkinAction(meta, skinId) {
  const skin = SKINS[skinId];
  if (!skin) return { ok: false, reason: 'invalid-skin', skinId };
  if (!Array.isArray(meta.skins.owned))
    return { ok: false, reason: 'invalid-meta', skinId };
  if (!meta.skins.owned.includes(skinId)) {
    if (skin.price.currency !== 'gold')
      return { ok: false, reason: 'unsupported-currency', skinId };
    if (!spendGold(meta, skin.price.amount))
      return { ok: false, reason: 'insufficient-gold', skinId };
    meta.skins.owned.push(skinId);
    meta.skins.selected = skinId;
    return { ok: true, action: 'purchased', skinId };
  }
  meta.skins.selected = skinId;
  return { ok: true, action: 'selected', skinId };
}

function mountVisual(host, id, size, options = {}) {
  try {
    host.replaceChildren(getVisualCanvas(id, size, options));
  } catch {
    host.textContent = id === GOLD_ICON_ID ? '金币' : '视觉不可用';
  }
}

function mountPortrait(host, skin) {
  try {
    host.replaceChildren(getVisualCanvas(skin.portrait, 192, {
      frame: { direction: 'down', index: 0 },
    }));
    return;
  } catch {
    const fallback = SKINS[DEFAULT_SKIN_ID];
    if (skin.id !== fallback.id) {
      try {
        host.replaceChildren(getVisualCanvas(fallback.portrait, 192, {
          frame: { direction: 'down', index: 0 },
        }));
        return;
      } catch {
        host.textContent = fallback.name;
        return;
      }
    }
    host.textContent = fallback.name;
  }
}

function currencyMarkup(amount) {
  const label = amount === 0 ? '免费' : `${amount} 金币`;
  return `<span class="skin-currency-icon" data-icon="${GOLD_ICON_ID}" aria-hidden="true"></span>${label}`;
}

export function showSkins(rootEl, meta, onBack, onSave = () => {}) {
  let previewId = SKINS[meta?.skins?.selected] ? meta.skins.selected : DEFAULT_SKIN_ID;
  let message = '';

  const render = () => {
    const current = SKINS[previewId] || SKINS[DEFAULT_SKIN_ID];
    const currentView = skinView(current, meta);
    rootEl.innerHTML = `
      <h2>外观</h2>
      <p id="skins-balance">当前余额：<span class="skin-currency-icon" data-icon="${GOLD_ICON_ID}" aria-hidden="true"></span>${meta.gold} 金币</p>
      <div class="skin-layout">
        <div class="skin-list">
          ${Object.values(SKINS).map(skin => {
            const view = skinView(skin, meta);
            return `
              <button type="button" class="card skin-card${view.selected ? ' selected' : ''}${view.owned ? '' : ' locked'}" data-skin-id="${view.id}">
                <strong>${view.name}</strong>
                <span>${view.owned ? (view.selected ? '使用中' : '已拥有') : currencyMarkup(view.price.amount)}</span>
              </button>`;
          }).join('')}
        </div>
        <div class="card skin-detail">
          <div id="skin-portrait" class="skin-portrait" aria-label="${current.name}立绘"></div>
          <h3 id="skin-name">${current.name}</h3>
          <p id="skin-description">${current.description}</p>
          <p id="skin-price">${currencyMarkup(current.price.amount)}</p>
          <p id="skins-message" class="skin-message">${message}</p>
          <button id="skin-action" class="btn"${currentView.disabled ? ' disabled' : ''}>${currentView.action}</button>
        </div>
      </div>
      <button id="skins-back" class="btn btn-dim">取消</button>
    `;

    mountPortrait(rootEl.querySelector('#skin-portrait'), current);
    for (const icon of rootEl.querySelectorAll('.skin-currency-icon'))
      mountVisual(icon, icon.dataset.icon, 24);

    for (const card of rootEl.querySelectorAll('.skin-card')) {
      card.addEventListener('click', () => {
        previewId = card.dataset.skinId;
        message = '';
        render();
      });
    }

    const action = rootEl.querySelector('#skin-action');
    if (!currentView.disabled) {
      action.addEventListener('click', () => {
        const result = applySkinAction(meta, previewId);
        if (!result.ok) {
          message = result.reason === 'insufficient-gold'
            ? '购买失败：金币不足'
            : '购买失败：皮肤不可用';
          render();
          return;
        }
        onSave();
        message = result.action === 'purchased' ? '解锁成功，已自动选中' : '已选用';
        render();
      });
    }

    rootEl.querySelector('#skins-back').addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onBack();
    });
  };

  rootEl.classList.remove('hidden');
  render();
}

export function skinAssetPath(id) {
  return ASSET_BY_ID[SKINS[id]?.portrait]?.path ?? '';
}
```

`skinAssetPath` 只为 DOM/截图调试提供 manifest 读取出口，不参与购买逻辑；UI 立绘实际通过 `getVisualCanvas` 裁剪同一图集的 down/frame 0，不另维护第二套 PNG。若某款资源读取失败，`mountPortrait` 立即尝试默认荒野冒险家的立绘，两个立绘都失败时显示默认名称，仍不阻止返回主菜单。

修改 `src/ui/menu.js` 为以下完整内容，新增“外观”按钮并保持原有四个 handler 行为：

```js
// src/ui/menu.js —— 主菜单覆盖层（DOM 胶水）。
import { formatTime } from '../systems/hud.js';

export function showMenu(rootEl, best, handlers) {
  const { onAdventure, onEndless, onBestiary, onUpgrades, onSkins } = handlers;
  const rec = (best || {}).endless;
  const bestLine = rec ? `无尽最佳：存活 ${formatTime(rec.time)} / 击杀 ${rec.kills}` : '暂无纪录';
  rootEl.innerHTML = `
    <h1>Zombie Survivor</h1>
    <button id="menu-adventure" class="btn">冒险</button>
    <button id="menu-endless" class="btn">无尽</button>
    <button id="menu-bestiary" class="btn btn-dim">图鉴</button>
    <button id="menu-upgrades" class="btn btn-dim">武器升级</button>
    <button id="menu-skins" class="btn btn-dim">外观</button>
    <p id="menu-best-endless">${bestLine}</p>
  `;
  rootEl.classList.remove('hidden');
  const wire = (id, fn) => rootEl.querySelector('#' + id).addEventListener('click', () => {
    rootEl.classList.add('hidden');
    fn();
  });
  wire('menu-adventure', onAdventure);
  wire('menu-endless', onEndless);
  wire('menu-bestiary', onBestiary);
  wire('menu-upgrades', onUpgrades);
  wire('menu-skins', onSkins);
}
```

在 `index.html:10-19` 加入独立覆盖层，不复用 `upgrades` 节点：

```html
  <canvas id="game" width="1280" height="720"></canvas>
  <div id="menu" class="overlay"></div>
  <div id="pause" class="overlay hidden"></div>
  <div id="shop" class="overlay hidden"></div>
  <div id="gameover" class="overlay hidden"></div>
  <div id="dev" class="overlay hidden"></div>
  <div id="levels" class="overlay hidden"></div>
  <div id="bestiary" class="overlay hidden"></div>
  <div id="upgrades" class="overlay hidden"></div>
  <div id="skins" class="overlay hidden"></div>
  <script type="module" src="src/main.js"></script>
```

在 `src/main.js` 追加 import、元素引用、屏幕切换函数和菜单 handler；meta 继续使用启动时 `loadMeta()` 得到的同一内存对象：

```js
import { showSkins } from './ui/skins.js';
```

```js
const skinsEl = document.getElementById('skins');
```

```js
function showSkinsScreen() {
  hideOverlays();
  currentScene = null;
  showSkins(skinsEl, meta, showMenuScreen, () => saveMeta(meta));
}
```

把 `showMenuScreen()` 的 handler 对象改为：

```js
function showMenuScreen() {
  hideOverlays();
  currentScene = null;
  showMenu(menuEl, loadBest(), {
    onAdventure: showLevelsScreen,
    onEndless: () => startGame('endless'),
    onBestiary: showBestiaryScreen,
    onUpgrades: showUpgradesScreen,
    onSkins: showSkinsScreen,
  });
}
```

在 `style.css` 的菜单/卡片样式之后加入外观布局；全部颜色来自现有 CSS 令牌，不新增颜色体系：

```css
/* 外观（ui/skins.js） */
#skins { justify-content: flex-start; padding-top: 24px; overflow-y: auto; }
#menu #menu-skins { display: block; width: 280px; margin: 8px 0; font-size: 16px; }
.skin-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px;
  width: min(900px, 100%); align-items: start; }
.skin-list { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.skin-card { width: 168px; min-height: 72px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 4px; color: var(--text); }
.skin-card strong { color: var(--gold); font-size: 14px; }
.skin-card span { color: var(--text-dim); font-size: 12px; }
.skin-card.selected { border-color: var(--neon); box-shadow: 0 0 12px rgba(94,255,138,.35); }
.skin-detail { cursor: default; min-height: 360px; }
.skin-detail:hover { border-color: var(--neon-dim); box-shadow: none; }
.skin-portrait { width: 192px; height: 192px; margin: 0 auto 12px; display: flex;
  align-items: center; justify-content: center; border: 1px solid var(--neon-dim);
  border-radius: var(--radius); background: var(--panel); overflow: hidden; }
.skin-portrait canvas { width: 192px; height: 192px; image-rendering: auto; }
.skin-detail h3 { margin: 0 0 8px; color: var(--gold); }
.skin-detail p { margin: 4px 0; }
#skin-price { color: var(--gold); font-weight: bold; }
.skin-currency-icon { display: inline-flex; width: 24px; height: 24px; vertical-align: middle;
  align-items: center; justify-content: center; margin-right: 4px; }
.skin-currency-icon canvas { width: 24px; height: 24px; }
.skin-message { min-height: 18px; color: var(--gold) !important; }
@media (max-width: 720px) {
  .skin-layout { grid-template-columns: 1fr; }
  .skin-detail { order: -1; width: min(320px, 100%); box-sizing: border-box; }
}
```

`取消`按钮的事件只执行 `rootEl.classList.add('hidden')` 与 `onBack()`；卡片点击只更新 `previewId` 并重渲染；“选用”按钮才调用 `applySkinAction`，成功后 `onSave()`，购买成功同时扣金币、加入 `owned`、设置 `selected`。这样即使用户只预览另一款皮肤后取消，当前选中值仍未改变。

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/skins-ui.test.js`

Expected: PASS（5 个用例），默认“使用中”、未拥有“解锁”、余额不足失败不扣款、成功购买自动选中、已有皮肤选用不改变金币均通过。

Run: `npm test`

Expected: 全量测试通过；`src/core/storage.js`、金币收支纯函数和既有武器升级流程没有被外观 UI 改写。

Run: `npx serve .`

Expected: 使用 webbridge 实景核对以下流程并截图：主菜单出现“外观”入口；外观界面显示三张皮肤卡、立绘、名称、描述、金币图标、价格、当前余额和按钮；金币不足点击“解锁”后显示“购买失败：金币不足”；拥有皮肤点击“选用”后显示“使用中”；购买成功立即扣除注册表价格并自动选中；预览未拥有皮肤后点击“取消”返回主菜单，重新进入外观时原 selected 仍保持不变。

- [ ] **Step 5: 提交**

```bash
git add src/ui/skins.js test/skins-ui.test.js src/ui/menu.js src/main.js index.html style.css
git commit -m "UI改造任务20: 新增主菜单外观入口与皮肤选择界面"
```
### Task 21: 怪物组合式 visual 与游戏内统一渲染

**Files:**
- Modify: `src/config/bestiary/monsters.js:6-58`
- Modify: `src/core/visuals.js`（任务包 2 产出文件；当前工作树尚不存在，按 `registerPart`/`drawVisual` 契约修改）
- Modify: `src/entities/render.js:1-70`
- Modify: `src/entities/zombie.js:7-20`
- Test: `test/bestiary.test.js:1-131`

**Interfaces:**
- Consumes: `registerPart(id, drawFn(ctx, size, params, phase))`、`drawVisual(ctx, id, x, y, size, options?)`、`PALETTE`、`EXPLODER_FUSE_TIME`，以及 `z.fuse`/`z.fuseDone` 自爆状态。
- Produces: `MONSTERS[type].visual = { body, scale, palette: { fill, stroke, glow }, parts }`；`PARTS` 中的 `eyes`、`mouth`、`cracks`、`trail`、`spikes`；`renderZombie(ctx, z, timeSec)` 的原签名；`render.js` 兼容导出的 `SHAPES` 与 `PARTS`。组合调用给 `drawVisual` 的选项固定为 `{ visual, phase, lit, fuseProgress, alpha }`。

- [ ] **Step 1: 写失败测试**

将 `test/bestiary.test.js` 顶部的 `render.js` import 改为同时导入 `PARTS`，并新增 `PALETTE` 与 `createZombie` import；将现有“visual.shape/color”断言和“visual.shape 已注册”用例替换为以下完整测试代码，保留其余数值、武器、图鉴视图和难度表用例：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, MAX_ZOMBIE_R, playableMonsters } from '../src/config/bestiary/monsters.js';
import { DIFFICULTY_TIERS } from '../src/config/difficulty.js';
import { WEAPONS, SPECIAL_STATS } from '../src/config/bestiary/weapons.js';
import { weaponUpgradePrice } from '../src/config/economy.js';
import { monsterView, weaponView } from '../src/ui/bestiary.js';
import { PARTS, SHAPES, renderZombie } from '../src/entities/render.js';
import { createZombie } from '../src/entities/zombie.js';
import { PALETTE } from '../src/config/palette.js';

test('怪物清单 5 条：组合式 visual body/palette/parts 完整，逻辑字段保留', () => {
  assert.deepEqual(Object.keys(MONSTERS).sort(), ['boss', 'exploder', 'fast', 'normal', 'tank']);
  const expectedBodies = {
    normal: 'circle', fast: 'triangle', tank: 'hexagon',
    exploder: 'diamond', boss: 'pentagon',
  };
  for (const m of Object.values(MONSTERS)) {
    for (const f of ['hp', 'speed', 'damage', 'coin', 'radius', 'cost'])
      assert.ok(m[f] > 0, `${m.id}.${f} 应为正数`);
    assert.ok(m.knockbackResist >= 0 && m.knockbackResist < 1, `${m.id}.knockbackResist`);
    assert.ok(typeof m.name === 'string' && m.name, `${m.id} 缺名称`);
    assert.ok(typeof m.desc === 'string' && m.desc, `${m.id} 缺图鉴描述`);
    assert.equal(m.visual.body, expectedBodies[m.id], `${m.id}.visual.body`);
    assert.ok(Number.isFinite(m.visual.scale) && m.visual.scale > 0, `${m.id}.visual.scale`);
    assert.deepEqual(Object.keys(m.visual.palette).sort(), ['fill', 'glow', 'stroke']);
    for (const [slot, token] of Object.entries(m.visual.palette))
      assert.equal(typeof PALETTE[token], 'string', `${m.id}.visual.palette.${slot}=${token} 未在 PALETTE 注册`);
    assert.ok(Array.isArray(m.visual.parts) && m.visual.parts.length > 0, `${m.id}.visual.parts`);
    assert.ok(SHAPES[m.visual.body], `${m.id}.visual.body=${m.visual.body} 未注册`);
    for (const part of m.visual.parts)
      assert.ok(PARTS[part.type], `${m.id}.visual.parts.${part.type} 未注册`);
    assert.equal(m.behavior === null || typeof m.behavior === 'string', true);
    assert.equal(m.id in MONSTERS && MONSTERS[m.id] === m, true);
  }
});

test('五种怪物的组合部件符合 §7 轮廓约定，自爆 cracks 密度为 0.3', () => {
  assert.deepEqual(MONSTERS.normal.visual.parts, [
    { type: 'eyes', style: 'angry', count: 2 },
    { type: 'mouth', style: 'crooked' },
    { type: 'cracks', style: 'spots', density: 0.2 },
  ]);
  assert.deepEqual(MONSTERS.fast.visual.parts, [
    { type: 'eyes', style: 'narrow', count: 2 },
    { type: 'trail', style: 'speed' },
  ]);
  assert.deepEqual(MONSTERS.tank.visual.parts, [
    { type: 'spikes', style: 'rim', count: 6 },
    { type: 'mouth', style: 'thick-jaw' },
  ]);
  assert.deepEqual(MONSTERS.exploder.visual.parts, [
    { type: 'cracks', style: 'fuse', density: 0.3 },
    { type: 'spikes', style: 'sparks', count: 4 },
  ]);
  assert.deepEqual(MONSTERS.boss.visual.parts, [
    { type: 'spikes', style: 'multi', count: 10 },
    { type: 'eyes', style: 'wide', count: 3 },
    { type: 'mouth', style: 'glow' },
  ]);
});

function mockCtx() {
  const calls = [];
  return {
    calls,
    globalAlpha: 1,
    lineWidth: 1,
    shadowBlur: 0,
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    translate() { calls.push('translate'); },
    rotate() { calls.push('rotate'); },
    beginPath() { calls.push('beginPath'); },
    closePath() { calls.push('closePath'); },
    moveTo() { calls.push('moveTo'); },
    lineTo() { calls.push('lineTo'); },
    quadraticCurveTo() { calls.push('quadraticCurveTo'); },
    arc() { calls.push('arc'); },
    ellipse() { calls.push('ellipse'); },
    fill() { calls.push('fill'); },
    stroke() { calls.push('stroke'); },
    fillRect() { calls.push('fillRect'); },
    clearRect() { calls.push('clearRect'); },
    drawImage() { calls.push('drawImage'); },
    setLineDash() { calls.push('setLineDash'); },
  };
}

test('renderZombie 使用组合 visual，保留引信 lit、受击闪白与血条绘制', () => {
  const z = createZombie('exploder', 120, 80);
  z.fuse = 0.6;
  z.hitFlash = 0.05;
  z.hp = z.maxHp / 2;
  const ctx = mockCtx();
  assert.doesNotThrow(() => renderZombie(ctx, z, 1.25));
  assert.ok(ctx.calls.includes('fill'), '组合 body/parts 应填充');
  assert.ok(ctx.calls.includes('stroke'), '组合 body/parts 应描边');
  assert.ok(ctx.calls.includes('fillRect'), '受伤后血条应保留');
  assert.equal(z.alive, true);
  assert.equal(z.hp, z.maxHp / 2);
});

test('createZombie 为实体生成稳定视觉相位，不改变数值字段', () => {
  const first = createZombie('normal', 10, 20);
  const sameSeed = createZombie('normal', 10, 20);
  const otherSeed = createZombie('normal', 300, 400);
  assert.equal(first.visualPhase, sameSeed.visualPhase);
  assert.notEqual(first.visualPhase, otherSeed.visualPhase);
  assert.ok(Number.isFinite(first.visualPhase));
  assert.equal(first.hp, 30);
  assert.equal(first.speed, 70);
  assert.equal(first.damage, 8);
});

test('每个怪物的 visual.body 与 visual.parts[].type 都已注册', () => {
  for (const m of Object.values(MONSTERS)) {
    assert.ok(SHAPES[m.visual.body], `${m.id}.visual.body=${m.visual.body} 未注册`);
    for (const part of m.visual.parts)
      assert.ok(PARTS[part.type], `${m.id}.visual.parts[].type=${part.type} 未注册`);
  }
  for (const id of ['circle', 'triangle', 'hexagon', 'pentagon', 'diamond'])
    assert.ok(SHAPES[id], `${id} 基础形状缺失`);
  for (const id of ['eyes', 'mouth', 'cracks', 'trail', 'spikes'])
    assert.ok(PARTS[id], `${id} 怪物部件缺失`);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/bestiary.test.js`

Expected: FAIL with `AssertionError [ERR_ASSERTION]: normal.visual.body`，因为现有 `monsters.js` 仍只有 `visual.shape/color/glow`；在任务包 2 已落地的前提下，下一处失败应指出 `PARTS[eyes]` 尚未注册。

- [ ] **Step 3: 最小实现**

先把 `src/config/bestiary/monsters.js:6-44` 的五条 `visual` 替换为下列配置；所有 hp、speed、damage、coin、radius、knockbackResist、cost、behavior、aoe、special 字段原样保留，`scale` 只影响绘制尺寸：

```js
export const MONSTERS = {
  normal: {
    id: 'normal', name: '普通僵尸', desc: '最基础的感染者，成群结队地涌来。',
    hp: 30, speed: 70, damage: 8, coin: 1,
    radius: 14, knockbackResist: 0, cost: 1,
    visual: {
      body: 'circle', scale: 1,
      palette: { fill: 'ground', stroke: 'neon', glow: 'neonDim' },
      parts: [
        { type: 'eyes', style: 'angry', count: 2 },
        { type: 'mouth', style: 'crooked' },
        { type: 'cracks', style: 'spots', density: 0.2 },
      ],
    },
    behavior: null,
  },
  fast: {
    id: 'fast', name: '高速僵尸', desc: '速度极快的感染者，擅长包抄侧翼。',
    hp: 18, speed: 140, damage: 6, coin: 1,
    radius: 11, knockbackResist: 0, cost: 1,
    visual: {
      body: 'triangle', scale: 0.9,
      palette: { fill: 'gold', stroke: 'neon', glow: 'gold' },
      parts: [
        { type: 'eyes', style: 'narrow', count: 2 },
        { type: 'trail', style: 'speed' },
      ],
    },
    behavior: null,
  },
  tank: {
    id: 'tank', name: '坦克僵尸', desc: '皮糙肉厚的大型感染者，几乎不为击退所动。',
    hp: 220, speed: 40, damage: 20, coin: 5,
    radius: 24, knockbackResist: 0.8, cost: 6,
    visual: {
      body: 'hexagon', scale: 1.3,
      palette: { fill: 'obstacle', stroke: 'gold', glow: 'gold' },
      parts: [
        { type: 'spikes', style: 'rim', count: 6 },
        { type: 'mouth', style: 'thick-jaw' },
      ],
    },
    behavior: null,
  },
  boss: {
    id: 'boss', name: '守门Boss', desc: '守在撤离点的巨型感染者。只在坚守模式最后时刻出现。',
    hp: 7040, speed: 20, damage: 40, coin: 50,
    radius: 41, knockbackResist: 0.95, cost: 999,
    visual: {
      body: 'pentagon', scale: 1.5,
      palette: { fill: 'panel', stroke: 'gold', glow: 'neon' },
      parts: [
        { type: 'spikes', style: 'multi', count: 10 },
        { type: 'eyes', style: 'wide', count: 3 },
        { type: 'mouth', style: 'glow' },
      ],
    },
    behavior: null,
    special: true,
  },
  exploder: {
    id: 'exploder', name: '自爆僵尸', desc: '接近目标后点燃引信，1.2 秒后自爆。趁引信未燃尽将其击毙！',
    hp: 40, speed: 90, damage: 5, coin: 3,
    radius: 13, knockbackResist: 0, cost: 2,
    visual: {
      body: 'diamond', scale: 1.05,
      palette: { fill: 'gold', stroke: 'neon', glow: 'gold' },
      parts: [
        { type: 'cracks', style: 'fuse', density: 0.3 },
        { type: 'spikes', style: 'sparks', count: 4 },
      ],
    },
    behavior: 'exploder',
    aoe: { damage: 30, radius: 80 },
  },
};

export const MAX_ZOMBIE_R = Math.max(...Object.values(MONSTERS).map(z => z.radius));

export function playableMonsters({ includeSpecial = false } = {}) {
  return Object.values(MONSTERS).filter(m => includeSpecial || !m.special);
}

export const EXPLODER_FUSE_TIME = 1.2;
export const EXPLODER_TRIGGER_R = 50;
```

在任务包 2 创建的 `src/core/visuals.js` 中，保持其 `registerPart`、`SHAPES`、`PARTS` 注册表为对象并导出 `PARTS` 供护栏测试读取；在已有 `drawVisual` 函数第一段加入 `options.visual` 分支，并加入以下部件注册与组合绘制代码。`drawVisual` 的常规 shape/image/part 分支和图片失败回退不删除；`getVisualCanvas` 继续把同一个 `options` 传给 `drawVisual`，所以离屏图鉴和场内绘制走同一条分支：

```js
import { PALETTE } from '../config/palette.js';

const warnedMonsterVisuals = new Set();

function warnMonsterVisual(kind, id) {
  const key = `${kind}:${id}`;
  if (warnedMonsterVisuals.has(key)) return;
  warnedMonsterVisuals.add(key);
  console.warn(`未知怪物视觉 ${kind}: ${id}，已使用 circle/占位回退`);
}

function resolveMonsterColor(token, fallback) {
  return typeof token === 'string' && typeof PALETTE[token] === 'string'
    ? PALETTE[token]
    : PALETTE[fallback];
}

function drawMonsterComposite(ctx, x, y, size, visual, options = {}) {
  const scale = Number.isFinite(visual.scale) && visual.scale > 0 ? visual.scale : 1;
  const drawSize = size * scale;
  const radius = drawSize / 2;
  const colors = {
    fill: resolveMonsterColor(visual.palette?.fill, 'ground'),
    stroke: resolveMonsterColor(visual.palette?.stroke, 'neon'),
    glow: resolveMonsterColor(visual.palette?.glow, 'neonDim'),
  };
  const body = SHAPES[visual.body];
  if (!body) warnMonsterVisual('body', visual.body);

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= Number.isFinite(options.alpha) ? options.alpha : 1;
  ctx.fillStyle = options.fillStyle ?? colors.fill;
  ctx.strokeStyle = options.strokeStyle ?? colors.stroke;
  ctx.shadowColor = options.shadowColor ?? colors.glow;
  ctx.shadowBlur = options.shadowBlur ?? 8;
  ctx.lineWidth = options.lineWidth ?? 2;

  (body || SHAPES.circle)(ctx, 0, 0, radius);
  ctx.fill();
  (body || SHAPES.circle)(ctx, 0, 0, radius);
  ctx.stroke();

  const parts = Array.isArray(visual.parts) ? visual.parts : [];
  const phase = Number.isFinite(options.phase) ? options.phase : 0;
  const lit = options.lit === true;
  const fuseProgress = Number.isFinite(options.fuseProgress) ? options.fuseProgress : 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const part of parts) {
      if ((pass === 0) !== (part.type === 'trail')) continue;
      const drawPart = PARTS[part.type];
      if (!drawPart) {
        warnMonsterVisual('part', part.type);
        ctx.save();
        ctx.fillStyle = colors.glow;
        SHAPES.circle(ctx, 0, 0, Math.max(1, radius * 0.12));
        ctx.fill();
        ctx.restore();
        continue;
      }
      drawPart(ctx, drawSize, { ...part, palette: colors, lit, fuseProgress }, phase);
    }
  }
  ctx.restore();
}

registerPart('eyes', (ctx, size, params) => {
  const r = size / 2;
  const count = Math.max(1, Math.trunc(params.count ?? 2));
  const narrow = params.style === 'narrow';
  const eyeColor = params.palette?.glow ?? PALETTE.neon;
  ctx.save();
  ctx.fillStyle = eyeColor;
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * r * 0.9;
    const ey = -r * 0.18;
    const ew = r * (narrow ? 0.13 : 0.18);
    const eh = r * (narrow ? 0.045 : 0.1);
    ctx.beginPath();
    if (params.style === 'angry') {
      ctx.moveTo(offset - ew, ey - eh * 0.4);
      ctx.lineTo(offset + ew, ey + eh * 0.4);
      ctx.lineTo(offset + ew * 0.75, ey + eh * 1.2);
      ctx.lineTo(offset - ew * 0.75, ey + eh * 0.5);
      ctx.closePath();
    } else {
      ctx.ellipse(offset, ey, ew, eh, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
});

registerPart('mouth', (ctx, size, params) => {
  const r = size / 2;
  const style = params.style ?? 'crooked';
  const color = params.lit ? (params.palette?.glow ?? PALETTE.neon) : (params.palette?.stroke ?? PALETTE.neon);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, r * (style === 'thick-jaw' ? 0.1 : 0.06));
  ctx.shadowColor = style === 'glow' ? color : 'transparent';
  ctx.shadowBlur = style === 'glow' ? r * 0.35 : 0;
  ctx.beginPath();
  ctx.moveTo(-r * 0.35, r * 0.2);
  ctx.quadraticCurveTo(0, r * (style === 'thick-jaw' ? 0.5 : 0.35), r * 0.35, r * 0.12);
  ctx.stroke();
  if (style === 'thick-jaw') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, r * 0.38);
    ctx.lineTo(r * 0.28, r * 0.32);
    ctx.stroke();
  }
  if (style === 'glow') {
    ctx.beginPath();
    ctx.arc(0, r * 0.25, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
});

registerPart('cracks', (ctx, size, params, phase) => {
  const r = size / 2;
  const density = Math.max(0, Number(params.density ?? 0.3));
  ctx.save();
  if (params.style === 'spots') {
    const count = Math.max(1, Math.round(density * 10));
    ctx.fillStyle = params.palette?.fill ?? PALETTE.obstacle;
    for (let i = 0; i < count; i++) {
      const angle = (i + 1) * 2.399963229728653;
      const distance = r * (0.2 + ((i * 37) % 10) / 10 * 0.52);
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, Math.max(1, r * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  const count = Math.max(1, Math.round(density * 8));
  const color = params.lit ? (params.palette?.glow ?? PALETTE.gold) : (params.palette?.stroke ?? PALETTE.neon);
  ctx.strokeStyle = color;
  ctx.shadowColor = params.lit ? color : 'transparent';
  ctx.shadowBlur = params.lit ? 6 + 4 * Math.sin(phase) : 0;
  ctx.globalAlpha *= params.lit ? 0.8 + 0.2 * Math.max(0, Math.min(1, params.fuseProgress ?? 0)) : 0.7;
  ctx.lineWidth = Math.max(1, r * 0.045);
  for (let i = 0; i < count; i++) {
    const angle = -1.3 + (i / count) * 2.6;
    const sx = Math.cos(angle) * r * 0.18;
    const sy = Math.sin(angle) * r * 0.18;
    const ex = Math.cos(angle) * r * 0.72;
    const ey = Math.sin(angle) * r * 0.72;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo((sx + ex) / 2 + Math.sin(phase + i) * r * 0.08, (sy + ey) / 2);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.restore();
});

registerPart('trail', (ctx, size, params, phase) => {
  if (params.style !== 'speed') return;
  const r = size / 2;
  ctx.save();
  ctx.strokeStyle = params.palette?.glow ?? PALETTE.gold;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.globalAlpha *= 0.3;
  for (let i = 1; i <= 3; i++) {
    const y = Math.sin(phase * 1.7 + i) * r * 0.08;
    const endX = -r * (0.65 + i * 0.22);
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }
  ctx.restore();
});

registerPart('spikes', (ctx, size, params, phase) => {
  const r = size / 2;
  const style = params.style ?? 'rim';
  const count = Math.max(1, Math.trunc(params.count ?? (style === 'multi' ? 10 : 6)));
  const color = params.lit ? (params.palette?.glow ?? PALETTE.gold) : (params.palette?.stroke ?? PALETTE.gold);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.045);
  if (style === 'sparks') {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (i - (count - 1) / 2) * 0.24 + Math.sin(phase + i) * 0.04;
      const inner = r * 0.82;
      const outer = r * (1.12 + 0.08 * Math.sin(phase * 2 + i));
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
  } else {
    const outer = style === 'multi' ? r * 1.2 : r * 1.14;
    for (let i = 0; i < count; i++) {
      const angle = phase * 0.03 + (i / count) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * r * 0.84, Math.sin(angle) * r * 0.84);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
  }
  ctx.restore();
});
```

`drawVisual` 的入口在注册表常规 shape/part/image 分支之前加入以下 4 行，使 `renderZombie` 与 `getVisualCanvas` 都能消费同一份 descriptor；`getVisualCanvas` 的已有 `canvas.width = size`、`canvas.height = size`、中心点 `size / 2` 和 `id + size` 缓存不改：

```js
if (options.visual) {
  drawMonsterComposite(ctx, x, y, size, options.visual, options);
  return;
}
```

将 `src/entities/render.js:1-70` 的怪物渲染部分替换为：

```js
import { MONSTERS, EXPLODER_FUSE_TIME } from '../config/bestiary/monsters.js';
import { PALETTE } from '../config/palette.js';
import { drawVisual, SHAPES, PARTS } from '../core/visuals.js';
import { TRAIL_MAX } from './projectile.js';

export { SHAPES, PARTS } from '../core/visuals.js';

export function renderZombie(ctx, z, timeSec = 0) {
  const visual = MONSTERS[z.type]?.visual;
  if (!visual) {
    drawVisual(ctx, 'circle', z.x, z.y, z.r * 2, {
      fillStyle: PALETTE.neon,
      strokeStyle: PALETTE.neon,
      shadowColor: PALETTE.neon,
    });
    return;
  }

  const now = Number.isFinite(timeSec) ? timeSec : 0;
  const phase = Number.isFinite(z.visualPhase) ? z.visualPhase : 0;
  const fuseLit = z.fuse !== undefined && !z.fuseDone;
  const fuseProgress = fuseLit
    ? Math.max(0, Math.min(1, z.fuse / EXPLODER_FUSE_TIME))
    : 0;
  const breathing = 1 + 0.04 * Math.sin(now * 4 + phase);
  const bob = Math.sin(now * 8 + phase) * Math.min(1.5, z.r * 0.08);
  let size = z.r * 2 * breathing;
  let alpha = 1;
  if (fuseLit) {
    size *= 1 + 0.25 * fuseProgress;
    alpha = 0.55 + 0.45 * Math.sin(now * 30 + phase);
  }

  drawVisual(ctx, z.type, z.x, z.y + bob, size, {
    visual,
    phase: now * 8 + phase,
    lit: fuseLit,
    fuseProgress,
    alpha,
  });

  if (z.hitFlash > 0) {
    const scaledSize = size * (Number.isFinite(visual.scale) ? visual.scale : 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, z.hitFlash / 0.1);
    drawVisual(ctx, visual.body, z.x, z.y + bob, scaledSize, {
      fillStyle: PALETTE.text,
      strokeStyle: PALETTE.text,
      shadowColor: PALETTE.text,
      shadowBlur: 0,
    });
    ctx.restore();
  }

  if (z.hp < z.maxHp) {
    const bw = z.r * 2;
    const bh = 3;
    const x = z.x - bw / 2;
    const y = z.y - z.r - 8;
    ctx.fillStyle = PALETTE.obstacle;
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = PALETTE.neon;
    ctx.fillRect(x, y, bw * Math.max(0, z.hp / z.maxHp), bh);
  }
}
```

在 `src/entities/zombie.js:7-20` 的 `createZombie` 前加入稳定哈希，并仅给实体新增视觉字段；不要改 `updateZombie`、`damageZombie` 或任何数值：

```js
function visualPhaseFor(typeId, x, y) {
  const seed = `${typeId}:${Math.round(x)}:${Math.round(y)}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

export function createZombie(typeId, x, y, opts = {}) {
  const c = MONSTERS[typeId];
  const s = calcMonsterStats(c, opts);
  return {
    type: typeId, x, y, r: c.radius,
    hp: s.hp, maxHp: s.hp,
    speed: s.speed, damage: s.damage, coin: s.coin,
    knockbackResist: c.knockbackResist,
    behavior: c.behavior || null,
    aoe: c.aoe ? { damage: s.aoeDamage, radius: c.aoe.radius } : undefined,
    fuseDone: false,
    counted: false,
    visualPhase: visualPhaseFor(typeId, x, y),
    kbx: 0, kby: 0, hitFlash: 0, alive: true,
  };
}
```

`src/systems/behaviors.js` 不改；`renderZombie` 只读取既有的 `fuse`/`fuseDone`，由 `cracks` 部件接收 `lit` 与 `fuseProgress`，不改变引信计时、AoE、hp、alive 或死亡粒子。若为轮廓校准生成概念图，调用 `gpt-image-review` 技能使用 k3-256k 的 `neon-cel-v1` 模板，先生成 1 张代表性怪物样图，再按风格一致性、透明底完整性、缩小辨识度、霓绿/金令牌融合度四维验收；概念稿只归档到 `docs/` 审美参考，不进入 `assets/img/` 或 manifest，生成失败直接使用上述程序化组合，不增加逐怪图片分支。

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/bestiary.test.js`

Run: `npm test`

Expected: 两条命令均 PASS；现有武器、数值、行为、战斗测试继续通过，且没有修改音频、`src/core/storage.js`、武器伤害公式、怪物 AI、碰撞或经济数值。

用 webbridge 启动 `npm start` 后进入无尽模式，在开发者入口或无尽高档触发五种怪物，截图核对圆/三角/六边/菱形/五边 body、部件层次、呼吸缩放、上下颠簸、不同实体不同相位、自爆引信时 cracks 变亮、受击闪白和受伤血条；确认死亡碎裂粒子仍由原有清理/击杀路径触发。

- [ ] **Step 5: 提交**

```bash
git add src/config/bestiary/monsters.js src/core/visuals.js src/entities/render.js src/entities/zombie.js test/bestiary.test.js
git commit -m "UI改造任务21: 怪物组合式视觉与游戏内统一渲染"
```

### Task 22: 图鉴同源离屏渲染与武器图标卡片

**Files:**
- Modify: `src/ui/bestiary.js:1-68`
- Modify: `style.css:102-111`
- Test: `test/bestiary.test.js:1-131`

**Interfaces:**
- Consumes: `getVisualCanvas(id, size, options?) → canvas`、`clearCaches()`、任务包 21 的 `MONSTERS[type].visual` 与 `renderZombie(ctx, z, timeSec)`、任务包 3 的 `WEAPONS[*].icon` 与 `ASSET_BY_ID`。
- Produces: `monsterView(m, bestiaryKills)` 在解锁时返回同一引用的 `visual`、未解锁时不返回 body/parts/palette；`weaponView(w, weaponLevels)` 返回 `icon`；`BESTIARY_VISUAL_SIZES = [24, 32, 48, 64]`；`showBestiary` 使用 `getVisualCanvas` 替换视觉占位节点，不再输出 `.bestiary-swatch`，并对未知/失败图片继续使用 visuals 注册表的 circle 占位回退。

- [ ] **Step 1: 写失败测试**

沿用任务 21 已加入的 `renderZombie` import，在 `test/bestiary.test.js` 追加 `showBestiary`、`getVisualCanvas`、`clearCaches`、`BESTIARY_VISUAL_SIZES` 的 import，并追加以下完整 Node 测试；它只检查字段、DOM 节点和离屏 canvas 尺寸，不读取 PNG 像素：

```js
import { showBestiary, BESTIARY_VISUAL_SIZES } from '../src/ui/bestiary.js';
import { getVisualCanvas, clearCaches } from '../src/core/visuals.js';

function mockUiCtx() {
  return {
    globalAlpha: 1,
    lineWidth: 1,
    shadowBlur: 0,
    save() {}, restore() {}, translate() {}, rotate() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, arc() {}, ellipse() {},
    fill() {}, stroke() {}, fillRect() {}, clearRect() {}, drawImage() {},
    setLineDash() {},
  };
}

function mockCanvas() {
  const ctx = mockUiCtx();
  return {
    width: 0,
    height: 0,
    style: {},
    className: '',
    getContext() { return ctx; },
    setAttribute() {},
    toDataURL() { return 'data:image/png;base64,placeholder'; },
  };
}

function mockBestiaryDom() {
  const handlers = new Map();
  const root = {
    _html: '',
    _replaced: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    set innerHTML(value) {
      this._html = value;
      this._replaced = [];
    },
    get innerHTML() { return this._html; },
    querySelector(selector) {
      if (selector.startsWith('#')) {
        return {
          addEventListener: (_event, handler) => handlers.set(selector, handler),
        };
      }
      const match = selector.match(/\[data-visual-slot="([^"]+)"\]/);
      if (match) {
        return {
          replaceWith: node => this._replaced.push({ slot: match[1], node }),
        };
      }
      return null;
    },
  };
  const documentMock = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return mockCanvas();
    },
  };
  return { root, documentMock, handlers };
}

test('图鉴视图：未遭遇不泄露 visual，已遭遇返回配置中的同源 visual', () => {
  const locked = monsterView(MONSTERS.exploder, {});
  assert.equal(locked.unlocked, false);
  assert.equal('visual' in locked, false);
  assert.equal('color' in locked, false);
  assert.equal('parts' in locked, false);

  const seen = monsterView(MONSTERS.exploder, { exploder: 1 });
  assert.equal(seen.unlocked, true);
  assert.strictEqual(seen.visual, MONSTERS.exploder.visual);
  assert.equal(seen.visual.body, 'diamond');
  assert.equal(seen.visual.parts[0].type, 'cracks');
});

test('武器图鉴视图使用武器本体 icon，不暴露弹道 color 作为图标', () => {
  for (const w of Object.values(WEAPONS)) {
    assert.equal(w.icon, `icon.weapon.${w.id}`, `${w.id}.icon`);
    const view = weaponView(w, {});
    assert.equal(view.icon, w.icon);
    assert.equal('color' in view, false);
  }
});

test('图鉴通过 getVisualCanvas 使用 24/32/48/64 档位，卡片不再生成 swatch', () => {
  assert.deepEqual(BESTIARY_VISUAL_SIZES, [24, 32, 48, 64]);
  const { root, documentMock, handlers } = mockBestiaryDom();
  const previousDocument = globalThis.document;
  globalThis.document = documentMock;
  clearCaches();
  try {
    for (const size of BESTIARY_VISUAL_SIZES) {
      const canvas = getVisualCanvas('normal', size, { visual: MONSTERS.normal.visual });
      assert.equal(canvas.width, size);
      assert.equal(canvas.height, size);
    }
    showBestiary(root, {
      bestiaryKills: { normal: 1 },
      weaponLevels: {},
    }, () => {});
    assert.doesNotMatch(root.innerHTML, /bestiary-swatch/);
    assert.match(root.innerHTML, /data-visual-slot="monster-normal"/);
    assert.ok(root._replaced.some(({ slot, node }) =>
      slot === 'monster-normal' && node.width === 48 && node.height === 48));
    assert.doesNotMatch(root.innerHTML, /data-visual-slot="monster-exploder"/);
    assert.equal(root._replaced.some(({ slot }) => slot === 'monster-exploder'), false);

    handlers.get('#bestiary-tab-weapons')();
    assert.doesNotMatch(root.innerHTML, /bestiary-swatch/);
    assert.ok(root._replaced.some(({ slot, node }) =>
      slot === 'weapon-pistol' && node.width === 48 && node.height === 48));
  } finally {
    clearCaches();
    globalThis.document = previousDocument;
  }
});

test('新增仅复用已注册部件的怪物配置时，图鉴与游戏内渲染无需新增分支', () => {
  const extension = {
    id: 'scout',
    name: '侦察僵尸',
    desc: '只复用既有眼睛与嘴部部件的扩展条目。',
    hp: 25, speed: 100, damage: 7, coin: 2,
    radius: 12, knockbackResist: 0.1, cost: 2,
    visual: {
      body: 'circle', scale: 0.95,
      palette: { fill: 'ground', stroke: 'neon', glow: 'neonDim' },
      parts: [
        { type: 'eyes', style: 'angry', count: 2 },
        { type: 'mouth', style: 'crooked' },
      ],
    },
    behavior: null,
  };
  MONSTERS.scout = extension;
  const { root, documentMock } = mockBestiaryDom();
  const previousDocument = globalThis.document;
  globalThis.document = documentMock;
  clearCaches();
  try {
    assert.ok(playableMonsters({ includeSpecial: true }).some(m => m.id === 'scout'));
    const view = monsterView(extension, { scout: 2 });
    assert.equal(view.unlocked, true);
    assert.strictEqual(view.visual, extension.visual);
    showBestiary(root, { bestiaryKills: { scout: 2 }, weaponLevels: {} }, () => {});
    assert.ok(root._replaced.some(({ slot }) => slot === 'monster-scout'));

    const ctx = mockUiCtx();
    const z = { type: 'scout', x: 0, y: 0, r: 12, hp: 25, maxHp: 25, hitFlash: 0, visualPhase: 0 };
    assert.doesNotThrow(() => renderZombie(ctx, z, 1));
  } finally {
    clearCaches();
    globalThis.document = previousDocument;
    delete MONSTERS.scout;
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/bestiary.test.js`

Expected: FAIL with `undefined !== 'icon.weapon.pistol'`，因为当前 `weaponView` 没有把任务包 3 已提供的 `w.icon` 放入视图模型；随后现有 HTML 仍会命中 `.bestiary-swatch`，且没有可由 `getVisualCanvas` 替换的视觉 slot。

- [ ] **Step 3: 最小实现**

先确认任务包 3 的 manifest 已覆盖所有武器本体 icon：

```bash
node --input-type=module -e "import { WEAPONS } from './src/config/bestiary/weapons.js'; import { ASSET_BY_ID } from './src/config/assets.js'; for (const w of Object.values(WEAPONS)) { if (w.icon !== 'icon.weapon.' + w.id) throw new Error(w.id + ' icon 字段错误'); if (!ASSET_BY_ID[w.icon]) throw new Error(w.icon + ' 未登记到 ASSET_BY_ID'); }"
```

本任务不新增怪物 PNG；武器 icon 只消费前置 manifest。若某个 icon 生成失败，按 `gpt-image-review` 技能使用 k3-256k 的 `neon-cel-v1` 模板，先生成 1 张武器 icon 样图并完成四维审美验收，再批量生成；合格 PNG 入库到 `assets/img/icons/weapons/`，同时登记 `size: 128`、manifest `id`、`path`、`promptVersion: 'neon-cel-v1'`。失败版本不被 UI 引用；在补图前保留同一 manifest ID 的程序化占位回退并登记 `promptVersion: 'placeholder-v0'`，后续只替换 manifest 的 `path`/`promptVersion`，不在图鉴代码中增加按武器 ID 的分支。

将 `src/ui/bestiary.js:1-68` 替换为下列实现。`BESTIARY_VISUAL_SIZE` 固定使用 48，所有可选离屏尺寸集中在 `BESTIARY_VISUAL_SIZES`；怪物 slot 传入 `visual: v.visual`，武器 slot 传入 `v.icon`，二者均经 `getVisualCanvas` 生成同尺寸 canvas 后替换占位节点：

```js
import { playableMonsters } from '../config/bestiary/monsters.js';
import { WEAPONS } from '../config/bestiary/weapons.js';
import { getVisualCanvas } from '../core/visuals.js';

export const BESTIARY_VISUAL_SIZES = Object.freeze([24, 32, 48, 64]);
const BESTIARY_VISUAL_SIZE = 48;

export function monsterView(m, bestiaryKills) {
  const kills = bestiaryKills[m.id] ?? 0;
  if (kills < 1) return { id: m.id, unlocked: false, name: '???', kills: 0 };
  return {
    id: m.id,
    unlocked: true,
    name: m.name,
    desc: m.desc,
    visual: m.visual,
    kills,
    stats: { hp: m.hp, speed: m.speed, damage: m.damage, coin: m.coin },
  };
}

export function weaponView(w, weaponLevels) {
  const level = weaponLevels[w.id] ?? 0;
  return {
    id: w.id,
    name: w.name,
    desc: w.desc,
    icon: w.icon,
    level,
    maxed: level >= 10,
    damage: w.damage,
    nextDamage: w.damage * (1 + 0.2 * (level + 1)),
    nextDelta: Math.round(w.damage * 0.2),
    stats: { fireRate: w.fireRate, range: w.range, pierce: w.pierce },
  };
}

function mountVisualSlots(rootEl, slots) {
  for (const slot of slots) {
    const target = rootEl.querySelector(`[data-visual-slot="${slot.key}"]`);
    if (!target) continue;
    const canvas = getVisualCanvas(slot.id, slot.size, slot.options);
    canvas.className = 'bestiary-visual';
    canvas.setAttribute?.('aria-hidden', 'true');
    target.replaceWith(canvas);
  }
}

export function showBestiary(rootEl, meta, onBack) {
  const render = tab => {
    const monsterCards = playableMonsters().map(m => monsterView(m, meta.bestiaryKills));
    const weaponCards = Object.values(WEAPONS).map(w => weaponView(w, meta.weaponLevels));
    const slots = [];
    const visualSlot = (key, id, options = {}) => {
      slots.push({ key, id, size: BESTIARY_VISUAL_SIZE, options });
      return `<span class="bestiary-visual-slot" data-visual-slot="${key}" aria-hidden="true"></span>`;
    };

    rootEl.innerHTML = `
      <h2>图鉴</h2>
      <div class="bestiary-tabs">
        <button id="bestiary-tab-monsters" class="btn${tab === 'monsters' ? ' active' : ' btn-dim'}">怪物</button>
        <button id="bestiary-tab-weapons" class="btn${tab === 'weapons' ? ' active' : ' btn-dim'}">武器</button>
      </div>
      <div class="bestiary-grid">
        ${tab === 'monsters' ? monsterCards.map(v => v.unlocked ? `
          <div class="card bestiary-card">
            ${visualSlot(`monster-${v.id}`, v.id, { visual: v.visual })}
            <h4>${v.name}</h4><p>${v.desc}</p>
            <p>HP ${v.stats.hp} · 速度 ${v.stats.speed} · 伤害 ${v.stats.damage} · 银币 ${v.stats.coin}</p>
            <p>累计击杀 ${v.kills}</p>
          </div>` : `
          <div class="card bestiary-card locked">
            <span class="bestiary-lock" aria-hidden="true">?</span>
            <h4>???</h4><p>尚未遭遇</p>
          </div>`).join('')
        : weaponCards.map(v => `
          <div class="card bestiary-card">
            ${visualSlot(`weapon-${v.id}`, v.icon)}
            <h4>${v.name}</h4><p>${v.desc}</p>
            <p>伤害 ${v.damage} · 射速 ${v.stats.fireRate}/s · 射程 ${v.stats.range}</p>
            <p>局外等级 Lv ${v.level}/10${v.maxed ? '（已满级）' : ` · 下一级伤害 +${v.nextDelta}`}</p>
          </div>`).join('')}
      </div>
      <p class="bestiary-note">图鉴数值为基础值（关卡 1、局内 0 分钟口径）；局内实际值随关卡与时间增长。</p>
      <button id="bestiary-back" class="btn btn-dim">返回</button>
    `;
    mountVisualSlots(rootEl, slots);
    rootEl.querySelector('#bestiary-tab-monsters').addEventListener('click', () => render('monsters'));
    rootEl.querySelector('#bestiary-tab-weapons').addEventListener('click', () => render('weapons'));
    rootEl.querySelector('#bestiary-back').addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onBack();
    });
  };
  rootEl.classList.remove('hidden');
  render('monsters');
}
```

将 `style.css:102-111` 的图鉴样式替换为下列内容，删除 `.bestiary-swatch` 规则；锁定卡继续复用 `.card.locked` 的面板、边框、hover 和透明度，不创建一套泄露怪物配色的剪影：

```css
/* 图鉴（ui/bestiary.js） */
.bestiary-tabs { display: flex; gap: 8px; }
.bestiary-tabs .btn.active { box-shadow: 0 0 12px rgba(94,255,138,.45); color: #c8ffd9; }
.bestiary-grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
  max-width: 1064px; }
.bestiary-card { width: 200px; cursor: default; }
.bestiary-card:hover { border-color: var(--neon-dim); box-shadow: none; }
.bestiary-visual,
.bestiary-visual-slot,
.bestiary-lock { width: 48px; height: 48px; margin: 0 auto 8px; }
.bestiary-visual { display: block; }
.bestiary-visual-slot,
.bestiary-lock { display: grid; place-items: center;
  border: 1px solid var(--neon-dim); border-radius: var(--radius); }
.bestiary-lock { box-sizing: border-box; color: var(--text-dim); font-size: 24px;
  background: var(--bg); }
.bestiary-note { font-size: 12px; }
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/bestiary.test.js`

Run: `npm test`

Expected: 两条命令均 PASS；已解锁怪物卡能得到 48×48 的 `getVisualCanvas` canvas，未遭遇卡没有 body、parts、palette 或配色 slot，武器卡的 `icon` 来自 `icon.weapon.<id>`，且旧 projectile `visual` 字段和升级数值断言不变。

用 webbridge 启动 `npm start`，打开图鉴的怪物页和武器页截图：已遭遇怪物应与场内组合形象同源，未遭遇项统一显示 `???`/锁定图标且不泄露轮廓或颜色，武器卡显示透明 PNG/回退占位而不是色块；切换两个 tab 后确认 slot 不重复生成，24/32/48/64 四档接口可用。

- [ ] **Step 5: 提交**

```bash
git add src/ui/bestiary.js style.css test/bestiary.test.js
git commit -m "UI改造任务22: 图鉴复用同源视觉并接入武器图标"
```
### Task 23: 结算、暂停、关卡选择图标与 tooltip 收尾

**Files:**
- Create: `src/ui/icons.js`
- Modify: `src/ui/gameover.js:1-43`
- Modify: `src/ui/pause.js:1-44`
- Modify: `src/ui/levels.js:1-38`
- Modify: `style.css:23-121`
- Modify: `test/settlement.test.js:1-47`
- Modify: `test/shop-ui.test.js:1-64`
- Test: `test/settlement.test.js`, `test/shop-ui.test.js`

**Interfaces:**
- Consumes: `ASSET_BY_ID`、`getVisualCanvas(id, size, options?)`、`showGameOver(rootEl, stats, isNew, handlers)`、`showPause(rootEl, settings, handlers)`、`showLevels(rootEl, meta, onStart, onBack)`；继续使用任务包 3/6/7 已接入的商店、升级、HUD、图鉴和外观 tooltip 节点。
- Produces: `createIconMarkup(id, label, size = 32)`、`bindIconFallback(rootEl)`；结算奖励和关卡奖励使用 `data-visual-id="icon.currency.gold"`，商店/其他已有界面中的每个 `data-visual-id` 必须存在于 `ASSET_BY_ID`，不新增临时 emoji/文字符号图标。

- [ ] **Step 1: 写失败测试**

先把结算协议测试扩展为同时覆盖三个收尾 DOM 面板，并让商店 UI 测试只检查图标节点、manifest ID 和 tooltip 节点，不读取 PNG 像素。完整的 `test/settlement.test.js` 如下：

```js
// test/settlement.test.js —— 结算协议与收尾界面图标契约。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameScene } from '../src/game.js';
import { createZombie } from '../src/entities/zombie.js';
import { showGameOver } from '../src/ui/gameover.js';
import { showPause } from '../src/ui/pause.js';
import { showLevels } from '../src/ui/levels.js';
import { ASSET_BY_ID } from '../src/config/assets.js';
import { ADVENTURE_LEVELS } from '../src/config/adventure.js';

function makeScene() {
  const canvas = { width: 800, height: 600 };
  const input = { state: {} };
  const onGameOver = () => {};
  return createGameScene({ canvas, input, mode: 'endless', audio: null, settings: {}, meta: null, onGameOver });
}

function makeRoot() {
  const handlers = new Map();
  const classes = new Set(['hidden']);
  return {
    innerHTML: '',
    _handlers: handlers,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    querySelector(selector) {
      assert.match(selector, /^#/);
      return {
        addEventListener(type, fn) { handlers.set(selector.slice(1), { type, fn }); },
      };
    },
    querySelectorAll() { return []; },
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\\\]/g, '\\$&');
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
```

完整的 `test/shop-ui.test.js` 如下；递归收集 mock DOM 的 `innerHTML`，只对 `data-visual-id`、`ASSET_BY_ID` 和 tooltip 属性做契约断言：

```js
// test/shop-ui.test.js —— showShop 图标/manifest/tooltip 渲染链路。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_BY_ID } from '../src/config/assets.js';

function mockDom() {
  const el = () => ({
    className: '', textContent: '', innerHTML: '', _kids: [], dataset: {},
    appendChild(n) { this._kids.push(n); },
    addEventListener() {},
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name] ?? null; },
    replaceWith() {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    replaceChildren(...ns) { this._kids = ns; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const root = el();
  const doc = {
    getElementById: id => (id === 'shop' ? root : null),
    createElement: el,
    querySelectorAll: () => [],
  };
  return { root, doc };
}

function collectHtml(node) {
  return [node.innerHTML, ...node._kids.flatMap(collectHtml)].join('\n');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\\\]/g, '\\$&');
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
  assert.ok(groupsWrap._kids.length >= 5, `分组行 ${groupsWrap._kids.length} 应 ≥5`);

  const html = collectHtml(root);
  const ids = [...html.matchAll(/data-visual-id=["']([^"']+)["']/g)].map(m => m[1]);
  assert.ok(ids.length >= 6, `商店至少应渲染 6 个图标节点，实际 ${ids.length}`);
  for (const id of ids) assert.ok(ASSET_BY_ID[id], `${id} 不在 ASSET_BY_ID`);
  for (const id of [
    'icon.currency.silver', 'icon.weapon.pistol', 'icon.weapon.rifle',
    'icon.aux.drone', 'icon.enhance.damage', 'icon.item.medkit',
  ]) {
    assert.ok(ASSET_BY_ID[id], `${id} 必须先登记 manifest`);
    assert.match(html, new RegExp(`data-visual-id=["']${escapeRegExp(id)}["']`), `${id} 未显示`);
  }
  assert.ok((html.match(/data-tooltip=/g) || []).length >= 6, '商店条目必须覆盖 tooltip');
});
```

**Step 2: 运行确认失败**

Run: `node --test test/settlement.test.js test/shop-ui.test.js`

Expected: FAIL；在前序任务已提供 `assets.js` 后，新增断言首先报告现有收尾 HTML 缺少 `data-visual-id="icon.currency.gold"`，商店断言报告缺少 `icon.currency.silver` 或 `data-tooltip`。测试只读取 HTML 属性和 manifest，不会因为 PNG 像素或解码结果失败。

**Step 3: 最小实现**

本任务不新增 PNG；先复用任务包 3 已登记的 `icon.currency.gold`、`icon.currency.silver` 及已有 UI 图标。若浏览器加载既有图片失败，`bindIconFallback` 立即改用 `getVisualCanvas` 的程序化 circle 占位并保留一次可见的 `console.warn`；不为结算、暂停、关卡选择另造 emoji 或 Canvas 临时符号。只有发现 manifest 中确实缺少既有资产时，才按资产流程处理：用 `gpt-image-review` 调用 k3-256k，严格使用 `neon-cel-v1` 模板，先出 1 张样图再批量生成；逐张按风格一致性、透明底完整性、缩小辨识度、霓虹/金色令牌融合度四维验收，合格后入库并登记 manifest，失败版本继续使用 `promptVersion: 'placeholder-v0'` 的程序化占位，补图后替换登记。

创建 `src/ui/icons.js`：

```js
// src/ui/icons.js —— DOM 图标标签与图片失败回退。
import { ASSET_BY_ID } from '../config/assets.js';
import { getVisualCanvas } from '../core/visuals.js';

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
}

export function createIconMarkup(id, label, size = 32) {
  const safeId = escapeAttr(id);
  const safeLabel = escapeAttr(label);
  const safeSize = Math.max(1, Math.round(Number(size) || 32));
  const asset = ASSET_BY_ID[id];
  if (!asset) {
    return `<span class="ui-icon ui-icon-fallback" data-visual-id="${safeId}" data-icon-size="${safeSize}" role="img" aria-label="${safeLabel}"></span>`;
  }
  return `<img class="ui-icon" data-visual-id="${safeId}" data-icon-size="${safeSize}" src="${escapeAttr(asset.path)}" width="${safeSize}" height="${safeSize}" alt="${safeLabel}" loading="eager">`;
}

function replaceWithFallback(node) {
  const id = node.dataset.visualId;
  const size = Math.max(1, Math.round(Number(node.dataset.iconSize || node.getAttribute('width') || 32)));
  const canvas = getVisualCanvas(id, size);
  if (!canvas || typeof node.replaceWith !== 'function') return;
  canvas.className = 'ui-icon';
  canvas.dataset.visualId = id;
  canvas.dataset.iconSize = String(size);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', node.getAttribute('aria-label') || node.alt || id);
  node.replaceWith(canvas);
}

export function bindIconFallback(rootEl) {
  for (const node of rootEl.querySelectorAll('[data-visual-id]')) {
    if (node.tagName === 'IMG') {
      node.addEventListener('error', () => replaceWithFallback(node), { once: true });
    } else if (node.classList?.contains('ui-icon-fallback')) {
      replaceWithFallback(node);
    }
  }
}
```

完整替换 `src/ui/gameover.js`：

```js
// src/ui/gameover.js —— 结算覆盖层（DOM 胶水）。
import { formatTime } from '../systems/hud.js';
import { createIconMarkup, bindIconFallback } from './icons.js';

export function showGameOver(rootEl, stats, isNew, handlers) {
  const { onRestart, onMenu, onLevels } = handlers;
  const cleared = !!stats.cleared;
  const isAdventure = stats.mode === 'adventure';
  const gold = Number.isFinite(stats.gold) ? stats.gold : 0;
  const rewardText = `金币 +${gold}${stats.firstClear ? '（首通奖励 ×2）' : ''}`;
  const rewardTip = `金币奖励：${rewardText}`;
  rootEl.innerHTML = isAdventure ? `
    <h2>${cleared ? '通关！' : '任务失败'}</h2>
    <p>${cleared ? '撑满了 6 分钟，成功通关！' : '存活时间：' + formatTime(stats.time)}</p>
    <p>击杀数：${stats.kills}</p>
    <p class="settlement-reward" data-tooltip="${rewardTip}">${createIconMarkup('icon.currency.gold', '金币')}<span>${rewardText}</span></p>
    <button id="gameover-restart" class="btn">重开本关</button>
    <button id="gameover-levels" class="btn btn-dim">回关卡选择</button>
    <button id="gameover-menu" class="btn btn-dim">回主菜单</button>
  ` : `
    <h2>${cleared ? '救援成功！' : '游戏结束'}</h2>
    ${cleared ? '<p style="color:#4d4">直升机已抵达，你活着离开了尸潮。剩余 HP：' + stats.hp + '</p>' : ''}
    ${isNew ? '<p style="color:#ffd75e;font-size:24px">新纪录！</p>' : ''}
    <p>${cleared ? '用时' : '存活时间'}：${formatTime(stats.time)}</p>
    <p>击杀数：${stats.kills}</p>
    <button id="gameover-restart" class="btn">再来一局</button>
    <button id="gameover-menu" class="btn btn-dim">回主菜单</button>
  `;
  rootEl.classList.remove('hidden');
  bindIconFallback(rootEl);
  rootEl.querySelector('#gameover-restart').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onRestart();
  });
  rootEl.querySelector('#gameover-menu').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onMenu();
  });
  if (isAdventure) {
    rootEl.querySelector('#gameover-levels').addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onLevels();
    });
  }
}
```

完整替换 `src/ui/pause.js`；暂停没有语义对应的既有图片资产，保留文字按钮，不伪造 action icon，但给每个设置控件补 DOM tooltip：

```js
// src/ui/pause.js —— Esc 暂停菜单（DOM 胶水）。
export function showPause(rootEl, settings, handlers) {
  const { onResume, onQuit, onChange } = handlers;
  rootEl.innerHTML = `
    <h2>暂停</h2>
    <div class="pause-row">
      <label data-tooltip="音量：调整游戏音量">
        音量 <input id="pause-volume" type="range" min="0" max="100"
          value="${Math.round(settings.volume * 100)}" aria-label="音量">
      </label>
    </div>
    <div class="pause-row">
      <label data-tooltip="伤害数字：显示或隐藏战斗伤害数字">
        <input id="pause-damage" type="checkbox"${settings.damageNumbers ? ' checked' : ''}> 伤害数字
      </label>
    </div>
    <div class="pause-row">
      <label data-tooltip="震屏：受击和爆炸时启用或关闭屏幕震动">
        <input id="pause-shake" type="checkbox"${settings.screenShake ? ' checked' : ''}> 震屏
      </label>
    </div>
    <div class="pause-buttons">
      <button id="pause-resume" class="btn" title="继续游戏">继续</button>
      <button id="pause-quit" class="btn btn-dim" title="回主菜单">回主菜单</button>
    </div>
  `;
  rootEl.classList.remove('hidden');

  rootEl.querySelector('#pause-resume').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onResume();
  });
  rootEl.querySelector('#pause-quit').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onQuit();
  });
  rootEl.querySelector('#pause-volume').addEventListener('input', e => {
    onChange({ ...settings, volume: Number(e.target.value) / 100 });
  });
  rootEl.querySelector('#pause-damage').addEventListener('change', e => {
    onChange({ ...settings, damageNumbers: e.target.checked });
  });
  rootEl.querySelector('#pause-shake').addEventListener('change', e => {
    onChange({ ...settings, screenShake: e.target.checked });
  });
}
```

完整替换 `src/ui/levels.js`：

```js
// src/ui/levels.js —— 冒险关卡选择（设计 §3.1/§8）。
import { ADVENTURE_LEVELS } from '../config/adventure.js';
import { formatTime } from '../systems/hud.js';
import { createIconMarkup, bindIconFallback } from './icons.js';

export function showLevels(rootEl, meta, onStart, onBack) {
  const unlockedMax = Math.min(meta.adventure.unlocked, ADVENTURE_LEVELS.length);
  rootEl.innerHTML = `
    <h2>冒险模式</h2>
    <p class="levels-balance" data-tooltip="金币余额：当前可用于关卡奖励和外观解锁的金币">${createIconMarkup('icon.currency.gold', '金币')}<span>金币余额：${meta.gold}</span></p>
    <div class="level-cards">
      ${ADVENTURE_LEVELS.map((lv, i) => {
        const unlocked = unlockedMax >= i + 1;
        const best = meta.adventure.bestTimes[lv.id];
        const bestText = !best ? '' : best.cleared ? '已通关' : `最佳：存活 ${formatTime(best.timeSec)}`;
        const rewardText = `通关奖励 ${lv.goldReward} 金币（首通 ×2）`;
        return `
          <div class="card level-card${unlocked ? '' : ' locked'}" data-level="${unlocked ? lv.id : ''}">
            <h3>${unlocked ? `第 ${i + 1} 关 · ${lv.name}` : '???'}</h3>
            <p class="level-reward"${unlocked ? ` data-tooltip="${rewardText}"` : ''}>${unlocked ? createIconMarkup('icon.currency.gold', '金币') + `<span>${rewardText}</span>` : '通关上一关解锁'}</p>
            <p>${bestText}</p>
          </div>`;
      }).join('')}
    </div>
    <button id="levels-back" class="btn btn-dim" title="返回主菜单">返回</button>
  `;
  rootEl.classList.remove('hidden');
  bindIconFallback(rootEl);
  for (const card of rootEl.querySelectorAll('.level-card:not(.locked)')) {
    card.addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onStart(card.dataset.level);
    });
  }
  rootEl.querySelector('#levels-back').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onBack();
  });
}
```

在 `style.css` 的现有 `.hidden` 后、结算和关卡区域附近加入统一图标与行布局；不新增图片背景，也不覆盖任务包 1 的响应式 Canvas 规则：

```css
.ui-icon { display: inline-block; width: 32px; height: 32px; flex: 0 0 32px;
  object-fit: contain; vertical-align: middle; image-rendering: auto; }
.ui-icon-fallback { box-sizing: border-box; border: 1px solid var(--neon-dim);
  border-radius: 50%; background: var(--panel); }
.settlement-reward, .levels-balance, .level-reward {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
}
.level-reward { min-height: 32px; }
.pause-row label[data-tooltip] { cursor: help; }
```

实现后逐一核查既有 tooltip 接入点：商店 `buildEntryEl` 的名称/说明/价格或等级、升级卡的名称/说明/当前与下一级数值、HUD 五个道具槽的名称/说明/数量、图鉴卡的名称/说明/基础数值、结算奖励的金币数、外观卡的名称/说明/价格；每个可悬停节点都必须有 `data-tooltip`，tooltip 由 DOM 覆盖层定位且不越出窗口边界。暂停和关卡选择按钮只保留可读文字，关卡奖励和余额使用 manifest 金币图标。

**Step 4: 运行确认通过**

Run: `node --test test/settlement.test.js test/shop-ui.test.js`

Expected: PASS；结算、暂停、关卡选择和商店 UI 用例全部通过，断言只涉及 HTML 属性、文本、manifest ID 与 tooltip，不涉及 PNG 像素。

Run: `npm test`

Expected: PASS；全量 `node --test` 绿灯，既有商店购买条件、辅助强化置灰和经济纯函数断言不变。

**Step 5: 提交**

```bash
git add src/ui/icons.js src/ui/gameover.js src/ui/pause.js src/ui/levels.js style.css test/settlement.test.js test/shop-ui.test.js
git commit -m "UI改造任务23: 收尾界面图标与 tooltip 全覆盖"
```

---

### Task 24: 三视口实景验收与性能红线归档

**Files:**
- Modify: `src/ui/dev.js:6-119`
- Create: `test/dev.test.js`
- Create: `test/performance-acceptance.test.js`
- Create: `docs/superpowers/package-8-performance.json`
- Create: `docs/superpowers/acceptance-2026-09-02-ui-visual-overhaul-package-8.md`
- Create: `docs/superpowers/ui-visual-overhaul-package-8-small.png`
- Create: `docs/superpowers/ui-visual-overhaul-package-8-wide.png`
- Create: `docs/superpowers/ui-visual-overhaul-package-8-high-dpr.png`
- Test: `test/dev.test.js`, `test/performance-acceptance.test.js`

**Interfaces:**
- Consumes: `fitCanvas(canvas, ctx) → { width, height, dpr }`、`getVisualCanvas(id, size, options?) → canvas` 的 DPR/`id+size` 缓存契约、`devStress()` 的现有“400 怪 + 满强化机枪”入口、任务包 23 的 `data-visual-id` 与 DOM tooltip 节点。
- Produces: `summarizePerf(samples, { dpr, cssWidth, cssHeight }) → { frameCount, cssWidth, cssHeight, dpr, averageFrameMs, peakFrameMs, iconCacheHits, iconCacheMisses, drawImageTotal, drawImageMaxPerFrame }`；FPS 常驻读数显示平均与峰值帧时；三视口截图、连续 5 秒性能数据和 1–8 任务包逐项勾选的验收记录。

- [ ] **Step 1: 写失败测试**

创建 `test/dev.test.js`，用确定的帧样本锁定统计字段和 DPR 上限，不依赖 DOM 或真实 Canvas：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePerf } from '../src/ui/dev.js';

test('summarizePerf：平均/峰值帧时、缓存命中和同帧 drawImage 统计，DPR 封顶 2', () => {
  const result = summarizePerf([
    { frameMs: 16, iconCacheHits: 1, iconCacheMisses: 1, drawImageCount: 4 },
    { frameMs: 20, iconCacheHits: 2, iconCacheMisses: 0, drawImageCount: 9 },
    { frameMs: 18, iconCacheHits: 3, iconCacheMisses: 0, drawImageCount: 5 },
  ], { dpr: 3, cssWidth: 1280, cssHeight: 720 });
  assert.deepEqual(result, {
    frameCount: 3,
    cssWidth: 1280,
    cssHeight: 720,
    dpr: 2,
    averageFrameMs: 18,
    peakFrameMs: 20,
    iconCacheHits: 6,
    iconCacheMisses: 1,
    drawImageTotal: 18,
    drawImageMaxPerFrame: 9,
  });
});

test('summarizePerf：空样本和非法帧时拒绝，避免把缺测误报为通过', () => {
  assert.throws(() => summarizePerf([]), /samples must be a non-empty array/);
  assert.throws(() => summarizePerf([{ frameMs: -1 }]), /frameMs must be a non-negative finite number/);
  assert.throws(() => summarizePerf([{ frameMs: 16, drawImageCount: Infinity }]), /drawImageCount must be a non-negative finite number/);
});
```

创建 `test/performance-acceptance.test.js`，它只解析验收记录中的 JSON 数据和截图路径，不解码或比较 PNG 像素：

```js
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const RECORD = new URL('../docs/superpowers/acceptance-2026-09-02-ui-visual-overhaul-package-8.md', import.meta.url);
const REQUIRED_VISUAL_CHECKS = [
  'canvasFullSmall', 'canvasFullWide', 'canvasFullHighDpr', 'hudAnchors',
  'iconsAllRequiredScreens', 'transparentNoBlackEdge', 'tooltipCoverage',
  'auxEnhancementLockedRow', 'sceneSpriteRenderingWithFallback', 'bestiarySharesMonsterVisual',
  'skinFlowAndFallback', 'paletteTokens', 'terrainTileCached', 'dprCapped',
  'drawImageControlled',
];

function loadRecord() {
  assert.equal(fs.existsSync(RECORD), true, '缺少 package-8 验收记录');
  const markdown = fs.readFileSync(RECORD, 'utf8');
  const match = markdown.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  assert.ok(match, '验收记录必须包含 fenced JSON 数据块');
  return JSON.parse(match[1]);
}

test('package-8：三视口截图、5 秒性能红线和 8 个任务包核对表齐全', () => {
  const record = loadRecord();
  assert.deepEqual(record.viewports.map(v => v.id), ['small', 'wide', 'highDpr']);
  for (const viewport of record.viewports) {
    assert.ok(Number.isInteger(viewport.cssWidth) && viewport.cssWidth > 0, `${viewport.id}.cssWidth`);
    assert.ok(Number.isInteger(viewport.cssHeight) && viewport.cssHeight > 0, `${viewport.id}.cssHeight`);
    assert.ok(viewport.dpr >= 1 && viewport.dpr <= 2, `${viewport.id}.dpr 必须在 1..2`);
    assert.match(viewport.screenshot,
      /^docs\/superpowers\/ui-visual-overhaul-package-8-(small|wide|high-dpr)\.png$/,
      `${viewport.id}.screenshot 路径不符合归档约定`);
  }

  const p = record.performance;
  assert.equal(p.durationSec, 5, '压测必须连续记录 5 秒');
  assert.ok(Number.isFinite(p.averageFrameMs) && p.averageFrameMs <= 20,
    `平均帧时 ${p.averageFrameMs}ms 必须 ≤20ms`);
  assert.ok(Number.isFinite(p.peakFrameMs) && p.peakFrameMs >= p.averageFrameMs,
    '峰值帧时必须是有效数值且不小于平均帧时');
  assert.ok(p.iconCache.hits >= 1, '必须记录至少一次图标缓存命中');
  assert.ok(p.iconCache.misses >= 0, '图标缓存 miss 必须有记录');
  assert.ok(p.drawImage.total >= 0, '必须记录 drawImage 总次数');
  assert.ok(p.drawImage.maxPerFrame >= 0, '必须记录同帧 drawImage 峰值');
  assert.equal(record.viewports.some(v => v.id === p.stressViewport), true,
    '性能记录必须关联一个已截图视口');

  assert.deepEqual(record.checklist.taskPackages.map(item => item.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const item of record.checklist.taskPackages) {
    assert.equal(item.checked, true, `任务包 ${item.id} 未勾选`);
    assert.ok(item.evidence, `任务包 ${item.id} 缺少证据说明`);
  }
  for (const key of REQUIRED_VISUAL_CHECKS)
    assert.equal(record.checklist.visual[key], true, `实景核对项 ${key} 未通过`);
});
```

其中 `sceneSpriteRenderingWithFallback` 的验收口径为 PNG 精灵渲染(含 fallback 路径)；不再以场内场景物件的程序化建模作为通过条件。

**Step 2: 运行确认失败**

Run: `node --test test/dev.test.js test/performance-acceptance.test.js`

Expected: FAIL；`test/dev.test.js` 先报告 `summarizePerf is not a function`，验收记录测试报告 `缺少 package-8 验收记录`。在浏览器实测数据写入前，不允许用空记录、假截图路径或 0ms 结果让测试通过。

**Step 3: 最小实现**

在 `src/ui/dev.js` 的 FPS 状态变量前加入纯函数，并把现有每秒读数扩展为平均帧时 + 峰值帧时；其余怪物生成、`onStress` 回调、FPS 常驻元素和按钮行为保持不变：

```js
export function summarizePerf(samples, { dpr = 1, cssWidth = 0, cssHeight = 0 } = {}) {
  if (!Array.isArray(samples) || samples.length === 0)
    throw new TypeError('samples must be a non-empty array');
  const countOf = (sample, field) => {
    const value = sample[field] ?? 0;
    if (!Number.isFinite(value) || value < 0)
      throw new TypeError(`${field} must be a non-negative finite number`);
    return value;
  };
  for (const [index, sample] of samples.entries()) {
    if (!sample || !Number.isFinite(sample.frameMs) || sample.frameMs < 0)
      throw new TypeError(`samples[${index}].frameMs must be a non-negative finite number`);
    countOf(sample, 'iconCacheHits');
    countOf(sample, 'iconCacheMisses');
    countOf(sample, 'drawImageCount');
  }
  const frameTimes = samples.map(sample => sample.frameMs);
  const dprValue = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1;
  return {
    frameCount: samples.length,
    cssWidth,
    cssHeight,
    dpr: dprValue,
    averageFrameMs: frameTimes.reduce((sum, value) => sum + value, 0) / samples.length,
    peakFrameMs: Math.max(...frameTimes),
    iconCacheHits: samples.reduce((sum, sample) => sum + countOf(sample, 'iconCacheHits'), 0),
    iconCacheMisses: samples.reduce((sum, sample) => sum + countOf(sample, 'iconCacheMisses'), 0),
    drawImageTotal: samples.reduce((sum, sample) => sum + countOf(sample, 'drawImageCount'), 0),
    drawImageMaxPerFrame: Math.max(...samples.map(sample => countOf(sample, 'drawImageCount'))),
  };
}
```

把现有 `src/ui/dev.js:12` 的 FPS 状态改为：

```js
let fpsAcc = 0, fpsN = 0, fpsPeak = 0, fpsLast = performance.now();
```

把 `fpsTick` 中计算帧间隔和每秒刷新文本的部分改为：

```js
function fpsTick() {
  const now = performance.now();
  const dt = now - fpsLast; fpsLast = now;
  fpsAcc += dt; fpsN++; fpsPeak = Math.max(fpsPeak, dt);
  if (fpsAcc >= 1000) {
    const avg = fpsAcc / fpsN;
    fpsEl.textContent = `FPS ${Math.round(1000 / avg)} / 平均帧时 ${avg.toFixed(1)}ms / 峰值 ${fpsPeak.toFixed(1)}ms`;
    fpsAcc = 0; fpsN = 0; fpsPeak = 0;
  }
  requestAnimationFrame(fpsTick);
}
```

随后执行真实 WebBridge 验收，不以 Node import 或静态代码代替：

1. 用 `kimi-webbridge` 打开 `npx serve .` 提供的实际游戏页面；不要使用文件 URL。开启“FPS 显示”，点击现有“性能压测”（`src/ui/game.js:295-306` 的 400 怪 + 满强化机枪场景），关闭开发者面板使场景继续运行。
2. 记录三个真实视口并截图：小视口 `640×360 CSS px, DPR 1` 保存为 `docs/superpowers/ui-visual-overhaul-package-8-small.png`；宽视口 `1920×1080 CSS px, DPR 1` 保存为 `docs/superpowers/ui-visual-overhaul-package-8-wide.png`；高 DPR 视口 `1280×720 CSS px, DPR 2` 保存为 `docs/superpowers/ui-visual-overhaul-package-8-high-dpr.png`。每次从实际浏览器读 `window.innerWidth`、`window.innerHeight`、`devicePixelRatio`，并同时确认 Canvas CSS 尺寸铺满、内部 DPR 不超过 2、相机没有被物理像素放大、HUD 四角不重叠。
3. 小视口截图逐一打开暂停、结算、关卡选择；宽视口截图逐一打开商店、武器升级、图鉴、外观；高 DPR 截图复核战斗 HUD、商店图标和一个结算/暂停面板。悬停商店、升级、HUD 五槽、辅助武器、图鉴、结算奖励、外观卡片，逐个确认 tooltip 同时包含名称、说明和当前可见数值，且 tooltip 不越出视口；确认辅助强化未拥有整行仍置灰。截图核对透明底图标无黑边、按钮文字仍可读。
4. 在满载场景稳定后连续采样 5 秒帧数据，原始 JSON 保存为 `docs/superpowers/package-8-performance.json`。每个 `frameSamples` 元素必须含 `frameMs`、`iconCacheHits`、`iconCacheMisses`、`drawImageCount`；`performance` 必须含 `stressViewport`、`durationSec`、`averageFrameMs`、`peakFrameMs`、`iconCache`（`hits`/`misses`）和 `drawImage`（`total`/`maxPerFrame`）。平均帧时必须由 5 秒完整样本计算，不能用 FPS 四舍五入反推；同帧 `drawImageCount` 从浏览器 Performance/Canvas 调用统计读取，图标缓存命中从 `getVisualCanvas(id, size)` 的同一 `id+size` 重复请求记录。
5. 用新纯函数复核原始数据，命令如下；如果汇总值和记录值不一致，先修正记录再继续：

```bash
node --input-type=module <<'EOF'
import fs from 'node:fs';
import { summarizePerf } from './src/ui/dev.js';
const raw = JSON.parse(fs.readFileSync('docs/superpowers/package-8-performance.json', 'utf8'));
const viewport = raw.viewports.find(v => v.id === raw.performance.stressViewport);
const summary = summarizePerf(raw.frameSamples, viewport);
for (const key of ['frameCount', 'cssWidth', 'cssHeight', 'dpr', 'averageFrameMs', 'peakFrameMs', 'iconCacheHits', 'iconCacheMisses', 'drawImageTotal', 'drawImageMaxPerFrame']) {
  const expected = {
    frameCount: summary.frameCount,
    cssWidth: summary.cssWidth,
    cssHeight: summary.cssHeight,
    dpr: summary.dpr,
    averageFrameMs: summary.averageFrameMs,
    peakFrameMs: summary.peakFrameMs,
    iconCacheHits: summary.iconCacheHits,
    iconCacheMisses: summary.iconCacheMisses,
    drawImageTotal: summary.drawImageTotal,
    drawImageMaxPerFrame: summary.drawImageMaxPerFrame,
  }[key];
  const actual = {
    frameCount: raw.frameSamples.length,
    cssWidth: raw.performance.cssWidth,
    cssHeight: raw.performance.cssHeight,
    dpr: raw.performance.dpr,
    averageFrameMs: raw.performance.averageFrameMs,
    peakFrameMs: raw.performance.peakFrameMs,
    iconCacheHits: raw.performance.iconCache.hits,
    iconCacheMisses: raw.performance.iconCache.misses,
    drawImageTotal: raw.performance.drawImage.total,
    drawImageMaxPerFrame: raw.performance.drawImage.maxPerFrame,
  }[key];
  if (Math.abs(Number(expected) - Number(actual)) > 1e-9) throw new Error(`${key}: summary=${expected}, record=${actual}`);
}
console.log(JSON.stringify(summary, null, 2));
EOF
```

6. 将 WebBridge 已核对的三视口、性能对象、截图路径、完整实景核对表和 1–8 任务包证据写入 `package-8-performance.json`，然后用以下命令生成最终 Markdown 验收记录；命令拒绝平均帧时超过 20ms、DPR 超过 2 或任何未勾选项：

```bash
node --input-type=module <<'EOF'
import fs from 'node:fs';
const inputPath = 'docs/superpowers/package-8-performance.json';
const outputPath = 'docs/superpowers/acceptance-2026-09-02-ui-visual-overhaul-package-8.md';
const record = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (record.performance.durationSec !== 5) throw new Error('durationSec 必须为 5');
if (!(record.performance.averageFrameMs <= 20)) throw new Error('平均帧时超过 20ms');
if (!(record.performance.dpr >= 1 && record.performance.dpr <= 2)) throw new Error('性能记录 DPR 不在 1..2');
if (record.checklist.taskPackages.length !== 8 || record.checklist.taskPackages.some(item => item.checked !== true || !item.evidence))
  throw new Error('1–8 任务包必须逐项勾选并提供证据');
const required = [
  'canvasFullSmall', 'canvasFullWide', 'canvasFullHighDpr', 'hudAnchors',
  'iconsAllRequiredScreens', 'transparentNoBlackEdge', 'tooltipCoverage',
  'auxEnhancementLockedRow', 'sceneSpriteRenderingWithFallback', 'bestiarySharesMonsterVisual',
  'skinFlowAndFallback', 'paletteTokens', 'terrainTileCached', 'dprCapped',
  'drawImageControlled',
];
for (const key of required) if (record.checklist.visual[key] !== true) throw new Error(`实景核对项未通过: ${key}`);
fs.writeFileSync(outputPath,
  '# Zombie Survivor UI 视觉改造 · 任务包 8 验收记录\n\n' +
  '以下 JSON 为 WebBridge 三视口截图、满载压测和 1–8 任务包核对表的归档数据。\n\n' +
  '```json\n' + JSON.stringify(record, null, 2) + '\n```\n',
  'utf8',
);
EOF
```

图片资产在本任务中只复用 manifest，不重新出图；若 WebBridge 发现图片 404 或透明底不合格，验收必须先停在红灯，使用 `gpt-image-review` + `neon-cel-v1` 先样图后批量、四维度审美验收、入库和 manifest 登记，失败版本登记 `promptVersion: 'placeholder-v0'` 后用程序化占位继续调试，替换图合格后再生成最终记录。

**Step 4: 运行确认通过**

Run: `node --test test/dev.test.js test/performance-acceptance.test.js`

Expected: PASS；统计函数字段、DPR 上限、5 秒平均帧时红线、三视口路径、缓存命中、同帧 `drawImage` 和所有实景核对项均满足断言。

Run: `npm test`

Expected: PASS；全量 `node --test` 绿灯，且不改变音频、`src/core/storage.js`、武器伤害公式、经济公式、刷怪/碰撞/AI 和任何玩法数值。

最后人工确认：平均帧时 `≤20ms` 才能交付；若超过红线，保留失败记录和性能数据，不能勾选任务包 8，也不能用降低怪物数量、降低弹道数量、降低 DPR 上限以外的玩法改动规避问题。

**Step 5: 提交**

```bash
git add src/ui/dev.js test/dev.test.js test/performance-acceptance.test.js docs/superpowers/package-8-performance.json docs/superpowers/acceptance-2026-09-02-ui-visual-overhaul-package-8.md docs/superpowers/ui-visual-overhaul-package-8-small.png docs/superpowers/ui-visual-overhaul-package-8-wide.png docs/superpowers/ui-visual-overhaul-package-8-high-dpr.png
git commit -m "UI改造任务24: 完成三视口实景与性能红线验收"
```