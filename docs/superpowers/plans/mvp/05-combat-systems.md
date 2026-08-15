# 命中结算与刷怪导演（Task 10–11）

> 上游：spec §4.2 / §4.4 / §4.5（主武器弹道、僵尸受击、直线弹道被阻挡）、§5.1–§5.2（难度阶梯、刷怪导演）；全局约束：`00-global-constraints.md`（简写 G§n）；索引：`README.md`。
> 执行前置：须已完成 Task 1–9（见 `01-foundation.md` Task 1–3、`02-config-tables.md` Task 4、`03-world.md` Task 5–6、`04-entities.md` Task 7–9）；本分册直接消费 Task 2（rng）、Task 3（physics）、Task 4（config）、Task 8（zombie）的产出。

## 1. 目标与范围

本分册交付战斗循环的两个纯逻辑系统：`src/systems/combat.js`（弹道命中结算——障碍阻挡、空间网格查询、穿透与击杀回调）与 `src/systems/spawner.js`（刷怪导演——预算制常规刷怪、新手保护线性爬升、跨档环形包围潮），以及配套单测 `test/combat.test.js`、`test/spawner.test.js`。二者同属 G§3 纯逻辑层（禁 DOM，`node --test` 可 import），在架构中位于实体层（04 分册）与场景组装（07 分册 Task 14）之间：combat 消费弹道/僵尸实体与空间网格、向上抛出 onHit/onKill 回调；spawner 依难度与僵尸配置向场景 `zombies` 数组产出僵尸，由 game.js 每帧驱动。不交付：AoE / 越障弹道结算（榴弹等属第 2/3 期武器，G§7.5）、精英怪节奏点（spec §5.2 第 6 条，第 3 期）、任何渲染与 DOM、僵尸尸体清理（由 07 分册帧末统一执行）。本分册文件清单：`src/systems/combat.js`、`src/systems/spawner.js`、`test/combat.test.js`、`test/spawner.test.js`。

## 2. 契约

### 2.1 提供（Produces）

- `resolveProjectileHits(projectiles, hash, obstacles, onKill, onHit)`——遍历 `projectiles` 中 `alive === true` 的弹道做命中结算；弹道对象需含 `{x, y, damage, knockback, angle, pierce, alive}`（Task 10）
- `createSpawner() → {budget:0, lastTier:1}`（Task 11）
- `updateSpawner(sp, time, cam, mapSize, zombies, aliveCount, rng, dt) → 本帧新刷数量`（= 包围潮 + 常规刷怪实际 push 进 `zombies` 的总数；`cam` 为镜头对象 `{x, y, viewW, viewH}`——Task 6 的 camera，刷怪圆心取镜头中心以保证屏幕外刷怪）（Task 11）

### 2.2 消费（Consumes）

- `circleHit(ax,ay,ar,bx,by,br) → bool`、`circleRectHit(cx,cy,cr,rect) → bool`（rect 为 `{x,y,w,h}` 左上原点）、`createSpatialHash(cellSize?) → {clear(), insert(e), query(x,y,r) → 数组（去重）}`——圆/矩碰撞判定与网格查询（`01-foundation.md` Task 3）
- `damageZombie(z, dmg, kb, angle) → bool`（是否死亡）——combat 实现内结算僵尸受击；`createZombie(typeId, x, y, tierCfg) → zombie`——spawner 实现内构造新僵尸（combat/spawner 的测试代码亦直接使用）（`04-entities.md` Task 8）
- `MAX_ZOMBIE_R`——最大僵尸半径派生常量，供查询半径 `4 + MAX_ZOMBIE_R` 使用（当前=坦克 24，见 `02-config-tables.md` 歧义裁决 5）（`02-config-tables.md` Task 4）
- `getTierConfig(timeSec) → 档配置`、`GRACE_PERIOD = 30`、`MAX_ZOMBIES = 300`——难度阶梯与全局上限（`02-config-tables.md` Task 4）
- `ZOMBIES`——`{id: {id,name,hp,speed,damage,xp,radius,color,knockbackResist,cost}}`，本分册读 `cost` 作刷怪预算单价（`02-config-tables.md` Task 4）
- `pickWeighted(rng, weights) → key`——按组成权重抽僵尸类型（`01-foundation.md` Task 2）
- `mulberry32(seed) → () => number[0,1)`——仅测试代码用于注入可复现随机源（`01-foundation.md` Task 2）
- 对象形状引用（不调用其函数）：`cam` 为 Task 6 camera 产出的 `{x, y, viewW, viewH}`（`03-world.md` Task 6）；`obstacles` 数组元素为 Task 5 generateMap 产出的 `{kind:'circle',x,y,r}` 或 `{kind:'rect',x,y,w,h}`（`03-world.md` Task 5）

