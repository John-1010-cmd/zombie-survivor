# 分册 01 · 基础设施（Task 1–3）：脚手架与主循环 / rng 与池 / 碰撞与空间网格

> 上游：spec §3.2（游戏循环）、§3.4（碰撞取舍）、§9（性能预算）；全局约束：`00-global-constraints.md`（简写 G§n）；索引：`README.md`。
> 执行前置：无——本分册是全部计划的起点（依赖图 G§9 中 T1–T3 为根），不依赖任何先前 Task。

## 1. 目标与范围

本分册交付整个项目的可运行地基：Task 1 搭建脚手架（`package.json`/`README.md`/`index.html`/`style.css`）并实现固定步长累加器 `loop.js` 与 rAF 主循环 `engine.js`（`src/main.js` 为临时占位场景，Task 16 被替换为菜单，见 `08-ui-and-persistence.md`）；Task 2 实现确定性随机数 `mulberry32`/加权抽取与通用对象池；Task 3 实现圆/矩形碰撞、推出解算与空间网格。本分册不含任何游戏内容——配置表、地图、实体、系统、UI 分别属分册 02–08；`input.js`/`camera.js` 虽同在 `src/core/` 但属 `03-world.md`。除 `engine.js`/`main.js`（DOM 层，不写单测，G§3）外全部为纯逻辑模块，`node --test` 可直接 import。涉及文件：源文件 `package.json`、`README.md`、`index.html`、`style.css`、`src/core/{loop,rng,pool,physics,engine}.js`、`src/main.js`，测试文件 `test/{loop,rng,pool,physics}.test.js`。

## 2. 契约

### 2.1 提供（Produces）

（签名逐字取自源计划 Task 1–3 的 Interfaces.Produces；括号内为来源 Task。）

- `createLoop(step?) → {step, acc, last}`（Task 1）——创建固定步长累加器的循环状态对象，`step` 默认 `1/60` 秒。
- `advance(loop, nowMs) → 本次应跑的固定步数`（Task 1）——按与上次调用的时间差累加并返回本次应执行的固定步数（只计算，不执行 update，见 §6 裁决 1）。
- `createEngine(canvas) → {setScene(scene), start()}`，scene 形如 `{update(dt), render(ctx), paused?}`（Task 1）——rAF 主循环驱动：每帧按 `advance` 步数调 `scene.update(loop.step)`，恒调 `scene.render(ctx)`；`paused` 仅豁免 update（见 §6 裁决 9）。
- `mulberry32(seed) → () => number[0,1)`（Task 2）——确定性 PRNG 工厂；全项目随机数的唯一来源（G§4）。
- `pickWeighted(rng, weights) → key`（weights 为 `{key: 正数}`，0 权重永不命中）（Task 2）——按权重随机抽取一个 key；不要求权重归一化（G§7.3）。
- `createPool(factory, reset) → {obtain(...args), release(obj), size}`（Task 2）——通用对象池；`obtain` 总是执行 `reset`（含新建对象，见 §6 裁决 5）。
- `circleHit(ax,ay,ar,bx,by,br) → bool`（Task 3）——圆-圆重叠检测，相切不算命中（见 §6 裁决 7）。
- `circleRectHit(cx,cy,cr,rect) → bool`，rect 为 `{x,y,w,h}`（左上原点）（Task 3）——圆-轴对齐矩形重叠检测。
- `resolveCircleRect(cx,cy,cr,rect) → {x,y}`（推出后的圆心位置；未重叠原样返回）（Task 3）——把圆推到矩形边界外；圆心在矩形内部时沿最近面推出。
- `slideCircleObstacles(e, obstacles)`——原地修改 `e.x/e.y`；e 需有 `x,y,r`；障碍物为 `{kind:'circle',x,y,r}` 或 `{kind:'rect',x,y,w,h}`（Task 3）——对一组障碍逐个解算推出（碰撞滑动）。
- `createSpatialHash(cellSize?) → {clear(), insert(e), query(x,y,r) → 数组（去重）}`（Task 3）——空间网格（cellSize 默认 64px，G§6）；insert/query 语义见 §6 裁决 6、8。

