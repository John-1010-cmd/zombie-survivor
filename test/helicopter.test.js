// test/helicopter.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHelicopter, updateHelicopter, renderHelicopter,
  HELICOPTER_VISUAL_ID,
} from '../src/entities/helicopter.js';
import { clearCaches, registerImage, preloadVisuals } from '../src/core/visuals.js';

function makeMockContext() {
  const calls = [];
  return {
    calls,
    arcCount: 0,
    strokeCount: 0,
    fillCount: 0,
    fillRectCount: 0,
    drawImageCount: 0,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(x, y) { calls.push(['translate', x, y]); },
    rotate(angle) { calls.push(['rotate', angle]); },
    scale(sx, sy) { calls.push(['scale', sx, sy]); },
    beginPath() { calls.push(['beginPath']); },
    closePath() { calls.push(['closePath']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    arc(...args) { this.arcCount++; calls.push(['arc', ...args]); },
    fill() { this.fillCount++; calls.push(['fill']); },
    stroke() { this.strokeCount++; calls.push(['stroke']); },
    fillRect(...args) { this.fillRectCount++; calls.push(['fillRect', ...args]); },
    strokeRect(...args) { calls.push(['strokeRect', ...args]); },
    drawImage(...args) { this.drawImageCount++; calls.push(['drawImage', ...args]); },
  };
}

class FakeImage {
  static instances = [];
  constructor() {
    FakeImage.instances.push(this);
  }
  set src(url) {
    this.url = url;
    queueMicrotask(() => this.onload?.());
  }
  decode() {
    return Promise.resolve();
  }
}

test('createHelicopter 初始字段完整（含 visualId）', () => {
  const h = createHelicopter(100, 200);
  assert.equal(h.x, 100);
  assert.equal(h.y, 200);
  assert.equal(h.r, 60);
  assert.equal(h.state, 'landing');
  assert.equal(h.t, 0);
  assert.equal(h.visualId, 'scene.helicopter');
});

test('landing 累计 3 秒后转为 waiting 且计时清零', () => {
  const h = createHelicopter(0, 0);
  const player = { x: 0, y: 0, r: 16 };
  assert.equal(updateHelicopter(h, player, 1), 'none');
  assert.equal(h.state, 'landing');
  assert.equal(h.t, 1);
  assert.equal(updateHelicopter(h, player, 2), 'none');
  assert.equal(h.state, 'waiting');
  assert.equal(h.t, 0);
});

test('waiting 中玩家圆心距 < 60 进入 boarding', () => {
  const h = createHelicopter(0, 0);
  h.state = 'waiting';
  const player = { x: 59, y: 0, r: 16 }; // 距离 59 < 60
  assert.equal(updateHelicopter(h, player, 1), 'none');
  assert.equal(h.state, 'boarding');
});

test('waiting 中玩家圆心距恰 60 不登机（严格小于）', () => {
  const h = createHelicopter(0, 0);
  h.state = 'waiting';
  const player = { x: 60, y: 0, r: 16 };
  assert.equal(updateHelicopter(h, player, 1), 'none');
  assert.equal(h.state, 'waiting');
  assert.equal(h.t, 0);
});

test('boarding 累计 3 秒满 → victory 且 state=done', () => {
  const h = createHelicopter(0, 0);
  h.state = 'boarding';
  const player = { x: 0, y: 0, r: 16 };
  assert.equal(updateHelicopter(h, player, 2.5), 'none');
  assert.equal(h.state, 'boarding');
  assert.equal(h.t, 2.5);
  assert.equal(updateHelicopter(h, player, 0.5), 'victory');
  assert.equal(h.state, 'done');
});

test('boarding 中途玩家离开 → 重置回 waiting 且计时清零', () => {
  const h = createHelicopter(0, 0);
  h.state = 'boarding';
  h.t = 2; // 已登机 2 秒
  const player = { x: 61, y: 0, r: 16 };
  assert.equal(updateHelicopter(h, player, 0.1), 'none');
  assert.equal(h.state, 'waiting');
  assert.equal(h.t, 0);
});

test('done 状态保持，不再返回 victory', () => {
  const h = createHelicopter(0, 0);
  h.state = 'done';
  assert.equal(updateHelicopter(h, { x: 0, y: 0, r: 16 }, 1), 'none');
  assert.equal(h.state, 'done');
});

test('直升机 PNG visual id 已注册且图片未就绪时保留旋翼、fallback 机身和登机光环', () => {
  const h = createHelicopter(0, 0);
  h.state = 'boarding';
  h.t = 1.5;
  const ctx = makeMockContext();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    renderHelicopter(ctx, h);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(HELICOPTER_VISUAL_ID, 'scene.helicopter');
  assert.equal(h.visualId, HELICOPTER_VISUAL_ID);
  assert.equal(warnings.length, 0);
  assert.equal(ctx.drawImageCount, 0);
  assert.ok(ctx.arcCount >= 3);
  assert.ok(ctx.strokeCount >= 3);
  assert.ok(ctx.fillRectCount >= 2);

  const fillRectCalls = ctx.calls.filter(([name]) => name === 'fillRect');
  assert.ok(fillRectCalls.some(c => Math.abs(c[1] - (-60 * 0.92)) < 1e-6));
});

test('直升机图像就绪时进入贴图路径：精确断言到达 drawImage 的实参，跳过 fallback 机身并保留旋翼与登机光环', async () => {
  const originalImage = globalThis.Image;
  try {
    globalThis.Image = FakeImage;
    clearCaches();

    registerImage(HELICOPTER_VISUAL_ID, 'assets/img/scene/helicopter.png');
    await preloadVisuals();

    const h = createHelicopter(100, 200);
    h.state = 'boarding';
    h.t = 1.5;
    const ctx = makeMockContext();
    renderHelicopter(ctx, h, 2.0);

    const drawCalls = ctx.calls.filter(([name]) => name === 'drawImage');
    assert.equal(drawCalls.length, 1, '就绪后必须调用 1 次 drawImage');
    assert.equal(drawCalls[0][1].url, 'assets/img/scene/helicopter.png');
    assert.equal(drawCalls[0][2], -60, '居中 x 坐标应为 -r');
    assert.equal(drawCalls[0][3], -60, '居中 y 坐标应为 -r');
    assert.equal(drawCalls[0][4], 120, '宽应为 2r');
    assert.equal(drawCalls[0][5], 120, '高应为 2r');

    const fillRectCalls = ctx.calls.filter(([name]) => name === 'fillRect');
    assert.equal(fillRectCalls.length, 1, '有图贴图时机尾 fillRect 跳过，仅剩旋翼 fillRect');
    assert.ok(Math.abs(fillRectCalls[0][1] - (-60 * 1.42)) < 1e-6);

    const rotateCalls = ctx.calls.filter(([name]) => name === 'rotate');
    assert.equal(rotateCalls.length, 1);
    assert.ok(Math.abs(rotateCalls[0][1] - 10) < 1e-6);

    const arcCalls = ctx.calls.filter(([name]) => name === 'arc');
    assert.equal(arcCalls.length, 1, '有图贴图时 fallback 圆弧跳过，仅剩登机光环 arc');
    assert.equal(arcCalls[0][1], 0);
    assert.equal(arcCalls[0][2], 0);
    assert.equal(arcCalls[0][3], 72);
    assert.ok(Math.abs(arcCalls[0][4] - (-Math.PI / 2)) < 1e-6);
    assert.ok(Math.abs(arcCalls[0][5] - (-Math.PI / 2 + 0.5 * Math.PI * 2)) < 1e-6);
  } finally {
    clearCaches();
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});
