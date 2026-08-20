# 冒险关卡 · 双图鉴 · 双货币数值管线 · 视觉/UI 翻新 设计文档

日期：2026-08-19（2026-08-20 审查修订）
状态：已与用户逐节确认（设计 ①~⑥ 全部通过）；2026-08-20 经审查修订，新增 4 项裁定与若干规则补全（见 §0.2 修订记录）

## 0. 背景与目标

### 0.1 演进关系与术语约定（重要）

本文档是在**现有代码基础上的演进设计**，目前处于设计阶段、尚未实施；现有代码是上一版设计的完整实现。约定：

- **"现状/现行"** = 当前代码的实际行为（附文件出处）；**"本设计/目标"** = 本文档描述的改造结果。
- 凡本设计与现状不一致处均为**有意变更**，各节以"现状 → 目标"写明；实现者按目标实现，并按 §11.3 同步改写受影响的存量测试。
- 文中公式与数值均为目标值；引用现状数值仅作对照。

### 0.2 修订记录（2026-08-20）

审查后修订，新增 4 项用户裁定：

1. 武器局内伤害乘区 = **线性 `1 + 0.25×购买次数`，明确取代现行复利 `1.25^n`**（现状 `entities/weapon.js`，满 8 维 ≈×5.96；目标 ×3.0，有意的平衡收紧）。
2. 怪物图鉴解锁时机 = **首次击杀**（`meta.bestiaryKills[id] ≥ 1`），统一 §0 与 §7 口径。
3. 冒险局内**保留商店与银币强化**，但**移除"提前进档"条目**（其快进 `scene.time` 的实现会破坏 360s 纯时间推进结构）。
4. 自爆僵尸**只有引信燃尽才爆炸**；引信中或未触发引信时被击杀 = 普通死亡（正常掉落与计数，无 AoE）。

另补全：behavior 钩子 ctx 定义、档间切换与出局路径、meta 结构与版本策略、round5 定义与复用、取整规则、渲染器归属（`entities/render.js`）、存量测试处置清单、性能红线量化等，分散在各节。

追加修订（2026-08-20，二次），另落 7 项裁定/变更：

1. Boss coin 口径：`special` 只豁免 hp/speed/damage 的关卡倍率与局内增长；**coin 不豁免**，仍按 `Math.round(base.coin × min(4, 1 + 0.25 × (tier - 1)))` 档位递增，tier 取生成时刻档位（§2.1、§4.1、§11.1）。
2. behavior 契约改写：ctx 改为动作回调型 `{ player, deployables, damagePlayer(dmg), spawnRing(x, y, r), rng }`；AoE 伤害与接触 damage 同乘区，生成时刻经 scaling 管线冻结到 `z.aoe.damage`；`onSpawn`/`onHit` 为本期预留钩子、不接线（§4.2）。
3. 自爆僵尸补 `EXPLODER_TRIGGER_R = 50px`（本期新定数值、已确认）；引信目标语义与现行僵尸 AI 一致——250px 内最近存活部署物优先，否则以玩家为目标，按"当前 AI 目标"距离判定（§4.3）。
4. HUD 换肤落为允许修改 `src/systems/hud.js` 中 `renderHud` 颜色常量、布局/位置常量不动；点明 DOM/CSS 无法给 canvas HUD 换肤（§8）。
5. 性能红线验收改可判定：dev 菜单新增 FPS/平均帧时显示与"压测"按钮（400 怪 + 400 弹道），标准 = 连续 5s 平均帧时 ≤20ms（≥50fps）（§9.3、§10）。
6. 武器局外升级价曲线测试归 `test/bestiary.test.js`（与武器图鉴数据同文件），§11.1 原 `upgrades.test.js` 表述同步修正。
7. boss 图鉴条目"恢复后自动出现"登记实现：`playableMonsters({ includeSpecial = false })`；本期 `includeSpecial` 恒为 `false`，boss 恒不显示，数据与击杀统计始终保留（§4.1、§7、§13）。

### 0.3 需求对应

| # | 需求 | 对应章节 |
|---|------|---------|
| 0 | 新增冒险关卡，一局四档难度阶梯 | §3 |
| 1 | 怪物图鉴（开发可新增种类：换皮换数值/新机制） | §4 |
| 2 | 怪物数值 = 局外基础（图鉴×关卡成长）× 局内时间百分比 | §2 |
| 3 | 武器图鉴（开发可新增种类） | §5 |
| 4 | 新资源金币，用于提升武器局外基础伤害 | §6 |
| 5 | 武器伤害 = 局外基础（金币升级）× 局内百分比（银币） | §2、§6 |
| 6 | 子弹特效/怪物造型参考 Infinitode 2 | §9 |
| 7 | 游戏内建模与 UI 优化 | §8、§9 |

