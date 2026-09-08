// src/core/meta.js —— 局外存档：金币、武器等级、冒险进度、图鉴击杀和皮肤。
import { SKINS } from '../config/skins.js';
import { WEAPONS } from '../config/bestiary/weapons.js';

const META_KEY = 'zs_meta';
export const META_VERSION = 3;
const MAX_WEAPON_LEVEL = 10;
const DEFAULT_SKIN_ID = 'wastelandAdventurer';
export const DEFAULT_WEAPON_ID = 'pistol';

export function defaultMeta() {
  return {
    version: META_VERSION,
    gold: 0,
    weaponLevels: {},
    adventure: { unlocked: 1, firstClear: {}, bestTimes: {} },
    bestiaryKills: {},
    skins: {
      owned: [DEFAULT_SKIN_ID],
      selected: DEFAULT_SKIN_ID,
    },
    weapons: {
      owned: [DEFAULT_WEAPON_ID],
      selected: DEFAULT_WEAPON_ID,
    },
  };
}

function isRegisteredSkin(id) {
  return typeof id === 'string'
    && Object.prototype.hasOwnProperty.call(SKINS, id);
}

function defaultSkins() {
  return { owned: [DEFAULT_SKIN_ID], selected: DEFAULT_SKIN_ID };
}

function isRegisteredWeapon(id) {
  return typeof id === 'string'
    && Object.prototype.hasOwnProperty.call(WEAPONS, id);
}

function defaultWeapons(weaponLevels = {}) {
  const owned = [DEFAULT_WEAPON_ID];
  for (const [id, lv] of Object.entries(weaponLevels)) {
    if (lv > 0 && isRegisteredWeapon(id) && !owned.includes(id)) {
      owned.push(id);
    }
  }
  return { owned, selected: DEFAULT_WEAPON_ID };
}

function normalizeWeapons(raw, sourceVersion, weaponLevels = {}) {
  if (sourceVersion < META_VERSION || !raw || typeof raw !== 'object' || Array.isArray(raw))
    return defaultWeapons(weaponLevels);
  const owned = [];
  if (Array.isArray(raw.owned)) {
    for (const id of raw.owned) {
      if (isRegisteredWeapon(id) && !owned.includes(id)) owned.push(id);
    }
  }
  for (const [id, lv] of Object.entries(weaponLevels)) {
    if (lv > 0 && isRegisteredWeapon(id) && !owned.includes(id)) {
      owned.push(id);
    }
  }
  if (!owned.includes(DEFAULT_WEAPON_ID)) owned.unshift(DEFAULT_WEAPON_ID);
  const selected = typeof raw.selected === 'string' && owned.includes(raw.selected)
    ? raw.selected
    : DEFAULT_WEAPON_ID;
  return { owned, selected };
}

function normalizeSkins(raw, sourceVersion) {
  if (sourceVersion < 2 || !raw || typeof raw !== 'object' || Array.isArray(raw))
    return defaultSkins();
  const owned = [];
  if (Array.isArray(raw.owned)) {
    for (const id of raw.owned) {
      if (isRegisteredSkin(id) && !owned.includes(id)) owned.push(id);
    }
  }
  if (!owned.includes(DEFAULT_SKIN_ID)) owned.unshift(DEFAULT_SKIN_ID);
  const selected = typeof raw.selected === 'string' && owned.includes(raw.selected)
    ? raw.selected
    : DEFAULT_SKIN_ID;
  return { owned, selected };
}

function normalizeMeta(parsed) {
  const m = defaultMeta();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return m;
  const sourceVersion = Number.isInteger(parsed.version) ? parsed.version : 1;

  if (typeof parsed.gold === 'number' && Number.isFinite(parsed.gold) && parsed.gold >= 0)
    m.gold = Math.floor(parsed.gold);
  if (parsed.weaponLevels && typeof parsed.weaponLevels === 'object' && !Array.isArray(parsed.weaponLevels)) {
    for (const [id, lv] of Object.entries(parsed.weaponLevels)) {
      if (Number.isInteger(lv) && lv >= 0 && lv <= MAX_WEAPON_LEVEL) m.weaponLevels[id] = lv;
    }
  }
  if (parsed.adventure && typeof parsed.adventure === 'object' && !Array.isArray(parsed.adventure)) {
    const a = parsed.adventure;
    if (Number.isInteger(a.unlocked) && a.unlocked >= 1) m.adventure.unlocked = a.unlocked;
    if (a.firstClear && typeof a.firstClear === 'object' && !Array.isArray(a.firstClear)) {
      for (const [id, value] of Object.entries(a.firstClear)) {
        if (value === true) m.adventure.firstClear[id] = true;
      }
    }
    if (a.bestTimes && typeof a.bestTimes === 'object' && !Array.isArray(a.bestTimes)) {
      for (const [id, value] of Object.entries(a.bestTimes)) {
        if (value && typeof value === 'object' && typeof value.timeSec === 'number' && Number.isFinite(value.timeSec)) {
          m.adventure.bestTimes[id] = { cleared: value.cleared === true, timeSec: value.timeSec };
        }
      }
    }
  }
  if (parsed.bestiaryKills && typeof parsed.bestiaryKills === 'object' && !Array.isArray(parsed.bestiaryKills)) {
    for (const [id, count] of Object.entries(parsed.bestiaryKills)) {
      if (Number.isInteger(count) && count >= 0) m.bestiaryKills[id] = count;
    }
  }
  m.skins = normalizeSkins(parsed.skins, sourceVersion);
  m.weapons = normalizeWeapons(parsed.weapons, sourceVersion, m.weaponLevels);
  m.version = META_VERSION;
  return m;
}

export function loadMeta() {
  try {
    if (typeof localStorage === 'undefined') return defaultMeta();
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return defaultMeta();
    return normalizeMeta(JSON.parse(raw));
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // 存储不可用时静默忽略，保持既有保护边界。
  }
}

export function addGold(meta, n) {
  meta.gold += Math.floor(n);
  return meta.gold;
}

export function spendGold(meta, n) {
  if (meta.gold < n) return false;
  meta.gold -= n;
  return true;
}

export function weaponLevel(meta, id) {
  return meta.weaponLevels[id] ?? 0;
}

export function recordKill(meta, monsterId) {
  meta.bestiaryKills[monsterId] = (meta.bestiaryKills[monsterId] ?? 0) + 1;
  return meta.bestiaryKills[monsterId];
}

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

export function isWeaponUnlocked(meta, id) {
  if (id === DEFAULT_WEAPON_ID) return true;
  if (!meta || !meta.weapons || !Array.isArray(meta.weapons.owned)) return false;
  return meta.weapons.owned.includes(id);
}

export function unlockWeapon(meta, id, price) {
  if (isWeaponUnlocked(meta, id)) return true;
  if (!spendGold(meta, price)) return false;
  if (!meta.weapons) {
    meta.weapons = defaultWeapons(meta.weaponLevels);
  }
  if (!meta.weapons.owned.includes(id)) {
    meta.weapons.owned.push(id);
  }
  return true;
}

export function selectWeapon(meta, id) {
  if (!isWeaponUnlocked(meta, id)) return false;
  if (!meta.weapons) {
    meta.weapons = defaultWeapons(meta.weaponLevels);
  }
  meta.weapons.selected = id;
  return true;
}

export function selectedWeapon(meta) {
  return meta?.weapons?.selected ?? DEFAULT_WEAPON_ID;
}
