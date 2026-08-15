# 战斗场景组装（Task 14）

> 上游：spec §3.2（游戏循环与状态机——PLAYING ⇄ LEVEL_UP / GAME_OVER 的暂停语义）、§3.3（数据流——各系统在场景层的接线总纲）、§9（性能预算——上限丢弃）；全局约束：`00-global-constraints.md`（简写 G§n）；索引：`README.md`。
> 执行前置：须已完成 Task 1–13（见 `01-foundation.md` Task 1–3、`02-config-tables.md` Task 4、`03-world.md` Task 5–6、`04-entities.md` Task 7–9、`05-combat-systems.md` Task 10–11、`06-progression-and-effects.md` Task 12–13）；本分册在依赖图（G§9）中汇聚 T1–T13 全部产出。

## 1. 目标与范围

本分册交付 MVP 的首个端到端可玩节点：`src/game.js`（DOM 层胶水，创建并接线 01–06 分册的全部实体与系统，产出符合 Task 1 engine 场景契约的战斗场景 `createGameScene(deps)`）与 `src/main.js` 临时接线（engine/input/scene 的最小启动，`onLevelUp`/`onGameOver` 以 console 回调占位）。走位、自动射击、刷怪、经验磁吸、升级暂停、死亡结算全链路在本任务跑通。不交付：升级四选一 UI 与正式 HUD（Task 15）、菜单/结算/最高分存档/main.js 正式版（Task 16，届时本任务的临时回调和内联最小 HUD 均被 `08-ui-and-persistence.md` 替换）；亦不写单测——`src/game.js`/`src/main.js` 属 G§3 DOM/胶水层，验收走人工清单（本分册 Step 2 + `09-acceptance.md` 全量）。本分册文件清单：Create `src/game.js`、Modify `src/main.js`。

## 2. 契约

### 2.1 提供（Produces）

（签名逐字取自源计划 Task 14 的 Interfaces.Produces。）

- `createGameScene(deps) → scene`，deps 为 `{canvas, input, onLevelUp(game), onGameOver(stats)}`；scene 暴露 `{update(dt), render(ctx), paused, player, weapon, zombies, gems, particles, floaters, time, kills, rng, pendingLevelUps}`（Task 14）——战斗场景工厂：内部创建 rng/map/player/camera/空间网格/spawner/弹道对象池并接线全部系统；返回的 scene 即 Task 1 engine 驱动的场景对象（`update` 由固定步长循环调、`render` 由 rAF 恒调、`paused` 豁免 update）。

语义注记（源自 Step 1 代码，供下游分册引用）：初始武器为 `createWeapon('pistol')`；`onGameOver` 收到 `{time, kills, level}`，`onLevelUp` 收到 scene 自身；`projectiles` 弹道数组是场景内部状态、不在暴露清单内（见 §4 裁决 11）。scene 的 `weapon`/`rng`/`pendingLevelUps` 被 08 分册消费（`applyCard` 重绑 `game.weapon`、`drawCards` 用 `game.rng`、连升计数）。

### 2.2 消费（Consumes）

（签名逐字取自源计划 Task 14 的 Interfaces.Consumes，均为前序任务产出；来源括注分册与 Task。）

