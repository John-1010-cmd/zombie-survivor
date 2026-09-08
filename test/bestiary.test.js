// test/bestiary.test.js —— 图鉴数据完整性（设计 §4.1/§5 字段契约）
import test from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, MAX_ZOMBIE_R, playableMonsters } from '../src/config/bestiary/monsters.js';
import { DIFFICULTY_TIERS } from '../src/config/difficulty.js';
import { WEAPONS, SPECIAL_STATS } from '../src/config/bestiary/weapons.js';
import { weaponUpgradePrice } from '../src/config/economy.js';
import { monsterView, weaponView, showBestiary, BESTIARY_VISUAL_SIZES } from '../src/ui/bestiary.js';
import { PARTS, SHAPES, renderZombie } from '../src/entities/render.js';
import { getVisualCanvas, clearCaches } from '../src/core/visuals.js';
import { createZombie } from '../src/entities/zombie.js';
import { PALETTE } from '../src/config/palette.js';

test('怪物清单 5 条：组合式 visual body/palette/parts 完整，逻辑字段保留', () => {
  assert.deepEqual(Object.keys(MONSTERS).sort(), ['boss', 'exploder', 'fast', 'normal', 'tank']);
  const expectedBodies = {
    normal: 'circle', fast: 'triangle', tank: 'hexagon',
    exploder: 'diamond', boss: 'pentagon',
  };
  for (const m of Object.values(MONSTERS)) {
    for (const f of ['hp', 'speed', 'damage', 'coin', 'radius', 'cost'])
      assert.ok(m[f] > 0, `${m.id}.${f} 应为正数`);
    assert.ok(m.knockbackResist >= 0 && m.knockbackResist < 1, `${m.id}.knockbackResist`);
    assert.ok(typeof m.name === 'string' && m.name, `${m.id} 缺名称`);
    assert.ok(typeof m.desc === 'string' && m.desc, `${m.id} 缺图鉴描述`);
    assert.equal(m.visual.body, expectedBodies[m.id], `${m.id}.visual.body`);
    assert.ok(Number.isFinite(m.visual.scale) && m.visual.scale > 0, `${m.id}.visual.scale`);
    assert.deepEqual(Object.keys(m.visual.palette).sort(), ['fill', 'glow', 'stroke']);
    for (const [slot, token] of Object.entries(m.visual.palette))
      assert.equal(typeof PALETTE[token], 'string', `${m.id}.visual.palette.${slot}=${token} 未在 PALETTE 注册`);
    assert.ok(Array.isArray(m.visual.parts) && m.visual.parts.length > 0, `${m.id}.visual.parts`);
    assert.ok(SHAPES[m.visual.body], `${m.id}.visual.body=${m.visual.body} 未注册`);
    for (const part of m.visual.parts)
      assert.ok(PARTS[part.type], `${m.id}.visual.parts.${part.type} 未注册`);
    assert.equal(m.behavior === null || typeof m.behavior === 'string', true);
    assert.equal(m.id in MONSTERS && MONSTERS[m.id] === m, true);
  }
});

test('五种怪物的组合部件符合 §7 轮廓约定，自爆 cracks 密度为 0.3', () => {
  assert.deepEqual(MONSTERS.normal.visual.parts, [
    { type: 'eyes', style: 'angry', count: 2 },
    { type: 'mouth', style: 'crooked' },
    { type: 'cracks', style: 'spots', density: 0.2 },
  ]);
  assert.deepEqual(MONSTERS.fast.visual.parts, [
    { type: 'eyes', style: 'narrow', count: 2 },
    { type: 'trail', style: 'speed' },
  ]);
  assert.deepEqual(MONSTERS.tank.visual.parts, [
    { type: 'spikes', style: 'rim', count: 6 },
    { type: 'mouth', style: 'thick-jaw' },
  ]);
  assert.deepEqual(MONSTERS.exploder.visual.parts, [
    { type: 'cracks', style: 'fuse', density: 0.3 },
    { type: 'spikes', style: 'sparks', count: 4 },
  ]);
  assert.deepEqual(MONSTERS.boss.visual.parts, [
    { type: 'spikes', style: 'multi', count: 10 },
    { type: 'eyes', style: 'wide', count: 3 },
    { type: 'mouth', style: 'glow' },
  ]);
});

