// src/ui/dev.js —— 开发者菜单（DOM 胶水，无单测）。
// showDev(rootEl, handlers)：handlers = {onCoins(n), onSpawn(type), onClose()}。
// 加银币/放置僵尸的实际逻辑在 game.js（devAddCoins/devSpawnZombie），本文件只做展示与回调。
export function showDev(rootEl, handlers) {
  const { onCoins, onSpawn, onClose } = handlers;

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

  const spawns = [
    ['normal', '放置 普通'],
    ['fast', '放置 高速'],
    ['tank', '放置 坦克'],
    ['boss', '放置 守门Boss'],
  ];
  for (const [type, label] of spawns) {
    const btn = document.createElement('button');
    btn.className = 'dev-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => onSpawn(type));
    wrap.appendChild(btn);
  }

  const close = document.createElement('button');
  close.className = 'dev-btn dev-btn-close';
  close.textContent = '关闭';
  close.addEventListener('click', onClose);

  rootEl.replaceChildren(head, wrap, close);
  rootEl.classList.remove('hidden');
}
