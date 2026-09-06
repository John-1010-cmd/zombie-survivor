// test/teslaball.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombie } from '../src/entities/zombie.js';
import {
  createTeslaBall, updateTeslaBall, renderTeslaBall,
  MINE_VISUAL_ID, TESLA_BALL_VISUAL_ID,
} from '../src/entities/teslaball.js';
import { drawVisual } from '../src/core/visuals.js';

const T1 = { hpMult: 1, speedMult: 1 };

function fakeCtx() {
  return {
    arcCount: 0,
    strokeCount: 0,
    fillCount: 0,
    fillRectCount: 0,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() { this.arcCount++; },
    fill() { this.fillCount++; },
    stroke() { this.strokeCount++; },
    fillRect() { this.fillRectCount++; },
    strokeRect() { this.strokeCount++; },
  };
}

test('createTeslaBall 字段齐全：r12 / tick 0.25 / life 2.5 / alive / visualId', () => {
  const b = createTeslaBall(10, 20, 30, 40, 50);
  assert.deepEqual(b, {
    x: 10, y: 20, vx: 30, vy: 40, r: 12, damage: 50,
    tickT: 0.25, life: 2.5, alive: true, visualId: 'teslaBall',
  });
});

test('mine 与 teslaBall visual id 已注册，组合视觉绘制不发出未知 id 警告', () => {
  assert.equal(MINE_VISUAL_ID, 'mine');
  assert.equal(TESLA_BALL_VISUAL_ID, 'teslaBall');
  const ctx = fakeCtx();
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
  assert.ok(ctx.arcCount >= 3);
  assert.ok(ctx.strokeCount >= 2);
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
