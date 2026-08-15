// src/main.js —— 启动接线：主菜单 → 三模式战斗 → 暂停/商店/结算 全流程
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { updateBest, loadBest, saveBest, loadSettings, saveSettings } from './core/storage.js';
import { createAudio } from './core/audio.js';
import { createGameScene } from './game.js';
import { showMenu } from './ui/menu.js';
import { showPause } from './ui/pause.js';
import { showGameOver } from './ui/gameover.js';

const canvas = document.getElementById('game');
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const shopEl = document.getElementById('shop');
const gameoverEl = document.getElementById('gameover');

const engine = createEngine(canvas);
const settings = loadSettings();
const audio = createAudio(settings);
let currentScene = null;

const input = createInput({
  onItem: n => currentScene && currentScene.useItemKey(n),
  onEsc: () => currentScene && onEsc(),
});

function hideOverlays() {
  document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
}

function onEsc() {
  // 商店打开时优先关商店（game.js 内部处理）；否则弹/收暂停菜单
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
        showMenuScreen();
      },
      onChange: s => {
        Object.assign(settings, s);
        saveSettings(settings);
        audio.setVolume(s.volume);
      },
    });
  }
}

function startGame(mode) {
  hideOverlays();
  currentScene = createGameScene({
    canvas,
    input,
    mode,
    audio,
    settings,
    onGameOver: stats => {
      const r = updateBest(loadBest(), stats, stats.mode);
      saveBest(r.best);
      audio.play('click');
      showGameOver(gameoverEl, stats, r.isNew, () => startGame(mode), showMenuScreen);
    },
  });
  engine.setScene(currentScene);
}

function showMenuScreen() {
  hideOverlays();
  currentScene = null;
  showMenu(menuEl, loadBest(), startGame);
}

showMenuScreen();
engine.start();
