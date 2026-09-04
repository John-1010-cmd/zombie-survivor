# Zombie Survivor · UI / 视觉全面改造设计文档

日期：2026-09-02
状态：已与用户确认 14 项需求与 8 项关键裁定；本设计为现有代码基础上的 UI/视觉全面改造，尚未实施
技术栈：HTML5 Canvas + 原生 JavaScript（ES Modules），无构建工具、无框架；UI 图标、主角皮肤与场景物件（障碍物/补给站/地形/道具实体）引入 PNG，怪物、弹道与特效保持程序化几何（2026-09-04 修订，见 0.2a）
项目位置：`C:/hzc/GitRepo/John-1010-cmd/zombie-survivor/`

## 0. 背景与目标

当前游戏已经具备完整的战斗、商店、道具、辅助武器、图鉴与局外存档闭环，但画布、HUD、商店、升级、图鉴和实体渲染仍处在早期几何原型阶段：画布被固定在 1280×720，小屏会裁剪、大屏只留空白；HUD 依赖固定坐标和文字；商店、升级、道具栏、图鉴缺少统一图标；火炮、围墙、辅助武器、场景障碍与主角均使用零散的内联几何绘制。视觉数据虽已集中在部分配置表中，图鉴 UI 却没有复用游戏内视觉定义。

本设计将 UI 与视觉统一为**暗黑霓虹赛璐璐**体系：

1. 画布铺满响应式视口，逻辑坐标继续使用 CSS 像素，DPR 只负责内部清晰度。
2. 商店、升级、道具栏、图鉴、结算、暂停、关卡选择统一接入 128×128 透明 PNG 图标资产。
3. 怪物与弹道继续使用 Canvas 2D 程序化几何，不把“怪物数量会很多”的扩展成本转化为逐个出图成本；场景物件（障碍物、补给站、地形 tile、地雷/特斯拉球/直升机）自 2026-09-04 起改用 PNG 精灵（见 0.2a）。
4. 通过统一视觉注册表，让游戏内实体与图鉴使用同一份形状、部件、配色或图片定义。
5. 新增完整主角皮肤系统，首批提供“荒野冒险家”“霓虹雇佣兵”“暗夜猎手”三款皮肤，并通过既有金币经济解锁。
6. 把所有 Canvas 内颜色收敛到 CSS `:root` 与 `src/config/palette.js` 的同源令牌，消除 `game.js`、`hud.js` 中的散落硬编码色值。

本期是视觉/UI 改造，不改变现有音频、核心存储键、武器伤害公式、怪物 AI、刷怪预算、碰撞规则和局内经济语义；有意改变的视觉与交互行为均在后续章节以“现状 → 目标”明确说明。

### 0.1 演进关系与术语约定（重要）

本文档是在以下两份现有设计与实现基础上的后续设计：

- `docs/superpowers/specs/2026-08-14-zombie-survivor-design.md`：项目原始架构、银币商店、道具栏、辅助武器与实体上限等基础约定。
- `docs/superpowers/specs/2026-08-19-adventure-bestiary-meta-design.md`：冒险关卡、双图鉴、金币局外升级、统一数值管线与几何视觉方向。

约定：

- **“现状/现行”** = 当前代码的实际行为，后附文件出处；**“本设计/目标”** = 本文档描述的改造结果。
- 凡本设计与现状不一致处均为有意变更，实现者以目标为准，并按 §11 同步修订存量测试。
- “视觉注册表”指 `src/core/visuals.js` 的统一入口，包含程序化形状、程序化部件和图片视觉；“配置同源”指游戏实体与 UI 读取同一配置条目的视觉字段，不允许图鉴另维护一套颜色或形状。
- “图标”专指 UI/DOM 使用的图片视觉；武器配置中的 `visual` 仍专指弹道外观，武器本体图标单独使用 `icon` 字段。
- “组合式怪物”指 `body + palette + parts` 的程序化描述，不等于帧动画，也不要求每个怪物单独出图。
- 所有目标数值均作为本设计的验收口径；新增数值裁定在正文中显式标注“已确认”。
- 2026-08-19 设计中的“纯 Canvas、零图片资源”规则在本期被**有意收窄**两次：2026-09-02 起 UI 图标和主角皮肤改用 PNG；2026-09-04 起场景物件（障碍物/补给站/地形/道具实体）也改用 PNG（见 0.2a）。怪物、弹道与特效仍保持程序化几何，不与混合路线冲突。

### 0.2 修订记录（2026-09-02）

本轮围绕 UI/视觉改造逐条确认以下 8 项裁定：

1. **美术路线 = 混合（已确认；2026-09-04 经 0.2a 修订）**：商店、升级、道具栏、图鉴使用 k3-256k 生成的 128×128 透明底 PNG；场景物件自 2026-09-04 起改用 PNG 精灵；怪物、弹道与特效保持并升级程序化几何矢量。
2. **画布铺满 = 响应式视口（已确认）**：Canvas 内部分辨率为窗口 CSS 尺寸 × `min(devicePixelRatio, 2)`，CSS 尺寸为窗口 100%；通过 `ctx.setTransform(dpr, …)` 保持逻辑坐标为 CSS 像素；相机使用窗口 CSS 尺寸；HUD 按四角锚定。
3. **皮肤系统 = 完整系统（已确认）**：新增 `src/config/skins.js` 注册表与主菜单“外观”入口；首批三款皮肤，默认皮肤免费，其余使用现有金币解锁；`meta` 增加 `skins:{ owned, selected }`；精灵为四方向、每方向 2 帧、128px 赛璐璐小人；加载失败回退白色圆球。
4. **美术风格 = 暗黑霓虹赛璐璐（已确认）**：深色底、霓绿/金描边发光、赛璐璐二次元人物，并与设计令牌融合。
5. **架构 = 方案 A 统一视觉注册表（已确认）**：形状、程序化部件、图片预加载和离屏缓存集中到 `src/core/visuals.js`。
6. **补充项 9–14 全部纳入（已确认）**：其余实体、统一朝向平滑、Canvas 色彩令牌、图标资产规范与审美流程、性能红线、tooltip 与收尾界面图标同步均属于本期范围。
7. **怪物形象 = 矢量组合式升级（已确认）**：怪物数量扩展的边际成本约等于增加一条配置；k3-256k 只出概念设计稿作为审美基准，不进入游戏内怪物资产。
8. **模型分工（已确认）**：出图与审美评审使用 k3-256k（经 gpt-image-review 技能/CLIProxyAPI）；编码、文档和截图验收使用 gpt-5.6-luna-fast。

### 0.2a 修订记录（2026-09-04，第 9 项裁定）

9. **场景物件美术路线 = PNG 精灵（已确认，推翻裁定 1 与 0.4 中“场景保持程序化”的部分）**：局内实景验收（obstacle-before-ingame.png）确认程序化场景物件视觉上限过低。障碍物（岩石 3 变体、废弃车辆 2 变体、混凝土块 2 变体）、霓虹补给站、暗色草地地形 tile、地雷、特斯拉球、直升机全部改走 gpt-image-review 出图管线 + k3-256k 审美迭代，经统一视觉注册表的图片视觉路径渲染；Task 14/15 已落地的程序化绘制保留为图片未就绪或加载失败时的 fallback。怪物、弹道、粒子特效、部署物（固定火炮/围墙）、辅助武器与纯 UI 覆盖层（交互光环、脉动、发光描边、炮口闪光、登机进度环）维持程序化不变。动效部件允许“PNG 主体 + 程序化动效层”混合（直升机旋翼、特斯拉电弧、地雷警示灯）。性能口径：场景 PNG 的 drawImage 数量有界（≤60 障碍 + 5 补给站 + 少量道具），静态元素允许离屏合成缓存，§9 红线不变。变体映射沿用 Task 14 的稳定 id + hash 变体机制，同 id 同精灵，不引入每帧随机。

