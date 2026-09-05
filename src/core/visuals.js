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
