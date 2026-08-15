# 分册 03：地图生成、镜头与键盘输入（Task 5–6）

> 上游：spec §4.5（地图与障碍物）、§2（镜头跟随与键盘输入的已确认决策）；全局约束：`00-global-constraints.md`（简写 G§n）；索引：`README.md`。
> 执行前置：须已完成 Task 1–3（见 `01-foundation.md`）与 Task 4（见 `02-config-tables.md`；G§9 执行顺序恒为线性 Task 1→16）。本分册直接消费 Task 2 / Task 3 产出。

## 1. 目标与范围

本分册交付世界层的三个基础模块：`src/systems/map.js`（3000×3000 固定地图、约 60 个障碍、出生安全区、40 颗预撒经验球）、`src/core/camera.js`（镜头跟随 + 地图边界夹紧 + 0.15s 震屏）与 `src/core/input.js`（WASD / 方向键键盘状态）。`map.js` 与 `camera.js` 属纯逻辑层、可单测（G§3、G§8）；`input.js` 属 DOM 层、不写单测，Task 14 联调时人工验证。不交付：spec §4.5 的医疗包/磁铁/炸弹预撒（第 2 期，G§7.5）、触屏虚拟摇杆（spec §2，后续可选扩展）、障碍物与地图边界的渲染绘制（Task 14，见 `07-scene-assembly.md`）。本分册涉及文件：`src/systems/map.js`、`src/core/camera.js`、`src/core/input.js`、`test/map.test.js`、`test/camera.test.js`。

## 2. 契约

### 2.1 提供（Produces）

`src/systems/map.js`（Task 5）：

- `MAP_SIZE = 3000` —— 地图边长常量（px），正方形地图。
- `generateMap(rng) → {size, spawn:{x,y}, obstacles:[...], scatteredGems:[{x,y,value}]}` —— 一次性生成整张地图：尺寸、出生点（地图中心）、障碍数组、预撒经验球数组。
- 障碍物 `{kind:'circle',x,y,r}` 或 `{kind:'rect',x,y,w,h}` —— 两种障碍形状：圆（圆心 + 半径）与矩形（左上原点 + 宽高）。

`src/core/camera.js`（Task 6）：

- `createCamera(viewW, viewH) → {x,y,viewW,viewH,shakeMag,shakeT,offX,offY}` —— 创建镜头状态对象（左上角坐标、视口尺寸、震屏幅度/剩余时间/偏移）。
- `updateCamera(cam, target, mapSize, rng, dt)`——跟随 target（需有 `x,y`）、夹紧到 `[0, mapSize-view]`、震屏衰减 0.15s。
- `addShake(cam, mag)` —— 触发一次幅度为 mag 的震屏。

`src/core/input.js`（Task 6）：

- `createInput() → {state:{up,down,left,right}, destroy()}`（WASD + 方向键；DOM，无单测）—— 创建窗口级键盘监听，`state` 为四方向按住状态，`destroy()` 注销监听。

以上接口的主要下游为 Task 14 场景组装（见 `07-scene-assembly.md`），届时 `MAP_SIZE` 作为 `mapSize` 实参传入玩家夹紧与镜头夹紧；另：`createInput` 被 Task 16 正式接线（`08-ui-and-persistence.md`）消费，camera 对象形状被 Task 11 刷怪导演（`05-combat-systems.md`）引用。

### 2.2 消费（Consumes）

- `mulberry32(seed) → () => number[0,1)` —— 来源：`01-foundation.md` Task 2。`generateMap` 布点与 `updateCamera` 震屏偏移的随机源，一律经参数注入（G§4 禁 `Math.random`）。
- `circleHit(ax,ay,ar,bx,by,br) → bool` —— 来源：`01-foundation.md` Task 3。预撒经验球（r=8）与圆形障碍的重叠检测。
- `circleRectHit(cx,cy,cr,rect) → bool`，rect 为 `{x,y,w,h}`（左上原点）—— 来源：`01-foundation.md` Task 3。预撒经验球与矩形障碍的重叠检测。

## 3. Task 5: 地图生成（障碍物 + 预撒经验球）

**Files:**
- Create: `src/systems/map.js`
- Test: `test/map.test.js`

（Interfaces 已收录于 §2；此处保留规则原文。）

规则（spec §4.5）：障碍物约 60 个；两者包围盒膨胀 150px 后不相交（最小间距）；出生点（地图中心）半径 200px 内无障碍；预撒 40 颗经验球（value=1），不得落在障碍物内。

- [x] **Step 1: 写失败测试**