### 0.4 已确认的关键决策（逐题确认记录）

- 冒险为**第 4 个独立入口**，旧模式代码保留；主菜单最终入口：**冒险 / 无尽 / 图鉴 / 武器升级**（坚守 10/20 分钟从菜单移除，代码不删，可随时恢复；开发者菜单提供调试入口，见 §10）
- 冒险一局 = **4 档 × 90s = 6 分钟，纯时间推进，撑到底即通关**，无强制 Boss；首批 **3 关**，曲线按可无限追加设计
- 图鉴为**完整图鉴系统**：游戏内查看界面 + **首次击杀解锁** + 击杀统计 + 数值详情
- 怪物新数值公式**应用到全部模式**（旧模式映射为"关卡 1"，重调平衡；与旧表的差异说明见 §2.1）
- 金币获取：**通关奖励为主（首通 ×2）+ 失败保底 + 开发者菜单**；用途**仅限武器局外升级**，经济系统预留其他消耗口
- 局内商店强化：**只改伤害维**为线性百分比制（取代现行复利，见 §2.2），攻速/弹道/范围/专属维维持现状
- 视觉：**Infinitode 2 几何矢量风**，纯 Canvas 2D 绘制，不引图片资源
- UI **全面翻新**（含现有 HUD/商店/暂停/结算统一重排）
- 本次新增怪/武器**各 1 种**验证图鉴扩展性：自爆僵尸（新机制挂钩）、狙击枪（纯数值）
- 架构方案 A：**数据注册表 + 行为注册表分离**

## 1. 总体架构

```
src/config/bestiary/monsters.js   怪物图鉴（迁移现有 4 种 normal/fast/tank/boss + 自爆僵尸 exploder），替代 config/zombies.js
src/config/bestiary/weapons.js    武器图鉴（迁移现有 6 种 + 狙击枪 sniperRifle），替代 config/weapons.js
src/config/adventure.js           冒险关卡表（关卡定义、四档配置、金币奖励）
src/systems/behaviors.js          怪物行为注册表：behavior id → { onSpawn, onUpdate, onHit, onDeath } 钩子
src/systems/scaling.js            统一数值管线（纯函数，全模式共用）
src/core/meta.js                  局外存档层：金币、武器等级、关卡进度、图鉴击杀统计（localStorage key 'zs_meta'）
src/entities/render.js            几何矢量渲染器（新增）：形状注册表（shape id → 绘制函数）+ 怪物/子弹绘制
src/ui/levels.js                  关卡选择界面
src/ui/bestiary.js                图鉴界面（怪物/武器两标签页）
src/ui/upgrades.js                武器升级界面（金币）
```

改造原则（现状 → 目标）：

- 旧 `config/zombies.js`、`config/weapons.js` 删除，全部引用改道图鉴模块。现状引用点：`spawner.js`、`combat.js`、`zombie.js`、`weapon.js`、`hud.js`、`shop.js`、`ui/shop.js`、`economy.js`（`import { WEAPON_BASE_PRICE } from './weapons.js'` 并转导出），以及 6+ 个存量测试（处置见 §11.3）
- **绘制抽离**：现状怪物/子弹/特效绘制内联在 `game.js` 主循环（约 568–656 行），`entities/zombie.js`、`projectile.js` 为纯逻辑模块。目标：绘制抽离到新文件 `entities/render.js`（形状注册表所在），实体文件保持纯逻辑；`entities/effects.js` 保持逻辑并新建粒子对象池（现状粒子/特效/浮动数字为普通数组未池化，`core/pool.js` 目前仅用于弹道）
- `systems/spawner.js`、`systems/combat.js` 只接数值管线新接口
- 商店伤害维改动集中在 `systems/shop.js` / `ui/shop.js` 与 `config/economy.js`
- `config/economy.js` 的私有 `round5`（`Math.round(x/5)*5`，四舍五入到 5 的倍数）改为导出，金币升级价与冒险奖励复用同一函数
- `core/meta.js` 复用 `core/storage.js` 的 `typeof localStorage` + try/catch 守卫模式（保证 `node --test` 下不炸），但不并入 storage.js——meta 是独立演进的局外线，与 `zs_best`/`zs_settings` 互不读写

## 2. 统一数值管线（scaling.js）

纯函数，无 DOM 依赖，全模式共用。

### 2.1 怪物数值

```
hp     = 图鉴基础hp     × 关卡倍率 × (1 + 局内分钟 × hp增长率)
damage = 图鉴基础damage × 关卡倍率 × (1 + 局内分钟 × damage增长率)
speed  = 图鉴基础speed  × 关卡speed倍率 × (1 + 局内分钟 × speed增长率)
coin   = Math.round(图鉴基础coin × min(4, 1 + 0.25 × (档位 - 1)))   // 沿用现行递增，档位口径见下
```