- engine 场景接口：`{update(dt), render(ctx), paused}`——engine 每帧读 `scene.paused`，为 false 才循环调 `update(dt)`，之后总调 `render(ctx)`（`01-foundation.md` Task 1；本分册 main.js 临时接线经 `createEngine(canvas)` 消费，scene 形状即按此契约产出）
- `createInput() → {state:{up,down,left,right}, destroy()}`（Task 6；本任务只读 `state`）（`03-world.md` Task 6）
- `createCamera(viewW, viewH) → {x,y,viewW,viewH,shakeMag,shakeT,offX,offY}`；`updateCamera(cam, target, mapSize, rng, dt)`；`addShake(cam, mag)`（Task 6）（`03-world.md` Task 6）
- `generateMap(rng) → {size, spawn:{x,y}, obstacles:[...], scatteredGems:[{x,y,value}]}`；`MAP_SIZE = 3000`（Task 5）（`03-world.md` Task 5）
- `createPlayer(x,y) → {x,y,r:16,hp:100,maxHp:100,speed:180,pickupRadius:80,invuln:0,xp:0,level:1,facing:0}`；`updatePlayer(p, input, obstacles, mapSize, dt)`；`damagePlayer(p, dmg) → bool`（Task 7）（`04-entities.md` Task 7）
- `createZombie(typeId, x, y, tierCfg)`；`updateZombie(z, player, obstacles, dt)`；`damageZombie(z, dmg, kb, angle) → bool 是否死亡`（Task 8；zombie 含 `{type,x,y,r,hp,maxHp,speed,damage,xp,knockbackResist,kbx,kby,hitFlash,alive}`）（`04-entities.md` Task 8）——注：game.js 仅直接 import `updateZombie`；`createZombie`/`damageZombie` 分别经 spawner/combat 间接调用（Step 1 代码事实）
- `createWeapon(id) → {id, level:1, enhance:{damage,fireRate,projectiles,range}, cooldown, burstLeft, burstTimer, aimAngle}`（Task 9；本任务只读 `w.id`/`w.level`/`w.enhance`，其余为武器内部状态）（`04-entities.md` Task 9）
- `updateWeapon(w, owner, zombies, spawnProjectile, rng, dt)`（Task 9）——`spawnProjectile(opts)` 是本场景注入的回调，武器每发子弹调一次，**opts 为单个对象** `{x, y, angle, speed, damage, range, pierce, knockback}`（`04-entities.md` Task 9）
- `createProjectile() → {x:0,y:0,angle:0,speed:0,damage:0,range:0,traveled:0,pierce:0,knockback:0,alive:true}`；`resetProjectile(p, opts)`；`updateProjectile(p, dt)`（Task 9；`updateProjectile` 沿 `angle` 推进并累计 `traveled`，`traveled >= range` 置 `alive=false`；本场景经 `createPool` 建池，上限 400，满则新弹直接丢弃，死亡弹道 `release` 回池）（`04-entities.md` Task 9）
- `createSpatialHash(cellSize=64) → {clear(), insert(e), query(x,y,r) → 去重数组}`（Task 3）（`01-foundation.md` Task 3）
- `resolveProjectileHits(projectiles, hash, obstacles, onKill, onHit)`（Task 10）——第三个参数传 `map.obstacles`（直线弹道会被障碍挡住）；每次有效命中先调 `onHit(z, p)`，若该次命中致死再调 `onKill(z)`；伤害/穿透/命中后弹道消亡由 combat 内部结算（`05-combat-systems.md` Task 10）
- `createSpawner() → {budget:0, lastTier:1}`；`updateSpawner(sp, time, cam, mapSize, zombies, aliveCount, rng, dt) → 本帧新刷数量`（Task 11；`cam` 传 Task 6 的 camera 对象；新僵尸**直接 push 进传入的 `zombies` 数组**，返回值为数量；新手保护爬升、`MAX_ZOMBIES` 停刷、档位切换环形包围潮均在 spawner 内部处理，包围潮同样受 `MAX_ZOMBIES` 约束）（`05-combat-systems.md` Task 11）
- `createGem(x, y, value) → {x,y,r:8,value,alive:true}`；`updateGem(g, player, dt) → bool`（Task 12；进入 `player.pickupRadius` 内被磁吸，返回 true 表示被拾取）（`06-progression-and-effects.md` Task 12）
- `addXp(player, amount) → ups`（Task 12；返回本次升级次数，`player.level` 已在内部递增）（`06-progression-and-effects.md` Task 12）
- `spawnParticles(arr, x, y, color, n, rng)`；`updateParticles(arr, dt)`；`renderParticles(ctx, arr)`；`spawnFloater(arr, x, y, text, color)`；`updateFloaters(arr, dt)`；`renderFloaters(ctx, arr)`（Task 13）（`06-progression-and-effects.md` Task 13）
- `circleHit(ax,ay,ar,bx,by,br) → bool`（Task 3）（`01-foundation.md` Task 3）
- `mulberry32(seed) → rng()`（Task 2；本任务为 DOM 层，允许用 `Math.random` 产生种子）（`01-foundation.md` Task 2）
- `createPool(factory, reset) → {obtain(...args), release(obj), size}`（`01-foundation.md` Task 2）——【补记】源计划 Task 14 的 Consumes 清单未列出，但 Step 1 代码直接用于弹道池，本分册补记
- `ZOMBIES`——`{id: {..., color, ...}}` 僵尸配置表（`02-config-tables.md` Task 4）——【补记】源清单未列出，但 Step 1 代码 render 中读 `ZOMBIES[z.type].color` 绘制僵尸，本分册补记

## 3. Task 14: 战斗场景组装（game.js）

**Files:**
- Create: `src/game.js`
- Modify: `src/main.js`（临时接线，Task 16 会重写正式版）

