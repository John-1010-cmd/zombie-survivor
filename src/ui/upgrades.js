// src/ui/upgrades.js —— 武器界面：升级与解锁合并 + 开局出战选择。
import { WEAPONS } from '../config/bestiary/weapons.js';
import { weaponUpgradePrice, weaponUnlockPrice } from '../config/economy.js';
import {
  weaponLevel, spendGold,
  isWeaponUnlocked, unlockWeapon, selectWeapon, selectedWeapon,
} from '../core/meta.js';
import { createIconCanvas } from './icon.js';
import { attachTooltips, hideTooltip } from './tooltip.js';
import { enableHorizontalScroll } from './shop.js';

export function upgradeView(w, meta) {
  const unlocked = isWeaponUnlocked(meta, w.id);
  const selected = selectedWeapon(meta) === w.id;
  const unlockPrice = weaponUnlockPrice(w.id);
  const level = weaponLevel(meta, w.id);
  const maxed = level >= 10;
  const price = maxed ? null : weaponUpgradePrice(level);
  const currentDamage = Math.round(w.damage * (1 + 0.2 * level) * 100) / 100;
  const nextDamage = maxed ? null : Math.round(w.damage * (1 + 0.2 * (level + 1)) * 100) / 100;
  const disabled = unlocked
    ? (maxed || (meta?.gold ?? 0) < price)
    : ((meta?.gold ?? 0) < unlockPrice);

  return {
    id: w.id,
    name: w.name,
    desc: w.desc,
    icon: w.icon,
    unlocked,
    selected,
    unlockPrice,
    level,
    maxed,
    price,
    currentDamage,
    nextDamage,
    disabled,
  };
}

export function showUpgrades(rootEl, meta, onBack, onSave) {
  const render = () => {
    hideTooltip();
    rootEl.innerHTML = `
      <h2>武器</h2>
      <p class="upgrade-balance">金币余额：${meta.gold}</p>
      <div class="upgrade-list">
        ${Object.values(WEAPONS).map(w => {
          const v = upgradeView(w, meta);
          const tooltipValue = v.unlocked
            ? `伤害 ${Math.round(v.currentDamage)}${v.maxed ? '' : ` → ${Math.round(v.nextDamage)}`}`
            : `解锁费用 ${v.unlockPrice} 金币 · 基础伤害 ${Math.round(v.currentDamage)}`;
          return `
            <div class="card upgrade-card upgrade-row${v.selected ? ' selected' : ''}${!v.unlocked ? ' locked' : ''}"
                 data-id="${w.id}"
                 data-visual-id="${v.icon}"
                 data-tooltip-name="${w.name}"
                 data-tooltip-description="${w.desc}"
                 data-tooltip-value="${tooltipValue}">
              <h4>${w.name} <span>${v.unlocked ? `Lv ${v.level}/10` : '未解锁'}</span></h4>
              <p class="upgrade-damage">伤害 ${Math.round(v.currentDamage)}${v.unlocked ? (v.maxed ? '（已满级）' : ` → ${Math.round(v.nextDamage)}`) : '（未解锁）'}</p>
              <div class="upgrade-actions">
                ${v.unlocked ? `
                  ${v.selected ? `
                    <button class="btn btn-select active" disabled>出战中</button>
                  ` : `
                    <button class="btn btn-select upgrade-select" data-id="${w.id}">出战</button>
                  `}
                  <button class="btn upgrade-buy" data-id="${w.id}"${v.disabled ? ' disabled' : ''}${v.maxed ? '' : ' data-currency-icon="icon.currency.gold"'}>
                    ${v.maxed ? '满级' : `升级（${v.price} 金币）`}
                  </button>
                ` : `
                  <button class="btn upgrade-unlock" data-id="${w.id}"${(meta.gold ?? 0) < v.unlockPrice ? ' disabled' : ''} data-currency-icon="icon.currency.gold">
                    解锁（${v.unlockPrice} 金币）
                  </button>
                `}
              </div>
            </div>`;
        }).join('')}
      </div>
      <button id="upgrades-back" class="btn btn-dim">返回</button>
    `;

    for (const row of rootEl.querySelectorAll('.upgrade-row[data-visual-id]'))
      row.prepend(createIconCanvas(row.dataset.visualId, 48));
    for (const button of rootEl.querySelectorAll('[data-currency-icon]')) {
      const currency = createIconCanvas(button.dataset.currencyIcon, 24);
      currency.className = 'currency-icon';
      button.prepend(currency);
    }

    // 卡片点击选中出战
    for (const card of rootEl.querySelectorAll('.upgrade-card')) {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const id = card.dataset.id;
        if (isWeaponUnlocked(meta, id) && selectedWeapon(meta) !== id) {
          selectWeapon(meta, id);
          onSave();
          render();
        }
      });
    }

    // 出战按钮
    for (const btn of rootEl.querySelectorAll('.upgrade-select')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (selectWeapon(meta, id)) {
          onSave();
          render();
        }
      });
    }

    // 解锁按钮
    for (const btn of rootEl.querySelectorAll('.upgrade-unlock')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const price = weaponUnlockPrice(id);
        if (unlockWeapon(meta, id, price)) {
          selectWeapon(meta, id); // 解锁后自动出战
          onSave();
          render();
        }
      });
    }

    // 升级按钮
    for (const btn of rootEl.querySelectorAll('.upgrade-buy')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
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
      hideTooltip();
      rootEl.classList.add('hidden');
      onBack();
    });

    const listEl = rootEl.querySelector('.upgrade-list');
    enableHorizontalScroll(listEl);
    attachTooltips(rootEl);
  };

  rootEl.classList.remove('hidden');
  render();
}
