import test from 'node:test';
import assert from 'node:assert/strict';
import { drawVisual } from '../src/core/visuals.js';
import { PALETTE } from '../src/config/palette.js';
import { createWallSegment, WALL_VISUAL_ID, wallDamageTier } from '../src/entities/wall.js';
import * as wall from '../src/entities/wall.js';

const EPSILON = 1e-9;

function mockContext() {
  const calls = [];
  const state = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
  };
  const ctx = { calls };
  for (const name of [
    'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'fill', 'stroke', 'fillRect', 'rect',
  ]) {
    ctx[name] = (...args) => calls.push({ name, args });
  }
  for (const key of Object.keys(state)) {
    Object.defineProperty(ctx, key, {
      get() { return state[key]; },
      set(val) {
        state[key] = val;
        calls.push({ name: `set:${key}`, args: [val] });
      },
    });
  }
  return ctx;
}

test('createWallSegment 生成单段 {x,y,r:22,hp:150,maxHp:150,alive:true}', () => {
  const seg = createWallSegment(0, 0, { hp: 0 });
  assert.equal(seg.x, 0);
  assert.equal(seg.y, 0);
  assert.equal(seg.r, 22);
  assert.equal(seg.hp, 150);
  assert.equal(seg.maxHp, 150);
  assert.equal(seg.alive, true);
});

test('以 (x,y) 为段心', () => {
  const seg = createWallSegment(100, 50, { hp: 0 });
  assert.equal(seg.x, 100);
  assert.equal(seg.y, 50);
});

test('耐久 = 150×1.5^wallEnhance.hp', () => {
  assert.equal(createWallSegment(0, 0, { hp: 1 }).hp, 225);
  assert.equal(createWallSegment(0, 0, { hp: 2 }).hp, 337.5);
  assert.equal(createWallSegment(0, 0, { hp: 3 }).hp, 506.25);
  assert.equal(createWallSegment(0, 0, { hp: 8 }).hp, 150 * 1.5 ** 8);
  assert.equal(createWallSegment(0, 0).hp, 150);
  const seg = createWallSegment(0, 0, { hp: 3 });
  assert.equal(seg.maxHp, seg.hp);
});

test('无 createWallRing 残留（导出不再包含 ring）', () => {
  assert.equal(wall.createWallRing, undefined);
  assert.equal(typeof wall.createWallSegment, 'function');
});

test('墙体耐久三档阈值：>0.66 完好，>0.33 且≤0.66 破损，≤0.33 濒危', () => {
  assert.equal(wallDamageTier(67, 100), 'intact');
  assert.equal(wallDamageTier(66, 100), 'damaged');
  assert.equal(wallDamageTier(34, 100), 'damaged');
  assert.equal(wallDamageTier(33, 100), 'critical');
  assert.equal(wallDamageTier(0, 100), 'critical');
});

test('围墙 visual 已注册为不规则多边形、垛口和裂缝组合', () => {
  const ctx = mockContext();
  assert.equal(WALL_VISUAL_ID, 'deployable.wall');

  // 支持简报签名（容错不抛错）
  assert.doesNotThrow(() => drawVisual(ctx, WALL_VISUAL_ID, 0, 0, 22, {
    hp: 33, maxHp: 150, phase: 0,
  }));

  // 使用契约标准的 params 传参调用
  const ctx2 = mockContext();
  assert.doesNotThrow(() => drawVisual(ctx2, WALL_VISUAL_ID, 15, 25, 22, {
    params: { hp: 33, maxHp: 150 },
    phase: 0,
  }));

  const translateCall = ctx2.calls.find(call => call.name === 'translate');
  assert.ok(translateCall, '应当包含 translate 调用');
  assert.deepEqual(translateCall.args, [15, 25], 'translate 坐标应与传入 (x,y) 一致');

  assert.ok(ctx2.calls.some(call => call.name === 'lineTo'));
  assert.ok(ctx2.calls.some(call => call.name === 'stroke'));
  assert.ok(ctx2.calls.some(call => call.name === 'fill'));
  assert.ok(ctx2.calls.some(call => call.name === 'set:fillStyle' && call.args[0] === PALETTE.obstacle));
  assert.ok(ctx2.calls.some(call => call.name === 'set:fillStyle' && call.args[0] === PALETTE.panel));
  assert.ok(ctx2.calls.some(call => call.name === 'set:strokeStyle' && call.args[0] === PALETTE.neon));
});

