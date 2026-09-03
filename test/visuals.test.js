// test/visuals.test.js —— 统一视觉注册表：形状、部件、未知 ID 回退（设计 §1.2/§1.4）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  drawVisual, registerPart, registerShape, SHAPES, PARTS,
} from '../src/core/visuals.js';
import { SHAPES as facadeShapes } from '../src/entities/render.js';

function makeContext() {
  const calls = [];
  return {
    calls,
    beginPath() { calls.push(['beginPath']); },
    arc(...args) { calls.push(['arc', ...args]); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    closePath() { calls.push(['closePath']); },
    fill() { calls.push(['fill']); },
    stroke() { calls.push(['stroke']); },
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(...args) { calls.push(['translate', ...args]); },
  };
}

test('render.js 兼容出口与 visuals.js 共享同一个 SHAPES 注册表', () => {
  assert.equal(facadeShapes, SHAPES);
  for (const id of ['circle', 'triangle', 'hexagon', 'pentagon', 'diamond'])
    assert.equal(typeof SHAPES[id], 'function', `${id} 未注册`);
  assert.equal(PARTS && typeof PARTS, 'object');
});

test('registerShape 只注册路径；drawVisual 传递坐标/半径并按 options 填充描边', () => {
  const id = 'test.shape.path';
  let received;
  registerShape(id, (ctx, x, y, r) => {
    received = { x, y, r };
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  });
  const ctx = makeContext();

  assert.equal(drawVisual(ctx, id, 12, 18, 7, {
    fillStyle: '#123456', strokeStyle: '#abcdef', lineWidth: 3,
  }), true);
  assert.deepEqual(received, { x: 12, y: 18, r: 7 });
  assert.equal(ctx.fillStyle, '#123456');
  assert.equal(ctx.strokeStyle, '#abcdef');
  assert.equal(ctx.lineWidth, 3);
  assert.equal(ctx.calls.filter(([name]) => name === 'fill').length, 1);
  assert.equal(ctx.calls.filter(([name]) => name === 'stroke').length, 1);
});

test('registerPart 的 drawFn 收到 ctx/size/params/phase，并在目标坐标绘制', () => {
  const id = 'test.part.eyes';
  const params = { style: 'angry', count: 2 };
  let received;
  registerPart(id, (ctx, size, gotParams, phase) => {
    received = { ctx, size, gotParams, phase };
    ctx.beginPath();
  });
  const ctx = makeContext();

  assert.equal(drawVisual(ctx, id, 4, 5, 9, { params, phase: 0.25 }), true);
  assert.equal(received.ctx, ctx);
  assert.equal(received.size, 9);
  assert.equal(received.gotParams, params);
  assert.equal(received.phase, 0.25);
  assert.deepEqual(ctx.calls.slice(0, 2), [['save'], ['translate', 4, 5]]);
  assert.deepEqual(ctx.calls.at(-1), ['restore']);
});

test('未知视觉 ID 回退到 circle，且同一 ID 只 console.warn 一次', () => {
  const id = 'test.visual.unknown';
  const ctx = makeContext();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  let first;
  let second;
  try {
    first = drawVisual(ctx, id, 3, 4, 5, { fillStyle: '#fff' });
    second = drawVisual(ctx, id, 3, 4, 5, { fillStyle: '#fff' });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(first, false);
  assert.equal(second, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /test\.visual\.unknown/);
  const arcs = ctx.calls.filter(([name]) => name === 'arc');
  assert.equal(arcs.length, 2);
  assert.deepEqual(arcs[0], ['arc', 3, 4, 5, 0, Math.PI * 2]);
  assert.equal(ctx.calls.filter(([name]) => name === 'fill').length, 2);
});
