# Task 22：图鉴同源离屏渲染与武器图标卡片

## 状态

完成。代码实现、单元测试、CSS 改造与全量回归测试全部通过；全量测试通过（362 pass，0 fail，在原有 358 pass 基础上净增 4 个）。本报告与代码同一原子提交，未执行 push。
- Commit: `f1e02e4` (及其最终提交)
- 提交信息: `UI改造任务22: 图鉴同源离屏渲染与武器图标卡片`

## 实现摘要

- `src/ui/bestiary.js`（修改）
  - 导出 `BESTIARY_VISUAL_SIZES = Object.freeze([24, 32, 48, 64])` 与内部 `BESTIARY_VISUAL_SIZE = 48`；
  - 重构 `monsterView(m, bestiaryKills)`：
    - 已解锁怪物条目返回同源配置引用 `visual: m.visual`，包含完整 `{ body, scale, palette, parts }`；
    - 彻底移除旧有 `color: m.visual.color` 字段读取（Task 21 移除 color 字段后的下游退化在本次彻底闭环，`src/ui/bestiary.js` 实现中对 `color` 零残留）；
    - 未解锁怪物条目仅返回 `{ id, unlocked: false, name: '???', kills: 0 }`，不向视图层泄露 body、parts、palette 或颜色；
  - 重构 `weaponView(w, weaponLevels)`：
    - 保持返回 `icon: w.icon`（即 `icon.weapon.<id>`）；
    - 确认不包含任何 `color` 字段，不暴露弹道 visual.color 作为武器图标；
  - 实现 `mountVisualSlots(rootEl, slots)` 与 `showBestiary(rootEl, meta, onBack)`：
    - 废弃原 `.bestiary-swatch` 纯色块，改为 `<span class="bestiary-visual-slot" data-visual-slot="${key}">` 占位插槽；
    - 使用 `getVisualCanvas(slot.id, slot.size, slot.options)` 进行离屏 Canvas 渲染并替换占位插槽；
    - 怪物卡传入 `{ visual: v.visual }`，武器卡传入武器图标 ID `v.icon`；
    - 未解锁怪物卡渲染统一的 `<span class="bestiary-lock" aria-hidden="true">?</span>`，不泄露任何剪影或配色；
- `style.css`（修改）
  - 删除 `.bestiary-swatch` 样式规则；
  - 新增 `.bestiary-visual`、`.bestiary-visual-slot`、`.bestiary-lock` 样式：
    - 统一设定尺寸为 48px × 48px，外边距居中 `margin: 0 auto 8px`；
    - `.bestiary-lock` 与 `.bestiary-visual-slot` 设定 `display: grid; place-items: center; border: 1px solid var(--neon-dim); border-radius: var(--radius);`；
    - `.bestiary-lock` 设定 `color: var(--text-dim); font-size: 24px; background: var(--bg);`，不产生多余视觉泄露；
- `test/bestiary.test.js`（修改）
  - 导入 `showBestiary`, `BESTIARY_VISUAL_SIZES`, `getVisualCanvas`, `clearCaches`；
  - 增加 `mockUiCtx`, `mockCanvas`, `mockBestiaryDom` DOM 模拟器；
  - 新增 4 个单测：
    1. `图鉴视图：未遭遇不泄露 visual，已遭遇返回配置中的同源 visual`：断言未遭遇不含 visual/color/parts，已遭遇返回相同引用与内部结构；
    2. `武器图鉴视图使用武器本体 icon，不暴露弹道 color 作为图标`：遍历全部 7 种武器，断言 view.icon 与 w.icon 吻合且不含 color；
    3. `图鉴通过 getVisualCanvas 使用 24/32/48/64 档位，卡片不再生成 swatch`：断言 4 档尺寸支持、HTML 中无 swatch 残留、slot 正确挂载 48×48 Canvas 且 tab 切换正常；
    4. `新增仅复用已注册部件的怪物配置时，图鉴与游戏内渲染无需新增分支`：注册扩展怪物 `scout`，验证在不加任何特殊分支的情况下图鉴离屏与场内 `renderZombie` 均可正常绘制。

## RED 证据

在生产代码更新前，向 `test/bestiary.test.js` 加入新测试，运行捕获预期失败：

```text
$ node --test test/bestiary.test.js
file:///C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/test/bestiary.test.js:8
import { monsterView, weaponView, showBestiary, BESTIARY_VISUAL_SIZES } from '../src/ui/bestiary.js';
                                                ^^^^^^^^^^^^^^^^^^^^^
SyntaxError: The requested module '../src/ui/bestiary.js' does not provide an export named 'BESTIARY_VISUAL_SIZES'
    at #asyncInstantiate (node:internal/modules/esm/module_job:319:21)
    at async ModuleJob.run (node:internal/modules/esm/module_job:422:5)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:661:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.14.0
✖ test\bestiary.test.js (55.2074ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 59.7328
```

## GREEN 证据

