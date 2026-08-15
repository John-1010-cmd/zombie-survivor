const MAGNET_SPEED = 400; // 磁吸速度 px/s

export function createGem(x, y, value) {
  return { x, y, r: 8, value, alive: true };
}

export function updateGem(g, player, dt) {
  const dx = player.x - g.x, dy = player.y - g.y;
  const d = Math.hypot(dx, dy);
  if (d >= player.pickupRadius) return false; // 磁吸范围外不动
  const step = MAGNET_SPEED * dt;
  if (d < player.r + g.r + 10 || step >= d) { // 接触，或本步会越过玩家
    g.alive = false;
    return true;
  }
  g.x += dx / d * step;
  g.y += dy / d * step;
  return false;
}
