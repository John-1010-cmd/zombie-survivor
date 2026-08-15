# 迭代 03：武库扩展（分维强化 / 新武器 / 部署物 / 辅助武器）

> Spec：`../../../specs/2026-08-14-zombie-survivor-design.md` §0 迭代 03 条目
> 前置：迭代 02 已交付（143 用例全绿，提交 c33613b）
> 契约在本文钉死；数值均为最终裁定，实现不得偏离

## 全局约束

- 沿用全部工程约定（纯逻辑层禁 DOM、rng 注入、TDD、中文提交）
- game 形状扩展：`{coins, weapon, inventory, aux, turretEnhance, wallEnhance, weaponBought, tierRemaining}`（scene 同名字段暴露）

## 数值裁定（全部最终值）

### 0. 价格递增总规则（用户裁定，2026-08-15）

所有可重复购买商品按**自身购买次数**递增，互相独立：

| 商品类 | 计数粒度 | 公式 |
|---|---|---|
| 武器强化（四维） | 单维已购次数 | `enhancePrice(n)` = round5(40×1.5^n) |
| 更换武器 | **全局换枪次数**（用户裁定维持） | `weaponPrice(base, n)` = round5(base×1.4^n) |
| 辅助武器 | 该类型已购数量 | `weaponPrice(base, n)` = round5(base×1.4^n) |
| 辅助强化（per-type×4 维） | **单维已购次数** | `enhancePrice(n)` |
| 部署物强化（火炮四维/围墙耐久） | **单维已购次数** | `enhancePrice(n)` |
| 道具（5 种） | 该道具已购次数 | `itemPrice(base, n)` = round5(base×1.25^n) |

game 形状相应增加：`weaponBought`（数字，全局）、`itemBought`（{id: 次数}）、`turretEnhance`、`wallEnhance`、`aux`。

### 1. 分维强化（反馈 #1）

- `STAT_MAX = 8`：每维（damage/fireRate/projectiles/range）独立可购 **8 次**（0–8）
- `weapon.enhance = {damage:0, fireRate:0, projectiles:0, range:0}` 保留，`weapon.level` 字段**删除**
- `applyEnhancement(w, stat)`：`enhance[stat] >= 8` 时忽略；否则 `enhance[stat]++`
- 强化价格按**该维已购次数**计价：`enhancePrice(owned)` 不变（40×1.5^owned, round5）
- 满维下架：该维 `>= 8` 时该条目不产出于目录

### 2. 新武器（反馈 #4，基值含射程下调 #5）

| id | 名称 | 模式 | 数值 | 商店基价 |
|---|---|---|---|---|
| pistol | 手枪 | 单发直射 | 伤 12 / 射速 2.0 / 弹速 500 / **射程 420** | 40 |
| rifle | 步枪 | 3 连发 | 伤 9 / 射速 1.4 轮 / 弹速 600 / **射程 450** | 80 |
| mg | 机枪 | 散射 ±6° | 伤 5 / 射速 8 / 弹速 550 / **射程 400** | 80 |
| rocket | 火箭炮 | 直射爆炸 | 伤 30 / 射速 0.7 / 弹速 350 / **射程 480** / aoe 90 | 150 |
| grenade | 榴弹炮 | 抛射越障 AoE | 伤 25 / 射速 0.6 / 弹速 420 / **射程 440** / aoe 130 / `arc:true`（无视障碍） | 200 |
| tesla | 磁电枪 | 链电 | 伤 14 / 射速 1.2 / 弹速 800 / **射程 380** / `chain:3`（每跳 -20%） | 250 |

- **换枪价格递增**：`weaponPrice(base, weaponBought) = round5(base × 1.4^weaponBought)`；每次成功换枪 `weaponBought++`（初始 0，第一把 80×1.4=110？——否：**第一把按基价**，公式为 `round5(base × 1.4^(weaponBought))`，买后 weaponBought+1，即第 1 把=base、第 2 把=1.4×base…）
- 目录列出**全部非当前武器**（手枪可回购，基价 40）
- 射程圈可视化（反馈 #5）：render 中玩家脚下画当前 `stats.range` 半透明圆（`rgba(255,224,102,.08)` 描边 + 淡填充）

### 3. 部署物（反馈 #3）

