# Zombie Survivor 第 1 期 MVP 实施计划（已拆分 · 本文件为指针）

> **本文件原 3200 余行内容已于 2026-08-15 按工程化拆分至 `mvp/` 目录**，由以下分册取代：
>
> - `mvp/README.md` — 分册索引与阅读路径
> - `mvp/00-global-constraints.md` — 全局约束 / 分层铁律 / MVP 裁剪唯一清单 / 依赖图（**必读**）
> - `mvp/01-foundation.md` ~ `mvp/08-ui-and-persistence.md` — Task 1–16 分模块实施计划（TDD 步骤与代码逐字迁移）
> - `mvp/09-acceptance.md` — 全量回归（19 个测试文件 / 93 用例）与人工验收清单（spec §12）
>
> 拆分原则：内容零删改（79 个代码块经脚本逐字节比对一致），新增跨模块契约（Produces/Consumes）与歧义裁决表；三维整体评审（契约一致性 / 内容完整性 / 编号引用结构）已通过并修复全部发现项，记录见 `.superpowers/sdd/2026-08-14-mvp-implementation-plan/progress.md`。
>
> 本文件保留仅为兼容历史引用，请勿在此编辑——一切更新落在 `mvp/` 分册。
>
> **后续迭代**：MVP 之后的迭代计划归档于 `iterations/<日期-主题>/`（当前进行中：`iterations/2026-08-15-economy/`——银币经济 + 坚守模式 + 音效 + QoL 设计漂移轮）。

