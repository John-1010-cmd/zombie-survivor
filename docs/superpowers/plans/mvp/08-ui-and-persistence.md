# 分册 08：升级界面与 HUD、菜单 / 结算 / 最高分存档 / 最终接线（Task 15–16）

> 上游：spec §3.2（MENU → PLAYING ⇄ LEVEL_UP → GAME_OVER 状态机）、§4.6（经验与四选一升级）、§8（UI / HUD）、§10（存档）、§12（测试策略与验收标准）；全局约束：`00-global-constraints.md`（简写 G§n）；索引：`README.md`。
> 执行前置：须已完成 Task 1–14（G§9 执行顺序恒为线性 Task 1→16；本分册直接消费 Task 1 / 4 / 6 / 12 / 14 产出，见 `01-foundation.md`、`02-config-tables.md`、`03-world.md`、`06-progression-and-effects.md`、`07-scene-assembly.md`）。源计划明示：若 Task 14 尚未完成，先完成 Task 14 再执行 Task 15。

## 1. 目标与范围

本分册交付 MVP 的全部界面与持久化收尾，共两个 Task：Task 15 交付升级四选一覆盖层 `src/ui/levelup.js`（纯函数 `cardLabel` + DOM 组装 `showLevelUp`）与 HUD 模块 `src/systems/hud.js`（纯函数 `formatTime` + 屏幕空间绘制 `renderHud`），同时把 Task 14 game.js render 末尾的内联 HUD 块替换为 `renderHud(ctx, scene)` 调用、把 main.js 临时版的 onLevelUp 回调从 console.log 改为调用 showLevelUp；Task 16 交付最高分存档 `src/core/storage.js`（`updateBest` 纯函数 + `loadBest`/`saveBest`）、主菜单与结算覆盖层 `src/ui/menu.js` / `src/ui/gameover.js`，并把 main.js 重写为正式版（主菜单 → 战斗 → 结算/重开全流程接线）。测试文件：`test/levelup.test.js`（3 条）、`test/hud.test.js`（1 条）、`test/storage.test.js`（4 条）。

分层归属（G§3、G§8）：`cardLabel` / `formatTime` / `updateBest` 为纯函数、可单测；`showLevelUp` / `renderHud` 的 `document`/`ctx` 仅在函数体内使用（G§8「纯\*」标注），`node --test` 可安全 import；`menu.js` / `gameover.js` / `main.js` 属 DOM 层、不写单测，以人工清单验收（Task 15 Step 7、Task 16 Step 8 / Step 10）。不交付：spec §4.6 的辅助/道具卡与真实消耗品卡（第 2 期，G§7.1）、每局刷新次数（第 3 期，G§7.5）、坚守模式纪录与设置项存档（spec §10 后续期）；满血时 heal 卡无收益为 G§7.2 已知例外。Task 15 对 main.js 的改动是临时接线，Task 16 Step 7 以正式版整体替换（接线方式保持一致）。

## 2. 契约

### 2.1 提供（Produces）

以下逐条取自源计划 Task 15 / Task 16 的 Produces（签名与语义逐字保留）：

`src/ui/levelup.js`（Task 15）：

- `cardLabel(card) → {title, desc}`：`{type:'enhance', stat}` → `{title:'武器强化', desc:STAT_LABEL[stat]}`；`{type:'swap', weapon}` → `{title:'更换武器', desc:WEAPONS[weapon].name+'（从 Lv1 开始）'}`；`{type:'heal'}` → `{title:'急救包', desc:'立即回复 50% HP'}`
- `showLevelUp(rootEl, game, onDone)`——rootEl 为 `#levelup` 覆盖层元素；渲染 build 栏（当前武器名 + Lv + 各维度增强次数）与 4 张卡（`drawCards(game.weapon, game.rng)`，用 `cardLabel` 显示标题/描述，enhance/swap 卡以描述标注目标）；点卡片 → `applyCard(game, card)`、`game.pendingLevelUps--`；若 `> 0` 则重新抽 4 张渲染，否则 `rootEl` 加 `hidden`、`game.paused = false`、调 `onDone()`

`src/systems/hud.js`（Task 15）：

