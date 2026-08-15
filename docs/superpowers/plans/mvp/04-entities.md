# 玩家实体、僵尸 AI、武器与弹道（Task 7–9）

> 上游：spec §4.1（玩家）、§4.2（主武器）、§4.4（僵尸）；全局约束：`00-global-constraints.md`（简写 G§n）；索引：`README.md`。
> 执行前置：须已完成 Task 1–6（`01-foundation.md` Task 1–3、`02-config-tables.md` Task 4、`03-world.md` Task 5–6）。

## 1. 目标与范围

本分册交付实体层四个纯逻辑模块及各自单测：`src/entities/player.js` + `test/player.test.js`（玩家八向归一化移动、地图边界夹紧、障碍滑动、0.5s 受伤无敌帧）、`src/entities/zombie.js` + `test/zombie.test.js`（僵尸追踪 AI、击退速度的施加与指数衰减、受击闪白、死亡标记）、`src/entities/projectile.js` + `test/projectile.test.js`（弹道直线飞行与射程耗尽）、`src/entities/weapon.js` + `test/weapon.test.js`（增强数值计算、射程内最近目标索敌、cooldown 开火、burst 连发与多发扇形），合计 22 个单测用例。

四模块均属纯逻辑层（G§3）：禁止 import DOM API，`node --test` 可直接 import；随机性一律注入 `mulberry32` 实例，禁止 `Math.random`（G§4）。不交付：弹道命中结算与伤害管线、刷怪导演（`05-combat-systems.md` Task 10–11）、经验/升级对武器增强的调用入口（`06-progression-and-effects.md`）、实体与系统的每帧接线（`07-scene-assembly.md`）——本分册只定义单个实体/武器自身的状态演进，实体间调用顺序由 07 分册的 game.js 决定。

## 2. 契约

### 2.1 提供（Produces）

**Task 7 · `src/entities/player.js`**

- `createPlayer(x, y) → {x,y,r:16,hp:100,maxHp:100,speed:180,pickupRadius:80,invuln:0,xp:0,level:1,facing:0}`
- `updatePlayer(p, input, obstacles, mapSize, dt)`——input 为 Task 6 的 `state`
- `damagePlayer(p, dmg) → bool`（是否实际扣血；0.5s 无敌帧内不扣）

**Task 8 · `src/entities/zombie.js`**

- `createZombie(typeId, x, y, tierCfg) → zombie`：`hp/maxHp = 配置hp × tierCfg.hpMult`，`speed = 配置speed × tierCfg.speedMult`；含 `{type,x,y,r,damage,xp,knockbackResist,kbx,kby,hitFlash,alive}`
- `updateZombie(z, player, obstacles, dt)`——朝玩家直线移动 + 击退位移衰减 + 障碍滑动 + hitFlash 计时
- `damageZombie(z, dmg, kb, angle) → bool`（是否死亡）；受击闪白 0.1s；击退按 `1-knockbackResist` 衰减

**Task 9 · `src/entities/projectile.js` / `src/entities/weapon.js`**

- `createProjectile() → {x:0, y:0, angle:0, speed:0, damage:0, range:0, traveled:0, pierce:0, knockback:0, alive:true}`
- `resetProjectile(p, opts)`——`Object.assign(p, opts, {traveled:0, alive:true})`
- `updateProjectile(p, dt)`——沿 `angle` 前进 `speed*dt`，`traveled` 累计，`traveled >= range` 则 `alive=false`
- `createWeapon(id) → {id, level:1, enhance:{damage:0, fireRate:0, projectiles:0, range:0}, cooldown:0, burstLeft:0, burstTimer:0, aimAngle:0}`
- `weaponStats(w)`——`damage = c.damage × 1.25^enhance.damage`、`fireRate = c.fireRate × 1.2^enhance.fireRate`、`projectiles = c.projectiles + enhance.projectiles`、`range = c.range × 1.2^enhance.range`，透传 `projectileSpeed/spread/pierce/aoe/knockback/burst/burstInterval`
- `applyEnhancement(w, stat)`——`level >= WEAPON_MAX_LEVEL` 时忽略，否则 `enhance[stat]++`、`level++`
- `updateWeapon(w, owner, zombies, spawnProjectile, rng, dt)`——索敌 / cooldown / burst / 多发扇形开火，完整行为规则见本分册 Task 9 节「行为」段