test('围墙 visual 三档受损状态体现不同裂缝数量与透明度/线宽数值', () => {
  // 完好 (intact, hp: 100/100): 0 条裂缝，stroke 共 3 次 (body + crenellations + glow)
  const ctxIntact = mockContext();
  drawVisual(ctxIntact, WALL_VISUAL_ID, 0, 0, 22, {
    params: { hp: 100, maxHp: 100 },
    phase: 0,
  });
  const strokeCountIntact = ctxIntact.calls.filter(c => c.name === 'stroke').length;
  assert.equal(strokeCountIntact, 3, '完好状态应无裂缝描边 (共3次stroke)');
  const alphaCallsIntact = ctxIntact.calls.filter(c => c.name === 'set:globalAlpha').map(c => c.args[0]);
  assert.ok(alphaCallsIntact.includes(1), '完好状态主体透明度应为 1');
  assert.ok(alphaCallsIntact.includes(0.28), '完好状态发光透明度应为 0.28');

  // 破损 (damaged, hp: 50/100): 3 条裂缝，stroke 共 3 + 3 = 6 次
  const ctxDamaged = mockContext();
  drawVisual(ctxDamaged, WALL_VISUAL_ID, 0, 0, 22, {
    params: { hp: 50, maxHp: 100 },
    phase: 0,
  });
  const strokeCountDamaged = ctxDamaged.calls.filter(c => c.name === 'stroke').length;
  assert.equal(strokeCountDamaged, 6, '破损状态应有3条裂缝描边 (共6次stroke)');
  const alphaCallsDamaged = ctxDamaged.calls.filter(c => c.name === 'set:globalAlpha').map(c => c.args[0]);
  assert.ok(alphaCallsDamaged.includes(0.78), '破损状态主体透明度应为 0.78');
  assert.ok(alphaCallsDamaged.includes(0.38), '破损状态发光透明度应为 0.38');

  // 濒危 (critical, hp: 20/100): 6 条裂缝，stroke 共 3 + 6 = 9 次，发光线宽增大
  const ctxCritical = mockContext();
  drawVisual(ctxCritical, WALL_VISUAL_ID, 0, 0, 22, {
    params: { hp: 20, maxHp: 100 },
    phase: 0,
  });
  const strokeCountCritical = ctxCritical.calls.filter(c => c.name === 'stroke').length;
  assert.equal(strokeCountCritical, 9, '濒危状态应有6条裂缝描边 (共9次stroke)');
  const alphaCallsCritical = ctxCritical.calls.filter(c => c.name === 'set:globalAlpha').map(c => c.args[0]);
  assert.ok(alphaCallsCritical.includes(0.55), '濒危状态主体透明度应为 0.55');
  assert.ok(alphaCallsCritical.includes(0.5), '濒危状态发光透明度应为 0.5');

  // 校验发光线宽：濒危状态为 Math.max(2, 22 * 0.10) = 2.2，破损/完好为 Math.max(1, 22 * 0.07) = 1.54
  const lineWidthCallsCritical = ctxCritical.calls.filter(c => c.name === 'set:lineWidth').map(c => c.args[0]);
  const finalLineWidthCritical = lineWidthCallsCritical[lineWidthCallsCritical.length - 1];
  assert.ok(Math.abs(finalLineWidthCritical - 2.2) < EPSILON, '濒危状态霓虹描边线宽应为 2.2');

  const lineWidthCallsIntact = ctxIntact.calls.filter(c => c.name === 'set:lineWidth').map(c => c.args[0]);
  const finalLineWidthIntact = lineWidthCallsIntact[lineWidthCallsIntact.length - 1];
  assert.ok(Math.abs(finalLineWidthIntact - 1.54) < EPSILON, '完好状态霓虹描边线宽应为 1.54');
});