Interfaces：Produces 见 §2.1、Consumes 见 §2.2（源计划 Task 14 Interfaces 已全部汇总入契约节）。

接线总览（重组自源计划 Interfaces；Step 1 代码为实现依据）：`update(dt)` 帧内顺序固定为——玩家移动 → 武器索敌开火（注入 `spawnProjectile` 回调，弹道池上限 400）→ spawner 刷怪（新僵尸直接 push 进 `scene.zombies`）→ 僵尸 AI → 弹道飞行 → 每帧重建空间网格（只插活僵尸）→ `resolveProjectileHits`（onHit 浮字 / onKill 计数+掉球+粒子）→ 接触伤害（命中即震屏；`hp<=0` → `paused=true` + `onGameOver` + 提前 return）→ 经验球磁吸拾取（升级 → `pendingLevelUps` 累计 + `paused=true`，同帧只调一次 `onLevelUp`）→ 帧末死僵尸/死弹 swap-remove → 镜头更新 → 粒子/浮字更新。`render(ctx)` 顺序固定为——清屏 → 世界空间（地图边界 → 障碍 → 经验球 → 僵尸 → 玩家 → 弹道 → 粒子 → 浮字）→ `ctx.restore()` → 屏幕空间最小 HUD（内联实现，Task 15 起由 `renderHud` 替换，位置约束不变）。

- [x] **Step 1: 实现 src/game.js 与 src/main.js 临时接线**