### 0.3 需求对应表

| # | 需求 | 对应章节 |
|---|------|---------|
| 1 | 画布铺满（响应式视口） | §2 |
| 2 | 武器 / 辅助武器 / 道具图标补齐：商店、武器升级、道具栏 | §3 |
| 3 | 火炮 UI 与建模优化，炮管平滑移动轨迹 | §4 |
| 4 | 围墙 UI 与建模优化 | §4 |
| 5 | 障碍物 / 商店 / 地形建模优化 | §5 |
| 6 | 主角皮肤系统：二次元冒险家 / 雇佣兵 | §6 |
| 7 | 图鉴怪物与实际形象强关联，新增怪物可直接沿用 | §7 |
| 8 | 图鉴武器图标重新设计 | §3、§7 |
| 9 | 地雷 / 直升机 / 特斯拉球等其余实体纳入建模优化 | §5 |
| 10 | 朝向平滑统一：主角 `facing` 与火炮炮管一起加旋转插值 | §4 |
| 11 | Canvas 内色彩令牌化：新建 `src/config/palette.js`，与 `style.css :root` 同源，启动时 `getComputedStyle` 读取同步，替换 `game.js` / `hud.js` 硬编码色值 | §2、§5 |
| 12 | 图标资产规范固化：尺寸档位、透明底、命名、prompt 模板入库，建立 k3-256k 审美验收流程 | §3、§8 |
| 13 | 性能红线：DPR 上限 2、图标离屏缓存、`drawImage` 次数受控 | §2、§9 |
| 14 | 悬停 tooltip，以及结算 / 暂停 / 关卡选择界面图标同步 | §3、§8 |

### 0.4 已确认的关键决策（逐条确认记录）

- **混合美术路线（已确认；2026-09-04 修订）**：UI 图标与主角皮肤使用 k3-256k 的 128×128 透明底 PNG；场景物件（障碍物/补给站/地形/道具实体）自 0.2a 起改用 PNG 精灵；怪物、弹道、部署物和特效使用程序化几何矢量。
- **响应式 Canvas（已确认）**：窗口 CSS 尺寸为逻辑视口，内部像素乘以 `min(devicePixelRatio, 2)`；`ctx.setTransform` 负责 DPR 缩放，所有游戏逻辑继续使用 CSS 像素；相机视口读取 CSS 尺寸。
- **完整皮肤系统（已确认）**：三款首发皮肤；“荒野冒险家”免费且默认拥有；“霓虹雇佣兵”“暗夜猎手”通过金币解锁；外观界面提供立绘、名称、价格和选用按钮；四方向 × 每方向 2 帧精灵；资源失败回退白色圆球。
- **暗黑霓虹赛璐璐风（已确认）**：深色底、霓绿与金色描边发光、赛璐璐二次元人物，CSS 与 Canvas 共用令牌。
- **方案 A 统一视觉注册表（已确认）**：`SHAPES`、图片视觉、怪物部件、离屏渲染与回退机制统一收口到 `src/core/visuals.js`。
- **补充项 9–14 全部纳入（已确认）**：不以“后续再做”削减需求范围。
- **怪物组合式扩展（已确认）**：新增怪物优先通过 `monsters.js` 一条配置和已有部件完成，不要求逐怪出图。
- **模型分工（已确认）**：k3-256k 负责图片资产与审美，gpt-5.6-luna-fast 负责代码、文档与实景截图验收。

## 1. 总体架构

### 1.1 新增与改动模块清单

目标目录与模块如下：

```
assets/img/
├── icons/
│   ├── weapons/       # 7 个武器本体图标（已确认）
│   ├── items/         # 5 个道具图标（已确认）
│   ├── aux/           # 3 个辅助武器图标（已确认）
│   ├── enhance/       # 4 个通用强化图标：伤害/攻速/弹道/射程（已确认）
│   └── currency/      # 2 个货币图标：银币/金币（已确认）
└── skins/             # 3 个皮肤资产包（已确认）

src/config/assets.js   # 图片资产 manifest：id / path / size / promptVersion
src/config/palette.js  # CSS :root 令牌读取与 Canvas 颜色出口
src/config/skins.js    # 皮肤注册表：id / 名称 / 立绘 / 精灵 / 价格 / 描述
src/core/visuals.js    # 统一视觉注册表、图片预加载、解码缓存、离屏缓存与回退
src/core/engine.js     # 新增 fitCanvas、resize 调度与 DPR 适配
src/entities/render.js # 改为视觉渲染门面；SHAPES 迁移到 visuals.js 并保留兼容出口
src/entities/turret.js # 增加 aimAngle 与最短弧平滑追踪
src/entities/player.js # facing 改为最短弧插值的视觉朝向
src/config/items.js    # 五道具补 visual.icon
src/config/bestiary/weapons.js # 七武器补 icon，原 visual 继续描述弹道
src/entities/companions.js       # AUX_CONFIG 三项补 icon
src/config/bestiary/monsters.js # visual 升级为组合式 body/palette/parts
```

`assets/img/skins/` 按皮肤 ID 计 3 个资产包；每个资产包可包含立绘裁剪信息与游戏内精灵图集，不把同一皮肤的多个裁剪区域重复算作新的皮肤条目。所有 PNG 的单帧原子图按 128×128 透明底规范制作（已确认）。

### 1.2 统一视觉注册表接口

`src/core/visuals.js` 提供以下接口：

```js
registerShape(id, pathFn)
registerPart(id, drawFn)
registerImage(id, url)

drawVisual(ctx, id, x, y, size, options)
getVisualCanvas(id, size, options)
```

- `registerShape(id, pathFn)`：承接现有 `SHAPES` 的圆形、三角形、六边形、五边形、菱形等路径画法。现有 `src/entities/render.js:10-18` 的 `poly()` 与 `src/entities/render.js:20-26` 的 `SHAPES` 迁入此模块。
- `registerPart(id, drawFn)`：注册怪物组合式部件，如 `eyes`、`mouth`、`cracks`、`trail`、`spikes`；部件函数只接收 Canvas 上下文、局部尺寸、参数与动画相位，不持有实体状态。
- `registerImage(id, url)`：登记 manifest 中的图片 URL，负责预加载、`decode()` 和成功后的图像缓存；图片缓存与离屏尺寸缓存分层，避免每次绘制重新解码。
- `drawVisual`：游戏内直接在目标 Canvas 绘制形状、部件或图片。未知视觉 ID 时回退到既有 circle 约定，并 `console.warn` 一次。
- `getVisualCanvas`：按 `id + size` 键控离屏 Canvas；UI 通过该出口得到可贴入 DOM 的图像，图鉴与游戏内调用同一视觉定义。
- 图片加载失败时同样回退到沿用 circle 约定的霓虹占位形状并 `console.warn`；皮肤加载失败由 §6 规定进一步回退为白色圆球。错误必须可见于开发者控制台，但不能中断游戏循环。
- `entities/render.js` 保留 `SHAPES` 的兼容 re-export 与实体渲染门面，存量测试仍有稳定的注册表护栏；真正的注册源只有 `visuals.js` 一处。

### 1.3 配置与数据流

配置、实体与 UI 的数据流为单向：

```
assets.js manifest ──预加载/解码──> visuals.js 图片缓存
palette.js <──启动时读取── style.css :root

monsters.js visual.body/palette/parts ──> entities/render.js ──> drawVisual()
weapons.js visual 弹道 + icon ──> combat/render 与 UI ──> drawVisual()/getVisualCanvas()
items.js visual.icon ──> 商店/HUD/tooltip ──> getVisualCanvas()
companions.js icon + 程序化类型 ──> 辅助武器 UI/实体渲染
skins.js portrait/sprite ──> 外观界面与玩家渲染

getVisualCanvas(id, size) ──> DOM <img>/<canvas> 覆盖层
```

