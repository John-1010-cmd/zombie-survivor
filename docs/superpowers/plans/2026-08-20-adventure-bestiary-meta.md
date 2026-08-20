# 冒险关卡 · 双图鉴 · 双货币数值管线 · 视觉/UI 翻新 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按设计文档 `docs/superpowers/specs/2026-08-19-adventure-bestiary-meta-design.md`（2026-08-20 修订版）实现冒险模式、怪物/武器图鉴、金币局外升级、统一数值管线与视觉/UI 翻新。

**Architecture:** 数据注册表（`config/bestiary/*`）+ 行为注册表（`systems/behaviors.js`）分离；统一数值管线 `systems/scaling.js`（纯函数）全模式共用；局外存档 `core/meta.js`（localStorage key `zs_meta`）；绘制抽离到 `entities/render.js`。设计文档是唯一事实来源，引用处记为"设计 §N"。

**Tech Stack:** 原生 ES Modules（无构建）、Canvas 2D、`node --test`（`npm test`）、localStorage。

**全局约定：**
- 每个任务严格 TDD：先写失败测试 → 跑测试确认红 → 最小实现 → 跑测试确认绿 → 提交。
- 每个任务完成后跑全量 `npm test` 确认无回归，再提交。
- 单文件测试命令：`node --test test/<file>.test.js`（注意：`node --test` 默认会发现 `test/` 下全部用例，加文件参数只跑单文件）。
- 提交信息用中文简述 + 任务号，如 `git commit -m "任务1: 新增 core/meta.js 局外存档层"`。
- **模型分配**（设计 §12，用户裁定）：任务 13/14/15（视觉与 UI 翻新）与任务 12（开发者菜单）用 **K3-256k**；其余用 **deepseek-v4-flash**。
- 设计文档的关键数值/规则不要改；发现矛盾先停下来回报，不要自由发挥。

**任务依赖顺序**（设计 §12）：1(meta) → 2(scaling) → 3~6(怪物侧) → 7~8(武器侧) → 9(冒险配置) → 10(冒险接入) → 11(新界面) → 12(dev 菜单)；13/14/15（视觉/UI）彼此可并行，但须在 3、6 之后（`render.js` 依赖 Task 3 的 `config/bestiary/monsters.js` 与 Task 6 的 `EXPLODER_FUSE_TIME` 常量），并建议在 10 之后进行以免与 `game.js` render 冲突。

---

### Task 1: `core/meta.js` 局外存档层【模型：flash】

**Files:**
- Create: `src/core/meta.js`
- Test: `test/meta.test.js`

设计 §10。localStorage key = `'zs_meta'`，与 `zs_best`/`zs_settings` 互不读写；守卫模式复刻 `src/core/storage.js`（`typeof localStorage` + try/catch，Node 下不炸）。

**Step 1: 写失败测试** `test/meta.test.js`

```js
// test/meta.test.js —— 局外存档：金币、武器等级、冒险进度、图鉴击杀（设计 §10）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  META_VERSION, defaultMeta, loadMeta, saveMeta,
  addGold, spendGold, weaponLevel, recordKill, recordAdventureResult,
} from '../src/core/meta.js';

// —— 假 localStorage 注入（同 storage.test.js 模式）——
function setFakeStorage(raw) {
  const store = new Map(Object.entries(raw));
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  return store;
}
function clearFakeStorage() { delete globalThis.localStorage; }

test('defaultMeta 结构定稿（version 1）', () => {
  assert.equal(META_VERSION, 1);
  assert.deepEqual(defaultMeta(), {
    version: 1, gold: 0, weaponLevels: {},
    adventure: { unlocked: 1, firstClear: {}, bestTimes: {} },
    bestiaryKills: {},
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
  assert.equal(r2.isFirstClear, false); // 二通不再首通
  const r3 = recordAdventureResult(m, 'l3', 3, 3, true, 360);
  assert.equal(m.adventure.unlocked, 3); // 不超过总关数
  assert.equal(r3.isFirstClear, true);
});

test('冒险失败不解锁；最佳成绩 cleared 优先，其次比存活秒数', () => {
  const m = defaultMeta();
  recordAdventureResult(m, 'l1', 1, 3, false, 200);
  assert.equal(m.adventure.unlocked, 1);
  assert.deepEqual(m.adventure.bestTimes.l1, { cleared: false, timeSec: 200 });
  recordAdventureResult(m, 'l1', 1, 3, false, 100); // 更差不刷新
  assert.deepEqual(m.adventure.bestTimes.l1, { cleared: false, timeSec: 200 });
  recordAdventureResult(m, 'l1', 1, 3, true, 360); // cleared 优先
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

  // 版本不符：能识别的合法字段保留，坏字段回退
  setFakeStorage({
    zs_meta: JSON.stringify({ version: 0, gold: 300, weaponLevels: { pistol: 99 }, adventure: { unlocked: 2 } }),
  });
  const loaded = loadMeta();
  assert.equal(loaded.version, 1);
  assert.equal(loaded.gold, 300);
  assert.equal(loaded.weaponLevels.pistol, undefined); // 99 超界丢弃
  assert.equal(loaded.adventure.unlocked, 2);
  clearFakeStorage();
});
```

**Step 2: 跑测试确认失败**

Run: `node --test test/meta.test.js`
Expected: FAIL（`Cannot find module '../src/core/meta.js'`）

**Step 3: 实现** `src/core/meta.js`

```js
// src/core/meta.js —— 局外存档：金币、武器局外等级、冒险进度、图鉴击杀统计（设计 §10）。
// localStorage key 'zs_meta'，与 zs_best/zs_settings 互不读写；
// typeof 守卫 + try/catch 保证 node --test 下不炸（同 storage.js 模式）。
const META_KEY = 'zs_meta';
export const META_VERSION = 1;
const MAX_WEAPON_LEVEL = 10; // 局外升级上限（设计 §6.2）

export function defaultMeta() {
  return {
    version: META_VERSION,
    gold: 0,
    weaponLevels: {}, // { [weaponId]: 0..10 }
    adventure: { unlocked: 1, firstClear: {}, bestTimes: {} },
    bestiaryKills: {}, // { [monsterId]: n }
  };
}

// 逐项校验回退默认（version 缺失/不符同样走本函数：合法字段保留，坏字段丢弃）。
// 本期为首版无旧数据可迁移；后续版本升级在此按 v 分支迁移映射表。
function normalizeMeta(parsed) {
  const m = defaultMeta();
  const v = parsed?.version; // v1 无迁移，忽略 version 逐项校验；后续版本在此按 v 分支迁移
  if (!parsed || typeof parsed !== 'object') return m;
  if (typeof parsed.gold === 'number' && Number.isFinite(parsed.gold) && parsed.gold >= 0)
    m.gold = Math.floor(parsed.gold);
  if (parsed.weaponLevels && typeof parsed.weaponLevels === 'object') {
    for (const [id, lv] of Object.entries(parsed.weaponLevels)) {
      if (Number.isInteger(lv) && lv >= 0 && lv <= MAX_WEAPON_LEVEL) m.weaponLevels[id] = lv;
    }
  }
  if (parsed.adventure && typeof parsed.adventure === 'object') {
    const a = parsed.adventure;
    // unlocked 仅校验下限（≥1）；上限夹取在 UI 层按 ADVENTURE_LEVELS.length 做，meta.js 不反向依赖 adventure 配置
    if (Number.isInteger(a.unlocked) && a.unlocked >= 1) m.adventure.unlocked = a.unlocked;
    if (a.firstClear && typeof a.firstClear === 'object') {
      for (const [k, v] of Object.entries(a.firstClear)) if (v === true) m.adventure.firstClear[k] = true;
    }
    if (a.bestTimes && typeof a.bestTimes === 'object') {
      for (const [k, v] of Object.entries(a.bestTimes)) {
        if (v && typeof v === 'object' && typeof v.timeSec === 'number' && Number.isFinite(v.timeSec))
          m.adventure.bestTimes[k] = { cleared: v.cleared === true, timeSec: v.timeSec };
      }
    }
  }
  if (parsed.bestiaryKills && typeof parsed.bestiaryKills === 'object') {
    for (const [id, n] of Object.entries(parsed.bestiaryKills)) {
      if (Number.isInteger(n) && n >= 0) m.bestiaryKills[id] = n;
    }
  }
  return m;
}

export function loadMeta() {
  try {
    if (typeof localStorage === 'undefined') return defaultMeta();
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return defaultMeta();
    return normalizeMeta(JSON.parse(raw));
  } catch { return defaultMeta(); }
}

export function saveMeta(meta) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch { /* 存储不可用（隐私模式等）时静默忽略 */ }
}

// —— 金币 ——
export function addGold(meta, n) {
  meta.gold += Math.floor(n);
  return meta.gold;
}

export function spendGold(meta, n) {
  if (meta.gold < n) return false;
  meta.gold -= n;
  return true;
}

// —— 武器局外等级 ——
export function weaponLevel(meta, id) {
  return meta.weaponLevels[id] ?? 0;
}

// —— 图鉴击杀统计（全模式计数；解锁判定 = bestiaryKills[id] ≥ 1，设计 §7）——
export function recordKill(meta, monsterId) {
  meta.bestiaryKills[monsterId] = (meta.bestiaryKills[monsterId] ?? 0) + 1;
  return meta.bestiaryKills[monsterId];
}

// —— 冒险进度 ——
// 结算写入：首通标记、通关解锁 N+1（封顶 levelCount）、最佳成绩（cleared 优先，其次比存活秒数）。
// levelIndex 为 1 起序号。返回 { isFirstClear }（金币奖励 ×2 判定用，设计 §3.4）。
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

**Step 4: 跑测试确认通过**

Run: `node --test test/meta.test.js`
Expected: PASS（8 个用例）

**Step 5: 全量回归 + 提交**

Run: `npm test`
```bash
git add src/core/meta.js test/meta.test.js
git commit -m "任务1: 新增 core/meta.js 局外存档层（金币/武器等级/冒险进度/图鉴击杀）"
```

---

### Task 2: `systems/scaling.js` 统一数值管线【模型：flash】

**Files:**
- Create: `src/systems/scaling.js`
- Test: `test/scaling.test.js`

设计 §2。纯函数，无 DOM 依赖，全模式共用。Boss（`special: true`）仅豁免 hp/speed/damage 缩放，coin 仍按生成时刻档位递增（设计 §2.1 口径，用户裁定）。

**Step 1: 写失败测试** `test/scaling.test.js`

```js
// test/scaling.test.js —— 统一数值管线（设计 §2）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODE_SCALING, getModeScaling, monsterLevelMult, calcMonsterStats, weaponDamage,
} from '../src/systems/scaling.js';

const normal = { hp: 30, speed: 70, damage: 8, coin: 1, special: false };
const exploder = { hp: 40, speed: 90, damage: 5, coin: 3, aoe: { damage: 30, radius: 80 } };
const boss = { hp: 7040, speed: 20, damage: 40, coin: 50, special: true };

test('各模式增长率（设计 §2.1 表）', () => {
  assert.deepEqual(getModeScaling('endless'), { hpRatePerMin: 0.45, dmgRatePerMin: 0.225, speedRatePerMin: 0.02 });
  assert.deepEqual(getModeScaling('holdout10'), MODE_SCALING.endless);
  assert.deepEqual(getModeScaling('holdout20'), MODE_SCALING.endless);
  assert.deepEqual(getModeScaling('adventure'), { hpRatePerMin: 0.35, dmgRatePerMin: 0.175, speedRatePerMin: 0.015 });
  assert.deepEqual(getModeScaling('bogus'), MODE_SCALING.endless); // 未知模式回退无尽
});

test('关卡倍率：关 1 ×1.0、关 2 ×1.6、关 3 ×2.2；speed 单独小率', () => {
  assert.deepEqual(monsterLevelMult(1), { hpDmg: 1, speed: 1 });
  assert.deepEqual(monsterLevelMult(2), { hpDmg: 1.6, speed: 1.05 });
  assert.deepEqual(monsterLevelMult(3), { hpDmg: 2.2, speed: 1.1 });
  assert.deepEqual(monsterLevelMult(0), monsterLevelMult(1)); // 关卡下限 1
});

test('无尽 21 分钟 hp ≈ ×10.45（旧表第 8 档锚点）；damage 率 = hp 率一半', () => {
  const s = calcMonsterStats(normal, { level: 1, tier: 8, timeSec: 1260, mode: 'endless' });
  assert.ok(Math.abs(s.hp - 30 * 10.45) < 1e-9);
  assert.ok(Math.abs(s.damage - 8 * (1 + 0.225 * 21)) < 1e-9);
  assert.ok(Math.abs(s.speed - 70 * (1 + 0.02 * 21)) < 1e-9);
});

test('冒险通关时刻（360s）hp ×3.1；关卡倍率与局内增长相乘', () => {
  const s = calcMonsterStats(normal, { level: 1, tier: 4, timeSec: 360, mode: 'adventure' });
  assert.ok(Math.abs(s.hp - 30 * 3.1) < 1e-9);
  // 关 3 同刻：×2.2 × 3.1
  const s3 = calcMonsterStats(normal, { level: 3, tier: 4, timeSec: 360, mode: 'adventure' });
  assert.ok(Math.abs(s3.hp - 30 * 2.2 * 3.1) < 1e-9);
});

test('coin 档位递增：基值 × min(4, 1+0.25×(档-1))，Math.round 取整，不吃关卡倍率', () => {
  assert.equal(calcMonsterStats(normal, { tier: 1 }).coin, 1);
  assert.equal(calcMonsterStats(normal, { tier: 5 }).coin, 2);   // ×2
  assert.equal(calcMonsterStats(normal, { tier: 13 }).coin, 4);  // 封顶 ×4
  assert.equal(calcMonsterStats(normal, { tier: 99 }).coin, 4);
  assert.equal(calcMonsterStats(normal, { level: 3, tier: 5 }).coin, 2); // 关卡倍率不影响 coin
});

test('AoE 基伤走 damage 同乘区；无 aoe 字段的怪 aoeDamage=0', () => {
  const s = calcMonsterStats(exploder, { level: 2, tier: 4, timeSec: 60, mode: 'adventure' });
  assert.ok(Math.abs(s.aoeDamage - 30 * 1.6 * (1 + 0.175 * 1)) < 1e-9);
  assert.equal(calcMonsterStats(normal, {}).aoeDamage, 0);
});

test('Boss（special）仅豁免 hp/speed/damage 缩放，coin 仍按档位递增（设计 §2.1 口径）', () => {
  const s = calcMonsterStats(boss, { level: 3, tier: 8, timeSec: 9999, mode: 'adventure' });
  assert.equal(s.hp, 7040);   // hp 不缩放
  assert.equal(s.speed, 20);  // speed 不缩放
  assert.equal(s.damage, 40); // damage 不缩放
  assert.equal(s.aoeDamage, 0);
  // coin 随生成时刻档位递增：T5=50×2=100、T13=50×4=200
  assert.equal(calcMonsterStats(boss, { tier: 5 }).coin, 100);
  assert.equal(calcMonsterStats(boss, { tier: 13 }).coin, 200);
});

test('武器伤害双乘区（设计 §2.2）：线性 1+0.2×局外等级、1+0.25×局内次数', () => {
  assert.equal(weaponDamage(12, 0, 0), 12);
  assert.equal(weaponDamage(12, 10, 0), 36);      // 局外满级 ×3
  assert.equal(weaponDamage(12, 0, 8), 36);       // 局内满维 ×3（取代旧复利 1.25^8≈5.96）
  assert.equal(weaponDamage(12, 10, 8), 108);     // 双乘区叠乘
});
```

**Step 2: 跑测试确认失败**

Run: `node --test test/scaling.test.js`
Expected: FAIL（`Cannot find module '../src/systems/scaling.js'`）

**Step 3: 实现** `src/systems/scaling.js`

```js
// src/systems/scaling.js —— 统一数值管线（设计 §2）。纯函数，无 DOM 依赖，全模式共用。
// 怪物：最终值 = 图鉴基础 × 关卡倍率 × (1 + 局内分钟 × 增长率)；coin 沿用档位递增（不吃关卡倍率）。
// 武器：最终伤害 = 图鉴基础 × (1 + 0.2×局外等级) × (1 + 0.25×局内购买次数)。
// special 条目（Boss）仅豁免 hp/speed/damage 缩放，coin 仍按生成时刻档位递增（设计 §2.1 口径、§4.1 Boss 例外）。

export const MODE_SCALING = {
  endless:   { hpRatePerMin: 0.45, dmgRatePerMin: 0.225, speedRatePerMin: 0.02 },
  holdout10: { hpRatePerMin: 0.45, dmgRatePerMin: 0.225, speedRatePerMin: 0.02 },
  holdout20: { hpRatePerMin: 0.45, dmgRatePerMin: 0.225, speedRatePerMin: 0.02 },
  adventure: { hpRatePerMin: 0.35, dmgRatePerMin: 0.175, speedRatePerMin: 0.015 },
};

export function getModeScaling(mode) {
  return MODE_SCALING[mode] || MODE_SCALING.endless;
}

// 关卡倍率（局外）：hp/damage 与 speed 两条曲线；无尽/坚守恒 level 1
export function monsterLevelMult(level) {
  const l = Math.max(1, level);
  return { hpDmg: 1 + 0.6 * (l - 1), speed: 1 + 0.05 * (l - 1) };
}