```js
// src/game.js —— 战斗场景组装（DOM 层胶水，无单测）
import { mulberry32 } from './core/rng.js';
import { createPool } from './core/pool.js';
import { circleHit, createSpatialHash } from './core/physics.js';
import { createCamera, updateCamera, addShake } from './core/camera.js';
import { generateMap, MAP_SIZE } from './systems/map.js';
import { createPlayer, updatePlayer, damagePlayer } from './entities/player.js';
import { updateZombie } from './entities/zombie.js';
import { createWeapon, updateWeapon } from './entities/weapon.js';
import { createProjectile, resetProjectile, updateProjectile } from './entities/projectile.js';
import { resolveProjectileHits } from './systems/combat.js';
import { createSpawner, updateSpawner } from './systems/spawner.js';
import { createGem, updateGem } from './entities/xpGem.js';
import { addXp } from './systems/progression.js';
import {
  spawnParticles, updateParticles, renderParticles,
  spawnFloater, updateFloaters, renderFloaters,
} from './entities/effects.js';
import { ZOMBIES } from './config/zombies.js';

const MAX_PROJECTILES = 400; // 全局性能上限（spec §9）
const MAX_PARTICLES = 500;   // spec §9 粒子上限
const MAX_FLOATERS = 100;    // 伤害数字上限（计划自定，防高射速下无界增长）

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function createGameScene(deps) {
  const { canvas, input, onLevelUp, onGameOver } = deps;
  const rng = mulberry32((Math.random() * 2 ** 31) | 0); // DOM 层允许 Math.random 做种子
  const map = generateMap(rng);
  const player = createPlayer(map.spawn.x, map.spawn.y);
  const camera = createCamera(canvas.width, canvas.height);
  const hash = createSpatialHash(64);
  const spawner = createSpawner();
  const projPool = createPool(
    () => createProjectile(),
    (p, opts) => resetProjectile(p, opts),
  );

  const projectiles = []; // 内部数组，不在 scene 暴露清单内
  let aliveCount = 0;
  let activeProjectiles = 0;

  const scene = {
    update, render,
    paused: false,
    player,
    // 武器必须经 scene.weapon 引用：swap 卡会重绑 game.weapon（applyCard），
    // 若用闭包局部变量，开火管线将与 UI 显示脱钩（UI 换枪、实际仍用旧武器）
    weapon: createWeapon('pistol'),
    zombies: [],
    gems: map.scatteredGems.map(g => createGem(g.x, g.y, g.value)),
    particles: [],
    floaters: [],
    time: 0,
    kills: 0,
    rng,
    pendingLevelUps: 0,
  };

  // 注入给 updateWeapon 的开火回调：opts 为单个对象；上限 400，满则新弹直接丢弃
  function spawnProjectile(opts) {
    if (activeProjectiles >= MAX_PROJECTILES) return;
    const p = projPool.obtain(opts);
    activeProjectiles++;
    projectiles.push(p);
  }

  function update(dt) {
    if (scene.paused) return;
    scene.time += dt;

    updatePlayer(player, input.state, map.obstacles, MAP_SIZE, dt);
    updateWeapon(scene.weapon, player, scene.zombies, spawnProjectile, rng, dt);

    // 刷怪：新僵尸由 spawner 直接 push 进 scene.zombies，返回新刷数量
    // 刷怪圆心取镜头中心（上一帧位置；半径含 +100 余量，可容忍 1 帧滞后），保证屏幕外刷怪
    aliveCount += updateSpawner(spawner, scene.time, camera, MAP_SIZE, scene.zombies, aliveCount, rng, dt);

    for (const z of scene.zombies) {
      if (z.alive) updateZombie(z, player, map.obstacles, dt);
    }
    for (const p of projectiles) {
      if (p.alive) updateProjectile(p, dt);
    }

    // 每帧重建空间网格
    hash.clear();
    for (const z of scene.zombies) if (z.alive) hash.insert(z);

    resolveProjectileHits(projectiles, hash, map.obstacles,
      z => { // onKill
        scene.kills++;
        scene.gems.push(createGem(z.x, z.y, z.xp));
        if (scene.particles.length < MAX_PARTICLES) // spec §9：粒子 ≤ 500
          spawnParticles(scene.particles, z.x, z.y, '#5eff8a', 12, rng);
      },
      (z, p) => { // onHit
        if (scene.floaters.length < MAX_FLOATERS)
          spawnFloater(scene.floaters, z.x, z.y - 20, String(Math.round(p.damage)), '#ffd75e');
      });

    // 接触伤害：命中才扣血，扣血即震屏
    for (const z of scene.zombies) {
      if (!z.alive) continue;
      if (circleHit(player.x, player.y, player.r, z.x, z.y, z.r) &&
          damagePlayer(player, z.damage)) {
        addShake(camera, 6);
        if (player.hp <= 0) {
          scene.paused = true;
          onGameOver({ time: scene.time, kills: scene.kills, level: player.level });
          return;
        }
      }
    }

    // 经验球：被拾取则累加经验，升级即暂停；同帧多颗升级只回调一次
    let levelUpThisFrame = false;
    for (let i = scene.gems.length - 1; i >= 0; i--) {
      const g = scene.gems[i];
      if (!updateGem(g, player, dt)) continue;
      scene.gems[i] = scene.gems[scene.gems.length - 1];
      scene.gems.pop();
      const ups = addXp(player, g.value);
      if (ups > 0) {
        scene.pendingLevelUps += ups;
        scene.paused = true;
        levelUpThisFrame = true;
      }
    }
    if (levelUpThisFrame) onLevelUp(scene);

    // 死僵尸与死弹道 swap-remove 压缩数组
    for (let i = scene.zombies.length - 1; i >= 0; i--) {
      if (!scene.zombies[i].alive) {
        scene.zombies[i] = scene.zombies[scene.zombies.length - 1];
        scene.zombies.pop();
        aliveCount--;
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p.alive) {
        projectiles[i] = projectiles[projectiles.length - 1];
        projectiles.pop();
        projPool.release(p);
        activeProjectiles--;
      }
    }

    updateCamera(camera, player, MAP_SIZE, rng, dt);
    updateParticles(scene.particles, dt);
    updateFloaters(scene.floaters, dt);
  }

  function render(ctx) {
    // 清屏
    ctx.fillStyle = '#1a2418';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 世界空间
    ctx.save();
    ctx.translate(-camera.x + camera.offX, -camera.y + camera.offY);

    // 地图边界
    ctx.strokeStyle = '#4a4a52';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

    // 障碍物
    ctx.fillStyle = '#4a4a52';
    for (const o of map.obstacles) {
      if (o.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(o.x, o.y, o.w, o.h);
      }
    }

    // 经验球（#5eff8a 菱形）
    ctx.fillStyle = '#5eff8a';
    for (const g of scene.gems) {
      const s = 3 + Math.min(g.value, 5);
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - s);
      ctx.lineTo(g.x + s, g.y);
      ctx.lineTo(g.x, g.y + s);
      ctx.lineTo(g.x - s, g.y);
      ctx.closePath();
      ctx.fill();
    }

    // 僵尸：配置颜色圆 + 受击闪白覆盖 + 头顶血条
    for (const z of scene.zombies) {
      const c = ZOMBIES[z.type];
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
      if (z.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, z.hitFlash / 0.1);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (z.hp < z.maxHp) {
        const bw = z.r * 2, bh = 3;
        const x = z.x - bw / 2, y = z.y - z.r - 8;
        ctx.fillStyle = '#a33';
        ctx.fillRect(x, y, bw, bh);
        ctx.fillStyle = '#5eff8a';
        ctx.fillRect(x, y, bw * Math.max(0, z.hp / z.maxHp), bh);
      }
    }

    // 玩家：白圆 + facing 方向短线，无敌帧半透明闪烁
    if (player.invuln > 0) ctx.globalAlpha = 0.45 + 0.35 * Math.sin(scene.time * 24);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.facing) * player.r, player.y + Math.sin(player.facing) * player.r);
    ctx.stroke();

    // 弹道：#ffe066 长 8 的线段
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 2;
    for (const p of projectiles) {
      const dx = Math.cos(p.angle) * 4, dy = Math.sin(p.angle) * 4;
      ctx.beginPath();
      ctx.moveTo(p.x - dx, p.y - dy);
      ctx.lineTo(p.x + dx, p.y + dy);
      ctx.stroke();
    }

    renderParticles(ctx, scene.particles);
    renderFloaters(ctx, scene.floaters);

    ctx.restore();

    // 最小 HUD（Task 15 抽到 hud.js）：左上血条 + 右上计时
    const bw = 240, bh = 14;
    ctx.fillStyle = '#a33';
    ctx.fillRect(12, 12, bw, bh);
    ctx.fillStyle = '#5eff8a';
    ctx.fillRect(12, 12, bw * Math.max(0, player.hp / player.maxHp), bh);

    ctx.fillStyle = '#eee';
    ctx.font = '24px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(scene.time), canvas.width - 16, 32);
    ctx.textAlign = 'left';
  }

  return scene;
}
```

