export const CAMERA_ZOOM = 1.5;

export function createCamera(viewW, viewH, zoom = CAMERA_ZOOM) {
  const z = zoom > 0 ? zoom : 1;
  return {
    x: 0,
    y: 0,
    zoom: z,
    viewW: viewW / z,
    viewH: viewH / z,
    shakeMag: 0,
    shakeT: 0,
    offX: 0,
    offY: 0,
    setViewport(w, h) {
      this.viewW = w / this.zoom;
      this.viewH = h / this.zoom;
      return this;
    },
  };
}

export function addShake(cam, mag) {
  cam.shakeMag = mag;
  cam.shakeT = 0.15;
}

export function updateCamera(cam, target, mapSize, rng, dt) {
  cam.x = Math.max(0, Math.min(mapSize - cam.viewW, target.x - cam.viewW / 2));
  cam.y = Math.max(0, Math.min(mapSize - cam.viewH, target.y - cam.viewH / 2));
  if (cam.shakeT > 0) {
    cam.shakeT -= dt;
    const m = cam.shakeMag * Math.max(0, cam.shakeT) / 0.15;
    cam.offX = (rng() * 2 - 1) * m || 0;
    cam.offY = (rng() * 2 - 1) * m || 0;
  } else {
    cam.offX = 0;
    cam.offY = 0;
  }
}

export function applyCameraTransform(ctx, cam) {
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + cam.offX, -cam.y + cam.offY);
}

export function screenToWorld(cam, sx, sy) {
  return {
    x: cam.x - cam.offX + sx / cam.zoom,
    y: cam.y - cam.offY + sy / cam.zoom,
  };
}

export function worldToScreen(cam, wx, wy) {
  return {
    x: (wx - cam.x + cam.offX) * cam.zoom,
    y: (wy - cam.y + cam.offY) * cam.zoom,
  };
}
