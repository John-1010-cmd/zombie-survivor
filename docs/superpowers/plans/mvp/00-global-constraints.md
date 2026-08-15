# MVP 全局约束与约定（分册 00）

> 适用范围：`docs/superpowers/plans/mvp/` 全部分册（01–09）。
> 上游依据：`../../specs/2026-08-14-zombie-survivor-design.md`（下称 **spec**）。
> 冲突裁决顺序：**本文档 > 各分册 > spec 原文**（与 spec 的差异以本文档 §7 唯一清单为准）。分册之间冲突以本文档为准，发现后必须立即修订分册并在 09 分册复审记录中登记。

## 1. 交付目标

浏览器可试玩的无尽模式 MVP：地图+障碍、玩家走位、3 种武器自动射击、3 种僵尸、经验四选一升级、打击感反馈、死亡结算与最高分存档。覆盖 spec §13 第 1 期全部内容，共 16 个 Task（Task 1–16，编号全局唯一、禁止重排）。

## 2. 技术栈与运行方式

- 原生 JavaScript（ES Modules）+ Canvas 2D；**无框架、无构建步骤、无 npm 运行时依赖**
- `package.json` 仅含 `"type":"module"` 与 `test`/`start` 两个脚本
- Node ≥ 18 自带 `node:test`（零依赖测试）
- 运行：项目根 `npx serve .`（ES Modules 必须经 http，不能 file:// 双击打开）；项目根 README 必须写明
- 全量测试：`npm test`（= `node --test`，Node 自动发现 `test/` 目录下全部 `*.test.js`；Node 24 起目录参数 `test/` 会被当作模块入口报 MODULE_NOT_FOUND，故不传参）

## 3. 分层铁律

| 层 | 模块 | 规则 |
|---|---|---|
| 纯逻辑层 | `src/config/*`、`src/core/{loop,rng,pool,physics,camera,storage}`、`src/entities/*`、`src/systems/*` | 禁止 import DOM API；**模块顶层求值不得触碰 `window`/`document`/`canvas`**。`document`/`ctx` 仅允许出现在函数体内（`hud.renderHud`、`levelup.showLevelUp`）；`storage` 用 `typeof localStorage` 守卫。判定标准：`node --test` 能 import 全部模块 |
| DOM/胶水层 | `src/core/{engine,input}`、`src/game.js`、`src/ui/{menu,gameover}`、`src/main.js`、`index.html`、`style.css` | 不写单测，靠 09 分册人工清单验收 |

## 4. 随机数约定

- 一律使用 `src/core/rng.js` 的 `mulberry32(seed)` 实例，经参数注入
- 纯逻辑模块**禁止**调用 `Math.random`
- DOM 层仅允许一处：`game.js` 用 `Math.random` 产生每局种子

## 5. 命名、文案与提交

- 代码标识符英文；UI 文案中文
- 提交信息中文 + Conventional Commits 前缀（feat/fix/test/docs/chore）
- 每个 Task 以一次提交收尾（各分册 TDD 步骤内含具体提交命令）

## 6. 性能预算（spec §9）

- 固定 60Hz 逻辑帧 + `requestAnimationFrame` 渲染；逻辑暂停时渲染继续
- 上限：同屏僵尸 ≤ 300（spawner 强制）、子弹 ≤ 400（对象池+满则丢弃）、粒子 ≤ 500（满则丢弃）、浮动伤害数字 ≤ 100（计划自定上限，满则丢弃）
- 手段：对象池（子弹）、空间网格（cell 64px）、帧末 swap-remove 压缩数组
- **已知裁剪**：离屏实体渲染剔除未实现——≤300 实体全量绘制在目标硬件（中端笔记本）可接受；若实测掉帧，作为后续独立优化任务补齐，不并入本 MVP

## 7. MVP 裁剪说明（与 spec 的全部差异 · 唯一清单）

1. 升级池仅三类：武器增强 / 更换武器 / 治疗兜底（spec §4.6 的辅助、道具类与真实消耗品卡属第 2、3 期）
2. 治疗兜底卡在玩家满血时无收益——**已知例外**；第 2 期真实消耗品卡上线时按 spec §4.6 修正为磁铁/炸弹替换
3. 难度表仅 3 种僵尸；裁掉史莱姆/飞龙后各档组成权重按手感再分配（总量保持 100、**非严格归一化**，如档 4 为 50/30/20）；第 2/3 期补齐类型时以 spec §5.1 原表重新对齐
4. 数值封顶规则完整保留：档 8 后 HP/速度倍率封顶，之后仅预算每档 +3
5. 坚守模式、WebAudio 音效、医疗包/磁铁/炸弹掉落、火箭炮/榴弹炮 = 第 2 期；磁力炮/激光炮/飞龙/固定火箭炮/围墙/精英/守门 Boss/刷新次数/暂停设置 = 第 3 期
6. 离屏渲染剔除未实现（见 §6）
7. spec §9 的对象池手段仅用于子弹；僵尸与粒子不池化（普通数组 + 帧末 swap-remove 已满足 §6 预算）

## 8. 文件结构与分册映射

