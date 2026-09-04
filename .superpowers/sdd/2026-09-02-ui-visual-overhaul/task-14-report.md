# 任务14报告：障碍物稳定 id 与哈希变体视觉

- 状态：完成
- 实现：障碍物生成新增 `obstacle-*` 稳定 id 与哈希变体；注册岩石、车辆、混凝土块程序化视觉；战斗场景改用 `renderObstacle`。
- RED：`node --test test/map.test.js` 按预期因缺少 `RECT_VARIANT_COUNT` 导出失败（SyntaxError）。
- GREEN：`node --test test/map.test.js`：8/8 通过；本任务首次全量运行 `npm test`：319/319 通过；提交前共享工作区复跑：320/320 通过。
- 视觉核验：使用 WebBridge 打开战斗场景并截图，确认矩形车辆/混凝土块与多边形岩石正常绘制。
- 偏差/遗留：执行期间共享工作区另有独立 HUD 修复提交，未纳入本任务提交；未跟踪的 `heli_lq.mp3`、`index.html`、`package.json` 也未暂存；未改动碰撞几何、随机取值顺序、空间网格流程、音频、存档或玩法数值。
