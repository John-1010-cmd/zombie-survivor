// src/core/meta.js —— 局外存档：金币、武器局外等级、冒险进度、图鉴击杀统计（设计 §10）。
// localStorage key 'zs_meta'，与 zs_best/zs_settings 互不读写；
// typeof 守卫 + try/catch 保证 node --test 下不炸（同 storage.js 模式）。
const META_KEY = 'zs_meta';
export const META_VERSION = 1;
const MAX_WEAPON_LEVEL = 10; // 局外升级上限（设计 §6.2）

export function defaultMeta() {
  return {
    version: META_VERSION,
    gold: 0,
    weaponLevels: {}, // { [weaponId]: 0..10 }
    adventure: { unlocked: 1, firstClear: {}, bestTimes: {} },
    bestiaryKills: {}, // { [monsterId]: n }
  };
}

// 逐项校验回退默认（version 缺失/不符同样走本函数：合法字段保留，坏字段丢弃）。
// 本期为首版无旧数据可迁移；后续版本升级在此按 v 分支迁移映射表。
function normalizeMeta(parsed) {
  const m = defaultMeta();
  const v = parsed?.version; // v1 无迁移，忽略 version 逐项校验；后续版本在此按 v 分支迁移
  if (!parsed || typeof parsed !== 'object') return m;
  if (typeof parsed.gold === 'number' && Number.isFinite(parsed.gold) && parsed.gold >= 0)
    m.gold = Math.floor(parsed.gold);
  if (parsed.weaponLevels && typeof parsed.weaponLevels === 'object') {
    for (const [id, lv] of Object.entries(parsed.weaponLevels)) {
      if (Number.isInteger(lv) && lv >= 0 && lv <= MAX_WEAPON_LEVEL) m.weaponLevels[id] = lv;
    }
  }
  if (parsed.adventure && typeof parsed.adventure === 'object') {
    const a = parsed.adventure;
    // unlocked 仅校验下限（≥1）；上限夹取在 UI 层按 ADVENTURE_LEVELS.length 做，meta.js 不反向依赖 adventure 配置
    if (Number.isInteger(a.unlocked) && a.unlocked >= 1) m.adventure.unlocked = a.unlocked;
    if (a.firstClear && typeof a.firstClear === 'object') {
      for (const [k, v] of Object.entries(a.firstClear)) if (v === true) m.adventure.firstClear[k] = true;
    }
    if (a.bestTimes && typeof a.bestTimes === 'object') {
      for (const [k, v] of Object.entries(a.bestTimes)) {
        if (v && typeof v === 'object' && typeof v.timeSec === 'number' && Number.isFinite(v.timeSec))
          m.adventure.bestTimes[k] = { cleared: v.cleared === true, timeSec: v.timeSec };
      }
    }
  }
  if (parsed.bestiaryKills && typeof parsed.bestiaryKills === 'object') {
    for (const [id, n] of Object.entries(parsed.bestiaryKills)) {
      if (Number.isInteger(n) && n >= 0) m.bestiaryKills[id] = n;
    }
  }
  return m;
}

export function loadMeta() {
  try {
    if (typeof localStorage === 'undefined') return defaultMeta();
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return defaultMeta();
    return normalizeMeta(JSON.parse(raw));
  } catch { return defaultMeta(); }
}

export function saveMeta(meta) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch { /* 存储不可用（隐私模式等）时静默忽略 */ }
}

// —— 金币 ——
export function addGold(meta, n) {
  meta.gold += Math.floor(n);
  return meta.gold;
}

export function spendGold(meta, n) {
  if (meta.gold < n) return false;
  meta.gold -= n;
  return true;
}

// —— 武器局外等级 ——
export function weaponLevel(meta, id) {
  return meta.weaponLevels[id] ?? 0;
}

// —— 图鉴击杀统计（全模式计数；解锁判定 = bestiaryKills[id] ≥ 1，设计 §7）——
export function recordKill(meta, monsterId) {
  meta.bestiaryKills[monsterId] = (meta.bestiaryKills[monsterId] ?? 0) + 1;
  return meta.bestiaryKills[monsterId];
}

// —— 冒险进度 ——
// 结算写入：首通标记、通关解锁 N+1（封顶 levelCount）、最佳成绩（cleared 优先，其次比存活秒数）。
// levelIndex 为 1 起序号。返回 { isFirstClear }（金币奖励 ×2 判定用，设计 §3.4）。
export function recordAdventureResult(meta, levelId, levelIndex, levelCount, cleared, timeSec) {
  const isFirstClear = cleared && !meta.adventure.firstClear[levelId];
  if (cleared) {
    meta.adventure.firstClear[levelId] = true;
    meta.adventure.unlocked = Math.min(levelCount, Math.max(meta.adventure.unlocked, levelIndex + 1));
  }
  const old = meta.adventure.bestTimes[levelId];
  const oldCleared = old ? old.cleared === true : false;
  const better = !old || (cleared && !oldCleared) || (cleared === oldCleared && timeSec > old.timeSec);
  if (better) meta.adventure.bestTimes[levelId] = { cleared, timeSec };
  return { isFirstClear };
}
