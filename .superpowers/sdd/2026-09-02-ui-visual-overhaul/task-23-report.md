# Task 23：结算、暂停、关卡选择图标与 tooltip 收尾

## 状态

完成。代码实现、单元测试、DOM 结构、CSS 布局与全量回归测试全部通过；全量测试通过（364 pass，0 fail，在基线 362 pass 基础上净增 2 个）。本报告与代码同一原子提交，未执行 push。
- 提交信息: `UI改造任务23: 结算、暂停、关卡选择图标与 tooltip 收尾`
- 上游基线: `244b3d0`
- 提交哈希: 见当前原子提交 HEAD（经 `git -c core.protectNTFS=false rev-parse HEAD` 核验，并在最终回复中精准给出；本任务坚持单原子提交与干净工作区）

## 实现摘要

- `src/ui/icons.js`（新建）
  - 导出 `createIconMarkup(id, label, size = 32)`：根据 `ASSET_BY_ID[id]` 生成标准 `<img class="ui-icon" data-visual-id="..." data-icon-size="..." src="..." width="..." height="..." alt="..." loading="eager">` 标签；若 manifest 未注册则安全降级为 `<span class="ui-icon ui-icon-fallback" data-visual-id="..." data-icon-size="..." role="img" aria-label="..."></span>`。
  - 导出 `bindIconFallback(rootEl)`：为所有带 `[data-visual-id]` 的图片节点绑定 `error` 容错监听，图片加载失败时以 `getVisualCanvas` 离屏 Canvas 安全替换；对 fallback span 节点就地替换为离屏占位 Canvas，不另造临时 emoji 或伪符号。
- `src/ui/gameover.js`（修改）
  - 冒险模式结算面板结算奖励使用 `createIconMarkup('icon.currency.gold', '金币')` 渲染 manifest 金币图标；
  - 为结算奖励容器添加 `.settlement-reward` 类及完整 `data-tooltip="金币奖励：金币 +${gold}..."` 提示；
  - 在面板渲染后调用 `bindIconFallback(rootEl)`。
- `src/ui/pause.js`（修改）
  - 保持暂停菜单纯文字按钮（"继续"、"回主菜单"），不伪造 action icon，确保文本高可读性；
  - 为音量滑块、伤害数字开关、震屏开关三个设置项 `<label>` 完整覆盖语义化 `data-tooltip`（"音量：调整音量"、"伤害数字：显示或隐藏战斗伤害数字"、"震屏：受击和爆炸时启用或关闭屏幕震动"）。
- `src/ui/levels.js`（修改）
  - 金币余额行使用 `createIconMarkup('icon.currency.gold', '金币')` 渲染 manifest 金币图标，并覆盖 `data-tooltip="金币余额：${meta.gold}，当前可用于关卡奖励和外观解锁"`；
  - 遍历关卡卡片，已解锁关卡奖励使用 `createIconMarkup('icon.currency.gold', '金币')` 渲染图标，覆盖 `data-tooltip="通关奖励 ${lv.goldReward} 金币（首通 ×2）"`；
  - 面板渲染后调用 `bindIconFallback(rootEl)`。
- `style.css`（修改）
  - 新增统一 `.ui-icon` 基础样式（`32px × 32px`，`display: inline-block`，`object-fit: contain`）；
  - 新增 `.ui-icon-fallback` 圆形霓虹边框占位样式；
  - 新增 `.settlement-reward, .levels-balance, .level-reward` 弹性行居中对齐与 `gap: 8px` 布局，`.level-reward { min-height: 32px; }`；
  - 新增 `.pause-row label[data-tooltip] { cursor: help; }` 提示手型；
  - 调整 `.shop-item .ui-icon` 与 `.upgrade-row .ui-icon` 保持 `48px` 规格，既不覆盖任务包 1 的响应式规则，又保持商店与升级卡片的图标层级。
- `test/settlement.test.js`（修改）
  - 保留原有 2 个击杀结算协议测试；
  - 新增 `showGameOver：冒险结算使用金币 manifest 图标，并给奖励节点完整 tooltip`；
  - 新增 `showPause：设置控件保留文字可读性并覆盖 tooltip`；
  - 新增 `showLevels：余额和每个已解锁关卡奖励都复用金币 manifest ID`。
- `test/shop-ui.test.js`（修改）
  - 实现契约测试 `showShop：分组链路渲染图标，所有 data-visual-id 都来自 ASSET_BY_ID`，严格校验商店内所有 `data-visual-id` 均登记在 `ASSET_BY_ID` 中，6 个关键条目图标显示与 tooltip 覆盖；
  - 保留 Task 8 建立的 `upgradeView：保留局外等级计算并提供武器图标` 回归测试，防止测试资产退化。

## enhance 四卡图标缺口核实结论与裁定建议

根据主会话指示，对 HUD、升级界面及商店中四卡（伤害/攻速/弹道/攻击范围强化）图标使用情况进行了全方位核实：
1. **HUD 界面（`src/systems/hud.js:205-212`）**：
   - 武器与强化信息通过 Canvas 纯文本渲染（`ctx.fillText(info, layout.leftX, layout.weaponY)`），格式为 `手枪 · 伤害0 攻速0 弹道0 攻击范围0`；
   - 纯 Canvas 文字展示，不存在 DOM 节点、不存在 `data-visual-id`，未引用任何 manifest ID，亦无临时 emoji 或符号；
   - **结论**：属于完全符合 HUD 底部紧凑状态行布局的"有意设计（纯文字标签）"，无违规引用。