// base = 图鉴条目。opts: { level = 冒险关卡序号, tier = 当前档位(coin 用), timeSec, mode }
// 返回 { hp, speed, damage, coin, aoeDamage }；hp/speed/damage 浮点，coin 已 Math.round
export function calcMonsterStats(base, { level = 1, tier = 1, timeSec = 0, mode = 'endless' } = {}) {
  if (base.special) {
    // Boss 仅豁免 hp/speed/damage 缩放；coin 仍按生成时刻档位递增（设计 §2.1 口径，用户裁定）
    return { hp: base.hp, speed: base.speed, damage: base.damage,
      coin: Math.round(base.coin * Math.min(4, 1 + 0.25 * (Math.max(1, tier) - 1))),
      aoeDamage: base.aoe ? base.aoe.damage : 0 };
  }
  const mult = monsterLevelMult(level);
  const rates = getModeScaling(mode);
  const minutes = timeSec / 60;
  return {
    hp: base.hp * mult.hpDmg * (1 + minutes * rates.hpRatePerMin),
    damage: base.damage * mult.hpDmg * (1 + minutes * rates.dmgRatePerMin),
    speed: base.speed * mult.speed * (1 + minutes * rates.speedRatePerMin),
    coin: Math.round(base.coin * Math.min(4, 1 + 0.25 * (Math.max(1, tier) - 1))),
    aoeDamage: base.aoe
      ? base.aoe.damage * mult.hpDmg * (1 + minutes * rates.dmgRatePerMin)
      : 0,
  };
}

// 武器伤害双乘区（线性，取代旧复利 1.25^n——2026-08-20 用户裁定）
export function weaponDamage(baseDamage, outLevel = 0, inRunCount = 0) {
  return baseDamage * (1 + 0.2 * outLevel) * (1 + 0.25 * inRunCount);
}
```

**Step 4: 跑测试确认通过**

Run: `node --test test/scaling.test.js`
Expected: PASS（8 个用例）

**Step 5: 全量回归 + 提交**

Run: `npm test`
```bash
git add src/systems/scaling.js test/scaling.test.js
git commit -m "任务2: 新增 systems/scaling.js 统一数值管线（怪物关卡倍率×局内增长、武器双乘区）"
```

---

### Task 3: `config/bestiary/monsters.js` 怪物图鉴【模型：flash】

**Files:**
- Create: `src/config/bestiary/monsters.js`
- Test: `test/bestiary.test.js`（本任务先建怪物部分，武器部分在任务 7 追加）

设计 §4。完整清单 5 条：normal / fast / tank / boss（`special: true`）/ exploder。数值从 `src/config/zombies.js` 原样迁移，`color` 并入 `visual.color`。

**Step 1: 写失败测试** `test/bestiary.test.js`

```js
// test/bestiary.test.js —— 图鉴数据完整性（设计 §4.1/§5 字段契约）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, MAX_ZOMBIE_R, playableMonsters } from '../src/config/bestiary/monsters.js';
import { DIFFICULTY_TIERS } from '../src/config/difficulty.js';

test('怪物清单 5 条：normal/fast/tank/boss/exploder，字段契约齐全', () => {
  assert.deepEqual(Object.keys(MONSTERS).sort(), ['boss', 'exploder', 'fast', 'normal', 'tank']);
  for (const m of Object.values(MONSTERS)) {
    for (const f of ['hp', 'speed', 'damage', 'coin', 'radius', 'cost'])
      assert.ok(m[f] > 0, `${m.id}.${f} 应为正数`);
    assert.ok(m.knockbackResist >= 0 && m.knockbackResist < 1, `${m.id}.knockbackResist`);
    assert.ok(typeof m.name === 'string' && m.name, `${m.id} 缺名称`);
    assert.ok(typeof m.desc === 'string' && m.desc, `${m.id} 缺图鉴描述`);
    assert.ok(m.visual && typeof m.visual.shape === 'string' && typeof m.visual.color === 'string',
      `${m.id} 缺 visual.shape/color`);
    assert.ok(m.behavior === null || typeof m.behavior === 'string', `${m.id}.behavior`);
    assert.equal(m.id in MONSTERS && MONSTERS[m.id] === m, true);
  }
});

test('迁移数值与旧版一致（normal/fast/tank/boss）', () => {
  assert.deepEqual(
    (({ id, name, hp, speed, damage, coin, radius, knockbackResist, cost }) =>
      ({ id, name, hp, speed, damage, coin, radius, knockbackResist, cost }))(MONSTERS.boss),
    { id: 'boss', name: '守门Boss', hp: 7040, speed: 20, damage: 40, coin: 50, radius: 41, knockbackResist: 0.95, cost: 999 },
  );
  assert.equal(MONSTERS.normal.hp, 30);
  assert.equal(MONSTERS.fast.speed, 140);
  assert.equal(MONSTERS.tank.cost, 6);
});

test('自爆僵尸条目：behavior=exploder、aoe 30/80、cost 2', () => {
  const e = MONSTERS.exploder;
  assert.equal(e.behavior, 'exploder');
  assert.deepEqual(e.aoe, { damage: 30, radius: 80 });
  assert.equal(e.cost, 2);
});

test('boss 标记 special；playableMonsters 默认排除 special、includeSpecial 包含（图鉴界面数据源，设计 §4.1/§7）', () => {
  assert.equal(MONSTERS.boss.special, true);
  assert.ok(!MONSTERS.normal.special && !MONSTERS.exploder.special);
  assert.deepEqual(playableMonsters().map(m => m.id).sort(), ['exploder', 'fast', 'normal', 'tank']);
  assert.deepEqual(playableMonsters({ includeSpecial: true }).map(m => m.id).sort(),
    ['boss', 'exploder', 'fast', 'normal', 'tank']);
});

test('难度表 weights 引用的怪物都存在（含无尽档 5 起的 exploder）', () => {
  for (const t of DIFFICULTY_TIERS)
    for (const id of Object.keys(t.weights)) assert.ok(MONSTERS[id], `档 ${t.tier} 引用未知怪物 ${id}`);
  for (const t of DIFFICULTY_TIERS.slice(4)) assert.ok(t.weights.exploder > 0, `档 ${t.tier} 应含 exploder`);
  assert.ok(MAX_ZOMBIE_R >= 41); // 不小于守门 Boss 半径
});
```

**Step 2: 跑测试确认失败**

Run: `node --test test/bestiary.test.js`
Expected: FAIL（`Cannot find module`；且难度表尚无 exploder 权重——任务 4 才加，此用例同步驱动任务 4）

**Step 3: 实现** `src/config/bestiary/monsters.js`

```js
// src/config/bestiary/monsters.js —— 怪物图鉴（设计 §4）。替代 config/zombies.js。
// 新增种类：换皮换数值 → 加一条数据（behavior: null）即可；
//           新机制 → 先在 systems/behaviors.js 注册行为模块，再在此声明 behavior 字段。
// 字段契约：id/name/desc/hp/speed/damage/coin/radius/knockbackResist/cost/visual/behavior 必填；
//           aoe（仅 AoE 怪）、special（仅 boss）可选。数值缩放走 systems/scaling.js。
export const MONSTERS = {
  normal: {
    id: 'normal', name: '普通僵尸', desc: '最基础的感染者，成群结队地涌来。',
    hp: 30, speed: 70, damage: 8, coin: 1,
    radius: 14, knockbackResist: 0, cost: 1,
    visual: { shape: 'circle', color: '#6a8f6a', glow: 0.3 },
    behavior: null,
  },
  fast: {
    id: 'fast', name: '高速僵尸', desc: '速度极快的感染者，擅长包抄侧翼。',
    hp: 18, speed: 140, damage: 6, coin: 1,
    radius: 11, knockbackResist: 0, cost: 1,
    visual: { shape: 'triangle', color: '#c9c25a', glow: 0.3 },
    behavior: null,
  },
  tank: {
    id: 'tank', name: '坦克僵尸', desc: '皮糙肉厚的大型感染者，几乎不为击退所动。',
    hp: 220, speed: 40, damage: 20, coin: 5,
    radius: 24, knockbackResist: 0.8, cost: 6,
    visual: { shape: 'hexagon', color: '#a85a5a', glow: 0.3 },
    behavior: null,
  },
  boss: {
    id: 'boss', name: '守门Boss', desc: '守在撤离点的巨型感染者。只在坚守模式最后时刻出现。',
    hp: 7040, speed: 20, damage: 40, coin: 50,
    radius: 41, knockbackResist: 0.95, cost: 999,
    visual: { shape: 'pentagon', color: '#7a2f2f', glow: 0.5 },
    behavior: null,
    special: true, // 不走关卡倍率与局内增长（设计 §2.1 Boss 例外）；坚守隐藏期间图鉴界面不显示
  },
  exploder: {
    id: 'exploder', name: '自爆僵尸', desc: '接近目标后点燃引信，1.2 秒后自爆。趁引信未燃尽将其击毙！',
    hp: 40, speed: 90, damage: 5, coin: 3,
    radius: 13, knockbackResist: 0, cost: 2,
    visual: { shape: 'diamond', color: '#e08a3c', glow: 0.5 },
    behavior: 'exploder',
    aoe: { damage: 30, radius: 80 }, // AoE 与接触 damage 同乘区缩放（设计 §4.3）
  },
};

export const MAX_ZOMBIE_R = Math.max(...Object.values(MONSTERS).map(z => z.radius));

// 图鉴界面陈列：当前可达模式可出现的种类（special 条目在坚守隐藏期间不显示，设计 §7）。
// includeSpecial=true 时包含特殊条目（本期坚守恒隐藏、boss 恒不显示；恢复坚守时图鉴传 includeSpecial: true，
// 数据与击杀统计保留，恢复后自动出现）。
export function playableMonsters({ includeSpecial = false } = {}) {
  return Object.values(MONSTERS).filter(m => includeSpecial || !m.special);
}
```

**Step 4: 跑测试确认（怪物条目部分通过，难度表 exploder 用例仍红——留给任务 5 前完成）**

Run: `node --test test/bestiary.test.js`
Expected: 前 4 个用例 PASS；`难度表 weights 引用` 用例 FAIL（驱动任务 4）

**Step 5: 提交（允许带一个红用例，任务 4 立即修绿；两步属于同一逻辑变更，也可合并为一次提交）**

```bash
git add src/config/bestiary/monsters.js test/bestiary.test.js
git commit -m "任务3: 新增 config/bestiary/monsters.js 怪物图鉴（5 条 + special/aoe 扩展字段）"
```

---

### Task 4: `config/difficulty.js` 字段退役 + 无尽自爆权重【模型：flash】

**Files:**
- Modify: `src/config/difficulty.js`
- Modify: `test/config.test.js`

设计 §2.1：`hpMult`/`speedMult`/`unlocks` 字段退役（`unlocks` 现状零读取，死字段）；无尽档 5 起 weights 写入 exploder（设计 §4.3）。

**Step 1: 改写 `test/config.test.js`（先红）**

- 删除：`import { ZOMBIES, MAX_ZOMBIE_R } from '../src/config/zombies.js'` 及僵尸相关 3 个用例——`僵尸字段完整`、`三基础僵尸银币面值 1/1/5`、`守门 Boss 配置与契约一致`（已迁 `bestiary.test.js`）。
- 武器 import 处置（单一裁定）：**Task 4 只动僵尸/难度部分**，顶部 `import { WEAPONS, WEAPON_MAX_LEVEL, ENHANCE_STATS, STAT_LABEL } from '../src/config/weapons.js'` 与 `增强维度常量一致` 用例保留不动；`武器字段完整` 用例也保留（`config/weapons.js` 本任务仍存在），其删除/迁移留到 Task 7 统一处理。
- `预算表 ×1.5` 用例：删除两行 `hpMult`/`speedMult` 数组断言，改为：

```js
test('预算表 ×1.5：档 1–8 依次 3/4.5/7/9/12/15/18/21；hpMult/speedMult/unlocks 已退役', () => {
  assert.deepEqual(DIFFICULTY_TIERS.map(t => t.budgetPerSec), [3, 4.5, 7, 9, 12, 15, 18, 21]);
  assert.deepEqual(DIFFICULTY_TIERS[0].weights, { normal: 1 });
  assert.deepEqual(DIFFICULTY_TIERS[3].weights, { normal: 0.5, fast: 0.3, tank: 0.2 });
  for (const t of DIFFICULTY_TIERS) {
    assert.ok(!('hpMult' in t), 'hpMult 已退役');
    assert.ok(!('speedMult' in t), 'speedMult 已退役');
    assert.ok(!('unlocks' in t), 'unlocks 已退役（死字段）');
  }
  // 无尽档 5 起引入自爆（设计 §4.3）
  assert.deepEqual(DIFFICULTY_TIERS[4].weights, { normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 });
  assert.deepEqual(DIFFICULTY_TIERS[6].weights, { normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 });
  assert.deepEqual(DIFFICULTY_TIERS[7].weights, { normal: 0.3, fast: 0.3, tank: 0.25, exploder: 0.15 });
});
```

- `档 9+` 用例：删除 `hpMult`/`speedMult` 封顶断言，保留预算递增断言；`HOLDOUT10_TIERS` 两个用例：删除 `hpMult`/`speedMult` 对比行（保留 weights/budgetPerSec 对比）；注意坚守段 5–6 现在会带 exploder 权重（继承无尽档 5–6，设计预期内）。
- 其余用例（常量边界/tierStartTime/MODES）不动。

**Step 2: 跑测试确认失败**

Run: `node --test test/config.test.js test/bestiary.test.js`
Expected: FAIL（`hpMult 已退役` 等断言不通过、exploder 权重缺失）

**Step 3: 实现 `src/config/difficulty.js` 修改**

`DIFFICULTY_TIERS` 改为（删除 hpMult/speedMult/unlocks，档 5–8 加 exploder）：

```js
// 无尽模式难度阶梯（预算 ×1.5，档 3 取整为 7）
// hpMult/speedMult/unlocks 已退役：数值增长走 systems/scaling.js（设计 §2.1），
// “某档起出现某怪”直接写进该档 weights（unlocks 原为零读取死字段）。
export const DIFFICULTY_TIERS = [
  { tier: 1, budgetPerSec: 3,   weights: { normal: 1 } },
  { tier: 2, budgetPerSec: 4.5, weights: { normal: 0.7, fast: 0.3 } },
  { tier: 3, budgetPerSec: 7,   weights: { normal: 0.6, fast: 0.4 } },
  { tier: 4, budgetPerSec: 9,   weights: { normal: 0.5, fast: 0.3, tank: 0.2 } },
  { tier: 5, budgetPerSec: 12,  weights: { normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 } },
  { tier: 6, budgetPerSec: 15,  weights: { normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 } },
  { tier: 7, budgetPerSec: 18,  weights: { normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 } },
  { tier: 8, budgetPerSec: 21,  weights: { normal: 0.3, fast: 0.3, tank: 0.25, exploder: 0.15 } },
];
```

`HOLDOUT10_TIERS` 映射去掉 hpMult/speedMult：

```js
// 坚守 10 分钟：6 段 × 100s，第 n 段取无尽档 n 的数值（weights/budgetPerSec）
const HOLDOUT10_SEGMENT = 100;
export const HOLDOUT10_TIERS = DIFFICULTY_TIERS.slice(0, 6).map((t, i) => ({
  tier: i + 1,
  weights: t.weights,
  budgetPerSec: t.budgetPerSec,
}));
```

`MODES` 与其他函数不动。

**Step 4: 跑测试确认通过**

Run: `node --test test/config.test.js test/bestiary.test.js`
Expected: PASS（全绿）

**Step 5: 全量回归 + 提交**

Run: `npm test`
Expected: 仅 `spawner.test.js` 会红（其 `t=1500` 用例断言 hp 走旧 hpMult 封顶 ×10，而难度表已退役 `hpMult` 字段）；`zombie.test.js` / `combat.test.js` / `teslaball.test.js` 显式传 `hpMult` 仍绿（`createZombie` 旧签名继续读 hpMult，任务 5 才改签名）——属预期，任务 5 修复；若此时想保持全绿，可把任务 4/5 合并提交。
```bash
git add src/config/difficulty.js test/config.test.js test/bestiary.test.js
git commit -m "任务4: 难度表退役 hpMult/speedMult/unlocks，无尽档 5 起引入自爆僵尸权重"
```

---

### Task 5: `entities/zombie.js` 管线化 + 全部调用点改道【模型：flash】

**Files:**
- Modify: `src/entities/zombie.js`（createZombie 新签名）
- Modify: `src/systems/spawner.js`（import 改道 + scalingCtx 透传）
- Modify: `src/systems/combat.js`（MAX_ZOMBIE_R 改道）
- Modify: `src/game.js`（ZOMBIES 改道 + devSpawnZombie/Boss 注入新签名 + killZombie 计图鉴 + counted 防重）
- Delete: `src/config/zombies.js`
- Modify: `test/zombie.test.js`、`test/spawner.test.js`、`test/combat.test.js`、`test/teslaball.test.js`

设计 §2.1。`createZombie` 第四参数由 `{tier, hpMult, speedMult}` 改为管线参数 `{ level, tier, timeSec, mode }`，数值由 `calcMonsterStats` 计算。

**Step 1: 改写存量测试（先红）**

- `test/zombie.test.js`：无 `ZOMBIES` import（现状只 import `createZombie/updateZombie/damageZombie`），无需改道；如需引用图鉴数值，按需 `import { MONSTERS } from '../src/config/bestiary/monsters.js'`。`createZombie(type, x, y, { tier, hpMult, speedMult })` 调用全部改为 `createZombie(type, x, y, { tier })`（timeSec/mode 缺省即基础值）。凡断言 `hp === 基础 × hpMult` / `speed === 基础 × speedMult` 的普通怪用例，改为断言 `timeSec=0、level=1 时等于图鉴基础值`（缩放已在 `scaling.test.js` 覆盖，此处不重复）；`守门 Boss 创建：数值与抗性生效，倍率照常作用` 用例改名为 `守门 Boss 创建：special 不缩放（hp/speed/damage 恒基础值），coin 仍按档递增`，Boss 的 `hp`/`speed`/`damage` 断言改为恒基础值 7040/20/40（无论 T4/T13，special 不缩放），**coin 断言 100/200 保留不动**（T5=50×2、T13=50×4，裁定：coin 仍随档递增）。
- `test/spawner.test.js`：`ZOMBIES` → `MONSTERS`（同上改 import）；`t=1500（9 档）僵尸 hp 用档 8 封顶倍率 ×10` 用例改名为 `t=1500 僵尸 hp 按 scaling 管线连续增长`，断言由 `z.hp === ZOMBIES[z.type].hp * 10` 改为 `z.hp === MONSTERS[z.type].hp * 12.25`（新管线 `timeSec=1500` → 分钟 25，hp = 基础 × (1 + 25×0.45) = ×12.25；或直接引用 `calcMonsterStats(MONSTERS[z.type], { tier: 9, timeSec: 1500, mode: 'endless' }).hp`）；其余 budget/cost 语义不变。
- `test/combat.test.js` / `test/teslaball.test.js`：无需改动（`T1 = { hpMult: 1, speedMult: 1 }` 恰等价基础值，新 `createZombie` 忽略多余字段后结果不变）。
- 新增用例（追加到 `test/zombie.test.js`）：

```js
test('createZombie 管线化：默认参数 = 图鉴基础值；冒险关 3 携倍率', () => {
  const z = createZombie('normal', 0, 0);
  assert.equal(z.hp, 30);
  assert.equal(z.maxHp, 30);
  assert.equal(z.damage, 8);
  assert.equal(z.coin, 1);
  const z3 = createZombie('normal', 0, 0, { level: 3, tier: 4, timeSec: 0, mode: 'adventure' });
  assert.ok(Math.abs(z3.hp - 30 * 2.2) < 1e-9);
});