### 2.2 消费（Consumes）

无。源计划 Task 1–3 均标注 `Consumes: 无`；本分册位于依赖图（G§9）根部，仅依赖 Node/浏览器平台能力。后续分册对本分册接口的消费关系见 `README.md` 文档地图。

## 3. Task 1: 脚手架与固定步长主循环

**Files:**
- Create: `package.json`, `README.md`, `index.html`, `style.css`
- Create: `src/core/loop.js`, `src/core/engine.js`, `src/main.js`
- Test: `test/loop.test.js`

Interfaces：见 §2.1（本任务 Produces 已汇总）。

- [x] **Step 1: 写失败测试**

```js
// test/loop.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoop, advance } from '../src/core/loop.js';

test('首帧不产生步进', () => {
  const l = createLoop();
  assert.equal(advance(l, 1000), 0);
});

test('间隔约 1/60 秒（17ms）产生 1 步', () => {
  const l = createLoop();
  advance(l, 1000);
  // 用整数毫秒：1000/60 的浮点值略小于 step，断言 1 步会因浮点误差失败
  assert.equal(advance(l, 1017), 1);
});

test('大间隔被钳制，不产生死亡螺旋', () => {
  const l = createLoop();
  advance(l, 1000);
  const steps = advance(l, 11000); // 10 秒
  assert.ok(steps <= 16, `steps=${steps} 应 <= 16（0.25s 钳制）`);
});

test('余数会累积到后续帧', () => {
  const l = createLoop();
  advance(l, 0);
  assert.equal(advance(l, 8), 0);   // 8ms 不足一步
  assert.equal(advance(l, 17), 1);  // 累计 17ms > 16.67ms
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/loop.test.js`
Expected: FAIL，找不到 `../src/core/loop.js`

- [x] **Step 3: 实现**

```js
// src/core/loop.js
export function createLoop(step = 1 / 60) {
  return { step, acc: 0, last: null };
}
export function advance(loop, nowMs) {
  if (loop.last === null) { loop.last = nowMs; return 0; }
  let frame = (nowMs - loop.last) / 1000;
  loop.last = nowMs;
  if (frame > 0.25) frame = 0.25;
  loop.acc += frame;
  let steps = 0;
  while (loop.acc >= loop.step) { loop.acc -= loop.step; steps++; }
  return steps;
}
```

