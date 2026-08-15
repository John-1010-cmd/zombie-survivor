// src/game.js —— 战斗场景组装（DOM 层胶水，无单测）
// 迭代 02：银币经济 + 商店建筑 + 道具数字键 + 三模式（无尽/坚守10/坚守20）+ 直升机救援 + 守门 Boss + 音效
import { mulberry32 } from './core/rng.js';
import { createPool } from './core/pool.js';
import { circleHit, createSpatialHash } from './core/physics.js';
import { createCamera, updateCamera, addShake } from './core/camera.js';
import { generateMap, MAP_SIZE } from './systems/map.js';
import { createPlayer, updatePlayer, damagePlayer } from './entities/player.js';
import { createZombie, updateZombie } from './entities/zombie.js';
import { createWeapon, updateWeapon } from './entities/weapon.js';
import { createProjectile, resetProjectile, updateProjectile } from './entities/projectile.js';
import { resolveProjectileHits, explode } from './systems/combat.js';
import { createSpawner, updateSpawner, offscreenPoint } from './systems/spawner.js';
import { createCoin, updateCoin } from './entities/coin.js';
import { createHelicopter, updateHelicopter, renderHelicopter } from './entities/helicopter.js';
import { createInventory, addItem, useItem } from './systems/inventory.js';
import { catalogFor, buy } from './systems/shop.js';
import { ITEMS } from './config/items.js';
import { MODES, TIER_DURATION } from './config/difficulty.js';
import { earlyTierBonus } from './config/economy.js';
import { showShop } from './ui/shop.js';
import {
  spawnParticles, updateParticles, renderParticles,
  spawnFloater, updateFloaters, renderFloaters,
} from './entities/effects.js';
import { ZOMBIES } from './config/zombies.js';
import { renderHud } from './systems/hud.js';

const MAX_PROJECTILES = 400; // spec §9 子弹上限
const MAX_PARTICLES = 500;   // spec §9 粒子上限
const MAX_FLOATERS = 100;    // 伤害数字上限
const HOLDOUT10_SEGMENT = 100; // 坚守 10 分钟压缩段长（spec §5.3）
const ITEM_DROP_TABLE = [ // 僵尸掉落道具概率（spec §7）
  { id: 'medkit', chance: 0.005 },
  { id: 'magnet', chance: 0.003 },
  { id: 'bomb', chance: 0.003 },
];