test('自爆僵尸携带缩放后 aoe 与行为标记；普通怪不带', () => {
  const e = createZombie('exploder', 0, 0, { level: 1, tier: 4, timeSec: 0, mode: 'adventure' });
  assert.equal(e.behavior, 'exploder');
  assert.deepEqual(e.aoe, { damage: 30, radius: 80 });
  assert.equal(e.fuseDone, false);
  const n = createZombie('normal', 0, 0);
  assert.equal(n.behavior, null);
  assert.equal(n.aoe, undefined);
});
```

**Step 2: 跑测试确认失败**

Run: `node --test test/zombie.test.js test/spawner.test.js test/combat.test.js test/teslaball.test.js`
Expected: FAIL（createZombie 仍读 hpMult）

**Step 3: 实现**

`src/entities/zombie.js`（createZombie 替换，updateZombie/damageZombie 不动）：

```js
import { MONSTERS } from '../config/bestiary/monsters.js';
import { calcMonsterStats } from '../systems/scaling.js';
import { slideCircleObstacles } from '../core/physics.js';

// 数值统一走 scaling 管线（设计 §2.1）：
// opts = { level = 冒险关卡序号(无尽/坚守恒 1), tier = 当前档位(coin 递增用), timeSec, mode }
export function createZombie(typeId, x, y, opts = {}) {
  const c = MONSTERS[typeId];
  const s = calcMonsterStats(c, opts);
  return {
    type: typeId, x, y, r: c.radius,
    hp: s.hp, maxHp: s.hp,
    speed: s.speed, damage: s.damage, coin: s.coin,
    knockbackResist: c.knockbackResist,
    behavior: c.behavior || null,
    aoe: c.aoe ? { damage: s.aoeDamage, radius: c.aoe.radius } : undefined, // 缩放后 AoE
    fuseDone: false, // 行为状态位（exploder：引信燃尽标记，behaviors.js 读写）
    counted: false,  // killZombie 防重（战斗击杀即时结算，行为自杀在清理循环补结算）
    kbx: 0, kby: 0, hitFlash: 0, alive: true,
  };
}
```

`src/systems/spawner.js`：
- `import { ZOMBIES } from '../config/zombies.js'` → `import { MONSTERS } from '../config/bestiary/monsters.js'`；两处 `ZOMBIES[type].cost` → `MONSTERS[type].cost`。
- `updateSpawner` 签名末尾追加 `scalingCtx = {}`，两处 `createZombie(..., cfg)` → `createZombie(pickWeighted(rng, cfg.weights), x, y, { ...scalingCtx, tier: cfg.tier, timeSec: time })`（包围潮处同样替换，注意该处原来是 `createZombie(pickWeighted(rng, cfg.weights), x, y, cfg)`）。

`src/systems/combat.js`：`import { MAX_ZOMBIE_R } from '../config/zombies.js'` → `import { MAX_ZOMBIE_R } from '../config/bestiary/monsters.js'`。

`src/game.js`：
- `import { ZOMBIES } from './config/zombies.js'` → `import { MONSTERS } from './config/bestiary/monsters.js'`；第 570 行 `const c = ZOMBIES[z.type]` → `MONSTERS[z.type]`，第 571 行 `ctx.fillStyle = c.color` → `ctx.fillStyle = c.visual.color`（Task 3 已把 color 并入 visual；只改引用源不改这行会造成任务 5→13 期间僵尸着色静默错误。该渲染块无其它 `.color` 残留——闪白用 `#fff`、血条用 `#a33/#5eff8a` 均为字面量，无需改）。
- 文件顶部 import 区追加 `import { recordKill } from './core/meta.js';`。
- `createGameScene(deps)` 解构改为 `const { canvas, input, mode = 'endless', audio, settings, meta = null, onGameOver } = deps;`。
- 新增 scalingCtx（任务 10 冒险会改 level；本任务先写死旧模式口径）：

```js
const scalingCtx = { mode, level: 1 }; // 冒险模式在任务 10 改为关卡序号
```

- `updateSpawner(spawner, scene.time, camera, MAP_SIZE, scene.zombies, aliveCount, rng, dt, budgetMult, cfgFn)` → 末尾追加 `, scalingCtx`。
- Boss 注入处 `createZombie('boss', p.x, p.y, cfgFn(scene.time))` → `createZombie('boss', p.x, p.y, { ...scalingCtx, tier: cfgFn(scene.time).tier, timeSec: scene.time })`（special 不缩放，行为不变）。
- `devSpawnZombie` 内 `createZombie(type, player.x + 200, player.y, cfg)` → 同上形式；名称映射改为 `MONSTERS[type].name`（删除硬编码表），floater 文案 `'已放置 ' + MONSTERS[type].name`。
- `killZombie` 改为（计图鉴 + counted 防重）：

```js
function killZombie(z) {
  if (z.counted) return;
  z.counted = true;
  scene.kills++;
  scene.coinsOnGround.push(createCoin(z.x, z.y, z.coin));
  if (meta) recordKill(meta, z.type); // 图鉴击杀统计：全模式计数（设计 §10）
  for (const d of ITEM_DROP_TABLE) {
    if (rng() < d.chance) { addItem(scene.inventory, d.id, 1); break; }
  }
  if (scene.particles.length < MAX_PARTICLES)
    spawnParticles(scene.particles, z.x, z.y, '#5eff8a', 12, rng);
}
```

- 死僵尸 swap-remove 循环前补一行行为自杀结算（任务 6 的 exploder 引信燃尽置 alive=false，这里统一补 killZombie）：

```js
// 死僵尸 swap-remove（行为自杀的在此补 killZombie 结算掉落/计数/AoE）
for (let i = scene.zombies.length - 1; i >= 0; i--) {
  if (!scene.zombies[i].alive) {
    if (!scene.zombies[i].counted) killZombie(scene.zombies[i]);
    scene.zombies[i] = scene.zombies[scene.zombies.length - 1];
    scene.zombies.pop();
    aliveCount--;
  }
}
```

- 删除 `src/config/zombies.js`。

注：`BEHAVIORS`/`behaviorCtx` 在任务 6 才创建。为保持本任务可编译，本任务 killZombie 里的行为分发行可以暂缓到任务 6 再加（二选一：本任务加 import 桩 `const BEHAVIORS = {};` 不推荐——直接本任务不加该行，任务 6 加）。**裁定：本任务 killZombie 只加 counted/recordKill，行为分发与 behaviorCtx 归任务 6。**

**Step 4: 跑测试确认通过**

Run: `node --test test/zombie.test.js test/spawner.test.js test/combat.test.js test/teslaball.test.js test/bestiary.test.js`
Expected: PASS

**Step 5: 全量回归 + 提交**

Run: `npm test`
```bash
git add -A
git commit -m "任务5: createZombie 接入 scaling 管线，全部调用点改道图鉴，删除 config/zombies.js"
```

---

### Task 6: `systems/behaviors.js` 行为注册表 + 自爆接入【模型：flash】

**Files:**
- Create: `src/systems/behaviors.js`
- Modify: `src/config/bestiary/monsters.js`（追加 `EXPLODER_FUSE_TIME` / `EXPLODER_TRIGGER_R` 常量导出）
- Modify: `src/game.js`（behaviorCtx + onUpdate/onDeath 分发）
- Test: `test/behaviors.test.js`

设计 §4.2/§4.3。引信规则（用户裁定）：**只有引信燃尽才爆**；引信中/未触发被击杀 = 普通死亡。任何死亡（含自爆）都掉银币、计入图鉴击杀统计。

**Step 1: 写失败测试** `test/behaviors.test.js`

```js
// test/behaviors.test.js —— 行为注册表：exploder 引信与自爆 AoE（设计 §4.2/§4.3）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEHAVIORS } from '../src/systems/behaviors.js';
import { EXPLODER_FUSE_TIME } from '../src/config/bestiary/monsters.js';
import { createZombie } from '../src/entities/zombie.js';

function mockCtx(z, opts = {}) {
  return {
    player: { x: opts.px ?? 0, y: 0, r: 16 },
    deployables: opts.deployables ?? [],
    damagePlayer: opts.damagePlayer ?? (() => {}),
    spawnRing: opts.spawnRing ?? (() => {}),
    rng: () => 0.5,
  };
}

test('远离目标不触发引信；接近玩家触发引信计时', () => {
  const z = createZombie('exploder', 1000, 0);
  BEHAVIORS.exploder.onUpdate(z, 0.016, mockCtx(z));
  assert.equal(z.fuse, undefined);
  const z2 = createZombie('exploder', 40, 0); // 距玩家 40 ≤ 50+r
  BEHAVIORS.exploder.onUpdate(z2, 0.016, mockCtx(z2));
  assert.equal(z2.fuse, 0);
  BEHAVIORS.exploder.onUpdate(z2, 0.5, mockCtx(z2));
  assert.equal(z2.fuse, 0.5);
  assert.equal(z2.alive, true);
});

test('引信燃尽：置 fuseDone 并死亡（自爆）', () => {
  const z = createZombie('exploder', 40, 0);
  const ctx = mockCtx(z);
  BEHAVIORS.exploder.onUpdate(z, 0.016, ctx);
  BEHAVIORS.exploder.onUpdate(z, EXPLODER_FUSE_TIME, ctx);
  assert.equal(z.fuseDone, true);
  assert.equal(z.alive, false);
});

test('部署物在 250px 内优先：玩家更近也按部署物距离判定（与僵尸目标 AI 一致）', () => {
  const wall = { x: 120, y: 0, r: 10, hp: 100, alive: true };
  const z = createZombie('exploder', 45, 0); // 距玩家 45（≤触发距离 63），距 wall 75（>63 但 ≤250 搜索范围）
  BEHAVIORS.exploder.onUpdate(z, 0.016, mockCtx(z, { px: 0, deployables: [wall] }));
  assert.equal(z.fuse, undefined); // 目标取部署物（75），超出触发距离 63，不点燃
});

test('引信中被击杀不爆（onDeath 无 fuseDone 直接返回）', () => {
  const z = createZombie('exploder', 40, 0);
  const ctx = mockCtx(z);
  BEHAVIORS.exploder.onUpdate(z, 0.016, ctx); // 开始引信
  let hit = 0;
  const ctx2 = mockCtx(z, { damagePlayer: () => hit++ });
  assert.equal(BEHAVIORS.exploder.onDeath(z, ctx2), false);
  assert.equal(hit, 0);
});

test('自爆 AoE：半径内玩家与部署物受伤，半径外不受', () => {
  const z = createZombie('exploder', 0, 0); // aoe { damage: 30, radius: 80 }
  z.fuseDone = true;
  const near = { x: 50, y: 0, r: 10, hp: 100, alive: true };
  const far = { x: 500, y: 0, r: 10, hp: 100, alive: true };
  let dmg = 0, ring = null;
  const ctx = {
    player: { x: 0, y: 40, r: 16 },
    deployables: [near, far],
    damagePlayer: d => { dmg = d; },
    spawnRing: (x, y, r) => { ring = { x, y, r }; },
    rng: () => 0.5,
  };
  assert.equal(BEHAVIORS.exploder.onDeath(z, ctx), true);
  assert.equal(dmg, 30);
  assert.equal(near.hp, 70);   // 100 - 30
  assert.equal(far.hp, 100);
  assert.deepEqual(ring, { x: 0, y: 0, r: 80 });
});

test('注册表引用有效：图鉴 behavior 字段都能在 BEHAVIORS 找到', async () => {
  const { MONSTERS } = await import('../src/config/bestiary/monsters.js');
  for (const m of Object.values(MONSTERS))
    if (m.behavior) assert.ok(BEHAVIORS[m.behavior], `${m.id}.behavior=${m.behavior} 未注册`);
});
```

**Step 2: 跑测试确认失败**

Run: `node --test test/behaviors.test.js`
Expected: FAIL（`Cannot find module '../src/systems/behaviors.js'`）

**Step 3: 实现** `src/systems/behaviors.js`

先在 `src/config/bestiary/monsters.js` 末尾追加行为常量导出（消除 `entities/render.js` → `systems/behaviors.js` 反向依赖，设计 §4.3）：

```js
// 自爆僵尸行为常量（设计 §4.3，本期新定数值，已确认）。
// 由 behaviors.js 与 render.js 共同 import，避免 entities→systems 反向依赖。
export const EXPLODER_FUSE_TIME = 1.2; // 引信时长
export const EXPLODER_TRIGGER_R = 50;  // 距当前目标触发距离（本期新定数值，已确认）
```

再实现 `src/systems/behaviors.js`：

```js
// src/systems/behaviors.js —— 怪物行为注册表（设计 §4.2）。
// 新增机制怪：1) 此处注册行为模块  2) config/bestiary/monsters.js 条目声明 behavior 字段。
// 钩子签名 (z, dt?, ctx)；ctx = { player, deployables, damagePlayer(dmg), spawnRing(x,y,r), rng }（动作回调型）。
// AoE 数值在 createZombie 时已缓存缩放（与接触 damage 同乘区），此处直接取 z.aoe.damage，不再现算（设计 §4.3）。
// onSpawn/onHit 为预留钩子（本期无消费者，未接线）；behavior: null 全部跳过。
import { EXPLODER_FUSE_TIME, EXPLODER_TRIGGER_R } from '../config/bestiary/monsters.js';

const EXPLODER_TARGET_RANGE = 250; // 目标搜索半径：与现行僵尸 AI EDIBLE_RANGE 一致（部署物优先）

export const BEHAVIORS = {
  exploder: {
    // 接近目标开始引信；引信燃尽置 fuseDone 并死亡（自爆，由 game.js 清理循环走 killZombie 结算）。
    // 目标判定与现行僵尸 AI 一致（设计 §4.3）：250px 内最近存活部署物优先，否则玩家。
    onUpdate(z, dt, ctx) {
      if (z.fuseDone) return;
      if (z.fuse === undefined) {
        let d = Infinity;
        for (const e of ctx.deployables) {
          if (!e.alive) continue;
          const de = Math.hypot(e.x - z.x, e.y - z.y);
          if (de < d) d = de;
        }
        if (!(d <= EXPLODER_TARGET_RANGE)) d = Math.hypot(ctx.player.x - z.x, ctx.player.y - z.y);
        if (d <= EXPLODER_TRIGGER_R + z.r) z.fuse = 0;
        return;
      }
      z.fuse += dt;
      if (z.fuse >= EXPLODER_FUSE_TIME) {
        z.fuseDone = true;
        z.alive = false;
      }
    },
    // 仅引信燃尽的自爆才结算 AoE（用户裁定：引信中被击杀不爆）；对玩家与部署物生效
    onDeath(z, ctx) {
      if (!z.fuseDone || !z.aoe) return false;
      const r = z.aoe.radius;
      ctx.spawnRing(z.x, z.y, r);
      if (Math.hypot(ctx.player.x - z.x, ctx.player.y - z.y) <= r + ctx.player.r)
        ctx.damagePlayer(z.aoe.damage);
      for (const e of ctx.deployables) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - z.x, e.y - z.y) <= r + e.r) {
          e.hp -= z.aoe.damage;
          if (e.hp <= 0) e.alive = false;
        }
      }
      return true;
    },
  },
};
```

