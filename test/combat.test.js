import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialHash } from '../src/core/physics.js';
import { createZombie } from '../src/entities/zombie.js';
import { resolveProjectileHits, explode } from '../src/systems/combat.js';

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

// ---------- explode（炸弹道具）----------

test('explode 命中爆炸半径内多只僵尸并扣血，圈外不受影响', () => {
  const a = createZombie('normal', 1000, 1000, T1); // 距爆心 0
  const b = createZombie('normal', 1040, 1000, T1); // 距 40 ≤ 50 + 14
  const c = createZombie('normal', 1200, 1000, T1); // 距 200，圈外
  let hits = 0, kills = 0;
  explode(1000, 1000, 50, 10, [a, b, c], () => hits++, () => kills++);
  assert.equal(hits, 2);
  assert.equal(kills, 0);
  assert.equal(a.hp, 20);
  assert.equal(b.hp, 20);
  assert.equal(c.hp, 30);
});

test('explode 边缘不命中：圆心距恰 > radius + z.r', () => {
  const z = createZombie('normal', 1000 + 50 + 14 + 0.01, 1000, T1);
  let hits = 0, kills = 0;
  explode(1000, 1000, 50, 999, [z], () => hits++, () => kills++);
  assert.equal(hits, 0);
  assert.equal(kills, 0);
  assert.equal(z.hp, 30);
  assert.equal(z.alive, true);
});

test('explode 致死：onHit/onKill 触发且击退沿背离爆心方向', () => {
  const z = createZombie('normal', 1010, 1000, T1); // 爆心 (1000,1000)，方向 +x
  let kills = 0, hitArgs = null;
  explode(1000, 1000, 50, 999, [z], z2 => { hitArgs = z2; }, () => kills++);
  assert.equal(kills, 1);
  assert.equal(hitArgs, z);
  assert.equal(z.alive, false);
  assert.ok(z.kbx > 0); // atan2(0, 10) = 0 → 击退 +x
});

test('explode 忽略已死亡僵尸', () => {
  const z = createZombie('normal', 1000, 1000, T1);
  z.alive = false;
  let hits = 0, kills = 0;
  explode(1000, 1000, 50, 999, [z], () => hits++, () => kills++);
  assert.equal(hits, 0);
  assert.equal(kills, 0);
});

// ---------- 迭代03：arc 越障 / aoe 爆炸 / tesla 链电 ----------

test('arc 弹无视障碍：矩形障碍不阻挡，仍命中目标', () => {
  const z = createZombie('normal', 1005, 1000, T1);
  const hash = createSpatialHash();
  hash.insert(z);
  const p = makeProjectile({ arc: true });
  let hits = 0;
  resolveProjectileHits([p], hash,
    [{ kind: 'rect', x: 990, y: 990, w: 20, h: 20 }],
    () => {}, () => hits++);
  assert.equal(hits, 1);
  assert.equal(z.hp, 20);
  assert.equal(p.alive, false); // 命中即消亡（非穿透）
});

test('aoe 爆炸：主目标单次结算，爆炸半径内同伤，圈外与死尸不受影响', () => {
  const main = createZombie('normal', 1005, 1000, T1); // 直接命中
  const near = createZombie('normal', 1070, 1000, T1); // 距爆心 70 ≤ 90+14
  const far = createZombie('normal', 1200, 1000, T1);  // 距爆心 200，圈外
  const dead = createZombie('normal', 1060, 1000, T1);
  dead.alive = false;
  const hash = createSpatialHash();
  hash.insert(main); hash.insert(near); hash.insert(far); hash.insert(dead);
  const p = makeProjectile({ damage: 10, aoe: 90 });
  let kills = 0;
  const hitArgs = [];
  resolveProjectileHits([p], hash, [],
    () => kills++,
    (z2, p2) => hitArgs.push([z2, p2]),
    [main, near, far, dead]);
  assert.equal(main.hp, 20); // 主目标只结算一次（爆炸跳过防双算）
  assert.equal(near.hp, 20); // 邻近同伤 p.damage
  assert.equal(far.hp, 30);
  assert.equal(dead.hp, 30); // 死尸不被爆炸重复结算
  assert.equal(hitArgs.length, 2);
  assert.deepEqual(hitArgs[0], [main, p]); // 回调形状与单发一致 (z, p)
  assert.deepEqual(hitArgs[1], [near, p]);
  assert.equal(kills, 0);
  assert.equal(p.alive, false); // aoe 弹不穿透，命中即消亡
});