test('迁移数值与旧版一致（normal/fast/tank/boss）', () => {
  assert.deepEqual(
    (({ id, name, hp, speed, damage, coin, radius, knockbackResist, cost }) =>
      ({ id, name, hp, speed, damage, coin, radius, knockbackResist, cost }))(MONSTERS.boss),
    { id: 'boss', name: '守门Boss', hp: 7040, speed: 20, damage: 40, coin: 50, radius: 41, knockbackResist: 0.95, cost: 999 },
  );
  assert.equal(MONSTERS.normal.hp, 30);
  assert.equal(MONSTERS.fast.speed, 140);
  assert.equal(MONSTERS.tank.cost, 6);
});

test('自爆僵尸条目：behavior=exploder、aoe 30/80、cost 2', () => {
  const e = MONSTERS.exploder;
  assert.equal(e.behavior, 'exploder');
  assert.deepEqual(e.aoe, { damage: 30, radius: 80 });
  assert.equal(e.cost, 2);
});

test('boss 标记 special；playableMonsters 默认排除 special、includeSpecial 包含（图鉴界面数据源，设计 §4.1/§7）', () => {
  assert.equal(MONSTERS.boss.special, true);
  assert.ok(!MONSTERS.normal.special && !MONSTERS.exploder.special);
  assert.deepEqual(playableMonsters().map(m => m.id).sort(), ['exploder', 'fast', 'normal', 'tank']);
  assert.deepEqual(playableMonsters({ includeSpecial: true }).map(m => m.id).sort(),
    ['boss', 'exploder', 'fast', 'normal', 'tank']);
});

test('武器清单 7 条（6 迁移 + sniperRifle），必填字段契约齐全', () => {
  const ids = ['pistol', 'rifle', 'mg', 'rocket', 'grenade', 'tesla', 'sniperRifle'];
  assert.deepEqual(Object.keys(WEAPONS).sort(), [...ids].sort());
  for (const w of Object.values(WEAPONS)) {
    for (const f of ['id', 'name', 'desc', 'damage', 'fireRate', 'projectileSpeed', 'range',
      'projectiles', 'spread', 'pierce', 'aoe', 'arc', 'chain', 'knockback',
      'burst', 'burstInterval', 'basePrice', 'visual'])
      assert.ok(f in w, `${w.id} 缺必填字段 ${f}`);
    // 数值字段应为有限数值且 ≥ 0（arc 是布尔，不在其列）——Task 8 契约校验加固
    for (const f of ['damage', 'fireRate', 'projectileSpeed', 'range',
      'projectiles', 'spread', 'pierce', 'aoe', 'chain', 'knockback',
      'burst', 'burstInterval', 'basePrice'])
      assert.ok(Number.isFinite(w[f]) && w[f] >= 0, `${w.id}.${f} 应为有限数值且 ≥ 0`);
    for (const f of ['bulletShape', 'color', 'trail', 'hitParticles', 'muzzleGlow'])
      assert.ok(f in w.visual, `${w.id}.visual 缺 ${f}`);
  }
  // 迁移数值抽检 + 基价并入
  assert.equal(WEAPONS.pistol.damage, 12);
  assert.equal(WEAPONS.grenade.arc, true);
  assert.equal(WEAPONS.tesla.chain, 3);
  assert.equal(WEAPONS.pistol.basePrice, 40);
  assert.equal(WEAPONS.tesla.basePrice, 250);
  // 新武器：狙击枪（纯数值验证零代码新增）
  const s = WEAPONS.sniperRifle;
  assert.equal(s.damage, 60);
  assert.equal(s.pierce, 5);
  assert.equal(s.knockback, 200);
  assert.equal(s.basePrice, 200);
  // 专属维随图鉴迁入
  assert.deepEqual(SPECIAL_STATS, {
    grenade: ['fragCount', 'fragDamage'],
    tesla: ['chainLen', 'chainDmg'],
  });
});

