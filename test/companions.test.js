import test from 'node:test';
import assert from 'node:assert/strict';
import { drawVisual } from '../src/core/visuals.js';
import { PALETTE } from '../src/config/palette.js';
import { TURN_RATE } from '../src/core/angles.js';
import {
  createAux, spawnAuxBodies, updateAuxBodies, auxStats,
  AUX_CONFIG, AUX_VISUAL_IDS, ORBIT_SPEED,
} from '../src/entities/companions.js';

const rng = () => 0.5;
const EPSILON = 1e-9;

function mockContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of [
    'save', 'restore', 'translate', 'rotate', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'fill', 'stroke', 'fillRect', 'rect',
  ]) {
    ctx[name] = (...args) => calls.push({ name, args });
  }
  return ctx;
}

test('createAux 结构：counts/增强四维/bodies/t', () => {
  const aux = createAux();
  assert.deepEqual(aux.counts, { drone: 0, gunner: 0, sniper: 0 });
  for (const kind of ['drone', 'gunner', 'sniper'])
    assert.deepEqual(aux.enhance[kind], { damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  assert.deepEqual(aux.bodies, []);
  assert.equal(aux.t, 0);
});

test('AUX_CONFIG 基值、icon 和 visual per 契约：三种均 orbit（无 follow）', () => {
  assert.deepEqual(AUX_CONFIG.drone, {
    name: '随行无人机', icon: 'icon.aux.drone', visual: 'aux.drone',
    orbit: 90, damage: 6, fireRate: 2, projectileSpeed: 500, range: 250, aoe: 0,
  });
  assert.deepEqual(AUX_CONFIG.gunner, {
    name: '随行移动火炮', icon: 'icon.aux.gunner', visual: 'aux.gunner',
    orbit: 60, damage: 15, fireRate: 1, projectileSpeed: 400, range: 320, aoe: 60,
  });
  assert.deepEqual(AUX_CONFIG.sniper, {
    name: '随行远程火炮', icon: 'icon.aux.sniper', visual: 'aux.sniper',
    orbit: 100, damage: 30, fireRate: 0.4, projectileSpeed: 700, range: 500, aoe: 0,
  });
  assert.equal('follow' in AUX_CONFIG.gunner, false);
  assert.equal('follow' in AUX_CONFIG.sniper, false);
});

test('ORBIT_SPEED 角速 per 契约：drone 2.2 / gunner 1.4 / sniper 1.0', () => {
  assert.deepEqual(ORBIT_SPEED, { drone: 2.2, gunner: 1.4, sniper: 1.0 });
});

test('spawnAuxBodies 按 counts 重建：数量/顺序/weapon 结构/共享增强/aimAngle', () => {
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
    assert.equal(b.weapon.enhance, aux.enhance[b.kind]);
    assert.equal(b.weapon.cooldown, 0);
    assert.equal(b.aimAngle, 0);
  }
  aux.counts.drone = 0;
  aux.counts.gunner = 0;
  aux.counts.sniper = 0;
  spawnAuxBodies(aux);
  assert.deepEqual(aux.bodies, []);
});

test('drone 环绕：angle = idx 均分 + t·2.2，位置 = player + orbit·dir', () => {
  const aux = createAux();
  aux.counts.drone = 2;
  spawnAuxBodies(aux);
  const player = { x: 10, y: 20, facing: 0 };
  updateAuxBodies(aux, player, [], () => {}, rng, 0.25);
  assert.ok(Math.abs(aux.bodies[0].x - (10 + 90 * Math.cos(0.55))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[0].y - (20 + 90 * Math.sin(0.55))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[1].x - (10 + 90 * Math.cos(Math.PI + 0.55))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[1].y - (20 + 90 * Math.sin(Math.PI + 0.55))) < 1e-6);
  updateAuxBodies(aux, player, [], () => {}, rng, 0.25);
  assert.ok(Math.abs(aux.bodies[0].x - (10 + 90 * Math.cos(1.1))) < 1e-6);
  assert.ok(Math.abs(aux.bodies[0].y - (20 + 90 * Math.sin(1.1))) < 1e-6);
});

test('gunner/sniper 环绕：orbit 半径、角度按各自角速随时间变化', () => {
  const aux = createAux();
  aux.counts.gunner = 1;
  aux.counts.sniper = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  updateAuxBodies(aux, player, [], () => {}, rng, 0.25);
  const g = aux.bodies[0];
  const s = aux.bodies[1];
  assert.ok(Math.abs(g.x - 60 * Math.cos(0.35)) < 1e-6);
  assert.ok(Math.abs(g.y - 60 * Math.sin(0.35)) < 1e-6);
  assert.ok(Math.abs(s.x - 100 * Math.cos(0.25)) < 1e-6);
  assert.ok(Math.abs(s.y - 100 * Math.sin(0.25)) < 1e-6);
  for (const [b, orbit] of [[g, 60], [s, 100]]) {
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    assert.ok(Math.abs(d - orbit) <= 5, `距玩家 ${d} 应在 orbit(${orbit})±5 内`);
  }
  const gx0 = g.x, gy0 = g.y;
  updateAuxBodies(aux, player, [], () => {}, rng, 0.5);
  assert.ok(Math.hypot(g.x - gx0, g.y - gy0) > 1);
  assert.ok(Math.abs(g.x - 60 * Math.cos(1.05)) < 1e-6);
  assert.ok(Math.abs(g.y - 60 * Math.sin(1.05)) < 1e-6);
  assert.ok(Math.abs(s.x - 100 * Math.cos(0.75)) < 1e-6);
  assert.ok(Math.abs(s.y - 100 * Math.sin(0.75)) < 1e-6);
});

test('同类型多体：起始角按 idx 均分（dt=0 即起始角）', () => {
  const aux = createAux();
  aux.counts.gunner = 2;
  spawnAuxBodies(aux);
  const player = { x: 10, y: 20, facing: 0 };
  updateAuxBodies(aux, player, [], () => {}, rng, 0);
  assert.ok(Math.abs(aux.bodies[0].x - (10 + 60)) < 1e-6);
  assert.ok(Math.abs(aux.bodies[0].y - 20) < 1e-6);
  assert.ok(Math.abs(aux.bodies[1].x - (10 - 60)) < 1e-6);
  assert.ok(Math.abs(aux.bodies[1].y - 20) < 1e-6);
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
  assert.equal(s.range, 250);
  assert.equal(s.pierce, 0);
  assert.equal(s.knockback, 60);
  assert.equal(s.aoe, 0);
  assert.equal(s.arc, false);
  assert.equal(s.chain, 0);
  assert.equal(s.muzzleFlash, undefined);
  assert.ok(Math.abs(aux.bodies[0].weapon.cooldown - 0.5) < EPSILON);
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.5);
  assert.equal(shots.length, 2);
  z.alive = false;
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 2);
  assert.equal(shots.length, 2);
});

