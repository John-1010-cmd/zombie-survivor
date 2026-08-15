# 配置表——武器 / 僵尸 / 难度阶梯（Task 4）

> 上游：spec §4.2（主武器）、§4.4（僵尸）、§5.1（难度阶梯与数值封顶规则）；增强四维对应 spec §4.6。全局约束：`00-global-constraints.md`（简写 G§n）；索引：`README.md`。
> 执行前置：须已完成 Task 1–3（见 `01-foundation.md`）——本分册不消费其任何接口，依赖仅为 Task 1 建立的 ESM 脚手架（`package.json` 的 `"type":"module"` 与 `test` 脚本）及线性执行顺序（G§9）。

## 1. 目标与范围

交付三个纯数据配置模块及其单测：`src/config/weapons.js`（3 种武器 Lv1 基值 + 武器等级上限/增强四维/文案常量）、`src/config/zombies.js`（3 种僵尸参数 + 派生常量 `MAX_ZOMBIE_R`）、`src/config/difficulty.js`（8 档难度阶梯表 + `getTier`/`getTierConfig` 取档函数 + 4 个难度常量），测试文件 `test/config.test.js`（5 条用例）。本分册只定义数据与取档纯函数，不含任何行为逻辑——字段语义的执行（增强计算、击退、按预算刷怪、封顶规则的实际生效）全部在消费方模块。在架构中属纯逻辑层最底层的数据源（G§3、G§8），下游消费方为 04–08 分册（G§9：T4 → T8 T9 T10 T11 T12 T14 T15；其中 07 仅经 `ZOMBIES` 渲染取色消费——见 `07-scene-assembly.md` §2.2 补记）。与 spec 的全部差异（仅 3 种僵尸、各档组成权重再分配、裁掉后期武器）以 G§7.3 / G§7.5 为准，本分册不另立差异。

## 2. 契约

### 2.1 提供（Produces）

以下逐条取自源计划 Task 4 的 Produces（签名逐字保留）：

- `WEAPONS`：`{id: {id,name,damage,fireRate,projectileSpeed,range,projectiles,spread,pierce,aoe,knockback,burst,burstInterval}}`，含 `pistol/rifle/mg`——三种主武器的 Lv1 基值表（`src/config/weapons.js`）。
- `WEAPON_MAX_LEVEL = 8`；`ENHANCE_STATS = ['damage','fireRate','projectiles','range']`；`STAT_LABEL = {damage:'伤害 +25%', fireRate:'攻速 +20%', projectiles:'弹道 +1', range:'攻击范围 +20%'}`——武器等级上限、增强四维维度表及其 UI 文案（`src/config/weapons.js`）。
- `ZOMBIES`：`{id: {id,name,hp,speed,damage,xp,radius,color,knockbackResist,cost}}`，含 `normal/fast/tank`；`MAX_ZOMBIE_R`——三种僵尸参数表与最大半径派生常量（`src/config/zombies.js`）。
- `TIER_DURATION = 180`、`STAT_CAP_TIER = 8`、`GRACE_PERIOD = 30`、`MAX_ZOMBIES = 300`——档时长 / 数值封顶档 / 新手保护时长 / 同屏僵尸上限四个常量（`src/config/difficulty.js`）。
- `DIFFICULTY_TIERS`（8 档，结构见下）；`getTier(timeSec) → 档位`；`getTierConfig(timeSec) → 档配置（9 档起预算每档 +3、数值保持档 8）`——难度阶梯表与两个取档纯函数（`src/config/difficulty.js`）。

各字段的执行语义由消费方分册定义并测试：`spread`（度）转弧度与 `burst`/`burstInterval` 连发语义见 `04-entities.md`；`pierce` 命中结算、`MAX_ZOMBIE_R` 查询半径、`weights`/`budgetPerSec`/`cost` 预算花费、`GRACE_PERIOD`/`MAX_ZOMBIES` 见 `05-combat-systems.md`；`ENHANCE_STATS`/`STAT_LABEL` 的抽卡与展示用法见 `06-progression-and-effects.md`、`08-ui-and-persistence.md`。本分册不对这些语义做额外约定。

