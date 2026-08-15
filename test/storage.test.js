// test/storage.test.js —— 三模式纪录规则矩阵 + 设置存档
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  updateBest, loadBest, saveBest, loadSettings, saveSettings, DEFAULT_SETTINGS,
} from '../src/core/storage.js';

// —— updateBest：endless（比 time） ——
test('endless 首次纪录 isNew=true 且写入', () => {
  const r = updateBest({}, { time: 60, kills: 10 }, 'endless');
  assert.equal(r.isNew, true);
  assert.deepEqual(r.best.endless, { time: 60, kills: 10 });
});

test('endless 更长存活时间刷新纪录', () => {
  const best = { endless: { time: 60, kills: 10 } };
  const r = updateBest(best, { time: 90, kills: 20 }, 'endless');
  assert.equal(r.isNew, true);
  assert.deepEqual(r.best.endless, { time: 90, kills: 20 });
});

test('endless 更短或相等时间不刷新：原引用不变 isNew=false', () => {
  for (const t of [30, 60]) {
    const best = { endless: { time: 60, kills: 20 } };
    const r = updateBest(best, { time: t, kills: 99 }, 'endless');
    assert.equal(r.isNew, false);
    assert.equal(r.best, best); // 引用不变
    assert.deepEqual(best.endless, { time: 60, kills: 20 }); // 内容不变
  }
});

// —— updateBest：holdout（cleared 优先 → 双方 cleared 比 hp → 双方未 cleared 比 time） ——
test('holdout 首次纪录 isNew=true 且写入 cleared/hp', () => {
  const r = updateBest({}, { time: 300, kills: 50, hp: 80, cleared: true }, 'holdout10');
  assert.equal(r.isNew, true);
  assert.deepEqual(r.best.holdout10, { time: 300, kills: 50, hp: 80, cleared: true });
});

test('holdout 未 cleared → cleared 刷新（即使 time/hp 都更低）', () => {
  const best = { holdout10: { time: 590, kills: 99, hp: 1, cleared: false } };
  const r = updateBest(best, { time: 100, kills: 10, hp: 30, cleared: true }, 'holdout10');
  assert.equal(r.isNew, true);
  assert.equal(r.best.holdout10.cleared, true);
});

test('holdout 双方 cleared 比 hp 高者胜', () => {
  const best = { holdout20: { time: 1200, kills: 100, hp: 50, cleared: true } };
  const r = updateBest(best, { time: 1200, kills: 200, hp: 60, cleared: true }, 'holdout20');
  assert.equal(r.isNew, true);
  assert.equal(r.best.holdout20.hp, 60);
});

test('holdout 双方 cleared 且 hp 相等/更低不刷新', () => {
  for (const hp of [50, 30]) {
    const best = { holdout10: { time: 300, kills: 50, hp: 50, cleared: true } };
    const r = updateBest(best, { time: 400, kills: 80, hp, cleared: true }, 'holdout10');
    assert.equal(r.isNew, false);
    assert.equal(r.best, best);
  }
});

test('holdout 双方未 cleared 比 time 长者胜', () => {
  const best = { holdout10: { time: 300, kills: 50, cleared: false } };
  const r = updateBest(best, { time: 400, kills: 20, hp: 5, cleared: false }, 'holdout10');
  assert.equal(r.isNew, true);
  assert.equal(r.best.holdout10.time, 400);
});

test('holdout 双方未 cleared 且 time 更短/相等不刷新', () => {
  for (const t of [200, 300]) {
    const best = { holdout10: { time: 300, kills: 50, cleared: false } };
    const r = updateBest(best, { time: t, kills: 99, cleared: false }, 'holdout10');
    assert.equal(r.isNew, false);
    assert.equal(r.best, best);
  }
});

test('holdout cleared → 未 cleared 不刷新（cleared 优先于 time）', () => {
  const best = { holdout20: { time: 500, kills: 30, hp: 70, cleared: true } };
  const r = updateBest(best, { time: 1199, kills: 999, hp: 0, cleared: false }, 'holdout20');
  assert.equal(r.isNew, false);
  assert.equal(r.best, best);
});

test('holdout20 与 holdout10 互不干扰', () => {
  const best = { holdout10: { time: 100, kills: 1, cleared: false } };
  const r = updateBest(best, { time: 600, kills: 10, hp: 90, cleared: true }, 'holdout20');
  assert.equal(r.isNew, true);
  assert.deepEqual(best.holdout10, { time: 100, kills: 1, cleared: false }); // 原纪录未被改动
  assert.equal(r.best.holdout20.cleared, true);
});