- `formatTime(sec) → 'MM:SS'`（`0→'00:00'`、`65→'01:05'`、`600→'10:00'`）
- `renderHud(ctx, game)`——屏幕空间绘制（需在 camera 变换 `ctx.restore()` 之后调用）：左上血条（底 `#533`、条 `#4d4`，标注 `hp/maxHp` 数字）、其下经验条（底 `#334`、条 `#5ef`，填充比例 = `xp/xpNeed(level)`，标注 `Lv`）、右上计时 `formatTime(game.time)` 与难度档 `getTier(game.time)`、击杀数、左下当前武器名 + Lv + enhance 各维次数

`src/core/storage.js`（Task 16）：

- `updateBest(best, stats) → {best, isNew}`（纯函数；stats 为 `{time,kills,level}`；best.endless 不存在或 `stats.time > best.endless.time` 时返回 `{best:{...best, endless:{time,kills,level}}, isNew:true}`，否则返回 `{best, isNew:false}`；不修改任何入参）
- `loadBest() → best` / `saveBest(best) → void`——读写 localStorage 键 `'zs_best'`，JSON 序列化，try/catch 兜底：读取失败返回 `{}`，写入失败静默忽略

`src/ui/menu.js`（Task 16）：

- `showMenu(rootEl, best, onStart) → void`——#menu 覆盖层渲染标题『Zombie Survivor』、『无尽模式』按钮、最佳纪录文案（无纪录显示『暂无纪录』，有则显示 `存活 MM:SS / 击杀 N / Lv N`）；点击『无尽模式』隐藏 #menu 并调用 `onStart()`

`src/ui/gameover.js`（Task 16）：

- `showGameOver(rootEl, stats, isNew, onRestart, onMenu) → void`——显示 存活时间/击杀数/等级，isNew 时额外显示『新纪录！』；『再来一局』→ 隐藏并 `onRestart()`，『回主菜单』→ 隐藏并 `onMenu()`

### 2.2 消费（Consumes）

- `drawCards(weapon, rng)` / `applyCard(game, card)` / `xpNeed(level)`（`src/systems/progression.js`）——来源：`06-progression-and-effects.md` Task 12
- `STAT_LABEL` / `WEAPONS` / `ENHANCE_STATS`（`src/config/weapons.js`）——来源：`02-config-tables.md` Task 4
- `getTier(timeSec)`（`src/config/difficulty.js`）——来源：`02-config-tables.md` Task 4
- index.html 的 `#levelup` 覆盖层与 `.cards`/`.card` 样式——来源：`01-foundation.md` Task 1
- Task 14 的 game.js：game 对象（需含 `{player:{hp,maxHp,xp,level}, weapon:{id,level,enhance:{damage,fireRate,projectiles,range}}, rng, time, kills, paused, pendingLevelUps}`）与 render/onLevelUp 结构——来源：`07-scene-assembly.md` Task 14
- `createEngine(canvas) → {setScene(scene), start()}`——来源：`01-foundation.md` Task 1
- `createInput() → {state:{up,down,left,right}, destroy()}`——来源：`03-world.md` Task 6
- `createGameScene({canvas, input, onLevelUp(game), onGameOver(stats)}) → scene`（onGameOver 的 stats 为 `{time,kills,level}`）——来源：`07-scene-assembly.md` Task 14
- `showLevelUp(rootEl, game, onDone) → void` 与 `formatTime(sec) → "MM:SS"`（menu.js/gameover.js 直接 import 复用，不重实现）——来源：本分册 Task 15

## 3. Task 15: 升级四选一界面与 HUD（levelup.js + hud.js）

**Files:**
- Create: `src/ui/levelup.js`, `src/systems/hud.js`
- Modify: `src/game.js`——render 末尾的内联 HUD 块替换为 `renderHud(ctx, scene)` 调用（升级暂停逻辑保持不变）；`src/main.js`（Task 14 临时版）——onLevelUp 回调从 console.log 改为调用 showLevelUp
- Test: `test/levelup.test.js`, `test/hud.test.js`（仅纯函数 `cardLabel` / `formatTime`；`showLevelUp`/`renderHud` 需真实 DOM/canvas，不进单测）

（Interfaces 已收录于 §2；此处保留约束原文。）

约束：`src/ui/levelup.js`、`src/systems/hud.js` 不 import 任何 DOM API（`document`/canvas 只在函数体内使用），保证 `node --test` 可 import；抽卡用 `game.rng`（Task 14 注入的 `mulberry32` 实例），禁止 `Math.random`。

- [x] **Step 1: 写失败测试（cardLabel + formatTime）**

