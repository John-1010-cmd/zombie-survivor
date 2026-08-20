// test/spawner.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { MONSTERS } from '../src/config/bestiary/monsters.js';
import { MAX_ZOMBIES, getTierConfig } from '../src/config/difficulty.js';
import { createSpawner, updateSpawner, offscreenPoint } from '../src/systems/spawner.js';

const CAM = { x: 860, y: 1140, viewW: 1280, viewH: 720 }; // 镜头中心 = (1500,1500)

test('t=0 新手期 weights 只有 normal，只刷 normal', () => {
  const sp = createSpawner();
  const zombies = [];
  const rng = mulberry32(1);
  for (let i = 0; i < 100; i++) updateSpawner(sp, 0, CAM, 3000, zombies, 0, rng, 0.1);
  assert.ok(zombies.length > 0, `应刷出僵尸，实际 ${zombies.length}`);
  for (const z of zombies) assert.equal(z.type, 'normal');
});

test('budget 最多累计 2 秒 bps，不随刷新消耗虚高', () => {
  const sp = createSpawner();
  const zombies = [];
  const rng = mulberry32(2);
  // time=60：tier 1，bps=3，封顶=6；aliveCount 已满则常规刷怪不消耗预算，可观察纯累计
  for (let i = 0; i < 500; i++) {
    updateSpawner(sp, 60, CAM, 3000, zombies, MAX_ZOMBIES, rng, 0.016);
    assert.ok(sp.budget <= 2 * 3 + 1e-9, `budget=${sp.budget} 超出封顶`);
  }
  assert.ok(Math.abs(sp.budget - 2 * 3) < 1e-6, `budget 应封顶在 ${2 * 3}，实际 ${sp.budget}`);
});

test('time=0 预算从 0.5/s 起步，同样时长刷得比 time=60 少', () => {
  const zA = [], zB = [];
  const spA = createSpawner(), spB = createSpawner();
  const rngA = mulberry32(7), rngB = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    updateSpawner(spA, 0, CAM, 3000, zA, 0, rngA, 0.1);
    updateSpawner(spB, 60, CAM, 3000, zB, 0, rngB, 0.1);
  }
  assert.ok(zA.length > 0, `新手期应能刷出僵尸，实际 ${zA.length}`);
  assert.ok(zB.length > zA.length, `t=60 刷 ${zB.length} 只应多于 t=0 的 ${zA.length} 只`);
});

test('跨档瞬间僵尸数突增包围潮数量（SURGE_CAP=48，档 2 = 25 只）', () => {
  const zombies = [];
  const rng = mulberry32(3);
  const sp = createSpawner();
  for (let i = 0; i < 100; i++) updateSpawner(sp, 100, CAM, 3000, zombies, 0, rng, 1 / 60);
  const before = zombies.length;
  const n = updateSpawner(sp, 180, CAM, 3000, zombies, 0, rng, 1 / 60); // 跨入档 2
  // 25 只包围潮 + 0~6 只常规补刷（取决于此前预算结余），区间断言避免脆等值
  assert.ok(n >= 25 && n <= 31, `跨档新增 ${n} 只，应在 25~31 之间`);
  assert.equal(zombies.length - before, n);
  assert.equal(sp.lastTier, 2);
});

test('包围潮同样受 MAX_ZOMBIES 上限约束', () => {
  const zombies = [];
  const rng = mulberry32(3);
  const sp = createSpawner();
  const n = updateSpawner(sp, 180, CAM, 3000, zombies, MAX_ZOMBIES - 10, rng, 1 / 60);
  assert.equal(n, 10); // 名额只剩 10：包围潮截断在 10，常规刷怪亦不再进行
  assert.equal(sp.lastTier, 2);
});

test('aliveCount 达到 MAX_ZOMBIES 后不再刷怪，只补足差额', () => {
  const rng = mulberry32(4);
  const sp = createSpawner();
  sp.budget = 999;
  const zombies = [];
  assert.equal(updateSpawner(sp, 60, CAM, 3000, zombies, MAX_ZOMBIES, rng, 1), 0);
  assert.equal(zombies.length, 0);
  const sp2 = createSpawner();
  sp2.budget = 999;
  const zombies2 = [];
  assert.equal(updateSpawner(sp2, 60, CAM, 3000, zombies2, MAX_ZOMBIES - 1, rng, 1), 1);
  assert.equal(zombies2.length, 1);
});

test('t=1500 僵尸 hp 按 scaling 管线连续增长', () => {
  const zombies = [];
  const rng = mulberry32(6);
  const sp = createSpawner();
  sp.budget = 999;
  const n = updateSpawner(sp, 1500, CAM, 3000, zombies, 0, rng, 1);
  assert.ok(n > 0);
  assert.equal(sp.lastTier, 9);
  // timeSec=1500 → 分钟 25，hp = 基础 × (1 + 25×0.45) = ×12.25（endless；scaling 缺省）
  for (const z of zombies) assert.equal(z.hp, MONSTERS[z.type].hp * 12.25);
});

