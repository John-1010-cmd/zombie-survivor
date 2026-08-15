# Zombie Survivor MVP 实施计划 · 分册索引

> 原 3200 余行单文件计划已于 2026-08-15 按工程化拆分为本目录分册（内容在原文基础上扩充了模块边界、接口契约与歧义裁决）；原文件转为指针保留，仅为兼容历史引用。
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development（推荐）或 executing-plans。按 Task 1→16 顺序执行；执行某 Task 前先读 00（全局约束）与该 Task 所在分册的「契约」节及其 Consumes 指向的分册。

## 文档地图

| 分册 | Task | 内容 | 依赖分册 |
|---|---|---|---|
| `00-global-constraints.md` | — | 全局约束 / 分层铁律 / MVP 裁剪清单 / 依赖图（**必读**） | — |
| `01-foundation.md` | 1–3 | 脚手架与固定步长主循环、rng 与对象池、碰撞数学与空间网格 | — |
| `02-config-tables.md` | 4 | 武器 / 僵尸 / 难度阶梯配置表（含数值封顶规则） | 01 |
| `03-world.md` | 5–6 | 地图生成（障碍 / 预撒经验球）、镜头跟随与键盘输入 | 01 |
| `04-entities.md` | 7–9 | 玩家实体、僵尸 AI、武器与弹道 | 01、02 |
| `05-combat-systems.md` | 10–11 | 弹道命中结算、刷怪导演 | 01、02、04 |
| `06-progression-and-effects.md` | 12–13 | 经验球与四选一抽卡、打击感特效 | 01、02、04 |
| `07-scene-assembly.md` | 14 | 战斗场景组装（game.js + main.js 临时接线） | 01–06 全部 |
| `08-ui-and-persistence.md` | 15–16 | 升级界面与 HUD、菜单 / 结算 / 最高分存档 / 正式接线 | 01、02、03、06、07 |
| `09-acceptance.md` | — | 全量回归 + 人工验收清单（spec §12 MVP 标准） | 全部 |

## 阅读路径

- **实现者**：README → 00 → 目标 Task 所在分册（其 Consumes 指向的契约按需回查对应分册）
- **评审 / 验收**：README → 00 → 09 → 相关分册

## 一致性规则

1. 裁决顺序：**00 > 分册 > spec 原文**；与 spec 的一切差异必须能在 00 §7 唯一清单中找到条目
2. 分册内 TDD 步骤中的代码块为逐字实现依据；改动先落文档再落码
3. Task 编号 / 标题全局唯一；同 Task 的 Files、接口契约只在其所属分册定义一次，其他分册仅引用
4. 每分册末尾「歧义裁决」表是本模块语义的权威解释；跨模块裁决进 00