```js
// test/map.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { circleHit, circleRectHit } from '../src/core/physics.js';
import { generateMap, MAP_SIZE } from '../src/systems/map.js';

function boundsOf(o) {
  return o.kind === 'circle' ? { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 } : o;
}

test('生成 60 个障碍，同种子可复现', () => {
  const a = generateMap(mulberry32(1));
  const b = generateMap(mulberry32(1));
  assert.equal(a.obstacles.length, 60);
  assert.deepEqual(a.obstacles, b.obstacles);
  assert.equal(a.size, MAP_SIZE);
  assert.deepEqual(a.spawn, { x: MAP_SIZE / 2, y: MAP_SIZE / 2 });
});

test('出生点半径 200 内无障碍', () => {
  const m = generateMap(mulberry32(2));
  for (const o of m.obstacles) {
    const b = boundsOf(o);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    assert.ok(Math.hypot(cx - m.spawn.x, cy - m.spawn.y) >= 200);
  }
});

test('障碍两两包围盒膨胀 150 后不相交', () => {
  const m = generateMap(mulberry32(3));
  const bs = m.obstacles.map(boundsOf);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    const overlap = a.x < b.x + b.w + 150 && a.x + a.w + 150 > b.x &&
                    a.y < b.y + b.h + 150 && a.y + a.h + 150 > b.y;
    assert.equal(overlap, false, `障碍 ${i} 与 ${j} 间距不足`);
  }
});

test('40 颗预撒经验球均不落在障碍内', () => {
  const m = generateMap(mulberry32(4));
  assert.equal(m.scatteredGems.length, 40);
  for (const g of m.scatteredGems) {
    assert.equal(g.value, 1);
    for (const o of m.obstacles) {
      if (o.kind === 'circle') assert.equal(circleHit(g.x, g.y, 8, o.x, o.y, o.r), false);
      else assert.equal(circleRectHit(g.x, g.y, 8, o), false);
    }
  }
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/map.test.js`
Expected: FAIL，模块不存在

- [x] **Step 3: 实现**

```js
// src/systems/map.js
import { circleHit, circleRectHit } from '../core/physics.js';

export const MAP_SIZE = 3000;
const OBSTACLE_COUNT = 60;
const MIN_GAP = 150;
const SAFE_RADIUS = 200;
const GEM_COUNT = 40;

function boundsOf(o) {
  return o.kind === 'circle' ? { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 } : o;
}

function farEnough(cand, obstacles) {
  const a = boundsOf(cand);
  for (const o of obstacles) {
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

export function generateMap(rng) {
  const cx = MAP_SIZE / 2, cy = MAP_SIZE / 2;
  const obstacles = [];
  let guard = 0;
  while (obstacles.length < OBSTACLE_COUNT && guard++ < 3000) {
    const x = 100 + rng() * (MAP_SIZE - 200);
    const y = 100 + rng() * (MAP_SIZE - 200);
    if (Math.hypot(x - cx, y - cy) < SAFE_RADIUS + 80) continue;
    const cand = rng() < 0.5
      ? { kind: 'circle', x, y, r: 20 + rng() * 40 }
      : { kind: 'rect', x: x - 30 - rng() * 50, y: y - 30 - rng() * 50, w: 60 + rng() * 100, h: 60 + rng() * 100 };
    if (farEnough(cand, obstacles)) obstacles.push(cand);
  }
  const scatteredGems = [];
  guard = 0;
  while (scatteredGems.length < GEM_COUNT && guard++ < 2000) {
    const x = 50 + rng() * (MAP_SIZE - 100);
    const y = 50 + rng() * (MAP_SIZE - 100);
    if (Math.hypot(x - cx, y - cy) < SAFE_RADIUS) continue;
    if (insideObstacle(x, y, 8, obstacles)) continue;
    scatteredGems.push({ x, y, value: 1 });
  }
  return { size: MAP_SIZE, spawn: { x: cx, y: cy }, obstacles, scatteredGems };
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/map.test.js`
Expected: 全 PASS（注意"约 60 个"在 guard 3000 次内应必达 60；若偶发不足则把 guard 调到 5000，不要放松断言）

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 地图生成（障碍物间距/出生安全区/预撒经验球）"
```

### Task 5 验收

- 单测：`test/map.test.js` 共 4 例（同种子 60 障碍可复现 / 出生点半径 200 无障碍 / 两两膨胀 150 不相交 / 40 颗预撒球均不在障碍内且 value=1）
- 运行：`node --test test/map.test.js`（全量回归用 `npm test`，G§2）
- 人工清单：无（源计划本 Task 无人工验证项）

## 4. Task 6: 镜头与键盘输入

**Files:**
- Create: `src/core/camera.js`, `src/core/input.js`
- Test: `test/camera.test.js`

（Interfaces 已收录于 §2；`input.js` 为 DOM 层，G§3 不写单测。）

- [x] **Step 1: 写失败测试**

```js
// test/camera.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { createCamera, updateCamera, addShake } from '../src/core/camera.js';