### 2.2 消费（Consumes）

- `slideCircleObstacles(e, obstacles)`——原地修改 `e.x/e.y`；e 需有 `x,y,r`；障碍物为 `{kind:'circle',x,y,r}` 或 `{kind:'rect',x,y,w,h}`（`01-foundation.md` Task 3；Task 7 玩家与 Task 8 僵尸的障碍滑动均消费）
- `mulberry32(seed) → () => number[0,1)`（`01-foundation.md` Task 2；Task 9 注入 rng，禁止 `Math.random`，G§4）
- `WEAPONS`：`{id: {id,name,damage,fireRate,projectileSpeed,range,projectiles,spread,pierce,aoe,knockback,burst,burstInterval}}`，含 `pistol/rifle/mg`（`02-config-tables.md` Task 4）
- `WEAPON_MAX_LEVEL = 8`（`02-config-tables.md` Task 4）
- `ZOMBIES`：`{id: {id,name,hp,speed,damage,xp,radius,color,knockbackResist,cost}}`，含 `normal/fast/tank`（`02-config-tables.md` Task 4）
- `createInput() → {state:{up,down,left,right}, destroy()}`——对象形状引用（不调用其函数，测试自构 `{up,down,left,right}` 裸对象）：`updatePlayer` 的 `input` 形参即该 `state` 形状（`03-world.md` Task 6；源文 Task 7 Interfaces 注明「input 为 Task 6 的 state」）

## 3. Task 7: 玩家实体

**Files：**
- Create: `src/entities/player.js`
- Test: `test/player.test.js`

- [x] **Step 1: 写失败测试**

```js
// test/player.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer, damagePlayer } from '../src/entities/player.js';
import { circleRectHit } from '../src/core/physics.js';

const IDLE = { up: false, down: false, left: false, right: false };

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
  assert.equal(damagePlayer(p, 20), false); // 无敌中
  assert.equal(p.hp, 80);
  updatePlayer(p, IDLE, [], 3000, 0.6);     // 无敌帧结束
  assert.equal(damagePlayer(p, 20), true);
  assert.equal(p.hp, 60);
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/player.test.js`
Expected: FAIL，模块不存在

- [x] **Step 3: 实现**

```js
// src/entities/player.js
import { slideCircleObstacles } from '../core/physics.js';

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
    p.facing = Math.atan2(dy, dx);
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

- [x] **Step 4: 运行确认通过**

Run: `node --test test/player.test.js`
Expected: 全 PASS

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 玩家移动、障碍滑动与受伤无敌帧"
```

### Task 7 验收

- 单测：`test/player.test.js`，5 个用例
- 运行：`node --test test/player.test.js` → 全 PASS（即 Step 4）
- 源计划 Task 7 无人工验收清单

## 4. Task 8: 僵尸实体与追踪 AI

**Files：**
- Create: `src/entities/zombie.js`
- Test: `test/zombie.test.js`

- [x] **Step 1: 写失败测试**

