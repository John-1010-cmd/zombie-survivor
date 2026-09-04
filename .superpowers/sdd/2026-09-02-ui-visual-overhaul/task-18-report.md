# Task 18：皮肤注册表与 meta version 2 迁移

## 状态

完成。代码实现、单元测试、存档迁移断言与全量回归测试全部通过；全量测试通过（341 pass，0 fail）。本报告与代码同一提交，未执行 push。

## 实现摘要

- `src/config/skins.js`
  - 新建主角皮肤注册表模块，导出 `SKINS` 常量对象。
  - 首发配置 3 款皮肤：
    - `wastelandAdventurer`（荒野冒险家）：默认拥有，价格 0 金币（免费）；
    - `neonMercenary`（霓虹雇佣兵）：价格 800 金币（标注平衡可调）；
    - `nightHunter`（暗夜猎手）：价格 1500 金币（标注平衡可调）。
  - 每个皮肤条目 schema 完整：
    - `id`（字符串标识）
    - `name`（中文名称）
    - `portrait`（资产 ID 引用，如 `skin.wastelandAdventurer.portrait`）
    - `sprite`（资产 ID 引用，如 `skin.wastelandAdventurer.sprite`）
    - `frameSize: 128`
    - `directions: ['down', 'left', 'right', 'up']`
    - `framesPerDirection: 2`
    - `price: { currency: 'gold', amount: number }`
    - `description`（背景说明文本）
- `src/core/meta.js`
  - 引入 `src/config/skins.js` 中的 `SKINS`。
  - 升级存档版本号常量 `META_VERSION = 2`。
  - `defaultMeta()` 注入 `skins` 默认结构：
    ```js
    skins: {
      owned: ['wastelandAdventurer'],
      selected: 'wastelandAdventurer',
    }
    ```
  - 新增辅助函数 `isRegisteredSkin(id)`：仅当 `id` 为字符串且存在于 `SKINS` 注册表中时返回 true。
  - 新增 `normalizeSkins(raw, sourceVersion)`：
    - 若 `sourceVersion < META_VERSION` 或 `raw` 非合法对象，回退默认皮肤结构；
    - 过滤 `raw.owned`：仅保留注册表有效 ID 且去重；确保默认皮肤 `wastelandAdventurer` 始终在 owned 列表中；
    - 校验 `raw.selected`：仅当 selected 属于 owned 时保留，否则回退默认皮肤。
  - 更新 `normalizeMeta(parsed)`：
    - 提取 `sourceVersion`（缺省视为 1）；
    - 精确迁移：现有局外字段（`gold`、`weaponLevels`、`adventure`、`bestiaryKills`）逐项校验保留，零丢失；
    - 将 `normalizeSkins(parsed.skins, sourceVersion)` 挂载至 `m.skins`。
  - 保留原有本地存储键 `zs_meta`，保持 `src/core/storage.js` 零修改。
- 范围红线与全局约束遵守：
  - 仅修改简报指定的 4 个文件（新建 `src/config/skins.js`、`test/skins.test.js`；修改 `src/core/meta.js`、`test/meta.test.js`）；
  - 存储键与 storage 逻辑完全隔离，未修改任何局内战斗平衡、怪物/武器数值；
  - 满足 TDD 纪律，先记录 RED 失败证据再编写实现代码，测试断言实际值。

## RED 证据

在编写生产代码前，先创建 `test/skins.test.js` 并将 `test/meta.test.js` 升级为 version 2 断言，运行测试捕获确实的失败信息：

