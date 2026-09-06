// src/ui/levels.js —— 冒险关卡选择（设计 §3.1/§8）。
import { ADVENTURE_LEVELS } from '../config/adventure.js';
import { formatTime } from '../systems/hud.js';
import { createIconMarkup, bindIconFallback } from './icons.js';
import { attachTooltips } from './tooltip.js';

export function showLevels(rootEl, meta, onStart, onBack) {
  const unlockedMax = Math.min(meta.adventure.unlocked, ADVENTURE_LEVELS.length);
  rootEl.innerHTML = `
    <h2>冒险模式</h2>
    <p class="levels-balance" data-tooltip="金币余额：${meta.gold}，当前可用于关卡奖励和外观解锁">${createIconMarkup('icon.currency.gold', '金币')}<span>金币余额：${meta.gold}</span></p>
    <div class="level-cards">
      ${ADVENTURE_LEVELS.map((lv, i) => {
        const unlocked = unlockedMax >= i + 1;
        const best = meta.adventure.bestTimes[lv.id];
        const bestText = !best ? '' : best.cleared ? '已通关' : `最佳：存活 ${formatTime(best.timeSec)}`;
        const rewardText = `通关奖励 ${lv.goldReward} 金币（首通 ×2）`;
        return `
          <div class="card level-card${unlocked ? '' : ' locked'}" data-level="${unlocked ? lv.id : ''}">
            <h3>${unlocked ? `第 ${i + 1} 关 · ${lv.name}` : '???'}</h3>
            <p class="level-reward"${unlocked ? ` data-tooltip="${rewardText}"` : ''}>${unlocked ? createIconMarkup('icon.currency.gold', '金币') + `<span>${rewardText}</span>` : '通关上一关解锁'}</p>
            <p>${bestText}</p>
          </div>`;
      }).join('')}
    </div>
    <button id="levels-back" class="btn btn-dim" title="返回主菜单">返回</button>
  `;
  rootEl.classList.remove('hidden');
  bindIconFallback(rootEl);
  for (const card of rootEl.querySelectorAll('.level-card:not(.locked)')) {
    card.addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onStart(card.dataset.level);
    });
  }
  rootEl.querySelector('#levels-back').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onBack();
  });
  attachTooltips(rootEl);
}
