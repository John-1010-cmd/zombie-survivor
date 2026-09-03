import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/config/palette.js';
import { formatTime, adventureTierProgress, renderHud } from '../src/systems/hud.js';

function makeContext() {
  const ctx = {
    calls: [],
    font: '',
    textAlign: 'left',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      this.calls.push({ op: 'fillRect', args: [x, y, w, h], fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
    },
    strokeRect(x, y, w, h) {
      this.calls.push({ op: 'strokeRect', args: [x, y, w, h], strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha });
    },
    fillText(text, x, y) {
      this.calls.push({ op: 'fillText', args: [text, x, y], fillStyle: this.fillStyle, textAlign: this.textAlign, globalAlpha: this.globalAlpha });
    },
  };
  return ctx;
}

function makeGame() {
  return {
    player: { hp: 75, maxHp: 100 },
    coins: 7,
    time: 65,
    mode: 'endless',
    kills: 12,
    weapon: {
      id: 'pistol',
      enhance: { damage: 1, fireRate: 2, projectiles: 0, range: 3 },
    },
    inventory: { medkit: 2, magnet: 1, bomb: 0, turret: 1, wall: 0 },
    aux: { counts: { drone: 1, gunner: 0, sniper: 0 } },
  };
}

function textCalls(ctx) {
  return ctx.calls.filter(call => call.op === 'fillText');
}

test('formatTime 三个样例', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(600), '10:00');
});

test('冒险四档进度：90s 一档，档内 0→1，封顶第 4 档', () => {
  assert.deepEqual(adventureTierProgress(0), { tier: 1, progress: 0 });
  assert.equal(adventureTierProgress(45).progress, 0.5);
  assert.deepEqual(adventureTierProgress(90), { tier: 2, progress: 0 });
  assert.equal(adventureTierProgress(359).tier, 4);
  assert.deepEqual(adventureTierProgress(360), { tier: 4, progress: 1 });
  assert.deepEqual(adventureTierProgress(999), { tier: 4, progress: 1 });
});

test('renderHud 使用传入逻辑视口并按四角锚定，颜色来自 PALETTE', () => {
  const ctx = makeContext();
  renderHud(ctx, makeGame(), { width: 800, height: 600 });
  const hpBackground = ctx.calls.find(call => call.op === 'fillRect' && call.args[0] === 16 && call.args[1] === 16 && call.args[2] === 220 && call.args[3] === 16);
  assert.ok(hpBackground);
  assert.equal(hpBackground.fillStyle, PALETTE.hudPanel);
  const texts = textCalls(ctx);
  assert.ok(texts.some(call => call.args[0] === '01:05' && call.args[1] === 784 && call.args[2] === 24 && call.fillStyle === PALETTE.text));
  assert.ok(texts.some(call => call.args[0] === '击杀 12' && call.args[1] === 784 && call.args[2] === 44 && call.fillStyle === PALETTE.text));
  assert.ok(texts.some(call => call.args[0].includes('手枪') && call.args[1] === 16 && call.args[2] === 584 && call.fillStyle === PALETTE.text));
  const slotStrokes = ctx.calls.filter(call => call.op === 'strokeRect');
  assert.equal(slotStrokes.length, 5);
  assert.deepEqual(slotStrokes.map(call => call.args[0]), [16, 118, 220, 322, 424]);
  assert.ok(slotStrokes.every(call => call.args[1] === 554 && call.args[2] === 96 && call.args[3] === 22));
});

test('窄视口仍使用动态右边界，右下只绘制交互提示，倒计时警示使用 PALETTE.gold', () => {
  const ctx = makeContext();
  const game = makeGame();
  game.mode = 'holdout10';
  game.duration = 100;
  game.time = 50;
  game.interactionPrompt = '靠近商店';
  renderHud(ctx, game, { width: 400, height: 300 });
  const texts = textCalls(ctx).filter(call => call.args[1] === 384);
  assert.deepEqual(texts.map(call => call.args[0]), ['00:50', '击杀 12', '靠近商店']);
  assert.equal(texts[0].fillStyle, PALETTE.gold);
  assert.equal(texts[2].args[2], 284);
  const slotStrokes = ctx.calls.filter(call => call.op === 'strokeRect');
  assert.equal(slotStrokes.length, 5);
  for (const call of slotStrokes) assert.ok(call.args[0] + call.args[2] <= 384);
  assert.equal(ctx.calls.filter(call => call.op === 'fillText' && call.args[1] === 1264).length, 0);
});