### 2.2 消费（Consumes）

无（源计划 Task 4 Interfaces 标注 `Consumes: 无`）。本模块为纯静态表，不调用 rng、不依赖 Task 2/3 的任何接口；对 `01-foundation.md` 的依赖仅为运行环境（ESM + `node --test`），不构成接口消费。

## 3. Task 4: 配置表——武器 / 僵尸 / 难度阶梯

**Files:**

- Create: `src/config/weapons.js`, `src/config/zombies.js`, `src/config/difficulty.js`
- Test: `test/config.test.js`

- [x] **Step 1: 写失败测试**

```js
// test/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_MAX_LEVEL, ENHANCE_STATS, STAT_LABEL } from '../src/config/weapons.js';
import { ZOMBIES, MAX_ZOMBIE_R } from '../src/config/zombies.js';
import { DIFFICULTY_TIERS, getTier, getTierConfig, TIER_DURATION, STAT_CAP_TIER } from '../src/config/difficulty.js';

test('武器字段完整且为正值，MVP 含 pistol/rifle/mg', () => {
  for (const id of ['pistol', 'rifle', 'mg']) {
    const w = WEAPONS[id];
    assert.ok(w, `缺武器 ${id}`);
    for (const f of ['damage','fireRate','projectileSpeed','range','projectiles','knockback'])
      assert.ok(w[f] > 0, `${id}.${f} 应为正数`);
    assert.ok(w.burst >= 1 && w.burstInterval >= 0);
    assert.equal(w.id, id);
  }
});

test('增强维度常量一致', () => {
  assert.equal(WEAPON_MAX_LEVEL, 8);
  assert.deepEqual([...ENHANCE_STATS].sort(), ['damage','fireRate','projectiles','range'].sort());
  for (const s of ENHANCE_STATS) assert.ok(STAT_LABEL[s]);
});

test('僵尸字段完整，权重引用的类型都存在', () => {
  for (const z of Object.values(ZOMBIES)) {
    for (const f of ['hp','speed','damage','xp','radius','cost']) assert.ok(z[f] > 0);
    assert.ok(z.knockbackResist >= 0 && z.knockbackResist < 1);
  }
  for (const t of DIFFICULTY_TIERS)
    for (const id of Object.keys(t.weights)) assert.ok(ZOMBIES[id], `档 ${t.tier} 引用未知僵尸 ${id}`);
  assert.ok(MAX_ZOMBIE_R >= 24); // 不小于坦克半径
});

test('档位边界与数值封顶规则（spec 用户修正 1）', () => {
  assert.equal(getTier(0), 1);
  assert.equal(getTier(TIER_DURATION - 1), 1);
  assert.equal(getTier(TIER_DURATION), 2);
  assert.equal(getTier(TIER_DURATION * 8), 9);
  const cap = getTierConfig(TIER_DURATION * (STAT_CAP_TIER - 1)); // 档 8
  const t9 = getTierConfig(TIER_DURATION * 8);
  const t10 = getTierConfig(TIER_DURATION * 9);
  assert.equal(t9.hpMult, cap.hpMult);      // 数值不再增长
  assert.equal(t9.speedMult, cap.speedMult);
  assert.equal(t9.budgetPerSec, cap.budgetPerSec + 3); // 仅预算递增
  assert.equal(t10.budgetPerSec, cap.budgetPerSec + 6);
});

test('预算随档单调不减', () => {
  for (let i = 1; i < 12; i++)
    assert.ok(getTierConfig(i * TIER_DURATION).budgetPerSec >= getTierConfig((i - 1) * TIER_DURATION).budgetPerSec);
});
```

- [x] **Step 2: 运行确认失败**

Run: `node --test test/config.test.js`
Expected: FAIL，模块不存在

- [x] **Step 3: 实现**

