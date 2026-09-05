# Task 23B：接通结算、暂停、关卡选择面板 tooltip 显示链路

## 状态

完成。代码实现、方案权衡、TDD 单元测试与全量回归测试全部通过；全量测试通过（368 pass，0 fail，在原有基线 364 pass 基础上净增 4 个）。本报告与代码同一原子提交，未执行 push。
- 提交信息: `UI改造任务23补: 接通结算/暂停/关卡面板 tooltip 显示链路`
- 上游基线: `63b17bc`
- Commit: `89cd259`（代码与测试所在提交，即本报告修正提交的直接父提交；此前写入的 `bc9e5ff` 为 amend 前的悬空提交，已作废。因报告与代码同提交时无法自引用固化 hash，本行在后续文档修正提交中据实改写）

## 方案选择与理由（方案 a vs 方案 b）

评审遗留问题指出：Task 23 给 `gameover.js:16`、`levels.js:10,20`、`pause.js:7,13,18` 输出了裸 `data-tooltip` 属性，但既有 `tooltip.js:103` 只查询 `[data-tooltip-name]`，且三面板未调用 `attachTooltips`。

经调研与对比评估：
- **方案 (a)**：三面板改用结构化三元组（`data-tooltip-name`、`data-tooltip-description`、`data-tooltip-value`）并调用 `attachTooltips`。
  - *缺点*：破坏既有契约与样式。既有 `style.css:119` 显式设置了 `.pause-row label[data-tooltip] { cursor: help; }`，`test/settlement.test.js` 亦已固定断言 `data-tooltip` 匹配。若全面改写为三元组，不仅需要侵入三面板模板多处属性，还会导致现有测试全部失效，侵入面过大。
- **方案 (b)**：扩展 `tooltip.js` 统一兼容 `[data-tooltip]` 与 `[data-tooltip-name]`，三面板统一调用 `attachTooltips(rootEl)`。
  - *优点 1（最小侵入原则）*：三面板仅各自追加一行标准的 `attachTooltips(rootEl)`，HTML 模板与既有单属性完全保持不变；
  - *优点 2（100% 向后兼容）*：`style.css` 的 `.pause-row label[data-tooltip]` 保持原样生效，`test/settlement.test.js` 既有测试 100% 绿色无需重构；
  - *优点 3（架构通用性）*：`tooltip.js` 作为全项目通用的 DOM tooltip 控制器，自然支持复合结构化卡片（shop/upgrades）与紧凑文本卡片（settlement/pause/levels）；
  - *优点 4（优雅视觉映射）*：`tooltip.js` 针对 `data-tooltip` 提供冒号分隔解析（中英文 `：` 或 `:`），如 `"音量：调整音量"` 自动解析为金色标题 `音量`（`<strong>`）与暗色说明 `调整音量`（`<span>`）；无冒号文本（如关卡通关奖励）整体作为标题展示，完全融入既有视觉规范。

**结论**：选择**方案 (b)**。

## 实现摘要

- `src/ui/tooltip.js`（修改）
  - 新增并导出 `parseTooltipAttribute(text)`：解析裸字符串，按中英文冒号（`：` 或 `:`）拆分。冒号前为 `name`，冒号后为 `description`；无冒号时整体为 `name`。
  - 升级 `normalizeTooltipData(data)`：兼容直接传入字符串或对象中的 `tooltip` 属性。
  - 新增并导出 `extractTooltipData(target)`：按优先级依次读取 `dataset.tooltipName/Description/Value` 三元组、`dataset.tooltip` 或 `getAttribute('data-tooltip')`。
  - 升级 `bindTooltip(target, tooltip, data)`：若未传 `data` 则自动回退至 `extractTooltipData(target)`。
  - 升级 `attachTooltips(root)`：查询列表同时覆盖 `[data-tooltip-name]` 与 `[data-tooltip]`，使用 `Set` 去重，兼顾单属性、三元组与测试 Mock 兼容性；自动为每个 target 挂载 `extractTooltipData`。
- `src/ui/gameover.js`（修改）
  - 导入 `attachTooltips`并在 `showGameOver` 末尾调用 `attachTooltips(rootEl)`，接通结算金币奖励悬停覆盖层链路。
- `src/ui/pause.js`（修改）
  - 导入 `attachTooltips`并在 `showPause` 末尾调用 `attachTooltips(rootEl)`，接通音量、伤害数字、震屏悬停覆盖层链路。
- `src/ui/levels.js`（修改）
  - 导入 `attachTooltips`并在 `showLevels` 末尾调用 `attachTooltips(rootEl)`，接通金币余额与关卡奖励悬停覆盖层链路。