`src/game.js` 接入：
- 顶部 import 追加 `import { BEHAVIORS } from './systems/behaviors.js';`
- 新增 behaviorCtx 工厂（放在 killZombie 前）：

```js
// 行为钩子上下文（设计 §4.2）：AoE 数值已在 createZombie 时经管线缩放，此处只提供结算通道
function behaviorCtx() {
  return {
    player,
    deployables: [...scene.turrets, ...scene.walls],
    damagePlayer: dmg => {
      if (damagePlayer(player, dmg)) {
        shake(6);
        sound('hurt');
        if (player.hp <= 0) gameOver({ cleared: false });
      }
    },
    spawnRing: (x, y, r) => fxExplosion(x, y, r),
    rng,
  };
}
```

- `killZombie` 末尾（粒子之后）追加行为分发：

```js
if (z.behavior) BEHAVIORS[z.behavior]?.onDeath?.(z, behaviorCtx());
```

- 僵尸更新循环改为（移动后调 onUpdate）：

```js
for (const z of scene.zombies) {
  if (!z.alive) continue;
  updateZombie(z, player, map.obstacles, dt, edibles);
  if (z.behavior) BEHAVIORS[z.behavior]?.onUpdate?.(z, dt, behaviorCtx());
}
```

注：每帧每怪构造 behaviorCtx 有一次数组展开分配，与 §9.3 "禁止每帧对象分配" 的张力在任务 14 性能红线统一处理（本期怪数 ≤400，展开分配可接受；若压测不达标再优化为复用数组——届时先回报再改）。

**Step 4: 跑测试确认通过**

Run: `node --test test/behaviors.test.js test/zombie.test.js`
Expected: PASS

**Step 5: 全量回归 + 提交**

Run: `npm test`
```bash
git add src/systems/behaviors.js src/config/bestiary/monsters.js src/game.js test/behaviors.test.js
git commit -m "任务6: 新增 behaviors.js 行为注册表，自爆僵尸引信/AoE 接入游戏主循环"
```

---

### Task 7: `config/bestiary/weapons.js` 武器图鉴 + `economy.js` 改道【模型：flash】

**Files:**
- Create: `src/config/bestiary/weapons.js`
- Modify: `src/config/economy.js`（删 WEAPON_BASE_PRICE 转导出、导出 round5、新增 weaponUpgradePrice）
- Modify: `src/systems/shop.js`（枚举源改图鉴）
- Modify: `src/ui/shop.js`、`src/systems/hud.js`、`src/entities/weapon.js`（import 改道）
- Delete: `src/config/weapons.js`
- Modify: `test/weapon.test.js`、`test/economy.test.js`、`test/config.test.js`、`test/bestiary.test.js`（追加武器契约）

设计 §5。现有 6 种字段原样迁移 + `desc`/`basePrice`/`visual`；新武器 `sniperRifle`（id 不用 `sniper`，与辅助武器 `AUX_PRICES.sniper` 避撞）。

**Step 1: 改写/追加测试（先红）**

`test/bestiary.test.js` 追加：

```js
// —— 武器图鉴（设计 §5）——
// 注意：以下两个 import 合并到文件顶部既有 import 区（与怪物部分的 import 同处），不要在文件中部重复声明。
import { WEAPONS, SPECIAL_STATS } from '../src/config/bestiary/weapons.js';
import { weaponUpgradePrice } from '../src/config/economy.js';

test('武器清单 7 条（6 迁移 + sniperRifle），必填字段契约齐全', () => {
  const ids = ['pistol', 'rifle', 'mg', 'rocket', 'grenade', 'tesla', 'sniperRifle'];
  assert.deepEqual(Object.keys(WEAPONS).sort(), [...ids].sort());
  for (const w of Object.values(WEAPONS)) {
    for (const f of ['id', 'name', 'desc', 'damage', 'fireRate', 'projectileSpeed', 'range',
      'projectiles', 'spread', 'pierce', 'aoe', 'arc', 'chain', 'knockback',
      'burst', 'burstInterval', 'basePrice', 'visual'])
      assert.ok(f in w, `${w.id} 缺必填字段 ${f}`);
    for (const f of ['bulletShape', 'color', 'trail', 'hitParticles', 'muzzleGlow'])
      assert.ok(f in w.visual, `${w.id}.visual 缺 ${f}`);
  }
  // 迁移数值抽检 + 基价并入
  assert.equal(WEAPONS.pistol.damage, 12);
  assert.equal(WEAPONS.grenade.arc, true);
  assert.equal(WEAPONS.tesla.chain, 3);
  assert.equal(WEAPONS.pistol.basePrice, 40);
  assert.equal(WEAPONS.tesla.basePrice, 250);
  // 新武器：狙击枪（纯数值验证零代码新增）
  const s = WEAPONS.sniperRifle;
  assert.equal(s.damage, 60);
  assert.equal(s.pierce, 5);
  assert.equal(s.knockback, 200);
  assert.equal(s.basePrice, 200);
  // 专属维随图鉴迁入
  assert.deepEqual(SPECIAL_STATS, {
    grenade: ['fragCount', 'fragDamage'],
    tesla: ['chainLen', 'chainDmg'],
  });
});

test('武器局外升级价：round5(40×1.5^lv)，0→10 累计 4540', () => {
  assert.equal(weaponUpgradePrice(0), 40);
  assert.equal(weaponUpgradePrice(1), 60);
  assert.equal(weaponUpgradePrice(4), 205);
  assert.equal(weaponUpgradePrice(9), 1540);
  let sum = 0;
  for (let lv = 0; lv < 10; lv++) sum += weaponUpgradePrice(lv);
  assert.equal(sum, 4540);
});
```

`test/weapon.test.js`：
- 顶部 `import { WEAPONS, WEAPON_MAX_LEVEL, STAT_MAX, WEAPON_BASE_PRICE, STAT_LABEL, SPECIAL_STATS } from '../src/config/weapons.js'` → 从 `'../src/config/bestiary/weapons.js'` import `WEAPONS, WEAPON_MAX_LEVEL, STAT_MAX, STAT_LABEL, SPECIAL_STATS`（删除 WEAPON_BASE_PRICE）。
- `六武器表` 用例改名为 `七武器表`：`ids` 数组加 `'sniperRifle'`，`expect` 表加 `sniperRifle: { damage: 60, fireRate: 0.5, projectileSpeed: 1200, range: 600, aoe: 0, arc: false, chain: 0 }`。
- `STAT_MAX / WEAPON_BASE_PRICE / 既有常量` 用例改名为 `STAT_MAX / 既有常量`：删除 WEAPON_BASE_PRICE 断言（改由 bestiary.test.js 的 basePrice 断言覆盖）。

`test/shop.test.js`：
- 第 9 行从 `economy.js` import 的 `WEAPON_BASE_PRICE` 删除（第 7–10 行其余导出保留）；第 11 行 `import { STAT_MAX, ENHANCE_STATS } from '../src/config/weapons.js'` → `import { WEAPONS, STAT_MAX, ENHANCE_STATS } from '../src/config/bestiary/weapons.js'`。
- 第 52–55 行断言：5 把武器清单 `['grenade', 'mg', 'rifle', 'rocket', 'tesla']` 加 `'sniperRifle'`（6 项，sort 后注意顺序），价格断言 `WEAPON_BASE_PRICE[e.weapon]` → `WEAPONS[e.weapon].basePrice`。

`test/economy.test.js`：删除 import 与断言里的 `WEAPON_BASE_PRICE`（转导出已移除）；其余不动。

`test/config.test.js`：顶部武器 import 改为 `'../src/config/bestiary/weapons.js'`（任务 4 若保留了该 import，此处改道即可）；`武器字段完整` 用例已在 bestiary.test.js 覆盖（本任务上方追加块），**删除该用例**。

**Step 2: 跑测试确认失败**

Run: `node --test test/bestiary.test.js test/weapon.test.js test/economy.test.js`
Expected: FAIL（`config/bestiary/weapons.js`、`weaponUpgradePrice` 不存在）

**Step 3: 实现**

`src/config/bestiary/weapons.js`：

```js
// src/config/bestiary/weapons.js —— 武器图鉴（设计 §5）。替代 config/weapons.js。
// 新增武器：纯数值 → 加一条数据即可在商店/图鉴出现；
//           带专属维 → 另需在 entities/weapon.js 的 weaponStats()/fire() 加分支（SPECIAL_STATS 只控商店展示）。
// 必填字段契约：id/name/desc/damage/fireRate/projectileSpeed/range/projectiles/spread/pierce/
//              aoe/arc/chain/knockback/burst/burstInterval/basePrice/visual（bestiary.test.js 校验）。
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: '手枪', desc: '可靠的随身武器，均衡而稳定。',
    damage: 12, fireRate: 2.0, projectileSpeed: 500, range: 300,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 0,
    knockback: 120, burst: 1, burstInterval: 0, basePrice: 40,
    visual: { bulletShape: 'dot', color: '#ffe066', trail: 0.3, hitParticles: 6, muzzleGlow: 0.4 },
  },
  rifle: {
    id: 'rifle', name: '步枪', desc: '三连发点射，中距离压制利器。',
    damage: 9, fireRate: 1.4, projectileSpeed: 600, range: 320,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 0,
    knockback: 100, burst: 3, burstInterval: 0.08, basePrice: 80,
    visual: { bulletShape: 'bar', color: '#ffd75e', trail: 0.4, hitParticles: 6, muzzleGlow: 0.5 },
  },
  mg: {
    id: 'mg', name: '机枪', desc: '泼洒弹雨压制尸潮，单发威力有限。',
    damage: 5, fireRate: 8, projectileSpeed: 550, range: 280,
    projectiles: 1, spread: 6, pierce: 0, aoe: 0, arc: false, chain: 0,
    knockback: 60, burst: 1, burstInterval: 0, basePrice: 80,
    visual: { bulletShape: 'dot', color: '#ffb04d', trail: 0.25, hitParticles: 4, muzzleGlow: 0.3 },
  },
  rocket: {
    id: 'rocket', name: '火箭炮', desc: '爆炸覆盖一片区域，稳扎稳打的重火力。',
    damage: 30, fireRate: 0.7, projectileSpeed: 350, range: 350,
    projectiles: 1, spread: 0, pierce: 0, aoe: 90, arc: false, chain: 0,
    knockback: 0, burst: 1, burstInterval: 0, basePrice: 150,
    visual: { bulletShape: 'polygon', color: '#f80', trail: 0.8, hitParticles: 16, muzzleGlow: 0.9 },
  },
  grenade: {
    id: 'grenade', name: '榴弹炮', desc: '抛射榴弹越过障碍，落地后二次爆炸碎片四射。',
    damage: 25, fireRate: 0.6, projectileSpeed: 420, range: 330,
    projectiles: 1, spread: 0, pierce: 0, aoe: 130, arc: true, chain: 0,
    knockback: 0, burst: 1, burstInterval: 0, basePrice: 200,
    visual: { bulletShape: 'polygon', color: '#e06a4d', trail: 0.8, hitParticles: 16, muzzleGlow: 0.9 },
  },
  tesla: {
    id: 'tesla', name: '磁电枪', desc: '链状电弧在敌群间跳跃传导。',
    damage: 14, fireRate: 1.2, projectileSpeed: 800, range: 260,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, arc: false, chain: 3,
    knockback: 0, burst: 1, burstInterval: 0, basePrice: 250,
    visual: { bulletShape: 'arc', color: '#5ef', trail: 0.5, hitParticles: 8, muzzleGlow: 0.7 },
  },
  sniperRifle: {
    id: 'sniperRifle', name: '狙击枪', desc: '超视距一击贯穿，光针所至尸骸洞穿。',
    damage: 60, fireRate: 0.5, projectileSpeed: 1200, range: 600,
    projectiles: 1, spread: 0, pierce: 5, aoe: 0, arc: false, chain: 0,
    knockback: 200, burst: 1, burstInterval: 0, basePrice: 200,
    visual: { bulletShape: 'needle', color: '#aef', trail: 0.9, hitParticles: 8, muzzleGlow: 0.8 },
  },
};

export const STAT_MAX = 8; // 每维（damage/fireRate/projectiles/range）独立可购上限
export const WEAPON_MAX_LEVEL = 8; // 兼容既有引用（数值同 STAT_MAX）；仅局内强化上限，局外金币等级上限见 core/meta.js 的 MAX_WEAPON_LEVEL(=10)
export const ENHANCE_STATS = ['damage', 'fireRate', 'projectiles', 'range'];
export const STAT_LABEL = {
  damage: '伤害 +25%', fireRate: '攻速 +20%', projectiles: '弹道 +1', range: '攻击范围 +20%',
  fragCount: '榴弹碎片 +2', fragDamage: '二次伤害 +15%', chainLen: '链路长度 +1', chainDmg: '二次伤害 +5%',
};
// 专属强化维（仅对应武器展示，不进通用四维；商店按武器 id 追加）
export const SPECIAL_STATS = {
  grenade: ['fragCount', 'fragDamage'],
  tesla: ['chainLen', 'chainDmg'],
};
```

`src/config/economy.js`：
- 删除第 2–3 行 `import { WEAPON_BASE_PRICE } ...` / `export { WEAPON_BASE_PRICE }`。
- `function round5` 改为 `export function round5`（金币升级价与冒险奖励复用，设计 §6.1/§3.4）。
- 文件末尾追加：

```js
// 武器局外升级价（金币）：round5(40 × 1.5^当前等级)，0→10 级累计 4540（设计 §6.2）
export function weaponUpgradePrice(curLevel) {
  return round5(40 * Math.pow(1.5, curLevel));
}
```

`src/systems/shop.js`：
- 第 3 行 `import { ENHANCE_STATS, STAT_MAX, SPECIAL_STATS } from '../config/weapons.js'` → `import { WEAPONS, ENHANCE_STATS, STAT_MAX, SPECIAL_STATS } from '../config/bestiary/weapons.js'`（加 `WEAPONS`，路径改道）。
- import 行改：从 `'../config/economy.js'` 的解构里删 `WEAPON_BASE_PRICE`。
- "更换武器"循环改为：

```js
// 更换武器：全部非当前武器（含手枪可回购），基价取图鉴 basePrice，随**全局换枪次数**递增
const weapons = [];
for (const id of Object.keys(WEAPONS)) {
  if (id === w.id) continue;
  weapons.push({ kind: 'weapon', weapon: id, price: weaponPrice(WEAPONS[id].basePrice, game.weaponBought ?? 0), refund: w.spent ?? 0 });
}
```

`src/ui/shop.js` 第 4 行、`src/systems/hud.js` 第 3 行、`src/entities/weapon.js` 第 2 行：import 路径 `'../config/weapons.js'` → `'../config/bestiary/weapons.js'`（weapon.js 只需 `WEAPONS, STAT_MAX`）。

删除 `src/config/weapons.js`。

**Step 4: 跑测试确认通过**

Run: `node --test test/bestiary.test.js test/weapon.test.js test/economy.test.js test/config.test.js test/shop.test.js test/shop-ui.test.js`
Expected: PASS

**Step 5: 全量回归 + 提交**

Run: `npm test`
```bash
git add -A
git commit -m "任务7: 武器图鉴落地（7 条含 sniperRifle），economy 改道 basePrice，删除 config/weapons.js"
```

---

### Task 8: `entities/weapon.js` 伤害双乘区（线性局内 + 局外等级）【模型：flash】

**Files:**
- Modify: `src/entities/weapon.js`（weaponStats 接 scaling.weaponDamage；createWeapon 带局外等级）
- Modify: `src/systems/shop.js`（换枪时按 meta 等级创建新武器）
- Modify: `src/game.js`（初始武器带局外等级）
- Modify: `test/weapon.test.js`（伤害断言 1.25^n → 1+0.25n；双乘区新用例并入本文件——价格曲线在 bestiary.test.js、`weaponDamage` 纯函数在 scaling.test.js，不新建 upgrades.test.js，设计 §11.1）

设计 §2.2（用户裁定：线性 `1+0.25n` 取代复利 `1.25^n`）。局外等级存武器实例上（`w.outLevel`），`weaponStats(w)` 签名不变，避免改动 tesla/电磁球等既有调用。本次线性化只改主武器 `weaponStats`；`turret.js`/`companions.js` 的 `1.25^n` 按设计 §13 保持不变，不要顺手改。

**Step 1: 写失败测试**（并入 `test/weapon.test.js`）

```js
// 并入 test/weapon.test.js —— 双乘区：局外等级 × 局内线性 1+0.25n（设计 §2.2/§6.2）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeapon, weaponStats, applyEnhancement } from '../src/entities/weapon.js';
import { weaponDamage } from '../src/systems/scaling.js';

test('createWeapon 携带局外等级；默认 0', () => {
  assert.equal(createWeapon('pistol').outLevel, 0);
  assert.equal(createWeapon('pistol', 5).outLevel, 5);
});

test('局内伤害改为线性 1+0.25n（取代旧复利 1.25^n）', () => {
  const w = createWeapon('pistol'); // base 12
  applyEnhancement(w, 'damage');
  assert.equal(weaponStats(w).damage, 12 * 1.25);
  for (let i = 0; i < 7; i++) applyEnhancement(w, 'damage'); // 满 8 维
  assert.equal(weaponStats(w).damage, 12 * (1 + 0.25 * 8)); // ×3.0，而非 1.25^8≈5.96
});

test('双乘区叠乘：局外等级 × 局内购买', () => {
  const w = createWeapon('pistol', 10); // 局外满级 ×3
  assert.equal(weaponStats(w).damage, 12 * 3);
  for (let i = 0; i < 8; i++) applyEnhancement(w, 'damage');
  assert.equal(weaponStats(w).damage, 12 * 3 * 3);
  // 与管线函数一致
  assert.equal(weaponStats(w).damage, weaponDamage(12, 10, 8));
});

test('局外等级不影响攻速/弹道/范围/专属维', () => {
  const w = createWeapon('pistol', 10);
  assert.equal(weaponStats(w).fireRate, 2.0);
  assert.equal(weaponStats(w).range, 300);
});
```