```js
// test/levelup.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardLabel } from '../src/ui/levelup.js';

test('enhance 卡：标题武器强化，描述为 STAT_LABEL[stat]', () => {
  assert.deepEqual(cardLabel({ type: 'enhance', stat: 'damage' }), { title: '武器强化', desc: '伤害 +25%' });
  assert.deepEqual(cardLabel({ type: 'enhance', stat: 'fireRate' }), { title: '武器强化', desc: '攻速 +20%' });
  assert.deepEqual(cardLabel({ type: 'enhance', stat: 'projectiles' }), { title: '武器强化', desc: '弹道 +1' });
  assert.deepEqual(cardLabel({ type: 'enhance', stat: 'range' }), { title: '武器强化', desc: '攻击范围 +20%' });
});

test('swap 卡：标题更换武器，描述为目标武器名 + 从 Lv1 开始', () => {
  assert.deepEqual(cardLabel({ type: 'swap', weapon: 'mg' }), { title: '更换武器', desc: '机枪（从 Lv1 开始）' });
  assert.deepEqual(cardLabel({ type: 'swap', weapon: 'rifle' }), { title: '更换武器', desc: '步枪（从 Lv1 开始）' });
});

test('heal 卡：标题急救包，描述为立即回复 50% HP', () => {
  assert.deepEqual(cardLabel({ type: 'heal' }), { title: '急救包', desc: '立即回复 50% HP' });
});
```

```js
// test/hud.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime } from '../src/systems/hud.js';

test('formatTime 三个样例', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(600), '10:00');
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/levelup.test.js test/hud.test.js`
Expected: FAIL，找不到 `../src/ui/levelup.js` 与 `../src/systems/hud.js`

- [x] **Step 3: 实现（cardLabel + formatTime）**

```js
// src/ui/levelup.js
// 升级四选一覆盖层。cardLabel 为纯函数（可单测）；showLevelUp 为 DOM 组装，在 DOM 步骤追加。
import { WEAPONS, STAT_LABEL } from '../config/weapons.js';

export function cardLabel(card) {
  if (card.type === 'enhance') return { title: '武器强化', desc: STAT_LABEL[card.stat] };
  if (card.type === 'swap') return { title: '更换武器', desc: WEAPONS[card.weapon].name + '（从 Lv1 开始）' };
  return { title: '急救包', desc: '立即回复 50% HP' };
}
```

