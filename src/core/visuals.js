import { onPaletteChange, PALETTE } from '../config/palette.js';
import { ASSET_BY_ID } from '../config/assets.js';

export const SHAPES = Object.create(null);
export const PARTS = Object.create(null);

const warned = new Set();
const IMAGE_URLS = new Map();
const IMAGE_CACHE = new Map();
const IMAGE_PROMISES = new Map();
const FAILED_IMAGES = new Set();
const IMAGE_GENERATIONS = new Map();
const VISUAL_CANVAS_CACHE = new Map();
let cacheEpoch = 0;

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

function handleFallback(ctx, x, y, size, settings) {
  if (typeof settings.onFallback === 'function') {
    settings.onFallback();
  } else {
    paintFallback(ctx, x, y, size, settings);
  }
}

function invalidateCanvasCache(id) {
  const prefix = `${id}:`;
  for (const key of VISUAL_CANVAS_CACHE.keys())
    if (key.startsWith(prefix)) VISUAL_CANVAS_CACHE.delete(key);
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

export function registerImage(id, url) {
  if (typeof id !== 'string' || id.length === 0 || typeof url !== 'string' || url.length === 0)
    throw new TypeError('registerImage(id, url) requires non-empty id and url');
  IMAGE_GENERATIONS.set(id, (IMAGE_GENERATIONS.get(id) ?? 0) + 1);
  IMAGE_URLS.set(id, url);
  IMAGE_CACHE.delete(id);
  IMAGE_PROMISES.delete(id);
  FAILED_IMAGES.delete(id);
  invalidateCanvasCache(id);
  return url;
}

function loadImage(id) {
  if (IMAGE_CACHE.has(id)) return Promise.resolve(IMAGE_CACHE.get(id));
  if (IMAGE_PROMISES.has(id)) return IMAGE_PROMISES.get(id);

  const url = IMAGE_URLS.get(id);
  const ImageCtor = globalThis.Image;
  if (typeof ImageCtor !== 'function') {
    FAILED_IMAGES.add(id);
    warnOnce(`image:${id}`, `[visuals] 图片视觉 "${id}" 无法加载，回退 circle 占位`);
    const unavailable = Promise.resolve(null);
    IMAGE_PROMISES.set(id, unavailable);
    return unavailable;
  }

  const generation = IMAGE_GENERATIONS.get(id) ?? 0;
  const epoch = cacheEpoch;
  const promise = new Promise(resolve => {
    let image;
    let settled = false;
    const isCurrent = () => (
      cacheEpoch === epoch && IMAGE_GENERATIONS.get(id) === generation
    );
    const fail = () => {
      if (settled) return;
      settled = true;
      if (!isCurrent()) {
        resolve(null);
        return;
      }
      FAILED_IMAGES.add(id);
      warnOnce(`image:${id}`, `[visuals] 图片视觉 "${id}" 加载失败，回退 circle 占位`);
      resolve(null);
    };
    const succeed = async () => {
      try {
        if (typeof image.decode === 'function') await image.decode();
      } catch {
        fail();
        return;
      }
      if (settled) return;
      settled = true;
      if (!isCurrent()) {
        resolve(null);
        return;
      }
      IMAGE_CACHE.set(id, image);
      invalidateCanvasCache(id);
      resolve(image);
    };

    try {
      image = new ImageCtor();
      image.onload = succeed;
      image.onerror = fail;
      image.src = url;
    } catch {
      fail();
    }
  });
  IMAGE_PROMISES.set(id, promise);
  return promise;
}

export function preloadVisuals() {
  return Promise.all([...IMAGE_URLS.keys()].map(id => loadImage(id)));
}

export function getLoadedImage(id) {
  return IMAGE_CACHE.get(id) ?? null;
}

const warnedMonsterVisuals = new Set();

function warnMonsterVisual(kind, id) {
  const key = `${kind}:${id}`;
  if (warnedMonsterVisuals.has(key)) return;
  warnedMonsterVisuals.add(key);
  console.warn(`未知怪物视觉 ${kind}: ${id}，已使用 circle/占位回退`);
}

function resolveMonsterColor(token, fallback) {
  return typeof token === 'string' && typeof PALETTE[token] === 'string'
    ? PALETTE[token]
    : PALETTE[fallback];
}

function drawMonsterComposite(ctx, x, y, size, visual, options = {}) {
  const scale = Number.isFinite(visual.scale) && visual.scale > 0 ? visual.scale : 1;
  const drawSize = size * scale;
  const radius = drawSize / 2;
  const colors = {
    fill: resolveMonsterColor(visual.palette?.fill, 'ground'),
    stroke: resolveMonsterColor(visual.palette?.stroke, 'neon'),
    glow: resolveMonsterColor(visual.palette?.glow, 'neonDim'),
  };
  const body = SHAPES[visual.body];
  if (!body) warnMonsterVisual('body', visual.body);

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= Number.isFinite(options.alpha) ? options.alpha : 1;
  ctx.fillStyle = options.fillStyle ?? colors.fill;
  ctx.strokeStyle = options.strokeStyle ?? colors.stroke;
  ctx.shadowColor = options.shadowColor ?? colors.glow;
  ctx.shadowBlur = options.shadowBlur ?? 8;
  ctx.lineWidth = options.lineWidth ?? 2;

  (body || SHAPES.circle)(ctx, 0, 0, radius);
  ctx.fill();
  (body || SHAPES.circle)(ctx, 0, 0, radius);
  ctx.stroke();

  const parts = Array.isArray(visual.parts) ? visual.parts : [];
  const phase = Number.isFinite(options.phase) ? options.phase : 0;
  const lit = options.lit === true;
  const fuseProgress = Number.isFinite(options.fuseProgress) ? options.fuseProgress : 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const part of parts) {
      if ((pass === 0) !== (part.type === 'trail')) continue;
      const drawPart = PARTS[part.type];
      if (!drawPart) {
        warnMonsterVisual('part', part.type);
        ctx.save();
        ctx.fillStyle = colors.glow;
        SHAPES.circle(ctx, 0, 0, Math.max(1, radius * 0.12));
        ctx.fill();
        ctx.restore();
        continue;
      }
      drawPart(ctx, drawSize, { ...part, palette: colors, lit, fuseProgress }, phase);
    }
  }
  ctx.restore();
}