test('真实链路集成：getTierConfig 产出的僵尸数值均为有限正数（防配置缺字段→NaN 回归）', () => {
  const rng = mulberry32(13);
  let spawned = 0;
  for (const t of [0, 60, 180, 600, 1500]) {
    const zombies = [];
    const sp = createSpawner();
    sp.budget = 999;
    spawned += updateSpawner(sp, t, CAM, 3000, zombies, 0, rng, 1);
    for (const z of zombies) {
      for (const field of ['hp', 'speed', 'damage']) {
        assert.ok(Number.isFinite(z[field]) && z[field] > 0,
          `t=${t} type=${z.type} ${field}=${z[field]} 应为有限正数`);
      }
    }
  }
  assert.ok(spawned > 0, '各档应至少刷出僵尸');
});

test('刷怪点始终落在 [20, mapSize-20] 内（角落镜头强制退化到地图随机点）', () => {
  const cam = { x: 0, y: 0, viewW: 1280, viewH: 720 }; // 镜头夹紧在地图左上角
  const zombies = [];
  const sp = createSpawner();
  sp.budget = 999;
  const rng = () => 0.75; // 恒定角度 0.75×2π ≈ 270°（正上方）：落点 y<0 必越界，10 次尝试全失败 → 退化为地图内随机点
  updateSpawner(sp, 60, CAM, 3000, zombies, 0, rng, 1);
  assert.ok(zombies.length > 0);
  for (const z of zombies) {
    assert.ok(z.x >= 20 && z.x <= 2980 && z.y >= 20 && z.y <= 2980,
      `刷怪点 (${z.x},${z.y}) 越界`);
  }
});

test('budgetMult=1.5 作用于 bps：封顶随倍率放大（坚守高峰用）', () => {
  const sp = createSpawner();
  const zombies = [];
  const rng = mulberry32(5);
  for (let i = 0; i < 500; i++) {
    updateSpawner(sp, 60, CAM, 3000, zombies, MAX_ZOMBIES, rng, 0.016, 1.5);
    assert.ok(sp.budget <= 2 * 3 * 1.5 + 1e-9, `budget=${sp.budget} 超出封顶`);
  }
  assert.ok(Math.abs(sp.budget - 2 * 3 * 1.5) < 1e-6, `budget 应封顶在 9，实际 ${sp.budget}`);
});

test('budgetMult=1.5 同条件下刷怪量更多', () => {
  const zA = [], zB = [];
  const spA = createSpawner(), spB = createSpawner();
  const rngA = mulberry32(11), rngB = mulberry32(11);
  for (let i = 0; i < 200; i++) {
    updateSpawner(spA, 60, CAM, 3000, zA, 0, rngA, 0.1);
    updateSpawner(spB, 60, CAM, 3000, zB, 0, rngB, 0.1, 1.5);
  }
  assert.ok(zB.length > zA.length, `1.5× 刷 ${zB.length} 只应多于 1× 的 ${zA.length} 只`);
});

test('offscreenPoint：镜头外圆环内且不越界', () => {
  const halfDiag = Math.hypot(CAM.viewW / 2, CAM.viewH / 2);
  const rng = mulberry32(8);
  for (let i = 0; i < 20; i++) {
    const p = offscreenPoint(CAM, 3000, rng);
    assert.ok(Math.hypot(p.x - 1500, p.y - 1500) > halfDiag, `点 (${p.x},${p.y}) 仍在屏幕内`);
    assert.ok(p.x >= 20 && p.x <= 2980 && p.y >= 20 && p.y <= 2980, `点 (${p.x},${p.y}) 越界`);
  }
});

test('offscreenPoint：角落镜头全部越界时退化为地图内随机点', () => {
  const cam = { x: 0, y: 0, viewW: 1280, viewH: 720 };
  const rng = () => 0.75; // 恒定角度落点在屏幕上方 → 必越界
  for (let i = 0; i < 5; i++) {
    const p = offscreenPoint(cam, 3000, rng);
    assert.ok(p.x >= 20 && p.x <= 2980 && p.y >= 20 && p.y <= 2980, `退化点 (${p.x},${p.y}) 越界`);
  }
});

test('surge=false 跨档不产生包围潮，但仍按新档 weights 常规刷怪', () => {
  const zombies = [];
  const rng = mulberry32(3);
  const sp = createSpawner();
  sp.budget = 999;
  const n = updateSpawner(sp, 180, CAM, 3000, zombies, 0, rng, 1 / 60, 1, getTierConfig, {}, false);
  assert.equal(sp.lastTier, 2);
  assert.ok(n >= 1 && n < 25, `surge=false 只走常规刷怪，实际新增 ${n}（应 <25 且 ≥1）`);
  for (const z of zombies) assert.ok(z.type === 'normal' || z.type === 'fast');
});
