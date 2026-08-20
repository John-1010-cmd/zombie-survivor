// src/ui/dev.js —— 开发者菜单（DOM 胶水，无单测）。
// showDev(rootEl, handlers)：handlers = { onCoins, onGold, onSpawn, onUnlockLevels, onStartMode, onStress, onClose }
// 加银币/放置僵尸的实际逻辑在 game.js（devAddCoins/devSpawnZombie），本文件只做展示与回调。
import { MONSTERS, playableMonsters } from '../config/bestiary/monsters.js';

// FPS 采样为模块级单例：showDev 每次打开都 replaceChildren 重建 DOM，
// 若在函数内启动 rAF 会逐次叠加循环；此处全局只跑一条 fpsTick，显示元素随每次打开重绑。
let fpsEl = null;
let fpsRunning = false;
let fpsAcc = 0, fpsN = 0, fpsLast = performance.now();
function fpsTick() {
  const now = performance.now();
  const dt = now - fpsLast; fpsLast = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1000) {
    const avg = fpsAcc / fpsN;
    if (fpsEl) fpsEl.textContent = `FPS ${Math.round(1000 / avg)} / 平均帧时 ${avg.toFixed(1)}ms`;
    fpsAcc = 0; fpsN = 0;
  }
  requestAnimationFrame(fpsTick);
}

export function showDev(rootEl, handlers) {
  const { onCoins, onGold, onSpawn, onUnlockLevels, onStartMode, onStress, onClose } = handlers;

  const head = document.createElement('div');
  head.className = 'dev-head';
  head.innerHTML = '<h2>开发者菜单</h2>';

  const wrap = document.createElement('div');
  wrap.className = 'dev-buttons';

  const coins = [
    [100, '+100 银币'],
    [1000, '+1000 银币'],
  ];
  for (const [n, label] of coins) {
    const btn = document.createElement('button');
    btn.className = 'dev-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => onCoins(n));
    wrap.appendChild(btn);
  }

  // 放置怪物名单从图鉴生成：可玩种类 + boss（坚守隐藏期间图鉴不展示 boss，dev 仍可调出）
  const spawns = [...playableMonsters().map(m => m.id), 'boss']
    .map(id => [id, '放置 ' + MONSTERS[id].name]);
  for (const [type, label] of spawns) {
    const btn = document.createElement('button');
    btn.className = 'dev-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => onSpawn(type));
    wrap.appendChild(btn);
  }

  const goldBtn = document.createElement('button');
  goldBtn.className = 'dev-btn';
  goldBtn.textContent = '+1000 金币（局外）';
  goldBtn.addEventListener('click', () => onGold(1000));
  wrap.appendChild(goldBtn);

  const unlockBtn = document.createElement('button');
  unlockBtn.className = 'dev-btn';
  unlockBtn.textContent = '解锁全部关卡';
  unlockBtn.addEventListener('click', () => onUnlockLevels());
  wrap.appendChild(unlockBtn);

  for (const [m, label] of [['holdout10', '启动 坚守10'], ['holdout20', '启动 坚守20']]) {
    const btn = document.createElement('button');
    btn.className = 'dev-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => onStartMode(m));
    wrap.appendChild(btn);
  }

  // FPS / 平均帧时显示（帧时滑动平均，显示在 dev 面板内）
  const fps = document.createElement('div');
  fps.className = 'dev-fps';
  fps.textContent = 'FPS — / 平均帧时 —';
  wrap.appendChild(fps);
  fpsEl = fps; // 重绑到本次新建的节点（旧节点已随 replaceChildren 摘除）
  if (!fpsRunning) {
    fpsRunning = true;
    requestAnimationFrame(fpsTick);
  }

  // 性能压测按钮：填满 400 怪 + 满强化机枪，维持约 400 活跃弹道（手动验收用）
  const stressBtn = document.createElement('button');
  stressBtn.className = 'dev-btn';
  stressBtn.textContent = '性能压测';
  stressBtn.addEventListener('click', () => onStress());
  wrap.appendChild(stressBtn);

  const close = document.createElement('button');
  close.className = 'dev-btn dev-btn-close';
  close.textContent = '关闭';
  close.addEventListener('click', onClose);

  rootEl.replaceChildren(head, wrap, close);
  rootEl.classList.remove('hidden');
}
