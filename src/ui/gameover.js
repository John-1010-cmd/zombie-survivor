// src/ui/gameover.js —— 结算覆盖层（DOM 胶水，无单测）
// showGameOver(rootEl, stats, isNew, onRestart, onMenu)：
//   stats = {time, kills, hp, cleared, mode}；cleared 显示胜利版式，否则死亡版式。
import { formatTime } from '../systems/hud.js';

export function showGameOver(rootEl, stats, isNew, onRestart, onMenu) {
  const cleared = !!stats.cleared;
  rootEl.innerHTML = `
    <h2>${cleared ? '救援成功！' : '游戏结束'}</h2>
    ${cleared ? '<p style="color:#4d4">直升机已抵达，你活着离开了尸潮。剩余 HP：' + stats.hp + '</p>' : ''}
    ${isNew ? '<p style="color:#ffd75e;font-size:24px">新纪录！</p>' : ''}
    <p>${cleared ? '用时' : '存活时间'}：${formatTime(stats.time)}</p>
    <p>击杀数：${stats.kills}</p>
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
