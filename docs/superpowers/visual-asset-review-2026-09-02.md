# UI 图标资产审美验收记录

## 统一生产约束

- Prompt 模板：`neon-cel-v1`，原文见 [`visual-asset-prompt-template.md`](./visual-asset-prompt-template.md)。
- 成品目录：`assets/img/icons/`；所有运行时图标使用 128×128 RGBA PNG 原子源图。
- 验收维度：风格一致性、透明底完整性、缩小后的辨识度、与霓绿/金色设计令牌的融合度。
- 透明度检查：21 张成品均为 `128x128 cornerAlpha=0,0,0,0`。
- 批量结果：21/21 通过，批量图标零返工；仅 pistol 基准样图由 v1 重出为 v2 后冻结。

## 逐项登记

| 文件名 | manifest ID | size | promptVersion | 风格一致性 | 透明底完整性 | 缩小辨识度 | 霓绿/金令牌融合 | 是否重出 |
|---|---|---:|---|---|---|---|---|---|
| `weapons/pistol.png` | `icon.weapon.pistol` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 是：基准样图 v1→v2 |
| `weapons/rifle.png` | `icon.weapon.rifle` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `weapons/mg.png` | `icon.weapon.mg` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `weapons/rocket.png` | `icon.weapon.rocket` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `weapons/grenade.png` | `icon.weapon.grenade` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `weapons/tesla.png` | `icon.weapon.tesla` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `weapons/sniper-rifle.png` | `icon.weapon.sniperRifle` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `items/medkit.png` | `icon.item.medkit` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `items/magnet.png` | `icon.item.magnet` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `items/bomb.png` | `icon.item.bomb` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `items/turret.png` | `icon.item.turret` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `items/wall.png` | `icon.item.wall` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `aux/drone.png` | `icon.aux.drone` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `aux/gunner.png` | `icon.aux.gunner` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `aux/sniper.png` | `icon.aux.sniper` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `enhance/damage.png` | `icon.enhance.damage` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `enhance/fire-rate.png` | `icon.enhance.fireRate` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `enhance/projectiles.png` | `icon.enhance.projectiles` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `enhance/range.png` | `icon.enhance.range` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `currency/silver.png` | `icon.currency.silver` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |
| `currency/gold.png` | `icon.currency.gold` | 128 | `neon-cel-v1` | 通过 | 通过 | 通过 | 通过 | 否 |

## 基准样图记录

- pistol 基准复核：[`asset-staging/reviews/weapon-pistol-sample.md`](../../.superpowers/sdd/2026-09-02-ui-visual-overhaul/asset-staging/reviews/weapon-pistol-sample.md)，v2 结论为四项通过，无需 v3。
- 生成与验收 prompt 的留档来源为 `.superpowers/sdd/2026-09-02-ui-visual-overhaul/asset-staging/` 内的出图记录；本文件只登记运行时成品与验收结论，不复制 prompt 原文。

---

# 场景物件资产审美验收记录 (Task 15A)

## 统一生产约束与验收规范

- Prompt 模板与出处：`promptVersion=neon-cel-scene-v1`，存档出处为 [`asset-staging/scene/prompts-v1.md`](../../asset-staging/scene/prompts-v1.md)。
- 成品目录：`assets/img/scene/`（含 `obstacles/` 与 `terrain/` 子目录）。
- 生产规格：障碍物与建筑物为 256×256 RGBA PNG（地雷、特斯拉球为 128×128 RGBA PNG；草地地表为 256×256 全画幅不透明 PNG）。
- 抠图工艺：采用 `finalize-icon.cjs` 边缘自适应色彩采样 + BFS 洪泛背景剥离 + 软 alpha 边缘渐变 + 预乘降采样。全画幅草地特例采用纯 box 均值降采样（不抠图保持全不透明）。
- 像素与透明度验证：
  - 物件类（11 张）：均具有真 alpha 分布（四角像素 alpha 均为 0，内部主体边缘平滑过渡至 alpha=255，不存在白边/黑边杂色）。
  - 重点专项（`vehicle-0`）：车窗破碎区内部座舱、方向盘及发动机舱机械暗区保留完整，经程序与视觉重点验证，minAlpha=255，零误抠穿孔。
  - 地表类（1 张 `grass-tile`）：保持 256×256 全不透明（alpha=65536/65536）。
- k3 审美结论：12 张资产全数验收通过（v1 阶段 8 张一轮 PASS；`vehicle-0`、`vehicle-1`、`helicopter`、`tesla-ball` 4 张经 v2 迭代重出后 PASS）。

## 逐项登记

| 成品路径 | manifest ID | size | promptVersion | 风格一致性 | 透明底完整性 | 缩小辨识度 | 霓绿/金令牌融合 | k3 审美与定稿结论 |
|---|---|---:|---|---|---|---|---|---|
| `assets/img/scene/obstacles/rock-0.png` | `scene.obstacle.rock.0` | 256 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | v1 一轮 PASS，尖锐棱角清晰 |
| `assets/img/scene/obstacles/rock-1.png` | `scene.obstacle.rock.1` | 256 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | v1 一轮 PASS，圆润厚重体量感强 |
| `assets/img/scene/obstacles/rock-2.png` | `scene.obstacle.rock.2` | 256 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | v1 一轮 PASS，扁平层状石块分明 |
| `assets/img/scene/obstacles/vehicle-0.png` | `scene.obstacle.vehicle.0` | 256 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | 是：v1→v2 迭代后 PASS (正俯视残骸，破碎车窗与机舱无误抠穿孔) |
| `assets/img/scene/obstacles/vehicle-1.png` | `scene.obstacle.vehicle.1` | 256 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | 是：v1→v2 迭代后 PASS (正俯视皮卡，后货斗与压扁座舱清晰) |
| `assets/img/scene/obstacles/concrete-0.png` | `scene.obstacle.concrete.0` | 256 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | v1 一轮 PASS，泽西路障警示线分明 |
| `assets/img/scene/obstacles/concrete-1.png` | `scene.obstacle.concrete.1` | 256 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | v1 一轮 PASS，立方掩体与钢筋骨架扎实 |
| `assets/img/scene/supply-station.png` | `scene.supplyStation` | 256 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | v1 一轮 PASS，战术棚屋与天线柜台细节完整 |
| `assets/img/scene/mine.png` | `scene.mine` | 128 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | v1 一轮 PASS，圆形地雷与引信轮廓利落 |
| `assets/img/scene/tesla-ball.png` | `scene.teslaBall` | 128 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | 是：v1→v2 迭代后 PASS (云台环空隙透出背景，霓绿#5eff8a发光节点纯正) |
| `assets/img/scene/helicopter.png` | `scene.helicopter` | 256 | `neon-cel-scene-v1` | 通过 | 通过 (真 alpha) | 通过 | 通过 | 是：v1→v2 迭代后 PASS (正俯视机头朝上，省去旋翼叶片留轴套) |
| `assets/img/scene/terrain/grass-tile.png` | `scene.terrain.grass` | 256 | `neon-cel-scene-v1` | 通过 | 特例 (全幅不透明) | 通过 | 通过 | v1 一轮 PASS，无缝平铺暗色草地纹理降采样保持全不透明 |