## 3. Task 10: 命中结算（combat.js）

**Files:**
- Create: `src/systems/combat.js`
- Test: `test/combat.test.js`

**行为（源计划原文）：**

先把弹道视为 `r=4` 的圆做障碍检测（`kind:'circle'` 障碍用 `circleHit(p.x,p.y,4,o.x,o.y,o.r)`，`kind:'rect'` 用 `circleRectHit(p.x,p.y,4,o)`）——撞上障碍则 `p.alive=false` 并跳过该弹道；否则 `hash.query(p.x, p.y, 4 + MAX_ZOMBIE_R)` 取候选僵尸，逐个跳过 `!z.alive` 的僵尸、对 `circleHit(p.x,p.y,4,z.x,z.y,z.r)` 命中的僵尸执行 `died = damageZombie(z, p.damage, p.knockback, p.angle)` → 调 `onHit(z, p)` → `died` 为真时再调 `onKill(z)` → 随后 `p.pierce > 0` 则 `p.pierce--` 继续判定下一只，否则 `p.alive = false` 并 `break`。

- [x] **Step 1: 写失败测试**

```js
// test/combat.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialHash } from '../src/core/physics.js';
import { createZombie } from '../src/entities/zombie.js';
import { resolveProjectileHits } from '../src/systems/combat.js';

const T1 = { hpMult: 1, speedMult: 1 };

function makeProjectile(over = {}) {
  return { x: 1000, y: 1000, damage: 10, knockback: 0, angle: 0, pierce: 0, alive: true, ...over };
}

test('命中扣血但不致死：onHit(z,p) 触发、onKill 不触发，弹道消亡', () => {
  const z = createZombie('normal', 1005, 1000, T1); // 距弹道 5px < 4+14
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile({ damage: 10, knockback: 100, angle: Math.PI });
  let kills = 0, hitArgs = null;
  resolveProjectileHits([p], hash, [],
    () => kills++,
    (hz, hp) => { hitArgs = [hz, hp]; });
  assert.deepEqual(hitArgs, [z, p]);
  assert.equal(kills, 0);
  assert.equal(z.hp, 20);
  assert.ok(z.kbx < 0); // 击退沿 angle=π 方向生效
  assert.equal(p.alive, false);
});

test('致死命中：onKill(z) 触发且弹道 alive=false', () => {
  const z = createZombie('normal', 1005, 1000, T1); // hp 30
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile({ damage: 999 });
  let kills = 0, killArgs = null, hitArgs = null;
  resolveProjectileHits([p], hash, [],
    (z2) => { kills++; killArgs = z2; },
    (z2, p2) => { hitArgs = [z2, p2]; });
  assert.equal(kills, 1);
  assert.equal(killArgs, z);
  assert.deepEqual(hitArgs, [z, p]);
  assert.equal(z.alive, false);
  assert.equal(p.alive, false);
});

test('pierce=1 可先后命中两只僵尸后消亡', () => {
  const a = createZombie('normal', 1005, 1000, T1);
  const b = createZombie('normal', 1012, 1000, T1); // 均距弹道 < 18，同一网格
  const hash = createSpatialHash();
  hash.insert(a); hash.insert(b);
  const p = makeProjectile({ damage: 10, pierce: 1 });
  let hits = 0;
  resolveProjectileHits([p], hash, [], () => {}, () => hits++);
  assert.equal(hits, 2);
  assert.equal(a.hp, 20);
  assert.equal(b.hp, 20);
  assert.equal(p.pierce, 0);
  assert.equal(p.alive, false);
});

test('撞圆形障碍：alive=false 且不触发任何回调', () => {
  const z = createZombie('normal', 1005, 1000, T1); // 无障碍时本会被命中
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile();
  let hits = 0, kills = 0;
  resolveProjectileHits([p], hash,
    [{ kind: 'circle', x: 1002, y: 1000, r: 20 }],
    () => kills++, () => hits++);
  assert.equal(p.alive, false);
  assert.equal(hits, 0);
  assert.equal(kills, 0);
  assert.equal(z.hp, 30);
});

test('撞矩形障碍：alive=false 且不触发任何回调', () => {
  const z = createZombie('normal', 1005, 1000, T1);
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile();
  let hits = 0, kills = 0;
  resolveProjectileHits([p], hash,
    [{ kind: 'rect', x: 990, y: 990, w: 20, h: 20 }],
    () => kills++, () => hits++);
  assert.equal(p.alive, false);
  assert.equal(hits, 0);
  assert.equal(kills, 0);
  assert.equal(z.hp, 30);
});

test('网格查不到的远处僵尸不受影响', () => {
  const z = createZombie('normal', 1200, 1000, T1); // 距弹道 200 >> 4+MAX_ZOMBIE_R
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile();
  let hits = 0, kills = 0;
  resolveProjectileHits([p], hash, [], () => kills++, () => hits++);
  assert.equal(hits, 0);
  assert.equal(kills, 0);
  assert.equal(z.hp, 30);
  assert.equal(z.alive, true);
  assert.equal(p.alive, true); // 无命中则弹道继续存活
});

test('网格中的已死亡僵尸不会再次触发回调', () => {
  const z = createZombie('normal', 1005, 1000, T1);
  z.alive = false; // 模拟已击杀但仍在网格中
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile();
  let hits = 0, kills = 0;
  resolveProjectileHits([p], hash, [], () => kills++, () => hits++);
  assert.equal(hits, 0);
  assert.equal(kills, 0);
  assert.equal(p.alive, true);
});

test('查询范围内但碰撞半径外的僵尸不命中', () => {
  const z = createZombie('normal', 1020, 1000, T1); // 距离 20：< 4+24 在查询内，但 > 4+14 不命中
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile();
  let hits = 0;
  resolveProjectileHits([p], hash, [], () => {}, () => hits++);
  assert.equal(hits, 0);
  assert.equal(z.hp, 30);
  assert.equal(p.alive, true);
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/combat.test.js`
Expected: FAIL，找不到 `../src/systems/combat.js`

