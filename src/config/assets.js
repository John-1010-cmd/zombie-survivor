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
  { id: 'scene.obstacle.rock.0', path: 'assets/img/scene/obstacles/rock-0.png', size: 256, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.obstacle.rock.1', path: 'assets/img/scene/obstacles/rock-1.png', size: 256, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.obstacle.rock.2', path: 'assets/img/scene/obstacles/rock-2.png', size: 256, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.obstacle.vehicle.0', path: 'assets/img/scene/obstacles/vehicle-0.png', size: 256, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.obstacle.vehicle.1', path: 'assets/img/scene/obstacles/vehicle-1.png', size: 256, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.obstacle.concrete.0', path: 'assets/img/scene/obstacles/concrete-0.png', size: 256, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.obstacle.concrete.1', path: 'assets/img/scene/obstacles/concrete-1.png', size: 256, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.supplyStation', path: 'assets/img/scene/supply-station.png', size: 256, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.terrain.grass', path: 'assets/img/scene/terrain/grass-tile.png', size: 256, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.mine', path: 'assets/img/scene/mine.png', size: 128, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.teslaBall', path: 'assets/img/scene/tesla-ball.png', size: 128, promptVersion: 'neon-cel-scene-v1' },
  { id: 'scene.helicopter', path: 'assets/img/scene/helicopter.png', size: 256, promptVersion: 'neon-cel-scene-v1' },
];

const SKIN_FRAME_ORDER = [
  { direction: 'down', frame: 0, x: 0, y: 0, width: 128, height: 128 },
  { direction: 'left', frame: 0, x: 128, y: 0, width: 128, height: 128 },
  { direction: 'right', frame: 0, x: 256, y: 0, width: 128, height: 128 },
  { direction: 'up', frame: 0, x: 384, y: 0, width: 128, height: 128 },
  { direction: 'down', frame: 1, x: 0, y: 128, width: 128, height: 128 },
  { direction: 'left', frame: 1, x: 128, y: 128, width: 128, height: 128 },
  { direction: 'right', frame: 1, x: 256, y: 128, width: 128, height: 128 },
  { direction: 'up', frame: 1, x: 384, y: 128, width: 128, height: 128 },
];

const SKIN_ASSETS = [
  {
    id: 'skin.wastelandAdventurer.portrait',
    path: 'assets/img/skins/wasteland-adventurer/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    crop: { x: 0, y: 0, width: 128, height: 128 },
  },
  {
    id: 'skin.wastelandAdventurer.sprite',
    path: 'assets/img/skins/wasteland-adventurer/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    atlas: {
      width: 512,
      height: 256,
      frameSize: 128,
      columns: 4,
      rows: 2,
      frameOrder: SKIN_FRAME_ORDER,
    },
  },
  {
    id: 'skin.neonMercenary.portrait',
    path: 'assets/img/skins/neon-mercenary/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    crop: { x: 0, y: 0, width: 128, height: 128 },
  },
  {
    id: 'skin.neonMercenary.sprite',
    path: 'assets/img/skins/neon-mercenary/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    atlas: {
      width: 512,
      height: 256,
      frameSize: 128,
      columns: 4,
      rows: 2,
      frameOrder: SKIN_FRAME_ORDER,
    },
  },
  {
    id: 'skin.nightHunter.portrait',
    path: 'assets/img/skins/night-hunter/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    crop: { x: 0, y: 0, width: 128, height: 128 },
  },
  {
    id: 'skin.nightHunter.sprite',
    path: 'assets/img/skins/night-hunter/sprite.png',
    size: 128,
    promptVersion: 'neon-cel-v1',
    atlas: {
      width: 512,
      height: 256,
      frameSize: 128,
      columns: 4,
      rows: 2,
      frameOrder: SKIN_FRAME_ORDER,
    },
  },
];

ASSETS.push(...SKIN_ASSETS);

export const ASSET_BY_ID = Object.fromEntries(ASSETS.map(asset => [asset.id, asset]));
