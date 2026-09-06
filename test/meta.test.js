import test from 'node:test';
import assert from 'node:assert/strict';
import {
  META_VERSION, defaultMeta, loadMeta, saveMeta,
  addGold, spendGold, weaponLevel, recordKill, recordAdventureResult,
} from '../src/core/meta.js';

function setFakeStorage(raw) {
  const store = new Map(Object.entries(raw));
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
  return store;
}
function clearFakeStorage() {
  delete globalThis.localStorage;
}

test('defaultMeta 结构定稿（version 2 + 默认皮肤）', () => {
  clearFakeStorage();
  assert.equal(META_VERSION, 2);
  assert.deepEqual(defaultMeta(), {
    version: 2,
    gold: 0,
    weaponLevels: {},
    adventure: { unlocked: 1, firstClear: {}, bestTimes: {} },
    bestiaryKills: {},
    skins: {
      owned: ['wastelandAdventurer'],
      selected: 'wastelandAdventurer',
    },
  });
});

test('金币收支：addGold 累加；spendGold 余额不足返回 false 不扣款', () => {
  const m = defaultMeta();
  addGold(m, 200);
  assert.equal(m.gold, 200);
  assert.equal(spendGold(m, 150), true);
  assert.equal(m.gold, 50);
  assert.equal(spendGold(m, 100), false);
  assert.equal(m.gold, 50);
});

test('weaponLevel 缺省 0；recordKill 累计', () => {
  const m = defaultMeta();
  assert.equal(weaponLevel(m, 'pistol'), 0);
  m.weaponLevels.pistol = 3;
  assert.equal(weaponLevel(m, 'pistol'), 3);
  assert.equal(recordKill(m, 'normal'), 1);
  assert.equal(recordKill(m, 'normal'), 2);
  assert.equal(m.bestiaryKills.normal, 2);
});

test('冒险结算：首通标记 + 解锁 N+1（封顶总关数）', () => {
  const m = defaultMeta();
  const r1 = recordAdventureResult(m, 'l1', 1, 3, true, 360);
  assert.equal(r1.isFirstClear, true);
  assert.equal(m.adventure.unlocked, 2);
  const r2 = recordAdventureResult(m, 'l1', 1, 3, true, 360);
  assert.equal(r2.isFirstClear, false);
  const r3 = recordAdventureResult(m, 'l3', 3, 3, true, 360);
  assert.equal(m.adventure.unlocked, 3);
  assert.equal(r3.isFirstClear, true);
});

test('冒险失败不解锁；最佳成绩 cleared 优先，其次比存活秒数', () => {
  const m = defaultMeta();
  recordAdventureResult(m, 'l1', 1, 3, false, 200);
  assert.equal(m.adventure.unlocked, 1);
  assert.deepEqual(m.adventure.bestTimes.l1, { cleared: false, timeSec: 200 });
  recordAdventureResult(m, 'l1', 1, 3, false, 100);
  assert.deepEqual(m.adventure.bestTimes.l1, { cleared: false, timeSec: 200 });
  recordAdventureResult(m, 'l1', 1, 3, true, 360);
  assert.deepEqual(m.adventure.bestTimes.l1, { cleared: true, timeSec: 360 });
});

test('无 localStorage（Node）：loadMeta 回默认、saveMeta 不抛错', () => {
  clearFakeStorage();
  assert.deepEqual(loadMeta(), defaultMeta());
  assert.doesNotThrow(() => saveMeta(defaultMeta()));
});

test('读写往返；坏 JSON / 版本不符 / 字段类型错误逐项回退、合法字段保留', () => {
  setFakeStorage({});
  const m = defaultMeta();
  addGold(m, 500);
  m.weaponLevels.pistol = 2;
  saveMeta(m);
  assert.equal(loadMeta().gold, 500);
  assert.equal(loadMeta().weaponLevels.pistol, 2);

  setFakeStorage({ zs_meta: '{oops' });
  assert.deepEqual(loadMeta(), defaultMeta());

  setFakeStorage({
    zs_meta: JSON.stringify({ version: 0, gold: 300, weaponLevels: { pistol: 99 }, adventure: { unlocked: 2 } }),
  });
  const loaded = loadMeta();
  assert.equal(loaded.version, 2);
  assert.equal(loaded.gold, 300);
  assert.equal(loaded.weaponLevels.pistol, undefined);
  assert.equal(loaded.adventure.unlocked, 2);
  assert.deepEqual(loaded.skins, {
    owned: ['wastelandAdventurer'],
    selected: 'wastelandAdventurer',
  });
  clearFakeStorage();
});

test('version 1 或缺失 skins 自动迁移，保留合法局外字段', () => {
  setFakeStorage({
    zs_meta: JSON.stringify({
      version: 1,
      gold: 321,
      weaponLevels: { pistol: 4 },
      adventure: { unlocked: 2, firstClear: { l1: true }, bestTimes: {} },
      bestiaryKills: { normal: 7 },
    }),
  });
  const loaded = loadMeta();
  assert.equal(loaded.version, 2);
  assert.equal(loaded.gold, 321);
  assert.equal(loaded.weaponLevels.pistol, 4);
  assert.equal(loaded.adventure.unlocked, 2);
  assert.equal(loaded.bestiaryKills.normal, 7);
  assert.deepEqual(loaded.skins, {
    owned: ['wastelandAdventurer'],
    selected: 'wastelandAdventurer',
  });
  clearFakeStorage();
});

test('skins owned 只保留注册表 ID 且 selected 不属于 owned 时回退默认', () => {
  setFakeStorage({
    zs_meta: JSON.stringify({
      version: 2,
      skins: { owned: ['nightHunter', 'bogus', 'nightHunter', 7], selected: 'bogus' },
    }),
  });
  assert.deepEqual(loadMeta().skins, {
    owned: ['wastelandAdventurer', 'nightHunter'],
    selected: 'wastelandAdventurer',
  });
  clearFakeStorage();
});

test('合法 selected 必须属于 owned 时保留选中皮肤', () => {
  setFakeStorage({
    zs_meta: JSON.stringify({
      version: 2,
      skins: { owned: ['nightHunter'], selected: 'nightHunter' },
    }),
  });
  assert.deepEqual(loadMeta().skins, {
    owned: ['wastelandAdventurer', 'nightHunter'],
    selected: 'nightHunter',
  });
  clearFakeStorage();
});

test('皮肤字段读写往返', () => {
  setFakeStorage({});
  const m = defaultMeta();
  m.skins.owned.push('neonMercenary');
  m.skins.selected = 'neonMercenary';
  saveMeta(m);
  assert.deepEqual(loadMeta().skins, {
    owned: ['wastelandAdventurer', 'neonMercenary'],
    selected: 'neonMercenary',
  });
  clearFakeStorage();
});
