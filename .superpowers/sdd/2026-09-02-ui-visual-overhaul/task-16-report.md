# Task 16：暗色草地 PNG 纹理 tile、霓虹边界与场景 palette 化

## 状态

完成。代码实现、单元测试与视觉调用参数断言全部完成；全量测试通过（330 pass，0 fail）。未执行 push。

## 实现摘要

- `src/systems/map.js`
  - 导出 `TERRAIN_TILE_SIZE = 128`。
  - 导出 `createTerrainTile(palette = PALETTE, canvasFactory = defaultCanvasFactory, imageLoader = getLoadedImage)`：
    - 读取 Task 15B 已缓存的 `scene.terrain.grass` 纹理；
    - 纹理就绪时绘制纹理并在上方覆一层 `palette.ground`（`globalAlpha = 0.28`）进行环境着色；
    - 纹理未就绪时回退绘制 `palette.ground` 纯色基底；
    - 生产环境使用 `defaultCanvasFactory`（浏览器中创建离屏 canvas，Node 环境安全返回 `null`）。
  - 导出 `createTerrainRenderer({ palette = PALETTE, canvasFactory = defaultCanvasFactory, imageLoader = getLoadedImage } = {})`：
    - 内部维护 `ensureTile()`，基于 `terrainPaletteKey(palette)` 缓存 tile；只有初始化或 palette 键值变化时才重新合成 tile；
    - `draw(ctx, viewport)`：按可见 CSS 视口范围循环平铺当前 tile；
    - 导出 `getTile()`、`getBuildCount()` 与 `invalidate()`。
- `src/game.js`
  - 引入 `createTerrainRenderer` 与 `PALETTE`。
  - 场景初始化阶段：创建 `terrain = createTerrainRenderer({ palette: PALETTE }); terrain.getTile();`，并挂载至 `scene.terrain`。
  - 17 处硬编码颜色字面量（枪口闪光、死亡击中粒子、受击跳字、道具使用提示、开发者模式、横幅）全部接入 `PALETTE` 对应语义字段（`gold`、`neon`、`text`、`textDim`）。
  - `render(ctx)` 场景渲染管线重构：
    - 使用 CSS 逻辑视口 `viewport = { x: camera.x, y: camera.y, width: camera.viewW, height: camera.viewH }`；
    - 地面背景使用 `PALETTE.ground`；
    - 相机位移下绘制平铺地形 `terrain.draw(ctx, viewport)`；
    - 地图边界绘制为霓虹警戒线：`strokeStyle = PALETTE.boundary`，`shadowColor = PALETTE.neon`，`shadowBlur = 10`，`lineWidth = 6`；
    - 撤离点虚线圈、射程圈、银币、玩家、特斯拉电球、横幅均从 `PALETTE` 取色；
    - 完整保留 Task 11/12/13/14/15/15B 的 `drawVisual`（火炮、围墙、辅助武器）与 `renderObstacle`、`renderShop`，无任何破坏与退行。
- 全局约束遵守：
  - 玩法数值、碰撞几何、随机取值顺序、空间网格流程、音频与存档逻辑未改动；
  - `drawVisual` 动态参数全部保持 `{ params: {...}, phase }` 嵌套；
  - 性能契约：地形 tile 仅在初始化或 palette 改变时离屏合成 1 次，每帧仅平铺 drawImage；绝不在每帧解码或 new Image。

## RED 证据

在修改生产代码前，先向 `test/map.test.js` 追加测试并运行：

```text
$ node --test test/map.test.js
file:///C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/test/map.test.js:11
  TERRAIN_TILE_SIZE, createTerrainRenderer,
  ^^^^^^^^^^^^^^^^^
SyntaxError: The requested module '../src/systems/map.js' does not provide an export named 'TERRAIN_TILE_SIZE'
```

在 `src/systems/map.js` 导出后、`src/game.js` 改造前运行，精准捕获边界颜色尚未接入 palette 的断言失败：