test('武器局外升级价：round5(40×1.5^lv)，0→10 累计 4540', () => {
  assert.equal(weaponUpgradePrice(0), 40);
  assert.equal(weaponUpgradePrice(1), 60);
  assert.equal(weaponUpgradePrice(4), 205);
  assert.equal(weaponUpgradePrice(9), 1540);
  let sum = 0;
  for (let lv = 0; lv < 10; lv++) sum += weaponUpgradePrice(lv);
  assert.equal(sum, 4540);
});

test('难度表 weights 引用的怪物都存在（含无尽档 5 起的 exploder）', () => {
  for (const t of DIFFICULTY_TIERS)
    for (const id of Object.keys(t.weights)) assert.ok(MONSTERS[id], `档 ${t.tier} 引用未知怪物 ${id}`);
  for (const t of DIFFICULTY_TIERS.slice(4)) assert.ok(t.weights.exploder > 0, `档 ${t.tier} 应含 exploder`);
  assert.ok(MAX_ZOMBIE_R >= 41); // 不小于守门 Boss 半径
});

// —— 图鉴界面视图模型（设计 §7）——
test('怪物条目：未击杀 → ??? 占位；首次击杀 → 解锁（名称/描述/基础数值/累计击杀）', () => {
  const locked = monsterView(MONSTERS.exploder, {});
  assert.equal(locked.unlocked, false);
  assert.equal(locked.name, '???');
  const seen = monsterView(MONSTERS.exploder, { exploder: 1 });
  assert.equal(seen.unlocked, true);
  assert.equal(seen.name, '自爆僵尸');
  assert.equal(seen.kills, 1);
  assert.equal(seen.stats.hp, 40); // 图鉴基础值（关卡 1、局内 0 分钟口径）
});

test('武器条目：全部可见，携带局外等级与下一级提升', () => {
  const v = weaponView(WEAPONS.pistol, {});
  assert.equal(v.level, 0);
  assert.equal(v.maxed, false);
  assert.ok(Math.abs(v.nextDamage - 12 * 1.2) < 1e-9); // 每级 +20% 图鉴基础
  const maxed = weaponView(WEAPONS.pistol, { pistol: 10 });
  assert.equal(maxed.maxed, true);
});

function mockCtx() {
  const calls = [];
  return {
    calls,
    globalAlpha: 1,
    lineWidth: 1,
    shadowBlur: 0,
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    translate() { calls.push('translate'); },
    rotate() { calls.push('rotate'); },
    beginPath() { calls.push('beginPath'); },
    closePath() { calls.push('closePath'); },
    moveTo() { calls.push('moveTo'); },
    lineTo() { calls.push('lineTo'); },
    quadraticCurveTo() { calls.push('quadraticCurveTo'); },
    arc() { calls.push('arc'); },
    ellipse() { calls.push('ellipse'); },
    fill() { calls.push('fill'); },
    stroke() { calls.push('stroke'); },
    fillRect() { calls.push('fillRect'); },
    clearRect() { calls.push('clearRect'); },
    drawImage() { calls.push('drawImage'); },
    setLineDash() { calls.push('setLineDash'); },
  };
}

test('renderZombie 使用组合 visual，保留引信 lit、受击闪白与血条绘制', () => {
  const z = createZombie('exploder', 120, 80);
  z.fuse = 0.6;
  z.hitFlash = 0.05;
  z.hp = z.maxHp / 2;
  const ctx = mockCtx();
  assert.doesNotThrow(() => renderZombie(ctx, z, 1.25));
  assert.ok(ctx.calls.includes('fill'), '组合 body/parts 应填充');
  assert.ok(ctx.calls.includes('stroke'), '组合 body/parts 应描边');
  assert.ok(ctx.calls.includes('fillRect'), '受伤后血条应保留');
  assert.equal(z.alive, true);
  assert.equal(z.hp, z.maxHp / 2);
});

