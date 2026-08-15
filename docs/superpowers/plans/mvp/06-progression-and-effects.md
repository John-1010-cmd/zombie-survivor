# 经验球与四选一抽卡、打击感特效（Task 12–13）

> 上游：spec §4.1（拾取半径）、§4.6（经验与四选一升级）、§7（打击感：死亡粒子飞溅、浮动伤害数字）；全局约束：`00-global-constraints.md`（简写 G§n）；索引：`README.md`。
> 执行前置：须已完成 Task 1–11（见 `01-foundation.md` Task 1–3、`02-config-tables.md` Task 4、`03-world.md` Task 5–6、`04-entities.md` Task 7–9、`05-combat-systems.md` Task 10–11）；本分册直接消费 Task 2（rng）、Task 4（weapons 配置）、Task 9（weapon 实体）的产出。

## 1. 目标与范围

本分册交付成长循环与打击感反馈的三个纯逻辑模块及配套单测：`src/entities/xpGem.js`（经验球磁吸拾取）、`src/systems/progression.js`（经验曲线、四选一抽卡、卡牌应用）、`src/entities/effects.js`（死亡粒子爆发 + 浮动伤害数字及其渲染辅助）。三者均属 G§3 纯逻辑层（`node --test` 可 import；`renderParticles`/`renderFloaters` 只接收外部传入的 ctx，模块顶层不触碰 DOM）。在架构中位于战斗系统（`05-combat-systems.md`）之后、场景组装（`07-scene-assembly.md` Task 14）之前：xpGem 与 effects 的数组由 game.js 每帧驱动；`drawCards`/`applyCard` 由升级覆盖层（`08-ui-and-persistence.md` Task 15）在选卡时调用。不交付：spec §4.6 的辅助/道具类卡与真实消耗品卡、满血时医疗包替换为磁铁/炸弹（G§7.1/G§7.2，第 2/3 期）、每局 2 次刷新机会（spec §4.6，第 3 期）、震屏（camera 属 `03-world.md` Task 6）、经验球/粒子/浮字的场景接线与触发时机（Task 14）。本分册文件清单：`src/entities/xpGem.js`、`src/systems/progression.js`、`src/entities/effects.js`、`test/xpGem.test.js`、`test/progression.test.js`、`test/effects.test.js`。

## 2. 契约

### 2.1 提供（Produces）

- `createGem(x, y, value) → {x, y, r: 8, value, alive: true}`（Task 12）
- `updateGem(g, player, dt) → bool`（是否被拾取）：`d = 与 player 的距离`；`d < player.pickupRadius` 时以 400px/s 向玩家移动；`d < player.r + g.r + 10` 或本步移动会越过玩家时 `g.alive = false` 且返回 `true`（Task 12）
- `xpNeed(level) → number`：`10 + (level - 1) × 7`（Task 12）
- `addXp(player, amount) → 升级次数`（循环：`xp >= xpNeed(level)` 则扣减、`level++`、计数++）（Task 12）
- `drawCards(weapon, rng) → 4 张卡数组`（抽卡规则见 Task 12 节）（Task 12）
- `applyCard(game, card)`——game 形如 `{player, weapon}`（Task 12）
- `spawnParticles(arr, x, y, color, n, rng)`——原地推入 n 个粒子 `{x, y, vx, vy, life:0.4, maxLife:0.4, color, r:2+rng()*2}`；方向 rng 随机（`[0, 2π)`）、速率 `[60, 180]`（Task 13）
- `updateParticles(arr, dt)`——按 vx/vy 位移、`life -= dt`，`life <= 0` 的粒子交换删除（swap-remove，原地压缩数组）（Task 13）
- `spawnFloater(arr, x, y, text, color)`——原地推入 `{x, y, text, color, life:0.7}`（Task 13）
- `updateFloaters(arr, dt)`——`y -= 40*dt`（上浮）、`life -= dt`，死亡即 swap-remove（Task 13）
- `renderParticles(ctx, arr)` / `renderFloaters(ctx, arr)`——渲染辅助：`fillRect`/`fillText` + `globalAlpha` 随 life 衰减（需真实 canvas ctx，不进单测，联调时人工验证）（Task 13）

### 2.2 消费（Consumes）