- `test/settlement.test.js`（修改）
  - 升级 `MockElement` 与 `makeRoot()`，提供支持完整 DOM 树与事件派发（`addEventListener`/`removeEventListener`/`dispatchEvent`）的微型环境，并支持 `ownerDocument.createElement`；
  - 保留并完全兼容原有的 5 个既有用例（2 个战斗/自爆协议 + 3 个面板渲染）；
  - 新增 4 个真契约 TDD 测试用例：
    1. `showGameOver：接入 attachTooltips 并为结算奖励绑定可展示的 tooltip 覆盖层`
    2. `showPause：接入 attachTooltips 并为三项设置项绑定语义化 tooltip 覆盖层`
    3. `showLevels：接入 attachTooltips 并为金币余额与通关奖励绑定 tooltip 覆盖层`
    4. `tooltip.js：attachTooltips 兼容 [data-tooltip] 裸属性并支持冒号拆分与无冒号文本`
  - 严格断言实际值（`strong` 金币奖励/音量/伤害数字/震屏/余额/通关奖励，`span` 详细说明，`hidden` 状态转换，销毁时事件监听器卸载），无恒真断言。

## TDD 证据

### 1. RED 阶段（实现前失败捕获）
运行 `node --test test/settlement.test.js`：

```text
✔ 行为自杀：引信燃尽 alive=false，清理循环补 killZombie 结算一次（计 1 击杀，不双计） (7.8863ms)
✔ 战斗击杀计 1 次，同帧清理循环不双计 (2.3675ms)
✔ showGameOver：冒险结算使用金币 manifest 图标，并给奖励节点完整 tooltip (1.1075ms)
✔ showPause：设置控件保留文字可读性并覆盖 tooltip (0.2356ms)
✔ showLevels：余额和每个已解锁关卡奖励都复用金币 manifest ID (0.3564ms)
✖ showGameOver：接入 attachTooltips 并为结算奖励绑定可展示的 tooltip 覆盖层 (0.9279ms)
✖ showPause：接入 attachTooltips 并为三项设置项绑定语义化 tooltip 覆盖层 (0.1807ms)
✖ showLevels：接入 attachTooltips 并为金币余额与通关奖励绑定 tooltip 覆盖层 (0.1984ms)
✖ tooltip.js：attachTooltips 兼容 [data-tooltip] 裸属性并支持冒号拆分与无冒号文本 (0.6048ms)
ℹ tests 9
ℹ suites 0
ℹ pass 5
ℹ fail 4

✖ failing tests:
test at test\settlement.test.js:278:1
✖ showGameOver：接入 attachTooltips 并为结算奖励绑定可展示的 tooltip 覆盖层 (0.9279ms)
  AssertionError [ERR_ASSERTION]: 结算面板应当挂载 tooltip 控制器

test at test\settlement.test.js:312:1
✖ showPause：接入 attachTooltips 并为三项设置项绑定语义化 tooltip 覆盖层 (0.1807ms)
  AssertionError [ERR_ASSERTION]: 暂停面板应当挂载 tooltip 控制器

test at test\settlement.test.js:349:1
✖ showLevels：接入 attachTooltips 并为金币余额与通关奖励绑定 tooltip 覆盖层 (0.1815ms)
  AssertionError [ERR_ASSERTION]: 关卡选择面板应当挂载 tooltip 控制器

test at test\settlement.test.js:380:1
✖ tooltip.js：attachTooltips 兼容 [data-tooltip] 裸属性并支持冒号拆分与无冒号文本 (0.6048ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  '' !== '名称'
```

### 2. GREEN 阶段（实现后全部通过）
运行 `npm test`：

```text
✔ showGameOver：接入 attachTooltips 并为结算奖励绑定可展示的 tooltip 覆盖层 (0.5642ms)
✔ showPause：接入 attachTooltips 并为三项设置项绑定语义化 tooltip 覆盖层 (0.3536ms)
✔ showLevels：接入 attachTooltips 并为金币余额与通关奖励绑定 tooltip 覆盖层 (0.3471ms)
✔ tooltip.js：attachTooltips 兼容 [data-tooltip] 裸属性并支持冒号拆分与无冒号文本 (0.3381ms)

ℹ tests 368
ℹ suites 0
ℹ pass 368
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 507.8998
```

## 顺手闭环同批 Minor

- **Minor-4（报告 hash 纪律）**：本任务作为评审后的修复任务，严格在报告中写出字面 commit hash，避免使用模糊代指。
- 零破坏、零数值变动、零多余重构。
