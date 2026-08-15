// src/ui/shop.js —— 商店面板（DOM 胶水，无单测）。
// showShop(rootEl, game, handlers)：
//   game = { coins, weapon, inventory, tierRemaining }
//   handlers = { onBuy(entry), onEarlyTier(bonus), onClose() }
// 目录由 catalogFor 生成（纯逻辑，见 systems/shop.js）；本文件只做展示与回调。
import { WEAPONS, STAT_LABEL, ENHANCE_STATS } from '../config/weapons.js';
import { ITEMS } from '../config/items.js';
import { catalogFor } from '../systems/shop.js';

function entryView(entry, game) {
  if (entry.kind === 'enhance') {
    const label = STAT_LABEL[entry.stat];
    return { title: '武器强化', desc: `${label}（已强化 ${entry.owned} 次）`, price: entry.price };
  }
  if (entry.kind === 'weapon') {
    return { title: '更换武器', desc: `${WEAPONS[entry.weapon].name}（从 Lv1 开始）`, price: entry.price };
  }
  if (entry.kind === 'item') {
    const it = ITEMS[entry.item];
    return { title: it.name, desc: `${it.desc}（持有 ${game.inventory[entry.item] || 0}）`, price: entry.price };
  }
  return { title: '提前进入下一档', desc: entry.bonus > 0 ? `下一档立即到来，奖励 ${entry.bonus} 银币` : '下一档立即到来（无奖励）', price: null };
}

export function showShop(rootEl, game, handlers) {
  const { onBuy, onEarlyTier, onClose } = handlers;
  const entries = catalogFor(game, game.tierRemaining);

  const head = document.createElement('div');
  head.className = 'shop-head';
  head.innerHTML = `<h2>商店</h2><p class="shop-coins">银币：${game.coins}</p>`;

  const build = document.createElement('div');
  build.className = 'build';
  const stats = ENHANCE_STATS
    .map(s => `${STAT_LABEL[s]} ×${game.weapon.enhance[s]}`)
    .join('　');
  build.innerHTML = `<div class="build-head">${WEAPONS[game.weapon.id].name} · Lv${game.weapon.level}</div><div class="build-stat">${stats}</div>`;

  const wrap = document.createElement('div');
  wrap.className = 'shop-list';
  for (const entry of entries) {
    const v = entryView(entry, game);
    const el = document.createElement('div');
    el.className = 'shop-item' + (v.price !== null && game.coins < v.price ? ' disabled' : '');
    el.innerHTML = `<h3>${v.title}</h3><p>${v.desc}</p>` +
      (v.price !== null ? `<p class="shop-price">${v.price} 银币</p>` : '');
    el.addEventListener('click', () => {
      if (entry.kind === 'earlyTier') onEarlyTier(entry.bonus);
      else if (game.coins >= entry.price) onBuy(entry);
    });
    wrap.appendChild(el);
  }

  const btn = document.createElement('button');
  btn.id = 'shop-close';
  btn.textContent = '离开商店（Esc）';
  btn.addEventListener('click', onClose);

  rootEl.replaceChildren(head, build, wrap, btn);
  rootEl.classList.remove('hidden');
}
