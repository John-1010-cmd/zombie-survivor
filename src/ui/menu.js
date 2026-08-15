// src/ui/menu.js —— 主菜单覆盖层（DOM 胶水，无单测）
import { formatTime } from '../systems/hud.js';

export function showMenu(rootEl, best, onStart) {
  const endless = best.endless;
  const bestText = endless
    ? `最佳纪录：存活 ${formatTime(endless.time)} / 击杀 ${endless.kills} / Lv ${endless.level}`
    : '暂无纪录';
  rootEl.innerHTML = `
    <h1>Zombie Survivor</h1>
    <p id="menu-best">${bestText}</p>
    <button id="menu-start">无尽模式</button>
  `;
  rootEl.classList.remove('hidden');
  rootEl.querySelector('#menu-start').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onStart();
  });
}
