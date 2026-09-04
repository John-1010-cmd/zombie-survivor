// test/teslaball.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombie } from '../src/entities/zombie.js';
import {
  createTeslaBall, updateTeslaBall, renderTeslaBall,
  MINE_VISUAL_ID, TESLA_BALL_VISUAL_ID,
} from '../src/entities/teslaball.js';
import { clearCaches, drawVisual, registerImage, preloadVisuals } from '../src/core/visuals.js';

const T1 = { hpMult: 1, speedMult: 1 };

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

test('createTeslaBall 字段齐全：r12 / tick 0.25 / life 2.5 / alive / visualId', () => {
  const b = createTeslaBall(10, 20, 30, 40, 50);
  assert.deepEqual(b, {
    x: 10, y: 20, vx: 30, vy: 40, r: 12, damage: 50,
    tickT: 0.25, life: 2.5, alive: true, visualId: 'scene.teslaBall',
  });
});

test('沿 vx/vy 移动 speed*dt，返回存活', () => {
  const b = createTeslaBall(0, 0, 120, 0, 10);
  const alive = updateTeslaBall(b, [], 0.5, () => {}, () => {});
  assert.ok(Math.abs(b.x - 60) < 1e-9);
  assert.ok(Math.abs(b.y - 0) < 1e-9);
  assert.equal(alive, true);
});

test('tick 伤害半径 30+僵尸半径 内僵尸（含击退与回调），圈外不受影响', () => {
  const zIn = createZombie('normal', 1025, 1000, T1); // 距 (1000,1000) 25 ≤ 30+14
  const zOut = createZombie('normal', 1100, 1000, T1); // 距 100 > 30+14
  const b = createTeslaBall(1000, 1000, 0, 0, 10);
  const hits = [];
  let kills = 0;
  const alive = updateTeslaBall(b, [zIn, zOut], 0.25, z => hits.push(z), () => kills++);
  assert.equal(hits.length, 1);
  assert.equal(hits[0], zIn);
  assert.equal(zIn.hp, 20); // 30 - 10
  assert.ok(zIn.kbx > 0); // 击退背离球心（zIn 在 +x）
  assert.equal(zOut.hp, 30);
  assert.equal(kills, 0);
  assert.equal(b.tickT, 0.25); // tick 后重置间隔
  assert.equal(alive, true);
});

test('tick 致死触发 onKill，忽略已死僵尸', () => {
  const z = createZombie('normal', 1000, 1000, T1);
  const dead = createZombie('normal', 1005, 1000, T1);
  dead.alive = false;
  const b = createTeslaBall(1000, 1000, 0, 0, 999);
  let hit = false, kills = 0;
  updateTeslaBall(b, [z, dead], 0.25, () => { hit = true; }, () => kills++);
  assert.equal(hit, true);
  assert.equal(kills, 1);
  assert.equal(z.alive, false);
});

test('tick 间隔：未满 0.25s 不重复结算，累计满才再次 tick', () => {
  const z = createZombie('normal', 1000, 1000, T1);
  const b = createTeslaBall(1000, 1000, 0, 0, 10);
  let hits = 0;
  updateTeslaBall(b, [z], 0.1, () => hits++, () => {});
  assert.equal(hits, 0); // tickT 0.25→0.15
  updateTeslaBall(b, [z], 0.15, () => hits++, () => {});
  assert.equal(hits, 1); // 累计满 0.25 → tick 一次并重置
  updateTeslaBall(b, [z], 0.1, () => hits++, () => {});
  assert.equal(hits, 1); // 新一轮未满
  assert.equal(z.hp, 20);
});

test('life 耗尽 → alive=false 且返回 false', () => {
  const b = createTeslaBall(0, 0, 0, 0, 10);
  assert.equal(updateTeslaBall(b, [], 1.0, () => {}, () => {}), true);
  assert.equal(b.alive, true);
  assert.equal(updateTeslaBall(b, [], 1.5, () => {}, () => {}), false);
  assert.equal(b.alive, false);
});

