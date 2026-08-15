# 迭代 05：专属强化 / 弹道叠加特效 / 围墙单段 / 辅助环绕（2026-08-15）

> Spec：§0 迭代 05 条目；前置：迭代 04 已交付（211 用例）
> 契约在本文钉死；主会话集成 game.js/effects.js/ui/shop.js/渲染

## 数值裁定（全部最终值）

### 1. 专属强化（反馈 #6 #7，只对对应武器展示）
- `weapon.enhance` 扩展四维外的专属维：`fragCount`、`fragDamage`、`chainLen`、`chainDmg`（各 0–8 级，STAT_MAX 复用）
- **榴弹炮专属**（weapon.id==='grenade' 时目录出现，其他武器不展示）：
  - `fragCount`：榴弹碎片 +2/级（基础 8 → 8+2n，上限 24）；label「榴弹碎片 +2」
  - `fragDamage`：二次伤害 +15%/级（基础=主伤害 40% → 0.4×1.15^n）；label「二次伤害 +15%」
- **磁电枪专属**（weapon.id==='tesla' 时目录出现）：
  - `chainLen`：电磁链路 +1/级（基础 3 → 3+n，上限 11）；label「链路长度 +1」
  - `chainDmg`：链伤 +5%/级（每跳伤害 = 主伤 × 0.8^跳序 × (1+0.05n)）；label「二次伤害 +5%」
- 专属维价格与四维同曲线 `enhancePrice(n)`；`applyEnhancement` 通用（enhance[stat]++，STAT_MAX 上限）；STAT_LABEL 增 4 键

### 2. 榴弹二次爆炸（反馈 #5）
- 榴弹弹对象带 `frags: {count, dmg}`（fire() 组装：count=8+2×fragCount，dmg=主伤×0.4×1.15^fragDamage）
- combat：弹 aoe 命中结算时若 `p.frags` → 调新 hook `opts.onFrag(p.x, p.y, p.frags)`；碎片弹由 game.js 生成：8 等分角度 + 每发 ±0.15rad 抖动，speed 420 / range 160 / aoe 45 / arc:true / 无 frags（不二次分裂）
- 碎片弹命中 → 小爆环（特效自然形成"二次爆炸"）；主爆环 + 小环区分（主环 r1=90，碎环 r1=45）
- 火箭炮维持单爆环（无 frags）

### 3. 电磁球特效（反馈 #5）
- 磁电弹命中后：除闪电链外，在**主目标位置**生成电磁球实体 `{x,y,vx,vy,life:2.5,damage,r:22}`，沿子弹方向慢速移动（speed 120px/s），对周围（半径 30 内）僵尸持续伤害（每 0.25s tick 一次，伤害 = 主伤 ×0.5 × (1+0.05×chainDmg)），2.5s 后消失
- `entities/teslaball.js`（新，纯逻辑）：createTeslaBall / updateTeslaBall（移动+半径伤害 tick，返回 tick 伤害列表或经回调）/ 渲染圆 + 电弧
- 简化裁定：tick 直接对 range 内 alive 僵尸 damageZombie（回调 onHit/onKill 复用），game.js 维护数组

### 4. 特效随弹道叠加（反馈 #1）
- 特效本身逐弹触发（combat 逐弹结算 onExplode/onChain/onFrag），问题在视觉重叠——`spawnExplosion` 的 ring 增 r0/r1 抖动（±6px）与旋转相位（`rng()*2π` 起点偏移），同位置多环错开可见
- MAX_EFFECTS 100 → 200

### 5. 围墙单段放置（反馈 #2）
- `entities/wall.js`：`createWallSegment(x, y, wallEnhance)` 取代 createWallRing——单段 `{x,y,r:22,hp,maxHp,alive}`，hp=150×1.5^hp 不变
- 键 5 在玩家位置放 1 段；场上墙段上限 **16**（原 2 组×8）
- game.js `scene.walls` 改存段对象数组；清理逻辑改单段；渲染不变

### 6. 部署上限提示（反馈 #3，疑似静默失败）
- game.js useItemKey：turret 达 6 / wall 达 16 时 spawnFloater「固定火炮已达上限（6）」/「围墙已达上限（16）」，并 sound('click')；库存不足同理给提示
- 集成时实测定位"后续放置不展示"根因（嫌疑：上限静默拒绝 或 数组清理误删），有真 bug 则修复

### 7. 辅助环绕与辨识（反馈 #4）
- companions.js：gunner/sniper 改环绕（orbit=60/100），三种全部以玩家为圆心；起始角按 idx 均分；角速 drone 2.2 / gunner 1.4 / sniper 1.0 rad/s
- 渲染形状（game.js）：drone 青色三角形、gunner 橙色方块、sniper 蓝色菱形（替代全三角）

## 编队

| 编队 | 文件 |
|---|---|
| A 专属弹道 | weapons.js（STAT_LABEL+专属维）、weapon.js（enhance/stats/fire 组装 frags/chainMult/chainDmgMult）、combat.js（frags hook、chainDmg 乘区）、teslaball.js（新）+ 4 测试 |
| B 围墙 | wall.js（单段）、test/wall.test.js |
| C 辅助 | companions.js（环绕+orbit 差异化）、test/companions.test.js |
| 集成 | game.js、effects.js（抖动+200）、ui/shop.js（专属条目）、渲染、spec/文档、回归+冒烟+提交 |

## 验收（人工）

- [ ] 弹道 +1 后爆炸/闪电/碎片特效数量随之增加（多环错开可见）
- [ ] 围墙按键在脚下放置单段，最多 16 段；到上限有文字提示
- [ ] 火炮/围墙后续放置正常显示（上限前）
- [ ] 三种辅助均绕角色运转，形状/颜色可辨识
- [ ] 榴弹主爆 + 碎片二次小爆；电磁球沿弹道慢行 2.5s 持续电击
- [ ] 商店：榴弹/磁电各自专属强化两条仅对应武器时展示
- [ ] `npm test` 全绿；无 console 报错