目标保证：

- 实体视觉只读取自己的 `config.visual`，不在 `game.js` 复制颜色与形状。
- 图鉴怪物卡复用 `MONSTERS[type].visual`；游戏内 `renderZombie` 也复用该定义，像素级表现一致。
- 武器 `visual` 继续只描述 `bulletShape / color / trail / hitParticles / muzzleGlow`；新增的 `icon` 是武器本体 UI 图标，不会混入弹道逻辑。
- `game.js` 只负责场景组装、更新顺序与渲染调用，现有内联实体绘制逐步迁移到注册表门面。
- `src/core/storage.js` 仍只维护现有 `zs_best` / `zs_settings`；皮肤字段属于 `src/core/meta.js` 的 `zs_meta` 局外线，不把两套存储合并。

### 1.4 错误处理与兼容边界

- manifest 找不到 ID、URL 404、解码异常：登记失败状态，打印 `console.warn`，使用同尺寸的程序化占位形状继续运行。
- 皮肤资源失败：玩家渲染回退白色圆球，外观界面显示默认皮肤的可用立绘，不阻止进入游戏。
- 旧 `zs_meta` 存档没有 `skins`：迁移时补入默认拥有与默认选中皮肤，已有金币、武器等级、冒险进度与击杀统计原样保留。
- resize 事件只调度一次 `requestAnimationFrame` 的 `fitCanvas`，同一帧内合并多个事件；下一帧自然使用新视口，不在 resize 回调中重建实体或重置战斗状态。
- 任意未知 `shape`、`body`、`parts[].type` 或视觉 ID 都按 circle/占位形状回退；测试必须覆盖警告与不崩溃两条契约。

## 2. 响应式画布与 HUD 重锚定（需求 1、13）

### 2.1 现状

- Canvas 固定为 1280×720（`index.html:10`）；项目没有 resize、DPR 或视口缩放逻辑。
- 小屏由 `style.css:23` 的 `overflow:hidden` 直接裁剪，大屏由 `style.css:24` 的居中规则留下空白。
- 相机视口直接使用 Canvas 尺寸：`src/game.js:64` 调用 `createCamera(canvas.width, canvas.height)`，`src/core/camera.js:6-7` 保存该宽高；在引入 DPR 后继续使用物理像素会导致镜头尺度错误。
- HUD 在 Canvas 内按屏幕空间绘制（`src/systems/hud.js:26-27`），布局隐含固定画布尺寸。

### 2.2 目标：fitCanvas 与 DPR

`src/core/engine.js` 新增 `fitCanvas()`，启动时调用一次，随后监听 `window.resize` 并通过 rAF 合并调用：

```js
function fitCanvas(canvas, ctx) {
  const cssWidth = Math.max(1, window.innerWidth);
  const cssHeight = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // 上限 2，已确认

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { width: cssWidth, height: cssHeight, dpr };
}
```

- Canvas CSS 尺寸始终为窗口 100%；内部像素尺寸为 CSS 尺寸 × `min(devicePixelRatio, 2)`（已确认）。
- 所有游戏逻辑、绘制位置、碰撞与 HUD 数值继续以 CSS 像素为单位；不得把物理 `canvas.width/height` 当作逻辑视口。
- `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` 在 resize 后重新设置，并在每帧清屏/绘制前保证有效；不会改变世界单位或实体速度。
- `createCamera` 改为接收 `viewport.width`、`viewport.height`，或由 camera 提供同等的 resize 方法；相机视口永远是窗口 CSS 尺寸（已确认）。
- resize 只更新 Canvas、相机和 HUD 的视口快照，不重置玩家、僵尸、弹道、商店、道具或计时器。
- `style.css` 将 Canvas 设为 `width:100%; height:100%; display:block`，页面根容器占满视口；移除造成小屏裁剪和大屏留白的旧固定尺寸依赖。响应式画布不等于新增触屏输入，本期仍保持 PC 键盘输入边界。

### 2.3 目标：HUD 四角锚定

将 `src/systems/hud.js:26-27` 的固定屏幕坐标改为读取 `{ width, height }` 的逻辑视口，并使用统一安全边距令牌：

- **左上**：血条与银币，按左边距/上边距锚定。
- **右上**：计时与击杀数，按右边距/上边距锚定并右对齐。
- **左下**：道具栏 5 个槽位、数字键标记与当前武器信息，按左边距/下边距锚定（5 槽数量已确认）。
- **右下**：不放固定大块信息，仅承载交互提示、tooltip 锚点或短时反馈，避免遮挡战斗视野。

现有 HUD 的颜色硬编码（包括 `#5eff8a`、`#ffd75e`、`#122019` 等）迁移到 §5.4 的 palette 出口；布局计算只依赖逻辑 CSS 像素，不再出现 1280、720 的常量。

### 2.4 DOM 覆盖层

商店、暂停、结算、关卡选择、外观和 tooltip 使用 Canvas 上方的 DOM 覆盖层：

```css
#ui-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
#ui-overlay .interactive {
  pointer-events: auto;
}
```

覆盖层使用 `inset:0` 天然跟随窗口，不读取 Canvas 物理像素；可交互面板单独恢复 pointer events。Canvas HUD 与 DOM 面板共享 CSS 令牌，但不会尝试用 CSS 改写 Canvas 已提交的像素。

## 3. 图标体系与资产管线（需求 2、8、12、14）

### 3.1 现状

- 全项目无 emoji、无图标机制。道具栏是灰底方块与文字，例如“1 医疗包×2”（`src/systems/hud.js:87-96`）；武器信息是纯文字（`src/systems/hud.js:99-107`）。
- 商店和武器升级是纯文字卡片（`src/ui/shop.js:54`、`src/ui/upgrades.js:21-27`）。
- 图鉴使用 32×32 CSS 色块 `.bestiary-swatch`（`style.css:109-110`；`src/ui/bestiary.js:42,50`），只读取 `visual.color`，没有绘制真实形象。
- 七武器的 `visual` 字段描述的是弹道外观，而不是武器本体图标（`src/config/bestiary/weapons.js:6-56`）。

### 3.2 目标：资产清单与 manifest

`assets/img/` 的首批资产清单如下，数量均为本期已确认范围：

| 目录 | 数量 | 内容 | 使用位置 |
|---|---:|---|---|
| `icons/weapons/` | 7（已确认） | 七种武器本体图标 | 商店、武器升级、图鉴武器卡、tooltip |
| `icons/items/` | 5（已确认） | 五道具图标 | 商店、HUD 5 槽、tooltip、结算/暂停 |
| `icons/aux/` | 3（已确认） | 无人机、移动火炮、远程火炮 | 商店辅助武器组、辅助强化组、tooltip |
| `icons/enhance/` | 4（已确认） | 伤害、攻速、弹道、射程通用强化图标 | 商店强化组、升级提示、tooltip |
| `icons/currency/` | 2（已确认） | 银币、金币 | HUD、商店、升级、结算、外观 |
| `skins/` | 3（已确认） | 荒野冒险家、霓虹雇佣兵、暗夜猎手皮肤资产包 | 外观界面、玩家精灵 |

`src/config/assets.js` 为唯一资产 manifest，字段契约为：

```js
{
  id: 'icon.weapon.pistol',
  path: 'assets/img/icons/weapons/pistol.png',
  size: 128,
  promptVersion: 'neon-cel-v1',
}
```