test('mine 与 teslaBall PNG visual id 已注册，图片未就绪时保留 fallback 与动效层', () => {
  assert.equal(MINE_VISUAL_ID, 'scene.mine');
  assert.equal(TESLA_BALL_VISUAL_ID, 'scene.teslaBall');
  const ctx = makeMockContext();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    renderTeslaBall(ctx, createTeslaBall(0, 0, 0, 0, 10), 0);
    drawVisual(ctx, MINE_VISUAL_ID, 0, 0, 48, {
      params: { range: 80 },
      phase: 0,
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 0);
  assert.equal(ctx.drawImageCount, 0);
  assert.ok(ctx.arcCount >= 3);
  assert.ok(ctx.strokeCount >= 2);
  const fillRectCalls = ctx.calls.filter(([name]) => name === 'fillRect');
  assert.equal(fillRectCalls.length, 1);
  assert.ok(Math.abs(fillRectCalls[0][1] - (-24 * 0.62)) < 1e-6);
  assert.ok(Math.abs(fillRectCalls[0][2] - (-24 * 0.20)) < 1e-6);
  assert.ok(Math.abs(fillRectCalls[0][3] - (24 * 1.24)) < 1e-6);
  assert.ok(Math.abs(fillRectCalls[0][4] - (24 * 0.40)) < 1e-6);
});

test('mine 与 teslaBall 图像就绪时进入贴图路径：精确断言到达 drawImage 的实参，跳过 fallback 几何并保留动效层', async () => {
  const originalImage = globalThis.Image;
  try {
    globalThis.Image = FakeImage;
    clearCaches();

    registerImage(MINE_VISUAL_ID, 'assets/img/scene/mine.png');
    registerImage(TESLA_BALL_VISUAL_ID, 'assets/img/scene/tesla-ball.png');
    await preloadVisuals();

    // 1. teslaBall 有图路径
    const ctxTesla = makeMockContext();
    const ball = createTeslaBall(10, 20, 0, 0, 15);
    renderTeslaBall(ctxTesla, ball, 0);

    const drawCallsTesla = ctxTesla.calls.filter(([name]) => name === 'drawImage');
    assert.equal(drawCallsTesla.length, 1, 'teslaBall 就绪后必须调用 1 次 drawImage');
    assert.equal(drawCallsTesla[0][1].url, 'assets/img/scene/tesla-ball.png');
    assert.equal(drawCallsTesla[0][2], -12, '居中 x 坐标应为 -r');
    assert.equal(drawCallsTesla[0][3], -12, '居中 y 坐标应为 -r');
    assert.equal(drawCallsTesla[0][4], 24, '宽度应为 2r');
    assert.equal(drawCallsTesla[0][5], 24, '高度应为 2r');
    assert.ok(ctxTesla.strokeCount >= 2, '环绕电弧与闪电描边必须保留');

    // 2. mine 有图路径
    const ctxMine = makeMockContext();
    drawVisual(ctxMine, MINE_VISUAL_ID, 50, 60, 48, {
      params: { range: 80 },
      phase: 0,
    });
    const drawCallsMine = ctxMine.calls.filter(([name]) => name === 'drawImage');
    const fillRectMine = ctxMine.calls.filter(([name]) => name === 'fillRect');
    assert.equal(drawCallsMine.length, 1, 'mine 就绪后必须调用 1 次 drawImage');
    assert.equal(drawCallsMine[0][1].url, 'assets/img/scene/mine.png');
    assert.equal(drawCallsMine[0][2], -24, '居中 x 坐标应为 -r');
    assert.equal(drawCallsMine[0][3], -24, '居中 y 坐标应为 -r');
    assert.equal(drawCallsMine[0][4], 48, '宽应为 2r');
    assert.equal(drawCallsMine[0][5], 48, '高应为 2r');
    assert.equal(fillRectMine.length, 0, '有图贴图时不得再执行 fallback 底座 fillRect');
    const arcCallsMine = ctxMine.calls.filter(([name]) => name === 'arc');
    assert.ok(arcCallsMine.length >= 2, '警示光与范围环 arc 必须保留');
    const rangeArc = arcCallsMine.find(call => Math.abs(call[3] - 80) < 1e-6);
    assert.ok(rangeArc, '范围环半径必须为 80');
  } finally {
    clearCaches();
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});
