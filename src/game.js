// src/game.js —— 战斗场景组装（DOM 层胶水，无单测）
import { mulberry32 } from './core/rng.js';
import { createPool } from './core/pool.js';
import { circleHit, createSpatialHash } from './core/physics.js';
import { createCamera, updateCamera, addShake } from './core/camera.js';
import { generateMap, MAP_SIZE } from './systems/map.js';
import { createPlayer, updatePlayer, damagePlayer } from './entities/player.js';
import { updateZombie } from './entities/zombie.js';
import { createWeapon, updateWeapon } from './entities/weapon.js';
import { createProjectile, resetProjectile, updateProjectile } from './entities/projectile.js';
import { resolveProjectileHits } from './systems/combat.js';
import { createSpawner, updateSpawner } from './systems/spawner.js';
import { createGem, updateGem } from './entities/xpGem.js';
import { addXp } from './systems/progression.js';
import {
  spawnParticles, updateParticles, renderParticles,
  spawnFloater, updateFloaters, renderFloaters,
} from './entities/effects.js';
import { ZOMBIES } from './config/zombies.js';

const MAX_PROJECTILES = 400; // 全局性能上限（spec §9）
const MAX_PARTICLES = 500;   // spec §9 粒子上限
const MAX_FLOATERS = 100;    // 伤害数字上限（计划自定，防高射速下无界增长）

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function createGameScene(deps) {
  const { canvas, input, onLevelUp, onGameOver } = deps;
  const rng = mulberry32((Math.random() * 2 ** 31) | 0); // DOM 层允许 Math.random 做种子
  const map = generateMap(rng);
  const player = createPlayer(map.spawn.x, map.spawn.y);
  const camera = createCamera(canvas.width, canvas.height);
  const hash = createSpatialHash(64);
  const spawner = createSpawner();
  const projPool = createPool(
    () => createProjectile(),
    (p, opts) => resetProjectile(p, opts),
  );

  const projectiles = []; // 内部数组，不在 scene 暴露清单内
  let aliveCount = 0;
  let activeProjectiles = 0;

  const scene = {
    update, render,
    paused: false,
    player,
    // 武器必须经 scene.weapon 引用：swap 卡会重绑 game.weapon（applyCard），
    // 若用闭包局部变量，开火管线将与 UI 显示脱钩（UI 换枪、实际仍用旧武器）
    weapon: createWeapon('pistol'),
    zombies: [],
    gems: map.scatteredGems.map(g => createGem(g.x, g.y, g.value)),
    particles: [],
    floaters: [],
    time: 0,
    kills: 0,
    rng,
    pendingLevelUps: 0,
  };

  // 注入给 updateWeapon 的开火回调：opts 为单个对象；上限 400，满则新弹直接丢弃
  function spawnProjectile(opts) {
    if (activeProjectiles >= MAX_PROJECTILES) return;
    const p = projPool.obtain(opts);
    activeProjectiles++;
    projectiles.push(p);
  }

  function update(dt) {
    if (scene.paused) return;
    scene.time += dt;

    updatePlayer(player, input.state, map.obstacles, MAP_SIZE, dt);
    updateWeapon(scene.weapon, player, scene.zombies, spawnProjectile, rng, dt);

    // 刷怪：新僵尸由 spawner 直接 push 进 scene.zombies，返回新刷数量
    // 刷怪圆心取镜头中心（上一帧位置；半径含 +100 余量，可容忍 1 帧滞后），保证屏幕外刷怪
    aliveCount += updateSpawner(spawner, scene.time, camera, MAP_SIZE, scene.zombies, aliveCount, rng, dt);

    for (const z of scene.zombies) {
      if (z.alive) updateZombie(z, player, map.obstacles, dt);
    }
    for (const p of projectiles) {
      if (p.alive) updateProjectile(p, dt);
    }

    // 每帧重建空间网格
    hash.clear();
    for (const z of scene.zombies) if (z.alive) hash.insert(z);

    resolveProjectileHits(projectiles, hash, map.obstacles,
      z => { // onKill
        scene.kills++;
        scene.gems.push(createGem(z.x, z.y, z.xp));
        if (scene.particles.length < MAX_PARTICLES) // spec §9：粒子 ≤ 500
          spawnParticles(scene.particles, z.x, z.y, '#5eff8a', 12, rng);
      },
      (z, p) => { // onHit
        if (scene.floaters.length < MAX_FLOATERS)
          spawnFloater(scene.floaters, z.x, z.y - 20, String(Math.round(p.damage)), '#ffd75e');
      });

    // 接触伤害：命中才扣血，扣血即震屏
    for (const z of scene.zombies) {
      if (!z.alive) continue;
      if (circleHit(player.x, player.y, player.r, z.x, z.y, z.r) &&
          damagePlayer(player, z.damage)) {
        addShake(camera, 6);
        if (player.hp <= 0) {
          scene.paused = true;
          onGameOver({ time: scene.time, kills: scene.kills, level: player.level });
          return;
        }
      }
    }

    // 经验球：被拾取则累加经验，升级即暂停；同帧多颗升级只回调一次
    let levelUpThisFrame = false;
    for (let i = scene.gems.length - 1; i >= 0; i--) {
      const g = scene.gems[i];
      if (!updateGem(g, player, dt)) continue;
      scene.gems[i] = scene.gems[scene.gems.length - 1];
      scene.gems.pop();
      const ups = addXp(player, g.value);
      if (ups > 0) {
        scene.pendingLevelUps += ups;
        scene.paused = true;
        levelUpThisFrame = true;
      }
    }
    if (levelUpThisFrame) onLevelUp(scene);

    // 死僵尸与死弹道 swap-remove 压缩数组
    for (let i = scene.zombies.length - 1; i >= 0; i--) {
      if (!scene.zombies[i].alive) {
        scene.zombies[i] = scene.zombies[scene.zombies.length - 1];
        scene.zombies.pop();
        aliveCount--;
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p.alive) {
        projectiles[i] = projectiles[projectiles.length - 1];
        projectiles.pop();
        projPool.release(p);
        activeProjectiles--;
      }
    }

    updateCamera(camera, player, MAP_SIZE, rng, dt);
    updateParticles(scene.particles, dt);
    updateFloaters(scene.floaters, dt);
  }

  function render(ctx) {
    // 清屏
    ctx.fillStyle = '#1a2418';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 世界空间
    ctx.save();
    ctx.translate(-camera.x + camera.offX, -camera.y + camera.offY);

    // 地图边界
    ctx.strokeStyle = '#4a4a52';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

    // 障碍物
    ctx.fillStyle = '#4a4a52';
    for (const o of map.obstacles) {
      if (o.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(o.x, o.y, o.w, o.h);
      }
    }

    // 经验球（#5eff8a 菱形）
    ctx.fillStyle = '#5eff8a';
    for (const g of scene.gems) {
      const s = 3 + Math.min(g.value, 5);
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - s);
      ctx.lineTo(g.x + s, g.y);
      ctx.lineTo(g.x, g.y + s);
      ctx.lineTo(g.x - s, g.y);
      ctx.closePath();
      ctx.fill();
    }

    // 僵尸：配置颜色圆 + 受击闪白覆盖 + 头顶血条
    for (const z of scene.zombies) {
      const c = ZOMBIES[z.type];
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
      if (z.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, z.hitFlash / 0.1);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (z.hp < z.maxHp) {
        const bw = z.r * 2, bh = 3;
        const x = z.x - bw / 2, y = z.y - z.r - 8;
        ctx.fillStyle = '#a33';
        ctx.fillRect(x, y, bw, bh);
        ctx.fillStyle = '#5eff8a';
        ctx.fillRect(x, y, bw * Math.max(0, z.hp / z.maxHp), bh);
      }
    }

    // 玩家：白圆 + facing 方向短线，无敌帧半透明闪烁
    if (player.invuln > 0) ctx.globalAlpha = 0.45 + 0.35 * Math.sin(scene.time * 24);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.facing) * player.r, player.y + Math.sin(player.facing) * player.r);
    ctx.stroke();

    // 弹道：#ffe066 长 8 的线段
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 2;
    for (const p of projectiles) {
      const dx = Math.cos(p.angle) * 4, dy = Math.sin(p.angle) * 4;
      ctx.beginPath();
      ctx.moveTo(p.x - dx, p.y - dy);
      ctx.lineTo(p.x + dx, p.y + dy);
      ctx.stroke();
    }

    renderParticles(ctx, scene.particles);
    renderFloaters(ctx, scene.floaters);

    ctx.restore();

    // 最小 HUD（Task 15 抽到 hud.js）：左上血条 + 右上计时
    const bw = 240, bh = 14;
    ctx.fillStyle = '#a33';
    ctx.fillRect(12, 12, bw, bh);
    ctx.fillStyle = '#5eff8a';
    ctx.fillRect(12, 12, bw * Math.max(0, player.hp / player.maxHp), bh);

    ctx.fillStyle = '#eee';
    ctx.font = '24px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(scene.time), canvas.width - 16, 32);
    ctx.textAlign = 'left';
  }

  return scene;
}
