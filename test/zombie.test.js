// test/zombie.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombie, updateZombie, damageZombie } from '../src/entities/zombie.js';

const T1 = { hpMult: 1, speedMult: 1 };
const T4 = { hpMult: 3.2, speedMult: 1.05 };

test('难度倍率作用于 hp 与 speed', () => {
  const z = createZombie('normal', 0, 0, T4);
  assert.equal(z.hp, 30 * 3.2);
  assert.equal(z.speed, 70 * 1.05);
  assert.equal(z.alive, true);
});

test('持续追踪使与玩家距离缩短', () => {
  const z = createZombie('normal', 0, 0, T1);
  const p = { x: 500, y: 0 };
  const d0 = Math.hypot(p.x - z.x, p.y - z.y);
  for (let i = 0; i < 60; i++) updateZombie(z, p, [], 1 / 60);
  assert.ok(Math.hypot(p.x - z.x, p.y - z.y) < d0);
});

test('击退受抗性影响：坦克位移远小于普通', () => {
  const n = createZombie('normal', 0, 0, T1);
  const t = createZombie('tank', 0, 0, T1);
  damageZombie(n, 1, 100, 0);
  damageZombie(t, 1, 100, 0);
  assert.ok(Math.abs(t.kbx) < Math.abs(n.kbx) * 0.25); // 80% 抗性
});

test('伤害致死返回 true 且 alive=false；受击闪白计时', () => {
  const z = createZombie('fast', 0, 0, T1);
  assert.equal(damageZombie(z, 5, 0, 0), false);
  assert.ok(z.hitFlash > 0);
  assert.equal(damageZombie(z, 999, 0, 0), true);
  assert.equal(z.alive, false);
});

test('击退速度随时间衰减', () => {
  const z = createZombie('normal', 0, 0, T1);
  damageZombie(z, 1, 100, 0);
  const k0 = z.kbx;
  updateZombie(z, { x: 9999, y: 0 }, [], 0.5);
  assert.ok(Math.abs(z.kbx) < Math.abs(k0));
});
