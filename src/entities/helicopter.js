// src/entities/helicopter.js —— 坚守模式救援直升机（降落/登机状态机）。纯逻辑模块，无 DOM 依赖。
const LANDING_TIME = 3;   // 降落耗时 s
const BOARDING_TIME = 3;  // 登机耗时 s

export function createHelicopter(x, y) {
  return { x, y, r: 60, state: 'landing', t: 0 };
}

// 状态机：landing 3s → waiting；waiting 中玩家圆心距 < r → boarding（计 3s，中途离开重置）；
// boarding 满 3s → 返回 'victory' 且 state='done'。其余时刻返回 'none'。
export function updateHelicopter(h, player, dt) {
  if (h.state === 'landing') {
    h.t += dt;
    if (h.t >= LANDING_TIME) { h.state = 'waiting'; h.t = 0; }
    return 'none';
  }
  if (h.state === 'waiting') {
    const d = Math.hypot(player.x - h.x, player.y - h.y);
    if (d < h.r) { h.state = 'boarding'; h.t = 0; }
    return 'none';
  }
  if (h.state === 'boarding') {
    const d = Math.hypot(player.x - h.x, player.y - h.y);
    if (d >= h.r) { h.state = 'waiting'; h.t = 0; return 'none'; }
    h.t += dt;
    if (h.t >= BOARDING_TIME) { h.state = 'done'; return 'victory'; }
    return 'none';
  }
  return 'none'; // done
}

// 几何绘制：机身 + 旋翼旋转 + 登机进度弧。仅函数体内使用 ctx。
export function renderHelicopter(ctx, h) {
  ctx.save();
  ctx.translate(h.x, h.y);
  // 旋翼（以 t 驱动旋转；landing/boarding 期间持续转动）
  ctx.save();
  ctx.rotate(h.t * 15);
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(-h.r * 1.4, -6, h.r * 2.8, 12);
  ctx.restore();
  // 机尾
  ctx.fillStyle = '#4a5d6e';
  ctx.fillRect(-h.r * 0.9, -10, h.r * 0.5, 20);
  // 机身
  ctx.fillStyle = '#3c8a5e';
  ctx.beginPath();
  ctx.arc(0, 0, h.r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  // 座舱
  ctx.fillStyle = '#b8e0f0';
  ctx.beginPath();
  ctx.arc(h.r * 0.18, 0, h.r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // 着陆架
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-h.r * 0.3, h.r * 0.5);
  ctx.lineTo(-h.r * 0.45, h.r * 0.75);
  ctx.moveTo(h.r * 0.3, h.r * 0.5);
  ctx.lineTo(h.r * 0.45, h.r * 0.75);
  ctx.stroke();
  // 登机进度弧（boarding 中绘制，圆心=玩家进入点，用 h.t 表达进度）
  if (h.state === 'boarding') {
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, h.r + 12, -Math.PI / 2, -Math.PI / 2 + (h.t / BOARDING_TIME) * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