- `id` 使用稳定的类别前缀与配置 ID；文件名使用小写 kebab-case，与 `weapons.js`、`items.js`、`AUX_CONFIG` 的 ID 一一对应。
- 图标源图统一为 128×128、透明底 PNG（已确认）。运行时显示尺寸分为 24、32、48、64 CSS px 四档（已确认），通过 `getVisualCanvas(id, size)` 生成对应离屏缓存，不为每个显示尺寸另存一份源图。
- 皮肤以 128×128 单帧为原子出图规范；四方向 × 每方向 2 帧编排为精灵图集，manifest 除 `size:128` 外记录裁剪所需的图集尺寸/帧顺序。主菜单立绘直接取静止帧放大显示，避免为同一皮肤维护第二套视觉。
- `promptVersion` 固定登记为 `neon-cel-v1`，模板归档在 `docs/superpowers/visual-asset-prompt-template.md`；改动 prompt 必须提升版本号并重新登记相关资产。

### 3.3 目标：出图规范与审美验收

k3-256k 的统一 prompt 模板如下，入库文档需原样保存以保证批量复现：

```text
暗黑霓虹赛璐璐风，[主体对象]，[用途/姿态]，深色底适配，霓绿/金描边发光，45°俯视微侧视角，单个主体居中，128×128 透明底 PNG，轮廓清晰、块面分明、可在 24/32/48/64px 显示，禁止文字、数字、水印和背景杂物。
```

出图规则：

- UI 图标、皮肤与场景物件精灵统一使用 k3-256k；怪物、弹道、部署物和特效不以图片代替程序化渲染。
- 透明底、主体居中、边缘清晰、无文字/数字/水印是硬性条件；尺寸与透视必须服从 128×128 原子规范和 45° 俯视微侧视角（已确认）。
- 统一审美维度为：风格一致性、透明底完整性、缩小后的辨识度、与霓绿/金色设计令牌的融合度。任一维度不达标即重出，不进入 manifest。
- 文件命名、目录、prompt 版本和人工审美结论一并写入 docs/ 资产记录；manifest 登记后才允许 UI 引用。

### 3.4 目标：接入点与同源规则

- **商店**：武器、道具、辅助武器、通用强化、货币均显示图标；“辅助武器”与“辅助强化”继续按三类分行，未拥有的辅助强化整行置灰，不改变现有购买条件。
- **武器升级**：每个武器卡显示本体 PNG、当前等级、下一级提升与金币图标；升级价格与等级仍由既有局外经济读取，不由图标配置改变。
- **道具栏**：HUD 固定 5 槽，每槽显示图标、数字键、数量角标；空槽显示统一低对比度锁定框，不再用灰色文字方块替代图标。
- **图鉴怪物卡**：通过 `getVisualCanvas` 绘制 `MONSTERS[type].visual`，不再使用 `.bestiary-swatch` 色块；未遭遇条目保留统一的 `???` 卡片。
- **图鉴武器卡**：改用 `weapons.js` 的 `icon` PNG；弹道 `visual` 只在游戏内弹体渲染中使用。
- **tooltip**：商店、升级、HUD 道具栏、辅助武器、图鉴、结算奖励和外观卡片支持悬停提示，至少包含名称、说明和当前可见数值；tooltip 由 DOM 覆盖层承载，跟随视口边界避免出屏。
- **结算 / 暂停 / 关卡选择**：沿用同一份图标 manifest 与 currency 图标，不另画一套临时符号；按钮图标只表达操作类别，文字仍保留以确保可读性。
- `src/config/items.js` 五条数据补 `visual: { icon: 'icon.item.<id>' }`；七条武器数据补 `icon: 'icon.weapon.<id>'`；`src/entities/companions.js` 的三项 `AUX_CONFIG` 补对应 `icon`。图标缺失只触发 §1.4 回退，不影响购买与使用逻辑。

## 4. 部署物与辅助武器建模（需求 3、4、10）

### 4.1 固定火炮：组合建模与平滑瞄准

**现状：**

- 固定火炮直接内联绘制于 `src/game.js:618-637`：深灰圆座、4px 炮管线段与耐久橙环，未接入视觉注册表。
- 瞄准角在开火瞬间由 `src/entities/turret.js:44-45` 的 `atan2` 覆写 `lastAim`；cooldown 期间不刷新，炮管表现为跳变。

**目标：**

- 将固定火炮视觉登记为组合式程序化 visual：底座为圆台并加铆钉描边；炮管为独立层，使用多边形炮管与炮口制退器；耐久状态使用墙体/部署物统一的发光描边语言。火炮 UI 卡片改用 `icons/items/` 中的固定火炮图标。
- `turret.js` 增加 `aimAngle`，创建时由现有 `lastAim` 或初始朝向初始化；每帧持续追踪当前目标，cooldown 期间也必须更新炮管角度。
- 角度采用最短弧插值：

```js
const TURN_RATE = 240 * Math.PI / 180; // 240°/s，已确认
const delta = Math.atan2(Math.sin(targetAngle - aimAngle),
                         Math.cos(targetAngle - aimAngle));
aimAngle += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, delta));
```

- 炮管进入目标角 ±15° 容差后才允许开火（`±15°` 已确认，弧度为 `Math.PI / 12`）；没有目标时保持最近朝向。开火结算、射程、伤害、cooldown 数值不改。
- 炮口闪光走现有特效管线，视觉注册表只负责炮口几何与颜色，避免在 `game.js` 再出现一套炮管绘制。

### 4.2 围墙：模块化石墙段

**现状：**

- `src/entities/wall.js:3-5` 的实体只有 `{ x, y, r: 22, hp: 150 × 1.5^n }`（半径 22、基准耐久与成长公式均保留，已确认）。
- 围墙没有实体自有渲染；`src/game.js:603-615` 内联绘制石灰圆段与受损绿色耐久弧。

**目标：**

- 视觉注册表新增模块化石墙段：墙体为不规则多边形，顶部加垛口，表面加裂缝纹理；碰撞半径、放置、受损和销毁逻辑不变。
- 按 `hp / maxHp` 分三档（已确认）：`> 0.66` 为完好、`0.33 < ratio ≤ 0.66` 为破损、`≤ 0.33` 为濒危。三档分别增加裂缝密度、降低填充亮度，并让墙顶描边发光代替旧的绿色耐久弧（阈值已确认）。
- 围墙 UI 使用道具图标与耐久说明；无数量上限等既有部署规则不改。

### 4.3 辅助武器：三类组合模型

**现状：**

- `src/entities/companions.js:5-8` 的 `AUX_CONFIG` 定义 drone、gunner、sniper；环绕半径/角速为无人机 90px@2.2rad/s、移动火炮 60px@1.4rad/s、远程火炮 100px@1.0rad/s（均保留，已确认）。
- 三类辅助武器均环绕玩家；`src/game.js:643-661` 内联绘制为青三角、橙方块、蓝菱形单色形状。

**目标：**

- 环绕运动逻辑、半径和角速完全保留；只替换视觉与瞄准表现。
- **drone**：四旋翼机身，中央圆舱、四条旋翼臂与旋转桨叶动画，使用青霓光；旋翼动画只改变绘制角，不改变 orbit 角。
- **gunner**：轮式底盘与短炮管，炮管对目标作平滑指向，使用橙霓光；开火时显示短时炮口闪光。
- **sniper**：悬浮狙击平台与长枪管，炮管对目标作平滑指向，使用蓝霓光；开火时显示窄长炮口闪光。
- 三类的 UI 图标来自 `icons/aux/`；辅助强化仍按 drone/gunner/sniper 分行，未拥有整行置灰。
- 辅助实体的程序化视觉与 UI 图标是两个层次：图标用于 DOM/面板，场内模型使用视觉注册表的几何组合，不在每帧 `drawImage` 贴图。

