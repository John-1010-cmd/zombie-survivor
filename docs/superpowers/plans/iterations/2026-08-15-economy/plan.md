# 第 2 轮迭代计划：银币经济 + 坚守模式 + 音效 + QoL（2026-08-15 设计漂移）

> Spec：`../../../specs/2026-08-14-zombie-survivor-design.md`（§0 变更记录为本轮依据）
> 前置：第 1 期 MVP 已交付（16 个 Task，全部提交）
> 本计划为**漂移轮**实施依据；接口契约在本文钉死，实现者不得偏离签名

## 全局约束

- 沿用第 1 期全部工程约定：纯逻辑层禁 DOM（`node --test` 可 import）、rng 注入禁 `Math.random`（DOM 层除外）、TDD（失败测试→实现→通过→提交）、中文提交 + Conventional Commits
- 删除文件：`src/systems/progression.js`、`src/ui/levelup.js`、`src/entities/xpGem.js` 及其测试（由 coin/shop/inventory 取代）
- 僵尸配置字段 `xp` 更名 `coin`；玩家移除 `xp/level` 字段，新增 `coins`
- 性能上限：僵尸 400 / 子弹 400 / 粒子 500 / 伤害数字 100

## 契约（全部实现以此为准）

### config/economy.js（新，纯）
- `ENHANCE_BASE = 40`；`ENHANCE_GROWTH = 1.5`；`WEAPON_SWAP_PRICE = 80`
- `ITEM_PRICES = { medkit: 30, magnet: 25, bomb: 50 }`
- `EARLY_BONUS_PER_30S = 25`
- `enhancePrice(ownedCount) → number`：`round5(40 × 1.5^ownedCount)`（round5 = 取 5 的倍数，四舍五入）
- `earlyTierBonus(remainingSec) → number`：`Math.floor(remainingSec / 30) * 25`

### config/items.js（新，纯）
- `ITEMS = { medkit:{id:'medkit',name:'医疗包',key:1,desc:'立即回复 50% HP'}, magnet:{id:'magnet',name:'磁铁',key:2,desc:'吸附全场银币'}, bomb:{id:'bomb',name:'炸弹',key:3,desc:'半径 350 爆炸，伤害 250'} }`
- `ITEM_IDS = ['medkit','magnet','bomb']`（按 key 升序）

### systems/inventory.js（新，纯）
- `createInventory() → {medkit:0, magnet:0, bomb:0}`
- `addItem(inv, id, n=1) → void`（原地累加）
- `useItem(inv, id) → boolean`（数量>0 才扣减并返回 true）
- `itemCount(inv, id) → number`

### systems/shop.js（新，纯；依赖 economy/items/weapons/weapon.js）
- `catalogFor(game, tierRemainingSec) → entry[]`，entry 形如：
  - `{kind:'enhance', stat:'damage'|'fireRate'|'projectiles'|'range', price, owned}`（`game.weapon.level >= 8` 时不产出任何 enhance 条目）
  - `{kind:'weapon', weapon:'rifle'|'mg', price: 80}`（当前武器不列）
  - `{kind:'item', item:'medkit'|'magnet'|'bomb', price}`
  - `{kind:'earlyTier', bonus}`（bonus = `earlyTierBonus(tierRemainingSec)`；bonus === 0 时仍列出，标注"无奖励"）
- `buy(game, entry) → boolean`：余额不足返回 false；成功扣款并生效——enhance 调 `applyEnhancement(game.weapon, stat)`（若已达上限返回 false）、weapon 置 `game.weapon = createWeapon(entry.weapon)`、item 调 `addItem(game.inventory, entry.item, 1)`；earlyTier **不经 buy**（由 game.js 专用流程处理）
- game 形如 `{coins, weapon, inventory}`（与战斗场景暴露的字段同名）

### entities/coin.js（新，纯；取代 xpGem.js）
- `createCoin(x, y, value) → {x, y, r:8, value, alive:true}`
- `updateCoin(c, player, dt, magnetAll=false) → boolean`（是否被拾取）：`magnetAll=true` 时无视拾取半径，以 1200px/s 直飞玩家；否则沿用原磁吸规则（80px 内 400px/s；接触即拾取）