`test/weapon.test.js` 改写两处伤害断言：
- `applyEnhancement 后 weaponStats 数值正确` 用例：`s.damage` 断言 `12 * 1.25` 不变（1 次购买两种公式相同），无需改。
- `单维达 STAT_MAX 后 applyEnhancement 忽略` 用例：`12 * Math.pow(1.25, STAT_MAX)` 两处 → `12 * (1 + 0.25 * STAT_MAX)`。

**Step 2: 跑测试确认失败**

Run: `node --test test/weapon.test.js`
Expected: FAIL（outLevel 不存在；满维伤害断言不符）

**Step 3: 实现** `src/entities/weapon.js`

```js
// 顶部 import 追加
import { weaponDamage } from '../systems/scaling.js';

export function createWeapon(id, outLevel = 0) {
  return {
    id,
    outLevel, // 局外等级（金币升级，设计 §6.2）：换枪时按 meta 等级重建（shop.js）
    spent: 0,
    enhance: { damage: 0, fireRate: 0, projectiles: 0, range: 0,
      fragCount: 0, fragDamage: 0, chainLen: 0, chainDmg: 0 },
    cooldown: 0, burstLeft: 0, burstTimer: 0, aimAngle: 0,
  };
}

// weaponStats 内 damage 行改为：
//   damage: weaponDamage(c.damage, w.outLevel, e.damage),  // 双乘区（设计 §2.2，线性取代旧复利）
```

`src/systems/shop.js` 换枪分支（`entry.kind === 'weapon'`）中 `createWeapon(entry.weapon)` → `createWeapon(entry.weapon, game.metaLevels?.[entry.weapon] ?? 0)`。

`src/game.js`：
- scene 初始化 `weapon: createWeapon('pistol')` → `weapon: createWeapon('pistol', meta ? (meta.weaponLevels.pistol ?? 0) : 0)`。
- scene 对象追加 `metaLevels: meta ? meta.weaponLevels : {}`（shop.js 换枪时读）。

**Step 4: 跑测试确认通过**

Run: `node --test test/weapon.test.js test/shop.test.js`
Expected: PASS

**Step 5: 全量回归 + 提交**

Run: `npm test`
```bash
git add src/entities/weapon.js src/systems/shop.js src/game.js test/weapon.test.js
git commit -m "任务8: 武器伤害双乘区（局外等级×局内线性 1+0.25n，取代复利）"
```

---

### Task 9: `config/adventure.js` 冒险关卡表【模型：flash】

**Files:**
- Create: `src/config/adventure.js`
- Test: `test/adventure.test.js`

设计 §3.2/§3.4。纯逻辑，无 DOM 依赖。

**Step 1: 写失败测试** `test/adventure.test.js`

```js
// test/adventure.test.js —— 冒险关卡表与金币奖励（设计 §3.2/§3.4）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVENTURE_LEVELS, ADVENTURE_TIER_DURATION, ADVENTURE_DURATION,
  adventureLevelById, adventureLevelIndex, makeAdventureCfg,
  clearGoldReward, failGoldReward,
} from '../src/config/adventure.js';
import { MONSTERS } from '../src/config/bestiary/monsters.js';

test('三关结构：每关 4 档 × 90s，weights 引用合法怪物 id', () => {
  assert.equal(ADVENTURE_LEVELS.length, 3);
  assert.equal(ADVENTURE_TIER_DURATION, 90);
  assert.equal(ADVENTURE_DURATION, 360);
  for (const lv of ADVENTURE_LEVELS) {
    assert.equal(lv.tiers.length, 4, lv.id);
    for (const t of lv.tiers) {
      assert.equal(t.duration, 90);
      assert.ok(t.budgetPerSec > 0);
      for (const id of Object.keys(t.weights)) assert.ok(MONSTERS[id], `${lv.id} 引用未知怪物 ${id}`);
    }
  }
  // 自爆仅出现在关 3 档 4（设计 §4.3）
  assert.ok(ADVENTURE_LEVELS[2].tiers[3].weights.exploder > 0);
  for (const lv of ADVENTURE_LEVELS.slice(0, 2))
    for (const t of lv.tiers) assert.ok(!('exploder' in t.weights));
});

test('关卡查找与 1 起序号', () => {
  assert.equal(adventureLevelById('l1').name, '城郊');
  assert.equal(adventureLevelById('bogus'), null);
  assert.equal(adventureLevelIndex('l1'), 1);
  assert.equal(adventureLevelIndex('l3'), 3);
});

test('makeAdventureCfg：90s 分段、封顶第 4 档', () => {
  const cfg = makeAdventureCfg(ADVENTURE_LEVELS[0]);
  assert.equal(cfg(0).tier, 1);
  assert.equal(cfg(89.9).tier, 1);
  assert.equal(cfg(90).tier, 2);
  assert.equal(cfg(270).tier, 4);
  assert.equal(cfg(359.9).tier, 4);
  assert.equal(cfg(0).budgetPerSec, 3);
  assert.equal(cfg(90).weights.fast, 0.3);
});

test('通关金币：首通 ×2，非首通原价', () => {
  const l1 = ADVENTURE_LEVELS[0];
  assert.equal(clearGoldReward(l1, true), 200);
  assert.equal(clearGoldReward(l1, false), 100);
  assert.equal(clearGoldReward(ADVENTURE_LEVELS[2], true), 480);
});

test('失败保底：round5(goldReward × 存活/360 × 50%)', () => {
  const l1 = ADVENTURE_LEVELS[0];
  assert.equal(failGoldReward(l1, 0), 0);
  assert.equal(failGoldReward(l1, 180), 25);  // 100×0.5×0.5
  assert.equal(failGoldReward(l1, 359), 50);  // 49.86 → 50
  assert.equal(failGoldReward(l1, 36), 5);    // 5
  for (const lv of ADVENTURE_LEVELS)
    for (const s of [0, 37, 90, 200, 359]) assert.equal(failGoldReward(lv, s) % 5, 0);
});
```

**Step 2: 跑测试确认失败**

Run: `node --test test/adventure.test.js`
Expected: FAIL（`Cannot find module '../src/config/adventure.js'`）

**Step 3: 实现** `src/config/adventure.js`

```js
// src/config/adventure.js —— 冒险关卡表（设计 §3.2）。纯逻辑，无 DOM 依赖。
// 每关 4 档 × 90s = 360s，纯时间推进撑满即通关；档位结构不含 unlocks（死字段已退役，
// 怪物出现门控 = weights，设计 §2.1）。
import { round5 } from './economy.js';

export const ADVENTURE_TIER_DURATION = 90;
export const ADVENTURE_DURATION = 360; // 4 档 × 90s

export const ADVENTURE_LEVELS = [
  {
    id: 'l1', name: '城郊', goldReward: 100,
    tiers: [
      { duration: 90, budgetPerSec: 3, weights: { normal: 1 } },
      { duration: 90, budgetPerSec: 4.5, weights: { normal: 0.7, fast: 0.3 } },
      { duration: 90, budgetPerSec: 7, weights: { normal: 0.6, fast: 0.4 } },
      { duration: 90, budgetPerSec: 9, weights: { normal: 0.5, fast: 0.3, tank: 0.2 } },
    ],
  },
  {
    id: 'l2', name: '市区', goldReward: 160,
    tiers: [
      { duration: 90, budgetPerSec: 4, weights: { normal: 0.8, fast: 0.2 } },
      { duration: 90, budgetPerSec: 6, weights: { normal: 0.6, fast: 0.4 } },
      { duration: 90, budgetPerSec: 8.5, weights: { normal: 0.5, fast: 0.3, tank: 0.2 } },
      { duration: 90, budgetPerSec: 11, weights: { normal: 0.4, fast: 0.35, tank: 0.25 } },
    ],
  },
  {
    id: 'l3', name: '巢穴', goldReward: 240,
    tiers: [
      { duration: 90, budgetPerSec: 5, weights: { normal: 0.7, fast: 0.3 } },
      { duration: 90, budgetPerSec: 7.5, weights: { normal: 0.5, fast: 0.35, tank: 0.15 } },
      { duration: 90, budgetPerSec: 10, weights: { normal: 0.4, fast: 0.35, tank: 0.25 } },
      { duration: 90, budgetPerSec: 13, weights: { normal: 0.3, fast: 0.3, tank: 0.25, exploder: 0.15 } },
    ],
  },
];

export function adventureLevelById(id) {
  return ADVENTURE_LEVELS.find(l => l.id === id) || null;
}

// 1 起序号（关卡倍率/解锁进度用，设计 §2.1/§3.1）
export function adventureLevelIndex(id) {
  const i = ADVENTURE_LEVELS.findIndex(l => l.id === id);
  return i < 0 ? 1 : i + 1;
}

// 冒险刷怪配置（spawner 的 cfgFn）：tier 1–4 按 90s 分段，封顶第 4 档
export function makeAdventureCfg(level) {
  return timeSec => {
    const t = Math.min(level.tiers.length, Math.floor(timeSec / ADVENTURE_TIER_DURATION) + 1);
    return { tier: t, ...level.tiers[t - 1] };
  };
}

// 通关金币：首通 ×2（设计 §3.4）
export function clearGoldReward(level, isFirstClear) {
  return level.goldReward * (isFirstClear ? 2 : 1);
}

// 失败保底（死亡与主动退出都算）：round5(goldReward × 存活比例 × 50%)
export function failGoldReward(level, survivedSec) {
  return round5(level.goldReward * (survivedSec / ADVENTURE_DURATION) * 0.5);
}
```

**Step 4: 跑测试确认通过**

Run: `node --test test/adventure.test.js`
Expected: PASS（6 个用例）

**Step 5: 全量回归 + 提交**

Run: `npm test`
```bash
git add src/config/adventure.js test/adventure.test.js
git commit -m "任务9: 新增 config/adventure.js 冒险关卡表（3 关 × 4 档）与金币奖励函数"
```

---

### Task 10: 冒险模式接入 `game.js` / `main.js` / HUD / 结算页【模型：flash】

**Files:**
- Modify: `src/game.js`（冒险分支：cfgFn/duration/通关判定/商店去提前进档/主动退出=失败）
- Modify: `src/systems/shop.js`（catalogFor 加 opts.earlyTier 开关）
- Modify: `src/ui/shop.js`（showShop 透传 opts）
- Modify: `src/systems/hud.js`（冒险四档进度条 + 纯函数 adventureTierProgress）
- Modify: `src/ui/gameover.js`（冒险版式：金币区 + 三按钮；handlers 改对象签名）
- Modify: `src/main.js`（meta 启动加载、冒险结算写 meta、暂停退出分流）
- Modify: `test/hud.test.js`、`test/shop.test.js`、`test/spawner.test.js`

设计 §3.1/§3.4/§8。

**Step 1: 改写/追加测试（先红）**

`test/hud.test.js` 追加：

```js
import { adventureTierProgress } from '../src/systems/hud.js';

test('冒险四档进度：90s 一档，档内 0→1，封顶第 4 档', () => {
  assert.deepEqual(adventureTierProgress(0), { tier: 1, progress: 0 });
  assert.equal(adventureTierProgress(45).progress, 0.5);
  assert.deepEqual(adventureTierProgress(90), { tier: 2, progress: 0 });
  assert.equal(adventureTierProgress(359).tier, 4);
  assert.deepEqual(adventureTierProgress(360), { tier: 4, progress: 1 });
  assert.deepEqual(adventureTierProgress(999), { tier: 4, progress: 1 }); // 封顶
});
```

`test/shop.test.js` 追加：

```js
test('冒险模式目录无“风险”组（提前进档会破坏 360s 结构，设计 §3.1）', () => {
  const game = { /* 复用本文件既有 game 工厂/字段 */ };
  const groups = catalogFor(game, 120, { earlyTier: false });
  assert.ok(!groups.some(g => g.group === '风险'));
  const withRisk = catalogFor(game, 120);
  assert.ok(withRisk.some(g => g.group === '风险')); // 默认保留（无尽/坚守）
});
```

（按 `test/shop.test.js` 现有 game 构造方式复用；若现有用例手写字面量则同样手写。）

`test/spawner.test.js` 追加（顶部补 `import { getTierConfig } from '../src/config/difficulty.js';`）：

```js
test('surge=false 跨档不产生包围潮，但仍按新档 weights 常规刷怪', () => {
  const zombies = [];
  const rng = mulberry32(3);
  const sp = createSpawner();
  sp.budget = 999;
  const n = updateSpawner(sp, 180, CAM, 3000, zombies, 0, rng, 1 / 60, 1, getTierConfig, {}, false);
  assert.equal(sp.lastTier, 2);
  assert.ok(n >= 1 && n < 25, `surge=false 只走常规刷怪，实际新增 ${n}（应 <25 且 ≥1）`);
  for (const z of zombies) assert.ok(z.type === 'normal' || z.type === 'fast');
});
```

**Step 2: 跑测试确认失败**

Run: `node --test test/hud.test.js test/shop.test.js test/spawner.test.js`
Expected: FAIL（adventureTierProgress 不存在；opts.earlyTier 未生效；`updateSpawner` 尚无 `surge` 参数）

**Step 3: 实现**

`src/systems/shop.js`：`catalogFor(game, tierRemainingSec)` → `catalogFor(game, tierRemainingSec, opts = {})`，返回前组装：

```js
const groups = [
  { group: '武器强化', entries: weaponEnhance },
  { group: '更换武器', entries: weapons },
  { group: '辅助武器', entries: aux },
  { group: '辅助强化', entries: auxEnhance },
  { group: '道具', entries: items },
];
if (opts.earlyTier !== false) {
  // 风险：bonus 为 0 时仍列出（"无奖励"标注由 UI 负责）；冒险模式移除（设计 §3.1）
  groups.push({ group: '风险', entries: [{ kind: 'earlyTier', bonus: earlyTierBonus(tierRemainingSec) }] });
}
return groups;
```

`src/ui/shop.js`：`showShop(rootEl, game, handlers)` → `showShop(rootEl, game, handlers, opts = {})`，内部 `catalogFor(game, game.tierRemaining, opts)`。

`src/systems/hud.js` 追加纯函数 + 冒险渲染分支：

```js
// 冒险四档进度（设计 §8 HUD）：tier 1–4、档内进度 0–1；纯函数可单测
export function adventureTierProgress(timeSec) {
  const tier = Math.min(4, Math.floor(timeSec / 90) + 1);
  const progress = Math.min(1, Math.max(0, (timeSec - (tier - 1) * 90) / 90));
  return { tier, progress };
}
```

`renderHud` 计时区改为：冒险模式正计时总时长（`formatTime(game.time)`，不变红）；并在顶部居中画四档进度条（当前档高亮 + 档内填充）：

```js
if (game.mode === 'adventure') {
  const { tier, progress } = adventureTierProgress(game.time);
  const segW = 90, segH = 8, gap = 6, totalW = segW * 4 + gap * 3;
  const x0 = (W - totalW) / 2, y0 = 12;
  for (let i = 1; i <= 4; i++) {
    const x = x0 + (i - 1) * (segW + gap);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(x, y0, segW, segH);
    if (i < tier) { ctx.fillStyle = '#5eff8a'; ctx.fillRect(x, y0, segW, segH); }
    else if (i === tier) {
      ctx.fillStyle = '#5eff8a';
      ctx.fillRect(x, y0, segW * progress, segH);
      ctx.strokeStyle = '#5eff8a'; ctx.strokeRect(x + 0.5, y0 + 0.5, segW - 1, segH - 1);
    }
  }
}
```

计时分支精确改法（`src/systems/hud.js` 约第 40–46 行，`renderHud` 内）：

```js
if (game.mode === 'endless' || game.mode === 'adventure') {
  // 正计时：无尽与冒险都显示 game.time，不变红
  timeText = formatTime(game.time);
} else {
  // 原倒计时逻辑：坚守（holdout10/20）剩 60s 变红
  const remain = Math.max(0, (game.duration || 0) - game.time);
  timeText = formatTime(remain);
  if (remain <= 60) timeColor = '#f55';
}
```

`src/game.js` 冒险分支（在任务 5 的 scalingCtx 基础上改）：

```js
// deps 解构已有 meta；本任务追加 levelId
const { canvas, input, mode = 'endless', levelId = null, audio, settings, meta = null, onGameOver } = deps;
const isAdventure = mode === 'adventure';
const advLevel = isAdventure ? adventureLevelById(levelId) : null;
if (isAdventure && !advLevel) throw new Error('未知冒险关卡: ' + levelId);
const modeCfg = isAdventure ? null : (MODES[mode] || MODES.endless);
const cfgFn = isAdventure ? makeAdventureCfg(advLevel) : modeCfg.getCfg;
const segLen = isAdventure ? ADVENTURE_TIER_DURATION : (mode === 'holdout10' ? HOLDOUT10_SEGMENT : TIER_DURATION);
const scalingCtx = { mode, level: isAdventure ? adventureLevelIndex(levelId) : 1 };
```