- `pickWeighted(rng, weights) → key`——drawCards 对池内下标做不放回等概率抽取（`01-foundation.md` Task 2）
- `mulberry32(seed) → () => number[0,1)`——测试代码注入可复现随机源；effects 实现按注入约定接收 rng 参数、不 import 它（`01-foundation.md` Task 2）
- `WEAPONS` / `WEAPON_MAX_LEVEL` / `ENHANCE_STATS`——抽卡候选池构成与满级判定（`02-config-tables.md` Task 4）
- `createWeapon(id) → weapon`、`applyEnhancement(weapon, stat)`——applyCard 的 swap / enhance 分支调用；本任务测试依赖其两条契约：`createWeapon` 产出的武器 `level === 1`；`applyEnhancement` 使 `weapon.level` 递增 1——spec §4.2「等级 = 已获得的增强卡数量 + 1」。若 Task 9 尚未完成，先完成 Task 9 再执行本任务（源计划原文）（`04-entities.md` Task 9）
- 对象形状引用（不调用其函数）：player 需含 `{x, y, r, pickupRadius, xp, level, hp, maxHp}`（xpGem 用 `x/y/r/pickupRadius`，progression 用 `xp/level/hp/maxHp`；`04-entities.md` Task 7 的 `createPlayer` 产出）

## 3. Task 12: 经验球与升级抽卡（xpGem.js + progression.js）

**Files:**
- Create: `src/entities/xpGem.js`, `src/systems/progression.js`
- Test: `test/xpGem.test.js`, `test/progression.test.js`

**抽卡规则**（MVP 裁剪，spec §4.6 只保留三类）：

- 候选池：`weapon.level < WEAPON_MAX_LEVEL` 时，对 `ENHANCE_STATS` 的每个 stat 加入一张 `{type:'enhance', stat}`（每张权重 10，共 4 张）
- 对 `WEAPONS` 中每个非当前 `weapon.id`，加入一张 `{type:'swap', weapon: id}`（每张权重 10）
- 用 `pickWeighted` 对池内下标不放回抽 4 张（池内权重均为 10，即等概率去重抽取，故不重复）
- 池不足 4 张时用 `{type:'heal'}` 补足（允许重复，这是 MVP 的兜底：升级永远有收益）

本 Task 含两个独立 TDD 循环：先 xpGem.js，后 progression.js（各以一次提交收尾，Step 编号沿用源计划、各自从 1 起）。

**子循环 A —— `src/entities/xpGem.js`**

- [x] **Step 1: 写失败测试（xpGem）**

```js
// test/xpGem.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGem, updateGem } from '../src/entities/xpGem.js';

const PLAYER = { x: 0, y: 0, r: 16, pickupRadius: 80 };

test('createGem 初始字段完整', () => {
  const g = createGem(100, 200, 3);
  assert.equal(g.x, 100);
  assert.equal(g.y, 200);
  assert.equal(g.r, 8);
  assert.equal(g.value, 3);
  assert.equal(g.alive, true);
});

test('拾取半径外静止不动', () => {
  const g = createGem(100, 0, 1); // 距离 100 > 80
  assert.equal(updateGem(g, PLAYER, 0.5), false);
  assert.equal(g.x, 100);
  assert.equal(g.alive, true);
});

test('磁吸范围内以 400px/s 靠近，未接触不拾取', () => {
  const g = createGem(50, 0, 1); // 距离 50 < 80；0.1s 移动 40 → 剩 10
  assert.equal(updateGem(g, PLAYER, 0.1), false);
  assert.ok(Math.abs(g.x - 10) < 1e-9);
  assert.equal(g.alive, true);
});

test('进入接触距离即拾取：alive=false 且返回 true', () => {
  const g = createGem(30, 0, 1); // 30 < 16 + 8 + 10 = 34
  assert.equal(updateGem(g, PLAYER, 0.1), true);
  assert.equal(g.alive, false);
});

test('本步移动会越过玩家时直接拾取', () => {
  const g = createGem(50, 0, 1); // step = 400 × 0.5 = 200 ≥ 50
  assert.equal(updateGem(g, PLAYER, 0.5), true);
  assert.equal(g.alive, false);
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/xpGem.test.js`
Expected: FAIL，找不到 `../src/entities/xpGem.js`

- [x] **Step 3: 实现**

