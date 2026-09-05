# Task 20：主菜单外观入口与皮肤选择界面

## 状态

完成。代码实现、单元测试、DOM 结构、CSS 布局与全量回归测试全部通过；全量测试通过（353 pass，0 fail，在原有 348 pass 基础上新增 5 个）。本报告与代码同一原子提交，未执行 push。

## 实现摘要

- `src/ui/skins.js`（新建）
  - 导出 `skinView(skin, meta)`：纯函数计算皮肤展示视图，返回 `id`, `name`, `description`, `portrait`, `owned`, `selected`, `price`, `balance`, `action`（'使用中'/'选用'/'解锁'）, `disabled`（selected 时禁用）, `affordable`（已拥有或金币充足）。
  - 导出 `applySkinAction(meta, skinId)`：纯函数处理皮肤购买与选用状态变更。
    - 校验 skinId 合法性（无效返回 `{ ok: false, reason: 'invalid-skin', skinId }`）；
    - 校验 meta.skins.owned 合法性（无效返回 `{ ok: false, reason: 'invalid-meta', skinId }`）；
    - 未拥有时：校验货币类型（非 gold 返回 `unsupported-currency`），校验并扣除金币（`spendGold` 失败返回 `insufficient-gold`），扣款成功后 push 进 owned 并将 selected 置为 skinId，返回 `{ ok: true, action: 'purchased', skinId }`；
    - 已拥有时：仅将 selected 置为 skinId，不扣金币，返回 `{ ok: true, action: 'selected', skinId }`。
  - 导出 `showSkins(rootEl, meta, onBack, onSave = () => {})`：
    - 渲染外观主界面：标题、当前余额（金币图标 + 金额）、皮肤卡片列表、右侧立绘与详情面板、取消按钮；
    - `mountPortrait`：调用 Task 19 已落地的 `getVisualCanvas(skin.portrait, 192, { frame: { direction: 'down', index: 0 } })` 从图集裁剪角色立绘；若读取失败自动回退到荒野冒险家立绘，双失败时文字降级；
    - `mountVisual`：挂载 `icon.currency.gold`（24×24）；
    - **状态纪律**：卡片点击仅修改局部 `previewId` 并重绘视图，绝不改写 `meta.skins.selected`；仅当点击 `#skin-action` 且操作成功时调用 `applySkinAction`，修改 selected / owned 并触发 `onSave()`；点击 `#skins-back`（“取消”）仅隐藏界面并调用 `onBack()`，绝不调用 `onSave()`。
  - 导出 `skinAssetPath(id)`：便捷查询 manifest 中的资产路径。
- `src/ui/menu.js`（修改）
  - `showMenu(rootEl, best, handlers)` 扩展接收 `handlers.onSkins`；
  - 菜单中插入 `<button id="menu-skins" class="btn btn-dim">外观</button>`；
  - 为 `#menu-skins` 绑定点击隐藏菜单并调用 `onSkins`，保持原有冒险、无尽、图鉴、武器升级行为不变。
- `index.html`（修改）
  - 在 `#ui-overlay` 容器内添加独立外观覆盖层节点 `<div id="skins" class="overlay interactive hidden"></div>`。
- `src/main.js`（修改）
  - 引入 `showSkins`；
  - 获取 `const skinsEl = document.getElementById('skins')`；
  - 新增 `showSkinsScreen()`：隐藏既有覆盖层、置空 currentScene，调用 `showSkins(skinsEl, meta, showMenuScreen, () => saveMeta(meta))`；
  - 在 `showMenuScreen()` 的 handlers 传入 `onSkins: showSkinsScreen`。
- `style.css`（修改）
  - 在菜单卡片区域追加 `#skins` 与皮肤界面布局；
  - 采用现有 CSS 变量（`--bg`, `--panel`, `--neon`, `--neon-dim`, `--gold`, `--text`, `--text-dim`, `--radius`），不引入新颜色体系；
  - 实现响应式网格布局（`.skin-layout` 双栏布局，并在 `max-width: 720px` 降级为单栏）。

## RED 证据

在编写生产代码前，先创建 `test/skins-ui.test.js` 并执行测试，捕获模块缺失报错：