- **关卡倍率**（局外，随冒险关卡数递增）：
  - hp / damage：`× (1 + 0.6 × (关卡数 - 1))` → 关 1 ×1.0、关 2 ×1.6、关 3 ×2.2
  - speed：`× (1 + 0.05 × (关卡数 - 1))`，移速只微涨，避免手感突变
  - 无尽/坚守模式映射为"关卡 1"，关卡倍率恒 1
  - 关卡倍率**只作用于 hp/damage/speed**；`coin`、`knockbackResist`、`cost` 不缩放（避免经济膨胀与刷怪预算口径漂移）
- **局内增长率**（局内，随游戏时间连续递增，替代旧阶梯 hpMult/speedMult）：

| 参数 | 无尽/坚守 | 冒险 | 说明 |
|------|----------|------|------|
| hp 增长率 | +45%/分钟 | +35%/分钟 | 无尽 21 分钟时 ≈ ×10.45，以旧表第 8 档（×10）为锚；冒险通关时 ≈ ×3.1 |
| damage 增长率 | +22.5%/分钟 | +17.5%/分钟 | hp 率的一半 |
| speed 增长率 | +2%/分钟 | +1.5%/分钟 | 固定小率 |

- **与旧表的差异（有意为之，不再表述为"平滑衔接"）**：旧表 hpMult 为档内常数、档间跳变；新公式连续增长，0–21 分钟全程高于旧表（如 15 分钟 ×7.75 vs 旧 ×6，21 分钟前约为旧表的 1.25–1.6 倍），21 分钟后旧表封顶 ×10、新公式不再封顶。旧无尽/坚守因此整体变难，属 §0"重调平衡"范围，验收见 §11.4。
- **damage 缩放适用范围**：现行 `z.damage` 同时驱动对玩家接触伤害与对部署物（围墙/炮台）啃食（`entities/zombie.js`）；本设计两处同乘区——缩放后 damage 一处计算、两处使用。自爆 AoE 同（§4.3）。注：现行 damage 不随时间缩放，本设计是新增难度变量，已计入上表增长率。
- **档位口径**：无尽/坚守档 = 180s（现行 `TIER_DURATION`），冒险档 = 90s；coin 公式中的"档位"按当前模式自己的档位序号计算。
- **取整规则**：hp/damage/speed 计算保留浮点（与现行一致），界面展示四舍五入；coin 用 `Math.round`。
- 旧 `DIFFICULTY_TIERS` 的 `hpMult`/`speedMult` 字段退役；`budgetPerSec`/`weights` 保留（刷怪节奏仍由难度表控制）。**`unlocks` 字段一并退役**——现状它零读取（全库无消费，属死字段）；"某档起出现某怪"的语义 = 直接把怪写进该档 `weights`。
- 银币掉落递增逻辑（现注释于 `entities/zombie.js` 顶部）移入管线统一出口。

接口（示意）：

```js
calcMonsterStats(baseStats, { level, tier, timeSec, mode })
  → { hp, speed, damage, coin, aoeDamage }   // hp/speed/damage 浮点，coin 已 Math.round；level=冒险关卡序号，tier=当前档位（coin 用）
getModeScaling(modeId) → { hpRatePerMin, dmgRatePerMin, speedRatePerMin }
```

**Boss 例外**：boss 条目（`special: true`）只豁免 hp/speed/damage 的关卡倍率与局内增长——这三项沿用图鉴基础值（仅由坚守 `bossAt` 注入）；**coin 不豁免**，仍按上表 `Math.round(图鉴基础coin × min(4, 1 + 0.25 × (档位 - 1)))` 递增，档位取生成时刻的档位。见 §4.1。

### 2.2 武器数值

```
最终伤害 = 图鉴基础damage × (1 + 0.2 × 局外等级) × (1 + 0.25 × 局内购买次数)
```

- **局外乘区**（金币升级）：每把武器独立 0–10 级，每级 +20% 图鉴基础伤害（线性，非复利；0→10 共 10 次购买升满）
- **局内乘区**（银币强化）：商店伤害条目每购一次 +25% 图鉴基础，**线性 `1 + 0.25n`，明确取代现行复利 `damage × 1.25^n`**（现状 `entities/weapon.js`，满 8 维 ≈×5.96 → 目标 ×3.0，有意的平衡收紧；相关存量断言改写见 §11.3）；换武器时重置（与现规则一致：换枪 createWeapon 新实例、强化清零）
- 攻速/弹道/范围/专属维（榴弹碎片、磁电链路）维持现行固定值强化逻辑不变

## 3. 冒险关卡模式

### 3.1 结构