- [x] **Step 3: 实现**

```js
// src/systems/combat.js
// 命中结算：弹道 vs 障碍/僵尸（空间网格加速）。纯逻辑模块，无 DOM 依赖。
import { circleHit, circleRectHit } from '../core/physics.js';
import { damageZombie } from '../entities/zombie.js';
import { MAX_ZOMBIE_R } from '../config/zombies.js';

export function resolveProjectileHits(projectiles, hash, obstacles, onKill, onHit) {
  for (const p of projectiles) {
    if (!p.alive) continue;
    // 1) 障碍检测：弹道视为 r=4 的圆
    let blocked = false;
    for (const o of obstacles) {
      if (o.kind === 'circle' ? circleHit(p.x, p.y, 4, o.x, o.y, o.r) : circleRectHit(p.x, p.y, 4, o)) {
        blocked = true;
        break;
      }
    }
    if (blocked) { p.alive = false; continue; }
    // 2) 网格取候选，逐个跳过死尸并判定命中
    for (const z of hash.query(p.x, p.y, 4 + MAX_ZOMBIE_R)) {
      if (!z.alive) continue;
      if (!circleHit(p.x, p.y, 4, z.x, z.y, z.r)) continue;
      const died = damageZombie(z, p.damage, p.knockback, p.angle);
      onHit(z, p);
      if (died) onKill(z);
      if (p.pierce > 0) { p.pierce--; continue; }
      p.alive = false;
      break;
    }
  }
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/combat.test.js`
Expected: 8 个用例全 PASS

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 弹道命中结算（障碍/穿透/击杀回调）"
```

### Task 10 验收

单测 8 个用例全 PASS；运行命令：`node --test test/combat.test.js`（源计划本 Task 无人工清单步骤；全量回归归 `09-acceptance.md`）。

## 4. Task 11: 刷怪导演（spawner.js）

**Files:**
- Create: `src/systems/spawner.js`
- Test: `test/spawner.test.js`

**规则（spec §5.2，源计划原文）：**

- `cfg = getTierConfig(time)`；`bps = cfg.budgetPerSec`，若 `time < GRACE_PERIOD(30)` 则 `bps = 0.5 + (cfg.budgetPerSec - 0.5) × (time / GRACE_PERIOD)`（新手保护线性爬升）
- `sp.budget = min(sp.budget + bps × dt, bps × 2)`（最多累计 2 秒预算）
- 档位切换（`cfg.tier > sp.lastTier`）触发环形包围潮（不消耗预算，但同样受 `MAX_ZOMBIES` 上限约束，名额不足时提前截断）：`n = min(20 + (cfg.tier - 1) × 5, 40)` 只，角度在 `[0, 2π)` 上均匀分布（`angle = i/n × 2π`），落点 = `镜头中心 + SPAWN_R(cam) × (cos, sin)`（`SPAWN_R(cam) = hypot(cam.viewW/2, cam.viewH/2) + 100`，半对角线 + 余量，保证落点在屏幕外），落点超出 `[20, mapSize-20]` 的角度跳过；类型按 `cfg.weights` 抽；随后 `sp.lastTier = cfg.tier`
- 常规刷怪循环（每帧 guard ≤ 20 次）：`aliveCount + 已刷数 >= MAX_ZOMBIES(300)` 则停；`type = pickWeighted(rng, cfg.weights)`；若 `sp.budget < ZOMBIES[type].cost` 则停；扣 budget；刷怪点 = 随机角度 `SPAWN_R(cam)` 半径圆周到镜头中心，10 次尝试取落在 `[20, mapSize-20]` 内的点，全失败则退化为地图内随机点；`zombies.push(createZombie(type, x, y, cfg))`

- [x] **Step 1: 写失败测试**

```js
// test/spawner.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { ZOMBIES } from '../src/config/zombies.js';
import { MAX_ZOMBIES } from '../src/config/difficulty.js';
import { createSpawner, updateSpawner } from '../src/systems/spawner.js';