- **固定火炮 turret**（键 4，价格 120）：部署于玩家当前位置（数字键消耗 1 个）；伤害 25 / 射速 0.5 / 弹速 350 / 射程 450 / aoe 80 / 耐久 200
- **围墙 wall**（键 5，价格 100）：以玩家为中心半径 120 的环形 **8 段**墙（每段独立圆碰撞 r=18），每段耐久 150
- 持久实体：不随波次消失，耐久归零摧毁；僵尸 250px 内优先啃部署物（每秒 8 点/只），否则追玩家
- 部署物强化（商店"道具强化"组，价格 `enhancePrice(该类已购强化总次数)`）：
  - 固定火炮：damage / fireRate / projectiles / range 四维，各自 8 级上限，`turretEnhance = {damage:0,fireRate:0,projectiles:0,range:0}`（作用于已部署与后续部署）
  - 围墙：仅"耐久"一维（每级每段耐久 +50%），`wallEnhance = {hp:0}`，8 级上限
- 数量上限：场上同时存在 固定火炮 ≤6、围墙组 ≤2

### 4. 辅助武器（反馈 #7）

| id | 名称 | 行为 | 基值 | 价格/把 | 上限 |
|---|---|---|---|---|---|
| drone | 随行无人机 | 环绕玩家（半径 90，角速 2rad/s） | 伤 6 / 射速 2 / 弹速 500 / 射程 300 | 60 | 3 |
| gunner | 随行移动火炮 | 跟随玩家身后 60px | 伤 15 / 射速 1 / 弹速 400 / 射程 400 / aoe 60 | 90 | 3 |
| sniper | 随行远程火炮 | 跟随玩家 100px | 伤 30 / 射速 0.4 / 弹速 700 / 射程 650 | 120 | 2 |

- 购买 = `aux.count[id]+1`（达上限后下架）；每把有独立 weapon 实例（createWeapon），共用 `updateWeapon` 攻击管线（owner = 载体坐标）
- 辅助强化（per-type 四维 damage/fireRate/projectiles/range，各自 8 级，`aux.enhance[id][stat]`）：价格 `enhancePrice(该 type 已购强化总次数)`，作用于该 type 全部载体
- `createAux() → {counts:{drone:0,gunner:0,sniper:0}, enhance:{drone:{damage:0,...},...}, bodies:[]}`；bodies 为载体运行时数组（由 game.js 维护）

### 5. 僵尸奖励递增（反馈 #6）

- `createZombie` 的 coin：`Math.round(c.coin × (1 + 0.25 × (tier-1)))`，倍率封顶 ×4（档 13 起）

### 6. 商店分组（反馈 #2）

`catalogFor(game, tierRemainingSec)` 返回**分组结构**：

```js
[
  { group: '武器强化', entries: [...] },      // enhance×4（per 维计价/满维下架）
  { group: '更换武器', entries: [...] },      // 全部非当前武器（价格递增）
  { group: '辅助武器', entries: [...] },      // drone/gunner/sniper（达上限下架）
  { group: '辅助强化', entries: [...] },      // per-type×4 维
  { group: '道具', entries: [...] },          // medkit/magnet/bomb/turret/wall + 道具强化（火炮四维/围墙耐久）
  { group: '风险', entries: [...] },          // earlyTier
]
```

## 文件与编队（并行，互不相交）

| 编队 | 文件 | 要点 |
|---|---|---|
| A 武器弹道 | `config/weapons.js`、`entities/weapon.js`、`entities/projectile.js`、`systems/combat.js` + 4 测试 | STAT_MAX/删 level；6 武器；arc 越障；aoe 爆炸结算；tesla 链电结算（命中后向最近 3 只衰减） |
| B 部署与辅助 | `entities/turret.js`、`entities/wall.js`、`entities/companions.js`、`config/auxItems.js` + 3 新测试 | 部署物实体（耐久/被啃/自动开火）；aux 载体与轨道运动；items 扩展 turret/wall（键 4/5） |
| C 经济商店 | `config/economy.js`、`systems/shop.js`、`config/zombies.js`、`entities/zombie.js` + 3 测试改 | weaponPrice 递增；分组 catalogFor/buy；coin 递增；zombie 啃食目标选择（edibles 参数） |
| 主会话集成 | `game.js`、`ui/shop.js`、`systems/hud.js`、`index.html`、`test/` 对齐 | 射程圈；部署/辅助接线；啃食传递；分组 UI；HUD 分维显示；全量回归 + 冒烟 + 提交 |

## 契约细节

### entities/weapon.js（改）
- `createWeapon(id)` 返回去掉 `level`，其余不变
- `weaponStats(w)` 不变（enhance 分维本来就是计数）
- `applyEnhancement(w, stat)`：per-stat `STAT_MAX=8` 上限

### entities/projectile.js（改）
- 弹道对象新增透传字段：`aoe`（>0 命中爆炸半径）、`arc`（true = 障碍检测跳过）、`chain`（tesla 链数）
- `updateProjectile` 不变（arc 只是 combat 忽略障碍）