- 一局 = 4 档 × 90s = 360s；纯时间推进，撑满即通关，中途死亡即失败；无直升机撤离
- **出局路径**：存活至 360s → 通关（新增判定路径；现行只有死亡 / 直升机撤离两条）；死亡 → 失败；**暂停菜单主动退出按失败处理**，正常走结算并发失败保底（现行 `onQuit` 直接回菜单不结算，冒险模式改道）
- **局内经济**：银币掉落与商店（强化/道具/部署物/辅助武器）与无尽模式一致；**移除商店"提前进档"条目**（现行实现会把 `scene.time` 快进到下一档起点，在 360s 固定时长结构里等于花钱跳关）
- **档间切换**：每档权重/预算按当前时刻即时生效（与 spawner 现行 `cfgFn(time)` 机制一致）；场上已生成的怪保留生成时数值，不清场；冒险切档**不刷环形包围潮**（包围潮为坚守 surgeFrom 机制，留在旧模式）
- 通关第 N 关解锁第 N+1 关；初始仅第 1 关解锁。解锁与首通标记在通关结算时写入 meta
- 关卡选择页显示：名称、解锁状态（锁定显示 ???）、最佳成绩（每关 `{ cleared, timeSec }`，通关后 cleared=true、timeSec=360）

### 3.2 关卡配置表（config/adventure.js）

每关：`{ id, name, tiers: [4 × { duration: 90, budgetPerSec, weights }], goldReward }`

（结构不含 `unlocks` 字段——它在现行难度表中零读取，已随 §2.1 退役；怪物出现门控 = `weights`）

**关 1「城郊」**（goldReward: 100）

| 档 | 预算/秒 | 权重 |
|----|--------|------|
| 1 | 3 | 普通 100% |
| 2 | 4.5 | 普通 70% / 高速 30% |
| 3 | 7 | 普通 60% / 高速 40% |
| 4 | 9 | 普通 50% / 高速 30% / 坦克 20% |

**关 2「市区」**（goldReward: 160）

| 档 | 预算/秒 | 权重 |
|----|--------|------|
| 1 | 4 | 普通 80% / 高速 20% |
| 2 | 6 | 普通 60% / 高速 40% |
| 3 | 8.5 | 普通 50% / 高速 30% / 坦克 20% |
| 4 | 11 | 普通 40% / 高速 35% / 坦克 25% |

**关 3「巢穴」**（goldReward: 240）

| 档 | 预算/秒 | 权重 |
|----|--------|------|
| 1 | 5 | 普通 70% / 高速 30% |
| 2 | 7.5 | 普通 50% / 高速 35% / 坦克 15% |
| 3 | 10 | 普通 40% / 高速 35% / 坦克 25% |
| 4 | 13 | 普通 30% / 高速 30% / 坦克 25% / 自爆 15% |

### 3.3 跨关递进（三个杠杆同时加）

1. **种类组合更激进**：高关卡更早混入高速/坦克，关 3 档 4 引入自爆僵尸
2. **刷怪预算**：上表数值已含跨关递增（同档位对比关 1→3 约 ×1.5）
3. **怪物数值**：走 §2.1 关卡倍率（hp/伤害关 2 ×1.6、关 3 ×2.2）

### 3.4 金币奖励

- 通关：`goldReward`；**首通 ×2**（meta 存档记录首通标记）
- 失败保底（死亡与主动退出都算）：`round5(goldReward × (存活秒数 / 360) × 50%)`；`round5` = 四舍五入到 5 的倍数，复用 `config/economy.js` 导出（例：关 1 存活 180s 失败 = round5(100 × 0.5 × 0.5) = 25）
- 结算页展示：胜/负、存活时间、击杀数、本局金币（含首通标记）；按钮三个：**重开本关 / 回关卡选择 / 回主菜单**（现行结算仅"再来一局 / 回主菜单"两回调，`onGameOver` 接线需扩展）
- **产出/消耗对账**（平衡参考，goldReward 维持已确认值）：三关首通合计 1000，之后每满通关 100–240；单武器升满 4540 ≈ 三关首通 + 约 14–35 局满通关；7 把武器全升满 ≈ 3.2 万金币，定位为长线目标。后续若需加快节奏，优先调 goldReward，不动升级价曲线。

## 4. 怪物图鉴（config/bestiary/monsters.js）

### 4.1 数据结构

```js
normal: {
  id: 'normal', name: '普通僵尸', desc: '图鉴描述文本',
  // —— 基础数值（现有字段原样迁移）——
  hp: 30, speed: 70, damage: 8, coin: 1,
  radius: 14, knockbackResist: 0, cost: 1,
  // —— 图鉴新增 ——
  visual: { shape: 'circle', color: '#6a8f6a', glow: 0.3 },  // 渲染描述，见 §9
  behavior: null,   // null = 默认追击 AI；否则为 behaviors.js 的注册 id
  // aoe: { damage, radius }   // 可选，仅 AoE 怪（自爆）
  // special: true             // 可选，仅 boss，见下
}
```

