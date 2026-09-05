# Task 21：怪物组合式 visual 与游戏内统一渲染

## 状态

完成。代码实现、单元测试、怪物视觉注册与全量回归测试全部通过；全量测试通过（358 pass，0 fail，在原有 353 pass 基础上净增 5 个）。本报告与代码同一原子提交，未执行 push。
- Commit: `5756316` (及其 amend 目标)
- 提交信息: `UI改造任务21: 怪物组合式 visual 与游戏内统一渲染`

## 实现摘要

- `src/config/bestiary/monsters.js`（修改）
  - 严格保持怪物 `hp`, `speed`, `damage`, `coin`, `radius`, `knockbackResist`, `cost`, `behavior`, `aoe`, `special` 等所有数值与机制字段零改动；
  - 将五种怪物的 `visual` 升级为组合式数据契约 `{ body, scale, palette: { fill, stroke, glow }, parts: [...] }`：
    - `normal`: body `circle`, scale `1`, palette `{ fill: 'ground', stroke: 'neon', glow: 'neonDim' }`, parts `eyes(angry, count: 2)`, `mouth(crooked)`, `cracks(spots, density: 0.2)`
    - `fast`: body `triangle`, scale `0.9`, palette `{ fill: 'gold', stroke: 'neon', glow: 'gold' }`, parts `eyes(narrow, count: 2)`, `trail(speed)`
    - `tank`: body `hexagon`, scale `1.3`, palette `{ fill: 'obstacle', stroke: 'gold', glow: 'gold' }`, parts `spikes(rim, count: 6)`, `mouth(thick-jaw)`
    - `boss`: body `pentagon`, scale `1.5`, palette `{ fill: 'panel', stroke: 'gold', glow: 'neon' }`, parts `spikes(multi, count: 10)`, `eyes(wide, count: 3)`, `mouth(glow)`
    - `exploder`: body `diamond`, scale `1.05`, palette `{ fill: 'gold', stroke: 'neon', glow: 'gold' }`, parts `cracks(fuse, density: 0.3)`, `spikes(sparks, count: 4)`
- `src/core/visuals.js`（修改）
  - 新增 `warnMonsterVisual(kind, id)` 与 `resolveMonsterColor(token, fallback)` 兜底处理函数；
  - 实现 `drawMonsterComposite(ctx, x, y, size, visual, options = {})`：
    - 正确计算 `drawSize = size * scale`、`radius = drawSize / 2`；
    - 解析 `palette` 中的 `fill`, `stroke`, `glow` 语义令牌；
    - 绑定并应用 `alpha`, `fillStyle`, `strokeStyle`, `shadowColor`, `shadowBlur`, `lineWidth`；
    - 绘制基础几何轮廓 `(body || SHAPES.circle)` 并填充、描边；
    - 两阶段分层绘制部件：第 0 阶段绘制 `trail`（底层），第 1 阶段绘制其他部件；
    - 部件不存在时安全触发告警并画小圆占位回退；
    - 传递 `{ ...part, palette: colors, lit, fuseProgress }` 与 `phase`；
  - 注册 5 种怪物组合部件：
    - `eyes`: 支持 `count`、`narrow` 细长、`angry` 怒目三角几何；
    - `mouth`: 支持 `crooked` 弯曲折线、`thick-jaw` 厚颚双线、`glow` 辉光口腔与发光阴影；
    - `cracks`: 支持 `spots` 斑点分布与 `fuse` 点火引信裂纹（带 `lit` 辉光脉动与 `fuseProgress` 透明度联动）；
    - `trail`: 支持 `speed` 拖尾三线动效；
    - `spikes`: 支持 `sparks` 引信火花与 `rim`/`multi` 环状尖刺阵列；
  - `drawVisual` 入口新增 `if (settings.visual)` 分支直接派发 `drawMonsterComposite`，使离屏 Canvas 与实体渲染共用同一描述符与分发路径。
- `src/entities/render.js`（修改）
  - 导出 `PARTS` 与 `SHAPES`；
  - 保持 `renderZombie(ctx, z, timeSec = 0)` 原签名与现有调用点兼容；
  - 怪物不存在 visual 时安全回退至霓绿圆；
  - 提取 `z.visualPhase`、`z.fuse`、`z.fuseDone`，计算 `breathing` 呼吸微缩放与 `bob` 颠簸；
  - 计算引信点燃时的 `fuseProgress`、尺寸膨胀与高频闪烁；
  - 调用 `drawVisual(ctx, z.type, z.x, z.y + bob, size, { visual, phase, lit, fuseProgress, alpha })`；
  - 保留并接入受击闪白 `z.hitFlash`（按 `visual.scale` 与 `visual.body` 进行纯白覆盖绘制）；
  - 保留受伤血条（`PALETTE.obstacle` 槽底 + `PALETTE.neon` 剩余血量）。
- `src/entities/zombie.js`（修改）
  - 新增 `visualPhaseFor(typeId, x, y)` FNV-1a 稳定视觉相位哈希计算；
  - `createZombie` 为生成的实体附加 `visualPhase` 字段；
  - 零改动 `updateZombie`、`damageZombie`、数值字段与 AI 行为。
