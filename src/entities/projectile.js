// 弹道飞行：沿 angle 直线前进、按 range 耗尽消亡。纯逻辑模块，无 DOM 依赖。

export const TRAIL_MAX = 8;

export function createProjectile() {
  return { x: 0, y: 0, angle: 0, speed: 0, damage: 0, range: 0,
    traveled: 0, pierce: 0, knockback: 0, aoe: 0, arc: false, chain: 0,
    frags: null, chainMult: 0.8, chainDmgMult: 1, alive: true,
    visual: null,
    // 拖尾环形缓冲（设计 §9.2）：预分配定长，写入零每帧分配
    trail: Array.from({ length: TRAIL_MAX }, () => ({ x: 0, y: 0 })),
    trailHead: 0, trailLen: 0 };
}

export function resetProjectile(p, opts) {
  Object.assign(p, opts, { traveled: 0, alive: true, trailHead: 0, trailLen: 0, visual: opts.visual ?? null });
}

export function updateProjectile(p, dt) {
  // 先记拖尾再位移：缓冲里是"上一帧位置"
  p.trail[p.trailHead].x = p.x;
  p.trail[p.trailHead].y = p.y;
  p.trailHead = (p.trailHead + 1) % TRAIL_MAX;
  if (p.trailLen < TRAIL_MAX) p.trailLen++;
  p.x += Math.cos(p.angle) * p.speed * dt;
  p.y += Math.sin(p.angle) * p.speed * dt;
  p.traveled += p.speed * dt;
  if (p.traveled >= p.range) p.alive = false;
}