**完整清单 5 条**：normal / fast / tank / boss / exploder。字段契约：`id / name / desc / hp / speed / damage / coin / radius / knockbackResist / cost / visual / behavior` 必填；`aoe`、`special` 可选。

**boss 特殊条目**（`special: true`）：不进任何 `weights`（仅由坚守 `bossAt` 注入，现行 cost 999 同理保留）；不走 hp/speed/damage 的关卡倍率与局内增长（§2.1 例外，这三项沿用基础值；coin 仍按档位递增）；坚守从菜单隐藏期间**图鉴界面不显示该条目**（数据与击杀统计保留）。实现方式：`playableMonsters({ includeSpecial = false })` 默认排除 `special` 条目，图鉴界面本期恒以默认值调用（即 boss 恒不显示）；恢复坚守入口后改传 `includeSpecial: true` 即可自动重新出现，数据与击杀统计始终保留。

### 4.2 行为注册表（systems/behaviors.js）

```js
export const BEHAVIORS = {
  exploder: {
    onUpdate(z, dt, ctx) { /* 接近目标开始 1.2s 引信，闪烁膨胀；引信燃尽置 z.fuseDone 并触发死亡 */ },
    onDeath(z, ctx)      { /* 仅当 z.fuseDone 时执行自爆 AoE；否则按普通死亡返回 */ },
  },
};
```

- 钩子命名约定：`onSpawn / onUpdate / onHit / onDeath`，签名统一 `(z, dt?, ctx)`；`behavior: null` 时全部跳过
- **ctx = `{ player, deployables, damagePlayer(dmg), spawnRing(x, y, r), rng }`**：
  - `player` 玩家实体（位置/半径等，供距离判定与受伤结算）
  - `deployables` 存活部署物数组（围墙/炮台，供目标选择与 AoE 结算）
  - `damagePlayer(dmg)` 对玩家结算伤害（内部走玩家受伤、震屏、音效与出局判定）
  - `spawnRing(x, y, r)` 生成 AoE 冲击波圆环特效
  - `rng` 随机数生成器（钩子内需要随机时使用）
- **AoE 缩放口径**：AoE 伤害与接触 damage 同乘区，在生成时刻经 scaling 管线冻结在实体上（`z.aoe.damage`），`onDeath` 直接读取
- **调用点**：`onUpdate` 在 updateZombie 移动之后；`onDeath` 在 killZombie（`z.alive = false`）时；**`onSpawn` / `onHit` 为本期预留钩子、不接线**，接线点留待首个需要它们的机制怪
- **新增种类的方式**（开发向，写进文件头注释）：
  - 换皮换数值：图鉴加一条数据即可，`behavior: null`
  - 新机制：在 behaviors.js 注册行为模块 + 图鉴条目声明 `behavior` 字段

### 4.3 新怪：自爆僵尸（exploder）

`{ hp: 40, speed: 90, damage: 5（接触）, coin: 3, radius: 13, cost: 2, knockbackResist: 0, behavior: 'exploder', aoe: { damage: 30, radius: 80 }, visual: { shape: 'diamond', color: 橙 } }`

- **引信规则**：接近其当前 AI 目标触发 1.2s 引信，期间闪烁膨胀；**只有引信燃尽才爆炸**（`z.fuseDone`）；引信中或未触发引信时被击杀 = 普通死亡（正常掉落银币、计入图鉴击杀数、无 AoE）——实现上 `onDeath` 检查 `z.fuseDone`
- **触发距离**：`EXPLODER_TRIGGER_R = 50px`（本期新定数值、已确认）；判定为距当前 AI 目标中心 ≤ `EXPLODER_TRIGGER_R + z.r`
- **引信目标语义**：与现行僵尸 AI 一致——250px 内最近的存活部署物优先，否则以玩家为目标；**按"当前 AI 目标"的距离判定是否点燃引信**（不是"对玩家/所有部署物各算距离取最近"）
- **AoE 结算**：半径 80、基伤 30，对玩家与部署物（围墙/炮台）生效；该模式无部署物时仅对玩家。AoE 与接触 damage 同乘区：`30 × 关卡倍率 × (1 + 局内分钟 × damage增长率)`，经 §2.1 管线计算
- **出现位置**：冒险关 3 档 4（weights 15%）；无尽模式档 5 起直接写入 `weights`：档 5–7 `{ normal: 0.35, fast: 0.3, tank: 0.25, exploder: 0.1 }`，档 8 `{ normal: 0.3, fast: 0.3, tank: 0.25, exploder: 0.15 }`

## 5. 武器图鉴（config/bestiary/weapons.js）

