// test/settlement.test.js —— 结算协议集成测试（Task 5 质量审查补充，控制器确认）：
//   counted 防重 + 行为自杀经清理循环补结算。game.js 无 DOM 顶层副作用，node 下可安全 import，
//   故以最小集成方式驱动 scene.update() 真实主循环验证；若无法安全 import 则本协议由 Task 16 手动验收。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameScene } from '../src/game.js';
import { createZombie } from '../src/entities/zombie.js';

function makeScene() {
  const canvas = { width: 800, height: 600 };
  const input = { state: {} };
  const onGameOver = () => {};
  const scene = createGameScene({ canvas, input, mode: 'endless', audio: null, settings: {}, meta: null, onGameOver });
  return scene;
}

test('行为自杀：引信燃尽 alive=false，清理循环补 killZombie 结算一次（计 1 击杀，不双计）', () => {
  const scene = makeScene();
  scene.weapon.cooldown = 1e9; // 禁用自动开火：排除战斗击杀，纯粹观察清理循环补结算
  const p = scene.player;
  const e = createZombie('exploder', p.x + 40, p.y, { tier: 1, timeSec: 0, level: 1 });
  e.x = p.x + 40; e.y = p.y;
  const baseKills = scene.kills;
  scene.zombies.push(e);
  for (let i = 0; i < 120; i++) scene.update(1 / 60); // 1.2s 引信 + 余量，覆盖同帧清理
  assert.equal(e.fuseDone, true);
  assert.equal(e.alive, false);
  assert.equal(e.counted, true, '清理循环应补 killZombie（自爆）');
  assert.equal(scene.kills, baseKills + 1, '行为自杀只计 1 次击杀');
  assert.ok(!scene.zombies.includes(e), '结算后已从数组移除');
});

test('战斗击杀计 1 次，同帧清理循环不双计', () => {
  const scene = makeScene(); // 武器默认可用（cooldown=0，首帧即开火）
  const p = scene.player;
  const e = createZombie('normal', p.x + 40, p.y, { tier: 1, timeSec: 0, level: 1 });
  e.hp = 5; e.maxHp = 5; // 压到一发致死：武器首帧唯一命中近程目标即本僵尸
  e.x = p.x + 40; e.y = p.y;
  const baseKills = scene.kills;
  scene.zombies.push(e);
  let guard = 0;
  while (!e.counted && guard++ < 200) scene.update(1 / 60);
  assert.equal(e.counted, true, '战斗击杀应计 1 次');
  assert.equal(e.alive, false);
  assert.equal(scene.kills - baseKills, 1, '战斗击杀只计 1 次，清理循环不再补计（同帧不双计）');
  assert.ok(!scene.zombies.includes(e), '结算后已从数组移除');
});
