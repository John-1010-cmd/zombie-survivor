// 部署物：围墙（单段放置）。纯逻辑模块，无 DOM 依赖。
// 单段独立圆碰撞 r=22；基值耐久 150，每级 wallEnhance.hp 强化 +50%（hp = 150×1.5^hp）。
export function createWallSegment(x, y, wallEnhance) {
  const hp = 150 * Math.pow(1.5, (wallEnhance && wallEnhance.hp) || 0);
  return { x, y, r: 22, hp, maxHp: hp, alive: true };
}