- scene 字段：`duration: isAdventure ? ADVENTURE_DURATION : (modeCfg.duration || 0)`，追加 `levelId, levelIndex: scalingCtx.level`。
- import 追加：`import { ADVENTURE_TIER_DURATION, ADVENTURE_DURATION, adventureLevelById, adventureLevelIndex, makeAdventureCfg } from './config/adventure.js';`
- **`modeCfg` 访问点逐条处置**（冒险时 `modeCfg = null`，所有 `modeCfg.` 必须带 `!isAdventure` 守卫或改道，否则首帧即崩）：
  - `const cfgFn = modeCfg.getCfg` → `isAdventure ? makeAdventureCfg(advLevel) : modeCfg.getCfg`（上段已含）；
  - `duration: modeCfg.duration || 0` → `isAdventure ? ADVENTURE_DURATION : (modeCfg.duration || 0)`（上段已含）；
  - `budgetMult = modeCfg.surgeFrom && ...` → `budgetMult = !isAdventure && modeCfg.surgeFrom && scene.time >= modeCfg.surgeFrom ? 1.5 : 1`（见下）；
  - Boss 注入块 `if (modeCfg.bossAt && !bossSpawned && scene.time >= modeCfg.bossAt)` → `if (!isAdventure && modeCfg.bossAt && !bossSpawned && scene.time >= modeCfg.bossAt)`（见下）；
  - 直升机/rescue 块 `if (modeCfg.duration)` → `if (!isAdventure && modeCfg.duration)`（见下）；
  - render() 撤离点提示 `if (modeCfg.duration && rescueAlerted && !scene.helicopter)` → `if (!isAdventure && modeCfg.duration && rescueAlerted && !scene.helicopter)`（见下）。
- update() 内：
  - 通关判定（放在时间推进后、直升机逻辑前；冒险无直升机）：直升机/rescue 块整体包 `if (!isAdventure && modeCfg.duration)`；新增：

```js
// 冒险通关：撑满 360s 即通关（设计 §3.1；无直升机撤离）
if (isAdventure && scene.time >= ADVENTURE_DURATION) {
  gameOver({ cleared: true });
  return;
}
```

  - `budgetMult` 行改 `const budgetMult = !isAdventure && modeCfg.surgeFrom && scene.time >= modeCfg.surgeFrom ? 1.5 : 1;`
  - Boss 注入块：`if (modeCfg.bossAt && !bossSpawned && scene.time >= modeCfg.bossAt)` → `if (!isAdventure && modeCfg.bossAt && !bossSpawned && scene.time >= modeCfg.bossAt)`（冒险 `modeCfg=null` 时 `modeCfg.bossAt` 会抛 TypeError，必须守卫）。
  - 档间包围潮：spawner 现行机制（cfg.tier > lastTier 触发）。设计 §3.1 裁定冒险不刷包围潮——`updateSpawner` 完整签名写为 `updateSpawner(sp, time, cam, mapSize, zombies, aliveCount, rng, dt, budgetMult = 1, cfgFn = getTierConfig, scalingCtx = {}, surge = true)`（`surge` 默认 `true`，否则存量包围潮测试会红）；`spawner.js` 内包围潮块包 `if (surge && cfg.tier > sp.lastTier)`，else 分支只更新 `sp.lastTier = cfg.tier`（防止关闭期间档位追不上）。game.js 调用处传 `..., cfgFn, scalingCtx, !isAdventure`。新增用例已放入 Step 1（`surge=false` 跨档不产生包围潮但仍按新档 weights 常规刷怪）。
- `showShopPanel` 内 `showShop(document.getElementById('shop'), scene, {...}, { earlyTier: !isAdventure })`；`applyEarlyTier` 保留（无尽/坚守用）。
- render() 撤离点提示块（约第 498 行）：`if (modeCfg.duration && rescueAlerted && !scene.helicopter)` → `if (!isAdventure && modeCfg.duration && rescueAlerted && !scene.helicopter)`（任务 10 目前只改了 update()，此处同样必须加守卫）。
- scene 追加 `quitRun`（冒险主动退出按失败结算，设计 §3.1）：

```js
function quitRun() { gameOver({ cleared: false }); }
```
（挂到 scene 对象上。）

`src/ui/gameover.js`（handlers 改对象签名，冒险版式）：

```js
// src/ui/gameover.js —— 结算覆盖层（DOM 胶水，无单测）
// showGameOver(rootEl, stats, isNew, handlers)：
//   stats = {time, kills, hp, cleared, mode, gold?, firstClear?}
//   handlers = { onRestart, onMenu, onLevels? }（冒险模式才有 onLevels）
import { formatTime } from '../systems/hud.js';

export function showGameOver(rootEl, stats, isNew, handlers) {
  const { onRestart, onMenu, onLevels } = handlers;
  const cleared = !!stats.cleared;
  const isAdventure = stats.mode === 'adventure';
  rootEl.innerHTML = isAdventure ? `
    <h2>${cleared ? '通关！' : '任务失败'}</h2>
    <p>${cleared ? '撑满了 6 分钟，成功通关！' : '存活时间：' + formatTime(stats.time)}</p>
    <p>击杀数：${stats.kills}</p>
    <p style="color:#ffd75e">金币 +${stats.gold}${stats.firstClear ? '（首通奖励 ×2）' : ''}</p>
    <button id="gameover-restart">重开本关</button>
    <button id="gameover-levels">回关卡选择</button>
    <button id="gameover-menu">回主菜单</button>
  ` : `
    <h2>${cleared ? '救援成功！' : '游戏结束'}</h2>
    ${cleared ? '<p style="color:#4d4">直升机已抵达，你活着离开了尸潮。剩余 HP：' + stats.hp + '</p>' : ''}
    ${isNew ? '<p style="color:#ffd75e;font-size:24px">新纪录！</p>' : ''}
    <p>${cleared ? '用时' : '存活时间'}：${formatTime(stats.time)}</p>
    <p>击杀数：${stats.kills}</p>
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
  if (isAdventure) {
    rootEl.querySelector('#gameover-levels').addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onLevels();
    });
  }
}
```

`src/main.js`：
- import 追加：`import { loadMeta, saveMeta, addGold, recordAdventureResult } from './core/meta.js';` 与 `import { ADVENTURE_LEVELS, adventureLevelById, clearGoldReward, failGoldReward } from './config/adventure.js';`
- 启动加载一次 meta（全程内存引用，变更后 saveMeta）：`const meta = loadMeta();`
- `startGame(mode)` → `startGame(mode, levelId = null)`；`createGameScene({ canvas, input, mode, levelId, audio, settings, meta, onGameOver })`。
- onGameOver 分流：

```js
onGameOver: stats => {
  if (stats.mode === 'adventure') {
    const level = adventureLevelById(levelId);
    const r = recordAdventureResult(meta, level.id, adventureLevelIndex(level.id), ADVENTURE_LEVELS.length, stats.cleared, stats.time);
    const gold = stats.cleared ? clearGoldReward(level, r.isFirstClear) : failGoldReward(level, stats.time);
    addGold(meta, gold);
    saveMeta(meta);
    audio.play('click');
    showGameOver(gameoverEl, { ...stats, gold, firstClear: stats.cleared && r.isFirstClear }, false, {
      onRestart: () => startGame('adventure', levelId),
      onLevels: showLevelsScreen, // 任务 11 提供；本任务先落 () => showMenuScreen() 占位
      onMenu: showMenuScreen,
    });
    return;
  }
  const r = updateBest(loadBest(), stats, stats.mode);
  saveBest(r.best);
  audio.play('click');
  showGameOver(gameoverEl, stats, r.isNew, { onRestart: () => startGame(mode), onMenu: showMenuScreen });
},
```

（`updateBest` 继续只管 endless/holdout，冒险纪录在 meta。）

- 暂停退出分流（设计 §3.1：冒险主动退出按失败结算）：

```js
onQuit: () => {
  pauseEl.classList.add('hidden');
  audio.stop('heli');
  if (currentScene.mode === 'adventure') {
    currentScene.paused = false;
    currentScene.quitRun(); // → gameOver({cleared:false}) → 失败保底结算
  } else {
    showMenuScreen();
  }
},
```

**Step 4: 跑测试确认通过**

Run: `node --test test/hud.test.js test/shop.test.js test/spawner.test.js`
Expected: PASS

注：本任务完成后冒险模式尚无 UI 入口（主菜单四入口在任务 11 才建），手动验证顺延任务 11；如需提前冒烟，可临时经控制台 `startGame('adventure', 'l1')` 验证。

**Step 5: 全量回归 + 提交**

Run: `npm test`
```bash
git add -A
git commit -m "任务10: 冒险模式接入主循环（360s 通关/失败保底/商店去提前进档/HUD 四档进度/结算三按钮）"
```

---

### Task 11: 主菜单四入口 + 关卡选择 / 武器升级 / 图鉴界面【模型：flash】

**Files:**
- Modify: `index.html`（新增 3 个 overlay div）
- Modify: `src/ui/menu.js`（四入口重写）
- Create: `src/ui/levels.js`、`src/ui/upgrades.js`、`src/ui/bestiary.js`
- Modify: `src/main.js`（showLevelsScreen / showUpgradesScreen / showBestiaryScreen 接线，替换任务 10 占位）
- Test: `test/bestiary.test.js` 追加视图模型用例（纯函数，无需 DOM mock）

设计 §7/§8。新界面为 DOM 胶水（沿用"无单测"惯例），但图鉴的视图模型抽成纯函数进 bestiary.test.js。

**Step 1: 追加测试（先红）** `test/bestiary.test.js`

```js
// —— 图鉴界面视图模型（设计 §7）——
import { monsterView, weaponView } from '../src/ui/bestiary.js';

test('怪物条目：未击杀 → ??? 占位；首次击杀 → 解锁（名称/描述/基础数值/累计击杀）', () => {
  const locked = monsterView(MONSTERS.exploder, {});
  assert.equal(locked.unlocked, false);
  assert.equal(locked.name, '???');
  const seen = monsterView(MONSTERS.exploder, { exploder: 1 });
  assert.equal(seen.unlocked, true);
  assert.equal(seen.name, '自爆僵尸');
  assert.equal(seen.kills, 1);
  assert.equal(seen.stats.hp, 40); // 图鉴基础值（关卡 1、局内 0 分钟口径）
});

test('武器条目：全部可见，携带局外等级与下一级提升', () => {
  const v = weaponView(WEAPONS.pistol, {});
  assert.equal(v.level, 0);
  assert.equal(v.maxed, false);
  assert.ok(Math.abs(v.nextDamage - 12 * 1.2) < 1e-9); // 每级 +20% 图鉴基础
  const maxed = weaponView(WEAPONS.pistol, { pistol: 10 });
  assert.equal(maxed.maxed, true);
});
```

**Step 2: 跑测试确认失败**

Run: `node --test test/bestiary.test.js`
Expected: FAIL（`../src/ui/bestiary.js` 不存在）

**Step 3: 实现**

`index.html` 在 `<div id="dev">` 后追加：

```html
  <div id="levels" class="overlay hidden"></div>
  <div id="bestiary" class="overlay hidden"></div>
  <div id="upgrades" class="overlay hidden"></div>
```

`src/ui/menu.js`（四入口重写，endless 纪录文案保留）：

```js
// src/ui/menu.js —— 主菜单覆盖层（DOM 胶水，无单测）
// showMenu(rootEl, best, handlers)：handlers = { onAdventure, onEndless, onBestiary, onUpgrades }
// 坚守 10/20 从菜单移除（代码与 MODES 保留，开发者菜单提供调试入口，设计 §8/§10）。
import { formatTime } from '../systems/hud.js';

