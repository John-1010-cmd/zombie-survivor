// test/map.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { circleHit, circleRectHit } from '../src/core/physics.js';
import {
  generateMap, MAP_SIZE, hashId, obstacleVariant,
  ROCK_VARIANT_COUNT, RECT_VARIANT_COUNT, obstacleVisualId, obstacleSpriteId,
  renderObstacle, renderShop,
  SHOP_INTERACT_R, shopPulseState, SUPPLY_STATION_VISUAL_ID, SHOP_LABEL,
  TERRAIN_TILE_SIZE, createTerrainRenderer,
} from '../src/systems/map.js';
import { clearCaches, registerImage, preloadVisuals } from '../src/core/visuals.js';
import { PALETTE } from '../src/config/palette.js';
import { createGameScene } from '../src/game.js';

const SHOP_POSITIONS = [[750, 750], [2250, 750], [750, 2250], [2250, 2250], [1500, 1150]];
const SHOP_R = 46;
const MIN_GAP = 150;

function boundsOf(o) {
  return o.kind === 'circle' ? { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 } : o;
}

function bboxOverlap(a, b, gap) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
         a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

test('生成 60 个障碍，同种子可复现', () => {
  const a = generateMap(mulberry32(1));
  const b = generateMap(mulberry32(1));
  assert.equal(a.obstacles.length, 60);
  assert.deepEqual(a.obstacles, b.obstacles);
  assert.equal(a.size, MAP_SIZE);
  assert.deepEqual(a.spawn, { x: MAP_SIZE / 2, y: MAP_SIZE / 2 });
});

test('出生点半径 200 内无障碍', () => {
  const m = generateMap(mulberry32(2));
  for (const o of m.obstacles) {
    const b = boundsOf(o);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    assert.ok(Math.hypot(cx - m.spawn.x, cy - m.spawn.y) >= 200);
  }
});

test('障碍两两包围盒膨胀 150 后不相交', () => {
  const m = generateMap(mulberry32(3));
  const bs = m.obstacles.map(boundsOf);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    assert.equal(bboxOverlap(bs[i], bs[j], MIN_GAP), false, `障碍 ${i} 与 ${j} 间距不足`);
  }
});

test('5 座商店位置固定且字段完整', () => {
  const m = generateMap(mulberry32(4));
  assert.equal(m.shops.length, 5);
  for (let i = 0; i < m.shops.length; i++) {
    const s = m.shops[i];
    assert.deepEqual([s.x, s.y], SHOP_POSITIONS[i]);
    assert.equal(s.r, SHOP_R);
    assert.equal(s.interactR, SHOP_INTERACT_R);
  }
});

test('障碍物避开商店（包围盒膨胀 150 不相交）', () => {
  const m = generateMap(mulberry32(5));
  const shopBoxes = m.shops.map(boundsOf);
  for (const o of m.obstacles) {
    const a = boundsOf(o);
    for (const b of shopBoxes) {
      assert.equal(bboxOverlap(a, b, MIN_GAP), false, '障碍与商店间距不足');
    }
  }
});

test('40 枚预撒银币（value=1）均不落在障碍内也不在商店内', () => {
  const m = generateMap(mulberry32(6));
  assert.equal(m.scatteredCoins.length, 40);
  for (const c of m.scatteredCoins) {
    assert.equal(c.value, 1);
    for (const o of m.obstacles) {
      if (o.kind === 'circle') assert.equal(circleHit(c.x, c.y, 8, o.x, o.y, o.r), false);
      else assert.equal(circleRectHit(c.x, c.y, 8, o), false);
    }
    for (const s of m.shops) {
      assert.equal(circleHit(c.x, c.y, 8, s.x, s.y, s.r), false);
    }
  }
});

test('障碍物有稳定 id，hash(id) 选择固定变体且圆/矩形数量扩展为 3/4 变体', () => {
  const a = generateMap(mulberry32(7));
  const b = generateMap(mulberry32(7));
  assert.equal(ROCK_VARIANT_COUNT, 3);
  assert.equal(RECT_VARIANT_COUNT, 4);
  assert.deepEqual(
    a.obstacles.map(o => o.id),
    Array.from({ length: 60 }, (_, i) => 'obstacle-' + i),
  );
  assert.deepEqual(
    a.obstacles.map(o => ({ id: o.id, kind: o.kind, variant: o.variant })),
    b.obstacles.map(o => ({ id: o.id, kind: o.kind, variant: o.variant })),
  );
  for (const o of a.obstacles) {
    const count = o.kind === 'circle' ? ROCK_VARIANT_COUNT : RECT_VARIANT_COUNT;
    assert.equal(o.variant, hashId(o.id) % count, `${o.id} 变体不是 hash(id) 结果`);
    assert.ok(o.variant >= 0 && o.variant < count);
    assert.equal(obstacleVariant(o.id, o.kind), o.variant);
  }
});