```js
// test/zombie.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombie, updateZombie, damageZombie } from '../src/entities/zombie.js';

const T1 = { hpMult: 1, speedMult: 1 };
const T4 = { hpMult: 3.2, speedMult: 1.05 };

test('难度倍率作用于 hp 与 speed', () => {
  const z = createZombie('normal', 0, 0, T4);
  assert.equal(z.hp, 30 * 3.2);
  assert.equal(z.speed, 70 * 1.05);
  assert.equal(z.alive, true);
});

test('持续追踪使与玩家距离缩短', () => {
  const z = createZombie('normal', 0, 0, T1);
  const p = { x: 500, y: 0 };
  const d0 = Math.hypot(p.x - z.x, p.y - z.y);
  for (let i = 0; i < 60; i++) updateZombie(z, p, [], 1 / 60);
  assert.ok(Math.hypot(p.x - z.x, p.y - z.y) < d0);
});

test('击退受抗性影响：坦克位移远小于普通', () => {
  const n = createZombie('normal', 0, 0, T1);
  const t = createZombie('tank', 0, 0, T1);
  damageZombie(n, 1, 100, 0);
  damageZombie(t, 1, 100, 0);
  assert.ok(Math.abs(t.kbx) < Math.abs(n.kbx) * 0.25); // 80% 抗性
});

test('伤害致死返回 true 且 alive=false；受击闪白计时', () => {
  const z = createZombie('fast', 0, 0, T1);
  assert.equal(damageZombie(z, 5, 0, 0), false);
  assert.ok(z.hitFlash > 0);
  assert.equal(damageZombie(z, 999, 0, 0), true);
  assert.equal(z.alive, false);
});

test('击退速度随时间衰减', () => {
  const z = createZombie('normal', 0, 0, T1);
  damageZombie(z, 1, 100, 0);
  const k0 = z.kbx;
  updateZombie(z, { x: 9999, y: 0 }, [], 0.5);
  assert.ok(Math.abs(z.kbx) < Math.abs(k0));
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/zombie.test.js`
Expected: FAIL，模块不存在

- [x] **Step 3: 实现**

```js
// src/entities/zombie.js
import { ZOMBIES } from '../config/zombies.js';
import { slideCircleObstacles } from '../core/physics.js';

export function createZombie(typeId, x, y, tierCfg) {
  const c = ZOMBIES[typeId];
  return {
    type: typeId, x, y, r: c.radius,
    hp: c.hp * tierCfg.hpMult, maxHp: c.hp * tierCfg.hpMult,
    speed: c.speed * tierCfg.speedMult,
    damage: c.damage, xp: c.xp,
    knockbackResist: c.knockbackResist,
    kbx: 0, kby: 0, hitFlash: 0, alive: true,
  };
}

export function updateZombie(z, player, obstacles, dt) {
  const dx = player.x - z.x, dy = player.y - z.y;
  const d = Math.hypot(dx, dy) || 1;
  z.x += dx / d * z.speed * dt + z.kbx * dt;
  z.y += dy / d * z.speed * dt + z.kby * dt;
  const decay = Math.max(0, 1 - 6 * dt); // 击退指数衰减
  z.kbx *= decay; z.kby *= decay;
  slideCircleObstacles(z, obstacles);
  if (z.hitFlash > 0) z.hitFlash -= dt;
}

export function damageZombie(z, dmg, kb, angle) {
  z.hp -= dmg;
  z.hitFlash = 0.1;
  const f = kb * (1 - z.knockbackResist);
  z.kbx += Math.cos(angle) * f;
  z.kby += Math.sin(angle) * f;
  if (z.hp <= 0) { z.alive = false; return true; }
  return false;
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/zombie.test.js`
Expected: 全 PASS

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 僵尸追踪 AI、击退抗性与受击闪白"
```

### Task 8 验收

- 单测：`test/zombie.test.js`，5 个用例
- 运行：`node --test test/zombie.test.js` → 全 PASS（即 Step 4）
- 源计划 Task 8 无人工验收清单

## 5. Task 9: 弹道与武器（projectile.js + weapon.js）

**Files：**
- Create: `src/entities/projectile.js`, `src/entities/weapon.js`
- Test: `test/projectile.test.js`, `test/weapon.test.js`

行为（updateWeapon 与 fire）：索敌 = `range` 内最近且 `alive` 的僵尸（僵尸对象需有 `x,y,alive`），无目标不开火；cooldown 制（开火后 `cooldown = 1/fireRate`，每帧 `cooldown = Math.max(0, cooldown - dt)` 钳到 0——无目标时不累积负值，测试据此断言 `cooldown === 0`）；`burst > 1` 时首发后 `burstLeft = burst - 1`、`burstTimer = burstInterval`，之后每 `burstInterval` 补一发（补发前仍需有目标，目标死亡则中止剩余 burst）；fire()：一次打出 `projectiles` 发弹，扇形分布 `(i - (n-1)/2) × 0.12` rad（n 为本次发弹数），叠加抖动 `(rng()×2-1) × spread`（spread 为角度，需转弧度）；每次调用 `spawnProjectile({x:owner.x, y:owner.y, angle, speed:stats.projectileSpeed, damage:stats.damage, range:stats.range, pierce:stats.pierce, knockback:stats.knockback})`。索敌范围用增强后的 `stats.range`。

- [x] **Step 1: 写失败测试**

```js
// test/projectile.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectile, resetProjectile, updateProjectile } from '../src/entities/projectile.js';

