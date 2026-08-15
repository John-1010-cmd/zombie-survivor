// 弹道飞行：沿 angle 直线前进、按 range 耗尽消亡。纯逻辑模块，无 DOM 依赖。

export function createProjectile() {
  return { x: 0, y: 0, angle: 0, speed: 0, damage: 0, range: 0,
    traveled: 0, pierce: 0, knockback: 0, aoe: 0, arc: false, chain: 0,
    frags: null, chainMult: 0.8, chainDmgMult: 1, alive: true };
}

export function resetProjectile(p, opts) {
  Object.assign(p, opts, { traveled: 0, alive: true });
}

export function updateProjectile(p, dt) {
  p.x += Math.cos(p.angle) * p.speed * dt;
  p.y += Math.sin(p.angle) * p.speed * dt;
  p.traveled += p.speed * dt;
  if (p.traveled >= p.range) p.alive = false;
}