2. **升级界面（`src/ui/upgrades.js`）**：
   - 仅提供武器局外基础等级（Lv 1-10）金币升级，条目图标均来自 `WEAPONS[id].icon`（即 `icon.weapon.<id>`）与货币图标 `icon.currency.gold`；
   - 升级界面根本不包含四系强化卡（强化卡为局内商店/掉落专属）；
   - 所有引用的图标均在 `ASSET_BY_ID` 中合法注册，无图标缺口。
3. **通用强化四卡（`ENHANCE_STATS`: damage, fireRate, projectiles, range）**：
   - 经核查 `src/config/assets.js:19-22`，全部 4 个图标 ID 已完整登记（`icon.enhance.damage`、`icon.enhance.fireRate`、`icon.enhance.projectiles`、`icon.enhance.range`）；
   - 对应的 128×128 PNG 资产文件物理存在于 `assets/img/icons/enhance/`（`damage.png`, `fire-rate.png`, `projectiles.png`, `range.png`）；
   - 商店中 `entryView` 生成的 `icon: 'icon.enhance.' + entry.stat` 100% 命中 manifest。
4. **专属强化维（`SPECIAL_STATS`: `fragCount`, `fragDamage`, `chainLen`, `chainDmg`）**：
   - 仅在玩家手持榴弹炮或磁电枪时动态出现在商店中；
   - 当前生成 `icon.enhance.<stat>`，在无对应 manifest 时由 `getVisualCanvas` 安全降级为程序化 circle 占位并保持 warnOnce 警示。
5. **裁定建议**：
   - 通用四维强化已具备完整 manifest 与合法 PNG 资产，无缺口；
   - HUD 采用纯文字标签为有意设计，兼顾可读性与 Canvas 排版，建议维持；
   - 专属强化维（榴弹/电弧衍生）当前由程序化占位平稳兜底，后续若需视觉精细化可另立资产包补充，当前架构与红线完全合规。

## TDD 证据

### 1. RED 阶段（失败捕获）
运行 `node --test test/settlement.test.js test/shop-ui.test.js`，新增断言按预期失败：

```
✖ failing tests:

test at test\settlement.test.js:85:1
✖ showGameOver：冒险结算使用金币 manifest 图标，并给奖励节点完整 tooltip (0.7033ms)
  AssertionError [ERR_ASSERTION]: icon.currency.gold 未渲染
      at assertManifestIcon (file:///C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/test/settlement.test.js:49:10)
      at TestContext.<anonymous> (file:///C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/test/settlement.test.js:92:3)
    code: 'ERR_ASSERTION',
    expected: /data-visual-id=["']icon\.currency\.gold["']/,
    operator: 'match'

test at test\settlement.test.js:98:1
✖ showPause：设置控件保留文字可读性并覆盖 tooltip (0.3314ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /data-tooltip="音量：调整音量/.
    expected: /data-tooltip="音量：调整音量/

test at test\settlement.test.js:111:1
✖ showLevels：余额和每个已解锁关卡奖励都复用金币 manifest ID (0.3913ms)
  AssertionError [ERR_ASSERTION]: 余额 1 个 + 每关奖励 1 个金币图标
  0 !== 4
```

### 2. GREEN 阶段（实现后全部通过）
运行 `node --test test/settlement.test.js test/shop-ui.test.js`：

```
✔ 行为自杀：引信燃尽 alive=false，清理循环补 killZombie 结算一次（计 1 击杀，不双计） (7.5491ms)
✔ 战斗击杀计 1 次，同帧清理循环不双计 (1.9749ms)
✔ showGameOver：冒险结算使用金币 manifest 图标，并给奖励节点完整 tooltip (0.6546ms)
✔ showPause：设置控件保留文字可读性并覆盖 tooltip (0.1757ms)
✔ showLevels：余额和每个已解锁关卡奖励都复用金币 manifest ID (0.2747ms)
✔ showShop：分组链路渲染图标，所有 data-visual-id 都来自 ASSET_BY_ID (9.2837ms)
✔ upgradeView：保留局外等级计算并提供武器图标 (1.4756ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 85.5722
```

全量 `npm test` 回归：
```
ℹ tests 364
ℹ suites 0
ℹ pass 364
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 468.1421
```

## 偏差说明

1. **`test/shop-ui.test.js` mockDom 补全**：简报给定的测试 mock `el` 缺少 `prepend` 方法（`src/ui/shop.js:80,100` 依赖），且 `collectHtml` 仅读取 `node.innerHTML` 无法收集由 `dataset.visualId` 与 `dataset.tooltip*` 注入的属性。测试 mock 中补充了 `prepend` 及 dataset 序列化逻辑，使断言能准确反映真实 DOM 的视觉与 tooltip 契约。
2. **`test/shop-ui.test.js` 保留 `upgradeView` 用例**：Task 8 在此文件中登记了 `upgradeView` 的伤害浮点格式化与禁用态回归测试。为避免测试覆盖率倒退，在接入简报新增的 `showShop` 断言同时保留了该用例。
3. **`src/ui/pause.js` 文案与测试对齐**：简报参考实现为 `音量：调整游戏音量`，而测试正则为 `/data-tooltip="音量：调整音量/`，实现微调为 `音量：调整音量` 达成一致。
4. **`src/ui/levels.js` 余额提示对齐**：简报参考实现未将 `${meta.gold}` 放入属性值，而测试正则为 `/data-tooltip="[^"]*金币余额[^"]*500/`，调整为 `data-tooltip="金币余额：${meta.gold}，当前可用于关卡奖励和外观解锁"`，语义更清晰且满足测试约束。
5. **`style.css` 图标尺寸分级**：为兼顾结算/关卡选择的 `32px` 图标与商店/升级卡片的 `48px` 图标，将 `.ui-icon` 缺省设为 32px，同时显式声明 `.shop-item .ui-icon` 与 `.upgrade-row .ui-icon` 为 48px，避免样式覆盖引起布局变形。