### config/difficulty.js（重写，纯）
- 常量：`TIER_DURATION=180`、`STAT_CAP_TIER=8`、`GRACE_PERIOD=30`、`MAX_ZOMBIES=400`、`SURGE_CAP=48`
- `DIFFICULTY_TIERS` 预算 ×1.5：`[3, 4.5, 7, 9, 12, 15, 18, 21]`，9+ 档每档 +4.5；倍率/权重与第 1 期一致
- `getTier(timeSec)`、`getTierConfig(timeSec)` 语义不变
- 新增 `tierStartTime(tier) → (tier-1)*180`（提前难度的时间快进目标）
- 新增 `HOLDOUT10_TIERS`：6 段、每段 100 秒，第 n 段的 hpMult/speedMult/weights/budgetPerSec 取无尽档 n 的值；`getHoldout10Tier(t)`、`getHoldout10Config(t)` 同构
- 新增 `MODES = { endless:{...}, holdout10:{duration:600, getCfg:getTierConfig, surgeFrom:540, bossAt:540}, holdout20:{duration:1200, getCfg:getTierConfig, surgeFrom:1140, bossAt:1140} }`（holdout 用无尽表；surgeFrom 起预算 ×1.5；bossAt 为守门 Boss 注入时刻）

### config/zombies.js + entities/zombie.js（改）
- `ZOMBIES` 字段 `xp` → `coin`；新增 `boss: {id:'boss', name:'守门Boss', hp:7040, speed:20, damage:40, coin:50, radius:41, color:'#7a2f2f', knockbackResist:0.95, cost:999}`
- `createZombie(typeId, x, y, tierCfg)` 产出 `coin` 字段；其余不变

### systems/spawner.js（改）
- 包围潮上限 48；其余逻辑不变
- 新增导出 `offscreenPoint(cam, mapSize, rng) → {x,y}`（从 pickSpawnPoint 提出为公共函数，供 Boss 注入复用）
- `updateSpawner` 增加可选参数 `budgetMult = 1`（结尾应用于 `bps`；坚守高峰用）

### systems/combat.js（改）
- 新增 `explode(x, y, radius, damage, zombies, onHit, onKill)`：线性遍历 `zombies`，对 `alive` 且圆心距 ≤ `radius + z.r` 的僵尸 `damageZombie(z, damage, 200, atan2(z.y-y, z.x-x))` 并按死亡回调（炸弹道具用）

### entities/helicopter.js（新，纯）
- `createHelicopter(x, y) → {x, y, r:60, state:'landing', t:0}`
- `updateHelicopter(h, player, dt) → 'none'|'victory'`：landing 3s → waiting；waiting 中玩家圆心距 < 60 → boarding（t 计 3s，玩家离开则重置回 waiting）；boarding 满 3s → 返回 `'victory'` 且 state='done'
- `renderHelicopter(ctx, h)`（canvas 几何：机身+旋翼旋转+登机进度弧）

### core/storage.js（改）
- `updateBest(best, stats, mode)`：`stats={time,kills,hp?,cleared?}`；endless 比 time；holdout：cleared 优先，双方 cleared 比 hp 高者胜，双方未 cleared 比 time 长者胜；返回 `{best, isNew}`，不改入参
- `loadBest()/saveBest(best)` 键 `'zs_best'` 不变（结构扩展 `holdout10/holdout20`）
- 新增 `loadSettings()/saveSettings(s)`：键 `'zs_settings'`，`{volume:0.8, damageNumbers:true, screenShake:true}`，读写失败回退默认

### core/input.js（改，DOM）
- `createInput({onItem, onEsc}={})`：移动键维持 state；`Digit1..Digit9` 触发 `onItem(n)`；`Escape` 触发 `onEsc()`；destroy 不变