```js
// src/systems/hud.js
// HUD 渲染（屏幕空间）+ formatTime 纯函数。renderHud 在 DOM 步骤追加。
export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/levelup.test.js test/hud.test.js`
Expected: 全 PASS（levelup 3 个用例 + hud 1 个用例）

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 升级卡文案与 HUD 时间格式化（纯函数）"
```

- [x] **Step 6: 实现 DOM 部分（showLevelUp + renderHud + game.js 修改）**

**① src/ui/levelup.js 追加 showLevelUp：**

(1) 将顶部 import 区
```js
import { WEAPONS, STAT_LABEL } from '../config/weapons.js';
```
改为
```js
import { WEAPONS, ENHANCE_STATS, STAT_LABEL } from '../config/weapons.js';
import { drawCards, applyCard } from '../systems/progression.js';
```

(2) 文件末尾追加：

```js
export function showLevelUp(rootEl, game, onDone) {
  rootEl.classList.remove('hidden');
  function render() {
    rootEl.replaceChildren();
    // build 栏：当前武器名 + Lv + 各维度增强次数
    const build = document.createElement('div');
    build.className = 'build';
    const head = document.createElement('div');
    head.className = 'build-head';
    head.textContent = WEAPONS[game.weapon.id].name + ' · Lv' + game.weapon.level;
    build.appendChild(head);
    for (const stat of ENHANCE_STATS) {
      const line = document.createElement('div');
      line.className = 'build-stat';
      line.textContent = STAT_LABEL[stat] + ' ×' + game.weapon.enhance[stat];
      build.appendChild(line);
    }
    rootEl.appendChild(build);
    // 4 张卡
    const cards = drawCards(game.weapon, game.rng);
    const wrap = document.createElement('div');
    wrap.className = 'cards';
    for (const card of cards) {
      const el = document.createElement('div');
      el.className = 'card';
      const { title, desc } = cardLabel(card); // desc 即目标标注：enhance 标出受强化的 stat，swap 标出目标武器
      const h = document.createElement('h3');
      h.textContent = title;
      const p = document.createElement('p');
      p.textContent = desc;
      el.appendChild(h);
      el.appendChild(p);
      el.addEventListener('click', () => {
        applyCard(game, card);
        game.pendingLevelUps--;
        if (game.pendingLevelUps > 0) {
          render(); // 连升多级：重新抽 4 张
        } else {
          rootEl.classList.add('hidden');
          game.paused = false;
          onDone();
        }
      });
      wrap.appendChild(el);
    }
    rootEl.appendChild(wrap);
  }
  render();
}
```

**② src/systems/hud.js 追加 renderHud：**

(1) 顶部 import 区追加：
```js
import { xpNeed } from './progression.js';
import { getTier } from '../config/difficulty.js';
import { WEAPONS, ENHANCE_STATS, STAT_LABEL } from '../config/weapons.js';
```

(2) 文件末尾追加：

```js
export function renderHud(ctx, game) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const barW = 220, barH = 16, mx = 16, my = 16;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  // 左上：血条（底 #533、条 #4d4，标注 hp/maxHp 数字）
  ctx.fillStyle = '#533';
  ctx.fillRect(mx, my, barW, barH);
  const hpFrac = Math.max(0, Math.min(1, game.player.hp / game.player.maxHp));
  ctx.fillStyle = '#4d4';
  ctx.fillRect(mx, my, barW * hpFrac, barH);
  ctx.fillStyle = '#fff';
  ctx.fillText(game.player.hp + '/' + game.player.maxHp, mx + barW / 2, my + 13);
  // 血条下方：经验条（底 #334、条 #5ef，填充比例 = xp/xpNeed(level)，标注 Lv）
  const ey = my + barH + 8;
  ctx.fillStyle = '#334';
  ctx.fillRect(mx, ey, barW, barH);
  const need = xpNeed(game.player.level);
  const xpFrac = Math.max(0, Math.min(1, game.player.xp / need));
  ctx.fillStyle = '#5ef';
  ctx.fillRect(mx, ey, barW * xpFrac, barH);
  ctx.fillStyle = '#fff';
  ctx.fillText('Lv' + game.player.level, mx + barW / 2, ey + 13);
  // 右上：计时 + 难度档 + 击杀数
  ctx.textAlign = 'right';
  ctx.fillText(formatTime(game.time) + ' · 难度档 ' + getTier(game.time), W - 16, 24);
  ctx.fillText('击杀 ' + game.kills, W - 16, 44);
  // 左下：武器名 + Lv + enhance 各维次数
  ctx.textAlign = 'left';
  ctx.fillText(WEAPONS[game.weapon.id].name + ' · Lv' + game.weapon.level, mx, H - 8);
  ctx.fillText(ENHANCE_STATS.map(s => STAT_LABEL[s] + '×' + game.weapon.enhance[s]).join('  '), mx, H - 24);
}
```

**③ 修改 src/game.js 与 src/main.js（game.js 只接 HUD，弹窗接线在 main.js）：**

(1) src/game.js 顶部 import 区追加：
```js
import { renderHud } from './systems/hud.js';
```

(2) src/game.js：删除 Task 14 的 formatTime 辅助函数和 render 末尾的内联 HUD 绘制块（血条/经验条/计时/击杀/武器信息等绘制语句），替换为：
```js
renderHud(ctx, scene); // 屏幕空间绘制，必须在 camera 变换 ctx.restore() 之后调用
```
game.js 的升级流程（`pendingLevelUps` 计数、`paused` 置位、`onLevelUp(scene)` 回调触发）保持 Task 14 原样**不变**。**禁止在 game.js 里调 showLevelUp**——弹窗由 main.js 的 onLevelUp 回调负责，在 game.js 里再调一次会造成双重弹窗。

(3) src/main.js（Task 14 的临时版）：顶部 import 区追加：
```js
import { showLevelUp } from './ui/levelup.js';
```
并将 createGame 的 onLevelUp 回调改为：
```js
onLevelUp: g => { showLevelUp(document.getElementById('levelup'), g, () => {}); }
```
（覆盖层的显示/隐藏与 `paused` 复位由 showLevelUp 内部处理；Task 16 会用正式版 main.js 整体替换此临时版，接线方式保持一致）

- [x] **Step 7: 人工验证清单（DOM 部分）**

Run: `npx serve .` 启动，浏览器打开后逐项确认：

- [ ] 进入战斗击杀僵尸拾取经验，升到 Lv2 时 `#levelup` 覆盖层弹出，且弹出期间游戏暂停（僵尸不再移动）
- [ ] 覆盖层含 build 栏：当前武器名 + Lv + 4 个维度增强次数（如「手枪 · Lv2」+「伤害 +25% ×1」等）
- [ ] 显示 4 张卡：enhance 卡标题「武器强化」、描述为对应 stat 文案（如「伤害 +25%」）；swap 卡标题「更换武器」、描述为目标武器名（如「机枪（从 Lv1 开始）」）；必要时 heal 卡「急救包 / 立即回复 50% HP」；卡片 hover 有高亮边框
- [ ] 点 enhance 卡：武器 `level + 1`、对应维度次数 +1，build 栏刷新
- [ ] 点 swap 卡：武器变为目标 id 且 Lv1、enhance 全 0，build 栏刷新
- [ ] 点 heal 卡：hp 回复 maxHp 的 50% 且不超过上限
- [ ] 连升多级（如一次拾取大量经验）时：选完一张后重新抽 4 张再次弹出，循环直至 `pendingLevelUps` 归零后覆盖层隐藏、游戏恢复
- [ ] HUD 左上血条：底 `#533`、绿色条 `#4d4`、中央标注 `hp/maxHp` 数字，受伤时变短
- [ ] HUD 经验条：底 `#334`、蓝色条 `#5ef`、标注 `LvN`，拾取经验时增长
- [ ] HUD 右上：计时按 `MM:SS` 递增、难度档数字在整 180 秒跨档、击杀数随击杀增长
- [ ] HUD 左下：武器名 + Lv + 各维度次数，与覆盖层 build 栏一致

