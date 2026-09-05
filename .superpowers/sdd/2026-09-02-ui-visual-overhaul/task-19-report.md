# Task 19：皮肤精灵资产与玩家渲染回退

## 状态

完成。代码实现、单元测试、资产配置、图集坐标断言与全量回归测试全部通过；全量测试通过（346 pass，0 fail）。本报告与代码同一提交，未执行 push。

## 实现摘要

- 资产落盘与规范：
  - 复制交付资产至本地目录：
    - `assets/img/skins/wasteland-adventurer/sprite.png`（512×256，8-bit/color RGBA）
    - `assets/img/skins/neon-mercenary/sprite.png`（512×256，8-bit/color RGBA）
    - `assets/img/skins/night-hunter/sprite.png`（512×256，8-bit/color RGBA）
  - 严格执行 Git 纪律，`assets/img/` 下 PNG 资产均不纳入 git 暂存区。
- `src/config/assets.js`
  - 定义模块内 const `SKIN_FRAME_ORDER` 数组（与简报规范一致），定义 4 列（down/left/right/up）× 2 行（frame 0/1）每帧 128×128 的切片坐标。
  - 登记 3 款皮肤共 6 个 manifest 条目（`skin.<id>.portrait` 与 `skin.<id>.sprite`）：
    - `portrait`：指向 kebab-case 路径，`size: 128`，`promptVersion: 'neon-cel-v1'`，`crop: { x: 0, y: 0, width: 128, height: 128 }`；
    - `sprite`：指向 kebab-case 路径，`size: 128`，`promptVersion: 'neon-cel-v1'`，`atlas: { width: 512, height: 256, frameSize: 128, columns: 4, rows: 2, frameOrder: SKIN_FRAME_ORDER }`。
  - `ASSET_BY_ID` 统一派生自完整 `ASSETS`。
- `src/entities/player.js`
  - `createPlayer` 新增 `moving: false, walkFrame: 0, walkClock: 0`。
  - `updatePlayer`：
    - 维持 Task 10 的 `turnToward` 平滑插值逻辑；
    - 根据移动输入状态更新 `p.moving`；
    - 移动时累计 `p.walkClock`，每满 0.12s 步进并对 2 取模更新 `walkFrame`；
    - 停止移动时立即重置 `walkFrame = 0` 与 `walkClock = 0`。
- `src/entities/render.js`
  - 新增并导出 `drawPlayer(ctx, player, timeSec, meta, { drawVisualFn = drawVisual } = {})`。
  - 根据 `meta?.skins?.selected` 与 `owned` 确定当前皮肤配置；未拥有或非法 ID 时回退。
  - 移动状态使用 `walkFrame % skin.framesPerDirection`，停止时使用帧 0。
  - 调用 `drawVisualFn(ctx, skin.sprite, player.x, player.y, player.r * 2, { frame: { direction, index }, warn: false, onFallback })`。
  - 资产缺失、加载未就绪或图集解析失败时，回退到 `drawWhitePlayer`（白色圆球 + 朝向线），且对每个非法/失败皮肤 ID 仅打印一次 warning。
- `src/core/visuals.js`（落实关键事实 4）
  - 针对图片类型视觉，在 `drawVisual` 中落实图集裁剪（`atlas.frameOrder`）与独立裁剪（`crop`）：
    - 匹配 `settings.frame` 时，按 `frameDef` 裁剪 `(x, y, width, height)` 并在目标位置 `(x - size, y - size, size * 2, size * 2)` 绘制；
    - 支持 `settings.onFallback?.()` 回调并在 `settings.warn === false` 时抑制通用警告；
    - `getVisualCanvas` 缓存 key 扩展加入 `frameKey`（`:${direction}:${index}`），支持按帧缓存。
- `src/game.js`
  - 引入 `drawPlayer`；
  - 替换主循环内联玩家渲染为 `drawPlayer(ctx, player, scene.time, meta)`，保持受击 `globalAlpha` 闪烁动效，受击/半径/数值逻辑不受影响。
- `docs/superpowers/visual-assets/skins-2026-09-02.md`
  - 完整记录 Prompt 技能、模型、模板版本、原子帧尺寸、图集布局与四维度审美验收结论。

## RED 证据

