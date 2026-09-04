# Task 15：霓虹补给站与交互半径脉动

## 状态

完成。实现、测试与浏览器截图核验已完成；本报告与 Task 15 代码同一提交，未执行 push。

## 实现摘要

- `src/systems/map.js:194-276`
  - 新增 `SUPPLY_STATION_VISUAL_ID = 'scene.supplyStation'` 与 `SHOP_LABEL = 'SUPPLY'`。
  - 新增 `shopPulseState(timeSec, distance, interactR)`：交互判定保持严格 `distance < interactR`，只计算光环 `alpha/scale`。
  - 注册程序化补给站部件：棚屋、霓虹招牌描边、箱体图标与低成本交互光环；未生成 PNG。
  - 新增 `renderShop`，始终以 `shop.interactR` 作为渲染交互半径来源，并将动态参数按 `drawVisual` 契约嵌套在 `{ params: {...}, phase }` 中。
  - 未改动 5 座 `SHOP_POSITIONS`、商店半径、障碍物/碰撞、随机取值顺序或地图生成流程。
- `src/game.js:7,569`
  - 引入 `renderShop`，将旧版“店”字圆形绘制替换为补给站视觉渲染。
  - 商店自动打开判定逻辑保持原样，仍使用 `s.interactR`。
- `test/map.test.js:6-10,132-152`
  - 扩展 map 导入并新增 2 个失败先行用例，覆盖 5 座商店、90px 半径、视觉 ID/标签、严格边界与 alpha/scale 数值。
  - 移除与新导入常量同名的测试本地常量，保留原断言语义并改为使用生产导出。

## RED 证据

先按简报追加测试并运行：

```text
$ node --test test/map.test.js
file:///C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/test/map.test.js:9
  SHOP_INTERACT_R, shopPulseState, SUPPLY_STATION_VISUAL_ID, SHOP_LABEL,
                                                             ^^^^^^^^^^
SyntaxError: The requested module '../src/systems/map.js' does not provide an export named 'SHOP_LABEL'
...
✖ test\\map.test.js (42.8862ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
```

该失败来自缺少 Task 15 生产导出。由于一次导入了多个尚未存在的导出，Node 24 的实际报错名为 `SHOP_LABEL`，而不是简报中示例的 `shopPulseState`；详见“偏差/遗留”。

## GREEN 证据

实现后运行聚焦测试：

```text
$ node --test test/map.test.js
✔ 生成 60 个障碍，同种子可复现
✔ 出生点半径 200 内无障碍
✔ 障碍两两包围盒膨胀 150 后不相交
✔ 5 座商店位置固定且字段完整
✔ 障碍物避开商店（包围盒膨胀 150 不相交）
✔ 40 枚预撒银币（value=1）均不落在障碍内也不在商店内
✔ 障碍物有稳定 id，hash(id) 选择固定变体且圆/矩形数量保持 3/2 变体
✔ 障碍物新增视觉字段但碰撞字段与视觉 id 映射不变
✔ 霓虹补给站保持 5 座与 90px 交互半径，提示使用图标短标签
✔ 补给站交互光环只改变 alpha/scale，90px 边界仍为严格小于
ℹ tests 10
ℹ pass 10
ℹ fail 0
```

全量测试：

```text
$ npm test
ℹ tests 322
ℹ pass 322
ℹ fail 0
```

## 浏览器核验

通过 WebBridge 在 `http://localhost:3000/` 启动无尽模式并截图，观察到可见补给站为程序化棚屋，包含霓虹绿色招牌描边、交互光环、`SUPPLY` 短标签与箱体图标：

- `C:\Users\DEVELO~1\AppData\Local\Temp\kimi-webbridge-screenshots\screenshot_20260904_214817.296.png`

截图未作为项目文件提交。后台本地服务器已在核验结束后停止。

## 偏差/遗留

- 简报预期的 RED 示例为“缺少 `shopPulseState` 导出”，实际因同一 import 中存在多个缺失导出，Node 24 报告了最后一个缺失项 `SHOP_LABEL`；失败原因仍是 Task 15 导出不存在，非测试拼写错误。
- 当前 `test/map.test.js` 原有本地 `SHOP_INTERACT_R` 与简报要求的生产导入同名，会先触发重复声明；已删除该测试本地常量并使用 `map.js` 导出，数值与既有 90px 断言不变。
- 全量测试仍会输出项目既有的图片视觉 fallback warning（图标未预加载/未注册）；本任务未改动图标、图片或相关流程，所有 322 个测试均通过。
- 未改变玩法数值、碰撞几何、随机顺序、空间网格、音频或存档逻辑。