```text
$ node --test test/skins.test.js test/meta.test.js
✖ defaultMeta 结构定稿（version 2 + 默认皮肤） (2.3758ms)
✔ 金币收支：addGold 累加；spendGold 余额不足返回 false 不扣款 (0.185ms)
✔ weaponLevel 缺省 0；recordKill 累计 (0.0842ms)
✔ 冒险结算：首通标记 + 解锁 N+1（封顶总关数） (0.1022ms)
✔ 冒险失败不解锁；最佳成绩 cleared 优先，其次比存活秒数 (0.4737ms)
✔ 无 localStorage（Node）：loadMeta 回默认、saveMeta 不抛错 (0.1814ms)
✖ 读写往返；坏 JSON / 版本不符 / 字段类型错误逐项回退、合法字段保留 (0.3441ms)
✖ version 1 或缺失 skins 自动迁移，保留合法局外字段 (0.1488ms)
✖ skins owned 只保留注册表 ID 且 selected 不属于 owned 时回退默认 (0.4278ms)
✖ 合法 selected 必须属于 owned 时保留选中皮肤 (0.226ms)
✖ 皮肤字段读写往返 (0.541ms)
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\hzc\GitRepo\John-1010-cmd\zombie-survivor\src\config\skins.js' imported from C:\hzc\GitRepo\John-1010-cmd\zombie-survivor\test\skins.test.js
...
✖ test\skins.test.js (45.9929ms)
ℹ tests 12
ℹ suites 0
ℹ pass 5
ℹ fail 7

✖ failing tests:
test at test\meta.test.js:21:1
✖ defaultMeta 结构定稿（version 2 + 默认皮肤） (2.3758ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  1 !== 2

test at test\meta.test.js:86:1
✖ 读写往返；坏 JSON / 版本不符 / 字段类型错误逐项回退、合法字段保留 (0.3441ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  1 !== 2

test at test\meta.test.js:113:1
✖ version 1 或缺失 skins 自动迁移，保留合法局外字段 (0.1488ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  1 !== 2

test at test\meta.test.js:136:1
✖ skins owned 只保留注册表 ID 且 selected 不属于 owned 时回退默认 (0.4278ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + undefined
  - { owned: [ 'wastelandAdventurer', 'nightHunter' ], selected: 'wastelandAdventurer' }

test at test\meta.test.js:150:1
✖ 合法 selected 必须属于 owned 时保留选中皮肤 (0.226ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + undefined
  - { owned: [ 'wastelandAdventurer', 'nightHunter' ], selected: 'nightHunter' }

test at test\meta.test.js:164:1
✖ 皮肤字段读写往返 (0.541ms)
  TypeError: Cannot read properties of undefined (reading 'owned')
```

## GREEN 证据

生产代码实现后，运行对应测试与全量测试：

```text
$ node --test test/skins.test.js test/meta.test.js
✔ defaultMeta 结构定稿（version 2 + 默认皮肤） (1.504ms)
✔ 金币收支：addGold 累加；spendGold 余额不足返回 false 不扣款 (0.0992ms)
✔ weaponLevel 缺省 0；recordKill 累计 (0.0819ms)
✔ 冒险结算：首通标记 + 解锁 N+1（封顶总关数） (0.1068ms)
✔ 冒险失败不解锁；最佳成绩 cleared 优先，其次比存活秒数 (0.098ms)
✔ 无 localStorage（Node）：loadMeta 回默认、saveMeta 不抛错 (0.1822ms)
✔ 读写往返；坏 JSON / 版本不符 / 字段类型错误逐项回退、合法字段保留 (0.3615ms)
✔ version 1 或缺失 skins 自动迁移，保留合法局外字段 (0.1072ms)
✔ skins owned 只保留注册表 ID 且 selected 不属于 owned 时回退默认 (0.0983ms)
✔ 合法 selected 必须属于 owned 时保留选中皮肤 (0.1299ms)
✔ 皮肤字段读写往返 (0.1068ms)
✔ 首发皮肤清单与 schema 完整 (1.5972ms)
✔ 荒野冒险家免费且是默认皮肤 (0.147ms)
✔ 付费皮肤注册表默认价格为 800 与 1500 金币 (0.0713ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0

$ npm test
ℹ tests 341
ℹ suites 0
ℹ pass 341
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 423.5073
```

- 测试通过数：341 个测试全部通过（基线 334 + 新增 7 个测试 = 341 pass，0 fail）。
- `test/storage.test.js`：19/19 全部通过，验证 storage 与 meta 隔离。

## 偏差/说明

1. **测试用例增量与基线**：
   - 任务 17 基线为 334 个通过用例。
   - 本任务新增 `test/skins.test.js`（3 个用例），`test/meta.test.js` 由原本 7 个用例扩充为 11 个用例（净增 4 个用例），总测试用例数严格增长为 341 个，全部绿灯。
2. **严格遵循 Git 与范围红线**：
   - 只操作与提交 Task 18 指定文件，未 touch `src/core/storage.js`，未改动任何游戏平衡数值；
   - 未追踪的 PNG 资产（`assets/img/scene/`、`asset-staging/`）未被误暂存；
   - 报告文件使用 `git add -f` 随同任务代码一起提交。
