import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS } from '../src/config/skins.js';

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
  assert.deepEqual(SKINS.wastelandAdventurer, {
    id: 'wastelandAdventurer',
    name: '荒野冒险家',
    portrait: 'skin.wastelandAdventurer.portrait',
    sprite: 'skin.wastelandAdventurer.sprite',
    frameSize: 128,
    directions: ['down', 'left', 'right', 'up'],
    framesPerDirection: 2,
    price: { currency: 'gold', amount: 0 },
    description: '在废土中寻找补给与出路的可靠冒险家。',
  });
});

test('付费皮肤注册表默认价格为 800 与 1500 金币', () => {
  assert.equal(SKINS.neonMercenary.price.amount, 800);
  assert.equal(SKINS.nightHunter.price.amount, 1500);
  assert.equal(SKINS.neonMercenary.price.currency, 'gold');
  assert.equal(SKINS.nightHunter.price.currency, 'gold');
});