```js
// src/main.js（临时接线，Task 16 会重写正式版）
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { createGameScene } from './game.js';

const canvas = document.getElementById('game');
const engine = createEngine(canvas);
engine.setScene(createGameScene({
  canvas,
  input: createInput(),
  onLevelUp: g => {
    console.log('level up', g.player.level);
    g.pendingLevelUps = 0;
    g.paused = false;
  },
  onGameOver: s => console.log('game over', s),
}));
engine.start();
```

- [x] **Step 2: 人工验证清单**

Run: `npx serve .`，浏览器打开提示地址（默认 http://localhost:3000），F12 观察 console，逐项核对：
- [ ] WASD 移动流畅（斜向不加速、地图边界夹紧、四周障碍可见）
- [ ] 障碍物阻挡：玩家与僵尸都会被圆/矩形障碍挡住并沿边滑动
- [ ] 僵尸从四周涌来并持续追踪玩家（新手保护 30s 内逐渐变多）
- [ ] 武器自动射击最近目标（黄色短线弹道、命中僵尸有白色闪白与伤害数字）
- [ ] 击杀僵尸掉落绿色经验球（菱形）
- [ ] 靠近经验球（80px 内）被磁吸拾取
- [ ] 被僵尸咬中扣血（左上血条变短）且画面有震屏
- [ ] 经验攒满升级时 console 输出 `level up <等级>` 且游戏短暂暂停后继续
- [ ] 血量归零死亡时 console 输出 `game over` 与存活时间/击杀数/等级，画面静止
- [ ] 抽到「更换武器」卡并点选后：开火手感立即切换为新武器（伤害/射速可感变化），HUD 与 build 栏同步——防「UI 已换枪、实际仍用旧武器」的闭包脱钩回归

