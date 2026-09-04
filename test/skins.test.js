import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS } from '../src/config/skins.js';
import { ASSET_BY_ID } from '../src/config/assets.js';

test('首发皮肤清单与 schema 完整', () => {
  assert.deepEqual(Object.keys(SKINS).sort(), [
    'neonMercenary',
    'nightHunter',
    'wastelandAdventurer',
  ]);
  for (const skin of Object.values(SKINS)) {
    assert.equal(typeof skin.id, 'string');
    assert.equal(typeof skin.name, 'string');
    assert.equal(typeof skin.portrait, 'string');
    assert.equal(typeof skin.sprite, 'string');
    assert.equal(skin.frameSize, 128);
    assert.deepEqual(skin.directions, ['down', 'left', 'right', 'up']);
    assert.equal(skin.framesPerDirection, 2);
    assert.deepEqual(Object.keys(skin.price).sort(), ['amount', 'currency']);
    assert.equal(skin.price.currency, 'gold');
    assert.ok(Number.isInteger(skin.price.amount) && skin.price.amount >= 0);
    assert.equal(typeof skin.description, 'string');
    assert.ok(skin.description.length > 0);
    assert.equal(SKINS[skin.id], skin);
  }
});

test('荒野冒险家免费且是默认皮肤', () => {
  assert.equal(SKINS.wastelandAdventurer.price.amount, 0);
  assert.equal(SKINS.wastelandAdventurer.price.currency, 'gold');
  assert.equal(SKINS.wastelandAdventurer.portrait, 'skin.wastelandAdventurer.portrait');
  assert.equal(SKINS.wastelandAdventurer.sprite, 'skin.wastelandAdventurer.sprite');
});

test('付费皮肤注册表默认价格为 800 与 1500 金币', () => {
  assert.equal(SKINS.neonMercenary.price.amount, 800);
  assert.equal(SKINS.nightHunter.price.amount, 1500);
});

test('每款皮肤都有 128px portrait crop 和 512x256 八帧 sprite manifest', () => {
  const pathById = {
    wastelandAdventurer: 'assets/img/skins/wasteland-adventurer/sprite.png',
    neonMercenary: 'assets/img/skins/neon-mercenary/sprite.png',
    nightHunter: 'assets/img/skins/night-hunter/sprite.png',
  };
  const expectedFrameOrder = [
    { direction: 'down', frame: 0, x: 0, y: 0, width: 128, height: 128 },
    { direction: 'left', frame: 0, x: 128, y: 0, width: 128, height: 128 },
    { direction: 'right', frame: 0, x: 256, y: 0, width: 128, height: 128 },
    { direction: 'up', frame: 0, x: 384, y: 0, width: 128, height: 128 },
    { direction: 'down', frame: 1, x: 0, y: 128, width: 128, height: 128 },
    { direction: 'left', frame: 1, x: 128, y: 128, width: 128, height: 128 },
    { direction: 'right', frame: 1, x: 256, y: 128, width: 128, height: 128 },
    { direction: 'up', frame: 1, x: 384, y: 128, width: 128, height: 128 },
  ];
  for (const skin of Object.values(SKINS)) {
    const sprite = ASSET_BY_ID[skin.sprite];
    const portrait = ASSET_BY_ID[skin.portrait];
    assert.ok(sprite, `${skin.id}.sprite manifest 缺失`);
    assert.ok(portrait, `${skin.id}.portrait manifest 缺失`);
    assert.equal(sprite.path, pathById[skin.id]);
    assert.equal(portrait.path, pathById[skin.id]);
    assert.equal(sprite.size, 128);
    assert.equal(portrait.size, 128);
    assert.equal(sprite.promptVersion, 'neon-cel-v1');
    assert.equal(portrait.promptVersion, 'neon-cel-v1');
    assert.deepEqual(sprite.atlas, {
      width: 512,
      height: 256,
      frameSize: 128,
      columns: 4,
      rows: 2,
      frameOrder: expectedFrameOrder,
    });
    assert.deepEqual(portrait.crop, { x: 0, y: 0, width: 128, height: 128 });
  }
});

test('manifest ID 与 skins.js 的 portrait/sprite 引用一一对应', () => {
  for (const skin of Object.values(SKINS)) {
    assert.equal(ASSET_BY_ID[skin.portrait].id, skin.portrait);
    assert.equal(ASSET_BY_ID[skin.sprite].id, skin.sprite);
  }
});