生产代码实现前运行测试，捕获预期的测试失败：

```text
$ node --test test/player.test.js test/skins.test.js
file:///C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/test/player.test.js:6
import { drawPlayer } from '../src/entities/render.js';
         ^^^^^^^^^^
SyntaxError: The requested module '../src/entities/render.js' does not provide an export named 'drawPlayer'

✖ test\player.test.js (57.8887ms)
✔ 首发皮肤清单与 schema 完整 (2.6133ms)
✔ 荒野冒险家免费且是默认皮肤 (0.6339ms)
✔ 付费皮肤注册表默认价格为 800 与 1500 金币 (0.0841ms)
✖ 每款皮肤都有 128px portrait crop 和 512x256 八帧 sprite manifest (1.043ms)
✖ manifest ID 与 skins.js 的 portrait/sprite 引用一一对应 (0.5843ms)
ℹ tests 6
ℹ suites 0
ℹ pass 3
ℹ fail 3

✖ failing tests:
test at test\skins.test.js:41:1
✖ 每款皮肤都有 128px portrait crop 和 512x256 八帧 sprite manifest (1.043ms)
  AssertionError [ERR_ASSERTION]: wastelandAdventurer.sprite manifest 缺失
```

## GREEN 证据

代码与资产接入后，运行任务相关测试与全量测试：

```text
$ node --test test/player.test.js test/skins.test.js
✔ 向右移动 1 秒前进 speed 距离 (0.6957ms)
✔ 斜向移动速度不叠加（归一化） (0.104ms)
✔ 被矩形障碍挡住且不陷入 (0.2827ms)
✔ 地图边界夹紧 (0.0794ms)
✔ 受伤 0.5s 无敌帧 (0.0887ms)
✔ 角度工具导出已确认常量并把角度归一到最短差值 (0.6358ms)
✔ turnToward 每次最多转 TURN_RATE×dt，未超限时准确到达目标 (0.1194ms)
✔ turnToward 跨越 ±pi 时选择短弧并保持连续角度 (0.0657ms)
✔ 玩家 facing 按 240°/s 上限插值而不是瞬时跳转 (0.0847ms)
✔ 玩家 facing 跨越 ±pi 沿短弧转动 (0.1199ms)
✔ 移动两帧切换，停止时回到第 0 帧 (0.0839ms)
✔ drawPlayer 按 selected、方向和停止帧调用 drawVisual (0.5654ms)
✔ drawPlayer 图片回退和无效 ID 每个 ID 只警告一次，并画白色圆球与朝向线 (0.2912ms)
✔ 首发皮肤清单与 schema 完整 (0.8899ms)
✔ 荒野冒险家免费且是默认皮肤 (0.6181ms)
✔ 付费皮肤注册表默认价格为 800 与 1500 金币 (0.0692ms)
✔ 每款皮肤都有 128px portrait crop 和 512x256 八帧 sprite manifest (0.1969ms)
✔ manifest ID 与 skins.js 的 portrait/sprite 引用一一对应 (0.0824ms)
ℹ tests 18
ℹ suites 0
ℹ pass 18
ℹ fail 0

$ file assets/img/skins/wasteland-adventurer/sprite.png assets/img/skins/neon-mercenary/sprite.png assets/img/skins/night-hunter/sprite.png
assets/img/skins/wasteland-adventurer/sprite.png: PNG image data, 512 x 256, 8-bit/color RGBA, non-interlaced
assets/img/skins/neon-mercenary/sprite.png:       PNG image data, 512 x 256, 8-bit/color RGBA, non-interlaced
assets/img/skins/night-hunter/sprite.png:         PNG image data, 512 x 256, 8-bit/color RGBA, non-interlaced

$ npm test
ℹ tests 346
ℹ suites 0
ℹ pass 346
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 453.5019
```

- 测试通过数：全量 346 个测试全部通过（基线 341 + 新增 5 个测试 = 346 pass，0 fail）。
- 资产文件验证：3 个皮肤 sprite 均为 512×256 RGBA PNG。
- 实机裁剪验证：真实代码路径测试（`test/visuals.test.js`）精确断言：
  - `drawVisual` 在生产调用（`drawPlayer` 传入 `size = player.r * 2 = 32`）下 `right` 帧 0 裁剪参数到达 `drawImage(image, 256, 0, 128, 128, 68, 68, 64, 64)`；
  - 跨行跨列帧（`up` 帧 1，`size = 16`，坐标 `(200, 150)`）到达 `drawImage(image, 384, 128, 128, 128, 184, 134, 32, 32)`；
  - portrait 裁剪参数（`size = 24`，坐标 `(50, 50)`）到达 `drawImage(image, 0, 0, 128, 128, 26, 26, 48, 48)`。