// —— 入参不变式 ——
test('三模式 updateBest 均不改入参', () => {
  const cases = [
    { mode: 'endless', best: { endless: { time: 60, kills: 10 } }, stats: { time: 120, kills: 30, hp: 10 } },
    { mode: 'holdout10', best: { holdout10: { time: 100, kills: 5, cleared: false } }, stats: { time: 600, kills: 40, hp: 55, cleared: true } },
    { mode: 'holdout20', best: { holdout20: { time: 1200, kills: 80, hp: 40, cleared: true } }, stats: { time: 300, kills: 9, hp: 1, cleared: false } },
  ];
  for (const c of cases) {
    const bestBefore = JSON.parse(JSON.stringify(c.best));
    const statsBefore = JSON.parse(JSON.stringify(c.stats));
    updateBest(c.best, c.stats, c.mode);
    assert.deepEqual(c.best, bestBefore);
    assert.deepEqual(c.stats, statsBefore);
  }
});

// —— 设置存档 ——
test('DEFAULT_SETTINGS 默认值', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { volume: 0.8, damageNumbers: true, screenShake: true });
});

test('loadSettings 无 localStorage（Node）返回默认值，且每次为新对象', () => {
  if ('localStorage' in globalThis) delete globalThis.localStorage;
  const a = loadSettings();
  const b = loadSettings();
  assert.deepEqual(a, DEFAULT_SETTINGS);
  assert.notEqual(a, DEFAULT_SETTINGS);
  assert.notEqual(a, b);
});

test('saveSettings/loadBest/saveBest 无 localStorage 不抛错', () => {
  if ('localStorage' in globalThis) delete globalThis.localStorage;
  assert.doesNotThrow(() => saveSettings({ volume: 0.5 }));
  assert.doesNotThrow(() => saveBest({ endless: { time: 1, kills: 1 } }));
  assert.deepEqual(loadBest(), {});
});

// —— 假 localStorage 注入：坏数据回退 / 字段守卫 / 持久化 ——
function setFakeStorage(raw) {
  const store = new Map();
  for (const [k, v] of Object.entries(raw)) store.set(k, v);
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  return store;
}
function clearFakeStorage() {
  delete globalThis.localStorage;
}

test('设置坏 JSON / 非对象数据 → 回退默认', () => {
  for (const raw of ['{oops', 'null', '"str"', '42']) {
    setFakeStorage({ zs_settings: raw });
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS, 'raw=' + raw);
  }
  clearFakeStorage();
});

test('字段类型错误逐项回退默认，合法字段保留；volume 夹取 0–1', () => {
  setFakeStorage({
    zs_settings: JSON.stringify({ volume: 2, damageNumbers: 'yes', screenShake: false }),
  });
  assert.deepEqual(loadSettings(), { volume: 1, damageNumbers: true, screenShake: false });
  setFakeStorage({ zs_settings: JSON.stringify({ volume: -0.5, damageNumbers: false }) });
  assert.deepEqual(loadSettings(), { volume: 0, damageNumbers: false, screenShake: true });
  setFakeStorage({ zs_settings: JSON.stringify({ volume: 0.5 }) });
  assert.deepEqual(loadSettings(), { volume: 0.5, damageNumbers: true, screenShake: true });
  clearFakeStorage();
});

test('saveSettings 写入 zs_settings 键，可被 loadSettings 读回', () => {
  setFakeStorage({});
  saveSettings({ volume: 0.3, damageNumbers: false, screenShake: false });
  assert.deepEqual(loadSettings(), { volume: 0.3, damageNumbers: false, screenShake: false });
  clearFakeStorage();
});

test('settings 纯度：修改 loadSettings 返回值不影响默认值与后续读取', () => {
  setFakeStorage({ zs_settings: JSON.stringify({ volume: 0.6, damageNumbers: true, screenShake: true }) });
  const s = loadSettings();
  s.volume = 0;
  s.damageNumbers = false;
  assert.equal(DEFAULT_SETTINGS.volume, 0.8);
  assert.equal(DEFAULT_SETTINGS.damageNumbers, true);
  assert.equal(loadSettings().volume, 0.6);
  clearFakeStorage();
});