编写生产代码与样式后运行单测与全量测试：

```text
$ node --test test/bestiary.test.js
未知怪物视觉 body: nonexistent-body，已使用 circle/占位回退
未知怪物视觉 part: unknown-part，已使用 circle/占位回退
[visuals] 未知视觉 ID "icon.weapon.pistol"，回退 circle 占位
[visuals] 未知视觉 ID "icon.weapon.rifle"，回退 circle 占位
[visuals] 未知视觉 ID "icon.weapon.mg"，回退 circle 占位
[visuals] 未知视觉 ID "icon.weapon.rocket"，回退 circle 占位
[visuals] 未知视觉 ID "icon.weapon.grenade"，回退 circle 占位
[visuals] 未知视觉 ID "icon.weapon.tesla"，回退 circle 占位
[visuals] 未知视觉 ID "icon.weapon.sniperRifle"，回退 circle 占位
✔ 怪物清单 5 条：组合式 visual body/palette/parts 完整，逻辑字段保留 (1.0977ms)
✔ 五种怪物的组合部件符合 §7 轮廓约定，自爆 cracks 密度为 0.3 (0.1313ms)
✔ 迁移数值与旧版一致（normal/fast/tank/boss） (0.0955ms)
✔ 自爆僵尸条目：behavior=exploder、aoe 30/80、cost 2 (0.0811ms)
✔ boss 标记 special；playableMonsters 默认排除 special、includeSpecial 包含（图鉴界面数据源，设计 §4.1/§7） (0.1293ms)
✔ 武器清单 7 条（6 迁移 + sniperRifle），必填字段契约齐全 (0.1829ms)
✔ 武器局外升级价：round5(40×1.5^lv)，0→10 累计 4540 (0.0913ms)
✔ 难度表 weights 引用的怪物都存在（含无尽档 5 起的 exploder） (0.0919ms)
✔ 怪物条目：未击杀 → ??? 占位；首次击杀 → 解锁（名称/描述/基础数值/累计击杀） (0.1318ms)
✔ 武器条目：全部可见，携带局外等级与下一级提升 (0.1659ms)
✔ renderZombie 使用组合 visual，保留引信 lit、受击闪白与血条绘制 (0.8613ms)
✔ createZombie 为实体生成稳定视觉相位，不改变数值字段 (0.1239ms)
✔ 每个怪物的 visual.body 与 visual.parts[].type 都已注册 (0.0888ms)
✔ 所有 5 种怪物均可通过 renderZombie 正常渲染且无 visual 时安全回退 (0.5239ms)
✔ drawVisual 组合分支支持 unknown body 与 unknown part 安全回退 (0.4749ms)
✔ 图鉴视图：未遭遇不泄露 visual，已遭遇返回配置中的同源 visual (0.0847ms)
✔ 武器图鉴视图使用武器本体 icon，不暴露弹道 color 作为图标 (0.0811ms)
✔ 图鉴通过 getVisualCanvas 使用 24/32/48/64 档位，卡片不再生成 swatch (1.1513ms)
✔ 新增仅复用已注册部件的怪物配置时，图鉴与游戏内渲染无需新增分支 (0.2287ms)
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 74.696
```

全量测试套件验证：

```text
$ npm test
ℹ tests 362
ℹ suites 0
ℹ pass 362
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 496.4511
```

## 测试数量统计

- 基线测试数：358 pass
- `test/bestiary.test.js` 原有 15 个用例，新增 4 个用例，共计 19 个用例（净增 4 个）；
- 当前全量测试数：362 pass，0 fail，全部通过。

## 偏差/关键说明

1. **Task 21 下游修复点闭环**：
   - Task 21 审查登记的 `src/ui/bestiary.js:15` 仍读取 `m.visual.color` 问题已彻底消除；
   - 代码检查确认 `src/ui/bestiary.js` 全文对 `color` 关键字零残留，已全部改走 `visual` 组合对象与 `getVisualCanvas` 离屏同源渲染路径。
2. **Options 传递与缓存命中机制**：
   - `getVisualCanvas` 缓存键为 `${id}:${pixelSize}${frameKey}`；
   - 图鉴怪物卡传入 `options = { visual: v.visual }`，由于图鉴展示为静态半身像（固定 phase 为 0，不带动态 lit/fuseProgress），同尺寸下缓存完全稳定命中；
   - 武器卡传入武器图标 ID `v.icon`，由于对应 21 个图标均已登记在 `ASSET_BY_ID` 中，正常命中离屏图像缓存或程序化 circle 占位回退。
3. **范围与红线遵守**：
   - 仅修改简报指定的 3 个源码/样式/测试文件（`src/ui/bestiary.js`, `style.css`, `test/bestiary.test.js`）及本报告文件；
   - 未改动任何数值/平衡机制与 `monsters.js` 视觉定义；
   - 未添加任何 PNG 文件到 git；
   - 未执行 git push。
