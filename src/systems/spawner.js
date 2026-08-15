import { getTierConfig, GRACE_PERIOD, MAX_ZOMBIES, SURGE_CAP } from '../config/difficulty.js';
import { ZOMBIES } from '../config/zombies.js';
import { pickWeighted } from '../core/rng.js';
import { createZombie } from '../entities/zombie.js';

const MAP_MARGIN = 20;

export function createSpawner() {
  return { budget: 0, lastTier: 1 };
}

function spawnRadius(cam) {
  return Math.hypot(cam.viewW / 2, cam.viewH / 2) + 100; // 半对角线 + 余量：圆环任意点必在屏幕外
}

// 取镜头视野外一点的公共函数（供包围潮/Boss 注入复用）
export function offscreenPoint(cam, mapSize, rng) {
  const r = spawnRadius(cam);
  for (let i = 0; i < 10; i++) {
    const angle = rng() * Math.PI * 2;
    const x = cam.x + cam.viewW / 2 + Math.cos(angle) * r;
    const y = cam.y + cam.viewH / 2 + Math.sin(angle) * r;
    if (x >= MAP_MARGIN && x <= mapSize - MAP_MARGIN &&
        y >= MAP_MARGIN && y <= mapSize - MAP_MARGIN) return { x, y };
  }
  return {
    x: MAP_MARGIN + rng() * (mapSize - MAP_MARGIN * 2),
    y: MAP_MARGIN + rng() * (mapSize - MAP_MARGIN * 2),
  };
}

function pickSpawnPoint(cam, mapSize, rng) {
  return offscreenPoint(cam, mapSize, rng);
}

export function updateSpawner(sp, time, cam, mapSize, zombies, aliveCount, rng, dt, budgetMult = 1, cfgFn = getTierConfig) {
  const cfg = cfgFn(time);
  let bps = cfg.budgetPerSec;
  if (time < GRACE_PERIOD) bps = 0.5 + (cfg.budgetPerSec - 0.5) * (time / GRACE_PERIOD);
  bps *= budgetMult; // 坚守模式高峰（surgeFrom 起）预算 ×1.5
  sp.budget = Math.min(sp.budget + bps * dt, bps * 2);

  let spawned = 0;

  // 档位切换：环形包围潮（不消耗预算，但受 MAX_ZOMBIES 同屏上限约束）
  if (cfg.tier > sp.lastTier) {
    const n = Math.min(20 + (cfg.tier - 1) * 5, SURGE_CAP);
    const r = spawnRadius(cam);
    const cx = cam.x + cam.viewW / 2, cy = cam.y + cam.viewH / 2;
    for (let i = 0; i < n; i++) {
      if (aliveCount + spawned >= MAX_ZOMBIES) break;
      const angle = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (x < MAP_MARGIN || x > mapSize - MAP_MARGIN ||
          y < MAP_MARGIN || y > mapSize - MAP_MARGIN) continue; // 落点越界跳过
      zombies.push(createZombie(pickWeighted(rng, cfg.weights), x, y, cfg));
      spawned++;
    }
    sp.lastTier = cfg.tier;
  }

  // 常规刷怪（预算制，每帧最多 20 次）
  let guard = 0;
  while (guard++ < 20) {
    if (aliveCount + spawned >= MAX_ZOMBIES) break;
    const type = pickWeighted(rng, cfg.weights);
    if (sp.budget < ZOMBIES[type].cost) break;
    sp.budget -= ZOMBIES[type].cost;
    const p = pickSpawnPoint(cam, mapSize, rng);
    zombies.push(createZombie(type, p.x, p.y, cfg));
    spawned++;
  }
  return spawned;
}
