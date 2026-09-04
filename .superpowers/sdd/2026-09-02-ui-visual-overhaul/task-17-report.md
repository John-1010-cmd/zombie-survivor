# Task 17：地雷、特斯拉球与直升机组合视觉

## 状态

完成。代码实现、单元测试与 mock ctx 双路径（有图/无图）实参断言全部完成；全量测试通过（334 pass，0 fail）。未执行 push。

## 实现摘要

- `src/entities/teslaball.js`
  - 导出常量 `MINE_VISUAL_ID = 'scene.mine'` 与 `TESLA_BALL_VISUAL_ID = 'scene.teslaBall'`。
  - 使用 `registerPart(MINE_VISUAL_ID, (ctx, size, params = {}, phase = 0) => { ... })` 注册地雷视觉部件：
    - 读取 `getLoadedImage(MINE_VISUAL_ID)`；
    - 图像就绪时通过 `ctx.drawImage(image, -r, -r, r * 2, r * 2)` 绘制 PNG 主体；
    - 图像未就绪时回退到内联几何 fallback（矩形底座 + 圆形引信）；
    - 程序化动效层：叠加金色中心警示光（呼吸动效 `Math.sin(phase * 8)`）与范围环覆盖层（`params.range ?? r * 3`）。地雷只提供视觉注册，不改动爆炸伤害逻辑。
  - 使用 `registerPart(TESLA_BALL_VISUAL_ID, (ctx, size, params = {}, phase = 0) => { ... })` 注册特斯拉电磁球视觉部件：
    - 读取 `getLoadedImage(TESLA_BALL_VISUAL_ID)`；
    - 图像就绪时通过 `ctx.drawImage(image, -r, -r, r * 2, r * 2)` 绘制 PNG 主体；
    - 图像未就绪时回退到内联几何 fallback（青霓脉冲发光核心球）；
    - 程序化动效层：叠加青霓双轨环绕电弧与周期闪电跳动折线。
  - `createTeslaBall` 返回对象新增 `visualId: TESLA_BALL_VISUAL_ID` 字段，其余数值（`r: 12`、`tickT: 0.25`、`life: 2.5`）与逻辑保持不变。
  - 导出 `renderTeslaBall(ctx, ball, phase)`，内部调用 `drawVisual` 并规范嵌套 `{ params: { radius: ball.r }, phase }`。
- `src/entities/helicopter.js`
  - 导出常量 `HELICOPTER_VISUAL_ID = 'scene.helicopter'`。
  - 使用 `registerPart(HELICOPTER_VISUAL_ID, (ctx, size, params = {}, phase = 0) => { ... })` 注册直升机视觉部件：
    - 读取 `getLoadedImage(HELICOPTER_VISUAL_ID)`；
    - 图像就绪时通过 `ctx.drawImage(image, -r, -r, r * 2, r * 2)` 绘制 PNG 机身主体（PNG 旋翼区域透明留空）；
    - 图像未就绪时回退到内联几何 fallback（机尾、机身、座舱、着陆架）；
    - 程序化动效层：按 `ctx.rotate(phase * 5)` 驱动旋翼旋转（`fillRect` + `strokeRect`）；登机中（`params.state === 'boarding'`）绘制金色进度光环（圆心 `(0, 0)`，半径 `r + 12`，弧度 `-Math.PI / 2` 到 `-Math.PI / 2 + progress * Math.PI * 2`）。
  - `createHelicopter` 返回对象新增 `visualId: HELICOPTER_VISUAL_ID` 字段，状态机与原有数值（`r: 60`、`landing: 3s`、`boarding: 3s`）保持不变。
  - 导出 `renderHelicopter(ctx, h, phase = h.t)`：理顺第三参数 `phase`，规范传递 `{ params: { state, progress }, phase }`。
- `src/game.js`
  - 引入 `renderTeslaBall`。
  - 移除内联电磁球手绘循环，替换为 `for (const b of scene.teslaBalls) renderTeslaBall(ctx, b, scene.time);`。
  - 直升机渲染 `renderHelicopter(ctx, scene.helicopter, scene.time)` 传递的 `scene.time` 被正式作为 `phase` 消费，旋翼动画平滑运行。
- 全局约束遵守：
  - 玩法数值、碰撞几何、随机序列、状态机、生命周期（特斯拉 2.5s / 直升机 3s+3s+60px）、音频与存档逻辑保持不变；
  - `drawVisual` 动态参数全部嵌套 `{ params: {...}, phase }`；
  - 性能契约：`drawImage` 仅读入 `IMAGE_CACHE` 缓存，禁止每帧 `new Image` 或临时解码。

## RED 证据

在修改生产代码前运行测试，捕获缺少导出的编译/运行时错误：

