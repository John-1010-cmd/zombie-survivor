// src/ui/gameover.js —— 结算覆盖层（DOM 胶水，无单测）
// showGameOver(rootEl, stats, isNew, handlers)：
//   stats = {time, kills, hp, cleared, mode, gold?, firstClear?}
//   handlers = { onRestart, onMenu, onLevels? }（冒险模式才有 onLevels）
import { formatTime } from '../systems/hud.js';

export function showGameOver(rootEl, stats, isNew, handlers) {
  const { onRestart, onMenu, onLevels } = handlers;
  const cleared = !!stats.cleared;
  const isAdventure = stats.mode === 'adventure';
  rootEl.innerHTML = isAdventure ? `
    <h2>${cleared ? '通关！' : '任务失败'}</h2>
    <p>${cleared ? '撑满了 6 分钟，成功通关！' : '存活时间：' + formatTime(stats.time)}</p>
    <p>击杀数：${stats.kills}</p>
    <p style="color:#ffd75e">金币 +${stats.gold}${stats.firstClear ? '（首通奖励 ×2）' : ''}</p>
    <button id="gameover-restart">重开本关</button>
    <button id="gameover-levels">回关卡选择</button>
    <button id="gameover-menu">回主菜单</button>
  ` : `
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
  if (isAdventure) {
    rootEl.querySelector('#gameover-levels').addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onLevels();
    });
  }
}