- [x] **Step 8: 提交**

```bash
git add -A && git commit -m "feat: 升级四选一界面与 HUD"
```

### Task 15 验收

- 单测：`test/levelup.test.js` **3 条**（enhance 卡 / swap 卡 / heal 卡文案）+ `test/hud.test.js` **1 条**（formatTime 三个样例），共 4 条——仅覆盖纯函数 `cardLabel` / `formatTime`；`showLevelUp`/`renderHud` 需真实 DOM/canvas，不进单测
- 运行命令：`node --test test/levelup.test.js test/hud.test.js`（全量回归：`npm test`）
- 人工验证清单：上方 Step 7 原位保留（11 项）

## 4. Task 16: 菜单、结算、最高分存档与最终接线（menu.js + gameover.js + storage.js + main.js 正式版）

**Files:**
- Create: `src/core/storage.js`, `src/ui/menu.js`, `src/ui/gameover.js`
- Modify: `src/main.js`（重写 Task 14 的临时版为正式接线版）
- Test: `test/storage.test.js`

（Interfaces 已收录于 §2；本 Task 无额外约束段。）

- [x] **Step 1: 写失败测试**

```js
// test/storage.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateBest } from '../src/core/storage.js';

test('首次纪录必然 isNew=true 且写入 endless', () => {
  const best = {};
  const r = updateBest(best, { time: 60, kills: 10, level: 3 });
  assert.equal(r.isNew, true);
  assert.deepEqual(r.best.endless, { time: 60, kills: 10, level: 3 });
});

test('更长时间刷新纪录', () => {
  const best = { endless: { time: 60, kills: 10, level: 3 } };
  const r = updateBest(best, { time: 90, kills: 20, level: 5 });
  assert.equal(r.isNew, true);
  assert.deepEqual(r.best.endless, { time: 90, kills: 20, level: 5 });
});

test('更短时间不刷新：返回原 best 引用不变且 isNew=false', () => {
  const best = { endless: { time: 90, kills: 20, level: 5 } };
  const r = updateBest(best, { time: 30, kills: 99, level: 9 });
  assert.equal(r.isNew, false);
  assert.equal(r.best, best); // 引用不变
  assert.deepEqual(best.endless, { time: 90, kills: 20, level: 5 }); // 内容不变
});

test('入参对象不被修改', () => {
  const best = { endless: { time: 60, kills: 10, level: 3 } };
  const stats = { time: 120, kills: 30, level: 7 };
  updateBest(best, stats);
  assert.deepEqual(best, { endless: { time: 60, kills: 10, level: 3 } });
  assert.deepEqual(stats, { time: 120, kills: 30, level: 7 });
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/storage.test.js`
Expected: FAIL，找不到 `../src/core/storage.js`