test('跟随并夹紧在地图边界', () => {
  const cam = createCamera(1280, 720);
  updateCamera(cam, { x: 0, y: 0 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 0); assert.equal(cam.y, 0);
  updateCamera(cam, { x: 3000, y: 3000 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 3000 - 1280); assert.equal(cam.y, 3000 - 720);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 1500 - 640); assert.equal(cam.y, 1500 - 360);
});

test('震屏偏移在 0.15s 后归零', () => {
  const cam = createCamera(1280, 720);
  const rng = mulberry32(9);
  addShake(cam, 8);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, rng, 0.05);
  assert.ok(cam.offX !== 0 || cam.offY !== 0);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, rng, 0.2);
  assert.equal(cam.offX, 0); assert.equal(cam.offY, 0);
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/camera.test.js`
Expected: FAIL，模块不存在

- [x] **Step 3: 实现**

```js
// src/core/camera.js
export function createCamera(viewW, viewH) {
  return { x: 0, y: 0, viewW, viewH, shakeMag: 0, shakeT: 0, offX: 0, offY: 0 };
}
export function addShake(cam, mag) { cam.shakeMag = mag; cam.shakeT = 0.15; }
export function updateCamera(cam, target, mapSize, rng, dt) {
  cam.x = Math.max(0, Math.min(mapSize - cam.viewW, target.x - cam.viewW / 2));
  cam.y = Math.max(0, Math.min(mapSize - cam.viewH, target.y - cam.viewH / 2));
  if (cam.shakeT > 0) {
    cam.shakeT -= dt;
    const m = cam.shakeMag * Math.max(0, cam.shakeT) / 0.15;
    cam.offX = (rng() * 2 - 1) * m || 0;
    cam.offY = (rng() * 2 - 1) * m || 0;
  } else { cam.offX = 0; cam.offY = 0; }
}
```

```js
// src/core/input.js
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};
export function createInput() {
  const state = { up: false, down: false, left: false, right: false };
  const onDown = e => { const k = KEYMAP[e.code]; if (k) { state[k] = true; e.preventDefault(); } };
  const onUp = e => { const k = KEYMAP[e.code]; if (k) state[k] = false; };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  return {
    state,
    destroy() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    },
  };
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/camera.test.js`
Expected: 全 PASS（input.js 在 Task 14 联调时人工验证）

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 镜头跟随/夹紧/震屏与键盘输入"
```

### Task 6 验收

- 单测：`test/camera.test.js` 共 2 例（跟随并夹紧在地图边界 / 震屏偏移 0.15s 后归零）
- 运行：`node --test test/camera.test.js`（全量回归用 `npm test`，G§2）
- 人工清单：`input.js` 无单测（DOM 层，G§3），其人工验证原位保留在 Step 4 备注——于 Task 14 联调时进行（见 `07-scene-assembly.md`）

## 5. 歧义裁决（本模块）

| # | 易误解点 | 裁定 | 来源 |
|---|---|---|---|
| 1 | 障碍最小间距 150 的判定方式 | 按包围盒膨胀 150 判定（`farEnough` 对两者 AABB 各加 MIN_GAP 逐对检测），非中心距 | 拆分裁定 |
| 2 | 出生安全区口径 | 出生安全区=障碍中心距出生点≥200（因间距约束实际占用更远）；预撒经验球同样不入安全区（防开局白捡） | 拆分裁定 |
| 3 | generateMap 的 guard 未达标时的行为 | guard（障碍 3000 次/球 2000 次尝试）未达标时返回少于目标数属合法降级，固定种子下必达目标数（测试覆盖） | 拆分裁定 |
| 4 | 镜头跟随与震屏随机数 | camera 跟随为即时夹紧，无平滑插值；shake 每帧消费注入 rng（同种子震屏轨迹可复现） | 拆分裁定 |
| 5 | input 的 preventDefault 范围 | 仅作用于映射的 8 个移动键（WASD + 四方向键的 keydown），不劫持系统键及其他按键 | 拆分裁定 |
| 6 | 「障碍中心距出生点 ≥200」中的中心与 +80 余量 | 中心指障碍包围盒中心：圆障碍包围盒中心=采样点；矩形因左上偏移与半宽是两次独立 rng()，包围盒中心可在采样点各轴 ±50px 内抖动——生成期按 `SAFE_RADIUS + 80`（280）拒绝采样点正是为吸收该抖动（最坏 280−50√2≈209.3 仍 ≥200） | 源文隐含·本次明示 |
| 7 | spec §4.5「四周边界墙」的实现方式 | 不生成墙体障碍实体：`generateMap` 产出物中无墙体，边界由玩家位置夹紧（Task 7 的 `mapSize` 参数）与镜头夹紧实现，Task 14 仅以 `strokeRect` 描边地图边框 | 源文隐含·本次明示 |
| 8 | 连续多次 `addShake` 的叠加语义 | 覆盖不叠加：直接赋 `shakeMag = mag` 并重置 `shakeT = 0.15`，后到者生效、衰减计时归零重计 | 源文隐含·本次明示 |
| 9 | 震屏跨零帧行为 | `shakeT` 由正转负的当帧幅度钳 0（`Math.max(0, shakeT)`），该帧 offX/offY 即为 0，无需等下一帧；且该帧仍消耗 2 次 rng——复现震屏轨迹必须保持相同消耗次序。2026-08-15 修正：`(rng()*2-1)*0` 在 JS 中可为 `-0`，`node:assert/strict` 的 `assert.equal` 按 `Object.is` 比较会失败，故实现以 `\|\| 0` 归一（rng 消耗次数不变） | 源文隐含·本次明示 |
| 10 | 窗口失焦时的按键状态 | input.js 未监听 blur/visibilitychange：失焦期间松开的键收不到 keyup，`state` 可能残留为按下；MVP 接受此行为，源文无处理代码 | 源文隐含·本次明示 |
