// src/ui/skins.js —— 主菜单外观选择（DOM 胶水，设计 §6.4）。
import { SKINS } from '../config/skins.js';
import { spendGold } from '../core/meta.js';
import { ASSET_BY_ID } from '../config/assets.js';
import { getVisualCanvas } from '../core/visuals.js';
import { createTooltip, bindTooltip, hideTooltip } from './tooltip.js';

const DEFAULT_SKIN_ID = 'wastelandAdventurer';
const GOLD_ICON_ID = 'icon.currency.gold';

export function skinView(skin, meta) {
  const owned = Array.isArray(meta?.skins?.owned) && meta.skins.owned.includes(skin.id);
  const selected = meta?.skins?.selected === skin.id;
  const affordable = owned || (skin.price.currency === 'gold' && meta.gold >= skin.price.amount);
  return {
    id: skin.id,
    name: skin.name,
    description: skin.description,
    portrait: skin.portrait,
    owned,
    selected,
    price: { ...skin.price },
    balance: meta.gold,
    action: selected ? '使用中' : owned ? '选用' : '解锁',
    disabled: selected,
    affordable,
  };
}

export function applySkinAction(meta, skinId) {
  const skin = SKINS[skinId];
  if (!skin) return { ok: false, reason: 'invalid-skin', skinId };
  if (!Array.isArray(meta.skins.owned))
    return { ok: false, reason: 'invalid-meta', skinId };
  if (!meta.skins.owned.includes(skinId)) {
    if (skin.price.currency !== 'gold')
      return { ok: false, reason: 'unsupported-currency', skinId };
    if (!spendGold(meta, skin.price.amount))
      return { ok: false, reason: 'insufficient-gold', skinId };
    meta.skins.owned.push(skinId);
    meta.skins.selected = skinId;
    return { ok: true, action: 'purchased', skinId };
  }
  meta.skins.selected = skinId;
  return { ok: true, action: 'selected', skinId };
}

function mountVisual(host, id, size, options = {}) {
  try {
    const canvas = getVisualCanvas(id, size, options);
    if (typeof host.replaceChildren === 'function') {
      host.replaceChildren(canvas);
    } else {
      host.innerHTML = '';
      host.appendChild(canvas);
    }
  } catch {
    host.textContent = id === GOLD_ICON_ID ? '金币' : '视觉不可用';
  }
}

function mountPortrait(host, skin, size = 64) {
  if (!host) return;
  try {
    const canvas = getVisualCanvas(skin.portrait, size, {
      frame: { direction: 'down', index: 0 },
    });
    if (typeof host.replaceChildren === 'function') {
      host.replaceChildren(canvas);
    } else {
      host.innerHTML = '';
      host.appendChild(canvas);
    }
    return;
  } catch {
    const fallback = SKINS[DEFAULT_SKIN_ID];
    if (skin.id !== fallback.id) {
      try {
        const fallbackCanvas = getVisualCanvas(fallback.portrait, size, {
          frame: { direction: 'down', index: 0 },
        });
        if (typeof host.replaceChildren === 'function') {
          host.replaceChildren(fallbackCanvas);
        } else {
          host.innerHTML = '';
          host.appendChild(fallbackCanvas);
        }
        return;
      } catch {
        host.textContent = fallback.name;
        return;
      }
    }
    host.textContent = fallback.name;
  }
}

function currencyMarkup(amount) {
  const label = amount === 0 ? '免费' : `${amount} 金币`;
  return `<span class="skin-currency-icon" data-icon="${GOLD_ICON_ID}" aria-hidden="true"></span>${label}`;
}

function enableHorizontalWheel(container) {
  if (!container?.addEventListener) return;
  container.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && container.scrollWidth > container.clientWidth) {
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    }
  }, { passive: false });
}

export function showSkins(rootEl, meta, onBack, onSave = () => {}) {
  let message = '';
  let tooltip = null;

  const render = () => {
    hideTooltip();
    tooltip?.destroy?.();
    tooltip = createTooltip(rootEl.ownerDocument?.body || rootEl);

    rootEl.innerHTML = `
      <h2>外观</h2>
      <p id="skins-balance">当前余额：<span class="skin-currency-icon" data-icon="${GOLD_ICON_ID}" aria-hidden="true"></span>${meta.gold} 金币</p>
      <div class="skin-row skin-list">
        ${Object.values(SKINS).map(skin => {
          const view = skinView(skin, meta);
          return `
            <button type="button" class="card skin-card${view.selected ? ' selected' : ''}${view.owned ? '' : ' locked'}" data-skin-id="${view.id}" data-tooltip-name="${view.name}" data-tooltip-description="${view.description}">
              <div class="skin-portrait" data-portrait-skin="${view.id}" aria-label="${view.name}立绘"></div>
              <strong class="skin-name">${view.name}</strong>
              <span class="skin-status">${view.owned ? (view.selected ? '使用中' : '已拥有') : currencyMarkup(view.price.amount)}</span>
            </button>`;
        }).join('')}
      </div>
      <p id="skins-message" class="skin-message">${message}</p>
      <button id="skins-back" class="btn btn-dim">返回</button>
    `;

    for (const card of rootEl.querySelectorAll('.skin-card')) {
      const skinId = card.dataset.skinId;
      const skin = SKINS[skinId];
      if (skin) {
        mountPortrait(card.querySelector('.skin-portrait'), skin, 64);
        bindTooltip(card, tooltip, { name: skin.name, description: skin.description });
      }
      card.addEventListener('click', () => {
        if (meta?.skins?.selected === skinId) return;
        const result = applySkinAction(meta, skinId);
        if (!result.ok) {
          message = result.reason === 'insufficient-gold'
            ? '购买失败：金币不足'
            : '购买失败：皮肤不可用';
          render();
          return;
        }
        onSave();
        message = result.action === 'purchased' ? '解锁成功，已自动选中' : '已选用';
        render();
      });
    }

    for (const icon of rootEl.querySelectorAll('.skin-currency-icon'))
      mountVisual(icon, icon.dataset.icon, 20);

    enableHorizontalWheel(rootEl.querySelector('.skin-row'));

    rootEl.querySelector('#skins-back').addEventListener('click', () => {
      hideTooltip();
      tooltip?.destroy?.();
      rootEl.classList.add('hidden');
      onBack();
    });
  };

  rootEl.classList.remove('hidden');
  render();
}

export function skinAssetPath(id) {
  return ASSET_BY_ID[SKINS[id]?.portrait]?.path ?? '';
}
