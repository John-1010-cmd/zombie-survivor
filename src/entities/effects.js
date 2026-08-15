// 打击感特效：粒子爆发 + 浮动伤害数字。纯逻辑模块，无 DOM 依赖；
// rng 由调用方注入，渲染函数只接收外部 ctx。
export function spawnParticles(arr, x, y, color, n, rng) {
  for (let i = 0; i < n; i++) {
    const angle = rng() * Math.PI * 2;
    const speed = 60 + rng() * 120;
    arr.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4, maxLife: 0.4,
      color,
      r: 2 + rng() * 2,
    });
  }
}

export function updateParticles(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { // swap-remove：末位元素换到 i 后 pop，原地压缩
      arr[i] = arr[arr.length - 1];
      arr.pop();
    }
  }
}

export function spawnFloater(arr, x, y, text, color) {
  arr.push({ x, y, text, color, life: 0.7 });
}

export function updateFloaters(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const f = arr[i];
    f.y -= 40 * dt; // 上浮
    f.life -= dt;
    if (f.life <= 0) {
      arr[i] = arr[arr.length - 1];
      arr.pop();
    }
  }
}

// ---- 弹道特效：爆炸环 + 磁电闪电（迭代 04）。纯逻辑，rng 注入。----

// 爆炸：扩张描边圆（r0→r1）+ 16 个橙色粒子（复用 spawnParticles）。
export function spawnExplosion(arr, x, y, radius, rng) {
  arr.push({ type: 'ring', x, y, r0: 12, r1: radius, life: 0.25, maxLife: 0.25 });
  spawnParticles(arr, x, y, '#f80', 16, rng);
}

// 磁电闪电：起终点间 5 段折线（共 6 个点），中间 4 点沿直线插值并加垂直抖动 ±14px。
export function spawnLightning(arr, x1, y1, x2, y2, rng) {
  const pts = [{ x: x1, y: y1 }];
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    pts.push({
      x: x1 + (x2 - x1) * t,
      y: y1 + (y2 - y1) * t + (rng() * 2 - 1) * 14,
    });
  }
  pts.push({ x: x2, y: y2 });
  arr.push({ type: 'bolt', pts, life: 0.12, maxLife: 0.12 });
}

export function updateEffects(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const e = arr[i];
    e.life -= dt;
    if (e.life <= 0) { // swap-remove：末位元素换到 i 后 pop，原地压缩
      arr[i] = arr[arr.length - 1];
      arr.pop();
    }
  }
}

// 渲染辅助：不进单测（需要真实 canvas ctx），联调时人工验证。
// globalAlpha 随 life/maxLife 线性衰减，粒子熄灭前逐渐淡出。
export function renderParticles(ctx, arr) {
  for (const p of arr) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  ctx.globalAlpha = 1;
}

export function renderFloaters(ctx, arr) {
  ctx.textAlign = 'center';
  ctx.font = '14px sans-serif';
  for (const f of arr) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.7));
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// 弹道特效渲染：不进单测（需要真实 canvas ctx），联调时人工验证。
// ring=扩张描边圆（半径随 life 进度 r0→r1，alpha 衰减，#f80）；bolt=青色 #5ef 折线。
export function renderEffects(ctx, arr) {
  for (const e of arr) {
    const t = Math.max(0, Math.min(1, e.life / e.maxLife));
    if (e.type === 'ring') {
      ctx.globalAlpha = t;
      ctx.strokeStyle = '#f80';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r0 + (e.r1 - e.r0) * (1 - t), 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'bolt') {
      ctx.globalAlpha = t;
      ctx.strokeStyle = '#5ef';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.pts[0].x, e.pts[0].y);
      for (let i = 1; i < e.pts.length; i++) ctx.lineTo(e.pts[i].x, e.pts[i].y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