test('createZombie 为实体生成稳定视觉相位，不改变数值字段', () => {
  const first = createZombie('normal', 10, 20);
  const sameSeed = createZombie('normal', 10, 20);
  const otherSeed = createZombie('normal', 300, 400);
  assert.equal(first.visualPhase, sameSeed.visualPhase);
  assert.notEqual(first.visualPhase, otherSeed.visualPhase);
  assert.ok(Number.isFinite(first.visualPhase));
  assert.equal(first.hp, 30);
  assert.equal(first.speed, 70);
  assert.equal(first.damage, 8);
});

test('每个怪物的 visual.body 与 visual.parts[].type 都已注册', () => {
  for (const m of Object.values(MONSTERS)) {
    assert.ok(SHAPES[m.visual.body], `${m.id}.visual.body=${m.visual.body} 未注册`);
    for (const part of m.visual.parts)
      assert.ok(PARTS[part.type], `${m.id}.visual.parts[].type=${part.type} 未注册`);
  }
  for (const id of ['circle', 'triangle', 'hexagon', 'pentagon', 'diamond'])
    assert.ok(SHAPES[id], `${id} 基础形状缺失`);
  for (const id of ['eyes', 'mouth', 'cracks', 'trail', 'spikes'])
    assert.ok(PARTS[id], `${id} 怪物部件缺失`);
});

function mockUiCtx() {
  return {
    globalAlpha: 1,
    lineWidth: 1,
    shadowBlur: 0,
    save() {}, restore() {}, translate() {}, rotate() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, arc() {}, ellipse() {},
    fill() {}, stroke() {}, fillRect() {}, clearRect() {}, drawImage() {},
    setLineDash() {},
  };
}

function mockCanvas() {
  const ctx = mockUiCtx();
  return {
    width: 0,
    height: 0,
    style: {},
    className: '',
    getContext() { return ctx; },
    setAttribute() {},
    toDataURL() { return 'data:image/png;base64,placeholder'; },
  };
}

function mockBestiaryDom() {
  const handlers = new Map();
  const root = {
    _html: '',
    _replaced: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    set innerHTML(value) {
      this._html = value;
      this._replaced = [];
    },
    get innerHTML() { return this._html; },
    querySelector(selector) {
      if (selector.startsWith('#')) {
        return {
          addEventListener: (_event, handler) => handlers.set(selector, handler),
        };
      }
      const match = selector.match(/\[data-visual-slot="([^"]+)"\]/);
      if (match) {
        return {
          replaceWith: node => this._replaced.push({ slot: match[1], node }),
        };
      }
      return null;
    },
  };
  const documentMock = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return mockCanvas();
    },
  };
  return { root, documentMock, handlers };
}

test('图鉴视图：未遭遇不泄露 visual，已遭遇返回配置中的同源 visual', () => {
  const locked = monsterView(MONSTERS.exploder, {});
  assert.equal(locked.unlocked, false);
  assert.equal('visual' in locked, false);
  assert.equal('color' in locked, false);
  assert.equal('parts' in locked, false);

  const seen = monsterView(MONSTERS.exploder, { exploder: 1 });
  assert.equal(seen.unlocked, true);
  assert.strictEqual(seen.visual, MONSTERS.exploder.visual);
  assert.equal(seen.visual.body, 'diamond');
  assert.equal(seen.visual.parts[0].type, 'cracks');
});

test('武器图鉴视图使用武器本体 icon，不暴露弹道 color 作为图标', () => {
  for (const w of Object.values(WEAPONS)) {
    assert.equal(w.icon, `icon.weapon.${w.id}`, `${w.id}.icon`);
    const view = weaponView(w, {});
    assert.equal(view.icon, w.icon);
    assert.equal('color' in view, false);
  }
});