```js
// src/config/weapons.js
export const WEAPONS = {
  pistol: { id: 'pistol', name: '手枪', damage: 12, fireRate: 2.0, projectileSpeed: 500, range: 600,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, knockback: 120, burst: 1, burstInterval: 0 },
  rifle: { id: 'rifle', name: '步枪', damage: 9, fireRate: 1.4, projectileSpeed: 600, range: 600,
    projectiles: 1, spread: 0, pierce: 0, aoe: 0, knockback: 100, burst: 3, burstInterval: 0.08 },
  mg: { id: 'mg', name: '机枪', damage: 5, fireRate: 8, projectileSpeed: 550, range: 550,
    projectiles: 1, spread: 6, pierce: 0, aoe: 0, knockback: 60, burst: 1, burstInterval: 0 },
};
export const WEAPON_MAX_LEVEL = 8;
export const ENHANCE_STATS = ['damage', 'fireRate', 'projectiles', 'range'];
export const STAT_LABEL = {
  damage: '伤害 +25%', fireRate: '攻速 +20%', projectiles: '弹道 +1', range: '攻击范围 +20%',
};
```

```js
// src/config/zombies.js
export const ZOMBIES = {
  normal: { id: 'normal', name: '普通僵尸', hp: 30, speed: 70, damage: 8, xp: 1,
    radius: 14, color: '#6a8f6a', knockbackResist: 0, cost: 1 },
  fast: { id: 'fast', name: '高速僵尸', hp: 18, speed: 140, damage: 6, xp: 1,
    radius: 11, color: '#c9c25a', knockbackResist: 0, cost: 1 },
  tank: { id: 'tank', name: '坦克僵尸', hp: 220, speed: 40, damage: 20, xp: 5,
    radius: 24, color: '#a85a5a', knockbackResist: 0.8, cost: 6 },
};
export const MAX_ZOMBIE_R = Math.max(...Object.values(ZOMBIES).map(z => z.radius));
```

```js
// src/config/difficulty.js
export const TIER_DURATION = 180;
export const STAT_CAP_TIER = 8;
export const GRACE_PERIOD = 30;
export const MAX_ZOMBIES = 300;

export const DIFFICULTY_TIERS = [
  { tier: 1, budgetPerSec: 2,   weights: { normal: 1 },                          hpMult: 1,   speedMult: 1,    unlocks: ['normal'] },
  { tier: 2, budgetPerSec: 3,   weights: { normal: 0.7, fast: 0.3 },             hpMult: 1.5, speedMult: 1,    unlocks: ['fast'] },
  { tier: 3, budgetPerSec: 4.5, weights: { normal: 0.6, fast: 0.4 },             hpMult: 2.2, speedMult: 1.05, unlocks: [] },
  { tier: 4, budgetPerSec: 6,   weights: { normal: 0.5, fast: 0.3, tank: 0.2 },  hpMult: 3.2, speedMult: 1.05, unlocks: ['tank'] },
  { tier: 5, budgetPerSec: 8,   weights: { normal: 0.4, fast: 0.35, tank: 0.25 }, hpMult: 4.5, speedMult: 1.10, unlocks: [] },
  { tier: 6, budgetPerSec: 10,  weights: { normal: 0.4, fast: 0.35, tank: 0.25 }, hpMult: 6,   speedMult: 1.10, unlocks: [] },
  { tier: 7, budgetPerSec: 12,  weights: { normal: 0.35, fast: 0.35, tank: 0.3 }, hpMult: 8,   speedMult: 1.10, unlocks: [] },
  { tier: 8, budgetPerSec: 14,  weights: { normal: 0.35, fast: 0.35, tank: 0.3 }, hpMult: 10,  speedMult: 1.15, unlocks: [] },
];

export function getTier(timeSec) {
  return Math.floor(timeSec / TIER_DURATION) + 1;
}

export function getTierConfig(timeSec) {
  const t = getTier(timeSec);
  if (t <= DIFFICULTY_TIERS.length) return DIFFICULTY_TIERS[t - 1];
  const cap = DIFFICULTY_TIERS[STAT_CAP_TIER - 1];
  return { ...cap, tier: t, budgetPerSec: cap.budgetPerSec + 3 * (t - STAT_CAP_TIER) };
}
```

