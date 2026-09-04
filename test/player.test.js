import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer, damagePlayer } from '../src/entities/player.js';
import { circleRectHit } from '../src/core/physics.js';
import { FIRE_TOLERANCE, TURN_RATE, normAngle, turnToward } from '../src/core/angles.js';

const IDLE = { up: false, down: false, left: false, right: false };
const EPSILON = 1e-12;

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

test('角度工具导出已确认常量并把角度归一到最短差值', () => {
  assert.equal(TURN_RATE, 240 * Math.PI / 180);
  assert.equal(FIRE_TOLERANCE, Math.PI / 12);
  assert.ok(Math.abs(normAngle(3 * Math.PI / 2) + Math.PI / 2) < EPSILON);
  assert.ok(Math.abs(normAngle(-3 * Math.PI / 2) - Math.PI / 2) < EPSILON);
});

test('turnToward 每次最多转 TURN_RATE×dt，未超限时准确到达目标', () => {
  const maxDelta = TURN_RATE * 0.1;
  assert.ok(Math.abs(turnToward(0, Math.PI / 2, maxDelta) - maxDelta) < EPSILON);
  assert.ok(Math.abs(turnToward(0, Math.PI / 2, Math.PI) - Math.PI / 2) < EPSILON);
});

test('turnToward 跨越 ±pi 时选择短弧并保持连续角度', () => {
  const current = Math.PI - 0.05;
  const target = -Math.PI + 0.05;
  assert.ok(Math.abs(turnToward(current, target, 0.2) - (Math.PI + 0.05)) < EPSILON);
});

test('玩家 facing 按 240°/s 上限插值而不是瞬时跳转', () => {
  const p = createPlayer(1500, 1500);
  updatePlayer(p, { ...IDLE, up: true }, [], 3000, 0.1);
  assert.ok(Math.abs(p.facing + TURN_RATE * 0.1) < EPSILON);
  assert.ok(Math.abs(p.facing + Math.PI / 2) > EPSILON);
});

test('玩家 facing 跨越 ±pi 沿短弧转动', () => {
  const p = createPlayer(1500, 1500);
  p.facing = Math.PI - 0.05;
  updatePlayer(p, { ...IDLE, left: true, up: true }, [], 3000, 0.1);
  const expected = Math.PI - 0.05 + TURN_RATE * 0.1;
  assert.ok(Math.abs(p.facing - expected) < EPSILON);
  assert.ok(p.facing > Math.PI - 0.05);
});