```text
✖ 场景渲染使用 PALETTE.boundary 与 PALETTE.neon 绘制霓虹边界且线宽为 6 (2.0749ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + '#4a4a52'
  - '#2a4a3a'
```

## GREEN 证据

完成实现后运行单元测试与全量测试：

```text
$ node --test test/map.test.js
✔ 生成 60 个障碍，同种子可复现 (8.083ms)
✔ 出生点半径 200 内无障碍 (0.7365ms)
✔ 障碍两两包围盒膨胀 150 后不相交 (1.2484ms)
✔ 5 座商店位置固定且字段完整 (1.045ms)
✔ 障碍物避开商店（包围盒膨胀 150 不相交） (1.3004ms)
✔ 40 枚预撒银币（value=1）均不落在障碍内也不在商店内 (1.1594ms)
✔ 障碍物有稳定 id，hash(id) 选择固定变体且圆/矩形数量扩展为 3/4 变体 (0.9887ms)
✔ 障碍物新增视觉字段但碰撞字段与视觉 id 映射不变，四变体新契约正确映射车辆/混凝土与对应精灵 id (0.6404ms)
✔ 霓虹补给站保持 5 座与 90px 交互半径，提示使用图标短标签 (0.5572ms)
✔ 补给站交互光环只改变 alpha/scale，90px 边界仍为严格小于 (0.5222ms)
✔ 未就绪/未注册时障碍物与补给站走程序化 fallback 路径，不调用 drawImage (1.3301ms)
✔ 图像就绪时进入混合渲染贴图路径：精确断言到达 drawImage 的实参（源图、坐标、宽高），程序化填充被跳过 (0.9595ms)
✔ 地形 tile 在初始化后只生成一次，draw 按可见范围平铺缓存合成 tile 且不逐帧重建 (0.496ms)
✔ 地形 palette 变化只触发一次重建，连续 draw 不重复生成 (0.1802ms)
✔ 地形图片未就绪时回退到纯色基底，不尝试绘制未缓存纹理 (0.1456ms)
✔ 场景渲染使用 PALETTE.boundary 与 PALETTE.neon 绘制霓虹边界且线宽为 6 (3.2778ms)
ℹ tests 16
ℹ suites 0
ℹ pass 16
ℹ fail 0

$ npm test
ℹ tests 330
ℹ suites 0
ℹ pass 330
ℹ fail 0
```

测试全绿（基线 326 -> 330 pass，0 fail）。

## 偏差/遗留

1. **简报测试用例平铺计数笔误修正**：
   - 简报 Step 1 用例中，在同一 target 上调用了两次 `renderer.draw(target, { width: 256, height: 128 })`（单次按 128 尺寸平铺 2 块 tile），累计调用 4 次 `drawImage`；简报写为 `assert.equal(target.drawImageSources.length, 2)` 属累加未清空笔误，测试修正为断言 4（并同时断言 `renderer.getBuildCount() === 1`，严格证明每帧平铺正常绘制且 tile 不重复生成）。
2. **简报 Step 3 `render(ctx)` 示例向后兼容**：
   - 简报中的 `render(ctx)` 包含了 Task 11/12/13 改造前的旧代码（如手绘火炮/围墙/辅助武器）；按指令与简报前言“行号已漂移，按内容定位；不得破坏已落地成果”，保留了 `TURRET_VISUAL_ID`、`WALL_VISUAL_ID`、`AUX_CONFIG` 的 `drawVisual`，仅对颜色、视口与边界进行 palette 化改造。
3. **补充边界参数断言用例**：
   - 为严格满足全局约束“视觉测试必须断言到达绘制调用的实际参数值（tile 重建次数、drawImage 源、边界颜色/线宽）”，追加了 1 个测试断言 `scene.render` 真实产生的边界属性（`PALETTE.boundary`、`PALETTE.neon`、`shadowBlur: 10`、`lineWidth: 6`），测试数由原 12 扩充至 16 个。
