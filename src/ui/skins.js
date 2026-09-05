// src/ui/skins.js —— 主菜单外观选择（DOM 胶水，设计 §6.4）。
import { SKINS } from '../config/skins.js';
import { spendGold } from '../core/meta.js';
import { ASSET_BY_ID } from '../config/assets.js';
import { getVisualCanvas } from '../core/visuals.js';

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
    host.replaceChildren(getVisualCanvas(id, size, options));
  } catch {
    host.textContent = id === GOLD_ICON_ID ? '金币' : '视觉不可用';
  }
}

function mountPortrait(host, skin) {
  try {
    host.replaceChildren(getVisualCanvas(skin.portrait, 192, {
      frame: { direction: 'down', index: 0 },
    }));
    return;
  } catch {
    const fallback = SKINS[DEFAULT_SKIN_ID];
    if (skin.id !== fallback.id) {
      try {
        host.replaceChildren(getVisualCanvas(fallback.portrait, 192, {
          frame: { direction: 'down', index: 0 },
        }));
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

export function showSkins(rootEl, meta, onBack, onSave = () => {}) {
  let previewId = SKINS[meta?.skins?.selected] ? meta.skins.selected : DEFAULT_SKIN_ID;
  let message = '';

  const render = () => {
    const current = SKINS[previewId] || SKINS[DEFAULT_SKIN_ID];
    const currentView = skinView(current, meta);
    rootEl.innerHTML = `
      <h2>外观</h2>
      <p id="skins-balance">当前余额：<span class="skin-currency-icon" data-icon="${GOLD_ICON_ID}" aria-hidden="true"></span>${meta.gold} 金币</p>
      <div class="skin-layout">
        <div class="skin-list">
          ${Object.values(SKINS).map(skin => {
            const view = skinView(skin, meta);
            return `
              <button type="button" class="card skin-card${view.selected ? ' selected' : ''}${view.owned ? '' : ' locked'}" data-skin-id="${view.id}">
                <strong>${view.name}</strong>
                <span>${view.owned ? (view.selected ? '使用中' : '已拥有') : currencyMarkup(view.price.amount)}</span>
              </button>`;
          }).join('')}
        </div>
        <div class="card skin-detail">
          <div id="skin-portrait" class="skin-portrait" aria-label="${current.name}立绘"></div>
          <h3 id="skin-name">${current.name}</h3>
          <p id="skin-description">${current.description}</p>
          <p id="skin-price">${currencyMarkup(current.price.amount)}</p>
          <p id="skins-message" class="skin-message">${message}</p>
          <button id="skin-action" class="btn"${currentView.disabled ? ' disabled' : ''}>${currentView.action}</button>
        </div>
      </div>
      <button id="skins-back" class="btn btn-dim">取消</button>
    `;

    mountPortrait(rootEl.querySelector('#skin-portrait'), current);
    for (const icon of rootEl.querySelectorAll('.skin-currency-icon'))
      mountVisual(icon, icon.dataset.icon, 24);

    for (const card of rootEl.querySelectorAll('.skin-card')) {
      card.addEventListener('click', () => {
        previewId = card.dataset.skinId;
        message = '';
        render();
      });
    }

    const action = rootEl.querySelector('#skin-action');
    if (!currentView.disabled) {
      action.addEventListener('click', () => {
        const result = applySkinAction(meta, previewId);
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

    rootEl.querySelector('#skins-back').addEventListener('click', () => {
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