## 偏差/说明

1. **测试用例增量与基线**：
   - 任务 18 基线为 341 个通过用例。
   - 本任务初次提交新增 `test/skins.test.js`（+2 个 manifest/crop 用例，总数 5），`test/player.test.js`（+3 个动画/渲染回退用例，总数 13），总测试用例数为 346 个。
   - 修复轮在 `test/visuals.test.js` 新增 2 个图集切片与回退用例，总测试用例数严格增长为 348 个，全部绿灯。
   - `test/player.test.js` 完整保留了 Task 10 引入的 5 个平滑角度与最短弧插值用例，避免产生功能与测试回归。
2. **test/config.test.js 断言同步**：
   - `test/config.test.js:190` 原有 `assert.equal(ASSETS.length, 21 + 12);`（21 图标 + 12 场景物件），由于 Task 19 新增 6 个皮肤 manifest（3 sprite + 3 portrait），总长度更新为 `21 + 12 + 6 = 39`，已同步更新该断言确保全量测试通过。
3. **src/core/visuals.js 扩展**：
   - 依主会话关键事实 4 与简报 Interfaces 约定，扩展了 `drawVisual` 对 `options.frame`、`options.onFallback` 与 `options.warn` 的支持，避免生产运行时将整个 512×256 图集挤压到 32×32。
4. **Git 与范围红线**：
   - PNG 资产仅在工作区 `assets/img/skins/` 落盘，未进入 git 暂存区；
   - 任务报告通过 `git add -f` 随同提交；
   - 初次提交信息：`UI改造任务19: 皮肤精灵资产与玩家渲染回退`；
   - 修复轮提交信息：`UI改造任务19修复: 图集切片路径测试覆盖与回退双绘修复`。

## 修复轮（评审打回修复）

### 评审打回条目与修复措施

1. **Important #1：新增 atlas/crop 9 参切片路径零测试覆盖，报告实机裁剪验证数字不可复现且与生产调用不符**
   - **打回原因**：既有 `player.test.js` 的 `drawVisualFn` 是 mock，从不进入 `visuals.js` 真实切片代码路径；报告所写 `(84, 84, 32, 32)` 对应 `size=16` 的临时直调，而生产调用 `drawPlayer` 传入 `size = player.r * 2 = 32`，`(100, 100)` 处目标矩形应为 `(68, 68, 64, 64)`。
   - **修复措施**：
     - 在 `test/visuals.test.js` 新增用例 `atlas 与 crop 视觉就绪时精确传递 9 参 drawImage（切片与目标区域换算），未匹配帧显式回退`，基于 `FakeImage` + `preloadVisuals` 走通真实 `visuals.js` 渲染分支；
     - 精确断言 `drawImage` 的全部 9 项实参：源图实例、源矩形 `(sx, sy, sw, sh)`、目标矩形 `(dx, dy, dw, dh)`；
     - 覆盖三条关键路径：
       ① 方向与帧匹配切片（验证生产参数 `size=32` 下 `right/0` 以及跨行跨列 `up/1`，防止 sx/sy 颠倒或目标尺寸计算错误）；
       ② portrait 独立 crop 切片（验证 `(0, 0, 128, 128)` 裁剪到目标区域）；
       ③ 未匹配帧显式回退（返回 `false`，触发 `onFallback`，严禁静默画整图）。
     - 据实改写本报告实测验证描述与真实断言值。