- [x] **Step 3: 实现**

```js
// src/core/storage.js
// 最高分存档：updateBest 为纯函数（可单测）；
// loadBest/saveBest 触碰 localStorage，仅浏览器可用，try/catch + typeof 守卫保证 Node 下不炸。
const KEY = 'zs_best';

export function updateBest(best, stats) {
  const old = best.endless;
  if (!old || stats.time > old.time) {
    return {
      best: { ...best, endless: { time: stats.time, kills: stats.kills, level: stats.level } },
      isNew: true,
    };
  }
  return { best, isNew: false };
}

export function loadBest() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

export function saveBest(best) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, JSON.stringify(best));
  } catch { /* 存储不可用（隐私模式等）时静默忽略 */ }
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/storage.test.js`
Expected: 4 个用例全 PASS（`loadBest`/`saveBest` 依赖 localStorage，留待 Step 8 人工验证）

- [x] **Step 5: 实现 src/ui/menu.js（DOM 覆盖层，无单测）**

```js
// src/ui/menu.js —— 主菜单覆盖层（DOM 胶水，无单测）
import { formatTime } from '../systems/hud.js';

export function showMenu(rootEl, best, onStart) {
  const endless = best.endless;
  const bestText = endless
    ? `最佳纪录：存活 ${formatTime(endless.time)} / 击杀 ${endless.kills} / Lv ${endless.level}`
    : '暂无纪录';
  rootEl.innerHTML = `
    <h1>Zombie Survivor</h1>
    <p id="menu-best">${bestText}</p>
    <button id="menu-start">无尽模式</button>
  `;
  rootEl.classList.remove('hidden');
  rootEl.querySelector('#menu-start').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onStart();
  });
}
```

- [x] **Step 6: 实现 src/ui/gameover.js（DOM 覆盖层，无单测）**

```js
// src/ui/gameover.js —— 结算覆盖层（DOM 胶水，无单测）
import { formatTime } from '../systems/hud.js';

export function showGameOver(rootEl, stats, isNew, onRestart, onMenu) {
  rootEl.innerHTML = `
    <h2>游戏结束</h2>
    ${isNew ? '<p style="color:#ffd75e;font-size:24px">新纪录！</p>' : ''}
    <p>存活时间：${formatTime(stats.time)}</p>
    <p>击杀数：${stats.kills}</p>
    <p>等级：Lv ${stats.level}</p>
    <button id="gameover-restart">再来一局</button>
    <button id="gameover-menu">回主菜单</button>
  `;
  rootEl.classList.remove('hidden');
  rootEl.querySelector('#gameover-restart').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onRestart();
  });
  rootEl.querySelector('#gameover-menu').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onMenu();
  });
}
```

- [x] **Step 7: 重写 src/main.js 为正式版（替换 Task 14 临时版）**

```js
// src/main.js（正式版：主菜单 → 战斗 → 结算/重开 全流程接线；Task 14 临时版被替换）
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { updateBest, loadBest, saveBest } from './core/storage.js';
import { createGameScene } from './game.js';
import { showMenu } from './ui/menu.js';
import { showLevelUp } from './ui/levelup.js';
import { showGameOver } from './ui/gameover.js';

const canvas = document.getElementById('game');
const menuEl = document.getElementById('menu');
const levelupEl = document.getElementById('levelup');
const gameoverEl = document.getElementById('gameover');

const engine = createEngine(canvas);
const input = createInput();

function hideOverlays() {
  document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
}

function startGame() {
  hideOverlays();
  engine.setScene(createGameScene({
    canvas,
    input,
    onLevelUp: game => showLevelUp(levelupEl, game, () => {}), // 覆盖层显示/隐藏由 showLevelUp 内部管理，勿在外层重复 remove('hidden')
    onGameOver: stats => {
      const r = updateBest(loadBest(), stats);
      saveBest(r.best);
      showGameOver(gameoverEl, stats, r.isNew, startGame, showMenuScreen);
    },
  }));
}

function showMenuScreen() {
  showMenu(menuEl, loadBest(), startGame);
}

showMenuScreen();
engine.start();
```

- [x] **Step 8: 人工验证清单（菜单/结算覆盖层，DOM 层无单测）**