### 4.4 朝向平滑统一

主角与部署物使用同一套最短弧角度工具和 `TURN_RATE = 240°/s` 上限（已确认）：

- 火炮使用 `aimAngle` 追踪目标，并用 ±15° 开火容差（已确认）。
- 主角保留现有 facing 目标角来源，只把 `src/entities/player.js:8-16` 的瞬时 `atan2` 赋值改为最短弧插值；该角度主要影响玩家精灵/朝向线的视觉，不改变移动、碰撞或自动索敌伤害。
- 角度差统一用 `atan2(sin(delta), cos(delta))` 归一到 `[-π, π]`，避免跨越 ±π 时走长弧。
- 受击 `globalAlpha` 闪烁和无敌逻辑保留；主角由白色实心圆升级为 §6 的皮肤精灵，精灵失败时仍绘制白色圆球。

## 5. 场景建模（需求 5、9、11）

### 5.1 现状与不变的地图约束

- 地图尺寸为 3000×3000（`src/systems/map.js:3`）。
- 随机障碍共 60 个，约 50% 圆形、50% 矩形（`src/systems/map.js:43-45`）；出生点 200px 安全半径内不放障碍（已确认保留）。
- 商店位置为 5 座硬编码位置（`src/systems/map.js:11`），交互半径为 90px（`src/systems/map.js:10`）；预撒银币 40 枚（已确认保留）。
- 现行地图渲染集中于 `src/game.js:531-566`：边界灰框、障碍统一使用 `#4a4a52` 实心色块、地面使用硬编码 `#1a2418`；商店在 `src/game.js:548-560` 中绘制为棕色圆、金色描边与 28px“店”字。

本期只升级视觉，不改变地图尺寸 3000×3000、障碍数量 60、圆/矩形生成比例、5 座商店、40 枚银币、出生点安全半径 200px、商店交互半径 90px 或任何碰撞/阻挡规则（全部已确认保留）。

### 5.2 目标：障碍物与商店

- **圆形障碍 → 岩石（2026-09-04 修订为 PNG 精灵）**：碰撞仍使用原圆形半径；绘制改用 gpt-image-review 出图的岩石精灵，3 个变体经稳定 `id` 的 `hash(id)` 选择；同一地图种子下同一障碍的变体不得因帧数变化；图片未就绪或加载失败时回退 Task 14 已交付的程序化多边形（顶部高光、底部阴影、霓光细描边）。
- **矩形障碍 → 废弃车辆 / 混凝土块（PNG 精灵）**：保留轴对齐碰撞盒；车辆与混凝土块各 2 个变体精灵，`variant` 稳定映射，不扩大阻挡范围；fallback 为 Task 14 程序化色块组合。
- **商店 → 霓虹补给站（PNG 主体 + 程序化覆盖层）**：保留 5 座位置与 90px 交互半径；棚屋主体改用 PNG 精灵，`SUPPLY` 短标签与地面交互半径光环维持程序化覆盖层，光环以低成本 alpha/scale 脉动提示可交互，不阻挡移动或弹道；fallback 为 Task 15 程序化棚屋组合。
- 视觉变体只依赖障碍 `id` 与配置，不依赖 `Math.random()` 每帧重选；障碍物的逻辑字段、空间网格登记和碰撞测试保持原样。

### 5.3 目标：地形、边界与其余实体

- **地形（2026-09-04 修订为 PNG 纹理）**：地面改为暗色草地。草地纹理由 gpt-image-review 出图为无缝可平铺 PNG，地图初始化时合成为离屏地形 tile（可按 palette 做一次性着色/调暗），再按可见范围平铺；每帧只做贴图合成，不重新生成。调色板变化时重建一次 tile，resize 不按每帧重建。图片未就绪时回退纯色基底。
- **边界**：灰色矩形边框改为霓虹警戒线，保留世界边界和相机夹紧逻辑；颜色、发光强度和警示状态全部读取 palette。
- **地雷（2026-09-04 修订为 PNG 主体）**：当前仓库没有独立 `mine` 实体模块；炸弹 AoE 仍由 `src/systems/combat.js:1-6` 处理。本设计为部署地雷/落点爆炸类实体登记统一 `mine` visual id：PNG 地雷主体 + 程序化中心警示光与范围环覆盖层，先解决视觉注册与 UI 图标契约，不改变当前炸弹伤害、范围或触发逻辑。
- **特斯拉球（PNG 主体 + 程序化电弧）**：逻辑保持 `src/entities/teslaball.js:1-31` 的移动、周期电击和 2.5s 生命周期（已确认保留）；视觉改为 PNG 电磁球主体 + 程序化环绕电弧与周期闪电覆盖层，颜色使用青霓 token。
- **直升机（PNG 主体 + 程序化旋翼）**：逻辑状态机与降落/登机规则保持 `src/entities/helicopter.js:1-30` 的 3s 降落、3s 登机和半径 60px（均已确认保留）；视觉改为 PNG 机身主体 + 程序化旋翼（继续按动画相位旋转）与登机进度光环覆盖层，不改变救援计时。

### 5.4 Canvas 色彩令牌化

**现状：**

`style.css:12-21` 已有 `--bg`、`--panel`、`--neon`、`--neon-dim`、`--gold`、`--text`、`--text-dim`、`--radius` 八个令牌，但 Canvas 与 CSS 脱钩：`hud.js` 使用 `#5eff8a`、`#ffd75e`、`#122019` 等硬编码，`game.js` 使用 `#1a2418`、`#4a4a52` 等硬编码。

**目标：**

- 新建 `src/config/palette.js`，在浏览器启动时通过 `getComputedStyle(document.documentElement)` 读取 CSS `:root`，把令牌同步为 Canvas 可用的颜色对象；CSS `:root` 是浏览器主题的单一来源。
- 保留原有八个公共令牌，并新增语义别名：`--canvas-ground` 默认 `#1a2418`、`--canvas-obstacle` 默认 `#4a4a52`、`--canvas-hud-panel` 默认 `#122019`、`--canvas-boundary` 默认复用 `--neon-dim`（默认值迁移自现状，已确认保留）。
- `palette.js` 的 Canvas 出口按语义提供 `ground`、`obstacle`、`hudPanel`、`neon`、`neonDim`、`gold`、`text`、`textDim`、`radius` 等字段；`game.js`、`hud.js`、`entities/render.js`、场景与实体注册部件不得再直接写十六进制色值。
- Node 测试没有 DOM 时，`palette.js` 使用与 CSS 默认值一致的安全默认表；浏览器启动后立即用 `getComputedStyle` 覆盖，保证测试可运行且生产环境同源。
- 任何主题/令牌变更都清空受影响的离屏视觉缓存，避免旧颜色留在 `id+size` 缓存中。

## 6. 主角皮肤系统（需求 6）

### 6.1 现状

- 主角当前为白色实心圆与 3px 白色朝向线，绘制在 `src/game.js:666-677`；受击时通过 `globalAlpha` 闪烁。
- `src/entities/player.js:8-16` 的 `facing` 为 `atan2` 瞬时转向，没有皮肤或外观字段。
- `src/core/meta.js:8-16` 的默认存档只有版本、金币、武器等级、冒险进度和图鉴击杀统计；`src/core/meta.js:20-51` 的 `normalizeMeta` 也没有 `skins` 白名单。

### 6.2 目标：skins.js 注册表

新增 `src/config/skins.js`，每条皮肤必须包含以下字段：

```js
{
  id: 'wastelandAdventurer',
  name: '荒野冒险家',
  portrait: 'skin.wastelandAdventurer.portrait',
  sprite: 'skin.wastelandAdventurer.sprite',
  frameSize: 128,
  directions: ['down', 'left', 'right', 'up'],
  framesPerDirection: 2,
  price: { currency: 'gold', amount: 0 },
  description: '在废土中寻找补给与出路的可靠冒险家。',
}
```

