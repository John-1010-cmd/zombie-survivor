// src/game.js —— 战斗场景组装（DOM 层胶水，无单测）
// 迭代 03：分维强化 / 新武器三把 / 部署物（固定火炮+围墙）/ 辅助武器 / 僵尸啃食 / 射程圈
import { mulberry32 } from './core/rng.js';
import { createPool } from './core/pool.js';
import { circleHit, createSpatialHash } from './core/physics.js';
import { createCamera, updateCamera, addShake } from './core/camera.js';
import { generateMap, MAP_SIZE, renderObstacle } from './systems/map.js';
import { createPlayer, updatePlayer, damagePlayer } from './entities/player.js';
import { createZombie, updateZombie } from './entities/zombie.js';
import { createWeapon, updateWeapon, weaponStats } from './entities/weapon.js';
import { createProjectile, resetProjectile, updateProjectile } from './entities/projectile.js';
import { resolveProjectileHits, explode } from './systems/combat.js';
import { createSpawner, updateSpawner, offscreenPoint } from './systems/spawner.js';
import { createCoin, updateCoin } from './entities/coin.js';
import { createHelicopter, updateHelicopter, renderHelicopter } from './entities/helicopter.js';
import { createInventory, addItem, useItem } from './systems/inventory.js';
import { catalogFor, buy } from './systems/shop.js';
import { createAux, spawnAuxBodies, updateAuxBodies, AUX_CONFIG } from './entities/companions.js';
import { createTurret, updateTurret, TURRET_VISUAL_ID } from './entities/turret.js';
import { createTeslaBall, updateTeslaBall } from './entities/teslaball.js';
import { createWallSegment, WALL_VISUAL_ID } from './entities/wall.js';
import { drawVisual } from './core/visuals.js';
import { ITEMS } from './config/items.js';
import { MODES, TIER_DURATION, MAX_ZOMBIES } from './config/difficulty.js';
import { ADVENTURE_TIER_DURATION, ADVENTURE_DURATION, adventureLevelById, adventureLevelIndex, makeAdventureCfg } from './config/adventure.js';
import {
  createParticlePool,
  spawnParticles, updateParticles, renderParticles,
  spawnFloater, updateFloaters, renderFloaters,
  spawnExplosion, spawnLightning, updateEffects, renderEffects,
} from './entities/effects.js';
import { MONSTERS } from './config/bestiary/monsters.js';
import { renderZombie, renderProjectiles } from './entities/render.js';
import { BEHAVIORS } from './systems/behaviors.js';
import { recordKill } from './core/meta.js';
import { renderHud } from './systems/hud.js';
import { showShop } from './ui/shop.js';

const MAX_PROJECTILES = 400;
const MAX_PARTICLES = 500;
const MAX_FLOATERS = 100;
const MAX_EFFECTS = 200;    // 爆环/闪电特效上限（迭代 05：随弹道叠加）
const HOLDOUT10_SEGMENT = 100;
const MAX_TURRETS = 30;  // 场上固定火炮上限（迭代 08：6→30，性能安全阀；用户裁定调大）
// 围墙无上限（迭代 08：用户裁定取消上限）
const ITEM_DROP_TABLE = [
  { id: 'medkit', chance: 0.005 },
  { id: 'magnet', chance: 0.003 },
  { id: 'bomb', chance: 0.003 },
];

