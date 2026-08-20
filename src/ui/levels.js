// src/ui/levels.js —— 冒险关卡选择（设计 §3.1/§8）。DOM 胶水，无单测。
// 卡片式：名称 / 锁定（???）/ 最佳成绩（通关标记或存活时间）/ 金币奖励。
import { ADVENTURE_LEVELS } from '../config/adventure.js';
import { formatTime } from '../systems/hud.js';

export function showLevels(rootEl, meta, onStart, onBack) {
  // unlocked 上限夹取在 UI 层按 ADVENTURE_LEVELS.length 做（meta.js 不反向依赖 adventure 配置）
  const unlockedMax = Math.min(meta.adventure.unlocked, ADVENTURE_LEVELS.length);
  rootEl.innerHTML = `
    <h2>冒险模式</h2>
    <p>金币余额：${meta.gold}</p>
    <div class="level-cards">
      ${ADVENTURE_LEVELS.map((lv, i) => {
        const unlocked = unlockedMax >= i + 1;
        const best = meta.adventure.bestTimes[lv.id];
        const bestText = !best ? '' : best.cleared ? '已通关' : `最佳：存活 ${formatTime(best.timeSec)}`;
        return `
          <div class="level-card${unlocked ? '' : ' locked'}" data-level="${unlocked ? lv.id : ''}">
            <h3>${unlocked ? `第 ${i + 1} 关 · ${lv.name}` : '???'}</h3>
            <p>${unlocked ? `通关奖励 ${lv.goldReward} 金币（首通 ×2）` : '通关上一关解锁'}</p>
            <p>${bestText}</p>
          </div>`;
      }).join('')}
    </div>
    <button id="levels-back">返回</button>
  `;
  rootEl.classList.remove('hidden');
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
}
