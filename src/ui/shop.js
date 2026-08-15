// src/ui/shop.js —— 商店面板（DOM 胶水，无单测）。
// 迭代 03：分组目录渲染（武器强化/更换武器/辅助武器/辅助强化/道具/风险 各自一行）。
// 目录由 catalogFor 生成（纯逻辑，见 systems/shop.js）；本文件只做展示与回调。
import { WEAPONS, STAT_LABEL, ENHANCE_STATS, STAT_MAX } from '../config/weapons.js';
import { ITEMS } from '../config/items.js';
import { AUX_CONFIG } from '../entities/companions.js';
import { AUX_MAX } from '../config/economy.js';
import { catalogFor } from '../systems/shop.js';

// 条目 → {title, desc, price}（earlyTier 无 price）
function entryView(entry, game) {
  const max = STAT_MAX;
  if (entry.kind === 'enhance') {
    return { title: STAT_LABEL[entry.stat], desc: `当前 ${entry.owned}/${max} 级`, price: entry.price };
  }
  if (entry.kind === 'weapon') {
    return { title: WEAPONS[entry.weapon].name, desc: '更换主武器（增强清零）', price: entry.price };
  }
  if (entry.kind === 'aux') {
    const c = AUX_CONFIG[entry.aux];
    return {
      title: c.name,
      desc: `数量 ${game.aux.counts[entry.aux]}/${AUX_MAX[entry.aux]}（再买 +1）· 伤害${c.damage} 射速${c.fireRate} 射程${c.range}`,
      price: entry.price,
    };
  }
  if (entry.kind === 'auxEnhance') {
    return { title: `${AUX_CONFIG[entry.aux].name} · ${STAT_LABEL[entry.stat]}`, desc: `当前 ${entry.owned}/${max} 级`, price: entry.price };
  }
  if (entry.kind === 'deployEnhance') {
    const label = entry.target === 'turret' ? `固定火炮 · ${STAT_LABEL[entry.stat]}` : '围墙 · 每段耐久 +50%';
    return { title: label, desc: `当前 ${entry.owned}/${max} 级`, price: entry.price };
  }
  if (entry.kind === 'item') {
    const it = ITEMS[entry.item];
    return { title: it.name, desc: `${it.desc}（持有 ${game.inventory[entry.item] || 0}）`, price: entry.price };
  }
  return {
    title: '提前进入下一档',
    desc: entry.bonus > 0 ? `下一档立即到来，奖励 ${entry.bonus} 银币` : '下一档立即到来（无奖励）',
    price: null,
  };
}

export function showShop(rootEl, game, handlers) {
  const { onBuy, onEarlyTier, onClose } = handlers;
  const groups = catalogFor(game, game.tierRemaining);

  const head = document.createElement('div');
  head.className = 'shop-head';
  head.innerHTML = `<h2>商店</h2><p class="shop-coins">银币：${game.coins}</p>`;

  const build = document.createElement('div');
  build.className = 'build';
  const dims = ENHANCE_STATS.map(s => `${STAT_LABEL[s].split(' ')[0]} ${game.weapon.enhance[s]}/${STAT_MAX}`).join('　');
  build.innerHTML = `<div class="build-head">${WEAPONS[game.weapon.id].name}</div><div class="build-stat">${dims}</div>`;

  const wrap = document.createElement('div');
  wrap.className = 'shop-groups';
  for (const g of groups) {
    if (g.entries.length === 0) continue; // 空组不渲染（如全部满级）
    const row = document.createElement('div');
    row.className = 'shop-row';
    const label = document.createElement('h3');
    label.className = 'shop-row-title';
    label.textContent = g.group;
    row.appendChild(label);
    const list = document.createElement('div');
    list.className = 'shop-list';
    for (const entry of g.entries) {
      const v = entryView(entry, game);
      const el = document.createElement('div');
      const affordable = v.price === null || game.coins >= v.price;
      el.className = 'shop-item' + (affordable ? '' : ' disabled');
      el.innerHTML = `<h4>${v.title}</h4><p>${v.desc}</p>` +
        (v.price !== null ? `<p class="shop-price">${v.price} 银币</p>` : '');
      el.addEventListener('click', () => {
        if (entry.kind === 'earlyTier') onEarlyTier(entry.bonus);
        else if (affordable) onBuy(entry);
      });
      list.appendChild(el);
    }
    row.appendChild(list);
    wrap.appendChild(row);
  }

  const btn = document.createElement('button');
  btn.id = 'shop-close';
  btn.textContent = '离开商店（Esc）';
  btn.addEventListener('click', onClose);

  rootEl.replaceChildren(head, build, wrap, btn);
  rootEl.classList.remove('hidden');
}
