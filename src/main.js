// src/main.js（临时接线，Task 16 会重写正式版）
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { createGameScene } from './game.js';

const canvas = document.getElementById('game');
const engine = createEngine(canvas);
engine.setScene(createGameScene({
  canvas,
  input: createInput(),
  onLevelUp: g => {
    console.log('level up', g.player.level);
    g.pendingLevelUps = 0;
    g.paused = false;
  },
  onGameOver: s => console.log('game over', s),
}));
engine.start();
