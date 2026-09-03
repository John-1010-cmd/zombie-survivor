import { PALETTE } from '../config/palette.js';

export const SHAPES = Object.create(null);
export const PARTS = Object.create(null);

const warned = new Set();

function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

function poly(ctx, x, y, r, n, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function paintPath(ctx, pathFn, x, y, r, options) {
  ctx.save();
  if (options.shadowColor !== undefined) ctx.shadowColor = options.shadowColor;
  if (options.shadowBlur !== undefined) ctx.shadowBlur = options.shadowBlur;
  pathFn(ctx, x, y, r);
  const fillStyle = options.fillStyle ?? options.fill ?? options.color;
  if (fillStyle !== undefined) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  const strokeStyle = options.strokeStyle ?? options.stroke;
  if (strokeStyle !== undefined) {
    ctx.strokeStyle = strokeStyle;
    if (options.lineWidth !== undefined) ctx.lineWidth = options.lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

function paintFallback(ctx, x, y, r, options) {
  paintPath(ctx, SHAPES.circle, x, y, r, {
    ...options,
    fillStyle: options.fillStyle ?? options.fill ?? options.color ?? PALETTE.neon,
    strokeStyle: options.strokeStyle ?? options.stroke ?? PALETTE.neon,
  });
}

export function registerShape(id, pathFn) {
  if (typeof id !== 'string' || id.length === 0 || typeof pathFn !== 'function')
    throw new TypeError('registerShape(id, pathFn) requires a non-empty id and function');
  SHAPES[id] = pathFn;
  return pathFn;
}

export function registerPart(id, drawFn) {
  if (typeof id !== 'string' || id.length === 0 || typeof drawFn !== 'function')
    throw new TypeError('registerPart(id, drawFn) requires a non-empty id and function');
  PARTS[id] = drawFn;
  return drawFn;
}

export function drawVisual(ctx, id, x, y, size, options = {}) {
  const settings = options ?? {};
  const shape = SHAPES[id];
  if (shape) {
    paintPath(ctx, shape, x, y, size, settings);
    return true;
  }

  const part = PARTS[id];
  if (part) {
    ctx.save();
    ctx.translate(x, y);
    part(ctx, size, settings.params ?? {}, settings.phase ?? 0);
    ctx.restore();
    return true;
  }

  warnOnce(`unknown:${id}`, `[visuals] 未知视觉 ID "${id}"，回退 circle 占位`);
  paintFallback(ctx, x, y, size, settings);
  return false;
}

registerShape('circle', (ctx, x, y, r) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
});
registerShape('triangle', (ctx, x, y, r) => poly(ctx, x, y, r, 3));
registerShape('hexagon', (ctx, x, y, r) => poly(ctx, x, y, r, 6));
registerShape('pentagon', (ctx, x, y, r) => poly(ctx, x, y, r, 5));
registerShape('diamond', (ctx, x, y, r) => poly(ctx, x, y, r, 4));
