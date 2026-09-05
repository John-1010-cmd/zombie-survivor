// test/settlement.test.js —— 结算协议与收尾界面图标契约。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameScene } from '../src/game.js';
import { createZombie } from '../src/entities/zombie.js';
import { showGameOver } from '../src/ui/gameover.js';
import { showPause } from '../src/ui/pause.js';
import { showLevels } from '../src/ui/levels.js';
import { ASSET_BY_ID } from '../src/config/assets.js';
import { ADVENTURE_LEVELS } from '../src/config/adventure.js';

function makeScene() {
  const canvas = { width: 800, height: 600 };
  const input = { state: {} };
  const onGameOver = () => {};
  return createGameScene({ canvas, input, mode: 'endless', audio: null, settings: {}, meta: null, onGameOver });
}

function makeRoot() {
  const handlers = new Map();
  const classes = new Set(['hidden']);
  return {
    innerHTML: '',
    _handlers: handlers,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    querySelector(selector) {
      assert.match(selector, /^#/);
      return {
        addEventListener(type, fn) { handlers.set(selector.slice(1), { type, fn }); },
      };
    },
    querySelectorAll() { return []; },
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertManifestIcon(root, id) {
  const asset = ASSET_BY_ID[id];
  assert.ok(asset, `${id} 必须存在于 ASSET_BY_ID`);
  const safeId = escapeRegExp(id);
  const safePath = escapeRegExp(asset.path);
  assert.match(root.innerHTML, new RegExp(`data-visual-id=["']${safeId}["']`), `${id} 未渲染`);
  assert.match(root.innerHTML, new RegExp(`src=["']${safePath}["']`), `${id} 未复用 manifest path`);
}

test('行为自杀：引信燃尽 alive=false，清理循环补 killZombie 结算一次（计 1 击杀，不双计）', () => {
  const scene = makeScene();
  scene.weapon.cooldown = 1e9;
  const p = scene.player;
  const e = createZombie('exploder', p.x + 40, p.y, { tier: 1, timeSec: 0, level: 1 });
  e.x = p.x + 40; e.y = p.y;
  const baseKills = scene.kills;
  scene.zombies.push(e);
  for (let i = 0; i < 120; i++) scene.update(1 / 60);
  assert.equal(e.fuseDone, true);
  assert.equal(e.alive, false);
  assert.equal(e.counted, true, '清理循环应补 killZombie（自爆）');
  assert.equal(scene.kills, baseKills + 1, '行为自杀只计 1 次击杀');
  assert.ok(!scene.zombies.includes(e), '结算后已从数组移除');
});

test('战斗击杀计 1 次，同帧清理循环不双计', () => {
  const scene = makeScene();
  const p = scene.player;
  const e = createZombie('normal', p.x + 40, p.y, { tier: 1, timeSec: 0, level: 1 });
  e.hp = 5; e.maxHp = 5;
  e.x = p.x + 40; e.y = p.y;
  const baseKills = scene.kills;
  scene.zombies.push(e);
  let guard = 0;
  while (!e.counted && guard++ < 200) scene.update(1 / 60);
  assert.equal(e.counted, true, '战斗击杀应计 1 次');
  assert.equal(e.alive, false);
  assert.equal(scene.kills - baseKills, 1, '战斗击杀只计 1 次，清理循环不再补计');
  assert.ok(!scene.zombies.includes(e), '结算后已从数组移除');
});

test('showGameOver：冒险结算使用金币 manifest 图标，并给奖励节点完整 tooltip', () => {
  const root = makeRoot();
  showGameOver(root, {
    time: 360, kills: 41, hp: 80, cleared: true, mode: 'adventure', gold: 200, firstClear: true,
  }, false, {
    onRestart() {}, onLevels() {}, onMenu() {},
  });
  assertManifestIcon(root, 'icon.currency.gold');
  assert.match(root.innerHTML, /class="settlement-reward"/);
  assert.match(root.innerHTML, /data-tooltip="[^"]*金币[^"]*200[^"]*首通奖励/);
  assert.match(root.innerHTML, /金币 \+200/);
});

test('showPause：设置控件保留文字可读性并覆盖 tooltip', () => {
  const root = makeRoot();
  showPause(root, { volume: 0.75, damageNumbers: true, screenShake: false }, {
    onResume() {}, onQuit() {}, onChange() {},
  });
  assert.match(root.innerHTML, /id="pause-volume"/);
  assert.match(root.innerHTML, /data-tooltip="音量：调整音量/);
  assert.match(root.innerHTML, /data-tooltip="伤害数字：/);
  assert.match(root.innerHTML, /data-tooltip="震屏：/);
  assert.match(root.innerHTML, /继续/);
  assert.match(root.innerHTML, /回主菜单/);
});

test('showLevels：余额和每个已解锁关卡奖励都复用金币 manifest ID', () => {
  const root = makeRoot();
  showLevels(root, {
    gold: 500,
    adventure: { unlocked: ADVENTURE_LEVELS.length, bestTimes: {} },
  }, () => {}, () => {});
  const count = (root.innerHTML.match(/data-visual-id="icon\.currency\.gold"/g) || []).length;
  assert.equal(count, ADVENTURE_LEVELS.length + 1, '余额 1 个 + 每关奖励 1 个金币图标');
  assertManifestIcon(root, 'icon.currency.gold');
  assert.match(root.innerHTML, /data-tooltip="[^"]*金币余额[^"]*500/);
  assert.match(root.innerHTML, /data-tooltip="[^"]*通关奖励[^"]*100[^"]*金币/);
});