export function showMenu(rootEl, best, handlers) {
  const { onAdventure, onEndless, onBestiary, onUpgrades } = handlers;
  const rec = (best || {}).endless;
  const bestLine = rec ? `无尽最佳：存活 ${formatTime(rec.time)} / 击杀 ${rec.kills}` : '暂无纪录';
  rootEl.innerHTML = `
    <h1>Zombie Survivor</h1>
    <button id="menu-adventure">冒险</button>
    <button id="menu-endless">无尽</button>
    <button id="menu-bestiary">图鉴</button>
    <button id="menu-upgrades">武器升级</button>
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
}
```

`src/ui/bestiary.js`：

```js
// src/ui/bestiary.js —— 图鉴界面（设计 §7）。DOM 胶水；monsterView/weaponView 为纯函数可单测。
// 怪物：当前可达种类网格（special 隐藏），首次击杀解锁（bestiaryKills[id] ≥ 1）；
// 未解锁显示统一 ??? 占位卡（不画形状剪影，避免泄露）。武器：全部可见。
// 数值口径：展示图鉴基础值（关卡 1、局内 0 分钟），局内实际值随关卡与时间增长。
import { playableMonsters } from '../config/bestiary/monsters.js';
import { WEAPONS } from '../config/bestiary/weapons.js';

export function monsterView(m, bestiaryKills) {
  const kills = bestiaryKills[m.id] ?? 0;
  if (kills < 1) return { id: m.id, unlocked: false, name: '???', kills: 0 };
  return {
    id: m.id, unlocked: true, name: m.name, desc: m.desc, kills,
    color: m.visual.color,
    stats: { hp: m.hp, speed: m.speed, damage: m.damage, coin: m.coin },
  };
}

export function weaponView(w, weaponLevels) {
  const level = weaponLevels[w.id] ?? 0; // 与 showUpgrades 同口径：直接读 meta.weaponLevels
  return {
    id: w.id, name: w.name, desc: w.desc, color: w.visual.color,
    level, maxed: level >= 10,
    damage: w.damage, nextDamage: w.damage * (1 + 0.2 * (level + 1)),
    nextDelta: Math.round(w.damage * 0.2), // 下一级提升幅度（每级恒 +20% 图鉴基础，设计 §7）
    stats: { fireRate: w.fireRate, range: w.range, pierce: w.pierce },
  };
}

export function showBestiary(rootEl, meta, onBack) {
  const render = tab => {
    const monsterCards = playableMonsters().map(m => monsterView(m, meta.bestiaryKills));
    const weaponCards = Object.values(WEAPONS).map(w => weaponView(w, meta.weaponLevels));
    rootEl.innerHTML = `
      <h2>图鉴</h2>
      <div class="bestiary-tabs">
        <button id="bestiary-tab-monsters"${tab === 'monsters' ? ' class="active"' : ''}>怪物</button>
        <button id="bestiary-tab-weapons"${tab === 'weapons' ? ' class="active"' : ''}>武器</button>
      </div>
      <div class="bestiary-grid">
        ${tab === 'monsters' ? monsterCards.map(v => v.unlocked ? `
          <div class="bestiary-card">
            <div class="bestiary-swatch" style="background:${v.color}"></div>
            <h4>${v.name}</h4><p>${v.desc}</p>
            <p>HP ${v.stats.hp} · 速度 ${v.stats.speed} · 伤害 ${v.stats.damage} · 银币 ${v.stats.coin}</p>
            <p>累计击杀 ${v.kills}</p>
          </div>` : `
          <div class="bestiary-card locked"><h4>???</h4><p>尚未遭遇</p></div>`).join('')
        : weaponCards.map(v => `
          <div class="bestiary-card">
            <div class="bestiary-swatch" style="background:${v.color}"></div>
            <h4>${v.name}</h4><p>${v.desc}</p>
            <p>伤害 ${v.damage} · 射速 ${v.stats.fireRate}/s · 射程 ${v.stats.range}</p>
            <p>局外等级 Lv ${v.level}/10${v.maxed ? '（已满级）' : ` · 下一级伤害 +${v.nextDelta}`}</p>
          </div>`).join('')}
      </div>
      <p class="bestiary-note">图鉴数值为基础值（关卡 1、局内 0 分钟口径）；局内实际值随关卡与时间增长。</p>
      <button id="bestiary-back">返回</button>
    `;
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

`src/ui/levels.js`：

```js
// src/ui/levels.js —— 冒险关卡选择（设计 §3.1/§8）。DOM 胶水，无单测。
// 卡片式：名称 / 锁定（???）/ 最佳成绩（通关标记或存活时间）/ 金币奖励。
import { ADVENTURE_LEVELS } from '../config/adventure.js';
import { formatTime } from '../systems/hud.js';

export function showLevels(rootEl, meta, onStart, onBack) {
  // unlocked 上限夹取在 UI 层按 ADVENTURE_LEVELS.length 做（meta.js 不反向依赖 adventure 配置，见任务 1）
  const unlockedMax = Math.min(meta.adventure.unlocked, ADVENTURE_LEVELS.length);
  rootEl.innerHTML = `
    <h2>冒险模式</h2>
    <p>金币余额：${meta.gold}</p>
    <div class="level-cards">
      ${ADVENTURE_LEVELS.map((lv, i) => {
        const unlocked = unlockedMax >= i + 1;
        const best = meta.adventure.bestTimes[lv.id];
        const bestText = !best ? '' : best.cleared ? '已通关' : `最佳：存活 ${formatTime(best.timeSec)}`;
        return `
          <div class="level-card${unlocked ? '' : ' locked'}" data-level="${unlocked ? lv.id : ''}">
            <h3>${unlocked ? `第 ${i + 1} 关 · ${lv.name}` : '???'}</h3>
            <p>${unlocked ? `通关奖励 ${lv.goldReward} 金币（首通 ×2）` : '通关上一关解锁'}</p>
            <p>${bestText}</p>
          </div>`;
      }).join('')}
    </div>
    <button id="levels-back">返回</button>
  `;
  rootEl.classList.remove('hidden');
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

`src/ui/upgrades.js`：

```js
// src/ui/upgrades.js —— 武器局外升级（金币，设计 §6.2）。DOM 胶水，无单测。
// 每把武器：当前等级 / 下一级伤害 / 价格；余额不足或满级置灰；购买即写 meta 并回调保存。
import { WEAPONS } from '../config/bestiary/weapons.js';
import { weaponUpgradePrice } from '../config/economy.js';
import { weaponLevel, spendGold } from '../core/meta.js';

export function showUpgrades(rootEl, meta, onBack, onSave) {
  const render = () => {
    rootEl.innerHTML = `
      <h2>武器升级</h2>
      <p>金币余额：${meta.gold}</p>
      <div class="upgrade-list">
        ${Object.values(WEAPONS).map(w => {
          const lv = weaponLevel(meta, w.id);
          const maxed = lv >= 10;
          const price = maxed ? null : weaponUpgradePrice(lv);
          const curDmg = w.damage * (1 + 0.2 * lv);
          const nextDmg = w.damage * (1 + 0.2 * (lv + 1));
          const disabled = maxed || meta.gold < price;
          return `
            <div class="upgrade-row">
              <h4>${w.name} <span>Lv ${lv}/10</span></h4>
              <p>伤害 ${Math.round(curDmg)}${maxed ? '（已满级）' : ` → ${Math.round(nextDmg)}`}</p>
              <button class="upgrade-buy" data-id="${w.id}" ${disabled ? 'disabled' : ''}>
                ${maxed ? '满级' : `升级（${price} 金币）`}
              </button>
            </div>`;
        }).join('')}
      </div>
      <button id="upgrades-back">返回</button>
    `;
    for (const btn of rootEl.querySelectorAll('.upgrade-buy')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const lv = weaponLevel(meta, id);
        if (lv >= 10) return;
        if (!spendGold(meta, weaponUpgradePrice(lv))) return;
        meta.weaponLevels[id] = lv + 1;
        onSave();
        render();
      });
    }
    rootEl.querySelector('#upgrades-back').addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onBack();
    });
  };
  rootEl.classList.remove('hidden');
  render();
}
```

`src/main.js` 接线：
- import 追加 `showLevels`/`showUpgrades`/`showBestiary` 三个 ui 模块；`levelsEl/bestiaryEl/upgradesEl` 取元素。
- 新增：

```js
function showLevelsScreen() {
  hideOverlays();
  currentScene = null;
  showLevels(levelsEl, meta, levelId => startGame('adventure', levelId), showMenuScreen);
}
function showUpgradesScreen() {
  hideOverlays();
  currentScene = null;
  showUpgrades(upgradesEl, meta, showMenuScreen, () => saveMeta(meta));
}
function showBestiaryScreen() {
  hideOverlays();
  currentScene = null;
  showBestiary(bestiaryEl, meta, showMenuScreen);
}
```

- `showMenuScreen` 改：`showMenu(menuEl, loadBest(), { onAdventure: showLevelsScreen, onEndless: () => startGame('endless'), onBestiary: showBestiaryScreen, onUpgrades: showUpgradesScreen });`
- 任务 10 的 `onLevels: () => showMenuScreen()` 占位替换为 `onLevels: showLevelsScreen`。

**Step 4: 跑测试确认通过**

Run: `node --test test/bestiary.test.js`
Expected: PASS；`npm test` 全绿

**Step 5: 提交**

```bash
git add -A
git commit -m "任务11: 主菜单四入口 + 关卡选择/武器升级/图鉴三个新界面"
```

---

### Task 12: 开发者菜单扩展【模型：K3-256k】

**Files:**
- Modify: `src/ui/dev.js`
- Modify: `src/main.js`（接线 onGold / onUnlockLevels / onStartMode / onStress）
- Modify: `src/game.js`（新增 devStress 压测支撑；devSpawnZombie 接图鉴已在任务 5 完成，此处无残留）

设计 §10。现有：+100/+1000 银币（局内 `scene.coins`）、放置 4 种怪。注意：**金币是局外货币，走 meta，与银币回调区分**。

**Step 1: 实现 `src/ui/dev.js`**

文件头（handlers 签名注释同步更新；import 放文件头）：

```js
// src/ui/dev.js —— 开发者菜单（DOM 胶水，无单测）。
// showDev(rootEl, handlers)：handlers = { onCoins, onGold, onSpawn, onUnlockLevels, onStartMode, onStress, onClose }
import { MONSTERS, playableMonsters } from '../config/bestiary/monsters.js';
```

函数内解构（照抄）：

```js
const { onCoins, onGold, onSpawn, onUnlockLevels, onStartMode, onStress, onClose } = handlers;
```

在"关闭"按钮前追加四组（金币 / 解锁关卡 / 启动坚守 10·20 / FPS·压测）：

```js
// 追加在 spawns 循环之后：
const goldBtn = document.createElement('button');
goldBtn.className = 'dev-btn';
goldBtn.textContent = '+1000 金币（局外）';
goldBtn.addEventListener('click', () => onGold(1000));
wrap.appendChild(goldBtn);

const unlockBtn = document.createElement('button');
unlockBtn.className = 'dev-btn';
unlockBtn.textContent = '解锁全部关卡';
unlockBtn.addEventListener('click', () => onUnlockLevels());
wrap.appendChild(unlockBtn);

for (const [m, label] of [['holdout10', '启动 坚守10'], ['holdout20', '启动 坚守20']]) {
  const btn = document.createElement('button');
  btn.className = 'dev-btn';
  btn.textContent = label;
  btn.addEventListener('click', () => onStartMode(m));
  wrap.appendChild(btn);
}

// FPS / 平均帧时显示（帧时滑动平均，显示在 dev 面板内即可）
const fpsEl = document.createElement('div');
fpsEl.className = 'dev-fps';
fpsEl.textContent = 'FPS — / 平均帧时 —';
wrap.appendChild(fpsEl);
let fpsAcc = 0, fpsN = 0, fpsLast = performance.now();
function fpsTick() {
  const now = performance.now();
  const dt = now - fpsLast; fpsLast = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1000) {
    const avg = fpsAcc / fpsN;
    fpsEl.textContent = `FPS ${Math.round(1000 / avg)} / 平均帧时 ${avg.toFixed(1)}ms`;
    fpsAcc = 0; fpsN = 0;
  }
  requestAnimationFrame(fpsTick);
}
requestAnimationFrame(fpsTick);

// 性能压测按钮：填满 400 怪 + 满强化机枪，维持约 400 活跃弹道（手动验收用）
const stressBtn = document.createElement('button');
stressBtn.className = 'dev-btn';
stressBtn.textContent = '性能压测';
stressBtn.addEventListener('click', () => onStress());
wrap.appendChild(stressBtn);
```

放置怪物名单从 `MONSTERS` 生成（`playableMonsters()` + boss）：

```js
// import 已在文件头（见 Step 1 顶部）
// spawns 数组改为：
const spawns = [...playableMonsters().map(m => m.id), 'boss']
  .map(id => [id, '放置 ' + MONSTERS[id].name]);
```

**Step 2: `src/main.js` 接线**

```js
showDev(devEl, {
  onCoins: n => currentScene.devAddCoins(n),
  onSpawn: type => currentScene.devSpawnZombie(type),
  onGold: n => { addGold(meta, n); saveMeta(meta); },
  onUnlockLevels: () => { meta.adventure.unlocked = ADVENTURE_LEVELS.length; saveMeta(meta); },
  onStartMode: m => { closeDev(); hideOverlays(); startGame(m); }, // 调试入口：坚守隐藏期间仍可回归验证（设计 §13）
  onStress: () => { if (currentScene) currentScene.devStress(); },
  onClose: closeDev,
});
```

（`onStartMode` 在局中直接换场景：createGameScene 重建 + `engine.setScene`，与 startGame 同路径。）

`src/game.js` 新增 `devStress`（挂到 scene 对象；文件顶部 difficulty import 追加 `MAX_ZOMBIES`）：

```js
// 性能压测（dev 菜单）：填满 400 怪 + 满强化机枪（自动开火近似维持约 400 活跃弹道）。手动验收，不进单测。
function devStress() {
  scene.weapon = createWeapon('mg');
  scene.weapon.enhance = { damage: 8, fireRate: 8, projectiles: 8, range: 8, fragCount: 0, fragDamage: 0, chainLen: 0, chainDmg: 0 };
  const cfg = cfgFn(scene.time);
  while (aliveCount < MAX_ZOMBIES) {
    const p = offscreenPoint(camera, MAP_SIZE, rng);
    scene.zombies.push(createZombie('normal', p.x, p.y, { ...scalingCtx, tier: cfg.tier, timeSec: scene.time }));
    aliveCount++;
  }
  spawnFloater(scene.floaters, player.x, player.y - 40, '压测中：400 怪 + 满强化机枪', '#f55');
}
```

（`devStress` 需加入 scene 对象导出；也可注明"以持续刷怪 + 自动开火近似 400 活跃弹道"作为等效做法。）

**Step 3: 手动验证 + 提交**

Run: `npm test`（应全绿——dev.js 无单测，沿用惯例；devStress 为纯 UI/dev 工具，手动验证即可，不进单测）
手动：起 `npm start`，` 键开菜单，验证金币/解锁关卡/启动坚守 10·20/放置怪物/FPS 显示/性能压测等入口。
```bash
git add src/ui/dev.js src/main.js src/game.js
git commit -m "任务12: 开发者菜单新增金币/解锁关卡/启动坚守调试入口 + FPS/性能压测"
```

---

### Task 13: `entities/render.js` 怪物几何矢量渲染【模型：K3-256k】

**Files:**
- Create: `src/entities/render.js`
- Modify: `src/game.js`（僵尸绘制块替换）
- Modify: `test/bestiary.test.js`（形状注册断言）

设计 §9.1。**现状提示**：受击闪白（`zombie.js` hitFlash + `game.js` 白色覆盖）、受伤血条（`game.js` `hp < maxHp`）、死亡粒子（`killZombie` spawnParticles）现行均已实现——本任务是迁移重画成几何矢量风，不是新建机制。绘制的调用点现状在 `game.js` render 的僵尸循环（约 568–591 行）。

**Step 1: 追加测试（先红）** `test/bestiary.test.js`

```js
// —— 形状注册表（设计 §9.1）：图鉴 visual.shape 必须已注册（只断言键存在，不测绘制）——
import { SHAPES } from '../src/entities/render.js';

test('每个怪物的 visual.shape 都已注册画法', () => {
  for (const m of Object.values(MONSTERS))
    assert.ok(SHAPES[m.visual.shape], `${m.id}.visual.shape=${m.visual.shape} 未在 render.js 注册`);
  // 五种形状齐全
  assert.deepEqual(Object.keys(SHAPES).sort(), ['circle', 'diamond', 'hexagon', 'pentagon', 'triangle']);
});
```

**Step 2: 跑测试确认失败**

Run: `node --test test/bestiary.test.js`
Expected: FAIL（`../src/entities/render.js` 不存在）

**Step 3: 实现** `src/entities/render.js`

```js
// src/entities/render.js —— 几何矢量渲染器（设计 §9，Infinitode 2 风）。
// 形状注册表：shape id → 路径函数（只描路径，填充/描边由 renderZombie 统一设色）。
// 新怪加形状 = 在此注册一个多边形画法 + 图鉴 visual.shape 引用。
// 渲染函数接收外部 ctx，不进单测（bestiary.test.js 只断言注册表键）。
import { MONSTERS, EXPLODER_FUSE_TIME } from '../config/bestiary/monsters.js';

// 正 n 边形路径（顶点朝上；rot 可调相位）
function poly(ctx, x, y, r, n, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export const SHAPES = {
  circle: (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); },
  triangle: (ctx, x, y, r) => poly(ctx, x, y, r, 3),
  hexagon: (ctx, x, y, r) => poly(ctx, x, y, r, 6),
  pentagon: (ctx, x, y, r) => poly(ctx, x, y, r, 5),
  diamond: (ctx, x, y, r) => poly(ctx, x, y, r, 4),
};

// 单怪绘制：发光描边 + 受击闪白 + 受伤后血条 + 引信闪烁膨胀（exploder fuse 中）
export function renderZombie(ctx, z, timeSec) {
  const v = MONSTERS[z.type].visual;
  // 引信中：膨胀 + 闪烁（设计 §4.3/§9.1）
  let r = z.r, alpha = 1;
  if (z.fuse !== undefined && !z.fuseDone) {
    const t = Math.min(1, z.fuse / EXPLODER_FUSE_TIME);
    r = z.r * (1 + 0.25 * t);
    alpha = 0.55 + 0.45 * Math.sin(timeSec * 30);
  }
  const shape = SHAPES[v.shape] || SHAPES.circle;
  ctx.globalAlpha = alpha;
  shape(ctx, z.x, z.y, r);
  ctx.fillStyle = v.color;
  ctx.fill();
  // 发光描边：同色 shadowBlur 低成本发光
  ctx.save();
  ctx.shadowColor = v.color;
  ctx.shadowBlur = 12 * (v.glow ?? 0.3);
  ctx.strokeStyle = v.color;
  ctx.lineWidth = 2;
  shape(ctx, z.x, z.y, r);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
  // 受击闪白（迁移自 game.js：hitFlash 0.1s 白色覆盖）
  if (z.hitFlash > 0) {
    ctx.globalAlpha = Math.min(1, z.hitFlash / 0.1);
    shape(ctx, z.x, z.y, r);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 受伤后才显示的血条（迁移自 game.js）
  if (z.hp < z.maxHp) {
    const bw = z.r * 2, bh = 3;
    const x = z.x - bw / 2, y = z.y - z.r - 8;
    ctx.fillStyle = '#a33';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#5eff8a';
    ctx.fillRect(x, y, bw * Math.max(0, z.hp / z.maxHp), bh);
  }
}
```

`src/game.js`：僵尸绘制循环（568–591 行）整段替换为：

```js
// 僵尸：几何矢量渲染（entities/render.js，设计 §9.1）
for (const z of scene.zombies) renderZombie(ctx, z, scene.time);
```

顶部 import 追加 `import { renderZombie } from './entities/render.js';`；`MONSTERS` 的 import 若不再使用则移除（任务 12 的 devSpawnZombie 仍用 `MONSTERS[type].name`，保留）。

**Step 4: 跑测试确认通过 + 手动目验**

Run: `node --test test/bestiary.test.js` → PASS；`npm test` 全绿
手动：`npm start` 无尽模式目验五种形状/发光描边/闪白/血条；引信膨胀闪烁经 Task 12 dev 菜单放置自爆僵尸验证（或无尽档 5+ 出现自爆后）。

**Step 5: 提交**

```bash
git add -A
git commit -m "任务13: 新增 entities/render.js 形状注册表，怪物迁移为几何矢量渲染"
```

---

### Task 14: 子弹特效 + 粒子对象池【模型：K3-256k】

**Files:**
- Modify: `src/entities/effects.js`（粒子池化）
- Modify: `src/entities/projectile.js`（拖尾环形缓冲）
- Modify: `src/entities/render.js`（renderProjectile 按 visual 绘制）
- Modify: `src/entities/weapon.js`（fire 弹道携带 visual）
- Modify: `src/game.js`（弹道绘制替换、粒子池接线、枪口闪光）
- Test: `test/effects.test.js`、`test/projectile.test.js`（改写/追加）

设计 §9.2/§9.3。**现状提示**：粒子/特效/浮动数字现为普通数组 push + swap-remove，未池化；`core/pool.js` 目前仅用于弹道。本任务是**新建**粒子池（复用 createPool），不是"扩展"。性能红线：同屏 400 怪 + 400 弹道 ≥ 50fps（手动压测验收，任务 16）。

**Step 1: 改写/追加测试（先红）**

存量测试改写：

- `test/effects.test.js`：现状 5 个用例用旧签名 `spawnParticles(arr, …)` / `updateParticles(arr, dt)`（`spawnParticles 生成 n 个`、`同种子可复现`、`粒子按 vx/vy 位移`、`swap-remove`、`life 耗尽`），全部改为在首参前加 `createParticlePool()`（如 `spawnParticles(createParticlePool(), arr, …)`、`updateParticles(createParticlePool(), arr, dt)`）；`spawnExplosion` 用例随新签名改（见下：ring 进 effectsArr、16 粒子经 pool 进 particlesArr）。
- `test/projectile.test.js`：`createProjectile 返回默认字段` 用例的 `deepEqual` 断言补新字段 `visual: null, trail: Array(8), trailHead: 0, trailLen: 0`（`trail` 为 `Array.from({ length: 8 }, () => ({ x: 0, y: 0 }))` 预分配定长数组，deepEqual 用 `Array(8).fill({x:0,y:0})` 形式表达即可）。

`test/projectile.test.js` 追加：

```js
test('拖尾环形缓冲：≤8 点、复用预分配数组、无每帧分配', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 100, range: 10000 });
  assert.equal(p.trailLen, 0);
  for (let i = 0; i < 20; i++) updateProjectile(p, 0.1);
  assert.ok(p.trailLen <= 8);
  assert.equal(p.trail.length, 8); // 预分配定长
  // 最新的点是上一次位置（当前位置由渲染时实时取）
  const head = (p.trailHead - 1 + 8) % 8;
  assert.ok(p.trail[head].x < p.x);
});

