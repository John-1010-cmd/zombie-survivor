# Task 24：三视口实景验收与性能红线归档

## 状态

完成。纯函数统计与常驻 FPS 读数已实现；WebBridge 实景三视口截图与 5 秒满载压测数据采集已归档；包 4 场内三件套（火炮炮管追踪/石墙三档受损/辅助武器组合模型）实景存证已并入；单元测试与验收测试全部通过（371 pass，0 fail，在基线 368 pass 基础上净增 3 个）。

- 提交信息: `UI改造任务24: 三视口实景验收与性能红线归档`
- 父提交: `7cec77b`；本提交哈希: 见 git log HEAD（遵守报告 hash 纪律，不写字面自哈希）

## 实现摘要

- `src/ui/dev.js`
  - 导出纯函数 `summarizePerf(samples, { dpr, cssWidth, cssHeight })`：
    - 严格校验非空样本数组与各字段合法性（`frameMs`、`iconCacheHits`、`iconCacheMisses`、`drawImageCount` 必须为非负有限数）；
    - 计算平均帧时 `averageFrameMs`、峰值帧时 `peakFrameMs`、缓存命中与 miss 统计、`drawImageTotal` 与单帧峰值 `drawImageMaxPerFrame`；
    - 执行 DPR 封顶 2 逻辑（`Math.min(dpr, 2)`）。
  - 扩展 FPS 常驻状态与读数：
    - 增加 `fpsPeak` 峰值追踪；
    - 每秒刷新格式扩展为：`FPS ${Math.round(1000 / avg)} / 平均帧时 ${avg.toFixed(1)}ms / 峰值 ${fpsPeak.toFixed(1)}ms`。
- `test/dev.test.js`（新建）
  - 验证 `summarizePerf` 对平均帧时、峰值帧时、缓存命中、单帧 drawImage 统计及 DPR 封顶 2 的确定性计算；
  - 验证对空样本、负帧时、非法 drawImage 等边界的防御性异常抛出。
- `test/performance-acceptance.test.js`（新建）
  - 断言 `acceptance-2026-09-02-ui-visual-overhaul-package-8.md` 内嵌 JSON 结构完整性；
  - 断言三视口 CSS 尺寸合法性、DPR 在 1..2 范围内、截图路径命名规范；
  - 断言 5 秒压测平均帧时 ≤20ms、峰值有效性、图标缓存命中记录与 drawImage 次数统计；
  - 断言 1–8 任务包全量勾选与证据齐全；
  - 断言 15 项实景核对项（`REQUIRED_VISUAL_CHECKS`）全为 true。
- `docs/superpowers/package-8-performance.json` 与 `acceptance-2026-09-02-ui-visual-overhaul-package-8.md`（新建）
  - 归档 WebBridge 实测采集的三视口规格、连续 5 秒 300 帧压测原始数据与 summary 汇总；
  - 逐项记录 1–8 任务包实机交付证据与 15 项视觉核对项。
- 三视口实景截图归档（新建）
  - `docs/superpowers/ui-visual-overhaul-package-8-small.png` (640×360 CSS px, DPR 1)
  - `docs/superpowers/ui-visual-overhaul-package-8-wide.png` (1920×1080 CSS px, DPR 1)
  - `docs/superpowers/ui-visual-overhaul-package-8-high-dpr.png` (1280×720 CSS px, DPR 2)

## 包4 场内三件套实况存证核查

本次 WebBridge 实机验收在无尽模式下通过商店购买与部署道具，成功捕获并归档了 Task 10–13 任务包 4 的场内三件套存证：
1. **火炮炮管追踪**：场内固定火炮底座、铆钉与炮管就绪，炮管 `aimAngle` 沿最短弧平滑追踪射程内僵尸，开火时具备炮口闪光；
2. **石墙三档受损**：部署模块化石墙段，在僵尸啃食下呈现完好（intact）、破损（damaged）与濒危（critical）的三档裂缝纹理与霓虹描边；
3. **辅助武器组合模型**：随行无人机（四旋翼几何体）、随行移动火炮（履带与短管）、随行远程火炮（悬浮平台与长管）环绕玩家旋转与独立开火。

## 性能实测数据 vs 红线比对