### core/audio.js（重写，DOM）
- `createAudio(settings) → {play(id), setVolume(v), isReady}`；懒加载 `assets/audio/` 素材（fetch + decodeAudioData 缓存）
- 播放 id：`shoot`、`shootMG`、`explosion`、`coin`、`buy`、`hurt`、`click`、`alarm`、`heli`（循环，重复调用不叠加）；失败仅 console.warn 不抛错
- 素材文件与许可证记录 `assets/audio/CREDITS.md`（CC0）

### systems/map.js（改）
- `generateMap(rng)` 输出新增 `shops:[{x,y,r:46,interactR:90}]`：位置固定 `(750,750)/(2250,750)/(750,2250)/(2250,2250)/(1500,1150)`；障碍物生成须避开商店半径 +150
- `scatteredGems` 更名 `scatteredCoins`（40 枚，value=1）

### game.js / ui（集成，主会话实现）
- scene 暴露：原字段（去 `pendingLevelUps`、`weapon.level` 保留）+ `coins`、`inventory`、`mode`、`shops`、`helicopter?`、`settings`
- 银币拾取 → `game.coins += c.value`；击杀掉 `createCoin(z.x, z.y, z.coin)` + 0.5%/0.3%/0.3% 掉道具
- 商店触发：进入 `interactR` 且未在冷却 → 打开商店（paused）；关闭后须离开半径重进
- 数字键 1/2/3 → 使用道具（医疗包回血 / 磁铁设全场 coin magnetAll 1.5s / 炸弹 `explode(player, 350, 250)` + 震屏 + 音效）
- Esc → 暂停菜单（继续/设置/回主菜单）；商店打开时 Esc 先关商店
- 提前难度：确认后 `game.time = tierStartTime(curTier+1)`，`coins += bonus`，包围潮自然触发
- 坚守：倒计时 = duration - time；剩 60s 警报提示；归零生成直升机（地图中心）；`updateHelicopter` 返回 victory → 胜利结算；`bossAt` 时刻经 `offscreenPoint` 注入 1 只 boss
- 结算 stats：`{time, kills, hp, cleared}`；三模式 `updateBest(best, stats, mode)`

## 任务分解与执行编队

| 编队 | 任务 | 产出 |
|---|---|---|
| A 经济 | economy/items/inventory/shop 四模块 + 4 份测试 | 纯逻辑 + 单测 |
| B 世界 | coin/map(商店)/helicopter/combat.explode + 测试改写 | 纯逻辑 + 单测 |
| C 难度 | difficulty 重写/zombies+boss/spawner 改 + 测试改写 | 纯逻辑 + 单测 |
| D 音频 | CC0 素材检索下载 + CREDITS + audio.js 重写 | 素材 + DOM 模块 |
| E 界面 | storage 三模式/input 回调/pause/menu/gameover/hud + 测试 | 混合 |
| 主会话 | game.js 重写、ui/shop.js、main.js、index.html/style.css、删除旧文件、全量回归 | 集成 |

## 人工验收清单（本轮末尾）

- [ ] 无尽：击杀掉银币、磁吸拾取、HUD 银币数增长
- [ ] 走近商店自动弹面板并暂停；购买增强后武器数值可感提升；价格逐次上涨
- [ ] 换武器 80 银币：开火手感立即切换、HUD 同步（回归项）
- [ ] 买道具 → 道具栏数量+1；数字键 1/2/3 分别回血/吸币/爆炸，不暂停
- [ ] 提前难度：确认后立即包围潮 + 奖励银币到账；越晚点奖励越少
- [ ] 无尽僵尸量明显多于上一版；同屏不破 400、帧率稳定
- [ ] 坚守 10/20：倒计时、剩 60s 警报与提示、归零直升机降落、登机 3s → 胜利结算（含剩余 HP）；守门 Boss 出现且可击杀
- [ ] Esc：暂停菜单（继续/音量滑块/两个开关/回主菜单）；设置持久化
- [ ] 音效：射击/爆炸/拾取/购买/受伤/点击/警报/直升机均正常，音量可调可静音
- [ ] 三模式最佳纪录正确写入与展示（刷新页面仍在）
- [ ] `npm test` 全绿；全程 console 无报错