- [x] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: 战斗场景组装（game.js）与 main.js 临时接线"
```

### Task 14 验收

无单测（G§3：`src/game.js`/`src/main.js` 属 DOM/胶水层）；验收 = Step 2 人工验证清单（10 项）逐项核对，运行命令：`npx serve .`（浏览器 + F12 console）；Step 3 提交收尾。全量回归与 spec §12 MVP 标准总验收归 `09-acceptance.md`。

## 4. 歧义裁决（本模块）

| # | 易误解点 | 裁定 | 来源 |
|---|---|---|---|
| 1 | weapon 的引用方式 | weapon 必须经 `scene.weapon` 属性引用，禁止闭包局部变量——swap 卡重绑 `game.weapon`（applyCard），闭包引用会导致「UI 换枪、开火仍是旧枪」（本次拆分前的审查修复，勿回归；Step 1 代码以 scene 定义处注释固化） | 拆分裁定 |
| 2 | aliveCount 口径 | aliveCount 由 game.js 独立维护（+spawned / 尸体清理时 -1），不可用 `zombies.length` 替代（数组含未清理尸体） | 拆分裁定 |
| 3 | 同帧多次升级 | 同帧多颗经验球触发多次升级：pendingLevelUps 累计，onLevelUp 只调用一次（防重复弹窗） | 拆分裁定 |
| 4 | 上限丢弃策略 | 粒子≥500/浮字≥100/弹≥400 时新产生的直接丢弃，不影响存量（不是删旧换新） | 拆分裁定 |
| 5 | HUD 位置与 paused 语义 | renderHud 必须在 camera 变换 `ctx.restore()` 之后调用（屏幕空间）；paused 时 update 跳过、render 继续（升级弹窗期间世界完全冻结，仅 DOM 覆盖层活动）。Task 14 阶段 HUD 为 render 末尾内联最小实现，Task 15 起替换为 `renderHud`（`08-ui-and-persistence.md`），位置约束不变 | 拆分裁定 |
| 6 | 单测边界 | game.js 是 DOM 层胶水不写单测，验收走 09 分册人工清单（本分册 Step 2 清单为第一道原位核对） | 拆分裁定 |
| 7 | 帧末清理时机 | 尸体/死弹 swap-remove 在帧末统一执行，spawner 的 push 与 combat 的击杀发生在其前 | 拆分裁定 |
| 8 | 玩家死亡当帧提前 return | `onGameOver` 触发后直接 `return`：当帧跳过经验球拾取、帧末清理与镜头更新；`scene.paused = true` 使后续帧 update 全跳过、render 继续（画面静止） | 源文隐含·本次明示 |
| 9 | 升级暂停自下一帧生效 | `paused = true` 只在 `update` 入口检查：触发升级的当帧管线照常跑完（后续经验球照常拾取并继续累加 `pendingLevelUps`——裁决 3 的基础；帧末清理、`updateCamera` 亦照常执行），暂停自下一帧生效；与死亡路径的提前 return（裁决 8）不同 | 源文隐含·本次明示 |
| 10 | 经验球即时清理 | 经验球被拾取时在遍历内**就地** swap-remove（下标从尾向头遍历以安全交换），不等帧末；与僵尸/死弹的帧末统一清理（裁决 7）不同 | 源文隐含·本次明示 |
| 11 | projectiles 不外露 | 弹道数组 `projectiles` 与计数 `activeProjectiles` 均为场景内部状态，不在 scene 暴露清单内（Produces 契约明确）；`release` 回池时 `activeProjectiles--`，`spawnProjectile` 判满后直接丢弃新弹；08 分册 UI/结算不得引用弹道数组 | 源文隐含·本次明示 |
| 12 | 帧内固定顺序与 cam 时效 | update 帧内顺序固定（见 §3 接线总览），不得重排；`updateSpawner` 收到的 camera 是上一帧位置（与 `03-world.md` 裁决 4、`05-combat-systems.md` 裁决 4 一致）；空间网格在弹道飞行之后、命中结算之前每帧重建，当帧新刷僵尸已入网格 | 源文隐含·本次明示 |
| 13 | 渲染顺序 | render 顺序固定：清屏 → 世界空间（地图边界 → 障碍 → 经验球 → 僵尸 → 玩家 → 弹道 → 粒子 → 浮字）→ `ctx.restore()` → 屏幕空间 HUD；玩家绘制在僵尸之后（玩家总在僵尸顶层） | 源文隐含·本次明示 |
| 14 | 上限检查归属 | 三处上限检查均在 game.js 的产生方进行：`spawnProjectile` 判 `activeProjectiles`、onKill 判 `particles.length`、onHit 判 `floaters.length`；`effects.js` 与对象池模块自身不判上限 | 源文隐含·本次明示 |
| 15 | 临时接线行为 | main.js 临时版：onLevelUp 仅 `console.log` 并清零 `pendingLevelUps`、置 `paused = false`（不弹卡牌界面）；onGameOver 仅 `console.log(stats)`。正式 UI 由 Task 15/16（`08-ui-and-persistence.md`）接管；本任务禁止提前在 game.js 或回调里实现弹窗（Task 15 明令 game.js 内调 showLevelUp 会双重弹窗） | 源文隐含·本次明示 |
| 16 | 内联 formatTime 的生命周期 | Task 14 在 game.js 内定义模块级 `formatTime`（仅最小 HUD 计时用）；Task 15 删除该函数与内联 HUD 块，改用 `hud.js` 的 `formatTime`/`renderHud`（`08-ui-and-persistence.md`）——两函数签名一致但归属不同，勿在 Task 14 提前抽公共模块 | 源文隐含·本次明示 |
