// test/meta.test.js —— 局外存档：金币、武器等级、冒险进度、图鉴击杀（设计 §10）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  META_VERSION, defaultMeta, loadMeta, saveMeta,
  addGold, spendGold, weaponLevel, recordKill, recordAdventureResult,
} from '../src/core/meta.js';

// —— 假 localStorage 注入（同 storage.test.js 模式）——
function setFakeStorage(raw) {
  const store = new Map(Object.entries(raw));
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  return store;
}
function clearFakeStorage() { delete globalThis.localStorage; }

test('defaultMeta 结构定稿（version 1）', () => {
  assert.equal(META_VERSION, 1);
  assert.deepEqual(defaultMeta(), {
    version: 1, gold: 0, weaponLevels: {},
    adventure: { unlocked: 1, firstClear: {}, bestTimes: {} },
    bestiaryKills: {},
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
  assert.equal(r2.isFirstClear, false); // 二通不再首通
  const r3 = recordAdventureResult(m, 'l3', 3, 3, true, 360);
  assert.equal(m.adventure.unlocked, 3); // 不超过总关数
  assert.equal(r3.isFirstClear, true);
});

test('冒险失败不解锁；最佳成绩 cleared 优先，其次比存活秒数', () => {
  const m = defaultMeta();
  recordAdventureResult(m, 'l1', 1, 3, false, 200);
  assert.equal(m.adventure.unlocked, 1);
  assert.deepEqual(m.adventure.bestTimes.l1, { cleared: false, timeSec: 200 });
  recordAdventureResult(m, 'l1', 1, 3, false, 100); // 更差不刷新
  assert.deepEqual(m.adventure.bestTimes.l1, { cleared: false, timeSec: 200 });
  recordAdventureResult(m, 'l1', 1, 3, true, 360); // cleared 优先
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

  // 版本不符：能识别的合法字段保留，坏字段回退
  setFakeStorage({
    zs_meta: JSON.stringify({ version: 0, gold: 300, weaponLevels: { pistol: 99 }, adventure: { unlocked: 2 } }),
  });
  const loaded = loadMeta();
  assert.equal(loaded.version, 1);
  assert.equal(loaded.gold, 300);
  assert.equal(loaded.weaponLevels.pistol, undefined); // 99 超界丢弃
  assert.equal(loaded.adventure.unlocked, 2);
  clearFakeStorage();
});