export function createGameScene(deps) {
  const {
    canvas,
    viewport: initialViewport = null,
    input,
    mode = 'endless',
    levelId = null,
    audio,
    settings,
    meta = null,
    onGameOver,
  } = deps;
  const isAdventure = mode === 'adventure';
  const advLevel = isAdventure ? adventureLevelById(levelId) : null;
  if (isAdventure && !advLevel) throw new Error('未知冒险关卡: ' + levelId);
  const modeCfg = isAdventure ? null : (MODES[mode] || MODES.endless);
  const cfgFn = isAdventure ? makeAdventureCfg(advLevel) : modeCfg.getCfg;
  const segLen = isAdventure ? ADVENTURE_TIER_DURATION : (mode === 'holdout10' ? HOLDOUT10_SEGMENT : TIER_DURATION);
  const scalingCtx = { mode, level: isAdventure ? adventureLevelIndex(levelId) : 1 };

  const rng = mulberry32((Math.random() * 2 ** 31) | 0);
  const map = generateMap(rng);
  const player = createPlayer(map.spawn.x, map.spawn.y);
  const viewport = {
    width: Math.max(1, initialViewport?.width ?? canvas.clientWidth ?? canvas.width ?? 1),
    height: Math.max(1, initialViewport?.height ?? canvas.clientHeight ?? canvas.height ?? 1),
  };
  const camera = createCamera(viewport.width, viewport.height);
  const hash = createSpatialHash(64);
  const spawner = createSpawner();
  const projPool = createPool(
    () => createProjectile(),
    (p, opts) => resetProjectile(p, opts),
  );
  // 粒子对象池（设计 §9.3）：createGameScene 闭包级，全部粒子调用点可见；随 scene 一起 GC
  const particlePool = createParticlePool();

  const projectiles = [];
  let aliveCount = 0;
  let activeProjectiles = 0;
  let magnetAllUntil = -1;
  let shopLatch = false;
  let shopOpen = false;
  let bossSpawned = false;
  let rescueAlerted = false;
  let over = false;
  let lastShotSound = -1;
  let lastShotSoundId = '';
  let lastShotAngle = 0; // 最近一次发射的弹道角（电磁球扇形发散用，迭代 07）
  let prevTier = cfgFn(0).tier; // 横幅触发：档位变化检测（迭代 06）
  let auxSpawnedSignature = ''; // counts 变化检测（购买后重建载体）

  function setViewport(width, height) {
    viewport.width = Math.max(1, width);
    viewport.height = Math.max(1, height);
    camera.setViewport(viewport.width, viewport.height);
  }

  const scene = {
    update,
    render,
    viewport,
    setViewport,
    paused: false,
    player,
    mode,
    duration: isAdventure ? ADVENTURE_DURATION : (modeCfg.duration || 0),
    levelId: isAdventure ? levelId : null,
    levelIndex: scalingCtx.level,
    // 武器必须经 scene.weapon 引用：换枪会重绑 game.weapon（buy）
    weapon: createWeapon('pistol', meta ? (meta.weaponLevels.pistol ?? 0) : 0),
    metaLevels: meta ? meta.weaponLevels : {}, // shop.js 换枪时按 meta 局外等级重建
    zombies: [],
    coins: 0,
    inventory: createInventory(),
    coinsOnGround: map.scatteredCoins.map(c => createCoin(c.x, c.y, c.value)),
    particles: [],
    floaters: [],
    effects: [], // 爆环 / 闪电（迭代 04）
    teslaBalls: [], // 电磁球（迭代 05）
    banner: { text: '', until: 0 }, // 档位来袭横幅（迭代 06）
    time: 0,
    kills: 0,
    rng,
    shops: map.shops,
    helicopter: null,
    tierRemaining: segLen,
    // 迭代 03 经济字段（shop.js buy 消费）
    weaponBought: 0,        // 全局换枪计数（用户裁定）
    itemBought: {},         // 道具各自已购次数
    aux: createAux(),
    turretEnhance: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
    wallEnhance: { hp: 0 },
    // 部署物运行时
    turrets: [],            // 固定火炮（≤6）
    walls: [],              // 围墙单段数组（≤16 段，迭代 05）
    useItemKey,
    togglePause,
    applyEarlyTier,
    devAddCoins,
    devSpawnZombie,
    devStress,
    quitRun,
  };

  function fxExplosion(x, y, radius) {
    if (scene.effects.length < MAX_EFFECTS)
      spawnExplosion(particlePool, scene.effects, scene.particles, x, y, radius, rng);
  }

  function fxChain(path) {
    for (let i = 0; i + 1 < path.length; i++) {
      if (scene.effects.length >= MAX_EFFECTS) break;
      spawnLightning(scene.effects, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y, rng);
    }
    // 电磁球（迭代 07）：靠近角色处（玩家前方 55px）产生，沿子弹发射方向扇形发散（±26° 随机），2.5s 持续电击
    const spread = 0.45; // 扇形半角 ≈ ±26°
    const a = lastShotAngle + (rng() * 2 - 1) * spread;
    const sx = player.x + Math.cos(lastShotAngle) * 55;
    const sy = player.y + Math.sin(lastShotAngle) * 55;
    const dmg = scene.weapon.id === 'tesla' ? weaponStats(scene.weapon).damage * 0.5 * weaponStats(scene.weapon).chainDmgMult : 10;
    scene.teslaBalls.push(createTeslaBall(sx, sy, Math.cos(a) * 120, Math.sin(a) * 120, dmg));
  }

  function sound(id) { if (audio) audio.play(id); }

  function spawnProjectile(opts) {
    if (activeProjectiles >= MAX_PROJECTILES) return;
    const { muzzleFlash, ...projectileOpts } = opts;
    if (muzzleFlash && scene.particles.length < MAX_PARTICLES) {
      const distance = muzzleFlash.distance ?? 20;
      const mx = opts.x + Math.cos(opts.angle) * distance;
      const my = opts.y + Math.sin(opts.angle) * distance;
      spawnParticles(particlePool, scene.particles, mx, my,
        muzzleFlash.color, muzzleFlash.count ?? 2, rng);
    }
    // 池化复用对象可能残留旧字段，统一归一。
    const fromPlayer = projectileOpts.fromPlayer;
    const o = {
      aoe: 0, arc: false, chain: 0, pierce: 0, knockback: 0,
      frags: null, chainMult: 0.8, chainDmgMult: 1,
      ...projectileOpts,
    };
    const p = projPool.obtain(o);
    activeProjectiles++;
    projectiles.push(p);
    lastShotAngle = o.angle;
    if (fromPlayer) {
      const sid = scene.weapon.id === 'mg' ? 'shootMG' : 'shoot';
      if (sid !== lastShotSoundId || scene.time - lastShotSound > 0.12) {
        lastShotSound = scene.time;
        lastShotSoundId = sid;
        sound(sid);
      }
    }
  }

  // 主武器开火入口（带射击音）：包一层标记来源；枪口闪光（设计 §9.2：muzzle 处 2 粒子）
  function playerSpawnProjectile(opts) {
    if (scene.particles.length < MAX_PARTICLES) { // 粒子达上限时枪口闪光整体跳过
      const mx = player.x + Math.cos(opts.angle) * player.r;
      const my = player.y + Math.sin(opts.angle) * player.r;
      spawnParticles(particlePool, scene.particles, mx, my, opts.visual?.color ?? '#ffe066', 2, rng);
    }
    spawnProjectile({ ...opts, fromPlayer: true });
  }

  // 行为钩子上下文（设计 §4.2）：AoE 数值已在 createZombie 时经管线缩放，此处只提供结算通道
  function behaviorCtx() {
    return {
      player,
      deployables: [...scene.turrets, ...scene.walls],
      damagePlayer: dmg => {
        if (damagePlayer(player, dmg)) {
          shake(6);
          sound('hurt');
          if (player.hp <= 0) gameOver({ cleared: false });
        }
      },
      spawnRing: (x, y, r) => fxExplosion(x, y, r),
      rng,
    };
  }

  function killZombie(z) {
    if (z.counted) return;
    z.counted = true;
    scene.kills++;
    scene.coinsOnGround.push(createCoin(z.x, z.y, z.coin));
    if (meta) recordKill(meta, z.type); // 图鉴击杀统计：全模式计数（设计 §10）
    for (const d of ITEM_DROP_TABLE) {
      if (rng() < d.chance) { addItem(scene.inventory, d.id, 1); break; }
    }
    if (scene.particles.length < MAX_PARTICLES)
      spawnParticles(particlePool, scene.particles, z.x, z.y, '#5eff8a', 12, rng);
    if (z.behavior) BEHAVIORS[z.behavior]?.onDeath?.(z, behaviorCtx()); // 行为死亡钩子（自爆 AoE 在此结算）
  }

  function hitZombie(z, dmg, visual) {
    // 命中粒子喷溅（visual.hitParticles 驱动）：放在 damageNumbers 早退之前——设置项只守护 floater；
    // 守卫只拦 spawnParticles，不影响后续 floater 逻辑
    if (visual?.hitParticles && scene.particles.length < MAX_PARTICLES)
      spawnParticles(particlePool, scene.particles, z.x, z.y, visual.color ?? '#ffe066', visual.hitParticles, rng);
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

  // 数字键道具：1 医疗包 / 2 磁铁 / 3 炸弹 / 4 固定火炮 / 5 围墙
  function useItemKey(n) {
    if (scene.paused || over) return;
    let id = null;
    for (const it of Object.values(ITEMS)) if (it.key === n) id = it.id;
    if (!id) return;
    if (id === 'turret') {
      if (scene.turrets.length >= MAX_TURRETS) {
        spawnFloater(scene.floaters, player.x, player.y - 30, '固定火炮已达上限（30）', '#f88');
        sound('click'); return;
      }
      if (!useItem(scene.inventory, id)) { sound('click'); return; }
      scene.turrets.push(createTurret(player.x, player.y, scene.turretEnhance));
      spawnFloater(scene.floaters, player.x, player.y - 30, '固定火炮部署！', '#f80');
      return;
    }
    if (id === 'wall') {
      // 围墙无上限（迭代 08）
      if (!useItem(scene.inventory, id)) { sound('click'); return; }
      scene.walls.push(createWallSegment(player.x, player.y, scene.wallEnhance));
      spawnFloater(scene.floaters, player.x, player.y - 30, '围墙竖起！', '#99a');
      return;
    }
    if (!useItem(scene.inventory, id)) { sound('click'); return; }
    if (id === 'medkit') {
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.5);
      spawnFloater(scene.floaters, player.x, player.y - 30, '+' + Math.round(player.maxHp * 0.5), '#4d4');
    } else if (id === 'magnet') {
      magnetAllUntil = scene.time + 2.5;
      spawnFloater(scene.floaters, player.x, player.y - 30, '磁铁！', '#5ef');
    } else if (id === 'bomb') {
      explode(player.x, player.y, 350, 250, scene.zombies, z => hitZombie(z, 250), killZombie);
      fxExplosion(player.x, player.y, 350);
      shake(10);
      sound('explosion');
      spawnFloater(scene.floaters, player.x, player.y - 30, '轰！', '#f80');
    }
  }

  // 开发者模式（迭代 04）：加银币 / 放置指定僵尸（玩家东侧 200px，当前档倍率）
  function devAddCoins(n) {
    scene.coins += n;
    spawnFloater(scene.floaters, player.x, player.y - 30, '+' + n + ' 银币（开发者）', '#ffd75e');
  }

  function devSpawnZombie(type) {
    const cfg = cfgFn(scene.time);
    scene.zombies.push(createZombie(type, player.x + 200, player.y, { ...scalingCtx, tier: cfg.tier, timeSec: scene.time }));
    aliveCount++;
    spawnFloater(scene.floaters, player.x + 200, player.y - 30, '已放置 ' + MONSTERS[type].name, '#f55');
  }

  // 性能压测（dev 菜单）：填满 400 怪 + 满强化机枪（自动开火近似维持约 400 活跃弹道）。手动验收，不进单测。
  function devStress() {
    scene.weapon = createWeapon('mg');
    scene.weapon.enhance = { damage: 8, fireRate: 8, projectiles: 8, range: 8, fragCount: 0, fragDamage: 0, chainLen: 0, chainDmg: 0 };
    const cfg = cfgFn(scene.time);
    while (aliveCount < MAX_ZOMBIES) {
      const p = offscreenPoint(camera, MAP_SIZE, rng);
      scene.zombies.push(createZombie('normal', p.x, p.y, { ...scalingCtx, tier: cfg.tier, timeSec: scene.time }));
      aliveCount++;
    }
    spawnFloater(scene.floaters, player.x, player.y - 40, '压测中：400 怪 + 满强化机枪', '#f55');
  }

  function togglePause() {
    if (over) return;
    if (shopOpen) { closeShop(); return; }
    scene.paused = !scene.paused;
    if (!scene.paused) sound('click');
  }

  function openShop() {
    shopOpen = true;
    scene.paused = true;
    sound('click');
    const render = () => showShopPanel();
    render();
  }

  function showShopPanel() {
    // 延迟 import 避免 DOM 模块进入纯逻辑链？——game.js 本身是 DOM 层，直接顶部 import 即可
    showShop(document.getElementById('shop'), scene, {
      onBuy: entry => {
        if (buy(scene, entry)) { sound('buy'); showShopPanel(); }
        else sound('click');
      },
      onEarlyTier: bonus => {
        scene.applyEarlyTier(bonus);
        sound('buy');
        closeShop();
      },
      onClose: () => closeShop(),
    }, { earlyTier: !isAdventure });
  }

  function closeShop() {
    shopOpen = false;
    shopLatch = true;
    document.getElementById('shop').classList.add('hidden');
    scene.paused = false;
  }

  function applyEarlyTier(bonus) {
    const cfg = cfgFn(scene.time);
    scene.time = cfg.tier * segLen;
    scene.coins += bonus;
    spawnFloater(scene.floaters, player.x, player.y - 40, '提前进入下一档！+' + bonus + ' 银币', '#ffd75e');
  }

  // 冒险主动退出按失败结算（设计 §3.1）：供 main.js onQuit 分流调用
  function quitRun() { gameOver({ cleared: false }); }

  function update(dt) {
    if (scene.paused || over) return;
    scene.time += dt;

    // 冒险通关：撑满 360s 即通关（设计 §3.1；无直升机撤离）
    if (isAdventure && scene.time >= ADVENTURE_DURATION) {
      gameOver({ cleared: true });
      return;
    }

    updatePlayer(player, input.state, map.obstacles, MAP_SIZE, dt);
    updateWeapon(scene.weapon, player, scene.zombies, playerSpawnProjectile, rng, dt);

    scene.tierRemaining = (cfgFn(scene.time).tier) * segLen - scene.time;

    // 辅助武器：counts 变化（购买）后重建载体；每帧运动+开火
    const sig = Object.values(scene.aux.counts).join(',');
    if (sig !== auxSpawnedSignature) { auxSpawnedSignature = sig; spawnAuxBodies(scene.aux); }
    updateAuxBodies(scene.aux, player, scene.zombies, spawnProjectile, rng, dt);

    const budgetMult = !isAdventure && modeCfg.surgeFrom && scene.time >= modeCfg.surgeFrom ? 1.5 : 1;
    aliveCount += updateSpawner(spawner, scene.time, camera, MAP_SIZE, scene.zombies, aliveCount, rng, dt, budgetMult, cfgFn, scalingCtx, !isAdventure);

    if (!isAdventure && modeCfg.bossAt && !bossSpawned && scene.time >= modeCfg.bossAt) {
      bossSpawned = true;
      const p = offscreenPoint(camera, MAP_SIZE, rng);
      scene.zombies.push(createZombie('boss', p.x, p.y, { ...scalingCtx, tier: cfgFn(scene.time).tier, timeSec: scene.time }));
      aliveCount++;
      sound('alarm');
      shake(8);
      spawnFloater(scene.floaters, player.x, player.y - 50, '守门 Boss 出现！', '#f55');
    }

    if (!isAdventure && modeCfg.duration) {
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

    // 下一档来袭横幅：档位切换瞬间（自然跨档/提前难度均触发），3s 缓慢闪烁后消失
    const tierNow = cfgFn(scene.time).tier;
    if (tierNow !== prevTier) {
      scene.banner = { text: '第 ' + tierNow + ' 档来袭！', until: scene.time + 3 };
      prevTier = tierNow;
    }

    // 固定火炮自动开火
    for (const t of scene.turrets) updateTurret(t, scene.zombies, spawnProjectile, rng, dt);

    // 僵尸：250px 内优先啃部署物，否则追玩家
    const edibles = [];
    for (const t of scene.turrets) if (t.alive) edibles.push(t);
    for (const seg of scene.walls) if (seg.alive) edibles.push(seg);
    for (const z of scene.zombies) {
      if (!z.alive) continue;
      updateZombie(z, player, map.obstacles, dt, edibles);
      if (z.behavior) BEHAVIORS[z.behavior]?.onUpdate?.(z, dt, behaviorCtx()); // 行为更新钩子（自爆引信）
    }
    for (const p of projectiles) {
      if (p.alive) updateProjectile(p, dt);
    }

    hash.clear();
    for (const z of scene.zombies) if (z.alive) hash.insert(z);

    resolveProjectileHits(projectiles, hash, map.obstacles,
      killZombie,
      (z, p) => hitZombie(z, p.damage, p.visual),
      scene.zombies, // allZombies：tesla 链电/aoe 爆炸遍历用
      {
        onExplode: fxExplosion,
        onChain: fxChain,
        onFrag: (x, y, frags) => {
          // 榴弹二次爆炸：8 等分 ±0.15rad 抖动碎片弹（speed 420/range 160/aoe 30 小范围/越障/无 frags 不再次分裂——迭代 06）
          for (let i = 0; i < frags.count; i++) {
            const a = (i / frags.count) * Math.PI * 2 + (rng() * 2 - 1) * 0.15;
            spawnProjectile({ x, y, angle: a, speed: 420, damage: frags.dmg, range: 160, pierce: 0, knockback: 40, aoe: 30, arc: true, chain: 0 });
          }
        },
      }); // 弹道特效 hooks（迭代 04/05）

    for (const z of scene.zombies) {
      if (!z.alive) continue;
      if (circleHit(player.x, player.y, player.r, z.x, z.y, z.r) &&
          damagePlayer(player, z.damage)) {
        shake(6);
        sound('hurt');
        if (player.hp <= 0) { gameOver({ cleared: false }); return; }
      }
    }

    const magnetAll = scene.time < magnetAllUntil;
    for (let i = scene.coinsOnGround.length - 1; i >= 0; i--) {
      const c = scene.coinsOnGround[i];
      if (!updateCoin(c, player, dt, magnetAll)) continue;
      scene.coinsOnGround[i] = scene.coinsOnGround[scene.coinsOnGround.length - 1];
      scene.coinsOnGround.pop();
      scene.coins += c.value;
      sound('coin');
    }

    if (scene.helicopter && updateHelicopter(scene.helicopter, player, dt) === 'victory') {
      gameOver({ cleared: true });
      return;
    }

    let inShopRange = false;
    for (const s of map.shops) {
      if (Math.hypot(player.x - s.x, player.y - s.y) < s.interactR) { inShopRange = true; break; }
    }
    if (shopLatch && !inShopRange) shopLatch = false;
    if (!shopOpen && !shopLatch && inShopRange) openShop();

    // 死僵尸 swap-remove（行为自杀的在此补 killZombie 结算掉落/计数/AoE）
    for (let i = scene.zombies.length - 1; i >= 0; i--) {
      if (!scene.zombies[i].alive) {
        if (!scene.zombies[i].counted) killZombie(scene.zombies[i]);
        scene.zombies[i] = scene.zombies[scene.zombies.length - 1];
        scene.zombies.pop();
        aliveCount--;
      }
    }
    // 死弹道回收
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p.alive) {
        projectiles[i] = projectiles[projectiles.length - 1];
        projectiles.pop();
        projPool.release(p);
        activeProjectiles--;
      }
    }
    // 毁损部署物清理：火炮逐个删；围墙组全灭删组
    for (let i = scene.turrets.length - 1; i >= 0; i--) {
      if (!scene.turrets[i].alive) {
        scene.turrets[i] = scene.turrets[scene.turrets.length - 1];
        scene.turrets.pop();
      }
    }
    for (let i = scene.walls.length - 1; i >= 0; i--) {
      if (!scene.walls[i].alive) {
        scene.walls[i] = scene.walls[scene.walls.length - 1];
        scene.walls.pop();
      }
    }

    // 电磁球：移动 + 周期性电击（teslaball.js）
    for (let i = scene.teslaBalls.length - 1; i >= 0; i--) {
      const b = scene.teslaBalls[i];
      if (updateTeslaBall(b, scene.zombies, dt, z => hitZombie(z, b.damage), killZombie)) continue;
      scene.teslaBalls[i] = scene.teslaBalls[scene.teslaBalls.length - 1];
      scene.teslaBalls.pop();
    }

    updateCamera(camera, player, MAP_SIZE, rng, dt);
    updateParticles(particlePool, scene.particles, dt);
    updateFloaters(scene.floaters, dt);
    updateEffects(scene.effects, dt);
  }

  function render(ctx, renderViewport = viewport) {
    const W = renderViewport.width;
    const H = renderViewport.height;
    ctx.fillStyle = '#1a2418';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-camera.x + camera.offX, -camera.y + camera.offY);

    ctx.strokeStyle = '#4a4a52';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

    for (const o of map.obstacles) renderObstacle(ctx, o);

    // 商店建筑
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
      if (Math.hypot(player.x - s.x, player.y - s.y) < s.interactR + 120) {
        ctx.fillStyle = 'rgba(255,215,94,.6)';
        ctx.font = '16px "Microsoft YaHei", sans-serif';
        ctx.fillText('商店：走近自动打开', s.x, s.y - s.r - 14);
      }
    }

    // 撤离点提示
    if (!isAdventure && modeCfg.duration && rescueAlerted && !scene.helicopter) {
      ctx.strokeStyle = 'rgba(94,239,255,.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 玩家脚下射程圈（反馈 #5：让攻击范围可感知）
    const range = weaponStats(scene.weapon).range;
    ctx.fillStyle = 'rgba(255,224,102,.05)';
    ctx.beginPath();
    ctx.arc(player.x, player.y, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,102,.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 银币
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

    // 围墙：模块化石墙段，耐久档位由 visual 根据 hp/maxHp 决定
    for (const seg of scene.walls) {
      drawVisual(ctx, WALL_VISUAL_ID, seg.x, seg.y, seg.r, {
        params: {
          hp: seg.hp,
          maxHp: seg.maxHp,
        },
        phase: scene.time,
      });
    }

    // 固定火炮：组合式程序化 visual，炮口闪光由 spawnProjectile 的现有效果管线负责
    for (const t of scene.turrets) {
      drawVisual(ctx, TURRET_VISUAL_ID, t.x, t.y, t.r, {
        params: {
          aimAngle: t.aimAngle,
          hp: t.hp,
          maxHp: t.maxHp,
        },
        phase: scene.time,
      });
    }

    // 僵尸：几何矢量渲染（entities/render.js，设计 §9.1）
    for (const z of scene.zombies) renderZombie(ctx, z, scene.time);

    // 辅助武器：visual ID 来自 AUX_CONFIG；phase 只驱动旋翼/悬浮动画，不改变 orbit
    for (const b of scene.aux.bodies) {
      const size = b.kind === 'sniper' ? 16 : b.kind === 'gunner' ? 14 : 12;
      drawVisual(ctx, AUX_CONFIG[b.kind].visual, b.x, b.y, size, {
        params: {
          aimAngle: b.aimAngle,
        },
        phase: scene.time,
      });
    }

    if (scene.helicopter) renderHelicopter(ctx, scene.helicopter);

    // 玩家
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

    // 弹道：visual 驱动的几何特效 + 渐隐拖尾（设计 §9.2，entities/render.js）
    renderProjectiles(ctx, projectiles);

    // 电磁球（迭代 05）：青色电球 + 电弧
    for (const b of scene.teslaBalls) {
      ctx.fillStyle = 'rgba(94,239,255,.75)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(94,239,255,.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 5 + Math.sin(scene.time * 20) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    renderParticles(ctx, scene.particles);
    renderFloaters(ctx, scene.floaters);
    renderEffects(ctx, scene.effects); // 爆环/闪电（世界空间，粒子之上）

    ctx.restore();
    ctx.textAlign = 'left';

    // 档位来袭横幅（迭代 06）：顶部居中，缓慢闪烁 3s（自然跨档/提前难度触发）
    if (scene.banner && scene.time < scene.banner.until) {
      const t = 1 - (scene.banner.until - scene.time) / 3; // 0→1 进度
      const alpha = 0.45 + 0.35 * Math.sin(scene.time * 8); // 缓慢闪烁
      ctx.globalAlpha = Math.max(0.15, Math.min(1, alpha));
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(W / 2 - 220, 60, 440, 56);
      ctx.fillStyle = '#ffd75e';
      ctx.font = '34px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(scene.banner.text, W / 2, 99);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    renderHud(ctx, scene, renderViewport);
  }

  return scene;
}