- 现有 6 种武器字段原样迁移，新增 `desc`、`basePrice`（商店基价并入条目，消除独立价格表）与 `visual`（子弹视觉描述：`{ bulletShape, color, trail, hitParticles, muzzleGlow }`）
- **必填字段契约**（缺字段会在发射/弹道计算产生静默 NaN，bestiary.test.js 校验）：`id / name / desc / damage / fireRate / projectileSpeed / range / projectiles / spread / pierce / aoe / arc / chain / knockback / burst / burstInterval / basePrice / visual`
- **basePrice 的消费者** = 商店换枪价：`round5(basePrice × 1.4^全局换枪次数)`——沿用 `economy.js` 的 `weaponPrice`，只是 base 来源从 `WEAPON_BASE_PRICE` 表改为条目字段；`WEAPON_BASE_PRICE` 表删除，`economy.js` 的转导出同步移除，商店枚举源改走图鉴注册表
- 专属强化维（SPECIAL_STATS）一并迁入图鉴模块。**边界说明**：SPECIAL_STATS 只控制商店展示哪些强化条目；专属行为（榴弹碎片、磁电链路）的实际逻辑是 `weapon.js` 的 `weaponStats()` / `fire()` 里的硬编码分支
- **新武器：狙击枪（id: sniperRifle）**——纯数值条目验证零代码新增。id 不用 `sniper`：现行辅助武器已占用 `AUX_PRICES.sniper`（economy.js，价格 120），避免同名冲突
  `{ damage: 60, fireRate: 0.5, projectileSpeed: 1200, range: 600, pierce: 5, knockback: 200, projectiles: 1, spread: 0, aoe: 0, arc: false, chain: 0, burst: 1, burstInterval: 0, basePrice: 200 }`（pierce 现行无上限逻辑，combat 逐发结算，零代码可用；knockback 200 与现行 AoE 击退同量级）
- 新增武器方式：**纯数值武器** = 图鉴加一条数据即可在商店/图鉴界面出现；**带专属维的武器** = 另需在 `weapon.js` 的 `weaponStats()` / `fire()` 加分支

## 6. 金币经济与武器局外升级

### 6.1 金币

- 来源：冒险通关奖励（首通 ×2）、失败保底、开发者菜单（+1000）
- 存储：`core/meta.js`，localStorage key `'zs_meta'`，带版本号（见 §10）
- 用途：仅武器局外升级；经济函数保持通用签名（`meta.spendGold(n)`），预留其他消耗口
- 取整：复用 `config/economy.js` 导出的 `round5`（四舍五入到 5 的倍数）

### 6.2 武器升级（局外）

- 每把武器独立 0–10 级；每级伤害 +20% 图鉴基础（线性，见 §2.2 公式）
- 升级价：`round5(40 × 1.5^当前等级)` 金币；从 0 升满 10 级共 10 次购买，累计 **4540** 金币（40+60+90+135+205+305+455+685+1025+1540）
- 升级界面（ui/upgrades.js）：武器列表展示当前等级、下一级提升幅度、价格；金币余额常驻；不够时按钮置灰

## 7. 图鉴界面（ui/bestiary.js）

- 主菜单「图鉴」入口，内分「怪物」「武器」两个标签页
- **怪物页**：网格陈列 `playableMonsters({ includeSpecial: false })` 得到的当前可达种类（本期 `includeSpecial` 恒为 `false`，故坚守隐藏期间不含 boss，见 §4.1）；未解锁的显示**统一样式的 ??? 占位卡**（不画形状剪影，避免泄露造型与种类构成）；**首次击杀后解锁**（`meta.bestiaryKills[id] ≥ 1`）形象与名称；条目详情 = 基础数值 + 描述 + 累计击杀数（`meta.bestiaryKills` 持久化，击杀时计数）
- **数值口径**：图鉴展示的是图鉴基础值（关卡 1、局内 0 分钟口径），界面注明"局内实际值随关卡与时间增长"，避免玩家与局内数字对不上时困惑
- **武器页**：全部可见；条目 = 描述 + 基础数值 + 当前局外等级与下一级提升幅度（与升级界面读同一 `meta.weaponLevels`，数据同源；不做跨界面联动高亮）

## 8. UI 全面翻新

