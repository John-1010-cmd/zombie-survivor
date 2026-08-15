// test/aux.test.js —— 辅助武器：结构、载体生成、环绕/跟随运动与开火。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAux, spawnAuxBodies, updateAuxBodies, auxStats, AUX_CONFIG } from '../src/entities/companions.js';

const rng = () => 0.5;

test('createAux 结构：counts/增强四维/bodies/t', () => {
  const aux = createAux();
  assert.deepEqual(aux.counts, { drone: 0, gunner: 0, sniper: 0 });
  for (const kind of ['drone', 'gunner', 'sniper']) {
    assert.deepEqual(aux.enhance[kind], { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  }
  assert.deepEqual(aux.bodies, []);
  assert.equal(aux.t, 0);
});

test('AUX_CONFIG 基值 per 契约', () => {
  assert.deepEqual(AUX_CONFIG.drone, { name: '随行无人机', orbit: 90, damage: 6, fireRate: 2, projectileSpeed: 500, range: 300, aoe: 0 });
  assert.deepEqual(AUX_CONFIG.gunner, { name: '随行移动火炮', follow: 60, damage: 15, fireRate: 1, projectileSpeed: 400, range: 400, aoe: 60 });
  assert.deepEqual(AUX_CONFIG.sniper, { name: '随行远程火炮', follow: 100, damage: 30, fireRate: 0.4, projectileSpeed: 700, range: 650, aoe: 0 });
});

test('spawnAuxBodies 按 counts 重建：数量/顺序/weapon 结构/共享增强', () => {
  const aux = createAux();
  aux.counts.drone = 2;
  aux.counts.gunner = 1;
  aux.counts.sniper = 2;
  spawnAuxBodies(aux);
  assert.equal(aux.bodies.length, 5);
  assert.deepEqual(aux.bodies.map(b => b.kind), ['drone', 'drone', 'gunner', 'sniper', 'sniper']);
  assert.deepEqual(aux.bodies.map(b => b.idx), [0, 1, 0, 0, 1]);
  for (const b of aux.bodies) {
    assert.equal(b.weapon.id, 'aux');
    assert.equal(b.weapon.base, AUX_CONFIG[b.kind]);
    assert.equal(b.weapon.enhance, aux.enhance[b.kind]); // 共享引用
    assert.equal(b.weapon.cooldown, 0);
  }
  // 数量归零后重建 → 清空
  aux.counts.drone = 0;
  aux.counts.gunner = 0;
  aux.counts.sniper = 0;
  spawnAuxBodies(aux);
  assert.deepEqual(aux.bodies, []);
});

test('drone 环绕：angle = idx 均分 + t·2，位置 = player + orbit·dir', () => {
  const aux = createAux();
  aux.counts.drone = 2;
  spawnAuxBodies(aux);
  const player = { x: 10, y: 20, facing: 0 };
  updateAuxBodies(aux, player, [], () => {}, rng, 0.25);
  // t=0.25：idx0 角度 0.5，idx1 角度 π+0.5
  assert.ok(Math.abs(aux.bodies[0].x - (10 + 90 * Math.cos(0.5))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[0].y - (20 + 90 * Math.sin(0.5))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[1].x - (10 + 90 * Math.cos(Math.PI + 0.5))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[1].y - (20 + 90 * Math.sin(Math.PI + 0.5))) < 1e-6);
  // 时间继续累积
  updateAuxBodies(aux, player, [], () => {}, rng, 0.25);
  assert.ok(Math.abs(aux.bodies[0].x - (10 + 90 * Math.cos(1.0))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[0].y - (20 + 90 * Math.sin(1.0))) < 1e-6);
});

test('gunner/sniper 跟随玩家后方偏移点（lerp 0.1）', () => {
  const aux = createAux();
  aux.counts.gunner = 1;
  aux.counts.sniper = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 }; // 朝东 → 后方 (-60,0)/(-100,0)
  for (let i = 0; i < 80; i++) updateAuxBodies(aux, player, [], () => {}, rng, 0.016);
  const g = aux.bodies[0];
  const s = aux.bodies[1];
  assert.ok(Math.abs(g.x - (-60)) < 0.1);
  assert.ok(Math.abs(g.y) < 0.1);
  assert.ok(Math.abs(s.x - (-100)) < 0.1);
  assert.ok(Math.abs(s.y) < 0.1);
  // 朝向反转 → 后方在另一侧
  player.facing = Math.PI;
  for (let i = 0; i < 80; i++) updateAuxBodies(aux, player, [], () => {}, rng, 0.016);
  assert.ok(Math.abs(g.x - 60) < 0.1);
  assert.ok(Math.abs(s.x - 100) < 0.1);
});

test('drone 开火：cooldown 制、基础数值、死尸不触发', () => {
  const aux = createAux();
  aux.counts.drone = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  const shots = [];
  const z = { x: 100, y: 0, alive: true };
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  const s = shots[0];
  assert.equal(s.damage, 6);
  assert.equal(s.speed, 500);
  assert.equal(s.range, 300);
  assert.equal(s.pierce, 0);
  assert.equal(s.knockback, 60);
  assert.equal(s.aoe, 0);
  assert.equal(s.arc, false);
  assert.equal(s.chain, 0);
  assert.ok(Math.abs(aux.bodies[0].weapon.cooldown - 0.5) < 1e-9);
  // 冷却未满不再开火
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  // 冷却到点再开火
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.5);
  assert.equal(shots.length, 2);
  // 死尸不开火
  z.alive = false;
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 2);
  assert.equal(shots.length, 2);
});

