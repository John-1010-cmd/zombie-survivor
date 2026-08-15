// 部署物：围墙（环形 8 段）。纯逻辑模块，无 DOM 依赖。
// 每段独立圆碰撞 r=18，段心 = 中心 + 120·(cos(i/8·2π), sin(i/8·2π))；
// 基值耐久 150，每级 wallEnhance.hp 强化 +50%（hp = 150×1.5^hp）。
export function createWallRing(x, y, wallEnhance) {
  const hp = 150 * Math.pow(1.5, (wallEnhance && wallEnhance.hp) || 0);
  const segments = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * Math.PI;
    segments.push({
      x: x + 120 * Math.cos(a),
      y: y + 120 * Math.sin(a),
      r: 18, hp, maxHp: hp, alive: true,
    });
  }
  return segments;
}
