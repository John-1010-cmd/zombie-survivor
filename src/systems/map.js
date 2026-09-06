import { circleHit, circleRectHit } from '../core/physics.js';
import { drawVisual, registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';

export const MAP_SIZE = 3000;
const OBSTACLE_COUNT = 60;
const MIN_GAP = 150;
const SAFE_RADIUS = 200;
const COIN_COUNT = 40;
export const SHOP_R = 46;
export const SHOP_INTERACT_R = 90;
export const SHOP_POSITIONS = [[750, 750], [2250, 750], [750, 2250], [2250, 2250], [1500, 1150]];
export const ROCK_VARIANT_COUNT = 3;
export const RECT_VARIANT_COUNT = 2;
export const ROCK_VISUAL_ID = 'scene.rock';
export const VEHICLE_VISUAL_ID = 'scene.vehicle';
export const CONCRETE_VISUAL_ID = 'scene.concrete';

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

export function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function obstacleVariant(id, kind) {
  const count = kind === 'circle' ? ROCK_VARIANT_COUNT : RECT_VARIANT_COUNT;
  return hashId(id) % count;
}

export function obstacleVisualId(obstacle) {
  if (obstacle.kind === 'circle') return ROCK_VISUAL_ID;
  return obstacle.variant % 2 === 0 ? VEHICLE_VISUAL_ID : CONCRETE_VISUAL_ID;
}

const ROCK_POINTS = [
  [[-0.82, -0.10], [-0.55, -0.72], [0.02, -0.84], [0.72, -0.55], [0.86, 0.08], [0.48, 0.74], [-0.22, 0.82], [-0.78, 0.48]],
  [[-0.88, 0.06], [-0.64, -0.63], [-0.12, -0.86], [0.56, -0.72], [0.88, -0.08], [0.65, 0.62], [0.05, 0.86], [-0.68, 0.56]],
  [[-0.78, -0.28], [-0.38, -0.80], [0.28, -0.78], [0.82, -0.30], [0.76, 0.42], [0.20, 0.86], [-0.52, 0.70], [-0.88, 0.20]],
];

function traceRock(ctx, points, r, ox = 0, oy = 0, sx = 1, sy = 1) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const px = ox + points[i][0] * r * sx;
    const py = oy + points[i][1] * r * sy;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

registerPart(ROCK_VISUAL_ID, (ctx, size, params = {}) => {
  const r = size * 0.5;
  const points = ROCK_POINTS[(params.variant ?? 0) % ROCK_VARIANT_COUNT];
  ctx.save();
  traceRock(ctx, points, r);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fill();
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 7;
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = PALETTE.text;
  traceRock(ctx, points, r, 0, -r * 0.18, 0.62, 0.28);
  ctx.fill();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = PALETTE.hudPanel;
  traceRock(ctx, points, r, 0, r * 0.24, 0.74, 0.25);
  ctx.fill();
  ctx.restore();
});

registerPart(VEHICLE_VISUAL_ID, (ctx, size, params = {}) => {
  const w = params.width ?? size;
  const h = params.height ?? size * 0.62;
  ctx.save();
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
  ctx.fillStyle = PALETTE.neonDim;
  ctx.fillRect(-w * 0.30, -h * 0.28, w * 0.60, h * 0.24);
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(-w * 0.24, -h * 0.24, w * 0.20, h * 0.16);
  ctx.fillRect(w * 0.04, -h * 0.24, w * 0.20, h * 0.16);
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.beginPath();
  ctx.arc(-w * 0.30, h * 0.42, Math.max(5, h * 0.13), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.30, h * 0.42, Math.max(5, h * 0.13), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = 2;
  ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
  ctx.restore();
});

registerPart(CONCRETE_VISUAL_ID, (ctx, size, params = {}) => {
  const w = params.width ?? size;
  const h = params.height ?? size * 0.62;
  ctx.save();
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
  ctx.fillStyle = PALETTE.neonDim;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(-w * 0.5, -h * 0.5, w, h * 0.18);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w * 0.34, -h * 0.28);
  ctx.lineTo(-w * 0.08, h * 0.24);
  ctx.lineTo(w * 0.12, -h * 0.06);
  ctx.lineTo(w * 0.34, h * 0.28);
  ctx.moveTo(-w * 0.08, -h * 0.38);
  ctx.lineTo(w * 0.02, -h * 0.08);
  ctx.lineTo(w * 0.28, -h * 0.30);
  ctx.stroke();
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
  ctx.restore();
});

export function renderObstacle(ctx, obstacle) {
  const circle = obstacle.kind === 'circle';
  const x = circle ? obstacle.x : obstacle.x + obstacle.w * 0.5;
  const y = circle ? obstacle.y : obstacle.y + obstacle.h * 0.5;
  const size = circle ? obstacle.r * 2 : Math.max(obstacle.w, obstacle.h);
  const params = circle
    ? { variant: obstacle.variant }
    : { variant: obstacle.variant, width: obstacle.w, height: obstacle.h };
  drawVisual(ctx, obstacleVisualId(obstacle), x, y, size, { params, phase: 0 });
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
    if (farEnough(cand, obstacles, shops)) {
      const id = 'obstacle-' + obstacles.length;
      obstacles.push({ ...cand, id, variant: obstacleVariant(id, cand.kind) });
    }
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

export const SUPPLY_STATION_VISUAL_ID = 'scene.supplyStation';
export const SHOP_LABEL = 'SUPPLY';

export function shopPulseState(timeSec, distance, interactR = SHOP_INTERACT_R) {
  const wave = (Math.sin(timeSec * 4) + 1) * 0.5;
  return {
    active: distance < interactR,
    alpha: 0.16 + 0.18 * wave,
    scale: 1 + 0.05 * wave,
  };
}

registerPart(SUPPLY_STATION_VISUAL_ID, (ctx, size, params = {}) => {
  const r = size * 0.5;
  const active = params.active === true;
  const ringAlpha = active ? params.alpha ?? 0.2 : 0.08;
  const ringScale = active ? params.scale ?? 1 : 1;
  const interactR = params.interactR ?? SHOP_INTERACT_R;
  ctx.save();
  ctx.globalAlpha = ringAlpha;
  ctx.strokeStyle = PALETTE.neon;
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = active ? 12 : 5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, interactR * ringScale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(-r * 0.62, -r * 0.12, r * 1.24, r * 0.66);
  ctx.fillStyle = PALETTE.neonDim;
  ctx.beginPath();
  ctx.moveTo(-r * 0.76, -r * 0.12);
  ctx.lineTo(0, -r * 0.66);
  ctx.lineTo(r * 0.76, -r * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = 7;
  ctx.strokeStyle = PALETTE.neon;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeRect(-r * 0.62, -r * 0.12, r * 1.24, r * 0.66);
  ctx.shadowBlur = 0;

  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(-r * 0.22, -r * 0.48, r * 0.44, r * 0.24);
  ctx.strokeStyle = PALETTE.panel;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.11, -r * 0.44);
  ctx.lineTo(-r * 0.11, -r * 0.28);
  ctx.moveTo(r * 0.11, -r * 0.44);
  ctx.lineTo(r * 0.11, -r * 0.28);
  ctx.stroke();
  ctx.restore();
});

export function renderShop(ctx, shop, player, timeSec) {
  const distance = Math.hypot(player.x - shop.x, player.y - shop.y);
  const pulse = shopPulseState(timeSec, distance, shop.interactR);
  drawVisual(ctx, SUPPLY_STATION_VISUAL_ID, shop.x, shop.y, shop.r * 2, {
    params: {
      active: pulse.active,
      alpha: pulse.alpha,
      scale: pulse.scale,
      interactR: shop.interactR,
    },
    phase: timeSec,
  });
  ctx.save();
  ctx.fillStyle = PALETTE.text;
  ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(SHOP_LABEL, shop.x, shop.y + shop.r + 18);
  if (distance < shop.interactR + 120) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('AUTO OPEN', shop.x, shop.y - shop.r - 14);
  }
  ctx.restore();
}

export const TERRAIN_TILE_SIZE = 128;

function defaultCanvasFactory(size) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function terrainPaletteKey(palette) {
  return String(palette.ground) + '|' + String(palette.obstacle) + '|' +
    String(palette.neon) + '|' + String(palette.neonDim);
}

export function createTerrainTile(palette = PALETTE, canvasFactory = defaultCanvasFactory) {
  const canvas = canvasFactory(TERRAIN_TILE_SIZE);
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  canvas.width = TERRAIN_TILE_SIZE;
  canvas.height = TERRAIN_TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = palette.ground;
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
  for (let i = 0; i < 180; i++) {
    const x = (i * 73 + 17) % TERRAIN_TILE_SIZE;
    const y = (i * 151 + 29) % TERRAIN_TILE_SIZE;
    const side = i % 9 === 0 ? 2 : 1;
    ctx.fillStyle = i % 5 === 0 ? palette.neonDim : palette.obstacle;
    ctx.globalAlpha = i % 7 === 0 ? 0.22 : 0.10;
    ctx.fillRect(x, y, side, side);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export function createTerrainRenderer({ palette = PALETTE, canvasFactory = defaultCanvasFactory } = {}) {
  let tile = null;
  let builtKey = null;
  let buildCount = 0;

  function ensureTile() {
    const key = terrainPaletteKey(palette);
    if (key !== builtKey) {
      tile = createTerrainTile(palette, canvasFactory);
      builtKey = key;
      buildCount++;
    }
    return tile;
  }

  function draw(ctx, viewport) {
    const current = ensureTile();
    if (!current || !ctx || typeof ctx.drawImage !== 'function') return;
    const x0 = Math.floor(viewport.x / TERRAIN_TILE_SIZE) * TERRAIN_TILE_SIZE;
    const y0 = Math.floor(viewport.y / TERRAIN_TILE_SIZE) * TERRAIN_TILE_SIZE;
    const x1 = viewport.x + viewport.width;
    const y1 = viewport.y + viewport.height;
    for (let x = x0; x < x1; x += TERRAIN_TILE_SIZE) {
      for (let y = y0; y < y1; y += TERRAIN_TILE_SIZE)
        ctx.drawImage(current, x, y, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
    }
  }

  function invalidate() {
    tile = null;
    builtKey = null;
  }

  return {
    draw,
    getTile: ensureTile,
    getBuildCount: () => buildCount,
    invalidate,
  };
}