test('t=0 新手期 weights 只有 normal，只刷 normal', () => {
  const sp = createSpawner();
  const cam = { x: 860, y: 1140, viewW: 1280, viewH: 720 }; // 镜头中心 = (1500,1500)
  const zombies = [];
  const rng = mulberry32(1);
  for (let i = 0; i < 100; i++) updateSpawner(sp, 0, cam, 3000, zombies, 0, rng, 0.1);
  assert.ok(zombies.length > 0, `应刷出僵尸，实际 ${zombies.length}`);
  for (const z of zombies) assert.equal(z.type, 'normal');
});

test('budget 最多累计 2 秒 bps，不随刷新消耗虚高', () => {
  const sp = createSpawner();
  const cam = { x: 860, y: 1140, viewW: 1280, viewH: 720 }; // 镜头中心 = (1500,1500)
  const zombies = [];
  const rng = mulberry32(2);
  // time=60：tier 1，bps=2，封顶=4；aliveCount 已满则常规刷怪不消耗预算，可观察纯累计
  for (let i = 0; i < 500; i++) {
    updateSpawner(sp, 60, cam, 3000, zombies, MAX_ZOMBIES, rng, 0.016);
    assert.ok(sp.budget <= 2 * 2 + 1e-9, `budget=${sp.budget} 超出封顶`);
  }
  assert.ok(Math.abs(sp.budget - 2 * 2) < 1e-6, `budget 应封顶在 ${2 * 2}，实际 ${sp.budget}`);
});