```text
$ node --test test/skins-ui.test.js
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\hzc\GitRepo\John-1010-cmd\zombie-survivor\src\ui\skins.js' imported from C:\hzc\GitRepo\John-1010-cmd\zombie-survivor\test\skins-ui.test.js
    at finalizeResolution (node:internal/modules/esm/resolve:275:11)
    at moduleResolve (node:internal/modules/esm/resolve:865:10)
    at defaultResolve (node:internal/modules/esm/resolve:991:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:719:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:736:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:765:52)
    at #resolve (node:internal/modules/esm/loader:701:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:621:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:160:33)
    at ModuleJob.link (node:internal/modules/esm/module_job:245:17) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/src/ui/skins.js'
}

Node.js v24.14.0
✖ test\skins-ui.test.js (52.2661ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 57.1389

✖ failing tests:

test at test\skins-ui.test.js:1:1
✖ test\skins-ui.test.js (52.2661ms)
  'test failed'
```

## GREEN 证据

编写生产代码后，运行针对性单测与全量测试：

```text
$ node --test test/skins-ui.test.js
✔ skinView：默认皮肤显示拥有、使用中、免费和立绘 ID (0.8062ms)
✔ skinView：未拥有皮肤显示解锁、价格和当前余额 (0.1196ms)
✔ 购买失败：金币不足不扣款、不加入 owned、不改变 selected (0.1208ms)
✔ 购买成功：按注册表价格扣金币、加入 owned 并自动选中 (0.1009ms)
✔ 已有皮肤选用：只改变 selected，不改变金币和 owned (0.0896ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 61.0215
```

全量测试套件：

```text
$ npm test
ℹ tests 353
ℹ suites 0
ℹ pass 353
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 499.5124
```

353 个测试全部通过（原基线 348 + 新增 5 个 `skins-ui.test.js` 用例）。

## 实机与浏览器端到端验证

通过本地静态服务器与真实浏览器环境（Edge Headless + CDP）实景核对以下流程：
1. **主菜单入口**：主菜单显示“外观”按钮（`#menu-skins`），具有霓虹次级按钮样式。
2. **外观界面完整渲染**：点击“外观”后展示 3 张皮肤卡片（荒野冒险家/霓虹雇佣兵/暗夜猎手）、`getVisualCanvas` 图集裁剪立绘、名称、描述、金币图标、价格、当前余额和操作按钮。
3. **余额不足点击解锁**：0 金币时切换至“霓虹雇佣兵”点击“解锁”，显示“购买失败：金币不足”，未扣款且未改变 `selected`，未触发 `onSave`。
4. **取消不触发保存**：点击“取消”返回主菜单，重新进入外观时原 selected 依然保持荒野冒险家不变。
5. **购买成功**：给予充足金币（1000 金币）后点击“解锁”，金币正确扣除 800（余额变 200），提示“解锁成功，已自动选中”，状态变为“使用中”，触发 `onSave()` 写入 localStorage。
6. **已有皮肤选用**：点击荒野冒险家卡片，操作按钮显示“选用”，点击后更新为“已选用”，按钮变为“使用中”，触发 `onSave()`。

## 偏差/说明

1. **index.html 中的 `.interactive` 类**：
   - 简报示例片段写为 `<div id="skins" class="overlay hidden"></div>`。但在真实项目中，覆盖层统一放在 `<div id="ui-overlay">` 容器内，`style.css:29-30` 设置了 `#ui-overlay { pointer-events: none; }` 与 `#ui-overlay .interactive { pointer-events: auto; }`。
   - 为确保外观界面能够正常接收鼠标点击事件，`#skins` 节点类名设置为 `class="overlay interactive hidden"`，与既有 `upgrades`、`bestiary` 等覆盖层严格保持一致。
2. **未引入外置库**：
   - UI 纯函数与 DOM 交互完全使用原生 ES Module 与现代 DOM API，不依赖任何第三方运行时。
3. **Git 纪律与红线遵守**：
   - 仅触碰简报 Files 明确列出的 6 个文件；
   - 报告文件通过 `git add -f` 纳入版本控制；
   - 资产目录 PNG 未添加进 git 暂存区；
   - 提交信息遵循指令：`UI改造任务20: 主菜单外观入口与皮肤选择界面`；
   - 未执行 git push。