2. **Minor #1：图片未就绪期双重绘制（paintFallback 霓绿圆与 onFallback 白色小人圆叠画）**
   - **打回原因**：`src/core/visuals.js` 失败路径先触发 `settings.onFallback?.()`，紧接着调用内置 `paintFallback` 绘制半径为 size（32）的霓绿圆；`drawPlayer` 的 `onFallback` 又绘制半径为 16 的白色圆球，导致每帧双重绘制两个圆，偏离简报“回退仅白色圆球+朝向线”。
   - **修复措施**：
     - 在 `src/core/visuals.js` 引入 `handleFallback` 逻辑：当调用方传入 `onFallback` 回调函数时，跳过内置 `paintFallback`，交由调用方全权负责回退表现；仅在未提供 `onFallback` 时执行默认的霓绿占位圆绘制；
     - 在 `test/visuals.test.js` 新增用例 `图片未就绪或回退时，若调用方提供 onFallback 则跳过内置 paintFallback，未提供则绘制占位圆`，覆盖未注册 ID、未就绪图片、未匹配帧以及 `drawPlayer` 端到端场景（断言仅绘制半径 16 的小人圆，无半径 32 的霓绿圆）。

3. **Minor #2：报告措辞失实（SKIN_FRAME_ORDER 并未导出）**
   - **打回原因**：报告正文摘要称“导出 SKIN_FRAME_ORDER 数组”，实际代码中 `src/config/assets.js:39` 为模块内 `const`。
   - **修复措施**：修正摘要第 16 行措辞为“定义模块内 const SKIN_FRAME_ORDER 数组（与简报规范一致）”。

### 新测试断言实参清单

在 `test/visuals.test.js` 中精确断言的真实实参：
- **Sprite 帧切片（right/0，生产尺寸 size=32）**：
  - 调用：`drawVisual(ctx, 'skin.wastelandAdventurer.sprite', 100, 100, 32, { frame: { direction: 'right', index: 0 } })`
  - 预期 `drawImage` 实参：`(spriteImage, 256, 0, 128, 128, 68, 68, 64, 64)`
  - 断言验证：`sx=256, sy=0, sw=128, sh=128, dx=68, dy=68, dw=64, dh=64` 逐项严格相等。
- **Sprite 跨行跨列切片（up/1，size=16）**：
  - 调用：`drawVisual(ctx, 'skin.wastelandAdventurer.sprite', 200, 150, 16, { frame: { direction: 'up', index: 1 } })`
  - 预期 `drawImage` 实参：`(spriteImage, 384, 128, 128, 128, 184, 134, 32, 32)`
  - 断言验证：`sx=384, sy=128, sw=128, sh=128, dx=184, dy=134, dw=32, dh=32` 逐项严格相等。
- **Portrait crop 裁剪（size=24）**：
  - 调用：`drawVisual(ctx, 'skin.wastelandAdventurer.portrait', 50, 50, 24)`
  - 预期 `drawImage` 实参：`(portraitImage, 0, 0, 128, 128, 26, 26, 48, 48)`
  - 断言验证：`sx=0, sy=0, sw=128, sh=128, dx=26, dy=26, dw=48, dh=48` 逐项严格相等。
- **未匹配帧显式回退**：
  - 调用：`drawVisual(ctx, 'skin.wastelandAdventurer.sprite', 100, 100, 32, { frame: { direction: 'invalidDirection', index: 99 }, onFallback })`
  - 断言验证：返回 `false`，`onFallback` 被调用，`drawImage` 调用次数为 0，`arc` 调用次数为 0（无内置占位圆）。
- **未匹配帧且未提供 onFallback**：
  - 调用：`drawVisual(ctx, 'skin.wastelandAdventurer.sprite', 100, 100, 32, { frame: { direction: 'invalidDirection', index: 99 } })`
  - 断言验证：返回 `false`，`drawImage` 调用次数为 0，`arc` 调用次数为 1（回退内置占位圆）。
- **onFallback 跳过内置 paintFallback**：
  - 未注册/未就绪视觉传入 `onFallback`：`arc` 次数为 0（跳过霓绿圆）；
  - 未注册/未就绪视觉未传 `onFallback`：`arc` 次数为 1（绘制半径为 size 的霓绿圆）；
  - `drawPlayer` 回退：`arc` 次数仅为 1 且半径严格为 `player.r = 16`（彻底消除双重绘制）。

### 全量测试结果

```text
$ npm test
ℹ tests 348
ℹ suites 0
ℹ pass 348
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
全量 348 个测试全部通过（原 346 + 新增 2 个 visuals 测试用例 = 348 pass，0 fail）。
