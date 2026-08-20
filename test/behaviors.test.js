// test/behaviors.test.js —— 行为注册表：exploder 引信与自爆 AoE（设计 §4.2/§4.3）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEHAVIORS } from '../src/systems/behaviors.js';
import { EXPLODER_FUSE_TIME } from '../src/config/bestiary/monsters.js';
import { createZombie } from '../src/entities/zombie.js';

function mockCtx(z, opts = {}) {
  return {
    player: { x: opts.px ?? 0, y: 0, r: 16 },
    deployables: opts.deployables ?? [],
    damagePlayer: opts.damagePlayer ?? (() => {}),
    spawnRing: opts.spawnRing ?? (() => {}),
    rng: () => 0.5,
  };
}

test('远离目标不触发引信；接近玩家触发引信计时', () => {
  const z = createZombie('exploder', 1000, 0);
  BEHAVIORS.exploder.onUpdate(z, 0.016, mockCtx(z));
  assert.equal(z.fuse, undefined);
  const z2 = createZombie('exploder', 40, 0); // 距玩家 40 ≤ 50+r
  BEHAVIORS.exploder.onUpdate(z2, 0.016, mockCtx(z2));
  assert.equal(z2.fuse, 0);
  BEHAVIORS.exploder.onUpdate(z2, 0.5, mockCtx(z2));
  assert.equal(z2.fuse, 0.5);
  assert.equal(z2.alive, true);
});

test('引信燃尽：置 fuseDone 并死亡（自爆）', () => {
  const z = createZombie('exploder', 40, 0);
  const ctx = mockCtx(z);
  BEHAVIORS.exploder.onUpdate(z, 0.016, ctx);
  BEHAVIORS.exploder.onUpdate(z, EXPLODER_FUSE_TIME, ctx);
  assert.equal(z.fuseDone, true);
  assert.equal(z.alive, false);
});

test('部署物在 250px 内优先：玩家更近也按部署物距离判定（与僵尸目标 AI 一致）', () => {
  const wall = { x: 120, y: 0, r: 10, hp: 100, alive: true };
  const z = createZombie('exploder', 45, 0); // 距玩家 45（≤触发距离 63），距 wall 75（>63 但 ≤250 搜索范围）
  BEHAVIORS.exploder.onUpdate(z, 0.016, mockCtx(z, { px: 0, deployables: [wall] }));
  assert.equal(z.fuse, undefined); // 目标取部署物（75），超出触发距离 63，不点燃
});

test('引信中被击杀不爆（onDeath 无 fuseDone 直接返回）', () => {
  const z = createZombie('exploder', 40, 0);
  const ctx = mockCtx(z);
  BEHAVIORS.exploder.onUpdate(z, 0.016, ctx); // 开始引信
  let hit = 0;
  const ctx2 = mockCtx(z, { damagePlayer: () => hit++ });
  assert.equal(BEHAVIORS.exploder.onDeath(z, ctx2), false);
  assert.equal(hit, 0);
});

test('自爆 AoE：半径内玩家与部署物受伤，半径外不受', () => {
  const z = createZombie('exploder', 0, 0); // aoe { damage: 30, radius: 80 }
  z.fuseDone = true;
  const near = { x: 50, y: 0, r: 10, hp: 100, alive: true };
  const far = { x: 500, y: 0, r: 10, hp: 100, alive: true };
  let dmg = 0, ring = null;
  const ctx = {
    player: { x: 0, y: 40, r: 16 },
    deployables: [near, far],
    damagePlayer: d => { dmg = d; },
    spawnRing: (x, y, r) => { ring = { x, y, r }; },
    rng: () => 0.5,
  };
  assert.equal(BEHAVIORS.exploder.onDeath(z, ctx), true);
  assert.equal(dmg, 30);
  assert.equal(near.hp, 70);   // 100 - 30
  assert.equal(far.hp, 100);
  assert.deepEqual(ring, { x: 0, y: 0, r: 80 });
});

test('注册表引用有效：图鉴 behavior 字段都能在 BEHAVIORS 找到', async () => {
  const { MONSTERS } = await import('../src/config/bestiary/monsters.js');
  for (const m of Object.values(MONSTERS))
    if (m.behavior) assert.ok(BEHAVIORS[m.behavior], `${m.id}.behavior=${m.behavior} 未注册`);
});
