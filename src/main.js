// src/main.js（正式版：主菜单 → 战斗 → 结算/重开 全流程接线；Task 14 临时版被替换）
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { updateBest, loadBest, saveBest } from './core/storage.js';
import { createGameScene } from './game.js';
import { showMenu } from './ui/menu.js';
import { showLevelUp } from './ui/levelup.js';
import { showGameOver } from './ui/gameover.js';

const canvas = document.getElementById('game');
const menuEl = document.getElementById('menu');
const levelupEl = document.getElementById('levelup');
const gameoverEl = document.getElementById('gameover');

const engine = createEngine(canvas);
const input = createInput();

function hideOverlays() {
  document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
}

function startGame() {
  hideOverlays();
  engine.setScene(createGameScene({
    canvas,
    input,
    onLevelUp: game => showLevelUp(levelupEl, game, () => {}), // 覆盖层显示/隐藏由 showLevelUp 内部管理，勿在外层重复 remove('hidden')
    onGameOver: stats => {
      const r = updateBest(loadBest(), stats);
      saveBest(r.best);
      showGameOver(gameoverEl, stats, r.isNew, startGame, showMenuScreen);
    },
  }));
}

function showMenuScreen() {
  showMenu(menuEl, loadBest(), startGame);
}

showMenuScreen();
engine.start();
