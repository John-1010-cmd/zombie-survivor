// src/ui/upgrades.js —— 武器局外升级（金币，设计 §6.2）。DOM 胶水，无单测。
// 每把武器：当前等级 / 下一级伤害 / 价格；余额不足或满级置灰；购买即写 meta 并回调保存。
import { WEAPONS } from '../config/bestiary/weapons.js';
import { weaponUpgradePrice } from '../config/economy.js';
import { weaponLevel, spendGold } from '../core/meta.js';

export function showUpgrades(rootEl, meta, onBack, onSave) {
  const render = () => {
    rootEl.innerHTML = `
      <h2>武器升级</h2>
      <p>金币余额：${meta.gold}</p>
      <div class="upgrade-list">
        ${Object.values(WEAPONS).map(w => {
          const lv = weaponLevel(meta, w.id);
          const maxed = lv >= 10;
          const price = maxed ? null : weaponUpgradePrice(lv);
          const curDmg = w.damage * (1 + 0.2 * lv);
          const nextDmg = w.damage * (1 + 0.2 * (lv + 1));
          const disabled = maxed || meta.gold < price;
          return `
            <div class="card upgrade-row">
              <h4>${w.name} <span>Lv ${lv}/10</span></h4>
              <p>伤害 ${Math.round(curDmg)}${maxed ? '（已满级）' : ` → ${Math.round(nextDmg)}`}</p>
              <button class="btn upgrade-buy" data-id="${w.id}" ${disabled ? 'disabled' : ''}>
                ${maxed ? '满级' : `升级（${price} 金币）`}
              </button>
            </div>`;
        }).join('')}
      </div>
      <button id="upgrades-back" class="btn btn-dim">返回</button>
    `;
    for (const btn of rootEl.querySelectorAll('.upgrade-buy')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const lv = weaponLevel(meta, id);
        if (lv >= 10) return;
        if (!spendGold(meta, weaponUpgradePrice(lv))) return;
        meta.weaponLevels[id] = lv + 1;
        onSave();
        render();
      });
    }
    rootEl.querySelector('#upgrades-back').addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onBack();
    });
  };
  rootEl.classList.remove('hidden');
  render();
}
