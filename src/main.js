// src/main.js —— 启动接线：主菜单 → 三模式战斗 → 暂停/商店/结算 全流程
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { updateBest, loadBest, saveBest, loadSettings, saveSettings } from './core/storage.js';
import { createAudio } from './core/audio.js';
import { createGameScene } from './game.js';
import { showMenu } from './ui/menu.js';
import { showPause } from './ui/pause.js';
import { showGameOver } from './ui/gameover.js';
import { showDev } from './ui/dev.js';
import { showLevels } from './ui/levels.js';
import { showUpgrades } from './ui/upgrades.js';
import { showBestiary } from './ui/bestiary.js';
import { loadMeta, saveMeta, addGold, recordAdventureResult } from './core/meta.js';
import { ADVENTURE_LEVELS, adventureLevelById, adventureLevelIndex, clearGoldReward, failGoldReward } from './config/adventure.js';

const canvas = document.getElementById('game');
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const shopEl = document.getElementById('shop');
const gameoverEl = document.getElementById('gameover');
const devEl = document.getElementById('dev');
const levelsEl = document.getElementById('levels');
const bestiaryEl = document.getElementById('bestiary');
const upgradesEl = document.getElementById('upgrades');

const engine = createEngine(canvas);
const settings = loadSettings();
const audio = createAudio(settings);
const meta = loadMeta(); // 局外存档全程内存引用，变更后 saveMeta（Task 10）
let currentScene = null;

const input = createInput({
  onItem: n => currentScene && currentScene.useItemKey(n),
  onEsc: () => currentScene && onEsc(),
  onDev: () => currentScene && toggleDev(),
});

function hideOverlays() {
  document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
}

function onEsc() {
  // 开发者菜单打开时优先关闭；商店打开时次之；否则暂停菜单
  if (!devEl.classList.contains('hidden')) { closeDev(); return; }
  if (!shopEl.classList.contains('hidden')) { currentScene.togglePause(); return; }
  if (currentScene.paused) {
    pauseEl.classList.add('hidden');
    currentScene.paused = false;
  } else {
    currentScene.paused = true;
    showPause(pauseEl, settings, {
      onResume: () => {
        pauseEl.classList.add('hidden');
        currentScene.paused = false;
        audio.play('click');
      },
      onQuit: () => {
        pauseEl.classList.add('hidden');
        audio.stop('heli');
        if (currentScene.mode === 'adventure') {
          // 冒险主动退出按失败结算（设计 §3.1）：走 gameOver → 失败保底结算
          currentScene.quitRun(); // → gameOver({cleared:false})
        } else {
          showMenuScreen();
        }
      },
      onChange: s => {
        Object.assign(settings, s);
        saveSettings(settings);
        audio.setVolume(s.volume);
      },
    });
  }
}

// 开发者菜单（迭代 04）：` 开关，打开即暂停
function toggleDev() {
  if (devEl.classList.contains('hidden')) {
    currentScene.paused = true;
    audio.play('click');
    showDev(devEl, {
      onCoins: n => currentScene.devAddCoins(n),
      onSpawn: type => currentScene.devSpawnZombie(type),
      onGold: n => { addGold(meta, n); saveMeta(meta); },
      onUnlockLevels: () => { meta.adventure.unlocked = ADVENTURE_LEVELS.length; saveMeta(meta); },
      onStartMode: m => { closeDev(); hideOverlays(); startGame(m); }, // 调试入口：坚守隐藏期间仍可回归验证
      onStress: () => { if (currentScene) currentScene.devStress(); },
      onClose: closeDev,
    });
  } else {
    closeDev();
  }
}

function closeDev() {
  devEl.classList.add('hidden');
  currentScene.paused = false;
}

function startGame(mode, levelId = null) {
  hideOverlays();
  currentScene = createGameScene({
    canvas,
    input,
    mode,
    levelId,
    audio,
    settings,
    meta,
    onGameOver: stats => {
      if (stats.mode === 'adventure') {
        const level = adventureLevelById(levelId);
        const r = recordAdventureResult(meta, level.id, adventureLevelIndex(level.id), ADVENTURE_LEVELS.length, stats.cleared, stats.time);
        const gold = stats.cleared ? clearGoldReward(level, r.isFirstClear) : failGoldReward(level, stats.time);
        addGold(meta, gold);
        saveMeta(meta);
        audio.play('click');
        showGameOver(gameoverEl, { ...stats, gold, firstClear: stats.cleared && r.isFirstClear }, false, {
          onRestart: () => startGame('adventure', levelId),
          onLevels: showLevelsScreen,
          onMenu: showMenuScreen,
        });
        return;
      }
      const r = updateBest(loadBest(), stats, stats.mode);
      saveBest(r.best);
      audio.play('click');
      showGameOver(gameoverEl, stats, r.isNew, { onRestart: () => startGame(mode), onMenu: showMenuScreen });
    },
  });
  engine.setScene(currentScene);
}

function showLevelsScreen() {
  hideOverlays();
  currentScene = null;
  showLevels(levelsEl, meta, levelId => startGame('adventure', levelId), showMenuScreen);
}
function showUpgradesScreen() {
  hideOverlays();
  currentScene = null;
  showUpgrades(upgradesEl, meta, showMenuScreen, () => saveMeta(meta));
}
function showBestiaryScreen() {
  hideOverlays();
  currentScene = null;
  showBestiary(bestiaryEl, meta, showMenuScreen);
}

function showMenuScreen() {
  hideOverlays();
  currentScene = null;
  showMenu(menuEl, loadBest(), {
    onAdventure: showLevelsScreen,
    onEndless: () => startGame('endless'),
    onBestiary: showBestiaryScreen,
    onUpgrades: showUpgradesScreen,
  });
}

showMenuScreen();
engine.start();
