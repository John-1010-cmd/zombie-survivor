# 迭代 04：开发者模式 / 弹道特效 / 换枪返还 / 辅助强化分组

> Spec：§0 迭代 04 条目；前置：迭代 03 已交付（194 用例）
> 契约在本文钉死；主会话集成 game.js/main.js/index.html

## 契约

### 1. 开发者模式（反馈 #1）
- 快捷键 **`**（Backquote）开关 `#dev` 覆盖层；打开即暂停（与商店一致），关闭恢复
- 菜单项：`+100 银币`、`+1000 银币`、放置僵尸四按钮（普通/高速/坦克/守门Boss，落在玩家东侧 200px，按当前档倍率）`关闭`
- `core/input.js`：`createInput({onItem,onEsc,onDev})`，`Backquote` → `opts.onDev()`（e.repeat 防抖）
- `ui/dev.js`：`showDev(rootEl, handlers)`，handlers = `{onCoins(n), onSpawn(type), onClose()}`（DOM 胶水）
- game.js 暴露：`devAddCoins(n)`、`devSpawnZombie(type)`、`toggleDev()`

### 2. 弹道特效（反馈 #2，effects.js + combat.js hooks）
- `spawnExplosion(arr, x, y, radius, rng)`：推入 `{type:'ring', x, y, r0:12, r1:radius, life:0.25, maxLife:0.25}` + 16 个橙色粒子（复用 spawnParticles，color '#f80'）
- `spawnLightning(arr, x1, y1, x2, y2, rng)`：推入 `{type:'bolt', pts:[起终点间 5 段折线，中间点垂直抖动 ±14px], life:0.12, maxLife:0.12}`
- `updateEffects(arr, dt)` / `renderEffects(ctx, arr)`：ring=扩张描边圆（r0→r1 随 life 进度，alpha 衰减，#f80）；bolt=青色 #5ef 折线，alpha 衰减；swap-remove
- combat：`resolveProjectileHits(..., allZombies=null, opts={})`，`opts.onExplode(x,y,radius)`（aoe 结算时）、`opts.onChain(path)`（链电结算时，path=[{x,y}...] 主目标→各跳）；默认空实现，向后兼容
- game.js：MAX_EFFECTS=100 守卫；opts 接 spawnExplosion / 逐段 spawnLightning；炸弹道具同样特效

### 3. 换枪增强返还（反馈 #3）
- `createWeapon(id)` 增 `spent: 0`（该武器累计已花费的**强化**银币）
- shop `buy` enhance：`game.weapon.spent += entry.price`
- shop `buy` weapon：`game.coins += (game.weapon.spent ?? 0)`（返还旧武器强化消费；武器购买价不返还），新武器 spent=0
- UI：换枪条目描述加「（返还强化 N 银币）」——entry 增 `refund: 当前武器 spent`

### 4. 辅助强化分组置灰（反馈 #4）
- `buy` auxEnhance 增守卫：`counts[aux] === 0` 返回 false（不扣款）
- `catalogFor` 的辅助强化条目仍列出（含未拥有），但带 `owned0: counts===0` 标记
- `ui/shop.js`：辅助强化组内**按类型分行**（随行无人机/随行移动火炮/随行远程火炮各一行标题+4 维条目）；`owned0` 条目置灰不可点

## 编队

| 编队 | 文件 |
|---|---|
| A 特效 | effects.js、combat.js（hooks）、test/effects、test/combat |
| B 经济UI | weapon.js（spent）、shop.js（返还/守卫/标记）、ui/shop.js（分组+置灰）、test/weapon、test/shop |
| C 开发者 | input.js（onDev）、ui/dev.js（新） |
| 集成 | game.js、main.js、index.html、style.css、spec/文档、回归+提交 |

## 验收（人工）

- [ ] ` 键弹开发者菜单并暂停；加银币即时生效；四种僵尸放置在玩家旁且带当前档倍率
- [ ] 火箭/榴弹/炸弹/火炮命中有橙色扩张爆环；磁电枪链路有青色闪电折线
- [ ] 强化花掉的银币在换枪时全额返还（floater 提示）；新武器 spent 归零重新累计
- [ ] 商店辅助强化按三类分行；未购买的类型整行置灰不可点；购买后解除
- [ ] `npm test` 全绿；无 console 报错