test('gunner/sniper 开火：aoe 60 / 长射程 500，炮口闪光颜色来自 palette', () => {
  const aux = createAux();
  aux.counts.gunner = 1;
  aux.counts.sniper = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  const shots = [];
  const z = { x: 450, y: 0, alive: true };
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.016);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].damage, 30);
  assert.equal(shots[0].speed, 700);
  assert.equal(shots[0].range, 500);
  assert.equal(shots[0].aoe, 0);
  assert.deepEqual(shots[0].muzzleFlash, {
    color: PALETTE.auxSniper ?? PALETTE.neon, count: 2, distance: 22,
  });
  assert.equal(aux.bodies[0].weapon.cooldown, 0);
  const shots2 = [];
  const z2 = { x: 50, y: 0, alive: true };
  updateAuxBodies(aux, player, [z2], s => shots2.push(s), rng, 0.016);
  assert.equal(shots2.length, 1);
  assert.equal(shots2[0].aoe, 60);
  assert.equal(shots2[0].damage, 15);
  assert.equal(shots2[0].range, 320);
  assert.equal(shots2[0].speed, 400);
  assert.equal(shots2[0].knockback, 60);
  assert.deepEqual(shots2[0].muzzleFlash, {
    color: PALETTE.auxGunner ?? PALETTE.gold, count: 2, distance: 14,
  });
  assert.ok(Math.abs(aux.bodies[0].weapon.cooldown - 1) < EPSILON);
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
  assert.equal(shots.length, 2);
  for (const s of shots) {
    assert.equal(s.damage, 6 * 1.25 ** 2);
    assert.equal(s.range, 250 * 1.2);
    assert.equal(s.aoe, 0);
  }
  assert.ok(Math.abs(aux.bodies[0].weapon.cooldown - 1 / (2 * 1.2)) < 1e-9);
  aux.enhance.drone.damage = 3;
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 1);
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
  assert.equal(s.range, 500);
  assert.equal(s.projectileSpeed, 700);
  assert.equal(s.aoe, 0);
  aux.enhance.sniper.projectiles = 2;
  assert.equal(auxStats(b).projectiles, 3);
});

test('gunner/sniper aimAngle 在 cooldown 期间按 240°/s 平滑追踪', () => {
  const aux = createAux();
  aux.counts.gunner = 1;
  aux.counts.sniper = 1;
  spawnAuxBodies(aux);
  const player = { x: 0, y: 0, facing: 0 };
  const z = { x: -100, y: 0, alive: true };
  const shots = [];
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0);
  assert.equal(shots.length, 2);
  assert.equal(aux.bodies[0].aimAngle, 0);
  assert.equal(aux.bodies[1].aimAngle, 0);
  updateAuxBodies(aux, player, [z], s => shots.push(s), rng, 0.1);
  assert.equal(shots.length, 2);
  assert.ok(Math.abs(aux.bodies[0].aimAngle + TURN_RATE * 0.1) < EPSILON);
  assert.ok(Math.abs(aux.bodies[1].aimAngle + TURN_RATE * 0.1) < EPSILON);
});

test('三类辅助 visual 均已注册，场内绘制只走程序化 drawVisual', () => {
  for (const kind of ['drone', 'gunner', 'sniper']) {
    const ctx = mockContext();
    assert.equal(AUX_VISUAL_IDS[kind], `aux.${kind}`);
    assert.equal(AUX_CONFIG[kind].visual, AUX_VISUAL_IDS[kind]);
    assert.doesNotThrow(() => drawVisual(ctx, AUX_CONFIG[kind].visual, 0, 0, 14, {
      params: { aimAngle: Math.PI / 4 },
      phase: 0.5,
    }));
    assert.ok(ctx.calls.some(call => call.name === 'stroke'), `${kind} 应有发光描边`);
    if (kind === 'gunner' || kind === 'sniper') {
      const rotateCall = ctx.calls.find(call => call.name === 'rotate');
      assert.ok(rotateCall, `${kind} 应当包含 rotate 调用`);
      assert.ok(Math.abs(rotateCall.args[0] - Math.PI / 4) < EPSILON, `${kind} rotate 角度应当等于传入的 aimAngle`);
    } else if (kind === 'drone') {
      const rotateCalls = ctx.calls.filter(call => call.name === 'rotate');
      assert.equal(rotateCalls.length, 4, 'drone 应有 4 个旋翼 rotate 调用');
      assert.ok(Math.abs(rotateCalls[0].args[0] - (0.5 * 8)) < EPSILON, 'drone 旋翼 rotate 角度受 phase 驱动');
    }
  }
});
