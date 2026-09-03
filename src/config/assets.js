// src/config/assets.js —— UI 图标唯一 manifest（设计 §3.2/§3.3）。
// 21 个图标统一 128×128 原子源图；运行时显示尺寸由 getVisualCanvas(id, size) 缓存生成。
export const ASSETS = [
  { id: 'icon.weapon.pistol', path: 'assets/img/icons/weapons/pistol.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.rifle', path: 'assets/img/icons/weapons/rifle.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.mg', path: 'assets/img/icons/weapons/mg.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.rocket', path: 'assets/img/icons/weapons/rocket.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.grenade', path: 'assets/img/icons/weapons/grenade.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.tesla', path: 'assets/img/icons/weapons/tesla.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.weapon.sniperRifle', path: 'assets/img/icons/weapons/sniper-rifle.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.item.medkit', path: 'assets/img/icons/items/medkit.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.item.magnet', path: 'assets/img/icons/items/magnet.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.item.bomb', path: 'assets/img/icons/items/bomb.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.item.turret', path: 'assets/img/icons/items/turret.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.item.wall', path: 'assets/img/icons/items/wall.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.aux.drone', path: 'assets/img/icons/aux/drone.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.aux.gunner', path: 'assets/img/icons/aux/gunner.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.aux.sniper', path: 'assets/img/icons/aux/sniper.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.enhance.damage', path: 'assets/img/icons/enhance/damage.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.enhance.fireRate', path: 'assets/img/icons/enhance/fire-rate.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.enhance.projectiles', path: 'assets/img/icons/enhance/projectiles.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.enhance.range', path: 'assets/img/icons/enhance/range.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.currency.silver', path: 'assets/img/icons/currency/silver.png', size: 128, promptVersion: 'neon-cel-v1' },
  { id: 'icon.currency.gold', path: 'assets/img/icons/currency/gold.png', size: 128, promptVersion: 'neon-cel-v1' },
];

export const ASSET_BY_ID = Object.fromEntries(ASSETS.map(asset => [asset.id, asset]));