```text
$ node --test test/teslaball.test.js test/helicopter.test.js
file:///C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/test/helicopter.test.js:6
  HELICOPTER_VISUAL_ID,
  ^^^^^^^^^^^^^^^^^^^^
SyntaxError: The requested module '../src/entities/helicopter.js' does not provide an export named 'HELICOPTER_VISUAL_ID'

file:///C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/test/teslaball.test.js:7
  MINE_VISUAL_ID, TESLA_BALL_VISUAL_ID,
  ^^^^^^^^^^^^^^
SyntaxError: The requested module '../src/entities/teslaball.js' does not provide an export named 'MINE_VISUAL_ID'

✖ test\helicopter.test.js (48.8198ms)
✖ test\teslaball.test.js (50.7259ms)
ℹ tests 2
ℹ suites 0
ℹ pass 0
ℹ fail 2
```

## GREEN 证据

生产代码实现后，相关单元测试与全量测试全部通过：

```text
$ node --test test/teslaball.test.js test/helicopter.test.js
✔ createHelicopter 初始字段完整（含 visualId） (0.5267ms)
✔ landing 累计 3 秒后转为 waiting 且计时清零 (0.11ms)
✔ waiting 中玩家圆心距 < 60 进入 boarding (0.0724ms)
✔ waiting 中玩家圆心距恰 60 不登机（严格小于） (0.0617ms)
✔ boarding 累计 3 秒满 → victory 且 state=done (0.077ms)
✔ boarding 中途玩家离开 → 重置回 waiting 且计时清零 (0.0638ms)
✔ done 状态保持，不再返回 victory (0.0675ms)
✔ 直升机 PNG visual id 已注册且图片未就绪时保留旋翼、fallback 机身和登机光环 (0.4165ms)
✔ 直升机图像就绪时进入贴图路径：精确断言到达 drawImage 的实参，跳过 fallback 机身并保留旋翼与登机光环 (0.4249ms)
✔ createTeslaBall 字段齐全：r12 / tick 0.25 / life 2.5 / alive / visualId (0.8883ms)
✔ 沿 vx/vy 移动 speed*dt，返回存活 (0.1725ms)
✔ tick 伤害半径 30+僵尸半径 内僵尸（含击退与回调），圈外不受影响 (0.2543ms)
✔ tick 致死触发 onKill，忽略已死僵尸 (0.1206ms)
✔ tick 间隔：未满 0.25s 不重复结算，累计满才再次 tick (0.0982ms)
✔ life 耗尽 → alive=false 且返回 false (0.0781ms)
✔ mine 与 teslaBall PNG visual id 已注册，图片未就绪时保留 fallback 与动效层 (0.4545ms)
✔ mine 与 teslaBall 图像就绪时进入贴图路径：精确断言到达 drawImage 的实参，跳过 fallback 几何并保留动效层 (0.5215ms)
ℹ tests 17
ℹ suites 0
ℹ pass 17
ℹ fail 0

$ npm test
ℹ tests 334
ℹ suites 0
ℹ pass 334
ℹ fail 0
```

## 偏差/说明

1. **直升机渲染参数理顺（Task 16 评审留档闭环）**：
   - Task 16 评审指出：`game.js` 原有调用中传了第三参 `scene.time`（`renderHelicopter(ctx, scene.helicopter, scene.time)`），但此前 `helicopter.js` 中的函数签名仅为 `(ctx, h)`，导致 `scene.time` 沦为无意义死参数。
   - 本任务重构 `renderHelicopter(ctx, h, phase = h.t)`，正式接收 `phase` 并将其注入 `drawVisual(..., { params, phase })`，旋翼旋转按 `phase * 5` 平滑转动；同时提供默认形参 `phase = h.t`，确保孤立调用（未传第三参）仍可正常运转，完美闭环了死参数问题。
2. **测试探针扩充（有图/无图双路径严格断言）**：
   - 简报基础用例主要覆盖图片未就绪时的 fallback 与动效层。为严格遵守全局约束“视觉测试断言到达绘制调用的实际参数值;mock ctx 探针区分有图/无图双路径”，我们在 `teslaball.test.js` 和 `helicopter.test.js` 各自追加了 `FakeImage` 预加载就绪的断言用例：
     - 精确断言 `drawImage` 的实际入参（源图路径、居中 `(-r, -r)`、宽高 `(2r, 2r)`）；
     - 验证有图时 fallback 几何（地雷底座 `fillRect`、直升机机尾 `fillRect`、电磁球发光核心 `arc`）被严格跳过；
     - 验证有图时程序化动效层（旋翼旋转角度、登机进度光环半径与弧度、地雷金色警戒光与范围环、电磁球环绕电弧与闪电）仍然精确绘制。
   - 测试用例由基线 330 扩充至 334，全部通过。
