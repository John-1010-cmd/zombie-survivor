import test from 'node:test';
import assert from 'node:assert/strict';
import {
  META_VERSION, defaultMeta, loadMeta, saveMeta,
  addGold, spendGold, weaponLevel, recordKill, recordAdventureResult,
  isWeaponUnlocked, unlockWeapon, selectWeapon, selectedWeapon,
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

test('defaultMeta 结构定稿（version 3 + 默认皮肤 + 默认武器）', () => {
  clearFakeStorage();
  assert.equal(META_VERSION, 3);
  assert.deepEqual(defaultMeta(), {
    version: 3,
    gold: 0,
    weaponLevels: {},
    adventure: { unlocked: 1, firstClear: {}, bestTimes: {} },
    bestiaryKills: {},
    skins: {
      owned: ['wastelandAdventurer'],
      selected: 'wastelandAdventurer',
    },
    weapons: {
      owned: ['pistol'],
      selected: 'pistol',
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
  assert.equal(loaded.version, 3);
  assert.equal(loaded.gold, 300);
  assert.equal(loaded.weaponLevels.pistol, undefined);
  assert.equal(loaded.adventure.unlocked, 2);
  assert.deepEqual(loaded.skins, {
    owned: ['wastelandAdventurer'],
    selected: 'wastelandAdventurer',
  });
  assert.deepEqual(loaded.weapons, {
    owned: ['pistol'],
    selected: 'pistol',
  });
  clearFakeStorage();
});

test('version 1 或缺失 skins/weapons 自动迁移，保留合法局外字段', () => {
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
  assert.equal(loaded.version, 3);
  assert.equal(loaded.gold, 321);
  assert.equal(loaded.weaponLevels.pistol, 4);
  assert.equal(loaded.adventure.unlocked, 2);
  assert.equal(loaded.bestiaryKills.normal, 7);
  assert.deepEqual(loaded.skins, {
    owned: ['wastelandAdventurer'],
    selected: 'wastelandAdventurer',
  });
  assert.deepEqual(loaded.weapons, {
    owned: ['pistol'],
    selected: 'pistol',
  });
  clearFakeStorage();
});

test('version 2 迁移至 version 3：已有等级 > 0 的武器自动保留为 owned', () => {
  setFakeStorage({
    zs_meta: JSON.stringify({
      version: 2,
      gold: 500,
      weaponLevels: { pistol: 3, rifle: 2, mg: 0 },
      skins: { owned: ['wastelandAdventurer'], selected: 'wastelandAdventurer' },
    }),
  });
  const loaded = loadMeta();
  assert.equal(loaded.version, 3);
  assert.equal(loaded.gold, 500);
  assert.deepEqual(loaded.weapons, {
    owned: ['pistol', 'rifle'],
    selected: 'pistol',
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

test('weapons owned 只保留注册表武器 ID 且 selected 不属于 owned 时回退默认', () => {
  setFakeStorage({
    zs_meta: JSON.stringify({
      version: 3,
      weapons: { owned: ['rifle', 'invalidWeapon', 'rifle', 99], selected: 'invalidWeapon' },
    }),
  });
  assert.deepEqual(loadMeta().weapons, {
    owned: ['pistol', 'rifle'],
    selected: 'pistol',
  });
  clearFakeStorage();
});

test('合法 selected 必须属于 owned 时保留选中武器', () => {
  setFakeStorage({
    zs_meta: JSON.stringify({
      version: 3,
      weapons: { owned: ['rifle'], selected: 'rifle' },
    }),
  });
  assert.deepEqual(loadMeta().weapons, {
    owned: ['pistol', 'rifle'],
    selected: 'rifle',
  });
  clearFakeStorage();
});

test('武器解锁与出战：isWeaponUnlocked / unlockWeapon / selectWeapon / selectedWeapon', () => {
  const m = defaultMeta();
  assert.equal(isWeaponUnlocked(m, 'pistol'), true);
  assert.equal(isWeaponUnlocked(m, 'rifle'), false);
  assert.equal(selectedWeapon(m), 'pistol');

  // 未解锁无法选择出战
  assert.equal(selectWeapon(m, 'rifle'), false);
  assert.equal(selectedWeapon(m), 'pistol');

  // 金币不足解锁失败
  addGold(m, 500);
  assert.equal(unlockWeapon(m, 'rifle', 800), false);
  assert.equal(isWeaponUnlocked(m, 'rifle'), false);
  assert.equal(m.gold, 500);

  // 金币足够解锁成功并扣款
  addGold(m, 500); // 现有 1000
  assert.equal(unlockWeapon(m, 'rifle', 800), true);
  assert.equal(m.gold, 200);
  assert.equal(isWeaponUnlocked(m, 'rifle'), true);

  // 重复解锁直接返回 true 且不重复扣款
  assert.equal(unlockWeapon(m, 'rifle', 800), true);
  assert.equal(m.gold, 200);

  // 解锁后可以选择出战
  assert.equal(selectWeapon(m, 'rifle'), true);
  assert.equal(selectedWeapon(m), 'rifle');
  assert.equal(m.weapons.selected, 'rifle');
});
