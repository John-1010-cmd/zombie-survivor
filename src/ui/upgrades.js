// src/ui/upgrades.js —— 武器局外升级（金币，设计 §6.2）。DOM 胶水，无单测。
// 每把武器：当前等级 / 下一级伤害 / 价格；余额不足或满级置灰；购买即写 meta 并回调保存。
import { WEAPONS } from '../config/bestiary/weapons.js';
import { weaponUpgradePrice } from '../config/economy.js';
import { weaponLevel, spendGold } from '../core/meta.js';
import { createIconCanvas } from './icon.js';
import { attachTooltips } from './tooltip.js';

export function upgradeView(w, meta) {
  const level = weaponLevel(meta, w.id);
  const maxed = level >= 10;
  const price = maxed ? null : weaponUpgradePrice(level);
  const currentDamage = Math.round(w.damage * (1 + 0.2 * level) * 100) / 100;
  const nextDamage = maxed ? null : Math.round(w.damage * (1 + 0.2 * (level + 1)) * 100) / 100;
  return {
    id: w.id, icon: w.icon, level, maxed, price,
    currentDamage, nextDamage,
    disabled: maxed || meta.gold < price,
  };
}

export function showUpgrades(rootEl, meta, onBack, onSave) {
  const render = () => {
    rootEl.innerHTML = `
      <h2>武器升级</h2>
      <p>金币余额：${meta.gold}</p>
      <div class="upgrade-list">
        ${Object.values(WEAPONS).map(w => {
          const v = upgradeView(w, meta);
          return `
            <div class="card upgrade-row"
                 data-visual-id="${v.icon}"
                 data-tooltip-name="${w.name}"
                 data-tooltip-description="${w.desc}"
                 data-tooltip-value="伤害 ${Math.round(v.currentDamage)}${v.maxed ? '' : ` → ${Math.round(v.nextDamage)}`}">
              <h4>${w.name} <span>Lv ${v.level}/10</span></h4>
              <p>伤害 ${Math.round(v.currentDamage)}${v.maxed ? '（已满级）' : ` → ${Math.round(v.nextDamage)}`}</p>
              <button class="btn upgrade-buy" data-id="${w.id}"${v.disabled ? ' disabled' : ''}${v.maxed ? '' : ' data-currency-icon="icon.currency.gold"'}>
                ${v.maxed ? '满级' : `升级（${v.price} 金币）`}
              </button>
            </div>`;
        }).join('')}
      </div>
      <button id="upgrades-back" class="btn btn-dim">返回</button>
    `;
    for (const row of rootEl.querySelectorAll('.upgrade-row[data-visual-id]'))
      row.prepend(createIconCanvas(row.dataset.visualId, 48));
    for (const button of rootEl.querySelectorAll('.upgrade-buy[data-currency-icon]')) {
      const currency = createIconCanvas(button.dataset.currencyIcon, 24);
      currency.className = 'currency-icon';
      button.prepend(currency);
    }
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
    attachTooltips(rootEl);
  };
  rootEl.classList.remove('hidden');
  render();
}
