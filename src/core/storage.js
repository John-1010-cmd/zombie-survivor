// src/core/storage.js
// 三模式最佳纪录 + 设置存档。
// updateBest/loadSettings 为纯逻辑（可单测）；loadBest/saveBest/saveSettings
// 触碰 localStorage，仅浏览器可用，try/catch + typeof 守卫保证 Node 下不炸。
const BEST_KEY = 'zs_best';
const SETTINGS_KEY = 'zs_settings';

export const DEFAULT_SETTINGS = { volume: 0.8, damageNumbers: true, screenShake: true };

// 纪录比较：endless 比 time；holdout 先比 cleared，双方 cleared 比 hp，
// 双方未 cleared 比 time。纯函数，不改入参；非新纪录时 best 原引用返回。
export function updateBest(best, stats, mode) {
  const old = best[mode];
  let isNew = false;
  if (!old) {
    isNew = true;
  } else if (mode === 'endless') {
    isNew = stats.time > old.time;
  } else if (!!stats.cleared !== !!old.cleared) {
    isNew = !!stats.cleared;
  } else if (stats.cleared) {
    isNew = stats.hp > old.hp;
  } else {
    isNew = stats.time > old.time;
  }
  if (!isNew) return { best, isNew };
  const record = mode === 'endless'
    ? { time: stats.time, kills: stats.kills }
    : { time: stats.time, kills: stats.kills, hp: stats.hp, cleared: !!stats.cleared };
  return { best: { ...best, [mode]: record }, isNew };
}

export function loadBest() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

export function saveBest(best) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch { /* 存储不可用（隐私模式等）时静默忽略 */ }
}

export function loadSettings() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* 存储不可用（隐私模式等）时静默忽略 */ }
}

// 坏数据/类型错误逐项回退默认；volume 夹取 0–1。
function normalizeSettings(parsed) {
  const s = { ...DEFAULT_SETTINGS };
  if (!parsed || typeof parsed !== 'object') return s;
  if (typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)) {
    s.volume = Math.max(0, Math.min(1, parsed.volume));
  }
  if (typeof parsed.damageNumbers === 'boolean') s.damageNumbers = parsed.damageNumbers;
  if (typeof parsed.screenShake === 'boolean') s.screenShake = parsed.screenShake;
  return s;
}