- [x] **Step 4: 运行确认通过**

Run: `node --test test/config.test.js`
Expected: 全 PASS

- [x] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 武器/僵尸/难度阶梯配置表（含数值封顶规则）"
```

### Task 4 验收

- 单测：`test/config.test.js` 共 **5 条**（武器字段完整且为正值 / 增强维度常量一致 / 僵尸字段完整且权重引用类型存在 / 档位边界与数值封顶规则 / 预算随档单调不减）
- 运行命令：`node --test test/config.test.js`（全量回归：`npm test`）
- 源计划本 Task 无人工验证清单

## 4. 歧义裁决（本模块）

| # | 易误解点 | 裁定 | 来源 |
|---|---|---|---|
| 1 | `weights` 是否必须归一化（和为 1） | 非严格归一化是 MVP 裁剪（G§7.3）：裁掉史莱姆/飞龙后各档组成权重按手感再分配，`pickWeighted` 不要求归一。现表以小数表示 spec §5.1 的百分比且各档恰和为 1，但这不是契约要求 | 拆分裁定 |
| 2 | 档 9+ 的档配置从哪来 | `getTierConfig` 动态派生：数值字段 = 档 8（`{...cap}` 整体展开，`tier` 改为当前档号），仅 `budgetPerSec` 每档 +3；`DIFFICULTY_TIERS` 数组本身恒为 8 个元素 | 拆分裁定 |
| 3 | `unlocks` 字段是否驱动解锁逻辑 | MVP 无逻辑消费，仅文档性（供 2/3 期补齐僵尸类型时对齐 spec §5.1 的「新解锁」列） | 拆分裁定 |
| 4 | `knockbackResist` 取值范围 | ∈ [0,1)；=1 表示完全免疫击退，故禁用（单测断言 `>= 0 && < 1`）。坦克 0.8 对应 spec §4.4「击退抗性 80%」 | 拆分裁定 |
| 5 | `MAX_ZOMBIE_R` 是配置输入还是派生值 | 供查询半径用的派生常量 = 所有僵尸 `radius` 的最大值（当前 = 坦克 24）；combat 用 `4 + MAX_ZOMBIE_R` 做网格查询半径保证不漏（见 `05-combat-systems.md`） | 拆分裁定 |
| 6 | `getTierConfig` 返回值能否修改 | 档 1–8 返回 `DIFFICULTY_TIERS[t-1]` 元素引用（非拷贝），档 9+ 每次调用返回新建对象；返回值必须视为只读——修改档 ≤8 的返回值会污染全局难度表 | 源文隐含·本次明示 |
| 7 | `GRACE_PERIOD` / `MAX_ZOMBIES` 为何定义在本模块 | 两者在 difficulty.js 仅定义、无本地逻辑消费，本 Task 测试亦不覆盖；消费方为 `05-combat-systems.md` Task 11（spawner 的新手保护爬升与同屏上限停刷） | 源文隐含·本次明示 |
| 8 | `pierce` / `aoe` 字段在 MVP 是否生效 | MVP 三武器均恒为 0，字段仅为 schema 完整性保留（爆炸/穿透类武器属后续期，G§7.5、spec §4.2）；combat.js（Task 10）的 pierce 分支因恒 0 不会触发 | 源文隐含·本次明示 |
| 9 | `getTier` / `getTierConfig` 的入参范围 | 约定 `timeSec >= 0`（游戏内时间恒非负）；负值无守卫、行为未定义，实现方无需补守卫 | 源文隐含·本次明示 |
| 10 | `DIFFICULTY_TIERS.length` 与 `STAT_CAP_TIER` 的关系 | 语义独立的两个常量，当前恰好同为 8：查表边界用 `DIFFICULTY_TIERS.length`（表内档直接返回元素），封顶基准用 `STAT_CAP_TIER`（取下标 `STAT_CAP_TIER - 1` 派生 9+ 档）；不得把二者混用或「修复」为同一常量 | 源文隐含·本次明示 |
