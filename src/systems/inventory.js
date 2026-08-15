// src/systems/inventory.js —— 道具背包：计数累加/使用/查询。纯逻辑，无 DOM 依赖。
export function createInventory() {
  return { medkit: 0, magnet: 0, bomb: 0 };
}

// 原地累加 n 件
export function addItem(inv, id, n = 1) {
  inv[id] = (inv[id] ?? 0) + n;
}

// 数量 > 0 才扣减 1 件并返回 true；否则返回 false（不为负）
export function useItem(inv, id) {
  if (inv[id] > 0) {
    inv[id] -= 1;
    return true;
  }
  return false;
}

export function itemCount(inv, id) {
  return inv[id] ?? 0;
}