test('createProjectile 返回默认字段', () => {
  assert.deepEqual(createProjectile(), {
    x: 0, y: 0, angle: 0, speed: 0, damage: 0, range: 0,
    traveled: 0, pierce: 0, knockback: 0, alive: true,
  });
});

test('resetProjectile 应用 opts 并重置 traveled/alive', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 10, y: 20, angle: 0.5, speed: 200, damage: 8, range: 400, pierce: 2, knockback: 60 });
  assert.equal(p.x, 10); assert.equal(p.y, 20);
  assert.equal(p.angle, 0.5); assert.equal(p.speed, 200);
  assert.equal(p.damage, 8); assert.equal(p.range, 400);
  assert.equal(p.pierce, 2); assert.equal(p.knockback, 60);
  assert.equal(p.traveled, 0); assert.equal(p.alive, true);
});

test('沿 angle 方向前进 speed*dt 且 traveled 累计', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 100, damage: 1, range: 1000, pierce: 0, knockback: 0 });
  updateProjectile(p, 0.5);
  assert.ok(Math.abs(p.x - 50) < 1e-9);
  assert.ok(Math.abs(p.y - 0) < 1e-9);
  assert.ok(Math.abs(p.traveled - 50) < 1e-9);
});

test('traveled 未达 range 仍存活', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 100, damage: 1, range: 100, pierce: 0, knockback: 0 });
  updateProjectile(p, 0.5);
  assert.equal(p.alive, true);
});

test('traveled 达到 range 后 alive=false', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 100, damage: 1, range: 100, pierce: 0, knockback: 0 });
  updateProjectile(p, 1); // traveled == range
  assert.equal(p.alive, false);
});
```

```js
// test/weapon.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { createWeapon, weaponStats, applyEnhancement, updateWeapon } from '../src/entities/weapon.js';
import { WEAPON_MAX_LEVEL } from '../src/config/weapons.js';

