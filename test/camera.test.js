import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { createCamera, updateCamera, addShake } from '../src/core/camera.js';

test('跟随并夹紧在传入的 CSS 逻辑视口', () => {
  const cam = createCamera(800, 600);
  updateCamera(cam, { x: 0, y: 0 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 0);
  assert.equal(cam.y, 0);
  updateCamera(cam, { x: 3000, y: 3000 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 2200);
  assert.equal(cam.y, 2400);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 1100);
  assert.equal(cam.y, 1200);
});

test('setViewport 更新相机逻辑宽高而不改变位置与震屏状态', () => {
  const cam = createCamera(1280, 720);
  cam.x = 300;
  cam.y = 400;
  cam.shakeMag = 8;
  cam.shakeT = 0.1;
  assert.equal(cam.setViewport(640, 360), cam);
  assert.equal(cam.viewW, 640);
  assert.equal(cam.viewH, 360);
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