test('aoe 致死：主目标与爆炸目标均触发 onKill', () => {
  const main = createZombie('normal', 1005, 1000, T1);
  const near = createZombie('normal', 1070, 1000, T1);
  const hash = createSpatialHash();
  hash.insert(main); hash.insert(near);
  const p = makeProjectile({ damage: 999, aoe: 90 });
  let kills = 0;
  resolveProjectileHits([p], hash, [], () => kills++, () => {}, [main, near]);
  assert.equal(kills, 2);
  assert.equal(main.alive, false);
  assert.equal(near.alive, false);
  assert.equal(p.alive, false);
});

test('explode 的 skip 参数跳过指定僵尸（防双算）', () => {
  const a = createZombie('normal', 1000, 1000, T1);
  const b = createZombie('normal', 1040, 1000, T1);
  const hits = [];
  explode(1000, 1000, 50, 10, [a, b], z => hits.push(z), () => {}, a);
  assert.deepEqual(hits, [b]); // a 被跳过，仅 b 受击
  assert.equal(a.hp, 30);
  assert.equal(b.hp, 20);
});

test('tesla 链：命中后向最近 3 只各跳一次，伤害 ×0.8^i 递减', () => {
  const z0 = createZombie('normal', 1005, 1000, T1); // 直接命中
  const z1 = createZombie('normal', 1015, 1000, T1); // 距 z0 10
  const z2 = createZombie('normal', 1025, 1000, T1); // 距 z1 10
  const z3 = createZombie('normal', 1035, 1000, T1); // 距 z2 10
  const hash = createSpatialHash();
  for (const z of [z0, z1, z2, z3]) hash.insert(z);
  const p = makeProjectile({ damage: 10, chain: 3 });
  const hitArgs = [];
  resolveProjectileHits([p], hash, [], () => {},
    (z2, p2) => hitArgs.push([z2, p2]), [z0, z1, z2, z3]);
  assert.equal(z0.hp, 20); // 主目标不衰减
  assert.ok(Math.abs(z1.hp - (30 - 10 * Math.pow(0.8, 1))) < 1e-9);
  assert.ok(Math.abs(z2.hp - (30 - 10 * Math.pow(0.8, 2))) < 1e-9);
  assert.ok(Math.abs(z3.hp - (30 - 10 * Math.pow(0.8, 3))) < 1e-9);
  assert.equal(hitArgs.length, 4); // 主目标 + 3 跳
  assert.equal(p.alive, false); // 链电弹不穿透，命中即消亡
});

test('tesla 链：链目标 300px 外不跳', () => {
  const z0 = createZombie('normal', 1005, 1000, T1);
  const far = createZombie('normal', 1005 + 301, 1000, T1); // 距 z0 301 > 300
  const hash = createSpatialHash();
  hash.insert(z0); hash.insert(far);
  const p = makeProjectile({ damage: 10, chain: 3 });
  let hits = 0;
  resolveProjectileHits([p], hash, [], () => {}, () => hits++, [z0, far]);
  assert.equal(hits, 1);
  assert.equal(z0.hp, 20);
  assert.equal(far.hp, 30);
  assert.equal(p.alive, false);
});

test('tesla 链：allZombies 提供网格外的链目标（300px 内）', () => {
  const z0 = createZombie('normal', 1005, 1000, T1); // 直接命中
  const z1 = createZombie('normal', 1290, 1000, T1); // 距 z0 285 < 300，但距弹道 290 远超网格查询半径
  const hash = createSpatialHash();
  hash.insert(z0); // z1 不入网格
  const p = makeProjectile({ damage: 10, chain: 1 });
  const hitArgs = [];
  resolveProjectileHits([p], hash, [], () => {},
    (z2, p2) => hitArgs.push([z2, p2]), [z0, z1]);
  assert.equal(z0.hp, 20);
  assert.ok(Math.abs(z1.hp - (30 - 10 * Math.pow(0.8, 1))) < 1e-9);
  assert.equal(hitArgs.length, 2);
  assert.equal(p.alive, false);
});

test('aoe+chain 弹：爆炸与链电并存结算，命中即消亡（不穿透）', () => {
  const main = createZombie('normal', 1005, 1000, T1); // 直接命中
  const near = createZombie('normal', 1070, 1000, T1); // 爆炸半径内且为主目标最近链跳
  const hash = createSpatialHash();
  hash.insert(main); hash.insert(near);
  const p = makeProjectile({ damage: 10, aoe: 90, chain: 3, pierce: 5 });
  let hits = 0;
  resolveProjectileHits([p], hash, [], () => {}, () => hits++, [main, near]);
  assert.equal(main.hp, 20); // 主目标只结算一次（爆炸跳过）
  assert.equal(near.hp, 12); // 爆炸 10 + 链跳 8
  assert.equal(hits, 3);     // main / near(爆炸) / near(链)
  assert.equal(p.alive, false); // 命中即消亡
  assert.equal(p.pierce, 5);    // aoe/chain 弹不消耗穿透
});