| 文件 | 职责 | 层 | 可单测 | 分册 |
|---|---|---|---|---|
| `package.json` / `README.md` | ESM 声明、test 脚本；运行说明 | — | — | 01 |
| `index.html` / `style.css` | canvas + 菜单/升级/结算三个 DOM 覆盖层 | DOM | — | 01 |
| `src/core/loop.js` | 固定步长累加器（纯） | 纯 | ✓ | 01 |
| `src/core/rng.js` | mulberry32、加权抽取（纯） | 纯 | ✓ | 01 |
| `src/core/pool.js` | 对象池（纯） | 纯 | ✓ | 01 |
| `src/core/physics.js` | 圆/矩形碰撞、推出、空间网格（纯） | 纯 | ✓ | 01 |
| `src/core/engine.js` | rAF 主循环 + 场景切换 | DOM | — | 01 |
| `src/core/input.js` | 键盘状态 | DOM | — | 03 |
| `src/core/camera.js` | 镜头跟随/夹紧/震屏（纯，注入 rng） | 纯 | ✓ | 03 |
| `src/core/storage.js` | localStorage 读写 + `updateBest` 纯函数 | 纯* | ✓（纯函数） | 08 |
| `src/config/weapons.js` | 3 种武器参数 + 增强维度常量 | 纯 | ✓ | 02 |
| `src/config/zombies.js` | 3 种僵尸参数 | 纯 | ✓ | 02 |
| `src/config/difficulty.js` | 难度阶梯表 + 封顶规则 | 纯 | ✓ | 02 |
| `src/systems/map.js` | 地图/障碍物/预撒经验球生成 | 纯 | ✓ | 03 |
| `src/entities/player.js` | 玩家移动/碰撞滑动/受伤无敌帧 | 纯 | ✓ | 04 |
| `src/entities/zombie.js` | 僵尸追踪 AI/击退/受击闪白/死亡 | 纯 | ✓ | 04 |
| `src/entities/weapon.js` | 武器实例/增强计算/索敌开火（含 burst） | 纯 | ✓ | 04 |
| `src/entities/projectile.js` | 弹道飞行 | 纯 | ✓ | 04 |
| `src/systems/combat.js` | 弹道命中结算（网格查询/穿透/击杀回调） | 纯 | ✓ | 05 |
| `src/systems/spawner.js` | 刷怪导演（预算制/环形刷怪/新手保护/包围潮） | 纯 | ✓ | 05 |
| `src/entities/xpGem.js` | 经验球磁吸 | 纯 | ✓ | 06 |
| `src/systems/progression.js` | 经验曲线/四选一抽卡/应用卡牌 | 纯 | ✓ | 06 |
| `src/entities/effects.js` | 粒子 + 浮动伤害数字 | 纯 | ✓ | 06 |
| `src/game.js` | 战斗场景组装：全部实体与系统的接线 | DOM | 人工 | 07 |
| `src/systems/hud.js` | HUD 渲染 + `formatTime` | 纯* | ✓（纯函数） | 08 |
| `src/ui/levelup.js` | 四选一覆盖层 + `cardLabel` | 纯* | ✓（纯函数） | 08 |
| `src/ui/menu.js` / `src/ui/gameover.js` | 菜单 / 结算覆盖层 | DOM | — | 08 |
| `src/main.js` | 启动接线 | DOM | — | 08 |
| `test/*.test.js` | 各纯模块的 node:test 用例 | — | — | 各所属分册 |

\* 标注「纯\*」的模块：`document`/`ctx`/`localStorage` 仅在函数体内使用或带守卫，`node --test` 可安全 import。
注：分册列为**最终定稿**分册——`src/main.js` 创建于 Task 1、Task 14 临时接线、Task 16 重写定稿；`src/game.js` 创建于 Task 14、Task 15 接入 renderHud。

## 9. 任务依赖与执行顺序

执行顺序恒为 Task 1 → 16（线性）。依赖关系（→ 表示「被依赖」）：

```
T1 引擎      → T14、T16
T2 rng/池    → T5 T6 T9 T11 T12 T13 T14
T3 物理      → T5 T7 T8 T10 T14
T4 配置      → T8 T9 T10 T11 T12 T14 T15
T5 地图      → T14
T6 镜头/输入 → T14
T7 玩家      → T14
T8 僵尸      → T10 T11 T14
T9 武器      → T12 T14
T10 命中     → T14
T11 刷怪     → T14
T12 升级     → T14 T15
T13 特效     → T14
T14 组装     → T15 T16
T15 界面/HUD → T16
T16 存档/接线 → （收尾）
```

## 10. 跨文档约定

- 契约行格式：`` `fn(a, b) → 结果` ``；**Produces** = 本模块对外公开接口；**Consumes** = 引用他模块接口（必须标注来源分册）
- 代码块**逐字可执行**：分册中 TDD 步骤内的代码已过审查验证，是实现依据。实现与文档不一致时，以文档为准修代码；确因实现阶段发现文档有误，先修文档再落码
- 引用写法：本文档简写 **G§n**（如 G§3）；同目录分册直书 `05-combat-systems.md`；spec 用 `spec §n`
- Task 标题、编号、Files 清单与源计划保持一致；新增内容进对应分册，不新建散文件
- TDD 节奏：**写失败测试 → 运行确认失败 → 实现 → 运行确认通过 → 提交**；DOM/人工验证类步骤以验证清单替代中间两步
- 每分册末尾设「歧义裁决」表：本模块易误解点的明确裁定（来源标注：`拆分裁定` / `源文隐含·本次明示` / `待裁决`）