registerPart('eyes', (ctx, size, params) => {
  const r = size / 2;
  const count = Math.max(1, Math.trunc(params.count ?? 2));
  const narrow = params.style === 'narrow';
  const eyeColor = params.palette?.glow ?? PALETTE.neon;
  ctx.save();
  ctx.fillStyle = eyeColor;
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * r * 0.9;
    const ey = -r * 0.18;
    const ew = r * (narrow ? 0.13 : 0.18);
    const eh = r * (narrow ? 0.045 : 0.1);
    ctx.beginPath();
    if (params.style === 'angry') {
      ctx.moveTo(offset - ew, ey - eh * 0.4);
      ctx.lineTo(offset + ew, ey + eh * 0.4);
      ctx.lineTo(offset + ew * 0.75, ey + eh * 1.2);
      ctx.lineTo(offset - ew * 0.75, ey + eh * 0.5);
      ctx.closePath();
    } else {
      ctx.ellipse(offset, ey, ew, eh, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
});

registerPart('mouth', (ctx, size, params) => {
  const r = size / 2;
  const style = params.style ?? 'crooked';
  const color = params.lit ? (params.palette?.glow ?? PALETTE.neon) : (params.palette?.stroke ?? PALETTE.neon);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, r * (style === 'thick-jaw' ? 0.1 : 0.06));
  ctx.shadowColor = style === 'glow' ? color : 'transparent';
  ctx.shadowBlur = style === 'glow' ? r * 0.35 : 0;
  ctx.beginPath();
  ctx.moveTo(-r * 0.35, r * 0.2);
  ctx.quadraticCurveTo(0, r * (style === 'thick-jaw' ? 0.5 : 0.35), r * 0.35, r * 0.12);
  ctx.stroke();
  if (style === 'thick-jaw') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, r * 0.38);
    ctx.lineTo(r * 0.28, r * 0.32);
    ctx.stroke();
  }
  if (style === 'glow') {
    ctx.beginPath();
    ctx.arc(0, r * 0.25, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
});

registerPart('cracks', (ctx, size, params, phase) => {
  const r = size / 2;
  const density = Math.max(0, Number(params.density ?? 0.3));
  ctx.save();
  if (params.style === 'spots') {
    const count = Math.max(1, Math.round(density * 10));
    ctx.fillStyle = params.palette?.fill ?? PALETTE.obstacle;
    for (let i = 0; i < count; i++) {
      const angle = (i + 1) * 2.399963229728653;
      const distance = r * (0.2 + ((i * 37) % 10) / 10 * 0.52);
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, Math.max(1, r * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  const count = Math.max(1, Math.round(density * 8));
  const color = params.lit ? (params.palette?.glow ?? PALETTE.gold) : (params.palette?.stroke ?? PALETTE.neon);
  ctx.strokeStyle = color;
  ctx.shadowColor = params.lit ? color : 'transparent';
  ctx.shadowBlur = params.lit ? 6 + 4 * Math.sin(phase) : 0;
  ctx.globalAlpha *= params.lit ? 0.8 + 0.2 * Math.max(0, Math.min(1, params.fuseProgress ?? 0)) : 0.7;
  ctx.lineWidth = Math.max(1, r * 0.045);
  for (let i = 0; i < count; i++) {
    const angle = -1.3 + (i / count) * 2.6;
    const sx = Math.cos(angle) * r * 0.18;
    const sy = Math.sin(angle) * r * 0.18;
    const ex = Math.cos(angle) * r * 0.72;
    const ey = Math.sin(angle) * r * 0.72;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo((sx + ex) / 2 + Math.sin(phase + i) * r * 0.08, (sy + ey) / 2);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.restore();
});

registerPart('trail', (ctx, size, params, phase) => {
  if (params.style !== 'speed') return;
  const r = size / 2;
  ctx.save();
  ctx.strokeStyle = params.palette?.glow ?? PALETTE.gold;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.globalAlpha *= 0.3;
  for (let i = 1; i <= 3; i++) {
    const y = Math.sin(phase * 1.7 + i) * r * 0.08;
    const endX = -r * (0.65 + i * 0.22);
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }
  ctx.restore();
});

registerPart('spikes', (ctx, size, params, phase) => {
  const r = size / 2;
  const style = params.style ?? 'rim';
  const count = Math.max(1, Math.trunc(params.count ?? (style === 'multi' ? 10 : 6)));
  const color = params.lit ? (params.palette?.glow ?? PALETTE.gold) : (params.palette?.stroke ?? PALETTE.gold);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.045);
  if (style === 'sparks') {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (i - (count - 1) / 2) * 0.24 + Math.sin(phase + i) * 0.04;
      const inner = r * 0.82;
      const outer = r * (1.12 + 0.08 * Math.sin(phase * 2 + i));
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
  } else {
    const outer = style === 'multi' ? r * 1.2 : r * 1.14;
    for (let i = 0; i < count; i++) {
      const angle = phase * 0.03 + (i / count) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * r * 0.84, Math.sin(angle) * r * 0.84);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
  }
  ctx.restore();
});

export function drawVisual(ctx, id, x, y, size, options = {}) {
  const settings = options ?? {};
  if (settings.visual) {
    drawMonsterComposite(ctx, x, y, size, settings.visual, settings);
    return true;
  }
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

  if (IMAGE_URLS.has(id)) {
    const image = IMAGE_CACHE.get(id);
    if (image) {
      const asset = ASSET_BY_ID?.[id];
      if (asset?.atlas && settings.frame) {
        const frameDef = asset.atlas.frameOrder?.find(
          f => f.direction === settings.frame.direction && f.frame === settings.frame.index,
        );
        if (frameDef) {
          ctx.drawImage(
            image,
            frameDef.x, frameDef.y, frameDef.width, frameDef.height,
            x - size, y - size, size * 2, size * 2,
          );
          return true;
        }
        handleFallback(ctx, x, y, size, settings);
        return false;
      }
      if (asset?.crop) {
        ctx.drawImage(
          image,
          asset.crop.x, asset.crop.y, asset.crop.width, asset.crop.height,
          x - size, y - size, size * 2, size * 2,
        );
        return true;
      }
      ctx.drawImage(image, x - size, y - size, size * 2, size * 2);
      return true;
    }
    if (!FAILED_IMAGES.has(id) && settings.warn !== false)
      warnOnce(`image:${id}`, `[visuals] 图片视觉 "${id}" 尚未预加载，回退 circle 占位`);
    handleFallback(ctx, x, y, size, settings);
    return false;
  }

  if (settings.warn !== false)
    warnOnce(`unknown:${id}`, `[visuals] 未知视觉 ID "${id}"，回退 circle 占位`);
  handleFallback(ctx, x, y, size, settings);
  return false;
}

function createCanvas(size, options) {
  if (typeof options.createCanvas === 'function') return options.createCanvas(size, size);
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(size, size);
  return { width: size, height: size, getContext: () => null };
}

export function getVisualCanvas(id, size, options = {}) {
  if (!Number.isFinite(size) || size <= 0)
    throw new RangeError('getVisualCanvas(id, size) requires a positive finite size');
  const pixelSize = Math.max(1, Math.round(size));
  const frameKey = options?.frame ? `:${options.frame.direction}:${options.frame.index}` : '';
  const key = `${id}:${pixelSize}${frameKey}`;
  if (VISUAL_CANVAS_CACHE.has(key)) return VISUAL_CANVAS_CACHE.get(key);

  const canvas = createCanvas(pixelSize, options ?? {});
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext?.('2d');
  if (ctx) drawVisual(ctx, id, pixelSize / 2, pixelSize / 2, pixelSize / 2, options);
  VISUAL_CANVAS_CACHE.set(key, canvas);
  return canvas;
}

export function clearCaches() {
  cacheEpoch += 1;
  IMAGE_CACHE.clear();
  IMAGE_PROMISES.clear();
  FAILED_IMAGES.clear();
  VISUAL_CANVAS_CACHE.clear();
}

onPaletteChange(() => clearCaches());

registerShape('circle', (ctx, x, y, r) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
});
registerShape('triangle', (ctx, x, y, r) => poly(ctx, x, y, r, 3));
registerShape('hexagon', (ctx, x, y, r) => poly(ctx, x, y, r, 6));
registerShape('pentagon', (ctx, x, y, r) => poly(ctx, x, y, r, 5));
registerShape('diamond', (ctx, x, y, r) => poly(ctx, x, y, r, 4));
