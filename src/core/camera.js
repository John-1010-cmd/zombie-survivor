export function createCamera(viewW, viewH) {
  return { x: 0, y: 0, viewW, viewH, shakeMag: 0, shakeT: 0, offX: 0, offY: 0 };
}
export function addShake(cam, mag) { cam.shakeMag = mag; cam.shakeT = 0.15; }
export function updateCamera(cam, target, mapSize, rng, dt) {
  cam.x = Math.max(0, Math.min(mapSize - cam.viewW, target.x - cam.viewW / 2));
  cam.y = Math.max(0, Math.min(mapSize - cam.viewH, target.y - cam.viewH / 2));
  if (cam.shakeT > 0) {
    cam.shakeT -= dt;
    const m = cam.shakeMag * Math.max(0, cam.shakeT) / 0.15;
    cam.offX = (rng() * 2 - 1) * m || 0;
    cam.offY = (rng() * 2 - 1) * m || 0;
  } else { cam.offX = 0; cam.offY = 0; }
}
