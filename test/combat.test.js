import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialHash } from '../src/core/physics.js';
import { createZombie } from '../src/entities/zombie.js';
import { resolveProjectileHits } from '../src/systems/combat.js';

const T1 = { hpMult: 1, speedMult: 1 };

function makeProjectile(over = {}) {
  return { x: 1000, y: 1000, damage: 10, knockback: 0, angle: 0, pierce: 0, alive: true, ...over };
}

test('命中扣血但不致死：onHit(z,p) 触发、onKill 不触发，弹道消亡', () => {
  const z = createZombie('normal', 1005, 1000, T1); // 距弹道 5px < 4+14
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile({ damage: 10, knockback: 100, angle: Math.PI });
  let kills = 0, hitArgs = null;
  resolveProjectileHits([p], hash, [],
    () => kills++,
    (hz, hp) => { hitArgs = [hz, hp]; });
  assert.deepEqual(hitArgs, [z, p]);
  assert.equal(kills, 0);
  assert.equal(z.hp, 20);
  assert.ok(z.kbx < 0); // 击退沿 angle=π 方向生效
  assert.equal(p.alive, false);
});

test('致死命中：onKill(z) 触发且弹道 alive=false', () => {
  const z = createZombie('normal', 1005, 1000, T1); // hp 30
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile({ damage: 999 });
  let kills = 0, killArgs = null, hitArgs = null;
  resolveProjectileHits([p], hash, [],
    (z2) => { kills++; killArgs = z2; },
    (z2, p2) => { hitArgs = [z2, p2]; });
  assert.equal(kills, 1);
  assert.equal(killArgs, z);
  assert.deepEqual(hitArgs, [z, p]);
  assert.equal(z.alive, false);
  assert.equal(p.alive, false);
});

test('pierce=1 可先后命中两只僵尸后消亡', () => {
  const a = createZombie('normal', 1005, 1000, T1);
  const b = createZombie('normal', 1012, 1000, T1); // 均距弹道 < 18，同一网格
  const hash = createSpatialHash();
  hash.insert(a); hash.insert(b);
  const p = makeProjectile({ damage: 10, pierce: 1 });
  let hits = 0;
  resolveProjectileHits([p], hash, [], () => {}, () => hits++);
  assert.equal(hits, 2);
  assert.equal(a.hp, 20);
  assert.equal(b.hp, 20);
  assert.equal(p.pierce, 0);
  assert.equal(p.alive, false);
});

test('撞圆形障碍：alive=false 且不触发任何回调', () => {
  const z = createZombie('normal', 1005, 1000, T1); // 无障碍时本会被命中
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile();
  let hits = 0, kills = 0;
  resolveProjectileHits([p], hash,
    [{ kind: 'circle', x: 1002, y: 1000, r: 20 }],
    () => kills++, () => hits++);
  assert.equal(p.alive, false);
  assert.equal(hits, 0);
  assert.equal(kills, 0);
  assert.equal(z.hp, 30);
});

test('撞矩形障碍：alive=false 且不触发任何回调', () => {
  const z = createZombie('normal', 1005, 1000, T1);
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile();
  let hits = 0, kills = 0;
  resolveProjectileHits([p], hash,
    [{ kind: 'rect', x: 990, y: 990, w: 20, h: 20 }],
    () => kills++, () => hits++);
  assert.equal(p.alive, false);
  assert.equal(hits, 0);
  assert.equal(kills, 0);
  assert.equal(z.hp, 30);
});

test('网格查不到的远处僵尸不受影响', () => {
  const z = createZombie('normal', 1200, 1000, T1); // 距弹道 200 >> 4+MAX_ZOMBIE_R
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile();
  let hits = 0, kills = 0;
  resolveProjectileHits([p], hash, [], () => kills++, () => hits++);
  assert.equal(hits, 0);
  assert.equal(kills, 0);
  assert.equal(z.hp, 30);
  assert.equal(z.alive, true);
  assert.equal(p.alive, true); // 无命中则弹道继续存活
});

test('网格中的已死亡僵尸不会再次触发回调', () => {
  const z = createZombie('normal', 1005, 1000, T1);
  z.alive = false; // 模拟已击杀但仍在网格中
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile();
  let hits = 0, kills = 0;
  resolveProjectileHits([p], hash, [], () => kills++, () => hits++);
  assert.equal(hits, 0);
  assert.equal(kills, 0);
  assert.equal(p.alive, true);
});

test('查询范围内但碰撞半径外的僵尸不命中', () => {
  const z = createZombie('normal', 1020, 1000, T1); // 距离 20：< 4+24 在查询内，但 > 4+14 不命中
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile();
  let hits = 0;
  resolveProjectileHits([p], hash, [], () => {}, () => hits++);
  assert.equal(hits, 0);
  assert.equal(z.hp, 30);
  assert.equal(p.alive, true);
});
