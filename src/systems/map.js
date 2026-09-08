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

function drawOctagonPath(ctx, cx, cy, w, h, c) {
  ctx.beginPath();
  ctx.moveTo(cx - w + c, cy - h);
  ctx.lineTo(cx + w - c, cy - h);
  ctx.lineTo(cx + w, cy - h + c);
  ctx.lineTo(cx + w, cy + h - c);
  ctx.lineTo(cx + w - c, cy + h);
  ctx.lineTo(cx - w + c, cy + h);
  ctx.lineTo(cx - w, cy + h - c);
  ctx.lineTo(cx - w, cy - h + c);
  ctx.closePath();
}

function drawBoxPath(ctx, x, y, w, h) {
  ctx.beginPath();
  if (typeof ctx.rect === 'function') {
    ctx.rect(x, y, w, h);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }
}

registerPart(SUPPLY_STATION_VISUAL_ID, (ctx, size, params = {}, phase = 0) => {
  const r = size * 0.5;
  const active = params.active === true;
  const time = Number(params.timeSec ?? phase ?? 0);

  // 1. 交互半径圈（保持原有半径与脉冲动画不变）
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
  ctx.restore();

  ctx.save();

  // 2. 地面接触阴影（微斜视投影）
  const shadowW = r * 0.86;
  const shadowH = r * 0.70;
  const shadowY = r * 0.08;
  const sc = r * 0.22;
  ctx.save();
  ctx.fillStyle = PALETTE.bg;
  ctx.globalAlpha = 0.5;
  drawOctagonPath(ctx, 0, shadowY, shadowW, shadowH, sc);
  ctx.fill();
  ctx.restore();

  // 3. 几何基座平台（八角形切角重工平台：暗色填充 + 克制霓虹描边）
  const pw = r * 0.82;
  const ph = r * 0.66;
  const py = r * 0.04;
  const pc = r * 0.20;
  drawOctagonPath(ctx, 0, py, pw, ph, pc);
  ctx.fillStyle = PALETTE.panel;
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = active ? PALETTE.neon : PALETTE.boundary;
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = active ? 8 : 2;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // 基座内圈科技防滑装甲嵌线
  const ipw = pw - r * 0.08;
  const iph = ph - r * 0.08;
  const ipc = pc - r * 0.03;
  drawOctagonPath(ctx, 0, py, ipw, iph, ipc);
  ctx.strokeStyle = PALETTE.obstacle;
  ctx.lineWidth = 1;
  ctx.stroke();

  // 基座四角防撞地脚/固定螺栓
  ctx.fillStyle = PALETTE.textDim;
  const boltOffset = r * 0.62;
  const boltR = Math.max(1, r * 0.035);
  const bolts = [
    [-boltOffset, py - ph + pc * 0.6],
    [boltOffset, py - ph + pc * 0.6],
    [boltOffset, py + ph - pc * 0.6],
    [-boltOffset, py + ph - pc * 0.6],
  ];
  for (const [bx, by] of bolts) {
    ctx.beginPath();
    ctx.arc(bx, by, boltR, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. 主体建筑块（俯视/微斜视碉堡结构）
  const bw = r * 0.52;
  // 前立面（提供厚度感与正面阴影）
  drawBoxPath(ctx, -bw, py - r * 0.04, bw * 2, r * 0.40);
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.fill();
  ctx.strokeStyle = PALETTE.boundary;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 主体顶盖面（装甲板灰色金属受光面）
  ctx.beginPath();
  ctx.moveTo(-bw, py - r * 0.04);
  ctx.lineTo(-bw + r * 0.06, py - r * 0.48);
  ctx.lineTo(bw - r * 0.06, py - r * 0.48);
  ctx.lineTo(bw, py - r * 0.04);
  ctx.closePath();
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fill();
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 顶盖中心接缝装甲刻线
  ctx.strokeStyle = PALETTE.panel;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, py - r * 0.46);
  ctx.lineTo(0, py - r * 0.06);
  ctx.moveTo(-bw + r * 0.16, py - r * 0.26);
  ctx.lineTo(bw - r * 0.16, py - r * 0.26);
  ctx.stroke();

  // 5. 屋顶前伸悬臂雨棚（遮阳檐棚，边缘带导光条）
  const awW = r * 0.44;
  const awLipW = r * 0.40;
  const awTopY = py - r * 0.06;
  const awBotY = py + r * 0.14;
  ctx.beginPath();
  ctx.moveTo(-awW, awTopY);
  ctx.lineTo(awW, awTopY);
  ctx.lineTo(awLipW, awBotY);
  ctx.lineTo(-awLipW, awBotY);
  ctx.closePath();
  ctx.fillStyle = PALETTE.panel;
  ctx.fill();
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 雨棚前沿导光条（激活时高亮，闲置时金黄状态标）
  ctx.save();
  ctx.strokeStyle = active ? PALETTE.neon : PALETTE.gold;
  ctx.shadowColor = active ? PALETTE.neon : PALETTE.gold;
  ctx.shadowBlur = active ? 6 : 2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-awLipW + r * 0.02, awBotY);
  ctx.lineTo(awLipW - r * 0.02, awBotY);
  ctx.stroke();
  ctx.restore();

  // 6. 门口与服务台高光（内凹服务台 + 呼吸交互光带）
  const doorW = r * 0.22;
  const doorTop = py + r * 0.14;
  const doorH = r * 0.22;
  // 门洞内凹深色阴影
  drawBoxPath(ctx, -doorW, doorTop, doorW * 2, doorH);
  ctx.fillStyle = PALETTE.bg;
  ctx.fill();
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = 1;
  ctx.stroke();

  // 柜台面
  drawBoxPath(ctx, -doorW - r * 0.02, doorTop + doorH - r * 0.06, (doorW + r * 0.02) * 2, r * 0.06);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fill();

  // 服务台发光扫描光带（呼吸微动）
  ctx.save();
  const glowWave = (Math.sin(time * 3) + 1) * 0.5;
  const termAlpha = active ? 0.9 + 0.1 * glowWave : 0.45 + 0.25 * glowWave;
  ctx.globalAlpha = termAlpha;
  ctx.fillStyle = active ? PALETTE.neon : PALETTE.neonDim;
  ctx.shadowColor = PALETTE.neon;
  ctx.shadowBlur = active ? 8 : 3;
  drawBoxPath(ctx, -doorW + r * 0.04, doorTop + r * 0.04, (doorW - r * 0.04) * 2, r * 0.04);
  ctx.fill();
  // 门楣状态点
  ctx.fillStyle = active ? PALETTE.neon : PALETTE.gold;
  ctx.beginPath();
  ctx.arc(0, doorTop + r * 0.015, Math.max(1, r * 0.025), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 7. 细节件：补给箱（右侧平台堆叠）
  // 主补给箱（军规货柜，带加固绑带与金色锁扣）
  const crX = r * 0.36;
  const crY = py + r * 0.18;
  const crW = r * 0.24;
  const crH = r * 0.18;
  drawBoxPath(ctx, crX, crY, crW, crH);
  ctx.fillStyle = PALETTE.panel;
  ctx.fill();
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = 1;
  ctx.stroke();
  // 紧固十字带
  ctx.strokeStyle = PALETTE.obstacle;
  ctx.beginPath();
  ctx.moveTo(crX + crW * 0.5, crY);
  ctx.lineTo(crX + crW * 0.5, crY + crH);
  ctx.moveTo(crX, crY + crH * 0.5);
  ctx.lineTo(crX + crW, crY + crH * 0.5);
  ctx.stroke();
  // 金色物资锁扣
  drawBoxPath(ctx, crX + crW * 0.5 - r * 0.03, crY + crH * 0.5 - r * 0.025, r * 0.06, r * 0.05);
  ctx.fillStyle = PALETTE.gold;
  ctx.fill();

  // 副补给箱（前侧小型弹药盒）
  const scX = r * 0.46;
  const scY = py + r * 0.38;
  const scW = r * 0.18;
  const scH = r * 0.13;
  drawBoxPath(ctx, scX, scY, scW, scH);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fill();
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.lineWidth = 1;
  ctx.stroke();

  // 8. 细节件：工业油桶/能量罐（左侧平台双桶组合）
  // 主桶
  const d1X = -r * 0.50;
  const d1Y = py + r * 0.22;
  const d1R = r * 0.11;
  ctx.beginPath();
  ctx.arc(d1X, d1Y, d1R, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fill();
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // 桶面同心圆与注油阀盖
  ctx.beginPath();
  ctx.arc(d1X, d1Y, d1R * 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = PALETTE.panel;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(d1X + d1R * 0.25, d1Y - d1R * 0.25, Math.max(1, r * 0.028), 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.gold;
  ctx.fill();

  // 副桶（斜置能量电池罐）
  const d2X = -r * 0.40;
  const d2Y = py + r * 0.38;
  const d2R = r * 0.09;
  ctx.beginPath();
  ctx.arc(d2X, d2Y, d2R, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.panel;
  ctx.fill();
  ctx.strokeStyle = PALETTE.boundary;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(d2X, d2Y, Math.max(1, r * 0.025), 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.neonDim;
  ctx.fill();

  // 9. 小型天线与呼吸信标灯（左后方通讯桅杆）
  const antBaseX = -bw + r * 0.12;
  const antBaseY = py - r * 0.44;
  const antTipX = -bw - r * 0.02;
  const antTipY = py - r * 0.70;
  ctx.strokeStyle = PALETTE.textDim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(antBaseX, antBaseY);
  ctx.lineTo(antTipX, antTipY);
  // 偶极子天线横向振子
  const crossX = (antBaseX + antTipX) * 0.5;
  const crossY = (antBaseY + antTipY) * 0.5;
  ctx.moveTo(crossX - r * 0.06, crossY - r * 0.02);
  ctx.lineTo(crossX + r * 0.06, crossY + r * 0.02);
  ctx.stroke();

  // 慢闪呼吸信标灯（通过 timeSec / phase 慢速呼吸闪烁）
  const beaconWave = (Math.sin(time * 2.8) + 1) * 0.5;
  const beaconAlpha = active ? 0.7 + 0.3 * beaconWave : 0.3 + 0.7 * beaconWave;
  ctx.save();
  ctx.globalAlpha = beaconAlpha;
  ctx.fillStyle = active ? PALETTE.neon : PALETTE.gold;
  ctx.shadowColor = active ? PALETTE.neon : PALETTE.gold;
  ctx.shadowBlur = active ? 7 + 7 * beaconWave : 3 + 5 * beaconWave;
  ctx.beginPath();
  ctx.arc(antTipX, antTipY, Math.max(1.5, r * 0.055), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 10. 右后方屋顶散热机组（科技感平衡）
  const ventX = bw - r * 0.30;
  const ventY = py - r * 0.44;
  const ventW = r * 0.22;
  const ventH = r * 0.15;
  drawBoxPath(ctx, ventX, ventY, ventW, ventH);
  ctx.fillStyle = PALETTE.panel;
  ctx.fill();
  ctx.strokeStyle = PALETTE.boundary;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = PALETTE.neonDim;
  ctx.beginPath();
  ctx.moveTo(ventX + r * 0.03, ventY + ventH * 0.35);
  ctx.lineTo(ventX + ventW - r * 0.03, ventY + ventH * 0.35);
  ctx.moveTo(ventX + r * 0.03, ventY + ventH * 0.70);
  ctx.lineTo(ventX + ventW - r * 0.03, ventY + ventH * 0.70);
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
      timeSec,
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