- **统一视觉语言**：深色底 + 霓虹几何描边面板，与怪物/子弹的几何矢量风一致；统一按钮、面板、间距、字号规范，`style.css` 重建
- **主菜单四入口**：冒险 / 无尽 / 图鉴 / 武器升级（坚守 10/20 分钟从菜单移除，代码与 `MODES` 配置保留）
- **新界面**：关卡选择（卡片式）、武器升级、图鉴（§7）
- **现有界面**：
  - HUD：**旧模式（无尽/坚守）仅换肤、布局不变**——换肤落为允许修改 `src/systems/hud.js` 中 `renderHud` 的颜色常量，布局/位置常量不动（canvas HUD 无法靠 DOM/CSS 换肤，须改绘制代码中的颜色常量）；冒险模式顶部加四档进度条（当前档高亮 + 档内进度），总计时保留（正计时 0→360s）；金币是局外货币，不进局内 HUD
  - 商店、暂停、结算：套用新风格；**冒险商店无"提前进档"条目**（§3.1）；冒险结算三按钮（§3.4）
  - 结构重排涉及 `shop-ui.test.js` 等 DOM 断言，随 §11.3 同步更新
- 坚守 10/20 从菜单移除后，由开发者菜单提供"启动坚守 10/20"调试入口（§10），保证旧模式与守门 Boss 可回归验证

## 9. 视觉方向（Infinitode 2 几何矢量风）

纯 Canvas 2D 绘制，不引图片资源。

### 9.1 怪物造型

| 怪 | 形状 | 主色 |
|----|------|------|
| 普通 | 圆形 | 墨绿 |
| 高速 | 三角形 | 黄 |
| 坦克 | 六边形 | 红褐 |
| Boss | 大五边形 | 暗红 |
| 自爆 | 菱形（引信期闪烁膨胀） | 橙 |

- 统一细节：发光描边、受击闪白、受伤后才显示的血条、死亡碎裂粒子。**现状提示**：受击闪白（`zombie.js` 的 hitFlash + `game.js` 白色覆盖）、受伤后血条（`game.js` 的 `hp < maxHp` 判定）、死亡粒子（`killZombie` 的 spawnParticles）现行均已实现，本次是迁移重画成几何矢量风，不是新建机制
- 形状画法注册在 **`entities/render.js`**（`shape id → 绘制函数`；绘制从 `game.js` 主循环抽离到该新文件），新怪加形状 = 注册一个多边形画法 + 图鉴 `visual.shape` 引用

### 9.2 子弹特效（每武器独特弹道语言）

- 弹体为发光几何体：手枪小圆点 / 步枪长条弹 / 机枪短点散射 / 火箭·榴弹带尾焰多边形 / 磁电枪链状电弧 / 狙击细长光针
- 发光拖尾（additive 渐隐轨迹）+ 命中粒子喷溅 + AoE 冲击波圆环 + 枪口闪光
- 参数全部来自武器图鉴 `visual` 字段；`entities/effects.js` **新建粒子对象池**（复用 `core/pool.js`；现状粒子/特效/浮动数字为普通数组、未池化）

### 9.3 性能红线（量化指标）

- **指标**：同屏 400 怪（现行 `MAX_ZOMBIES`）+ 满屏弹道（现行 `MAX_PROJECTILES = 400`），压测场景下连续 5s 平均帧时 ≤20ms（≥50fps）
- **手段**：粒子全局上限沿用 `MAX_PARTICLES = 500`（实测可下调）；拖尾用定长线段数组（每弹 ≤ 8 点，环形复用）；禁止每帧对象分配（粒子池复用 `core/pool.js`）
- **验收**：开发者菜单新增 FPS/平均帧时显示与"压测"按钮（一键填满至 400 怪 + 400 弹道的场景）；验收标准 = 该压测场景下连续 5s 平均帧时 ≤20ms（≥50fps），见 §11.2

## 10. 存档与开发者菜单

- `core/meta.js`，localStorage key = **`'zs_meta'`**（不动现有 `zs_best` / `zs_settings`）；读写复用 `storage.js` 同款 `typeof localStorage` + try/catch 守卫（Node 测试安全）
- 结构定稿：

```js
{ version: 1,
  gold: 0,
  weaponLevels: { [weaponId]: 0 },                    // 0–10
  adventure: { unlocked: 1,                           // 已解锁最高关卡序号
               firstClear: { [levelId]: true },
               bestTimes: { [levelId]: { cleared: false, timeSec: 0 } } },
  bestiaryKills: { [monsterId]: 0 } }
```

