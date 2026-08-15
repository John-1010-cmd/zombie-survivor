import { circleHit, circleRectHit } from '../core/physics.js';

export const MAP_SIZE = 3000;
const OBSTACLE_COUNT = 60;
const MIN_GAP = 150;
const SAFE_RADIUS = 200;
const GEM_COUNT = 40;

function boundsOf(o) {
  return o.kind === 'circle' ? { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 } : o;
}

function farEnough(cand, obstacles) {
  const a = boundsOf(cand);
  for (const o of obstacles) {
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
  const obstacles = [];
  let guard = 0;
  while (obstacles.length < OBSTACLE_COUNT && guard++ < 3000) {
    const x = 100 + rng() * (MAP_SIZE - 200);
    const y = 100 + rng() * (MAP_SIZE - 200);
    if (Math.hypot(x - cx, y - cy) < SAFE_RADIUS + 80) continue;
    const cand = rng() < 0.5
      ? { kind: 'circle', x, y, r: 20 + rng() * 40 }
      : { kind: 'rect', x: x - 30 - rng() * 50, y: y - 30 - rng() * 50, w: 60 + rng() * 100, h: 60 + rng() * 100 };
    if (farEnough(cand, obstacles)) obstacles.push(cand);
  }
  const scatteredGems = [];
  guard = 0;
  while (scatteredGems.length < GEM_COUNT && guard++ < 2000) {
    const x = 50 + rng() * (MAP_SIZE - 100);
    const y = 50 + rng() * (MAP_SIZE - 100);
    if (Math.hypot(x - cx, y - cy) < SAFE_RADIUS) continue;
    if (insideObstacle(x, y, 8, obstacles)) continue;
    scatteredGems.push({ x, y, value: 1 });
  }
  return { size: MAP_SIZE, spawn: { x: cx, y: cy }, obstacles, scatteredGems };
}