```js
// src/entities/xpGem.js
const MAGNET_SPEED = 400; // 磁吸速度 px/s

export function createGem(x, y, value) {
  return { x, y, r: 8, value, alive: true };
}

export function updateGem(g, player, dt) {
  const dx = player.x - g.x, dy = player.y - g.y;
  const d = Math.hypot(dx, dy);
  if (d >= player.pickupRadius) return false; // 磁吸范围外不动
  const step = MAGNET_SPEED * dt;
  if (d < player.r + g.r + 10 || step >= d) { // 接触，或本步会越过玩家
    g.alive = false;
    return true;
  }
  g.x += dx / d * step;
  g.y += dy / d * step;
  return false;
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/xpGem.test.js`
Expected: 5 个用例全 PASS

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 经验球磁吸拾取"
```

**子循环 B —— `src/systems/progression.js`**

- [x] **Step 1: 写失败测试（progression）**

```js
// test/progression.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { WEAPONS, WEAPON_MAX_LEVEL } from '../src/config/weapons.js';
import { createWeapon } from '../src/entities/weapon.js';
import { xpNeed, addXp, drawCards, applyCard } from '../src/systems/progression.js';

test('xpNeed 曲线：10、17、24、31', () => {
  assert.equal(xpNeed(1), 10);
  assert.equal(xpNeed(2), 17);
  assert.equal(xpNeed(3), 24);
  assert.equal(xpNeed(4), 31);
});

test('一次加 100 经验连升多级且返回正确次数', () => {
  const p = { xp: 0, level: 1 };
  const n = addXp(p, 100);
  assert.equal(n, 4); // 10 + 17 + 24 + 31 = 82，余 18 不足第 5 级所需 38
  assert.equal(p.level, 5);
  assert.equal(p.xp, 18);
});

test('经验恰好达到所需时正好升一级，余量归零', () => {
  const p = { xp: 0, level: 1 };
  assert.equal(addXp(p, xpNeed(1)), 1);
  assert.equal(p.level, 2);
  assert.equal(p.xp, 0);
});

test('drawCards 恒返回 4 张，非 heal 卡按 type+stat/weapon 判重不重复', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const cards = drawCards(createWeapon('pistol'), mulberry32(seed));
    assert.equal(cards.length, 4);
    const keys = cards
      .filter(c => c.type !== 'heal')
      .map(c => c.type + ':' + (c.stat || c.weapon));
    assert.equal(new Set(keys).size, keys.length, `seed=${seed} 出现重复卡 ${JSON.stringify(cards)}`);
  }
});

test('同种子抽卡结果可复现', () => {
  const a = drawCards(createWeapon('rifle'), mulberry32(7));
  const b = drawCards(createWeapon('rifle'), mulberry32(7));
  assert.deepEqual(a, b);
});

test('weapon.level=8 时池里无 enhance 卡，heal 补足 2 张', () => {
  const w = createWeapon('pistol');
  w.level = WEAPON_MAX_LEVEL;
  const cards = drawCards(w, mulberry32(1));
  assert.equal(cards.length, 4);
  assert.equal(cards.filter(c => c.type === 'enhance').length, 0);
  assert.equal(cards.filter(c => c.type === 'swap').length, 2); // rifle + mg
  assert.equal(cards.filter(c => c.type === 'heal').length, 2);
});

test('只有 1 种武器可换时 4 张中含 heal 填充', () => {
  const saved = WEAPONS.mg;
  delete WEAPONS.mg; // 本进程内临时只剩 rifle 可换，finally 恢复
  try {
    const w = createWeapon('pistol');
    w.level = WEAPON_MAX_LEVEL; // 满级 → 池内仅 1 张 swap
    const cards = drawCards(w, mulberry32(1));
    assert.equal(cards.length, 4);
    assert.equal(cards.filter(c => c.type === 'swap').length, 1);
    assert.equal(cards.filter(c => c.type === 'heal').length, 3);
  } finally {
    WEAPONS.mg = saved;
  }
});

test('applyCard swap 后 weapon 为目标 id 且 level=1', () => {
  const game = { player: { hp: 50, maxHp: 100 }, weapon: createWeapon('pistol') };
  applyCard(game, { type: 'swap', weapon: 'mg' });
  assert.equal(game.weapon.id, 'mg');
  assert.equal(game.weapon.level, 1);
});

test('applyCard enhance 使当前武器等级 +1（spec §4.2）', () => {
  const game = { player: { hp: 100, maxHp: 100 }, weapon: createWeapon('pistol') };
  applyCard(game, { type: 'enhance', stat: 'damage' });
  assert.equal(game.weapon.id, 'pistol');
  assert.equal(game.weapon.level, 2);
});