- **版本与迁移**：本期为首版（version 1），无旧数据可迁移；load 时 version 缺失或不等于当前版本 → 逐项校验、坏字段回退默认（同 `storage.js` 的 normalizeSettings 模式）。后续版本升级时在 meta.js 内加迁移映射表。`meta.test.js` 对应测：读写往返、坏数据回退、版本不符回退、金币收支
- 击杀统计：`killZombie` 处按 type 计数写入 `meta.bestiaryKills`（含开发者菜单放置的怪）
- 开发者菜单（` 键）现有：+100/+1000 银币（局内 `scene.coins`）、放置 4 种怪。新增：
  - **+1000 金币**（局外，新回调 `onGold` → `meta.gold`；与局内银币 `onCoins` 区分，不复用）
  - **解锁全部关卡**（写 `meta.adventure.unlocked = 3`）
  - **启动坚守 10/20**（调试入口，不经主菜单；保证隐藏期间旧模式可验证）
  - **FPS/平均帧时显示**（实时帧率 + 滑动平均帧时，压测验收用，见 §9.3）
  - **压测按钮**（一键填满至 400 怪 + 400 弹道的压测场景，配合 FPS/平均帧时显示执行 §9.3 验收）

## 11. 测试策略

沿用 `node --test`。

### 11.1 新增测试

- `scaling.test.js`：怪物/武器数值公式、各模式增长率、关卡倍率、coin 递增与取整、局内伤害乘区线性叠加（1 + 0.25n，`weaponDamage` 纯函数口径；`weaponStats` 双乘区集成断言归 `weapon.test.js`，见 §11.3）、Boss 例外（hp/speed/damage 不缩放，coin 仍档位递增）
- `bestiary.test.js`：图鉴数据完整性（§4.1/§5 必填字段契约、behavior 引用有效、`visual.shape` 已在 render.js 注册表注册——只断言注册表键存在，不测绘制）、武器局外升级价曲线（累计 4540）
- `adventure.test.js`：关卡配置表结构（每关 4 档 × 90s、weights 引用合法怪物 id）、奖励计算（首通 ×2、失败保底、round5 边界）
- `meta.test.js`：存档读写往返、坏数据回退、版本不符回退、金币收支
- `behaviors.test.js`：exploder 钩子（引信计时 → fuseDone 自爆 AoE；引信中被击杀不爆；AoE 数值走管线）

### 11.2 界面与整合

- 冒险 HUD 四档进度条逻辑（当前档/档内进度计算）、关卡解锁状态流转
- 视觉与 UI：手动验收（性能红线场景见 §9.3）

### 11.3 存量测试处置（随删除 config/zombies.js / config/weapons.js 同步改写）

- `config.test.js`：WEAPONS/ZOMBIES 引用改道图鉴模块；删除 `hpMult`/`speedMult` 断言，改断言保留字段（`budgetPerSec`/`weights`）与 getTierConfig 封顶行为
- `spawner.test.js` / `zombie.test.js` / `weapon.test.js` / `shop.test.js` / `economy.test.js`：import 改道图鉴；`weapon.test.js` 武器数量断言 6 → 7、伤害强化断言 `1.25^n` → `1 + 0.25n`；`economy.test.js` 删除 `WEAPON_BASE_PRICE` 断言（改断言图鉴 `basePrice`）
- `combat.test.js` / `teslaball.test.js`：`createZombie` 不再透传 `hpMult`/`speedMult`，改按管线式构造
- `shop-ui.test.js`：商店结构重排后更新 DOM 断言；冒险商店无"提前进档"分组
- `hud.test.js`：补四档进度条用例

### 11.4 旧模式平衡验收（手动）

- 无尽 21 分钟终点强度 ≈ 旧版第 8 档（×10）；0–21 分钟整体难于旧版为有意（§2.1），手动跑无尽 10/20 分钟确认无失控点；坚守经开发者菜单入口回归验证

## 12. 实施与模型分配

- 实现计划由 writing-plans 技能产出，按模块切分任务
- **依赖顺序**（切分任务时遵守）：`meta.js` → `scaling.js` → 图鉴模块（monsters/weapons）→ `spawner`/`combat`/`weapon` 接管线 → 冒险模式 → 各 UI 界面；视觉（`render.js`/`effects.js`）与 UI 翻新同其他任务解耦，可并行
- 按用户要求：**§9 视觉（子弹特效/怪物造型）与 §8 UI 翻新（含 §10 开发者菜单）的实现子任务派 K3-256k 模型**；数值管线、图鉴、冒险模式、存档等用默认模型 **deepseek-v4-flash**

## 13. 非目标（本期不做）

- 坚守 10/20 分钟模式的删除（仅从菜单隐藏；开发者菜单保留调试入口）
- 金币的其他消耗口（预留，不实现）
- 图片/音频素材引入（纯 Canvas 绘制；现有音效不变）
- 怪物图鉴的"新机制"不止自爆一种（后续按 §4.2 方式追加）
- Boss 出场安排：守门 Boss 当前仅由坚守模式注入，坚守从菜单隐藏期间 Boss 在任何可达模式中不会出现；其图鉴条目与多边形造型正常保留（界面临时隐藏，见 §4.1；本期 `playableMonsters` 的 `includeSpecial` 恒为 `false`），后续可再安排 Boss 在冒险/无尽中出场
- 0–21 分钟与旧难度表的逐点对齐（连续增长曲线整体偏高为有意，验收见 §11.4）
- 触屏/移动端适配、存档跨设备迁移