test('障碍物新增视觉字段但碰撞字段与视觉 id 映射不变，四变体新契约正确映射车辆/混凝土与对应精灵 id', () => {
  const m = generateMap(mulberry32(8));
  for (const o of m.obstacles) {
    assert.equal(typeof o.id, 'string');
    assert.equal(typeof o.variant, 'number');
    if (o.kind === 'circle') {
      assert.equal(typeof o.x, 'number');
      assert.equal(typeof o.y, 'number');
      assert.equal(typeof o.r, 'number');
      assert.equal('w' in o, false);
      assert.equal(obstacleVisualId(o), 'scene.rock');
      assert.equal(obstacleSpriteId({ ...o, variant: 0 }), 'scene.obstacle.rock.0');
      assert.equal(obstacleSpriteId({ ...o, variant: 1 }), 'scene.obstacle.rock.1');
      assert.equal(obstacleSpriteId({ ...o, variant: 2 }), 'scene.obstacle.rock.2');
    } else {
      assert.equal(typeof o.x, 'number');
      assert.equal(typeof o.y, 'number');
      assert.equal(typeof o.w, 'number');
      assert.equal(typeof o.h, 'number');
      assert.equal('r' in o, false);
      assert.equal(obstacleVisualId({ ...o, variant: 0 }), 'scene.vehicle');
      assert.equal(obstacleVisualId({ ...o, variant: 1 }), 'scene.vehicle');
      assert.equal(obstacleVisualId({ ...o, variant: 2 }), 'scene.concrete');
      assert.equal(obstacleVisualId({ ...o, variant: 3 }), 'scene.concrete');
      assert.equal(obstacleSpriteId({ ...o, variant: 0 }), 'scene.obstacle.vehicle.0');
      assert.equal(obstacleSpriteId({ ...o, variant: 1 }), 'scene.obstacle.vehicle.1');
      assert.equal(obstacleSpriteId({ ...o, variant: 2 }), 'scene.obstacle.concrete.0');
      assert.equal(obstacleSpriteId({ ...o, variant: 3 }), 'scene.obstacle.concrete.1');
    }
  }
});

test('霓虹补给站保持 5 座与 90px 交互半径，提示使用图标短标签', () => {
  const m = generateMap(mulberry32(9));
  assert.equal(m.shops.length, 5);
  for (const s of m.shops) assert.equal(s.interactR, SHOP_INTERACT_R);
  assert.equal(SHOP_INTERACT_R, 90);
  assert.equal(SUPPLY_STATION_VISUAL_ID, 'scene.supplyStation');
  assert.equal(SHOP_LABEL, 'SUPPLY');
});

test('补给站交互光环只改变 alpha/scale，90px 边界仍为严格小于', () => {
  const idle = shopPulseState(0, 90, SHOP_INTERACT_R);
  const active = shopPulseState(0, 89, SHOP_INTERACT_R);
  const peak = shopPulseState(Math.PI / 8, 0, SHOP_INTERACT_R);
  assert.equal(idle.active, false);
  assert.equal(active.active, true);
  assert.ok(Math.abs(active.alpha - 0.25) < 1e-12);
  assert.ok(Math.abs(active.scale - 1.025) < 1e-12);
  assert.ok(Math.abs(peak.alpha - 0.34) < 1e-12);
  assert.ok(Math.abs(peak.scale - 1.05) < 1e-12);
  assert.notEqual(active.scale, peak.scale);
});