首批三款（名称与身份已确认）：

| id | 名称 | 初始状态 | 价格契约 |
|---|---|---|---|
| `wastelandAdventurer` | 荒野冒险家 | 免费、默认拥有、默认选中（已确认） | `gold` 金币金额为 0（已确认） |
| `neonMercenary` | 霓虹雇佣兵 | 未拥有（已确认） | 由 `price.currency='gold'` 与 `price.amount` 配置提供；逻辑不写死金额（已确认） |
| `nightHunter` | 暗夜猎手 | 未拥有（已确认） | 由 `price.currency='gold'` 与 `price.amount` 配置提供；逻辑不写死金额（已确认） |

金币解锁的**接口**已确认，但本设计不把两款付费皮肤的具体金币金额固化为逻辑常量：商店/外观界面只读取 `skins.js` 的 `price.amount`，后续平衡调整只改注册表，不触碰存档迁移和购买流程。这是定价留接口的明确边界，不是未完成字段。

### 6.3 目标：精灵规格与回退

- 每款皮肤为四方向行走精灵：`down / left / right / up` 四向，每向 2 帧（已确认），单帧 128px 赛璐璐二次元小人（已确认）。
- 资源按 128×128 透明底原子帧制作；运行时可编排为四列 × 两行的 512×256 图集，manifest 记录帧顺序。停止时使用该方向第 0 帧，移动时在两帧间切换；不引入第三套动作图。
- `drawPlayer` 根据 `meta.skins.selected` 取得 `SKINS[selected].sprite`，通过视觉/图片缓存绘制；受击闪白保留，不能改变皮肤选择。
- 精灵加载失败、图集裁剪异常或选中 ID 无效时，立即回退白色圆球与朝向线；回退不抛异常、不阻塞 rAF，并输出一次 `console.warn`。
- 皮肤的 UI 立绘与游戏精灵来自同一皮肤资产包；主菜单放大静止帧作为立绘，确保 UI 与游戏内颜色、服饰和轮廓一致。

### 6.4 目标：外观入口与界面

主菜单新增“外观”入口，进入外观选择界面。界面必须包含：

- 皮肤大图/静止立绘；
- 名称与描述；
- 金币图标与价格；
- “解锁”或“选用”按钮；已选中项显示“使用中”，未拥有项不能直接选用；
- 当前金币余额与购买失败提示。

购买统一复用 `meta` 的金币收支函数；解锁成功后加入 `owned` 并自动选中，取消/返回不改变选中状态。界面使用 §3 的 tooltip、货币图标与按钮令牌，不为外观单独建立视觉体系。

### 6.5 目标：meta 迁移与 normalize

目标存档版本升级为 2（已确认），在现有结构上增加：

```js
{
  version: 2,
  gold: 0,
  weaponLevels: {},
  adventure: { unlocked: 1, firstClear: {}, bestTimes: {} },
  bestiaryKills: {},
  skins: {
    owned: ['wastelandAdventurer'],
    selected: 'wastelandAdventurer',
  },
}
```

- `defaultMeta()` 默认加入 `skins.owned` 与 `skins.selected`；默认拥有且选中荒野冒险家。
- `normalizeMeta` 先识别旧版本，再逐字段校验；version 1 或缺失 `skins` 的旧存档自动补默认皮肤，保留合法的金币、武器等级、冒险进度和击杀统计。
- `owned` 只保留 `SKINS` 注册表存在的 ID；`selected` 必须属于 `owned`，否则回退 `wastelandAdventurer`。
- version 迁移分支落在 `src/core/meta.js:22` 预留位置附近，并扩展 `src/core/meta.js:20-51` 的白名单校验；`src/core/storage.js` 不改动。
- 读写仍使用 `zs_meta`，保存失败遵循既有 try/catch 静默保护；新增皮肤字段不能改变 `zs_best`、`zs_settings`。

## 7. 怪物组合式升级与图鉴强关联（需求 7、8）

### 7.1 现状

- `src/config/bestiary/monsters.js:11,18,25,32,40` 的五种怪物视觉目前是 `{ shape, color, glow }`。
- `src/entities/render.js:20-26` 注册圆形、三角形、六边形、五边形、菱形；未知 shape 在 `src/entities/render.js:38` 回退 circle；`renderZombie` 的统一填色、发光、受击闪白和血条逻辑在 `src/entities/render.js:29-70`。
- 游戏内与图鉴数据源已经相同：`MONSTERS[type].visual` 被 `renderZombie` 每帧读取；`src/entities/zombie.js:8-21` 创建实体时只保存 `type`，不拷贝 visual。
- 图鉴 UI 目前只读取 `visual.color` 绘制色块（`style.css:109-110`、`src/ui/bestiary.js:42,50`），没有引用 `SHAPES` 或真实游戏渲染。

### 7.2 目标：组合式 visual schema

`monsters.js` 的视觉字段从 `{ shape, color, glow }` 升级为：

```js
visual: {
  body: 'circle',
  scale: 1.0,
  palette: {
    fill: 'monster.normal.fill',
    stroke: 'neon',
    glow: 'monster.normal.glow',
  },
  parts: [
    { type: 'eyes', style: 'angry', count: 2 },
    { type: 'mouth', style: 'fangs' },
    { type: 'cracks', density: 0.3 },
    { type: 'trail', style: 'speed' },
  ],
}
```

- `body` 必须是 `visuals.js` 已注册的形状 ID；`scale` 只影响视觉尺寸，不改变实体半径、碰撞或数值。
- `palette` 存语义颜色键，由 `palette.js` 解析为实际 Canvas 色值；怪物配置不再散落未经令牌登记的十六进制颜色。
- `parts` 是有序部件数组；每个部件至少包含已注册的 `type`，其余字段为样式和参数。绘制顺序固定为 body → 后置部件/拖尾 → 前置部件 → 受击覆盖层/血条。
- 部件库首批注册 `eyes`、`mouth`、`cracks`、`trail`、`spikes` 等类型（已确认）；已有类型可被任意新增怪物复用。
- 现有五种怪物的 hp、speed、damage、coin、radius、cost、behavior 等逻辑字段不变；本期只重写 visual 描述。

### 7.3 目标：程序化表现力

- 每个怪物由体型、部件、配色组合区分，不引入逐怪帧动画。
- 统一增加低成本微动画：呼吸缩放、移动时的轻微上下颠簸、拖尾相位变化；动画相位由实体 `id` 或稳定类型偏移，避免同屏怪物完全同步。
- 受击闪白保留；血条仍只在受伤后出现；死亡碎裂粒子继续走现有效果逻辑。微动画不能修改 hitFlash、hp、alive 或碰撞数据。
- 形状绘制沿用 Canvas 2D `save/restore` 与局部坐标，不创建每帧持久对象；未知 body 或部件按 §1.4 回退并警告。

### 7.4 目标：图鉴强关联

- 怪物图鉴卡由 `getVisualCanvas(type, size)` 生成，传入与游戏内完全相同的 `MONSTERS[type].visual`；不再绘制 `.bestiary-swatch` 色块。图鉴展示尺寸走 §3 的 24/32/48/64 CSS px 离屏缓存档位（已确认）。
- 未遭遇条目仍显示 `???`，但卡片边框、面板、锁定 icon、字体和 hover 状态与已解锁条目统一；不泄露未解锁怪物的 body、部件或配色。
- 已遭遇条目显示真实组合形象、名称、描述、基础数值与击杀数；数值口径仍是图鉴基础值，局内成长不在本期视觉改造中重新定义。
- 武器图鉴卡改用 `icons/weapons/` PNG；武器弹道仍由 `weapons.js.visual` 驱动，图鉴不会把弹道色块误当作武器本体。

