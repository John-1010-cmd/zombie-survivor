// src/ui/gameover.js —— 结算覆盖层（DOM 胶水）。
import { formatTime } from '../systems/hud.js';
import { createIconMarkup, bindIconFallback } from './icons.js';
import { attachTooltips, hideTooltip } from './tooltip.js';

export function showGameOver(rootEl, stats, isNew, handlers) {
  const { onRestart, onMenu, onLevels } = handlers;
  const cleared = !!stats.cleared;
  const isAdventure = stats.mode === 'adventure';
  const gold = Number.isFinite(stats.gold) ? stats.gold : 0;
  const rewardText = `金币 +${gold}${stats.firstClear ? '（首通奖励 ×2）' : ''}`;
  const rewardTip = `金币奖励：${rewardText}`;
  rootEl.innerHTML = isAdventure ? `
    <h2>${cleared ? '通关！' : '任务失败'}</h2>
    <p>${cleared ? '撑满了 6 分钟，成功通关！' : '存活时间：' + formatTime(stats.time)}</p>
    <p>击杀数：${stats.kills}</p>
    <p class="settlement-reward" data-tooltip="${rewardTip}">${createIconMarkup('icon.currency.gold', '金币')}<span>${rewardText}</span></p>
    <button id="gameover-restart" class="btn">重开本关</button>
    <button id="gameover-levels" class="btn btn-dim">回关卡选择</button>
    <button id="gameover-menu" class="btn btn-dim">回主菜单</button>
  ` : `
    <h2>${cleared ? '救援成功！' : '游戏结束'}</h2>
    ${cleared ? '<p style="color:var(--neon)">直升机已抵达，你活着离开了尸潮。剩余 HP：' + stats.hp + '</p>' : ''}
    ${isNew ? '<p style="color:#ffd75e;font-size:24px">新纪录！</p>' : ''}
    <p>${cleared ? '用时' : '存活时间'}：${formatTime(stats.time)}</p>
    <p>击杀数：${stats.kills}</p>
    <button id="gameover-restart" class="btn">再来一局</button>
    <button id="gameover-menu" class="btn btn-dim">回主菜单</button>
  `;
  rootEl.classList.remove('hidden');
  bindIconFallback(rootEl);
  rootEl.querySelector('#gameover-restart').addEventListener('click', () => {
    hideTooltip();
    rootEl.classList.add('hidden');
    onRestart();
  });
  rootEl.querySelector('#gameover-menu').addEventListener('click', () => {
    hideTooltip();
    rootEl.classList.add('hidden');
    onMenu();
  });
  if (isAdventure) {
    rootEl.querySelector('#gameover-levels').addEventListener('click', () => {
      hideTooltip();
      rootEl.classList.add('hidden');
      onLevels();
    });
  }
  attachTooltips(rootEl);
}
