import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { createCamera, updateCamera, addShake } from '../src/core/camera.js';

test('跟随并夹紧在地图边界', () => {
  const cam = createCamera(1280, 720);
  updateCamera(cam, { x: 0, y: 0 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 0); assert.equal(cam.y, 0);
  updateCamera(cam, { x: 3000, y: 3000 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 3000 - 1280); assert.equal(cam.y, 3000 - 720);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, mulberry32(1), 0.016);
  assert.equal(cam.x, 1500 - 640); assert.equal(cam.y, 1500 - 360);
});

test('震屏偏移在 0.15s 后归零', () => {
  const cam = createCamera(1280, 720);
  const rng = mulberry32(9);
  addShake(cam, 8);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, rng, 0.05);
  assert.ok(cam.offX !== 0 || cam.offY !== 0);
  updateCamera(cam, { x: 1500, y: 1500 }, 3000, rng, 0.2);
  assert.equal(cam.offX, 0); assert.equal(cam.offY, 0);
});