- **压测环境与视口**：高负荷高分辨率高 DPR 视口 `highDpr`（1280×720 CSS px，DPR 2，物理画布 2560×1440）
- **场景负载**：400 只活跃僵尸同屏包围 + 满强化（8级四维）机枪约 400 发弹道 + 辅助武器 6 体环绕 + 固定火炮 + 围墙 + 场景物件与粒子
- **采样周期**：满载稳定后连续采集 5.0 秒（整 300 帧样本）

| 指标项 | 性能红线要求 | 实测数据 | 结论 |
|---|---|---|---|
| **采样时长** | 连续 5 秒 | 5.0 秒 (300 帧) | 合规 |
| **平均帧时** | ≤ 20.0 ms | **16.66 ms** (约 60.0 FPS) | **优于红线 (达标)** |
| **峰值帧时** | 有效数值且 ≥ 平均帧时 | 26.9 ms | 合规 |
| **DPR 限制** | 必须在 1..2 (≤2) | 2.0 (物理 2560×1440) | 合规 (封顶生效) |
| **图标缓存命中** | hits ≥ 1 | 1500 次 (0 次 miss) | 合规 |
| **同帧 drawImage** | 必须有统计且受控 | 总计 44,548 次 / 峰值 296 次/帧 | 合规 |

## TDD 证据

### 1. RED 阶段
创建测试文件后执行 `node --test test/dev.test.js test/performance-acceptance.test.js`：

```text
file:///C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/test/dev.test.js:3
import { summarizePerf } from '../src/ui/dev.js';
         ^^^^^^^^^^^^^
SyntaxError: The requested module '../src/ui/dev.js' does not provide an export named 'summarizePerf'

✖ failing tests:

test at test\dev.test.js:1:1
✖ test\dev.test.js (50.1678ms)
  'test failed'

test at test\performance-acceptance.test.js:22:1
✖ package-8：三视口截图、5 秒性能红线和 8 个任务包核对表齐全 (1.0105ms)
  AssertionError [ERR_ASSERTION]: 缺少 package-8 验收记录
  false !== true
```

### 2. GREEN 阶段
实现纯函数与常驻 FPS 峰值更新，落盘三视口截图与性能验收记录后执行针对测试与全量测试：

针对性测试：
```text
$ node --test test/dev.test.js test/performance-acceptance.test.js
✔ summarizePerf：平均/峰值帧时、缓存命中和同帧 drawImage 统计，DPR 封顶 2 (0.9255ms)
✔ summarizePerf：空样本和非法帧时拒绝，避免把缺测误报为通过 (0.3198ms)
✔ package-8：三视口截图、5 秒性能红线和 8 个任务包核对表齐全 (2.5775ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
```

全量回归测试：
```text
$ npm test
ℹ tests 371
ℹ suites 0
ℹ pass 371
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 448.038
```

## 变更文件清单

- `src/ui/dev.js`：新增导出 `summarizePerf`，扩展 `fpsTick` 峰值帧时统计。
- `test/dev.test.js`：`summarizePerf` 字段与边界断言。
- `test/performance-acceptance.test.js`：package-8 验收记录结构、三视口路径、5秒性能红线与任务包核对表测试。
- `docs/superpowers/package-8-performance.json`：实测性能原始样本与汇总 JSON。
- `docs/superpowers/acceptance-2026-09-02-ui-visual-overhaul-package-8.md`：内嵌 JSON 的 package-8 验收记录。
- `docs/superpowers/ui-visual-overhaul-package-8-small.png`：小视口实景截图 (640×360, DPR 1)。
- `docs/superpowers/ui-visual-overhaul-package-8-wide.png`：宽视口实景截图 (1920×1080, DPR 1)。
- `docs/superpowers/ui-visual-overhaul-package-8-high-dpr.png`：高 DPR 视口实景截图 (1280×720, DPR 2)。
- `.superpowers/sdd/2026-09-02-ui-visual-overhaul/task-24-report.md`：本报告。

## 偏差与边界说明

1. **报告 hash 纪律**：严格遵守多次迭代固化的 hash 纪律，统一标明父提交 `7cec77b` 并注明本提交见 git log HEAD，杜绝悬空提交与不实声明。
2. **范围红线**：仅修改简报 Files 列出的 `src/ui/dev.js`，新建测试、验收文档与截图证据；音频、存档、武器伤害公式、战斗/AI 数值未做任何修改。
3. **截图入库例外**：仅 `docs/superpowers/ui-visual-overhaul-package-8-*.png` 三张验收截图与 performance.json 入 git，`assets/img/` 下的游戏本地资产严格未纳入暂存。
