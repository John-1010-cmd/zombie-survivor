// 辅助武器：随行无人机 / 随行移动火炮 / 随行远程火炮。
// orbit、索敌、数值和弹道逻辑保持原语义；场内模型登记到统一 visual registry。
import { registerPart } from '../core/visuals.js';
import { PALETTE } from '../config/palette.js';
import { TURN_RATE, turnToward } from '../core/angles.js';

export const AUX_VISUAL_IDS = Object.freeze({
  drone: 'aux.drone',
  gunner: 'aux.gunner',
  sniper: 'aux.sniper',
});

export const AUX_CONFIG = {
  drone: {
    name: '随行无人机', icon: 'icon.aux.drone', visual: AUX_VISUAL_IDS.drone,
    orbit: 90, damage: 6, fireRate: 2, projectileSpeed: 500, range: 250, aoe: 0,
  },
  gunner: {
    name: '随行移动火炮', icon: 'icon.aux.gunner', visual: AUX_VISUAL_IDS.gunner,
    orbit: 60, damage: 15, fireRate: 1, projectileSpeed: 400, range: 320, aoe: 60,
  },
  sniper: {
    name: '随行远程火炮', icon: 'icon.aux.sniper', visual: AUX_VISUAL_IDS.sniper,
    orbit: 100, damage: 30, fireRate: 0.4, projectileSpeed: 700, range: 500, aoe: 0,
  },
};

export const ORBIT_SPEED = { drone: 2.2, gunner: 1.4, sniper: 1.0 };

function auxAccent(kind) {
  if (kind === 'gunner') return PALETTE.auxGunner ?? PALETTE.gold;
  if (kind === 'sniper') return PALETTE.auxSniper ?? PALETTE.neon;
  return PALETTE.auxDrone ?? PALETTE.neon;
}

function drawDroneVisual(ctx, size, params = {}, phase = 0) {
  void params;
  const r = size;
  const accent = auxAccent('drone');
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = Math.max(3, r * 0.45);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, r * 0.08);
  for (let i = 0; i < 4; i++) {
    const armAngle = Math.PI / 4 + i * Math.PI / 2;
    const ax = Math.cos(armAngle) * r * 0.72;
    const ay = Math.sin(armAngle) * r * 0.72;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(phase * 8 + i * Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, 0);
    ctx.lineTo(r * 0.25, 0);
    ctx.moveTo(0, -r * 0.25);
    ctx.lineTo(0, r * 0.25);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGunnerVisual(ctx, size, params = {}, phase = 0) {
  void phase;
  const r = size;
  const accent = auxAccent('gunner');
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = Math.max(3, r * 0.42);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.25, r * 0.72, r * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();
  ctx.fillStyle = PALETTE.panel;
  for (const x of [-r * 0.48, r * 0.48]) {
    ctx.beginPath();
    ctx.arc(x, r * 0.35, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.stroke();
  }
  ctx.save();
  ctx.rotate(params.aimAngle ?? 0);
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, -r * 0.18);
  ctx.lineTo(r * 0.98, -r * 0.18);
  ctx.lineTo(r * 1.08, -r * 0.10);
  ctx.lineTo(r * 1.08, r * 0.10);
  ctx.lineTo(r * 0.98, r * 0.18);
  ctx.lineTo(-r * 0.12, r * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(r * 0.98, -r * 0.24, r * 0.18, r * 0.48);
  ctx.restore();
  ctx.restore();
}

function drawSniperVisual(ctx, size, params = {}, phase = 0) {
  const r = size;
  const accent = auxAccent('sniper');
  ctx.save();
  ctx.translate(0, Math.sin(phase * 3) * r * 0.08);
  ctx.shadowColor = accent;
  ctx.shadowBlur = Math.max(3, r * 0.50);
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.25, r * 0.76, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();
  ctx.save();
  ctx.rotate(params.aimAngle ?? 0);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.beginPath();
  ctx.moveTo(-r * 0.10, -r * 0.14);
  ctx.lineTo(r * 1.50, -r * 0.10);
  ctx.lineTo(r * 1.58, 0);
  ctx.lineTo(r * 1.50, r * 0.10);
  ctx.lineTo(-r * 0.10, r * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(r * 1.45, -r * 0.15, r * 0.20, r * 0.30);
  ctx.restore();
  ctx.restore();
}

registerPart(AUX_VISUAL_IDS.drone, drawDroneVisual);
registerPart(AUX_VISUAL_IDS.gunner, drawGunnerVisual);
registerPart(AUX_VISUAL_IDS.sniper, drawSniperVisual);

export function createAux() {
  return {
    counts: { drone: 0, gunner: 0, sniper: 0 },
    enhance: {
      drone: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
      gunner: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
      sniper: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
    },
    bodies: [],
    t: 0,
  };
}

export function auxStats(body) {
  const base = AUX_CONFIG[body.kind];
  const e = body.weapon.enhance || {};
  return {
    damage: base.damage * Math.pow(1.25, e.damage || 0),
    fireRate: base.fireRate * Math.pow(1.2, e.fireRate || 0),
    projectiles: (base.projectiles ?? 1) + (e.projectiles || 0),
    range: base.range * Math.pow(1.2, e.range || 0),
    projectileSpeed: base.projectileSpeed,
    aoe: base.aoe,
  };
}

export function spawnAuxBodies(aux) {
  aux.bodies = [];
  for (const kind of Object.keys(AUX_CONFIG)) {
    for (let idx = 0; idx < aux.counts[kind]; idx++) {
      aux.bodies.push({
        kind, idx, aimAngle: 0,
        weapon: { id: 'aux', base: AUX_CONFIG[kind], enhance: aux.enhance[kind], cooldown: 0 },
        x: 0, y: 0,
      });
    }
  }
}

export function updateAuxBodies(aux, player, zombies, spawnProjectile, rng, dt) {
  aux.t += dt;
  for (const body of aux.bodies) {
    const base = AUX_CONFIG[body.kind];
    const a = (body.idx / aux.counts[body.kind]) * 2 * Math.PI + aux.t * ORBIT_SPEED[body.kind];
    body.x = player.x + base.orbit * Math.cos(a);
    body.y = player.y + base.orbit * Math.sin(a);

    const s = auxStats(body);
    let best = null, bestD = s.range;
    for (const z of zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - body.x, z.y - body.y);
      if (d <= s.range && d < bestD) { best = z; bestD = d; }
    }

    let targetAngle = 0;
    if (best) {
      targetAngle = Math.atan2(best.y - body.y, best.x - body.x);
      if (body.kind !== 'drone')
        body.aimAngle = turnToward(body.aimAngle, targetAngle, TURN_RATE * Math.max(0, dt));
    }

    body.weapon.cooldown = Math.max(0, body.weapon.cooldown - dt);
    if (body.weapon.cooldown > 0 || !best) continue;

    const muzzleFlash = body.kind === 'gunner'
      ? { color: auxAccent('gunner'), count: 2, distance: 14 }
      : body.kind === 'sniper'
        ? { color: auxAccent('sniper'), count: 2, distance: 22 }
        : undefined;
    for (let i = 0; i < s.projectiles; i++) {
      spawnProjectile({
        x: body.x, y: body.y,
        angle: targetAngle,
        speed: s.projectileSpeed,
        damage: s.damage,
        range: s.range,
        pierce: 0,
        knockback: 60,
        aoe: s.aoe,
        arc: false,
        chain: 0,
        muzzleFlash,
      });
    }
    body.weapon.cooldown = 1 / s.fireRate;
  }
}