test('time=0 预算从 0.5/s 起步，同样时长刷得比 time=60 少', () => {
  const cam = { x: 860, y: 1140, viewW: 1280, viewH: 720 }; // 镜头中心 = (1500,1500)
  const zA = [], zB = [];
  const spA = createSpawner(), spB = createSpawner();
  const rngA = mulberry32(7), rngB = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    updateSpawner(spA, 0, cam, 3000, zA, 0, rngA, 0.1);
    updateSpawner(spB, 60, cam, 3000, zB, 0, rngB, 0.1);
  }
  assert.ok(zA.length > 0, `新手期应能刷出僵尸，实际 ${zA.length}`);
  assert.ok(zB.length > zA.length, `t=60 刷 ${zB.length} 只应多于 t=0 的 ${zA.length} 只`);
});

test('跨档瞬间僵尸数突增包围潮数量', () => {
  const cam = { x: 860, y: 1140, viewW: 1280, viewH: 720 }; // 镜头中心 = (1500,1500)
  const zombies = [];
  const rng = mulberry32(3);
  const sp = createSpawner();
  for (let i = 0; i < 100; i++) updateSpawner(sp, 100, cam, 3000, zombies, 0, rng, 1 / 60);
  const before = zombies.length;
  const n = updateSpawner(sp, 180, cam, 3000, zombies, 0, rng, 1 / 60); // 跨入档 2
  // 20+(2-1)×5 的包围潮 + 0~3 只常规补刷（取决于此前预算结余），区间断言避免脆等值
  assert.ok(n >= 20 && n <= 28, `跨档新增 ${n} 只，应在 20~28 之间`);
  assert.equal(zombies.length - before, n);
  assert.equal(sp.lastTier, 2);
});

test('包围潮同样受 MAX_ZOMBIES 上限约束', () => {
  const cam = { x: 860, y: 1140, viewW: 1280, viewH: 720 };
  const zombies = [];
  const rng = mulberry32(3);
  const sp = createSpawner();
  const n = updateSpawner(sp, 180, cam, 3000, zombies, MAX_ZOMBIES - 10, rng, 1 / 60);
  assert.equal(n, 10); // 名额只剩 10：包围潮截断在 10，常规刷怪亦不再进行
  assert.equal(sp.lastTier, 2);
});

test('aliveCount 达到 MAX_ZOMBIES 后不再刷怪，只补足差额', () => {
  const cam = { x: 860, y: 1140, viewW: 1280, viewH: 720 }; // 镜头中心 = (1500,1500)
  const rng = mulberry32(4);
  const sp = createSpawner();
  sp.budget = 999;
  const zombies = [];
  assert.equal(updateSpawner(sp, 60, cam, 3000, zombies, MAX_ZOMBIES, rng, 1), 0);
  assert.equal(zombies.length, 0);
  const sp2 = createSpawner();
  sp2.budget = 999;
  const zombies2 = [];
  assert.equal(updateSpawner(sp2, 60, cam, 3000, zombies2, MAX_ZOMBIES - 1, rng, 1), 1);
  assert.equal(zombies2.length, 1);
});

test('t=1500（9 档）僵尸 hp 用档 8 封顶倍率 ×10', () => {
  const cam = { x: 860, y: 1140, viewW: 1280, viewH: 720 }; // 镜头中心 = (1500,1500)
  const zombies = [];
  const rng = mulberry32(6);
  const sp = createSpawner();
  sp.budget = 999;
  const n = updateSpawner(sp, 1500, cam, 3000, zombies, 0, rng, 1);
  assert.ok(n > 0);
  assert.equal(sp.lastTier, 9);
  for (const z of zombies) assert.equal(z.hp, ZOMBIES[z.type].hp * 10);
});