test('applyCard heal 回 maxHp 的 50%，且不超过 maxHp', () => {
  const g1 = { player: { hp: 40, maxHp: 100 }, weapon: null };
  applyCard(g1, { type: 'heal' });
  assert.equal(g1.player.hp, 90);
  const g2 = { player: { hp: 90, maxHp: 100 }, weapon: null };
  applyCard(g2, { type: 'heal' });
  assert.equal(g2.player.hp, 100);
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/progression.test.js`
Expected: FAIL，找不到 `../src/systems/progression.js`

- [x] **Step 3: 实现**

```js
// src/systems/progression.js
import { WEAPONS, WEAPON_MAX_LEVEL, ENHANCE_STATS } from '../config/weapons.js';
import { pickWeighted } from '../core/rng.js';
import { createWeapon, applyEnhancement } from '../entities/weapon.js';

export function xpNeed(level) {
  return 10 + (level - 1) * 7;
}

export function addXp(player, amount) {
  player.xp += amount;
  let count = 0;
  while (player.xp >= xpNeed(player.level)) {
    player.xp -= xpNeed(player.level);
    player.level++;
    count++;
  }
  return count;
}

export function drawCards(weapon, rng) {
  const pool = [];
  if (weapon.level < WEAPON_MAX_LEVEL) {
    for (const stat of ENHANCE_STATS) pool.push({ type: 'enhance', stat });
  }
  for (const id of Object.keys(WEAPONS)) {
    if (id !== weapon.id) pool.push({ type: 'swap', weapon: id });
  }
  const remaining = pool.slice();
  const cards = [];
  while (cards.length < 4 && remaining.length > 0) {
    const weights = {};
    for (let i = 0; i < remaining.length; i++) weights[i] = 10;
    const idx = Number(pickWeighted(rng, weights)); // 对池内下标不放回抽取
    cards.push(remaining.splice(idx, 1)[0]);
  }
  while (cards.length < 4) cards.push({ type: 'heal' }); // MVP 兜底：升级永远有收益
  return cards;
}

export function applyCard(game, card) {
  if (card.type === 'enhance') applyEnhancement(game.weapon, card.stat);
  else if (card.type === 'swap') game.weapon = createWeapon(card.weapon); // 新武器 Lv1
  else game.player.hp = Math.min(game.player.maxHp, game.player.hp + game.player.maxHp * 0.5);
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/progression.test.js`
Expected: 10 个用例全 PASS（若失败来自 `applyEnhancement` 未递增 level 或 `createWeapon` 未产出 `level: 1`，则说明 Task 9 未满足 spec §4.2 契约，先修正 Task 9 再回到本步）

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 经验曲线与四选一升级抽卡"
```

### Task 12 验收

单测 xpGem 5 个 + progression 10 个，共 15 个用例全 PASS；运行命令：`node --test test/xpGem.test.js test/progression.test.js`（源计划本 Task 无人工清单步骤；全量回归归 `09-acceptance.md`）。

## 4. Task 13: 打击感特效（effects.js）

**Files:**
- Create: `src/entities/effects.js`
- Test: `test/effects.test.js`

- [x] **Step 1: 写失败测试**

```js
// test/effects.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { spawnParticles, updateParticles, spawnFloater, updateFloaters } from '../src/entities/effects.js';

test('spawnParticles 生成 n 个且颜色/坐标正确', () => {
  const arr = [];
  spawnParticles(arr, 100, 200, '#ff5533', 10, mulberry32(1));
  assert.equal(arr.length, 10);
  for (const p of arr) {
    assert.equal(p.x, 100);
    assert.equal(p.y, 200);
    assert.equal(p.color, '#ff5533');
    assert.equal(p.life, 0.4);
    assert.equal(p.maxLife, 0.4);
    assert.ok(p.r >= 2 && p.r < 4, `r=${p.r} 应在 [2,4)`);
    const sp = Math.hypot(p.vx, p.vy);
    assert.ok(sp >= 60 && sp <= 180, `速率 ${sp} 应在 [60,180]`);
  }
});

test('同种子粒子序列可复现', () => {
  const a = [], b = [];
  spawnParticles(a, 0, 0, '#fff', 8, mulberry32(42));
  spawnParticles(b, 0, 0, '#fff', 8, mulberry32(42));
  assert.deepEqual(a, b);
});

test('粒子按 vx/vy 位移且 life 递减', () => {
  const arr = [{ x: 0, y: 0, vx: 100, vy: 50, life: 0.4, maxLife: 0.4, color: '#fff', r: 2 }];
  updateParticles(arr, 0.1);
  assert.equal(arr[0].x, 10);
  assert.equal(arr[0].y, 5);
  assert.ok(Math.abs(arr[0].life - 0.3) < 1e-9);
});

test('swap-remove：死亡粒子移除、存活粒子保留', () => {
  const arr = [
    { x: 0, y: 0, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, color: '#fff', r: 2 },
    { x: 0, y: 0, vx: 0, vy: 0, life: 0.1, maxLife: 0.4, color: '#fff', r: 2 },
    { x: 0, y: 0, vx: 0, vy: 0, life: 0.3, maxLife: 0.4, color: '#fff', r: 2 },
  ];
  updateParticles(arr, 0.2); // 中间粒子 0.1-0.2 <= 0 死亡
  assert.equal(arr.length, 2);
  for (const p of arr) assert.ok(p.life > 0);
});

test('life 耗尽后数组收缩且无残留', () => {
  const arr = [];
  spawnParticles(arr, 0, 0, '#fff', 5, mulberry32(2));
  updateParticles(arr, 0.5); // 0.4 - 0.5 <= 0，全部耗尽
  assert.equal(arr.length, 0);
});

test('floater 随时间上浮（y 减小）且最终移除', () => {
  const arr = [];
  spawnFloater(arr, 50, 100, '25', '#ffd75e');
  assert.equal(arr.length, 1);
  assert.deepEqual(arr[0], { x: 50, y: 100, text: '25', color: '#ffd75e', life: 0.7 });
  updateFloaters(arr, 0.5);
  assert.equal(arr[0].y, 100 - 40 * 0.5); // 上浮 20px
  assert.ok(arr[0].y < 100);
  assert.ok(Math.abs(arr[0].life - 0.2) < 1e-9);
  updateFloaters(arr, 1); // 0.2 - 1 <= 0，移除
  assert.equal(arr.length, 0);
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/effects.test.js`
Expected: FAIL，找不到 `../src/entities/effects.js`

- [x] **Step 3: 实现**

```js
// src/entities/effects.js
// 打击感特效：粒子爆发 + 浮动伤害数字。纯逻辑模块，无 DOM 依赖；
// rng 由调用方注入，渲染函数只接收外部 ctx。
export function spawnParticles(arr, x, y, color, n, rng) {
  for (let i = 0; i < n; i++) {
    const angle = rng() * Math.PI * 2;
    const speed = 60 + rng() * 120;
    arr.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4, maxLife: 0.4,
      color,
      r: 2 + rng() * 2,
    });
  }
}

export function updateParticles(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { // swap-remove：末位元素换到 i 后 pop，原地压缩
      arr[i] = arr[arr.length - 1];
      arr.pop();
    }
  }
}

export function spawnFloater(arr, x, y, text, color) {
  arr.push({ x, y, text, color, life: 0.7 });
}

export function updateFloaters(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const f = arr[i];
    f.y -= 40 * dt; // 上浮
    f.life -= dt;
    if (f.life <= 0) {
      arr[i] = arr[arr.length - 1];
      arr.pop();
    }
  }
}

// 渲染辅助：不进单测（需要真实 canvas ctx），联调时人工验证。
// globalAlpha 随 life/maxLife 线性衰减，粒子熄灭前逐渐淡出。
export function renderParticles(ctx, arr) {
  for (const p of arr) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  ctx.globalAlpha = 1;
}

export function renderFloaters(ctx, arr) {
  ctx.textAlign = 'center';
  ctx.font = '14px sans-serif';
  for (const f of arr) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.7));
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/effects.test.js`
Expected: 6 个用例全 PASS（`renderParticles`/`renderFloaters` 需真实 canvas ctx，留待战斗场景联调时人工验证）

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 打击感粒子特效与浮动伤害数字"
```

### Task 13 验收

单测 6 个用例全 PASS；运行命令：`node --test test/effects.test.js`（`renderParticles`/`renderFloaters` 需真实 canvas ctx，不进单测——联调人工验证归 `07-scene-assembly.md` Task 14 与 `09-acceptance.md`；源计划本 Task 无人工清单步骤）。

## 5. 歧义裁决（本模块）

| # | 易误解点 | 裁定 | 来源 |
|---|---|---|---|
| 1 | drawCards 池内权重 10 的含义 | 池内等权重 10 仅是表述习惯，语义=等概率不放回抽取；heal 允许重复出现（池不足 4 时补足，属 MVP 兜底，G§7.2） | 拆分裁定 |
| 2 | addXp 扣减口径 | addXp 用升级前等级的 xpNeed 循环扣减，返回本次连升次数 | 拆分裁定 |
| 3 | swap / heal 语义 | swap 后新武器 Lv1、强化全清（等级不继承）；heal 回 50% maxHp 不溢出；满血时 heal 无收益=已知例外（G§7.2） | 拆分裁定 |
| 4 | swap-remove 不保序 | updateParticles/updateFloaters 的 swap-remove（及上层 gems 拾取清理，见 `07-scene-assembly.md` Task 14）不保序，渲染与逻辑均不得依赖数组顺序 | 拆分裁定 |
| 5 | updateGem 判定顺序与边界 | 先判磁吸范围 `d >= player.pickupRadius`（含等号：恰在半径上静止），再判拾取；接触判定 `d < player.r + g.r + 10`（严格小于，比物理接触 24px 宽 10px 的拾取宽容度），越过判定 `step >= d`（含等号：本步恰好到达玩家也算拾取，测试用 step=200 ≥ 50 验证） | 源文隐含·本次明示 |
| 6 | d=0 不除零 | 球心与玩家重合时 `step >= d` 恒真（step ≥ 0）先行拾取返回，永不执行 `dx/d`、`dy/d` 的除零路径 | 源文隐含·本次明示 |
| 7 | updateGem 不改数组 | updateGem 只改 `g` 自身字段；gems 数组的清理（拾取即帧末 swap-remove）由上层执行（`07-scene-assembly.md` Task 14），与 combat 不管僵尸尸体同一模式（`05-combat-systems.md` 歧义裁决 3） | 源文隐含·本次明示 |
| 8 | pickWeighted key 的还原 | drawCards 以池内下标构造 weights（数字下标成为字符串 key），`Number(pickWeighted(rng, weights))` 还原下标后 `splice` 不放回移除 | 源文隐含·本次明示 |
| 9 | drawCards 不感知玩家状态 | 签名只收 `(weapon, rng)`：玩家满血与否不改变 heal 兜底行为（G§7.2 已知例外）；hp/maxHp 只在 applyCard 的 heal 分支读取 | 源文隐含·本次明示 |
| 10 | 满级时 enhance 卡不可达 | `weapon.level = WEAPON_MAX_LEVEL` 时 drawCards 不产 enhance 卡，正常流程 applyCard('enhance') 不会在满级触发；即便手动触发，applyEnhancement 在满级时忽略（`04-entities.md` Task 9 契约），不报错 | 源文隐含·本次明示 |
| 11 | WEAPONS 是可变单例 | 测试「只有 1 种武器可换时」在进程内 `delete WEAPONS.mg` 并 finally 恢复——WEAPONS 未冻结；swap 候选遍历 `Object.keys(WEAPONS)` 即定义顺序（pistol/rifle/mg） | 源文隐含·本次明示 |
| 12 | applyCard 无返回值 | applyCard 直接改写 `game.player` / `game.weapon`，返回 undefined；选卡后的 UI 状态（重抽/关闭覆盖层）由调用方（`08-ui-and-persistence.md` Task 15）处理 | 源文隐含·本次明示 |
| 13 | 粒子速率值域 | `60 + rng()×120` 且 rng ∈ [0,1) ⇒ 实际速率 ∈ [60,180)（上端开）；测试断言 `<=180` 为宽松上界（与 01 分册 rng 值域一致） | 源文隐含·本次明示 |
| 14 | 逆序遍历的用意 | updateParticles/updateFloaters 倒序遍历 + swap-remove：换到当前 i 的原末位元素本帧已处理过，不会被重复位移/扣 life | 源文隐含·本次明示 |
| 15 | floater 无 maxLife 字段 | floater 对象无 maxLife，renderFloaters 的 alpha 分母硬编码 0.7（与 spawnFloater 初始 life 对应）；只有粒子带 maxLife 字段 | 源文隐含·本次明示 |
| 16 | 渲染函数的 ctx 状态复位 | renderParticles/renderFloaters 结束时复位 `globalAlpha = 1`；但 renderFloaters 设置的 `textAlign='center'`/`font='14px sans-serif'` 不复位，遗留到 ctx 状态，由后续绘制自行覆盖 | 源文隐含·本次明示 |
| 17 | effects 的 rng 注入 | effects.js 实现不 import mulberry32（源文 Consumes「注入约定」即此义）：随机源一律经参数注入，mulberry32 仅测试代码使用 | 源文隐含·本次明示 |