```json
// package.json
{
  "name": "zombie-survivor",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "start": "npx serve ."
  }
}
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zombie Survivor</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="game" width="1280" height="720"></canvas>
  <div id="menu" class="overlay"></div>
  <div id="levelup" class="overlay hidden"></div>
  <div id="gameover" class="overlay hidden"></div>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

```css
/* style.css */
html, body { margin: 0; height: 100%; background: #111; overflow: hidden; }
#game { display: block; margin: 0 auto; background: #1a2418; }
.overlay { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px;
  background: rgba(0,0,0,.72); color: #eee;
  font-family: "Microsoft YaHei", system-ui, sans-serif; }
.hidden { display: none; }
button { font-size: 20px; padding: 10px 32px; cursor: pointer; }
.cards { display: flex; gap: 16px; }
.card { width: 180px; padding: 16px; background: #222; border: 2px solid #555;
  border-radius: 8px; cursor: pointer; text-align: center; }
.card:hover { border-color: #ffd75e; }
.card h3 { margin: 0 0 8px; color: #ffd75e; }
```

```js
// src/core/engine.js
import { createLoop, advance } from './loop.js';

export function createEngine(canvas) {
  const ctx = canvas.getContext('2d');
  const loop = createLoop();
  let scene = null;
  function frame(now) {
    const steps = advance(loop, now);
    if (scene) {
      if (!scene.paused) for (let i = 0; i < steps; i++) scene.update(loop.step);
      scene.render(ctx);
    }
    requestAnimationFrame(frame);
  }
  return {
    setScene(s) { scene = s; },
    start() { requestAnimationFrame(frame); },
  };
}
```

```js
// src/main.js（临时占位场景，Task 16 会被替换为菜单）
import { createEngine } from './core/engine.js';

const engine = createEngine(document.getElementById('game'));
engine.setScene({
  update() {},
  render(ctx) {
    ctx.fillStyle = '#1a2418'; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#eee'; ctx.font = '32px sans-serif';
    ctx.fillText('Zombie Survivor — 引擎就绪', 420, 360);
  },
});
engine.start();
```

```markdown
<!-- README.md -->
# Zombie Survivor
2D 无尽僵尸射击（吸血鬼幸存者类）。设计文档见 `docs/superpowers/specs/`。

## 运行
需要任意静态服务器（ES Modules 限制，不能直接双击 html）：
    npx serve .
然后浏览器打开提示的地址（默认 http://localhost:3000）。

## 测试
    npm test
```

- [x] **Step 4: 运行确认通过**

Run: `node --test`（无参数，自动发现 `test/` 目录；Node 24 起目录参数 `test/` 会报 MODULE_NOT_FOUND，见 G§2）
Expected: 4 个用例全 PASS；`npx serve .` 后浏览器可见占位文字（人工确认）

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 项目脚手架与固定步长主循环"
```

### Task 1 验收

单测 4 例（`test/loop.test.js`）；运行命令 `node --test`（无参数自动发现，Node 24 兼容，见 G§2；本 Task 完成时全仓仅此 4 例）。人工确认项（浏览器占位文字）保留在 Step 4 原位，不在此重复。

## 4. Task 2: 随机数器与对象池

**Files:**
- Create: `src/core/rng.js`, `src/core/pool.js`
- Test: `test/rng.test.js`, `test/pool.test.js`

Interfaces：见 §2.1（本任务 Produces 已汇总）。

- [x] **Step 1: 写失败测试**

```js
// test/rng.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pickWeighted } from '../src/core/rng.js';

test('同种子同序列', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});

test('值域 [0,1)', () => {
  const r = mulberry32(1);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test('0 权重永不命中，单权重必中', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 100; i++) {
    assert.equal(pickWeighted(r, { a: 0, b: 1 }), 'b');
  }
});

test('权重分布大致成比例', () => {
  const r = mulberry32(123);
  let a = 0;
  for (let i = 0; i < 10000; i++) if (pickWeighted(r, { a: 1, b: 3 }) === 'a') a++;
  assert.ok(a > 2000 && a < 3000, `a 命中 ${a} 次，期望约 2500`);
});
```

```js
// test/pool.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../src/core/pool.js';

test('release 后 obtain 复用同一对象且 reset 生效', () => {
  const p = createPool(() => ({ v: 0 }), (o, v) => { o.v = v; });
  const a = p.obtain(1);
  assert.equal(a.v, 1);
  p.release(a);
  const b = p.obtain(2);
  assert.equal(a, b);
  assert.equal(b.v, 2);
});

test('size 反映空闲数量', () => {
  const p = createPool(() => ({}) , () => {});
  const a = p.obtain(), b = p.obtain();
  p.release(a); p.release(b);
  assert.equal(p.size, 2);
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/rng.test.js test/pool.test.js`
Expected: FAIL，模块不存在

- [x] **Step 3: 实现**

```js
// src/core/rng.js
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pickWeighted(rng, weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return Object.keys(weights).at(-1);
}
```

```js
// src/core/pool.js
export function createPool(factory, reset) {
  const free = [];
  return {
    obtain(...args) {
      const obj = free.length ? free.pop() : factory();
      reset(obj, ...args);
      return obj;
    },
    release(obj) { free.push(obj); },
    get size() { return free.length; },
  };
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/rng.test.js test/pool.test.js`
Expected: 全 PASS

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: mulberry32 随机数器、加权抽取与对象池"
```

### Task 2 验收

单测 6 例（`test/rng.test.js` 4 例 + `test/pool.test.js` 2 例）；运行命令 `node --test test/rng.test.js test/pool.test.js`。

## 5. Task 3: 碰撞数学与空间网格

**Files:**
- Create: `src/core/physics.js`
- Test: `test/physics.test.js`

Interfaces：见 §2.1（本任务 Produces 已汇总）。

- [x] **Step 1: 写失败测试**

```js
// test/physics.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleHit, circleRectHit, resolveCircleRect, slideCircleObstacles, createSpatialHash } from '../src/core/physics.js';

test('circleHit 相切不算撞，重叠算撞', () => {
  assert.equal(circleHit(0, 0, 10, 20, 0, 10), false);
  assert.equal(circleHit(0, 0, 10, 19, 0, 10), true);
});

test('circleRectHit 边/角/未命中', () => {
  const rect = { x: 0, y: 0, w: 100, h: 50 };
  assert.equal(circleRectHit(50, -5, 10, rect), true);   // 上边压入
  assert.equal(circleRectHit(-15, -15, 10, rect), false); // 角外
  assert.equal(circleRectHit(200, 200, 10, rect), false);
});

test('resolveCircleRect 推出后不再重叠', () => {
  const rect = { x: 0, y: 0, w: 100, h: 100 };
  const r = resolveCircleRect(50, -5, 10, rect);
  assert.equal(circleRectHit(r.x, r.y, 10, rect), false);
  // 圆心在矩形内部也能推出
  const r2 = resolveCircleRect(50, 50, 10, rect);
  assert.equal(circleRectHit(r2.x, r2.y, 10, rect), false);
});

test('slideCircleObstacles 同时处理圆与矩形障碍', () => {
  const e = { x: 5, y: 0, r: 10 };
  slideCircleObstacles(e, [{ kind: 'circle', x: 15, y: 0, r: 10 }]);
  assert.ok(Math.hypot(e.x - 15, e.y) >= 20 - 1e-9);
  const e2 = { x: 50, y: -5, r: 10 };
  slideCircleObstacles(e2, [{ kind: 'rect', x: 0, y: 0, w: 100, h: 100 }]);
  assert.equal(circleRectHit(e2.x, e2.y, 10, { x: 0, y: 0, w: 100, h: 100 }), false);
});

test('spatialHash 查询命中且跨格实体不重复', () => {
  const h = createSpatialHash(64);
  const big = { x: 64, y: 64, r: 40 }; // 横跨多个格
  const far = { x: 500, y: 500, r: 5 };
  h.insert(big); h.insert(far);
  const out = h.query(64, 64, 50);
  assert.equal(out.filter(e => e === big).length, 1);
  assert.equal(out.includes(far), false);
  h.clear();
  assert.equal(h.query(64, 64, 50).length, 0);
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/physics.test.js`
Expected: FAIL，模块不存在

- [x] **Step 3: 实现**

```js
// src/core/physics.js
export function circleHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by, r = ar + br;
  return dx * dx + dy * dy < r * r;
}

export function circleRectHit(cx, cy, cr, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

export function resolveCircleRect(cx, cy, cr, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= cr * cr) return { x: cx, y: cy };
  if (d2 === 0) { // 圆心在矩形内：沿最近面推出
    const left = cx - rect.x, right = rect.x + rect.w - cx;
    const top = cy - rect.y, bottom = rect.y + rect.h - cy;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: rect.x - cr, y: cy };
    if (m === right) return { x: rect.x + rect.w + cr, y: cy };
    if (m === top) return { x: cx, y: rect.y - cr };
    return { x: cx, y: rect.y + rect.h + cr };
  }
  const d = Math.sqrt(d2);
  return { x: nx + (dx / d) * cr, y: ny + (dy / d) * cr };
}

export function slideCircleObstacles(e, obstacles) {
  for (const o of obstacles) {
    if (o.kind === 'circle') {
      const dx = e.x - o.x, dy = e.y - o.y;
      const min = e.r + o.r;
      const d = Math.hypot(dx, dy);
      if (d < min && d > 0) { e.x = o.x + dx / d * min; e.y = o.y + dy / d * min; }
    } else {
      const r = resolveCircleRect(e.x, e.y, e.r, o);
      e.x = r.x; e.y = r.y;
    }
  }
}

export function createSpatialHash(cellSize = 64) {
  const map = new Map();
  const key = (cx, cy) => cx + ':' + cy;
  return {
    clear() { map.clear(); },
    insert(e) {
      const x0 = Math.floor((e.x - e.r) / cellSize), x1 = Math.floor((e.x + e.r) / cellSize);
      const y0 = Math.floor((e.y - e.r) / cellSize), y1 = Math.floor((e.y + e.r) / cellSize);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const k = key(cx, cy);
        let arr = map.get(k);
        if (!arr) { arr = []; map.set(k, arr); }
        arr.push(e);
      }
    },
    query(x, y, r) {
      const out = [], seen = new Set();
      const x0 = Math.floor((x - r) / cellSize), x1 = Math.floor((x + r) / cellSize);
      const y0 = Math.floor((y - r) / cellSize), y1 = Math.floor((y + r) / cellSize);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const arr = map.get(key(cx, cy));
        if (!arr) continue;
        for (const e of arr) if (!seen.has(e)) { seen.add(e); out.push(e); }
      }
      return out;
    },
  };
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/physics.test.js`
Expected: 全 PASS

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 圆/矩形碰撞、推出与空间网格"
```

### Task 3 验收

单测 5 例（`test/physics.test.js`）；运行命令 `node --test test/physics.test.js`。

## 6. 歧义裁决（本模块）

| # | 易误解点 | 裁定 | 来源 |
|---|---|---|---|
| 1 | `advance` 是否执行逻辑更新 | `advance` 只计算并返回步数，不执行任何 update；update 的循环执行在 `engine.js` 的 `frame` 中 | 拆分裁定 |
| 2 | 首帧（无时间基点）行为 | 首帧 `last === null` 时仅记录 `nowMs` 并返回 0 步，用于建立时间基点 | 拆分裁定 |
| 3 | 0.25s 钳制与 `<= 16` 断言的关系 | 帧间隔钳 0.25s ⇒ 单帧至多 15 步（0.25 × 60）；测试断言 `<= 16` 是宽松上界 | 拆分裁定 |
| 4 | `pickWeighted` 权重和为 0 | 要求权重和 > 0；全 0 属调用方 bug（返回末 key 的末行仅兜底） | 拆分裁定 |
| 5 | `pool.obtain` 与 `reset` 的关系 | `obtain` 总是执行 `reset`（含 factory 新建的对象）；`release` 后对象归池，调用方不得再持有该引用 | 拆分裁定 |
| 6 | `spatialHash` insert/query 语义 | insert 按实体包围盒（`x±r, y±r`）跨格放置；query 结果去重且不保证顺序；combat 查询半径用 `4+MAX_ZOMBIE_R` 保证不漏（见 `05-combat-systems.md`） | 拆分裁定 |
| 7 | 相切是否算命中 | `circleHit` / `circleRectHit` 均用严格小于（`<`）判定，距离恰好等于半径和（相切）不算命中——测试「相切不算撞」即此断言 | 源文隐含·本次明示 |
| 8 | `query(x,y,r)` 是否做精确过滤 | query 是粗筛：按查询圆包围盒覆盖的格返回候选实体，不做精确距离过滤；调用方需自行用 `circleHit` 精筛 | 源文隐含·本次明示 |
| 9 | `scene.paused` 的语义 | `engine.js` frame 中 `paused` 仅豁免 update（`!scene.paused` 才跑步进），`render` 每帧照常执行——对应 G§6「逻辑暂停时渲染继续」 | 源文隐含·本次明示 |
| 10 | 圆-圆推出时圆心重合 | `slideCircleObstacles` 的圆障碍分支要求 `d > 0`：实体圆心与障碍圆心完全重合（d=0，方向未定义）时不推出 | 源文隐含·本次明示 |

本分册无待裁决项。
