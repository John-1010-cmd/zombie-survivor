import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMeta } from '../src/core/meta.js';
import { SKINS } from '../src/config/skins.js';
import { skinView, applySkinAction } from '../src/ui/skins.js';

function metaWithGold(gold) {
  const meta = defaultMeta();
  meta.gold = gold;
  return meta;
}

test('skinView：默认皮肤显示拥有、使用中、免费和立绘 ID', () => {
  const meta = defaultMeta();
  const view = skinView(SKINS.wastelandAdventurer, meta);
  assert.deepEqual(view, {
    id: 'wastelandAdventurer',
    name: '荒野冒险家',
    description: '在废土中寻找补给与出路的可靠冒险家。',
    portrait: 'skin.wastelandAdventurer.portrait',
    owned: true,
    selected: true,
    price: { currency: 'gold', amount: 0 },
    balance: 0,
    action: '使用中',
    disabled: true,
    affordable: true,
  });
});

test('skinView：未拥有皮肤显示解锁、价格和当前余额', () => {
  const meta = metaWithGold(900);
  const view = skinView(SKINS.neonMercenary, meta);
  assert.equal(view.owned, false);
  assert.equal(view.selected, false);
  assert.equal(view.action, '解锁');
  assert.equal(view.disabled, false);
  assert.equal(view.affordable, true);
  assert.equal(view.balance, 900);
  assert.deepEqual(view.price, { currency: 'gold', amount: 800 });
});

test('购买失败：金币不足不扣款、不加入 owned、不改变 selected', () => {
  const meta = metaWithGold(799);
  const result = applySkinAction(meta, 'neonMercenary');
  assert.deepEqual(result, {
    ok: false,
    reason: 'insufficient-gold',
    skinId: 'neonMercenary',
  });
  assert.equal(meta.gold, 799);
  assert.deepEqual(meta.skins, {
    owned: ['wastelandAdventurer'],
    selected: 'wastelandAdventurer',
  });
});

test('购买成功：按注册表价格扣金币、加入 owned 并自动选中', () => {
  const meta = metaWithGold(800);
  const result = applySkinAction(meta, 'neonMercenary');
  assert.deepEqual(result, {
    ok: true,
    action: 'purchased',
    skinId: 'neonMercenary',
  });
  assert.equal(meta.gold, 0);
  assert.deepEqual(meta.skins, {
    owned: ['wastelandAdventurer', 'neonMercenary'],
    selected: 'neonMercenary',
  });
});

test('已有皮肤选用：只改变 selected，不改变金币和 owned', () => {
  const meta = metaWithGold(17);
  meta.skins.owned.push('nightHunter');
  const beforeOwned = [...meta.skins.owned];
  const result = applySkinAction(meta, 'nightHunter');
  assert.deepEqual(result, {
    ok: true,
    action: 'selected',
    skinId: 'nightHunter',
  });
  assert.equal(meta.gold, 17);
  assert.deepEqual(meta.skins.owned, beforeOwned);
  assert.equal(meta.skins.selected, 'nightHunter');
});
