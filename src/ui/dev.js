// src/ui/dev.js —— 开发者菜单（DOM 胶水，无单测）。
// showDev(rootEl, handlers)：handlers = { onCoins, onGold, onSpawn, onUnlockLevels, onStartMode, onStress, onClose }
// 加银币/放置僵尸的实际逻辑在 game.js（devAddCoins/devSpawnZombie），本文件只做展示与回调。
import { MONSTERS, playableMonsters } from '../config/bestiary/monsters.js';

// FPS 常驻读数（任务12返修）：独立于 dev 面板的 body 级元素，默认隐藏，菜单内按钮开关。
// 打开 dev 菜单会暂停游戏，面板内读数只能测到暂停态；挪出后压测时关菜单也能实时读数。
// 插入到 body 首个子元素前：canvas 是 static 定位仍在它下面，各 overlay 在 DOM 序靠后仍压在它上面。
// fpsTick 为模块级单例：showDev 每次打开都 replaceChildren 重建 DOM，rAF 循环全局只挂一条。
let fpsEl = null;
let fpsRunning = false;
let fpsAcc = 0, fpsN = 0, fpsLast = performance.now();
function ensureFpsEl() {
  if (fpsEl) return fpsEl;
  fpsEl = document.createElement('div');
  fpsEl.id = 'dev-fps-fixed';
  fpsEl.className = 'hidden';
  fpsEl.textContent = 'FPS — / 平均帧时 —';
  document.body.insertBefore(fpsEl, document.body.children[0]);
  return fpsEl;
}
function fpsTick() {
  const now = performance.now();
  const dt = now - fpsLast; fpsLast = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1000) {
    const avg = fpsAcc / fpsN;
    fpsEl.textContent = `FPS ${Math.round(1000 / avg)} / 平均帧时 ${avg.toFixed(1)}ms`;
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
    btn.className = 'btn btn-dim';
    btn.textContent = label;
    btn.addEventListener('click', () => onCoins(n));
    wrap.appendChild(btn);
  }

  // 放置怪物名单从图鉴生成：可玩种类 + boss（坚守隐藏期间图鉴不展示 boss，dev 仍可调出）
  const spawns = [...playableMonsters().map(m => m.id), 'boss']
    .map(id => [id, '放置 ' + MONSTERS[id].name]);
  for (const [type, label] of spawns) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-dim';
    btn.textContent = label;
    btn.addEventListener('click', () => onSpawn(type));
    wrap.appendChild(btn);
  }

  const goldBtn = document.createElement('button');
  goldBtn.className = 'btn btn-dim';
  goldBtn.textContent = '+1000 金币（局外）';
  goldBtn.addEventListener('click', () => onGold(1000));
  wrap.appendChild(goldBtn);

  const unlockBtn = document.createElement('button');
  unlockBtn.className = 'btn btn-dim';
  unlockBtn.textContent = '解锁全部关卡';
  unlockBtn.addEventListener('click', () => onUnlockLevels());
  wrap.appendChild(unlockBtn);

  for (const [m, label] of [['holdout10', '启动 坚守10'], ['holdout20', '启动 坚守20']]) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-dim';
    btn.textContent = label;
    btn.addEventListener('click', () => onStartMode(m));
    wrap.appendChild(btn);
  }

  // FPS 显示开关：切换常驻读数元素显隐（只看开关状态，与菜单开关/游戏暂停无关）
  const fps = ensureFpsEl();
  if (!fpsRunning) {
    fpsRunning = true;
    requestAnimationFrame(fpsTick);
  }
  const fpsBtn = document.createElement('button');
  fpsBtn.className = 'btn btn-dim';
  const syncFpsBtn = () => {
    fpsBtn.textContent = 'FPS 显示：' + (fps.classList.contains('hidden') ? '关' : '开');
  };
  fpsBtn.addEventListener('click', () => {
    fps.classList.toggle('hidden');
    syncFpsBtn();
  });
  syncFpsBtn();
  wrap.appendChild(fpsBtn);

  // 性能压测按钮：填满 400 怪 + 满强化机枪，维持约 400 活跃弹道（手动验收用）
  const stressBtn = document.createElement('button');
  stressBtn.className = 'btn btn-dim';
  stressBtn.textContent = '性能压测';
  stressBtn.addEventListener('click', () => onStress());
  wrap.appendChild(stressBtn);

  const close = document.createElement('button');
  close.className = 'btn dev-btn-close';
  close.textContent = '关闭';
  close.addEventListener('click', onClose);

  rootEl.replaceChildren(head, wrap, close);
  rootEl.classList.remove('hidden');
}