function makeMockContext() {
  const calls = [];
  return {
    calls,
    beginPath() { calls.push(['beginPath']); },
    arc(...args) { calls.push(['arc', ...args]); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    closePath() { calls.push(['closePath']); },
    fill() { calls.push(['fill']); },
    stroke() { calls.push(['stroke']); },
    fillRect(...args) { calls.push(['fillRect', ...args]); },
    strokeRect(...args) { calls.push(['strokeRect', ...args]); },
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(...args) { calls.push(['translate', ...args]); },
    drawImage(...args) { calls.push(['drawImage', ...args]); },
    fillText(...args) { calls.push(['fillText', ...args]); },
  };
}

class FakeImage {
  static instances = [];
  constructor() {
    FakeImage.instances.push(this);
  }
  set src(url) {
    this.url = url;
    queueMicrotask(() => this.onload?.());
  }
  decode() {
    return Promise.resolve();
  }
}

test('未就绪/未注册时障碍物与补给站走程序化 fallback 路径，不调用 drawImage', () => {
  clearCaches();

  // 1. 岩石回退
  const ctxRock = makeMockContext();
  renderObstacle(ctxRock, { kind: 'circle', x: 100, y: 120, r: 35, variant: 0 });
  const drawCallsRock = ctxRock.calls.filter(([name]) => name === 'drawImage');
  const fillCallsRock = ctxRock.calls.filter(([name]) => name === 'fill');
  assert.equal(drawCallsRock.length, 0, '未就绪不得调用 drawImage');
  assert.ok(fillCallsRock.length >= 1, '程序化岩石 fill 必须被调用');

  // 2. 车辆回退
  const ctxVehicle = makeMockContext();
  renderObstacle(ctxVehicle, { kind: 'rect', x: 200, y: 250, w: 80, h: 50, variant: 0 });
  const drawCallsVeh = ctxVehicle.calls.filter(([name]) => name === 'drawImage');
  const fillRectCallsVeh = ctxVehicle.calls.filter(([name]) => name === 'fillRect');
  assert.equal(drawCallsVeh.length, 0);
  assert.ok(fillRectCallsVeh.length >= 1, '程序化车辆 fillRect 必须被调用');

  // 3. 混凝土回退
  const ctxConcrete = makeMockContext();
  renderObstacle(ctxConcrete, { kind: 'rect', x: 200, y: 250, w: 80, h: 50, variant: 2 });
  const drawCallsConc = ctxConcrete.calls.filter(([name]) => name === 'drawImage');
  const strokeCallsConc = ctxConcrete.calls.filter(([name]) => name === 'stroke');
  assert.equal(drawCallsConc.length, 0);
  assert.ok(strokeCallsConc.length >= 1, '程序化混凝土裂缝 stroke 必须被调用');

  // 4. 补给站回退
  const ctxShop = makeMockContext();
  renderShop(ctxShop, { x: 750, y: 750, r: 46, interactR: 90 }, { x: 700, y: 700 }, 0);
  const drawCallsShop = ctxShop.calls.filter(([name]) => name === 'drawImage');
  const arcCallsShop = ctxShop.calls.filter(([name]) => name === 'arc');
  const fillRectShop = ctxShop.calls.filter(([name]) => name === 'fillRect');
  const fillTextShop = ctxShop.calls.filter(([name]) => name === 'fillText');
  assert.equal(drawCallsShop.length, 0);
  assert.ok(arcCallsShop.length >= 1, '光环 arc 必须绘制');
  assert.ok(fillRectShop.length >= 1, '程序化棚屋 fillRect 必须绘制');
  assert.ok(fillTextShop.some(c => c[1] === 'SUPPLY'), 'SUPPLY 标签必须绘制');
});

test('图像就绪时进入混合渲染贴图路径：精确断言到达 drawImage 的实参（源图、坐标、宽高），程序化填充被跳过', async () => {
  const originalImage = globalThis.Image;
  try {
    globalThis.Image = FakeImage;
    clearCaches();

    registerImage('scene.obstacle.rock.0', 'assets/img/scene/obstacles/rock-0.png');
    registerImage('scene.obstacle.vehicle.1', 'assets/img/scene/obstacles/vehicle-1.png');
    registerImage('scene.obstacle.concrete.1', 'assets/img/scene/obstacles/concrete-1.png');
    registerImage('scene.supplyStation', 'assets/img/scene/supply-station.png');
    await preloadVisuals();

    // 1. 岩石贴图
    const ctxRock = makeMockContext();
    renderObstacle(ctxRock, { kind: 'circle', x: 150, y: 160, r: 35, variant: 0 });
    const drawCallsRock = ctxRock.calls.filter(([name]) => name === 'drawImage');
    const fillCallsRock = ctxRock.calls.filter(([name]) => name === 'fill');
    assert.equal(drawCallsRock.length, 1, '就绪后必须调用 1 次 drawImage');
    assert.equal(drawCallsRock[0][1].url, 'assets/img/scene/obstacles/rock-0.png', '源图必须为 rock.0');
    assert.equal(drawCallsRock[0][2], -35, '居中 x 坐标应为 -r');
    assert.equal(drawCallsRock[0][3], -35, '居中 y 坐标应为 -r');
    assert.equal(drawCallsRock[0][4], 70, '宽度应为 2r');
    assert.equal(drawCallsRock[0][5], 70, '高度应为 2r');
    assert.equal(fillCallsRock.length, 0, '有图贴图时不得再执行程序化 fill');

    // 2. 车辆贴图（variant 1）
    const ctxVehicle = makeMockContext();
    renderObstacle(ctxVehicle, { kind: 'rect', x: 200, y: 220, w: 90, h: 56, variant: 1 });
    const drawCallsVeh = ctxVehicle.calls.filter(([name]) => name === 'drawImage');
    const fillRectVeh = ctxVehicle.calls.filter(([name]) => name === 'fillRect');
    assert.equal(drawCallsVeh.length, 1);
    assert.equal(drawCallsVeh[0][1].url, 'assets/img/scene/obstacles/vehicle-1.png');
    assert.equal(drawCallsVeh[0][2], -45, '居中 x 坐标应为 -w*0.5');
    assert.equal(drawCallsVeh[0][3], -28, '居中 y 坐标应为 -h*0.5');
    assert.equal(drawCallsVeh[0][4], 90, '宽应为 w');
    assert.equal(drawCallsVeh[0][5], 56, '高应为 h');
    assert.equal(fillRectVeh.length, 0, '有图贴图时不得再执行程序化 fillRect');

    // 3. 混凝土贴图（variant 3 -> concrete.1）
    const ctxConcrete = makeMockContext();
    renderObstacle(ctxConcrete, { kind: 'rect', x: 300, y: 320, w: 84, h: 52, variant: 3 });
    const drawCallsConc = ctxConcrete.calls.filter(([name]) => name === 'drawImage');
    const fillRectConc = ctxConcrete.calls.filter(([name]) => name === 'fillRect');
    assert.equal(drawCallsConc.length, 1);
    assert.equal(drawCallsConc[0][1].url, 'assets/img/scene/obstacles/concrete-1.png');
    assert.equal(drawCallsConc[0][2], -42);
    assert.equal(drawCallsConc[0][3], -26);
    assert.equal(drawCallsConc[0][4], 84);
    assert.equal(drawCallsConc[0][5], 52);
    assert.equal(fillRectConc.length, 0, '有图贴图时不得再执行程序化 fillRect');

    // 4. 补给站贴图（光环与标签保留，主体贴图）
    const ctxShop = makeMockContext();
    renderShop(ctxShop, { x: 750, y: 750, r: 46, interactR: 90 }, { x: 700, y: 700 }, 0);
    const drawCallsShop = ctxShop.calls.filter(([name]) => name === 'drawImage');
    const arcCallsShop = ctxShop.calls.filter(([name]) => name === 'arc');
    const fillRectShop = ctxShop.calls.filter(([name]) => name === 'fillRect');
    const fillTextShop = ctxShop.calls.filter(([name]) => name === 'fillText');
    assert.equal(drawCallsShop.length, 1);
    assert.equal(drawCallsShop[0][1].url, 'assets/img/scene/supply-station.png');
    assert.equal(drawCallsShop[0][2], -46);
    assert.equal(drawCallsShop[0][3], -46);
    assert.equal(drawCallsShop[0][4], 92);
    assert.equal(drawCallsShop[0][5], 92);
    assert.ok(arcCallsShop.length >= 1, '光环 arc 必须保留');
    assert.equal(fillRectShop.length, 0, '主体贴图后程序化棚屋 fillRect 必须被跳过');
    assert.deepEqual(fillTextShop[0], ['fillText', 'SUPPLY', 750, 750 + 46 + 18], 'SUPPLY 标签必须保留');
  } finally {
    clearCaches();
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});

function fakeTileFactory(counter) {
  return size => {
    counter.count++;
    const tileCtx = {
      fillStyle: '',
      globalAlpha: 1,
      fillRect() { counter.fillRectCount++; },
      drawImage(source, ...args) { counter.textureDraws.push({ source, args }); },
    };
    return {
      width: size,
      height: size,
      getContext: () => tileCtx,
    };
  };
}

const TERRAIN_PALETTE = {
  ground: '#101810',
  obstacle: '#303840',
  neon: '#5eff8a',
  neonDim: '#2a4a3a',
};

test('地形 tile 在初始化后只生成一次，draw 按可见范围平铺缓存合成 tile 且不逐帧重建', () => {
  assert.equal(TERRAIN_TILE_SIZE, 128);
  const counter = { count: 0, fillRectCount: 0, textureDraws: [] };
  const cachedTexture = { id: 'scene.terrain.grass' };
  const renderer = createTerrainRenderer({
    palette: TERRAIN_PALETTE,
    canvasFactory: fakeTileFactory(counter),
    imageLoader: id => id === 'scene.terrain.grass' ? cachedTexture : null,
  });
  const target = {
    drawImageSources: [],
    drawImage(source, ...args) { this.drawImageSources.push({ source, args }); },
  };
  const viewport = { x: 0, y: 0, width: 256, height: 128 };
  renderer.draw(target, viewport);
  renderer.draw(target, viewport);
  assert.equal(counter.count, 1);
  assert.equal(renderer.getBuildCount(), 1);
  assert.equal(target.drawImageSources.length, 4);
  assert.equal(counter.textureDraws.length, 1);
  assert.equal(counter.textureDraws[0].source, cachedTexture);
  assert.deepEqual(counter.textureDraws[0].args, [0, 0, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE]);
  assert.ok(target.drawImageSources.every(item => item.source === renderer.getTile()));
  assert.equal(renderer.getTile().width, TERRAIN_TILE_SIZE);
});

test('地形 palette 变化只触发一次重建，连续 draw 不重复生成', () => {
  const counter = { count: 0, fillRectCount: 0, textureDraws: [] };
  const cachedTexture = { id: 'scene.terrain.grass' };
  const palette = { ...TERRAIN_PALETTE };
  const renderer = createTerrainRenderer({
    palette,
    canvasFactory: fakeTileFactory(counter),
    imageLoader: () => cachedTexture,
  });
  const target = { drawImage() {} };
  const viewport = { x: 64, y: 64, width: 64, height: 64 };
  renderer.draw(target, viewport);
  palette.ground = '#182018';
  renderer.draw(target, viewport);
  renderer.draw(target, viewport);
  assert.equal(counter.count, 2);
  assert.equal(counter.textureDraws.length, 2);
  assert.equal(renderer.getBuildCount(), 2);
  renderer.invalidate();
  renderer.draw(target, viewport);
  assert.equal(counter.count, 3);
  assert.equal(counter.textureDraws.length, 3);
});

test('地形图片未就绪时回退到纯色基底，不尝试绘制未缓存纹理', () => {
  const counter = { count: 0, fillRectCount: 0, textureDraws: [] };
  const renderer = createTerrainRenderer({
    palette: TERRAIN_PALETTE,
    canvasFactory: fakeTileFactory(counter),
    imageLoader: () => null,
  });
  renderer.draw({ drawImage() {} }, { x: 0, y: 0, width: 64, height: 64 });
  assert.equal(counter.count, 1);
  assert.equal(counter.textureDraws.length, 0);
  assert.ok(counter.fillRectCount >= 1);
});

test('场景渲染使用 PALETTE.boundary 与 PALETTE.neon 绘制霓虹边界且线宽为 6', () => {
  const strokeRectCalls = [];
  const mockCtx = {
    save() {},
    restore() {},
    translate() {},
    fillRect() {},
    strokeRect(...args) {
      strokeRectCalls.push({
        args,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        shadowColor: this.shadowColor,
        shadowBlur: this.shadowBlur,
      });
    },
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    setLineDash() {},
    fillText() {},
  };
  const scene = createGameScene({
    canvas: { width: 800, height: 600, getContext: () => null },
    input: { state: {} },
    mode: 'endless',
    audio: null,
    settings: {},
    meta: null,
    onGameOver: () => {},
  });
  scene.render(mockCtx);
  const boundaryCall = strokeRectCalls.find(c =>
    c.args[0] === 0 && c.args[1] === 0 && c.args[2] === MAP_SIZE && c.args[3] === MAP_SIZE,
  );
  assert.ok(boundaryCall, '必须有边界 strokeRect 调用');
  assert.equal(boundaryCall.strokeStyle, PALETTE.boundary);
  assert.equal(boundaryCall.shadowColor, PALETTE.neon);
  assert.equal(boundaryCall.shadowBlur, 10);
  assert.equal(boundaryCall.lineWidth, 6);
});