test('射程内无僵尸不开火，无冷却', () => {
  const w = createWeapon('pistol'); // range 600
  const owner = { x: 0, y: 0 };
  const shots = [];
  const rng = mulberry32(1);
  updateWeapon(w, owner, [], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
  assert.equal(w.cooldown, 0);
  // 僵尸在射程外同样不开火
  updateWeapon(w, owner, [{ x: 900, y: 0, alive: true }], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 0);
});

test('开火后 cooldown = 1/fireRate', () => {
  const w = createWeapon('pistol'); // fireRate 2.0
  const owner = { x: 0, y: 0 };
  const z = { x: 100, y: 0, alive: true };
  const shots = [];
  const rng = mulberry32(2);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.ok(Math.abs(w.cooldown - 1 / 2.0) < 1e-9);
  assert.equal(w.aimAngle, 0); // 目标在正东
});

test('rifle 一轮 burst 打出 3 发且间隔正确', () => {
  const w = createWeapon('rifle'); // burst 3, burstInterval 0.08, fireRate 1.4
  const owner = { x: 0, y: 0 };
  const z = { x: 200, y: 0, alive: true };
  const shots = [];
  const rng = mulberry32(3);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.equal(w.burstLeft, 2);
  assert.equal(w.burstTimer, 0.08);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.08);  // 满一个 burstInterval
  assert.equal(shots.length, 2);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.08);  // 再满一个 burstInterval
  assert.equal(shots.length, 3);
  assert.equal(w.burstLeft, 0);
  // 总耗时 0.176s < cooldown(1/1.4≈0.714)，确认 3 发均来自 burst 而非冷却重开
  assert.ok(w.cooldown > 0.5);
});

test('burst 补发时目标死亡则中止', () => {
  const w = createWeapon('rifle');
  const owner = { x: 0, y: 0 };
  const z = { x: 200, y: 0, alive: true };
  const shots = [];
  const rng = mulberry32(4);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  z.alive = false; // 首发后目标死亡
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.08);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.08);
  assert.equal(shots.length, 1);
});

test('applyEnhancement 后 weaponStats 数值正确', () => {
  const w = createWeapon('pistol');
  applyEnhancement(w, 'damage');
  applyEnhancement(w, 'fireRate');
  applyEnhancement(w, 'projectiles');
  applyEnhancement(w, 'range');
  const s = weaponStats(w);
  assert.equal(s.damage, 12 * 1.25);
  assert.equal(s.fireRate, 2 * 1.2);
  assert.equal(s.projectiles, 2);
  assert.equal(s.range, 600 * 1.2);
  assert.equal(s.projectileSpeed, 500);
  assert.equal(s.spread, 0);
  assert.equal(s.pierce, 0);
  assert.equal(s.aoe, 0);
  assert.equal(s.knockback, 120);
  assert.equal(s.burst, 1);
  assert.equal(s.burstInterval, 0);
  assert.equal(w.level, 5);
});

test('level 达上限后 applyEnhancement 无效', () => {
  const w = createWeapon('pistol');
  for (let i = 1; i < WEAPON_MAX_LEVEL; i++) applyEnhancement(w, 'damage');
  assert.equal(w.level, WEAPON_MAX_LEVEL);
  const before = weaponStats(w).damage;
  applyEnhancement(w, 'range');
  assert.equal(w.enhance.range, 0);
  assert.equal(w.level, WEAPON_MAX_LEVEL);
  assert.equal(weaponStats(w).damage, before);
});

