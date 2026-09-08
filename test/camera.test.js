import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import {
  CAMERA_ZOOM,
  createCamera,
  updateCamera,
  addShake,
  applyCameraTransform,
  screenToWorld,
} from '../src/core/camera.js';

test('createCamera 初始化 zoom 并计算逻辑视野 (CSS / zoom)', () => {
  assert.equal(CAMERA_ZOOM, 1.5);
  const cam = createCamera(900, 600);
  assert.equal(cam.zoom, 1.5);
  assert.equal(cam.viewW, 600);
  assert.equal(cam.viewH, 400);

  const customCam = createCamera(800, 600, 2);
  assert.equal(customCam.zoom, 2);
  assert.equal(customCam.viewW, 400);
  assert.equal(customCam.viewH, 300);
});

test('跟随并夹紧在基于 zoom 的逻辑视口', () => {
  const cam = createCamera(900, 600);
  updateCamera(cam, { x: 0, y: 0 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 0);
  assert.equal(cam.y, 0);
  updateCamera(cam, { x: 3000, y: 3000 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 2400);
  assert.equal(cam.y, 2600);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 1200);
  assert.equal(cam.y, 1300);

  const cam1 = createCamera(800, 600, 1);
  updateCamera(cam1, { x: 3000, y: 3000 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam1.x, 2200);
  assert.equal(cam1.y, 2400);
});

test('setViewport 接收 CSS 尺寸并依 zoom 更新相机逻辑宽高', () => {
  const cam = createCamera(1200, 900);
  cam.x = 300;
  cam.y = 400;
  cam.shakeMag = 8;
  cam.shakeT = 0.1;
  assert.equal(cam.setViewport(600, 300), cam);
  assert.equal(cam.viewW, 400);
  assert.equal(cam.viewH, 200);
  assert.equal(cam.x, 300);
  assert.equal(cam.y, 400);
  assert.equal(cam.shakeMag, 8);
  assert.equal(cam.shakeT, 0.1);
});

test('震屏偏移在 0.15s 后归零', () => {
  const cam = createCamera(800, 600);
  const rng = mulberry32(9);
  addShake(cam, 8);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, rng, 0.05);
  assert.ok(cam.offX !== 0 || cam.offY !== 0);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, rng, 0.2);
  assert.equal(cam.offX, 0);
  assert.equal(cam.offY, 0);
});

test('applyCameraTransform 先 scale(zoom) 再 translate(-cam.x + offX, -cam.y + offY)', () => {
  const operations = [];
  const mockCtx = {
    scale(sx, sy) {
      operations.push({ op: 'scale', sx, sy });
    },
    translate(tx, ty) {
      operations.push({ op: 'translate', tx, ty });
    },
  };
  const cam = createCamera(900, 600);
  cam.x = 200;
  cam.y = 150;
  cam.offX = 3;
  cam.offY = -2;

  applyCameraTransform(mockCtx, cam);

  assert.equal(operations.length, 2);
  assert.deepEqual(operations[0], { op: 'scale', sx: 1.5, sy: 1.5 });
  assert.deepEqual(operations[1], { op: 'translate', tx: -197, ty: -152 });
});

test('screenToWorld 将屏幕坐标正确转换为世界坐标', () => {
  const cam = createCamera(900, 600);
  cam.x = 1000;
  cam.y = 500;
  cam.offX = 0;
  cam.offY = 0;

  const origin = screenToWorld(cam, 0, 0);
  assert.equal(origin.x, 1000);
  assert.equal(origin.y, 500);

  const center = screenToWorld(cam, 450, 300);
  assert.equal(center.x, 1300);
  assert.equal(center.y, 700);

  cam.offX = 10;
  cam.offY = -10;
  const withShake = screenToWorld(cam, 0, 0);
  assert.equal(withShake.x, 990);
  assert.equal(withShake.y, 510);
});