test('刷怪点始终落在 [20, mapSize-20] 内（角落镜头强制退化到地图随机点）', () => {
  const cam = { x: 0, y: 0, viewW: 1280, viewH: 720 }; // 镜头夹紧在地图左上角
  const zombies = [];
  const sp = createSpawner();
  sp.budget = 999;
  const rng = () => 0.75; // 恒定角度 0.75×2π ≈ 270°（正上方）：落点 y<0 必越界，10 次尝试全失败 → 退化为地图内随机点
  updateSpawner(sp, 60, cam, 3000, zombies, 0, rng, 1);
  assert.ok(zombies.length > 0);
  for (const z of zombies) {
    assert.ok(z.x >= 20 && z.x <= 2980 && z.y >= 20 && z.y <= 2980,
      `刷怪点 (${z.x},${z.y}) 越界`);
  }
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/spawner.test.js`
Expected: FAIL，找不到 `../src/systems/spawner.js`

- [x] **Step 3: 实现**

```js
// src/systems/spawner.js
import { getTierConfig, GRACE_PERIOD, MAX_ZOMBIES } from '../config/difficulty.js';
import { ZOMBIES } from '../config/zombies.js';
import { pickWeighted } from '../core/rng.js';
import { createZombie } from '../entities/zombie.js';

const MAP_MARGIN = 20;

export function createSpawner() {
  return { budget: 0, lastTier: 1 };
}

function spawnRadius(cam) {
  return Math.hypot(cam.viewW / 2, cam.viewH / 2) + 100; // 半对角线 + 余量：圆环任意点必在屏幕外
}

function pickSpawnPoint(cam, mapSize, rng) {
  const r = spawnRadius(cam);
  for (let i = 0; i < 10; i++) {
    const angle = rng() * Math.PI * 2;
    const x = cam.x + cam.viewW / 2 + Math.cos(angle) * r;
    const y = cam.y + cam.viewH / 2 + Math.sin(angle) * r;
    if (x >= MAP_MARGIN && x <= mapSize - MAP_MARGIN &&
        y >= MAP_MARGIN && y <= mapSize - MAP_MARGIN) return { x, y };
  }
  return {
    x: MAP_MARGIN + rng() * (mapSize - MAP_MARGIN * 2),
    y: MAP_MARGIN + rng() * (mapSize - MAP_MARGIN * 2),
  };
}

export function updateSpawner(sp, time, cam, mapSize, zombies, aliveCount, rng, dt) {
  const cfg = getTierConfig(time);
  let bps = cfg.budgetPerSec;
  if (time < GRACE_PERIOD) bps = 0.5 + (cfg.budgetPerSec - 0.5) * (time / GRACE_PERIOD);
  sp.budget = Math.min(sp.budget + bps * dt, bps * 2);

  let spawned = 0;

  // 档位切换：环形包围潮（不消耗预算，但受 MAX_ZOMBIES 同屏上限约束）
  if (cfg.tier > sp.lastTier) {
    const n = Math.min(20 + (cfg.tier - 1) * 5, 40);
    const r = spawnRadius(cam);
    const cx = cam.x + cam.viewW / 2, cy = cam.y + cam.viewH / 2;
    for (let i = 0; i < n; i++) {
      if (aliveCount + spawned >= MAX_ZOMBIES) break;
      const angle = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (x < MAP_MARGIN || x > mapSize - MAP_MARGIN ||
          y < MAP_MARGIN || y > mapSize - MAP_MARGIN) continue; // 落点越界跳过
      zombies.push(createZombie(pickWeighted(rng, cfg.weights), x, y, cfg));
      spawned++;
    }
    sp.lastTier = cfg.tier;
  }

  // 常规刷怪（预算制，每帧最多 20 次）
  let guard = 0;
  while (guard++ < 20) {
    if (aliveCount + spawned >= MAX_ZOMBIES) break;
    const type = pickWeighted(rng, cfg.weights);
    if (sp.budget < ZOMBIES[type].cost) break;
    sp.budget -= ZOMBIES[type].cost;
    const p = pickSpawnPoint(cam, mapSize, rng);
    zombies.push(createZombie(type, p.x, p.y, cfg));
    spawned++;
  }
  return spawned;
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/spawner.test.js`
Expected: 全 PASS（8 个用例）

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 刷怪导演（预算制/新手保护/环形包围潮）"
```

### Task 11 验收

单测 8 个用例全 PASS；运行命令：`node --test test/spawner.test.js`（源计划本 Task 无人工清单步骤；全量回归归 `09-acceptance.md`）。

## 5. 歧义裁决（本模块）

| # | 易误解点 | 裁定 | 来源 |
|---|---|---|---|
| 1 | 弹道碰撞半径与判定顺序 | 弹道视为 `r=4` 的圆；同帧同弹道障碍判定先于僵尸判定，撞障碍不触发任何回调、弹道直接消亡 | 拆分裁定 |
| 2 | pierce 语义 | 命中不减伤；`pierce>0` 时减 1 继续判定下一只（同帧可穿多只），`=0` 时弹道消亡 | 拆分裁定 |
| 3 | 回调顺序与尸体归属 | 回调顺序 onHit →（若致死）onKill；combat 不修改僵尸数组，尸体由上层帧末统一清理 | 拆分裁定 |
| 4 | cam 时效与 spawnRadius 余量 | spawner 的 cam 是上一帧镜头位置，`spawnRadius = 半对角 + 100` 的余量覆盖镜头-玩家滞后与震屏偏移 | 拆分裁定 |
| 5 | MAX_ZOMBIES 名额口径 | 包围潮与常规刷怪共享 MAX_ZOMBIES 名额（`aliveCount + spawned` 计数） | 拆分裁定 |
| 6 | 防爆刷双闸 | 常规刷怪每帧 guard ≤ 20 次防单帧爆刷，budget 封顶 2 秒预算防爆仓 | 拆分裁定 |
| 7 | 越界落点的处理 | 包围潮落点越界跳过该角度不补；常规刷怪 10 次尝试全失败退化为地图内随机点 | 拆分裁定 |
| 8 | 穿透命中的先后顺序 | 同帧穿透多只僵尸的先后 = `hash.query` 返回顺序（结果去重、不保证排序，见 `01-foundation.md` 歧义裁决 6）；顺序不影响总伤 | 源文隐含·本次明示 |
| 9 | lastTier 的更新时机 | 包围潮被 MAX_ZOMBIES 截断（甚至 0 只刷出）时仍更新 `sp.lastTier = cfg.tier`，后续帧不补发差额（测试「包围潮同样受 MAX_ZOMBIES 上限约束」即验证此点） | 源文隐含·本次明示 |
| 10 | 判满不读 zombies.length | `updateSpawner` 判满依据「调用方传入的 aliveCount + 本帧 spawned」，不读 `zombies.length`（数组含未清理尸体，与 `07-scene-assembly.md` 歧义裁决 2 一致） | 源文隐含·本次明示 |
| 11 | budget 的浮点语义 | budget 为浮点累计、不取整；`sp.budget < cost` 为严格小于（恰等于 cost 时仍可刷）；测试断言封顶值用 1e-9/1e-6 容差吸收浮点误差 | 源文隐含·本次明示 |
| 12 | combat 不做射程判定 | combat 只结算 `p.alive === true` 的弹道；射程耗尽由 `updateProjectile`（`04-entities.md` Task 9）置 `alive=false`，本模块不做 range/traveled 判定 | 源文隐含·本次明示 |
| 13 | 刷怪圆心与 spec 表述的关系 | spec §5.2 写「玩家周围屏幕外一圈」，实现取**镜头中心**为圆心（源计划 Interfaces 明示：保证落点在屏幕外）；镜头即时跟随玩家（`03-world.md` 歧义裁决 4），二者语义相容，以镜头中心实现为准 | 源文隐含·本次明示 |