export function createGameScene(deps) {
  const { canvas, input, mode = 'endless', audio, settings, onGameOver } = deps;
  const modeCfg = MODES[mode] || MODES.endless;
  const cfgFn = modeCfg.getCfg;
  const segLen = mode === 'holdout10' ? HOLDOUT10_SEGMENT : TIER_DURATION;

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

  const projectiles = [];
  let aliveCount = 0;
  let activeProjectiles = 0;
  let magnetAllUntil = -1;      // 磁铁道具：全场银币吸附截止时刻
  let shopLatch = false;        // 关闭商店后须离开交互半径才能重开（spec §4.6）
  let shopOpen = false;
  let bossSpawned = false;
  let rescueAlerted = false;
  let over = false;             // 本局已出结算，防重复回调
  let lastShotSound = -1;       // 射击音节流
  let lastShotSoundId = '';

  const scene = {
    update, render,
    paused: false,
    player,
    mode,
    duration: modeCfg.duration || 0,
    // 武器必须经 scene.weapon 引用：换枪会重绑 game.weapon（buy），
    // 若用闭包局部变量，开火管线将与 UI 显示脱钩（UI 换枪、实际仍用旧武器）
    weapon: createWeapon('pistol'),
    zombies: [],
    coins: 0,
    inventory: createInventory(),
    coinsOnGround: map.scatteredCoins.map(c => createCoin(c.x, c.y, c.value)),
    particles: [],
    floaters: [],
    time: 0,
    kills: 0,
    rng,
    shops: map.shops,
    helicopter: null,
    tierRemaining: segLen, // 商店目录用：当前档剩余秒数（每帧更新）
    useItemKey,
    togglePause,
    applyEarlyTier,
  };

  function sound(id) { if (audio) audio.play(id); }

  function spawnProjectile(opts) {
    if (activeProjectiles >= MAX_PROJECTILES) return;
    const p = projPool.obtain(opts);
    activeProjectiles++;
    projectiles.push(p);
    // 射击音节流：同一武器 0.12s 内不重复触发
    const sid = scene.weapon.id === 'mg' ? 'shootMG' : 'shoot';
    if (sid !== lastShotSoundId || scene.time - lastShotSound > 0.12) {
      lastShotSound = scene.time;
      lastShotSoundId = sid;
      sound(sid);
    }
  }

  function killZombie(z) {
    scene.kills++;
    scene.coinsOnGround.push(createCoin(z.x, z.y, z.coin));
    for (const d of ITEM_DROP_TABLE) {
      if (rng() < d.chance) { addItem(scene.inventory, d.id, 1); break; }
    }
    if (scene.particles.length < MAX_PARTICLES)
      spawnParticles(scene.particles, z.x, z.y, '#5eff8a', 12, rng);
  }

  function hitZombie(z, dmg) {
    if (settings && !settings.damageNumbers) return;
    if (scene.floaters.length < MAX_FLOATERS)
      spawnFloater(scene.floaters, z.x, z.y - 20, String(Math.round(dmg)), '#ffd75e');
  }

  function shake(mag) {
    if (settings && !settings.screenShake) return;
    addShake(camera, mag);
  }

  function gameOver(stats) {
    if (over) return;
    over = true;
    scene.paused = true;
    if (audio) audio.stop('heli');
    onGameOver({ time: scene.time, kills: scene.kills, hp: Math.max(0, Math.ceil(player.hp)), mode, ...stats });
  }

  // 数字键道具使用（不暂停）
  function useItemKey(n) {
    if (scene.paused || over) return;
    let id = null;
    for (const it of Object.values(ITEMS)) if (it.key === n) id = it.id;
    if (!id || !useItem(scene.inventory, id)) { sound('click'); return; }
    if (id === 'medkit') {
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.5);
      spawnFloater(scene.floaters, player.x, player.y - 30, '+' + Math.round(player.maxHp * 0.5), '#4d4');
    } else if (id === 'magnet') {
      magnetAllUntil = scene.time + 2.5; // 1500px/s × 2.5s 覆盖全图最远银币
      spawnFloater(scene.floaters, player.x, player.y - 30, '磁铁！', '#5ef');
    } else if (id === 'bomb') {
      explode(player.x, player.y, 350, 250, scene.zombies, z => hitZombie(z, 250), killZombie);
      shake(10);
      sound('explosion');
      spawnFloater(scene.floaters, player.x, player.y - 30, '轰！', '#f80');
    }
  }

  // Esc：商店打开时先关商店，否则切换暂停菜单（由 main.js 的 overlay 承载）
  function togglePause() {
    if (over) return;
    if (shopOpen) { closeShop(); return; }
    scene.paused = !scene.paused;
    if (!scene.paused) sound('click');
  }

  // 商店：进入交互半径唤出（暂停），离开半径后才能重开
  function openShop() {
    shopOpen = true;
    scene.paused = true;
    sound('click');
    const render = () => showShop(document.getElementById('shop'), scene, {
      onBuy: entry => {
        if (buy(scene, entry)) {
          sound('buy');
          render(); // 重新渲染目录与余额
        } else {
          sound('click');
        }
      },
      onEarlyTier: bonus => {
        scene.applyEarlyTier(bonus);
        sound('buy');
        closeShop();
      },
      onClose: () => closeShop(),
    });
    render();
  }

  function closeShop() {
    shopOpen = false;
    shopLatch = true; // 须离开交互半径才能重开
    document.getElementById('shop').classList.add('hidden');
    scene.paused = false;
  }

  // 提前难度：时间轴快进到下一档起点，发放奖励银币（包围潮由 spawner 档位切换自然触发）
  function applyEarlyTier(bonus) {
    const cfg = cfgFn(scene.time);
    scene.time = cfg.tier * segLen;
    scene.coins += bonus;
    spawnFloater(scene.floaters, player.x, player.y - 40, '提前进入下一档！+' + bonus + ' 银币', '#ffd75e');
  }

  function update(dt) {
    if (scene.paused || over) return;
    scene.time += dt;

    updatePlayer(player, input.state, map.obstacles, MAP_SIZE, dt);
    updateWeapon(scene.weapon, player, scene.zombies, spawnProjectile, rng, dt);

    // 当前档剩余秒数（商店目录/提前难度奖励）
    scene.tierRemaining = (cfgFn(scene.time).tier) * segLen - scene.time;

    // 刷怪：坚守高峰（surgeFrom 起）预算 ×1.5
    const budgetMult = modeCfg.surgeFrom && scene.time >= modeCfg.surgeFrom ? 1.5 : 1;
    aliveCount += updateSpawner(spawner, scene.time, camera, MAP_SIZE, scene.zombies, aliveCount, rng, dt, budgetMult, cfgFn);

    // 守门 Boss 注入（坚守模式，bossAt 时刻一次）
    if (modeCfg.bossAt && !bossSpawned && scene.time >= modeCfg.bossAt) {
      bossSpawned = true;
      const p = offscreenPoint(camera, MAP_SIZE, rng);
      scene.zombies.push(createZombie('boss', p.x, p.y, cfgFn(scene.time)));
      aliveCount++;
      sound('alarm');
      shake(8);
      spawnFloater(scene.floaters, player.x, player.y - 50, '守门 Boss 出现！', '#f55');
    }

    // 坚守：剩 60s 警报；归零生成直升机
    if (modeCfg.duration) {
      const remain = modeCfg.duration - scene.time;
      if (!rescueAlerted && remain <= 60 && remain > 0) {
        rescueAlerted = true;
        sound('alarm');
        spawnFloater(scene.floaters, player.x, player.y - 50, '救援即将抵达，前往撤离点（地图中心）！', '#ffd75e');
      }
      if (!scene.helicopter && scene.time >= modeCfg.duration) {
        scene.helicopter = createHelicopter(MAP_SIZE / 2, MAP_SIZE / 2);
        sound('heli');
        spawnFloater(scene.floaters, player.x, player.y - 50, '直升机已降落！', '#5ef');
      }
    }

    for (const z of scene.zombies) {
      if (z.alive) updateZombie(z, player, map.obstacles, dt);
    }
    for (const p of projectiles) {
      if (p.alive) updateProjectile(p, dt);
    }

    hash.clear();
    for (const z of scene.zombies) if (z.alive) hash.insert(z);

    resolveProjectileHits(projectiles, hash, map.obstacles,
      killZombie,
      (z, p) => hitZombie(z, p.damage));

    // 接触伤害：命中才扣血，扣血即震屏 + 受伤音
    for (const z of scene.zombies) {
      if (!z.alive) continue;
      if (circleHit(player.x, player.y, player.r, z.x, z.y, z.r) &&
          damagePlayer(player, z.damage)) {
        shake(6);
        sound('hurt');
        if (player.hp <= 0) { gameOver({ cleared: false }); return; }
      }
    }

    // 银币：磁吸/全场吸附拾取
    const magnetAll = scene.time < magnetAllUntil;
    for (let i = scene.coinsOnGround.length - 1; i >= 0; i--) {
      const c = scene.coinsOnGround[i];
      if (!updateCoin(c, player, dt, magnetAll)) continue;
      scene.coinsOnGround[i] = scene.coinsOnGround[scene.coinsOnGround.length - 1];
      scene.coinsOnGround.pop();
      scene.coins += c.value;
      sound('coin');
    }

    // 直升机登机判定
    if (scene.helicopter && updateHelicopter(scene.helicopter, player, dt) === 'victory') {
      gameOver({ cleared: true });
      return;
    }

    // 商店：进入交互半径唤出；离开半径解除重开锁
    let inShopRange = false;
    for (const s of map.shops) {
      if (Math.hypot(player.x - s.x, player.y - s.y) < s.interactR) { inShopRange = true; break; }
    }
    if (shopLatch && !inShopRange) shopLatch = false;
    if (!shopOpen && !shopLatch && inShopRange) openShop();

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
    ctx.fillStyle = '#1a2418';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x + camera.offX, -camera.y + camera.offY);

    ctx.strokeStyle = '#4a4a52';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

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

    // 商店建筑：土黄色圆顶 + "店"字（不阻挡移动/弹道，spec §4.5）
    for (const s of map.shops) {
      ctx.fillStyle = '#7a5c3e';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c9a06a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffe9c9';
      ctx.font = '28px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('店', s.x, s.y + 10);
      // 交互半径提示（玩家靠近时）
      if (Math.hypot(player.x - s.x, player.y - s.y) < s.interactR + 120) {
        ctx.fillStyle = 'rgba(255,215,94,.6)';
        ctx.font = '16px "Microsoft YaHei", sans-serif';
        ctx.fillText('商店：走近自动打开', s.x, s.y - s.r - 14);
      }
    }

    // 撤离点提示（坚守模式警报后）
    if (modeCfg.duration && rescueAlerted && !scene.helicopter) {
      ctx.strokeStyle = 'rgba(94,239,255,.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 银币（金色菱形）
    ctx.fillStyle = '#ffd75e';
    for (const c of scene.coinsOnGround) {
      const s = 3 + Math.min(c.value, 5);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - s);
      ctx.lineTo(c.x + s, c.y);
      ctx.lineTo(c.x, c.y + s);
      ctx.lineTo(c.x - s, c.y);
      ctx.closePath();
      ctx.fill();
    }

    // 僵尸：配置颜色圆 + 受击闪白 + 头顶血条
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

    // 直升机（在僵尸之上、玩家之下）
    if (scene.helicopter) renderHelicopter(ctx, scene.helicopter);

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
    ctx.textAlign = 'left';

    renderHud(ctx, scene); // 屏幕空间绘制，必须在 camera 变换 ctx.restore() 之后调用
  }

  return scene;
}
