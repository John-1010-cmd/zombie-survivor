import { circleHit, circleRectHit } from '../core/physics.js';

export const MAP_SIZE = 3000;
const OBSTACLE_COUNT = 60;
const MIN_GAP = 150;
const SAFE_RADIUS = 200;
const COIN_COUNT = 40;
const SHOP_R = 46;
const SHOP_INTERACT_R = 90;
// 商店位置固定：四象限中心各 1 座 + 出生点北侧 1 座
const SHOP_POSITIONS = [[750, 750], [2250, 750], [750, 2250], [2250, 2250], [1500, 1150]];

function boundsOf(o) {
  return o.kind === 'circle' ? { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 } : o;
}

function farEnough(cand, obstacles, reserved) {
  const a = boundsOf(cand);
  const all = reserved ? obstacles.concat(reserved) : obstacles;
  for (const o of all) {
    const b = boundsOf(o);
    if (a.x < b.x + b.w + MIN_GAP && a.x + a.w + MIN_GAP > b.x &&
        a.y < b.y + b.h + MIN_GAP && a.y + a.h + MIN_GAP > b.y) return false;
  }
  return true;
}

function insideObstacle(x, y, r, obstacles) {
  return obstacles.some(o => o.kind === 'circle'
    ? circleHit(x, y, r, o.x, o.y, o.r)
    : circleRectHit(x, y, r, o));
}

export function generateMap(rng) {
  const cx = MAP_SIZE / 2, cy = MAP_SIZE / 2;
  const shops = SHOP_POSITIONS.map(([x, y]) => ({ x, y, r: SHOP_R, interactR: SHOP_INTERACT_R }));
  const obstacles = [];
  let guard = 0;
  while (obstacles.length < OBSTACLE_COUNT && guard++ < 3000) {
    const x = 100 + rng() * (MAP_SIZE - 200);
    const y = 100 + rng() * (MAP_SIZE - 200);
    if (Math.hypot(x - cx, y - cy) < SAFE_RADIUS + 80) continue;
    const cand = rng() < 0.5
      ? { kind: 'circle', x, y, r: 20 + rng() * 40 }
      : { kind: 'rect', x: x - 30 - rng() * 50, y: y - 30 - rng() * 50, w: 60 + rng() * 100, h: 60 + rng() * 100 };
    if (farEnough(cand, obstacles, shops)) obstacles.push(cand);
  }
  const scatteredCoins = [];
  guard = 0;
  while (scatteredCoins.length < COIN_COUNT && guard++ < 2000) {
    const x = 50 + rng() * (MAP_SIZE - 100);
    const y = 50 + rng() * (MAP_SIZE - 100);
    if (Math.hypot(x - cx, y - cy) < SAFE_RADIUS) continue;
    if (insideObstacle(x, y, 8, obstacles)) continue;
    if (shops.some(s => circleHit(x, y, 8, s.x, s.y, s.r))) continue;
    scatteredCoins.push({ x, y, value: 1 });
  }
  return { size: MAP_SIZE, spawn: { x: cx, y: cy }, obstacles, shops, scatteredCoins };
}