- `test/bestiary.test.js`（修改）
  - 新增 `PARTS`, `createZombie`, `PALETTE`, `drawVisual` 引用；
  - 替换旧 `visual.shape/color` 断言为组合视觉契约全字段校验；
  - 新增五种怪物部件规格及引信 cracks 密度测试；
  - 新增 `renderZombie` 绘制参数（底槽与血条坐标/色值、fill/stroke 调用）测试；
  - 新增实体生成视觉相位稳定性与异坐标差异性测试；
  - 新增 5 种怪物通过 `renderZombie` 正常渲染及未知 body/part 安全回退断言。

## RED 证据

在生产代码修改前，先更新 `test/bestiary.test.js` 捕获预期失败：

```text
$ node --test test/bestiary.test.js
✖ 怪物清单 5 条：组合式 visual body/palette/parts 完整，逻辑字段保留 (2.3756ms)
  AssertionError [ERR_ASSERTION]: normal.visual.body
  + actual - expected
  + undefined
  - 'circle'

✖ 五种怪物的组合部件符合 §7 轮廓约定，自爆 cracks 密度为 0.3 (0.4894ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  + undefined
  - [ { count: 2, style: 'angry', type: 'eyes' }, ... ]

✖ renderZombie 使用组合 visual，保留引信 lit、受击闪白与血条绘制 (0.6962ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    {
  +   fillStyle: '#a33',
  -   fillStyle: '#4a4a52',
      h: 3, w: 26, x: 107, y: 59
    }

✖ createZombie 为实体生成稳定视觉相位，不改变数值字段 (0.1508ms)
  AssertionError [ERR_ASSERTION]: Expected "actual" to be strictly unequal to: undefined

✖ 每个怪物的 visual.body 与 visual.parts[].type 都已注册 (0.1082ms)
  AssertionError [ERR_ASSERTION]: normal.visual.body=undefined 未注册
```

## GREEN 证据

编写生产代码并补充完备测试后：

```text
$ node --test test/bestiary.test.js
✔ 怪物清单 5 条：组合式 visual body/palette/parts 完整，逻辑字段保留 (1.4588ms)
✔ 五种怪物的组合部件符合 §7 轮廓约定，自爆 cracks 密度为 0.3 (0.1578ms)
✔ 迁移数值与旧版一致（normal/fast/tank/boss） (0.1077ms)
✔ 自爆僵尸条目：behavior=exploder、aoe 30/80、cost 2 (0.0707ms)
✔ boss 标记 special；playableMonsters 默认排除 special、includeSpecial 包含（图鉴界面数据源，设计 §4.1/§7） (0.1423ms)
✔ 武器清单 7 条（6 迁移 + sniperRifle），必填字段契约齐全 (0.2388ms)
✔ 武器局外升级价：round5(40×1.5^lv)，0→10 累计 4540 (0.109ms)
✔ 难度表 weights 引用的怪物都存在（含无尽档 5 起的 exploder） (0.1029ms)
✔ 怪物条目：未击杀 → ??? 占位；首次击杀 → 解锁（名称/描述/基础数值/累计击杀） (0.1199ms)
✔ 武器条目：全部可见，携带局外等级与下一级提升 (0.1791ms)
✔ renderZombie 使用组合 visual，保留引信 lit、受击闪白与血条绘制 (1.8116ms)
✔ createZombie 为实体生成稳定视觉相位，不改变数值字段 (0.1393ms)
✔ 每个怪物的 visual.body 与 visual.parts[].type 都已注册 (0.1152ms)
✔ 所有 5 种怪物均可通过 renderZombie 正常渲染且无 visual 时安全回退 (0.5829ms)
✔ drawVisual 组合分支支持 unknown body 与 unknown part 安全回退 (0.8785ms)
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
```

全量测试套件验证：

```text
$ npm test
ℹ tests 358
ℹ suites 0
ℹ pass 358
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 497.7442
```

## 测试数量统计

- 基线测试数：353 pass
- `test/bestiary.test.js` 原有 10 个用例，重构 2 个原有 visual 断言用例，并新增 5 个组合 visual 与渲染用例，总计 15 个用例（净增 5 个）；
- 当前全量测试数：358 pass，0 fail，全部通过。

## 偏差/说明

1. **`render.js` 中的 `drawPlayer` 与 `renderProjectiles` 保留**：
   - 简报代码片段仅展示了 `renderZombie` 替换前后内容，但工作树中 `src/entities/render.js` 已承载 Task 19 的主角四向帧渲染 `drawPlayer` 与 Task 8/9 的弹道渲染 `renderProjectiles`；
   - 实施中完整保留了 `drawPlayer` 与 `renderProjectiles`，并在顶部同时导出 `SHAPES` 与 `PARTS`，确保旧有功能与测试完全无损。
2. **测试断言增强**：
   - 在 `mockCtx` 中增加了对 `fillRect` 调用参数（坐标 `x`, `y`, `w`, `h` 及当前 `fillStyle`）的捕获，明确断言 exploder 受损后血条底槽坐标为 `(107, 59, 26, 3)`、填充为 `PALETTE.obstacle`，血条本体为 `(107, 59, 13, 3)`、填充为 `PALETTE.neon`，满足真实参数断言要求。
3. **范围与红线遵守**：
   - 仅修改简报指定的 5 个文件（`monsters.js`, `visuals.js`, `render.js`, `zombie.js`, `bestiary.test.js`）；
   - 未碰触 `src/game.js`；
   - 新注册部件名 `eyes`, `mouth`, `cracks`, `trail`, `spikes` 与原有部件零冲突；
   - 未执行 git push。