### 7.5 扩展性承诺与测试护栏

- **换皮/换数值怪物**：在 `monsters.js` 增加一条包含 `body + palette + parts` 的数据即可；只要使用已有 body/part，零出图、零新增渲染分支。
- **新部件怪物**：只需在 `visuals.js` 注册一次新部件，再由配置引用；不为单个怪物复制 renderer。
- `test/bestiary.test.js:126-130` 的旧护栏从“所有 `visual.shape` 已注册”升级为：所有 `visual.body` 已注册，且所有 `visual.parts[].type` 已注册；同时保留未知 ID 回退测试。
- 新增怪物不得在图鉴 UI 另加判断；`playableMonsters`、图鉴网格和游戏内渲染均从同一注册表读取。
- k3-256k 只可为怪物提供概念设计稿与审美基准文档，概念稿存放于 docs/ 供颜色、轮廓、部件组合参考，不进入 `assets/img/` 游戏运行资产，也不改变“新增怪物≈一条配置”的扩展承诺。

## 8. 工作流与模型分工

### 8.1 图片资产工作流

图片资产严格按以下顺序执行：

1. 用 `docs/superpowers/visual-asset-prompt-template.md` 中的 `neon-cel-v1` 模板生成对象 prompt。
2. 先生成 1 张主角皮肤精灵样图与 1 张武器图标样图，确认 45° 俯视微侧视角、透明底、霓绿/金描边、缩小辨识度和赛璐璐风格；样图通过后再批量生产。
3. 批量任务由 AgentSwarm 并行分发给 k3-256k，经 CLIProxyAPI 使用 gpt-image-review 技能接入图片生成流程。
4. 每张图逐一审美打分：风格一致性、透明底完整性、辨识度、令牌融合度；任一项不合格即重出，合格后才进入资产目录。
5. 入库时登记文件名、尺寸档位、promptVersion、审美结论和 manifest ID；生成失败或审美不合格的版本不被 UI 引用。
6. 怪物概念稿同样可用 k3-256k，但只保存为 docs/ 审美参考，不进入游戏资产清单。

### 8.2 模型分工

- **k3-256k**：UI 图标、货币图标、辅助武器图标、主角三款皮肤资产的出图与审美评审；走 gpt-image-review 技能/CLIProxyAPI。
- **gpt-5.6-luna-fast**：代码、配置、测试、设计文档、浏览器/游戏实景截图和验收记录。
- 每个任务包都必须做 webbridge 实景截图，与本 spec 的布局、颜色令牌、图标接入点和视觉一致性逐项核对；不能只凭代码或 import 通过判定完成。

## 9. 性能红线

- **产品目标**：现有压测场景稳定 60fps（已确认）。
- **硬性验收红线**：在现有满载场景下连续 5s，平均帧时 ≤20ms，即平均帧率 ≥50fps（已确认）；低于该标准不得交付。
- **DPR**：`min(devicePixelRatio, 2)`，内部 DPR 上限 2（已确认）；不得为了清晰度无上限放大 Canvas 内部像素。
- **地形**：暗色草地纹理必须预渲染为离屏 tile；运行帧只平铺/合成，禁止每帧重新合成 tile、路径或随机障碍变体。
- **图标**：`getVisualCanvas` 按 `id + size` 键控离屏缓存；相同图标和尺寸在同一场景内不得重复解码或重复生成离屏 Canvas。
- **`drawImage`**：图片只从解码缓存/离屏缓存绘制，数量受控；HUD 5 槽、商店列表、图鉴网格不得因重复 DOM 刷新而重复创建图片对象。场内怪物、弹道、部署物和特效优先走程序化几何；场景物件 PNG（0.2a）的 `drawImage` 仅可来自解码缓存，单帧数量有界（约 60 障碍 + 5 补给站 + 少量道具），禁止每帧解码或新建图片对象。
- **内存与 GC**：微动画、路径部件、地形 tile 与视觉缓存不在每帧创建无界对象；现有实体/弹道/粒子上限与对象池策略保持不变。
- **验收记录**：性能压测记录必须同时包含 DPR、窗口 CSS 尺寸、平均帧时、峰值帧时、图标缓存命中情况和同帧 `drawImage` 统计，截图/记录归档后才能关闭第 8 个任务包。

## 10. 迭代排期

按依赖排序拆分为 8 个任务包：

| 任务包 | 内容 | 关键产出与验收 |
|---:|---|---|
| 1 | 响应式画布 + palette 令牌化 | `fitCanvas`、resize rAF、DPR≤2、动态相机视口、HUD 逻辑坐标与 CSS/Canvas 同源色值；修复 §11 对应测试（已确认顺序） |
| 2 | `visuals` 统一注册表 | 迁移 `SHAPES`、加入 `registerPart/registerImage`、未知 ID 与图片失败回退、`drawVisual/getVisualCanvas` 离屏缓存（已确认顺序） |
| 3 | 图标出图与接入（含 tooltip） | 先过 1 张皮肤样图与 1 张武器图标样图，再批量生成；商店/升级/HUD/图鉴/tooltip 与货币图标接入（已确认顺序） |
| 4 | 火炮 / 围墙 / 辅助武器建模 + 朝向平滑 | 注册表组合模型、炮管 `aimAngle`、主角 facing 插值、±15° 开火容差、三类辅助模型与炮口闪光（已确认顺序） |
| 5 | 场景建模（2026-09-04 修订：PNG 精灵路线） | 场景物件 PNG 资产包（gpt-image-review + k3 审美迭代）、共用图片加载与 fallback、岩石/废弃车辆/混凝土块/霓虹补给站/草地纹理/警戒线，以及地雷、特斯拉球、直升机的 PNG 主体 + 程序化动效层（已确认顺序） |
| 6 | 皮肤系统 | `skins.js`、三款皮肤资产、外观入口、金币解锁、meta version 2 迁移与白色圆球回退（已确认顺序） |
| 7 | 图鉴强关联 | 怪物 `body/palette/parts`、图鉴同源离屏渲染、武器 PNG 图标、`???` 风格统一、新增怪物配置扩展测试（已确认顺序） |
| 8 | 收尾与性能压测 | 结算/暂停/关卡选择图标同步、全流程 tooltip、webbridge 截图核对、连续 5s 性能红线验收（已确认顺序） |

总验收标准：

- 测试采用 TDD，先写/修测试再实现；`node --test` 全部通过。
- 每个任务包均有 webbridge 实景截图，截图与本 spec 的目标布局和视觉令牌逐项核对。
- §9 的 60fps 产品目标、平均帧时 ≤20ms 硬性红线、DPR≤2、地形离屏 tile、图标 `id+size` 缓存与受控 `drawImage` 均达标。
- 原有音频、存储键、武器伤害公式、商店经济与战斗逻辑回归通过，视觉替换不能改变玩法数值。

## 11. 测试处置清单

沿用 Node 自带 `node:test`；本期新增测试只覆盖已经存在的模块边界，不引入新的测试框架。

### 11.1 新增与升级测试