test('弹道携带 visual（武器图鉴视觉描述），缺省为 null', () => {
  const p = createProjectile();
  resetProjectile(p, { x: 0, y: 0, angle: 0, speed: 1, range: 1, visual: { bulletShape: 'needle', color: '#aef', trail: 0.9 } });
  assert.equal(p.visual.bulletShape, 'needle');
  const q = createProjectile();
  assert.equal(q.visual, null);
});
```

`test/effects.test.js` 追加：

```js
test('粒子池：obtain/release 复用对象，粒子死亡归还池', () => {
  const pool = createParticlePool();
  const arr = [];
  spawnParticles(pool, arr, 0, 0, '#fff', 10, () => 0.5);
  assert.equal(arr.length, 10);
  updateParticles(pool, arr, 1); // life 0.4 → 全部死亡归还
  assert.equal(arr.length, 0);
  assert.ok(pool.size >= 10);
  spawnParticles(pool, arr, 0, 0, '#fff', 10, () => 0.5);
  assert.equal(pool.size, 0); // 复用后池余 0（10 进 10 出）
});
```

（按 `test/effects.test.js` 现有风格对齐；`createParticlePool` 签名以本任务实现为准调整测试。）

**Step 2: 跑测试确认失败**

Run: `node --test test/projectile.test.js test/effects.test.js`
Expected: FAIL

**Step 3: 实现**

`src/entities/projectile.js`（定长拖尾环形缓冲，零每帧分配）：

```js
export const TRAIL_MAX = 8; // 设计 §9.3：拖尾定长线段数组（render.js 复用，消除魔法数 8）

export function createProjectile() {
  return { x: 0, y: 0, angle: 0, speed: 0, damage: 0, range: 0,
    traveled: 0, pierce: 0, knockback: 0, aoe: 0, arc: false, chain: 0,
    frags: null, chainMult: 0.8, chainDmgMult: 1, alive: true,
    visual: null, // 武器图鉴 visual 描述（bulletShape/color/trail/hitParticles/muzzleGlow）
    trail: Array.from({ length: TRAIL_MAX }, () => ({ x: 0, y: 0 })), // 预分配
    trailHead: 0, trailLen: 0 };
}

export function resetProjectile(p, opts) {
  Object.assign(p, opts, { traveled: 0, alive: true, trailHead: 0, trailLen: 0, visual: opts.visual ?? null });
}

export function updateProjectile(p, dt) {
  // 写入环形缓冲（覆盖最旧点，无分配）
  p.trail[p.trailHead].x = p.x;
  p.trail[p.trailHead].y = p.y;
  p.trailHead = (p.trailHead + 1) % TRAIL_MAX;
  if (p.trailLen < TRAIL_MAX) p.trailLen++;
  p.x += Math.cos(p.angle) * p.speed * dt;
  p.y += Math.sin(p.angle) * p.speed * dt;
  p.traveled += p.speed * dt;
  if (p.traveled >= p.range) p.alive = false;
}
```

`src/entities/effects.js`（粒子池化——spawnParticles/updateParticles 签名加 pool 首参）：

```js
import { createPool } from '../core/pool.js';

// 粒子对象池（设计 §9.3：禁止每帧对象分配）。死亡归还、生成复用。
export function createParticlePool() {
  return createPool(
    () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#fff', r: 2 }),
    (p, x, y, color, rng) => {
      const angle = rng() * Math.PI * 2;
      const speed = 60 + rng() * 120;
      p.x = x; p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 0.4; p.maxLife = 0.4;
      p.color = color;
      p.r = 2 + rng() * 2;
    },
  );
}

export function spawnParticles(pool, arr, x, y, color, n, rng) {
  for (let i = 0; i < n; i++) arr.push(pool.obtain(x, y, color, rng));
}

export function updateParticles(pool, arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      arr[i] = arr[arr.length - 1];
      arr.pop();
      pool.release(p);
    }
  }
}

// 爆炸：扩张描边圆进 effectsArr + 16 个橙色粒子经 pool 进 particlesArr（修正旧实现同 arr 粒子死代码）。
export function spawnExplosion(pool, effectsArr, particlesArr, x, y, radius, rng) {
  const j = () => (rng() * 2 - 1) * 6;
  effectsArr.push({ type: 'ring', x, y, r0: 12 + j(), r1: radius + j(), life: 0.25, maxLife: 0.25, phase: rng() * Math.PI * 2 });
  spawnParticles(pool, particlesArr, x, y, '#f80', 16, rng);
}
```

（floaters/effects 数组维持现状——量小不池化；`updateEffects` 不动，粒子由 `updateParticles` 回收。`fxExplosion` 调用点同步改 `spawnExplosion(particlePool, scene.effects, scene.particles, x, y, radius, rng)`。）

`src/entities/render.js` 追加弹道渲染（additive 发光 + 渐隐拖尾 + 每武器形状语言）：

```js
import { TRAIL_MAX } from './projectile.js'; // 追加到 render.js 顶部 import 区

// 弹道渲染（设计 §9.2）：发光几何体 + 渐隐拖尾。additive 混合，渲染后恢复。
export function renderProjectiles(ctx, projectiles) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of projectiles) {
    // 无 visual 的弹道（turret/aux）保留旧配色语言：aoe 橙 / chain 青 / 常规黄（game.js:632 视觉语言不丢）
    const v = p.visual || {
      bulletShape: 'bar',
      color: p.aoe > 0 ? '#f80' : p.chain > 0 ? '#5ef' : '#ffe066',
      trail: 0.3,
    };
    // 拖尾：环形缓冲从旧到新，alpha 递增
    for (let i = 0; i < p.trailLen; i++) {
      const idx = (p.trailHead - p.trailLen + i + TRAIL_MAX) % TRAIL_MAX;
      const t = p.trail[idx];
      ctx.globalAlpha = (i / p.trailLen) * 0.35 * (v.trail ?? 0.3);
      ctx.fillStyle = v.color;
      ctx.fillRect(t.x - 1.5, t.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = v.color;
    const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
    switch (v.bulletShape) {
      case 'dot':
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'needle': // 狙击细长光针
        ctx.strokeStyle = v.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - dx * 14, p.y - dy * 14); ctx.lineTo(p.x + dx * 3, p.y + dy * 3); ctx.stroke();
        break;
      case 'polygon': { // 火箭/榴弹带尾焰多边形
        ctx.beginPath();
        ctx.moveTo(p.x + dx * 6, p.y + dy * 6);
        ctx.lineTo(p.x - dy * 4, p.y + dx * 4);
        ctx.lineTo(p.x - dx * 6, p.y - dy * 6);
        ctx.lineTo(p.x + dy * 4, p.y - dx * 4);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'arc': // 磁电链状电弧：小菱形
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x, p.y + 5); ctx.lineTo(p.x - 4, p.y);
        ctx.closePath(); ctx.fill();
        break;
      default: // bar：步枪长条弹
        ctx.strokeStyle = v.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - dx * 5, p.y - dy * 5); ctx.lineTo(p.x + dx * 5, p.y + dy * 5); ctx.stroke();
    }
  }
  ctx.restore();
}
```

`src/entities/weapon.js` `fire()` 的 `opts` 追加 `visual: WEAPONS[w.id].visual`（turret/aux 弹道不带 → 默认视觉）。

`src/game.js`：
- import 改：`spawnParticles, updateParticles` 新签名；追加 `createParticlePool`（同模块 import 合并）与 `import { renderProjectiles } from './entities/render.js';`
- 常量区下新增 `const particlePool = createParticlePool();`
- 所有 `spawnParticles(scene.particles, ...)` → `spawnParticles(particlePool, scene.particles, ...)`；`updateParticles(scene.particles, dt)` → `updateParticles(particlePool, scene.particles, dt)`；`spawnExplosion` 调用改新签名 `spawnExplosion(particlePool, scene.effects, scene.particles, x, y, radius, rng)`（fxExplosion 一处封装）。
- 弹道绘制循环（631–639 行）整段替换为 `renderProjectiles(ctx, projectiles);`
- 枪口闪光：在 `playerSpawnProjectile` 内（`spawnProjectile({ ...opts, fromPlayer: true })` 之前）沿 `opts.angle` 前移 `player.r` 处生成 2 个粒子：

  ```js
  const mx = player.x + Math.cos(opts.angle) * player.r;
  const my = player.y + Math.sin(opts.angle) * player.r;
  spawnParticles(particlePool, scene.particles, mx, my, opts.visual?.color ?? '#ffe066', 2, rng);
  ```
- 命中粒子喷溅：combat 的 onHit 回调（game.js:361）`(z, p) => hitZombie(z, p.damage)` → `(z, p) => hitZombie(z, p.damage, p.visual)`；`hitZombie` 改为（粒子喷溅放在 `damageNumbers` 早退**之前**——早退只守护 floater，粒子不受设置项影响）：

  ```js
  function hitZombie(z, dmg, visual) {
    if (visual?.hitParticles)
      spawnParticles(particlePool, scene.particles, z.x, z.y, visual.color ?? '#ffe066', visual.hitParticles, rng);
    if (settings && !settings.damageNumbers) return;
    if (scene.floaters.length < MAX_FLOATERS)
      spawnFloater(scene.floaters, z.x, z.y - 20, String(Math.round(dmg)), '#ffd75e');
  }
  ```

  炸弹（game.js:228 `explode(..., z => hitZombie(z, 250), killZombie)`）与电磁球（game.js:442 `z => hitZombie(z, b.damage)`）调用**不传 `visual`**，按可选链静默无粒子属预期（仅主武器弹道喷溅）。

**Step 4: 跑测试确认通过 + 手动目验**

Run: `node --test test/projectile.test.js test/effects.test.js` → PASS；`npm test` 全绿
手动：目验七把武器弹道形状/拖尾/命中粒子/枪口闪光；磁电链电与榴弹碎片回归正常。

**Step 5: 提交**

```bash
git add -A
git commit -m "任务14: 子弹几何特效（visual 驱动）+ 粒子对象池 + 弹道拖尾环形缓冲"
```

---

### Task 15: UI 全面翻新（style.css 重建 + 面板统一）【模型：K3-256k】

**Files:**
- Rewrite: `style.css`
- Modify: `src/ui/menu.js`、`src/ui/pause.js`、`src/ui/gameover.js`、`src/ui/shop.js`、`src/ui/levels.js`、`src/ui/bestiary.js`、`src/ui/upgrades.js`、`src/ui/dev.js`（统一 class 命名，不改逻辑）
- Modify: `src/systems/hud.js`（仅 `renderHud` 颜色常量换肤；布局/位置常量不动）
- Modify: `test/shop-ui.test.js`（仅当 shop 面板子节点结构变化时同步断言）

设计 §8。**边界**（用户裁定）：旧模式（无尽/坚守）HUD 仅换肤、布局不动；**允许改 `src/systems/hud.js` 的 `renderHud` 颜色常量兑现"仅换肤"，但布局/位置常量（`barW/barH/mx/my/slotW/slotH` 等）一律不动**；冒险 HUD 进度条已在任务 10 完成。信息层级不变，只统一视觉语言。

**Step 1: 定设计令牌并重建 `style.css`**

统一规范（写进 style.css 顶部注释）：深色底 `#0d1210`；面板 `rgba(13,18,16,.92)` + 1px 霓虹描边 `#5eff8a`（次级 `#2a4a3a`）；圆角 8px；按钮统一 `.btn`（主）/`.btn-dim`（次）；字号：标题 28/正文 14/小字 12；间距 8 的倍数。

- 所有 overlay 面板：深色半透明底 + 霓虹几何描边 + 统一内边距。
- 所有按钮统一类名（`.btn` / `.btn-dim`），hover 发光过渡。
- 商店条目、关卡卡片、图鉴卡片、升级行：统一卡片样式（`.card` 基底 + 各界面修饰类）。
- **先删除 style.css 第 49–54 行旧的 `.cards`/`.card` 遗留块**，避免与新 `.card` 基底同名冲突（旧块与新基底语义不同，同名会造成样式互相覆盖）。

**Step 2: 各 ui/*.js 类名对齐**（只改 className/innerHTML 模板里的 class，不动 DOM 结构与回调；`#id` 选择器全部保留，避免动测试与接线）

**选择器承载类（不可改名，必须原样保留或改用 `data-*` 选择器）**：`.level-card`（levels.js 的 `querySelectorAll('.level-card:not(.locked)')`）与 `.upgrade-buy`（upgrades.js 的 `querySelectorAll('.upgrade-buy')`）是事件绑定载体，改名会静默断事件；如需统一命名，改用 `data-*` 选择器（如 `[data-level]` / `[data-id]`）并在对应 ui/*.js 同步改选择器。

各文件旧类名 → 新类名映射（标注不可改名的选择器承载类）：

| 文件 | 旧类名 | 新类名 | 备注 |
|------|--------|--------|------|
| levels.js | `.level-card` / `.level-cards` | `.card level-card` / `.level-cards` | `.level-card` 为选择器承载类，**原样保留** |
| upgrades.js | `.upgrade-row` / `.upgrade-buy` | `.card upgrade-row` / `.btn upgrade-buy` | `.upgrade-buy` 为选择器承载类，**原样保留** |
| bestiary.js | `.bestiary-card` / `.bestiary-grid` / `.bestiary-tabs` / `.bestiary-note` / `.bestiary-swatch` | `.card bestiary-card` / `.bestiary-grid` / `.bestiary-tabs` / `.bestiary-note` / `.bestiary-swatch` | 无选择器承载类 |
| shop.js | 分组/条目旧类名 | `.card` 基底 + 修饰类 | `#id` 与子节点结构不动 |
| menu.js / pause.js / gameover.js / dev.js | 按钮/面板旧类 | `.btn` / `.btn-dim` / 面板统一类 | `#id` 保留 |

注意 `test/shop-ui.test.js` 的结构断言（root 子节点 ≥3、分组行 ≥5）依赖 `replaceChildren(head, build, wrap, btn)` 结构——**不改 `ui/shop.js` 的子节点构成**，只改类名即可保持该测试绿。

**Step 3: 验证**

Run: `npm test`（应全绿）
手动：`npm start` 过一遍主菜单/冒险/无尽/暂停/商店/结算/图鉴/升级/关卡选择/dev 菜单十个界面，确认风格统一、无布局破损。

**Step 4: 提交**

```bash
git add -A
git commit -m "任务15: style.css 重建（深色+霓虹几何描边），全界面类名统一"
```

---

### Task 16: 全量回归 + 手动验收【模型：flash】

**Files:** 无新增（只跑验证）

**Step 1: 全量测试**

Run: `npm test`
Expected: 全绿（含新增 meta/scaling/bestiary/adventure/behaviors/upgrades + 改写后的存量测试）

**Step 2: 手动验收清单（设计 §11.2/§11.4/§9.3）**

- [ ] 冒险：关 1 通关 → 解锁关 2、金币 +200（首通 ×2）、结算三按钮可用；关 1 中途死亡 → 保底金币按存活比例；暂停主动退出 → 按失败结算
- [ ] 冒险商店无"提前进档"条目；无尽商店仍有
- [ ] 冒险 HUD 四档进度条（当前档高亮 + 档内进度），总计时不缺
- [ ] 关 3 档 4 自爆僵尸出现：引信 1.2s 闪烁膨胀、燃尽自爆（AoE 伤玩家与部署物）、引信中击杀不爆但掉币计数
- [ ] 无尽档 5 起自爆混入；无尽 10/20 分钟手动跑，确认难度无失控点（21 分钟终点 ≈ 旧版第 8 档）
- [ ] 图鉴：未解锁 ??? 占位、首次击杀解锁、击杀数累计；武器页全部可见含等级
- [ ] 武器升级：金币扣减/置灰/满级；升级后开局伤害提升可感知
- [ ] 开发者菜单：+1000 金币、解锁全部关卡、启动坚守 10/20、放置自爆僵尸、FPS/平均帧时显示、性能压测按钮
- [ ] 旧模式回归：无尽/坚守（经 dev 入口）流程完整，守门 Boss 正常
- [ ] 性能验收（量化）：dev 菜单点"性能压测"后，FPS 显示连续 5s 平均帧时 ≤20ms（≥50fps）
- [ ] 刷新页面后金币/等级/进度/图鉴统计持久化

**Step 3: 收尾提交（如有修复）**

```bash
git add -A
git commit -m "任务16: 全量回归与手动验收修复"
```

---

## 附：执行备注

- **冲突规避**：任务 13/14 都改 `game.js` 的 render 函数与 effects/weapon 接线，彼此与 15 可并行，但 13/14/15 都须在任务 3、6 之后（`render.js` 依赖 `config/bestiary/monsters.js` 与 Task 6 的 `EXPLODER_FUSE_TIME` 常量），且建议在任务 10 之后启动（避开 `game.js` render 冲突）。任务 12（dev.js/main.js）与 15（也改 dev.js）存在文件交叠，与 13/14（game.js）无直接交叠；需并行时按各自 File 清单错开。
- **存量测试改写全景**（设计 §11.3）：任务 4(config.test) → 5(zombie/spawner.test；combat/teslaball.test 无需改动) → 7(weapon/economy/shop/config/bestiary.test) → 8(weapon.test) → 10(hud/shop/spawner.test) → 13/14(bestiary/effects/projectile.test)。每个任务内先改测试再改实现，保持 TDD。
- **不改动的**（设计 §13）：`core/storage.js`（zs_best/zs_settings 原样）、音频、部署物/辅助武器逻辑、turret/companions 内部公式。