test('gunner/sniper 开火：aoe 60 / 长射程 650', () => {
  const aux = createAux();
  aux.counts.gunner = 1;
  aux.counts.sniper = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  const shots = [];
  const z = { x: 500, y: 0, alive: true };
  // 首帧：gunner 在 (0,0)（d=500 > 400 不开火）；sniper 在 (0,0)（d=500 < 650 开火）
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].damage, 30);
  assert.equal(shots[0].speed, 700);
  assert.equal(shots[0].range, 650);
  assert.equal(shots[0].aoe, 0);
  assert.equal(aux.bodies[0].weapon.cooldown, 0); // gunner 未开火
  // gunner 射程内 → aoe 60、伤害 15
  const shots2 = [];
  const z2 = { x: 50, y: 0, alive: true };
  updateAuxBodies(aux, player, [z2], s => shots2.push(s), rng, 0.016);
  assert.equal(shots2.length, 1);
  assert.equal(shots2[0].aoe, 60);
  assert.equal(shots2[0].damage, 15);
  assert.equal(shots2[0].range, 400);
  assert.equal(shots2[0].speed, 400);
  assert.equal(shots2[0].knockback, 60);
  assert.ok(Math.abs(aux.bodies[0].weapon.cooldown - 1) < 1e-9);
});

test('aux 强化：per-type 乘区/加法公式，已部署载体吃后续强化', () => {
  const aux = createAux();
  aux.counts.drone = 1;
  aux.enhance.drone.damage = 2;
  aux.enhance.drone.fireRate = 1;
  aux.enhance.drone.projectiles = 1;
  aux.enhance.drone.range = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  const shots = [];
  const z = { x: 100, y: 0, alive: true };
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 2); // projectiles 1+1
  for (const s of shots) {
    assert.equal(s.damage, 6 * 1.25 ** 2);
    assert.equal(s.range, 300 * 1.2);
    assert.equal(s.aoe, 0);
  }
  assert.ok(Math.abs(aux.bodies[0].weapon.cooldown - 1 / (2 * 1.2)) < 1e-9);
  // 部署后强化共享生效
  aux.enhance.drone.damage = 3;
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 1); // 冷却到点
  assert.equal(shots[2].damage, 6 * 1.25 ** 3);
});

test('auxStats 公式独立可用', () => {
  const aux = createAux();
  aux.counts.sniper = 1;
  spawnAuxBodies(aux);
  const b = aux.bodies[0];
  const s = auxStats(b);
  assert.equal(s.damage, 30);
  assert.equal(s.fireRate, 0.4);
  assert.equal(s.projectiles, 1);
  assert.equal(s.range, 650);
  assert.equal(s.projectileSpeed, 700);
  assert.equal(s.aoe, 0);
  aux.enhance.sniper.projectiles = 2;
  assert.equal(auxStats(b).projectiles, 3);
});
