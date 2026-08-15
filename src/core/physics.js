// src/core/physics.js
export function circleHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by, r = ar + br;
  return dx * dx + dy * dy < r * r;
}

export function circleRectHit(cx, cy, cr, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

export function resolveCircleRect(cx, cy, cr, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= cr * cr) return { x: cx, y: cy };
  if (d2 === 0) { // 圆心在矩形内：沿最近面推出
    const left = cx - rect.x, right = rect.x + rect.w - cx;
    const top = cy - rect.y, bottom = rect.y + rect.h - cy;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: rect.x - cr, y: cy };
    if (m === right) return { x: rect.x + rect.w + cr, y: cy };
    if (m === top) return { x: cx, y: rect.y - cr };
    return { x: cx, y: rect.y + rect.h + cr };
  }
  const d = Math.sqrt(d2);
  return { x: nx + (dx / d) * cr, y: ny + (dy / d) * cr };
}

export function slideCircleObstacles(e, obstacles) {
  for (const o of obstacles) {
    if (o.kind === 'circle') {
      const dx = e.x - o.x, dy = e.y - o.y;
      const min = e.r + o.r;
      const d = Math.hypot(dx, dy);
      if (d < min && d > 0) { e.x = o.x + dx / d * min; e.y = o.y + dy / d * min; }
    } else {
      const r = resolveCircleRect(e.x, e.y, e.r, o);
      e.x = r.x; e.y = r.y;
    }
  }
}

export function createSpatialHash(cellSize = 64) {
  const map = new Map();
  const key = (cx, cy) => cx + ':' + cy;
  return {
    clear() { map.clear(); },
    insert(e) {
      const x0 = Math.floor((e.x - e.r) / cellSize), x1 = Math.floor((e.x + e.r) / cellSize);
      const y0 = Math.floor((e.y - e.r) / cellSize), y1 = Math.floor((e.y + e.r) / cellSize);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const k = key(cx, cy);
        let arr = map.get(k);
        if (!arr) { arr = []; map.set(k, arr); }
        arr.push(e);
      }
    },
    query(x, y, r) {
      const out = [], seen = new Set();
      const x0 = Math.floor((x - r) / cellSize), x1 = Math.floor((x + r) / cellSize);
      const y0 = Math.floor((y - r) / cellSize), y1 = Math.floor((y + r) / cellSize);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const arr = map.get(key(cx, cy));
        if (!arr) continue;
        for (const e of arr) if (!seen.has(e)) { seen.add(e); out.push(e); }
      }
      return out;
    },
  };
}