Run: `npx serve .`，浏览器打开提示地址（默认 http://localhost:3000），F12 观察 console，逐项核对：
- [ ] 首次打开显示主菜单：标题『Zombie Survivor』+『无尽模式』按钮 +『暂无纪录』，无控制台报错
- [ ] 点击『无尽模式』：菜单隐藏，进入战斗（Task 14 场景），WASD 移动与自动射击正常
- [ ] 死亡后出现结算覆盖层：显示 存活时间 / 击杀数 / 等级；刷新纪录时出现金色『新纪录！』
- [ ] 点击『再来一局』：结算隐藏，新场景重开（时间归零、僵尸清空、经验重置）
- [ ] 点击『回主菜单』：回到主菜单，最佳纪录文案已更新为 `存活 MM:SS / 击杀 N / Lv N`（取自 localStorage）
- [ ] 刷新浏览器页面后再进主菜单：最佳纪录仍在（localStorage 持久化）
- [ ] 升级时四选一覆盖层弹出正常，点选后卡片消失、游戏继续
- [ ] 全程 console 无报错

- [x] **Step 9: 全量回归**

Run: `node --test`（无参数自动发现，见 G§2）
Expected: 全部任务（Task 1–16 累计）用例全 PASS，含本次新增的 4 个 storage 用例

- [x] **Step 10: 人工验收（spec §12 MVP 标准逐条）**

Run: `npx serve .`，浏览器按 MVP 完整流程走一遍：
- [ ] 浏览器打开 → 主菜单（标题、按钮、最佳纪录文案正常）
- [ ] 主菜单选『无尽模式』进入游戏
- [ ] WASD / 方向键移动（斜向不加速、边界夹紧、障碍阻挡）
- [ ] 武器自动索敌射击（弹道命中僵尸有闪白/伤害数字/击退）
- [ ] 僵尸从四面环形涌来并持续追踪（新手保护期后规模渐增）
- [ ] 击杀掉落经验球，靠近自动磁吸拾取
- [ ] 升级弹出四选一卡片，点选后即时生效（伤害/攻速/弹道/范围提升可见）
- [ ] 血量归零死亡 → 出结算界面（存活时间/击杀数/等级）
- [ ] 『再来一局』可完整重开一局；回主菜单后最佳纪录刷新
- [ ] 最高分写入 localStorage，刷新页面后仍在（破纪录时结算显示『新纪录！』）
- [ ] 全程无控制台报错、帧率稳定（同屏僵尸 ≤300 / 子弹 ≤400 / 粒子 ≤500 预算内不卡顿）

- [x] **Step 11: 提交**

```bash
git add -A && git commit -m "feat: 菜单/结算/最高分存档，MVP 完整可玩"
```

### Task 16 验收

- 单测：`test/storage.test.js` 共 **4 条**（首次纪录 / 更长时间刷新 / 更短时间不刷新且引用不变 / 入参对象不被修改）；`loadBest`/`saveBest` 依赖 localStorage，不进单测、留待 Step 8 人工验证
- 运行命令：`node --test test/storage.test.js`；全量回归（Step 9）：`node --test`（无参数自动发现，见 G§2）——Task 1–16 累计用例全 PASS，含本次新增 4 条
- 人工清单：Step 8（菜单/结算覆盖层，8 项）与 Step 10（spec §12 MVP 标准逐条，11 项）均在上方原位保留

## 5. 歧义裁决（本模块）

