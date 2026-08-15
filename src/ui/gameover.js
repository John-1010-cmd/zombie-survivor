// src/ui/gameover.js —— 结算覆盖层（DOM 胶水，无单测）
import { formatTime } from '../systems/hud.js';

export function showGameOver(rootEl, stats, isNew, onRestart, onMenu) {
  rootEl.innerHTML = `
    <h2>游戏结束</h2>
    ${isNew ? '<p style="color:#ffd75e;font-size:24px">新纪录！</p>' : ''}
    <p>存活时间：${formatTime(stats.time)}</p>
    <p>击杀数：${stats.kills}</p>
    <p>等级：Lv ${stats.level}</p>
    <button id="gameover-restart">再来一局</button>
    <button id="gameover-menu">回主菜单</button>
  `;
  rootEl.classList.remove('hidden');
  rootEl.querySelector('#gameover-restart').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onRestart();
  });
  rootEl.querySelector('#gameover-menu').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onMenu();
  });
}
