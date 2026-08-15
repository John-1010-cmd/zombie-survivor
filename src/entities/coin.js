// src/entities/coin.js —— 银币掉落与磁吸拾取（取代 xpGem）。纯逻辑模块，无 DOM 依赖。
const MAGNET_SPEED = 400;     // 普通磁吸速度 px/s
const MAGNET_ALL_SPEED = 1500; // 磁铁道具全场吸附速度 px/s（2.5s 窗口可覆盖整图对角）

export function createCoin(x, y, value) {
  return { x, y, r: 8, value, alive: true };
}

// 返回是否被拾取。magnetAll=true 时无视拾取半径，以 1200px/s 直飞玩家；否则沿用原磁吸规则。
export function updateCoin(c, player, dt, magnetAll = false) {
  const dx = player.x - c.x, dy = player.y - c.y;
  const d = Math.hypot(dx, dy);
  const speed = magnetAll ? MAGNET_ALL_SPEED : MAGNET_SPEED;
  if (!magnetAll) {
    const pickupR = player.pickupRadius ?? 80;
    if (d >= pickupR) return false; // 磁吸范围外不动
  }
  const step = speed * dt;
  if (d < player.r + c.r + 10 || step >= d) { // 接触，或本步会越过玩家
    c.alive = false;
    return true;
  }
  c.x += dx / d * step;
  c.y += dy / d * step;
  return false;
}
