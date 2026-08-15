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
