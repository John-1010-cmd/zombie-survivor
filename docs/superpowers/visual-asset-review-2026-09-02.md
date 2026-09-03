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