test('图鉴通过 getVisualCanvas 使用 24/32/48/64 档位，卡片不再生成 swatch', () => {
  assert.deepEqual(BESTIARY_VISUAL_SIZES, [24, 32, 48, 64]);
  const { root, documentMock, handlers } = mockBestiaryDom();
  const previousDocument = globalThis.document;
  globalThis.document = documentMock;
  clearCaches();
  try {
    for (const size of BESTIARY_VISUAL_SIZES) {
      const canvas = getVisualCanvas('normal', size, { visual: MONSTERS.normal.visual });
      assert.equal(canvas.width, size);
      assert.equal(canvas.height, size);
    }
    showBestiary(root, {
      bestiaryKills: { normal: 1 },
      weaponLevels: {},
    }, () => {});
    assert.doesNotMatch(root.innerHTML, /bestiary-swatch/);
    assert.match(root.innerHTML, /data-visual-slot="monster-normal"/);
    assert.ok(root._replaced.some(({ slot, node }) =>
      slot === 'monster-normal' && node.width === 48 && node.height === 48));
    assert.doesNotMatch(root.innerHTML, /data-visual-slot="monster-exploder"/);
    assert.equal(root._replaced.some(({ slot }) => slot === 'monster-exploder'), false);

    handlers.get('#bestiary-tab-weapons')();
    assert.doesNotMatch(root.innerHTML, /bestiary-swatch/);
    assert.ok(root._replaced.some(({ slot, node }) =>
      slot === 'weapon-pistol' && node.width === 48 && node.height === 48));
  } finally {
    clearCaches();
    globalThis.document = previousDocument;
  }
});

test('图鉴卡片采用单行横滚容器 .bestiary-row，保留怪物与武器卡片结构', () => {
  const { root, documentMock, handlers } = mockBestiaryDom();
  const previousDocument = globalThis.document;
  globalThis.document = documentMock;
  clearCaches();
  try {
    showBestiary(root, {
      bestiaryKills: { normal: 3 },
      weaponLevels: { pistol: 2 },
    }, () => {});

    // 断言单行容器类名
    assert.match(root.innerHTML, /class="[^"]*bestiary-row[^"]*"/, '必须使用单行横滚容器 .bestiary-row');
    // 怪物卡片与结构保留
    assert.match(root.innerHTML, /class="card bestiary-card"/);
    assert.match(root.innerHTML, /累计击杀 3/);
    assert.match(root.innerHTML, /<h4>\?\?\?<\/h4>/, '未解锁怪物显示 ???');

    // 切换到武器 tab
    handlers.get('#bestiary-tab-weapons')();
    assert.match(root.innerHTML, /class="[^"]*bestiary-row[^"]*"/, '武器 tab 也使用单行横滚容器 .bestiary-row');
    assert.match(root.innerHTML, /局外等级 Lv 2\/10/);
  } finally {
    clearCaches();
    globalThis.document = previousDocument;
  }
});

test('新增仅复用已注册部件的怪物配置时，图鉴与游戏内渲染无需新增分支', () => {
  const extension = {
    id: 'scout',
    name: '侦察僵尸',
    desc: '只复用既有眼睛与嘴部部件的扩展条目。',
    hp: 25, speed: 100, damage: 7, coin: 2,
    radius: 12, knockbackResist: 0.1, cost: 2,
    visual: {
      body: 'circle', scale: 0.95,
      palette: { fill: 'ground', stroke: 'neon', glow: 'neonDim' },
      parts: [
        { type: 'eyes', style: 'angry', count: 2 },
        { type: 'mouth', style: 'crooked' },
      ],
    },
    behavior: null,
  };
  MONSTERS.scout = extension;
  const { root, documentMock } = mockBestiaryDom();
  const previousDocument = globalThis.document;
  globalThis.document = documentMock;
  clearCaches();
  try {
    assert.ok(playableMonsters({ includeSpecial: true }).some(m => m.id === 'scout'));
    const view = monsterView(extension, { scout: 2 });
    assert.equal(view.unlocked, true);
    assert.strictEqual(view.visual, extension.visual);
    showBestiary(root, { bestiaryKills: { scout: 2 }, weaponLevels: {} }, () => {});
    assert.ok(root._replaced.some(({ slot }) => slot === 'monster-scout'));

    const ctx = mockUiCtx();
    const z = { type: 'scout', x: 0, y: 0, r: 12, hp: 25, maxHp: 25, hitFlash: 0, visualPhase: 0 };
    assert.doesNotThrow(() => renderZombie(ctx, z, 1));
  } finally {
    clearCaches();
    globalThis.document = previousDocument;
    delete MONSTERS.scout;
  }
});
