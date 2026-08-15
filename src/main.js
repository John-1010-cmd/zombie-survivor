// src/main.js（临时接线，Task 16 会重写正式版）
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { createGameScene } from './game.js';
import { showLevelUp } from './ui/levelup.js';

const canvas = document.getElementById('game');
const engine = createEngine(canvas);
engine.setScene(createGameScene({
  canvas,
  input: createInput(),
  onLevelUp: g => { showLevelUp(document.getElementById('levelup'), g, () => {}); },
  onGameOver: s => console.log('game over', s),
}));
engine.start();