| # | 易误解点 | 裁定 | 来源 |
|---|---|---|---|
| 1 | `#levelup` 覆盖层的 hidden 显隐由谁管理 | `showLevelUp` 自管：进入时 `remove('hidden')`，`pendingLevelUps` 归零时 `add('hidden')`；调用方（main.js）不得重复 `remove('hidden')`。且弹窗只能由 main.js 的 onLevelUp 回调触发，**game.js 禁止调 showLevelUp**——两条都是防「双重弹窗」的硬性约束（源文 Step 6③(2)/(3) 与 main.js 正式版注释均明示） | 拆分裁定 |
| 2 | 连升多级（`pendingLevelUps > 1`）时覆盖层行为 | 每次点卡先 `applyCard(game, card)` 再 `game.pendingLevelUps--`；仍 `> 0` 则重新抽 4 张并整体重渲染（重新抽卡读取的是点卡后的最新 `game.weapon`，选了 swap 卡后按新武器抽），build 栏随之刷新；归零才 `add('hidden')` + `game.paused = false` + `onDone()`，中途不解除暂停 | 拆分裁定 |
| 3 | 覆盖层抽卡用什么随机源 | `showLevelUp` 内 `drawCards(game.weapon, game.rng)`——一律用 Task 14 注入的 `mulberry32` 实例（同种子可复现抽卡序列），禁止 `Math.random`（G§4；本分册 DOM 层亦无 Math.random 豁免） | 拆分裁定 |
| 4 | `updateBest` 的纯度与 `loadBest`/`saveBest` 的健壮性 | `updateBest` 纯函数：不修改任何入参；非新纪录时返回**原 best 引用**（`r.best === best`，测试断言引用相等）。`loadBest`/`saveBest` 带 `typeof localStorage === 'undefined'` 守卫 + try/catch：Node 测试环境与浏览器隐私模式均不炸；读取失败/无纪录返回 `{}`，写入失败静默忽略 | 拆分裁定 |
| 5 | 「新纪录」的判定标准 | 仅比较无尽模式的 `time`（`stats.time > best.endless.time`）；`kills`/`level` 不参与——击杀再高、等级再高，存活时间不破纪录就不是新纪录 | 拆分裁定 |
| 6 | 「再来一局」如何重置游戏状态 | `startGame` 每次新建 `createGameScene(...)` 整场景替换（`engine`/`input` 为模块级单例复用；场景自身无外部监听器，MVP 接受无显式 destroy）——时间归零、僵尸清空、经验重置由新场景天然获得，不做逐字段 reset | 拆分裁定 |
| 7 | `showLevelUp` 第三参在两处签名不一致 | Task 16 Consumes 写作 `onPick`、Task 15 Produces 与实现代码写作 `onDone`——同一参数（`pendingLevelUps` 归零、覆盖层隐藏、`paused` 复位之后调用的回调），以 Task 15 签名 `onDone` 为准；MVP 两版 main.js 均传 `() => {}` 空函数，该回调为未来扩展预留 | 源文隐含·本次明示 |
| 8 | 存活时间相等（平纪录）是否刷新 | 否：判定用严格大于 `>`，`stats.time === best.endless.time` 时 `isNew=false` 且返回原 best 引用；刷新纪录需严格更长存活 | 源文隐含·本次明示 |
| 9 | `renderHud` 的 `game` 形参与 game.js 调用处的 `scene` 实参 | 同一对象：`createGameScene` 返回的 scene 即 game 对象（含 `{player, weapon, rng, time, kills, paused, pendingLevelUps}`），签名用 `game`、game.js 调用处写 `renderHud(ctx, scene)` 只是两个名字，不构成两种对象 | 源文隐含·本次明示 |
| 10 | `renderHud` 的调用时机与对 ctx 状态的影响 | 屏幕空间绘制，必须在 camera 变换 `ctx.restore()` 之后调用（game.js 中为 render 的最后一个绘制调用）；它会修改 ctx 的 `font`/`textAlign`/`fillStyle` 且不做 save/restore——调用方不得在其之后再依赖 ctx 状态，也不得把它插到世界绘制中间 | 源文隐含·本次明示 |
| 11 | `formatTime` 的取整方式与入参范围 | 分与秒分别 `Math.floor` 截断（非四舍五入），浮点累计的 `game.time` 可直接传入；入参约定非负（游戏内时间恒非负），负值行为未定义、无需补守卫 | 源文隐含·本次明示 |
| 12 | best 存档的数据结构与范围 | 固定键 `'zs_best'`、结构 `{ endless: { time, kills, level } }`，仅无尽模式一项；spec §10 的坚守模式纪录与设置项不在 MVP（后续期），不得往该结构里扩展字段 | 源文隐含·本次明示 |
| 13 | `showMenu`/`showGameOver` 重复调用是否泄漏监听器 | 否：两者每次调用都用 `innerHTML` 整体重建子树，按钮监听器挂在新建的按钮元素上，旧按钮随重建销毁——重复进出菜单/结算不会累积 click 监听 | 源文隐含·本次明示 |
| 14 | `hideOverlays` 的职责 | `startGame` 开头给**所有** `.overlay` 加 `hidden`——兜底清掉上一局可能残留的 levelup/gameover 覆盖层；菜单/结算按钮回调里的隐藏只是即时反馈，不承担全局清场职责 | 源文隐含·本次明示 |