- `test/visuals.test.js`：形状/部件/图片注册，`drawVisual` 未知 ID 回退与 `console.warn`，图片加载失败回退，`getVisualCanvas(id, size)` 的 `id+size` 缓存命中与尺寸隔离。
- `test/skins.test.js`：三款皮肤字段契约、默认拥有/选中、金币解锁、非法 selected/owned 回退、version 1 → version 2 迁移、读写持久化。
- `test/resize.test.js`：窗口 CSS 尺寸、DPR 上限 2、物理 Canvas 尺寸、`ctx.setTransform` 参数、resize rAF 合并、相机使用 CSS 视口而非物理像素。
- `test/palette.test.js`：CSS `:root` 令牌读取、Canvas 语义字段映射、无 DOM 测试环境安全默认值、令牌变化后的视觉缓存失效。
- `test/turret.test.js`：最短弧插值、240°/s 上限、cooldown 期间持续追踪、±15° 容差开火与超出容差不发射（数值均已确认）。
- `test/player.test.js`：facing 最短弧插值、跨 ±π 不走长弧、移动/碰撞/受伤逻辑不因视觉朝向改变。
- `test/hud.test.js`：动态视口下左上/右上/左下锚定、5 槽图标与数量角标、不同窗口尺寸不引用 1280×720 固定坐标。
- `test/map.test.js`：障碍 `id` 哈希变体稳定、圆/矩形碰撞字段不变、商店 5 座与 90px 交互半径不变；地形 tile 只在初始化/令牌变化时重建。

### 11.2 现有测试的契约适配

- `test/bestiary.test.js`：保留所有怪物 visual 注册护栏，但从 `visual.shape` 改为断言 `visual.body` 已注册、`visual.parts[].type` 已注册；补充图鉴与游戏内同源字段检查；武器 `icon` 必填且 `visual` 的弹道字段仍完整。
- `test/config.test.js`：五道具必须有 `visual.icon`，七武器必须有 `icon`，三项 `AUX_CONFIG` 必须有 `icon`；不改变已有数值字段和枚举数量。
- `test/weapon.test.js`：适配武器新增 `icon` 字段，继续断言 `visual.bulletShape/color/trail/hitParticles/muzzleGlow`；不改变武器伤害公式与局内强化行为。
- `test/economy.test.js`：只适配货币/图标引用不影响纯函数价格与扣款；金币、银币数值公式保持原设计，不新增图标副作用。
- `test/shop.test.js`、`test/shop-ui.test.js`：商店卡片增加图标与 tooltip 节点；保留辅助武器/辅助强化三行、未拥有整行置灰、购买条件和价格计算断言。
- `test/companions.test.js`：补 icon 字段与三类辅助视觉 ID 的配置完整性；orbit 90/60/100、角速 2.2/1.4/1.0 保持原断言（已确认）。
- `test/meta.test.js`：扩展 `skins` 默认值、迁移、normalize、解锁与 selected 回退；`test/storage.test.js` 不改，继续只覆盖 `zs_best` / `zs_settings`。
- `test/camera.test.js`：由固定 1280×720 预期改为传入 CSS 视口宽高；补充 DPR 不进入相机逻辑尺寸的断言。
- `test/turret.test.js`、`test/player.test.js`：将瞬时角度断言改为插值上限/最短弧断言；纯逻辑的 `test/wall.test.js`、`test/teslaball.test.js`、`test/helicopter.test.js` 保持数值与状态机断言。
- `test/settlement.test.js`：收尾图标只做存在性与 manifest ID 断言，不把 PNG 像素内容耦合进 Node 单测；实际视觉由 webbridge 截图验收。

### 11.3 预期变红点与修复任务包

下表明确列出实施过程中因契约有意变化而可能先变红的存量测试，以及必须在哪个任务包修复：

| 任务包 | 预期先变红的现有测试 | 变红原因 | 修复位置 |
|---:|---|---|---|
| 1 | `test/camera.test.js`、`test/hud.test.js` | 仍假设 1280×720 固定视口或固定 HUD 坐标 | 任务包 1：动态视口、DPR、四角锚定测试与实现 |
| 2 | `test/bestiary.test.js` | 仍读取 `visual.shape`，无法识别 body/parts 注册 | 任务包 2：迁移注册源；任务包 7：升级图鉴护栏 |
| 3 | `test/config.test.js`、`test/weapon.test.js`、`test/companions.test.js`、`test/shop.test.js`、`test/shop-ui.test.js` | 配置新增 icon 字段、DOM 卡片新增图片/tooltip 节点 | 任务包 3：manifest、配置字段、商店/升级/HUD 接入 |
| 4 | `test/turret.test.js`、`test/player.test.js` | 瞬时转向断言改为最短弧插值与角速度上限 | 任务包 4：共享角度工具、火炮与主角朝向 |
| 5 | `test/map.test.js`（若已有渲染/变体断言） | 障碍新增稳定 id/视觉变体与地形 tile 生命周期 | 任务包 5：只更新视觉相关断言，保留地图逻辑数值 |
| 6 | `test/meta.test.js` | meta version、默认皮肤与 normalize 白名单变化 | 任务包 6：迁移、持久化和解锁测试 |
| 7 | `test/bestiary.test.js` | 图鉴由色块改为 body/parts 离屏形象，武器需 icon | 任务包 7：同源渲染、`???` 卡片与扩展护栏 |
| 8 | `test/settlement.test.js`、`test/shop-ui.test.js` | 结算/暂停/关卡选择和 tooltip 增加图标节点 | 任务包 8：界面收尾与截图核对 |

不得通过删除断言来“修复”变红；每个变红点要么改为新的目标契约，要么证明其属于不变逻辑并保持原断言。全部任务包结束时 `node --test` 必须全绿。

### 11.4 人工与实景验收

- 用 webbridge 在至少一个小视口、一个宽视口和一个高 DPR 视口截图：确认 Canvas 铺满、无裁剪、相机不因 DPR 放大、HUD 四角不重叠。
- 截图核对商店、升级、道具栏、图鉴、外观、暂停、结算、关卡选择：图标清晰、透明底无黑边、tooltip 含名称/说明/数值、辅助强化未拥有行仍置灰。
- 截图核对场内火炮炮管追踪、围墙三档受损、三类辅助武器，以及岩石/车辆/混凝土块/补给站/地形/地雷/特斯拉球/直升机的 PNG 精灵渲染（含 fallback 路径）与边界警戒线；确认图鉴形象与游戏内同源。
- 手动验证三款皮肤：默认拥有、金币解锁、选中后进入战斗、四方向两帧切换、图片失败回退白色圆球、旧 meta 自动补默认皮肤。
- 执行现有压测场景，记录连续 5s 平均帧时 ≤20ms、DPR≤2、地形不逐帧重建、图标缓存命中和 `drawImage` 受控；未达红线不得标记任务完成。

## 12. 兼容边界与非目标

- **音频不改**：`assets/audio/`、音效加载、音量设置与播放时机不属于本期视觉改造。
- **核心存储不改**：`src/core/storage.js` 仍只管 `zs_best` 与 `zs_settings`；新增皮肤只扩展 `src/core/meta.js` 的 `zs_meta`。
- **武器伤害公式不改**：武器 icon 与弹道 visual 分离，不能借 UI 改造修改伤害、攻速、弹道、范围、专属强化或经济价格公式。
- **玩法逻辑不改**：怪物数量、刷怪预算、AI、碰撞、地图尺寸、商店交互半径、围墙/火炮耐久、辅助武器 orbit 与角速均按现有设计保留。
- **程序化实体不改为逐怪图片（2026-09-04 修订）**：怪物、弹道、火炮、围墙、辅助武器与特效的场内视觉仍由 Canvas 几何/部件注册表生成；UI 图标、主角皮肤与场景物件（障碍物/补给站/地形/地雷/特斯拉球/直升机，见 0.2a）使用 PNG。
- **输入范围不扩展**：响应式 Canvas 支持不同窗口尺寸，但本期不新增触屏摇杆或移动端输入系统。
- **概念稿不进入运行时**：k3-256k 的怪物概念稿只用于 docs/ 审美基准；运行时新增怪物仍以配置 + 已注册部件为唯一扩展方式。