### systems/combat.js（改）
- `resolveProjectileHits`：`p.arc === true` 跳过障碍检测；命中僵尸后若 `p.aoe > 0` → 调 `explode(p.x, p.y, p.aoe, p.damage, ...)`（主目标也吃爆炸；爆炸回调复用 onHit/onKill，避免双算：主目标爆炸已含，直接对主目标只做 damageZombie 一次——实现自定但不重复结算）；若 `p.chain > 0` → 命中后向 300px 内最近 `chain` 只各跳一次，伤害 ×0.8/跳（链目标不触发穿透消耗）
- 回调形状不变 `(zombies, hash, obstacles, onKill, onHit)`——链电需要 zombies 数组：签名追加末参 `allZombies = null`（tesla 用）

### entities/turret.js（新）
- `createTurret(x, y, enhance) → {x, y, r:20, hp:200, maxHp:200, weapon, alive:true}`
- `updateTurret(t, zombies, spawnProjectile, rng, dt)`——武器 updateWeapon(t, ...)；spawnProjectile 选项带 aoe:80

### entities/wall.js（新）
- `createWallRing(x, y, enhance) → segments[8]`：`{x, y, r:18, hp, maxHp, alive}`，hp = 150×1.5^wallEnhance.hp
- 段位置：`x + 120·cos(i/8·2π)`

### entities/companions.js（新）
- `createAux()` 如上
- `spawnAuxBodies(aux, player)`：按 counts 补齐 bodies（每 body `{kind, idx, weapon, x, y}`）
- `updateAuxBodies(aux, player, zombies, spawnProjectile, rng, dt)`：drone 环绕（角度 = idx 均分 + t·2rad/s）、gunner/sniper 跟随（朝玩家后方偏移，简单插值），各自 `updateWeapon(body, body, ...)`

### systems/shop.js（改）
- `catalogFor(game, tierRemainingSec)` 返回分组结构（如上）
- `buy(game, entry)` 扩展：weapon 用 `weaponPrice`（成功后 `game.weaponBought++`）；aux（`counts+1`）；auxEnhance（`aux.enhance[type][stat]++`，per-type 总计数计价）；turretEnhance/wallEnhance 同理；earlyTier 仍不经 buy
- entry 增加 `{kind:'aux', aux:'drone'|'gunner'|'sniper', price}`、`{kind:'auxEnhance', aux, stat, price, owned}`、`{kind:'deployEnhance', target:'turret'|'wall', stat, price, owned}`；item 条目扩展 turret/wall（buy → addItem）

### entities/zombie.js（改）
- `createZombie(typeId, x, y, tierCfg)`：coin 递增（cap ×4）
- `updateZombie(z, player, obstacles, dt, edibles = [])`：250px 内最近 edible（含玩家？否——玩家优先级低于部署物？**部署物优先**，因为挡路）：有 edible → 朝它移动，接触（圆碰撞）每秒啃 `z.damage`（`e.hp -= z.damage*dt`，hp≤0 → `e.alive=false`）；否则追玩家（原逻辑）
- 耐久扣减由 game 集成时把 turret/wall 段收集为 edibles 传入

### config/items.js（改）
- ITEMS 增 `turret:{id:'turret',name:'固定火炮',key:4,desc:'部署自动炮台（耐久200）'}`、`wall:{id:'wall',name:'围墙',key:5,desc:'环形8段墙（每段耐久150）'}`；ITEM_IDS 扩展

### ui/shop.js（改，主会话）
- 分组渲染：每组一行标题（组名）+ 横向条目；条目显示价格/已购/等级

### systems/hud.js（改，主会话）
- 武器区：`武器名 + 各维 Lv`（damage Lvn …）；道具栏扩至 5 槽（1–5）

## 验收清单（人工）

- [ ] 各维强化独立升级独立计价；单维满 8 级后该条目消失
- [ ] 商店按六组分行展示
- [ ] 买固定火炮→按 4 部署；围墙→按 5 部署；僵尸优先啃部署物，耐久耗尽摧毁
- [ ] 火炮/围墙强化生效（火炮四维、围墙耐久 +50%/级）
- [ ] 新武器三把可购、价格随换枪次数递增；火箭爆炸/榴弹越障/磁电链跳可感
- [ ] 玩家脚下射程圈可见；攻击范围升级后圈变大、索敌确实受限
- [ ] 击杀银币随档位上涨（后期更肥）
- [ ] 辅助三件可购可叠加；重复购买数量+1；辅助强化生效
- [ ] `npm test` 全绿；无 console 报错；帧率稳定
