// src/core/storage.js
// 最高分存档：updateBest 为纯函数（可单测）；
// loadBest/saveBest 触碰 localStorage，仅浏览器可用，try/catch + typeof 守卫保证 Node 下不炸。
const KEY = 'zs_best';

export function updateBest(best, stats) {
  const old = best.endless;
  if (!old || stats.time > old.time) {
    return {
      best: { ...best, endless: { time: stats.time, kills: stats.kills, level: stats.level } },
      isNew: true,
    };
  }
  return { best, isNew: false };
}

export function loadBest() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

export function saveBest(best) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, JSON.stringify(best));
  } catch { /* 存储不可用（隐私模式等）时静默忽略 */ }
}
