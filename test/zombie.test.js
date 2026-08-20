// test/zombie.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombie, updateZombie, damageZombie } from '../src/entities/zombie.js';

const T1 = { tier: 1 };
const T4 = { tier: 4 };
const T5 = { tier: 5 };
const T13 = { tier: 13 };

test('timeSec=0、level=1 时数值为图鉴基础值（缩放走 scaling 管线）', () => {
  const z = createZombie('normal', 0, 0, T4);
  assert.equal(z.hp, 30);
  assert.equal(z.speed, 70);
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

test('coin 随档位递增：档1 ×1、档5 ×2、档13 起 ×4 封顶', () => {
  assert.equal(createZombie('normal', 0, 0, T1).coin, 1);
  assert.equal(createZombie('tank', 0, 0, T1).coin, 5);
  assert.equal(createZombie('boss', 0, 0, T1).coin, 50);

  assert.equal(createZombie('normal', 0, 0, T5).coin, 2);  // 1×2
  assert.equal(createZombie('tank', 0, 0, T5).coin, 10);   // 5×2
  assert.equal(createZombie('boss', 0, 0, T5).coin, 100);  // 50×2

  assert.equal(createZombie('normal', 0, 0, T13).coin, 4); // 封顶 ×4
  assert.equal(createZombie('tank', 0, 0, T13).coin, 20);
  assert.equal(createZombie('boss', 0, 0, T13).coin, 200);
});

test('coin 递增四舍五入到整数', () => {
  // 档4：倍率 1+0.25×3=1.75；fast 1×1.75=1.75→2；tank 5×1.75=8.75→9
  assert.equal(createZombie('fast', 0, 0, T4).coin, 2);
  assert.equal(createZombie('tank', 0, 0, T4).coin, 9);
});

test('tier 缺省视为档 1（向后兼容旧 cfg）', () => {
  assert.equal(createZombie('normal', 0, 0, { hpMult: 1, speedMult: 1 }).coin, 1);
});

function makeEdible(x, y, hp = 100, r = 18) {
  return { x, y, r, hp, maxHp: hp, alive: true };
}

test('250px 内最近 edible 优先：朝部署物移动而非玩家', () => {
  const z = createZombie('normal', 0, 0, T1);
  const p = { x: 0, y: 500 };
  const e = makeEdible(100, 0); // 距僵尸 100 < 250
  const d0 = Math.hypot(e.x - z.x, e.y - z.y);
  const dp0 = Math.hypot(p.x - z.x, p.y - z.y);
  for (let i = 0; i < 40; i++) updateZombie(z, p, [], 1 / 60, [e]); // 40 帧走 46.7px，未接触
  assert.ok(Math.hypot(e.x - z.x, e.y - z.y) < d0, '应朝 edible 靠近');
  assert.ok(Math.hypot(p.x - z.x, p.y - z.y) > dp0, '应远离玩家方向');
  assert.equal(e.hp, 100, '未接触前不扣耐久');
});

test('接触 edible：原地啃食每秒 z.damage，不移动', () => {
  const z = createZombie('normal', 0, 0, T1); // r=14, damage=8
  const p = { x: 0, y: 500 };
  const e = makeEdible(30, 0); // 距 30 ≤ 14+18 → 接触
  const zx = z.x, zy = z.y;
  updateZombie(z, p, [], 1, [e]);
  assert.equal(e.hp, 100 - 8, '每秒啃 z.damage');
  assert.equal(z.x, zx, '啃食时不移动');
  assert.equal(z.y, zy, '啃食时不移动');
});

test('edible 耐久归零置 alive=false（可被摧毁）', () => {
  const z = createZombie('tank', 0, 0, T1); // damage=20
  const p = { x: 0, y: 500 };
  const e = makeEdible(25, 0, 15); // 距 25 ≤ 24+18 → 接触；hp 15 < 20
  updateZombie(z, p, [], 1, [e]);
  assert.equal(e.hp, -5);
  assert.equal(e.alive, false);
});

test('最近 edible 选择：多个存活取最近', () => {
  const z = createZombie('normal', 0, 0, T1);
  const p = { x: 0, y: 500 };
  const far = makeEdible(240, 0);
  const near = makeEdible(60, 0);
  const dNear0 = Math.hypot(near.x - z.x, near.y - z.y);
  for (let i = 0; i < 60; i++) updateZombie(z, p, [], 1 / 60, [far, near]);
  assert.ok(Math.hypot(near.x - z.x, near.y - z.y) < dNear0, '应朝最近的 edible 移动');
  assert.equal(far.hp, 100);
});

test('edible 已死（alive=false）被跳过', () => {
  const z = createZombie('normal', 0, 0, T1);
  const p = { x: 500, y: 0 };
  const dead = { x: 50, y: 0, r: 18, hp: 0, alive: false };
  const d0 = Math.hypot(p.x - z.x, p.y - z.y);
  for (let i = 0; i < 60; i++) updateZombie(z, p, [], 1 / 60, [dead]);
  assert.ok(Math.hypot(p.x - z.x, p.y - z.y) < d0, '无存活 edible 时追玩家');
});

test('250px 外的 edible 不拦截：仍追玩家（向后兼容默认参）', () => {
  const z = createZombie('normal', 0, 0, T1);
  const p = { x: 500, y: 0 };
  const e = makeEdible(300, 0); // 距 300 > 250
  const dp0 = Math.hypot(p.x - z.x, p.y - z.y);
  for (let i = 0; i < 60; i++) updateZombie(z, p, [], 1 / 60, [e]);
  assert.ok(Math.hypot(p.x - z.x, p.y - z.y) < dp0, '应追玩家');
  assert.equal(e.hp, 100);
});

test('守门 Boss 创建：special 不缩放（hp/speed/damage 恒基础值），coin 仍按档递增', () => {
  const b = createZombie('boss', 10, 10, T1);
  assert.equal(b.type, 'boss');
  assert.equal(b.r, 41);
  assert.equal(b.hp, 7040);
  assert.equal(b.maxHp, 7040);
  assert.equal(b.speed, 20);
  assert.equal(b.damage, 40);
  assert.equal(b.coin, 50);
  assert.equal(b.knockbackResist, 0.95);
  // special 不缩放：无论 T4/T13，hp/speed/damage 恒基础值（裁定）
  for (const t of [T4, T13]) {
    const bh = createZombie('boss', 0, 0, t);
    assert.equal(bh.hp, 7040);
    assert.equal(bh.speed, 20);
    assert.equal(bh.damage, 40);
  }
  // coin 仍随档递增：T5=50×2、T13=50×4（裁定）
  assert.equal(createZombie('boss', 0, 0, T5).coin, 100);
  assert.equal(createZombie('boss', 0, 0, T13).coin, 200);
});

test('createZombie 管线化：默认参数 = 图鉴基础值；冒险关 3 携倍率', () => {
  const z = createZombie('normal', 0, 0);
  assert.equal(z.hp, 30);
  assert.equal(z.maxHp, 30);
  assert.equal(z.damage, 8);
  assert.equal(z.coin, 1);
  const z3 = createZombie('normal', 0, 0, { level: 3, tier: 4, timeSec: 0, mode: 'adventure' });
  assert.ok(Math.abs(z3.hp - 30 * 2.2) < 1e-9);
});

test('自爆僵尸携带缩放后 aoe 与行为标记；普通怪不带', () => {
  const e = createZombie('exploder', 0, 0, { level: 1, tier: 4, timeSec: 0, mode: 'adventure' });
  assert.equal(e.behavior, 'exploder');
  assert.deepEqual(e.aoe, { damage: 30, radius: 80 });
  assert.equal(e.fuseDone, false);
  const n = createZombie('normal', 0, 0);
  assert.equal(n.behavior, null);
  assert.equal(n.aoe, undefined);
});
