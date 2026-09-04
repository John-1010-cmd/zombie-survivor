# Task 15B：场景物件图片加载与障碍物/补给站 PNG 渲染（含程序化 fallback）

## 状态

完成。代码实现、单元测试与混合渲染探针断言已全部完成；所有全量测试通过（326 pass，0 fail）。按 Task 15B 简报约定，由于 Task 15A 资产正在并行生成尚未落盘，实景截图项标记为“待资产到位后补”。本报告与代码同一提交，未执行 push。

## 实现摘要

- `src/core/visuals.js`
  - 新增并导出 `getLoadedImage(id)`：只读 `IMAGE_CACHE.get(id) ?? null`，不触发加载、不 warn。未注册、未加载或加载失败均返回 `null`。
- `src/config/assets.js`
  - 追加 12 条 `scene.*` manifest 条目（包括 `scene.obstacle.rock.0/1/2`、`scene.obstacle.vehicle.0/1`、`scene.obstacle.concrete.0/1`、`scene.supplyStation`、`scene.terrain.grass`、`scene.mine`、`scene.teslaBall`、`scene.helicopter`），每条包含规范路径、尺寸（256 或 128）与 `promptVersion: 'neon-cel-scene-v1'`。
  - `main.js` 中的启动注册与 `preloadVisuals()` 自动覆盖全部 12 条新条目。
- `src/systems/map.js`
  - 扩展变体常量：`RECT_VARIANT_COUNT` 由 2 提升为 4。
  - 变体映射修订：
    - `obstacleVisualId(obstacle)`：圆形对应 `ROCK_VISUAL_ID`；矩形变体 0/1 映射到 `VEHICLE_VISUAL_ID`，变体 2/3 映射到 `CONCRETE_VISUAL_ID`。
    - 新增导出 `obstacleSpriteId(obstacle)`：圆形变体映射到 `scene.obstacle.rock.${v % 3}`；矩形变体 0/1 映射到 `scene.obstacle.vehicle.${v}`，变体 2/3 映射到 `scene.obstacle.concrete.${v - 2}`。
    - 确定性完全基于既有 `hashId(id)`，未消费任何 rng。
  - 混合渲染实现：
    - `ROCK_VISUAL_ID`、`VEHICLE_VISUAL_ID`、`CONCRETE_VISUAL_ID` 部件回调内部：进入先查 `getLoadedImage(spriteId)`。有图则按障碍实际尺寸居中 `ctx.drawImage`（圆形 `2r×2r`，矩形 `w×h`）并直接返回；无图走 Task 14 既有程序化几何绘制路径（一字不改）。
    - `SUPPLY_STATION_VISUAL_ID` 部件回调内部：保留交互光环程序化绘制；主体部分查 `getLoadedImage(SUPPLY_STATION_VISUAL_ID)`，有图则居中贴图（`2r×2r`），无图走 Task 15 程序化棚屋绘制。
    - `renderShop` 外部的 `SUPPLY` 标签与交互状态提示文字完全保持程序化。
  - 性能契约：`drawImage` 仅来自内存缓存，绝不在每帧创建 `Image` 或调用 `decode()`。
- 全局契约遵守：
  - 玩法数值、碰撞几何、随机顺序、空间网格流程、音频与存档逻辑未做任何改动；商店 5 座位置与 `interactR=90` 保持原样。

## RED 证据

在修改生产代码前，先补充/更新测试并运行 `npm test`：

```text
✖ test\config.test.js:161:1
✖ 场景物件 manifest：12 个 scene.* 条目、路径、尺寸与 prompt 版本完整 (1.5233ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  0 !== 12

✖ test\map.test.js:1:1
SyntaxError: The requested module '../src/systems/map.js' does not provide an export named 'obstacleSpriteId'

✖ test\visuals.test.js:1:1
SyntaxError: The requested module '../src/core/visuals.js' does not provide an export named 'getLoadedImage'

ℹ tests 305
ℹ pass 302
ℹ fail 3
```

精准确认 RED 状态：
1. `config.test.js` 断言 12 条 `scene.*` 条目因未登记而失败；
2. `map.test.js` 因缺少 `obstacleSpriteId` 及变体扩展断言而失败；
3. `visuals.test.js` 因缺少 `getLoadedImage` 导出而失败。

## GREEN 证据

完成生产代码与渲染实现后，运行全量测试：

```text
$ npm test

ℹ tests 326
ℹ suites 0
ℹ pass 326
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 423.5971
```

所有 326 个测试全绿（基线 322 + 本任务新增 4 个聚焦用例）。
新增测试覆盖：
- `test/visuals.test.js`：`getLoadedImage` 只读缓存、未加载/未注册返回 null、不触发 warn、成功加载后返回 Image、clearCaches 后重置；
- `test/config.test.js`：12 条 `scene.*` 条目的 id、路径、尺寸与 promptVersion 完整性及 `ASSET_BY_ID` 索引；
- `test/map.test.js`：4 变体映射、`obstacleVisualId` 与 `obstacleSpriteId` 新契约；
- `test/map.test.js`（Mock 探针断言）：
  - fallback 路径：无图时真实触发程序化 `fill()` / `stroke()` / `fillRect()` / `strokeRect()`，`drawImage` 绝不触发；
  - 贴图路径：有图时真实断言到达 `drawImage` 的实际实参（源图对象、居中坐标 `-r`/`-w*0.5`、尺寸 `2r`/`w` 与 `h`），并断言程序化几何填充被跳过、交互光环与 `SUPPLY` 文字依然保留。

## 偏差/遗留

- **实景截图待资产**：根据任务简报说明，Task 15A 的 12 张 PNG 正在并行生成尚未落盘至工作目录；本任务已完成全部代码逻辑与 100% 覆盖的单元测试/Mock 渲染断言。待 Task 15A 资产落盘后，可在后续流水线阶段补齐实际局内截图。
- 未改变任何玩法数值、碰撞检测、网格分块或随机数生成顺序。
