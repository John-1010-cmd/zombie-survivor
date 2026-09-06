import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer, damagePlayer } from '../src/entities/player.js';
import { circleRectHit } from '../src/core/physics.js';
import { drawPlayer } from '../src/entities/render.js';

const IDLE = { up: false, down: false, left: false, right: false };

function mockCtx() {
  const calls = [];
  return {
    calls,
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); },
    arc(...args) { calls.push(['arc', ...args]); },
    fill() { calls.push('fill'); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    stroke() { calls.push('stroke'); },
  };
}

test('向右移动 1 秒前进 speed 距离', () => {
  const p = createPlayer(1500, 1500);
  updatePlayer(p, { ...IDLE, right: true }, [], 3000, 1);
  assert.ok(Math.abs(p.x - (1500 + p.speed)) < 1e-6);
});

test('斜向移动速度不叠加（归一化）', () => {
  const p = createPlayer(1500, 1500);
  updatePlayer(p, { ...IDLE, right: true, up: true }, [], 3000, 1);
  const moved = Math.hypot(p.x - 1500, p.y - 1500);
  assert.ok(Math.abs(moved - p.speed) < 1e-6);
});

test('被矩形障碍挡住且不陷入', () => {
  const rect = { kind: 'rect', x: 1600, y: 1400, w: 100, h: 200 };
  const p = createPlayer(1500, 1500);
  for (let i = 0; i < 60; i++) updatePlayer(p, { ...IDLE, right: true }, [rect], 3000, 1 / 60);
  assert.equal(circleRectHit(p.x, p.y, p.r, rect), false);
});

test('地图边界夹紧', () => {
  const p = createPlayer(10, 10);
  updatePlayer(p, { ...IDLE, left: true, up: true }, [], 3000, 1);
  assert.ok(p.x >= p.r && p.y >= p.r);
});

test('受伤 0.5s 无敌帧', () => {
  const p = createPlayer(1500, 1500);
  assert.equal(damagePlayer(p, 20), true);
  assert.equal(p.hp, 80);
  assert.equal(damagePlayer(p, 20), false);
  assert.equal(p.hp, 80);
  updatePlayer(p, IDLE, [], 3000, 0.6);
  assert.equal(damagePlayer(p, 20), true);
  assert.equal(p.hp, 60);
});

test('移动两帧切换，停止时回到第 0 帧', () => {
  const p = createPlayer(1500, 1500);
  assert.equal(p.moving, false);
  assert.equal(p.walkFrame, 0);
  updatePlayer(p, { ...IDLE, right: true }, [], 3000, 0.13);
  assert.equal(p.moving, true);
  assert.equal(p.walkFrame, 1);
  updatePlayer(p, { ...IDLE, right: true }, [], 3000, 0.13);
  assert.equal(p.walkFrame, 0);
  updatePlayer(p, IDLE, [], 3000, 0.01);
  assert.equal(p.moving, false);
  assert.equal(p.walkFrame, 0);
  assert.equal(p.walkClock, 0);
});

test('drawPlayer 按 selected、方向和停止帧调用 drawVisual', () => {
  const p = createPlayer(100, 100);
  p.facing = 0;
  const ctx = mockCtx();
  let call = null;
  drawPlayer(ctx, p, 0, {
    skins: { owned: ['wastelandAdventurer', 'neonMercenary'], selected: 'neonMercenary' },
  }, {
    drawVisualFn: (...args) => {
      call = args;
      return true;
    },
  });
  assert.equal(call[1], 'skin.neonMercenary.sprite');
  assert.equal(call[2], 100);
  assert.equal(call[3], 100);
  assert.equal(call[4], 32);
  assert.deepEqual(call[5].frame, { direction: 'right', index: 0 });
});

test('drawPlayer 图片回退和无效 ID 每个 ID 只警告一次，并画白色圆球与朝向线', () => {
  const originalWarn = console.warn;
  const messages = [];
  console.warn = message => messages.push(String(message));
  try {
    const invalid = createPlayer(20, 30);
    const invalidCtx = mockCtx();
    drawPlayer(invalidCtx, invalid, 0, { skins: { owned: [], selected: 'missingSkin' } });
    drawPlayer(invalidCtx, invalid, 0, { skins: { owned: [], selected: 'missingSkin' } });
    assert.equal(messages.length, 1);
    assert.match(messages[0], /missingSkin/);
    assert.ok(invalidCtx.calls.some(call => Array.isArray(call) && call[0] === 'arc'));
    assert.ok(invalidCtx.calls.some(call => Array.isArray(call) && call[0] === 'lineTo'));

    const failed = createPlayer(40, 50);
    const failedCtx = mockCtx();
    drawPlayer(failedCtx, failed, 0, {
      skins: { owned: ['nightHunter'], selected: 'nightHunter' },
    }, {
      drawVisualFn: (targetCtx, id, x, y, size, options) => {
        options.onFallback();
        return false;
      },
    });
    assert.equal(messages.length, 2);
    assert.match(messages[1], /nightHunter/);
    assert.ok(failedCtx.calls.some(call => Array.isArray(call) && call[0] === 'arc'));
    assert.ok(failedCtx.calls.some(call => Array.isArray(call) && call[0] === 'lineTo'));
  } finally {
    console.warn = originalWarn;
  }
});