test('enhance.projectiles=2 时一次开火产生 3 发扇形弹道', () => {
  const w = createWeapon('pistol'); // spread 0，无抖动
  applyEnhancement(w, 'projectiles');
  applyEnhancement(w, 'projectiles');
  const owner = { x: 0, y: 0 };
  const z = { x: 100, y: 0, alive: true };
  const shots = [];
  const rng = mulberry32(5);
  updateWeapon(w, owner, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 3);
  assert.equal(shots[0].angle, -0.12);
  assert.equal(shots[1].angle, 0);   // 中间一发指向目标
  assert.equal(shots[2].angle, 0.12);
  for (const s of shots) {
    assert.equal(s.x, 0);
    assert.equal(s.y, 0);
    assert.equal(s.speed, 500);
    assert.equal(s.damage, 12);
    assert.equal(s.range, 600);
    assert.equal(s.pierce, 0);
    assert.equal(s.knockback, 120);
  }
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/projectile.test.js test/weapon.test.js`
Expected: FAIL，找不到 `../src/entities/projectile.js` 与 `../src/entities/weapon.js`

- [x] **Step 3: 实现**

```js
// src/entities/projectile.js
// 弹道飞行：沿 angle 直线前进、按 range 耗尽消亡。纯逻辑模块，无 DOM 依赖。

export function createProjectile() {
  return { x: 0, y: 0, angle: 0, speed: 0, damage: 0, range: 0,
    traveled: 0, pierce: 0, knockback: 0, alive: true };
}

export function resetProjectile(p, opts) {
  Object.assign(p, opts, { traveled: 0, alive: true });
}

export function updateProjectile(p, dt) {
  p.x += Math.cos(p.angle) * p.speed * dt;
  p.y += Math.sin(p.angle) * p.speed * dt;
  p.traveled += p.speed * dt;
  if (p.traveled >= p.range) p.alive = false;
}
```

```js
// src/entities/weapon.js
// 武器实例：增强计算、索敌、cooldown 开火与 burst 连发。纯逻辑模块，无 DOM 依赖。
import { WEAPONS, WEAPON_MAX_LEVEL } from '../config/weapons.js';

export function createWeapon(id) {
  return {
    id, level: 1,
    enhance: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
    cooldown: 0, burstLeft: 0, burstTimer: 0, aimAngle: 0,
  };
}

export function weaponStats(w) {
  const c = WEAPONS[w.id];
  return {
    damage: c.damage * Math.pow(1.25, w.enhance.damage),
    fireRate: c.fireRate * Math.pow(1.2, w.enhance.fireRate),
    projectiles: c.projectiles + w.enhance.projectiles,
    range: c.range * Math.pow(1.2, w.enhance.range),
    projectileSpeed: c.projectileSpeed,
    spread: c.spread,
    pierce: c.pierce,
    aoe: c.aoe,
    knockback: c.knockback,
    burst: c.burst,
    burstInterval: c.burstInterval,
  };
}

export function applyEnhancement(w, stat) {
  if (w.level >= WEAPON_MAX_LEVEL) return;
  w.enhance[stat] += 1;
  w.level += 1;
}

function acquireTarget(w, owner, zombies, stats) {
  let best = null, bestD = stats.range;
  for (const z of zombies) {
    if (!z.alive) continue;
    const d = Math.hypot(z.x - owner.x, z.y - owner.y);
    if (d <= stats.range && d < bestD) { best = z; bestD = d; }
  }
  return best;
}

function fire(w, owner, target, stats, spawnProjectile, rng) {
  w.aimAngle = Math.atan2(target.y - owner.y, target.x - owner.x);
  const n = stats.projectiles;
  for (let i = 0; i < n; i++) {
    const fan = (i - (n - 1) / 2) * 0.12;
    const jitter = (rng() * 2 - 1) * stats.spread * Math.PI / 180;
    spawnProjectile({
      x: owner.x, y: owner.y,
      angle: w.aimAngle + fan + jitter,
      speed: stats.projectileSpeed,
      damage: stats.damage,
      range: stats.range,
      pierce: stats.pierce,
      knockback: stats.knockback,
    });
  }
}

export function updateWeapon(w, owner, zombies, spawnProjectile, rng, dt) {
  w.cooldown = Math.max(0, w.cooldown - dt); // 钳到 0：无目标时不累积负值
  const stats = weaponStats(w);
  // burst 补发：每 burstInterval 一发，仍需有目标
  if (w.burstLeft > 0) {
    w.burstTimer -= dt;
    if (w.burstTimer <= 0) {
      const t = acquireTarget(w, owner, zombies, stats);
      if (t) {
        fire(w, owner, t, stats, spawnProjectile, rng);
        w.burstLeft -= 1;
        w.burstTimer = stats.burstInterval;
      }
    }
  }
  // cooldown 制常规开火
  if (w.cooldown > 0) return;
  const target = acquireTarget(w, owner, zombies, stats);
  if (!target) return;
  fire(w, owner, target, stats, spawnProjectile, rng);
  w.cooldown = 1 / stats.fireRate;
  if (stats.burst > 1) {
    w.burstLeft = stats.burst - 1;
    w.burstTimer = stats.burstInterval;
  }
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/projectile.test.js test/weapon.test.js`
Expected: 全 PASS（projectile 5 个用例 + weapon 7 个用例）

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 弹道飞行与武器索敌开火（含 burst 连发与增强计算）"
```

### Task 9 验收

- 单测：`test/projectile.test.js` 5 个用例 + `test/weapon.test.js` 7 个用例，合计 12 个
- 运行：`node --test test/projectile.test.js test/weapon.test.js` → 全 PASS（即 Step 4）
- 源计划 Task 9 无人工验收清单

## 6. 歧义裁决（本模块）

| # | 易误解点 | 裁定 | 来源 |
|---|---|---|---|
| 1 | 无敌帧语义 | 无敌帧内 `damagePlayer` 返回 false 且不重置无敌计时 | 拆分裁定 |
| 2 | hitFlash 类型 | hitFlash 是剩余秒数（0.1 递减至 0）非布尔，渲染按 hitFlash/0.1 取 alpha | 拆分裁定 |
| 3 | 击退语义 | 击退是速度量（px/s）可叠加（+=），按 6/s 指数衰减，施加在常规移动之后 | 拆分裁定 |
| 4 | weaponStats 计算 | weaponStats 每帧重算无缓存；damage/fireRate/range 为乘区（1.25^n/1.2^n），projectiles 为加法 | 拆分裁定 |
| 5 | burst 中止 vs 暂停 | burst 补发时无目标：burstTimer 停留 ≤0，出现目标即刻补发，burstLeft 不丢失（源文「目标死亡则中止剩余 burst」指暂停补发而非清零 burstLeft；测试中仅一只僵尸且死亡，故无后续弹） | 拆分裁定 |
| 6 | spread 单位 | spread 单位是度、发射时转弧度；多发扇形固定间隔 0.12rad | 拆分裁定 |
| 7 | cooldown 下限 | cooldown 钳 0（无目标不累积负值，测试断言 ===0） | 拆分裁定 |
| 8 | updatePlayer 帧内顺序 | 顺序固定为：输入位移（斜向归一化）→ 地图边界夹紧 → 障碍滑动 → 无敌帧递减；无方向输入时不更新 `facing`（保持上次朝向，初始 0） | 源文隐含·本次明示 |
| 9 | damageZombie 去重 | damageZombie 无帧内去重/无敌机制，同帧多次调用多次结算（由 05 分册 combat 决定命中次数）；hitFlash 每次受击赋值为 0.1（重置非叠加） | 源文隐含·本次明示 |
| 10 | 除零防护 | updateZombie 中与玩家距离为 0 时按 1 处理（`Math.hypot(...) \|\| 1`），追踪方向退化但击退位移仍施加 | 源文隐含·本次明示 |
| 11 | updateWeapon 帧内顺序 | 顺序固定为：cooldown 递减 → burst 补发 → 常规开火判断；burst 补发不检查也不重置 cooldown；每次 updateWeapon 调用只计算一次 weaponStats，补发与常规开火共用该结果 | 源文隐含·本次明示 |
| 12 | 索敌并列 | acquireTarget 用严格 `<` 比较，等距并列取数组中先遍历者；zombies 数组帧末 swap-remove 不保序（见 `07-scene-assembly.md`），等距目标的选取不保证帧间稳定 | 源文隐含·本次明示 |
| 13 | rng 消耗次数 | fire() 每发弹道调用一次 rng() 计算抖动，spread=0 时同样消耗随机数（仅抖动为 0）；统计同帧后续随机数序列时必须计入 | 源文隐含·本次明示 |
| 14 | resetProjectile 字段保留 | `Object.assign` 未覆盖的字段保留弹道旧值（仅 traveled/alive 强制重置）；调用方必须完整传入全部字段（fire() 已如此） | 源文隐含·本次明示 |
