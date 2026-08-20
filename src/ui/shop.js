// src/ui/shop.js —— 商店面板（DOM 胶水，无单测）。
// 迭代 03：分组目录渲染（武器强化/更换武器/辅助武器/辅助强化/道具/风险 各自一行）。
// 目录由 catalogFor 生成（纯逻辑，见 systems/shop.js）；本文件只做展示与回调。
import { WEAPONS, STAT_LABEL, ENHANCE_STATS, STAT_MAX } from '../config/bestiary/weapons.js';
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
    const refundNote = (entry.refund ?? 0) > 0 ? `（返还强化 ${entry.refund} 银币）` : '';
    return { title: WEAPONS[entry.weapon].name, desc: `更换主武器（增强清零）${refundNote}`, price: entry.price };
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

// 单条目 DOM：owned0（未拥有该辅助类型）置灰不可点；earlyTier 走 onEarlyTier
function buildEntryEl(entry, game, handlers) {
  const { onBuy, onEarlyTier } = handlers;
  const v = entryView(entry, game);
  const el = document.createElement('div');
  const affordable = v.price === null || game.coins >= v.price;
  const disabled = !affordable || entry.owned0 === true;
  el.className = 'shop-item' + (disabled ? ' disabled' : '');
  el.innerHTML = `<h4>${v.title}</h4><p>${v.desc}</p>` +
    (v.price !== null ? `<p class="shop-price">${v.price} 银币</p>` : '');
  el.addEventListener('click', () => {
    if (entry.kind === 'earlyTier') onEarlyTier(entry.bonus);
    else if (!disabled) onBuy(entry);
  });
  return el;
}

export function showShop(rootEl, game, handlers, opts = {}) {
  const { onBuy, onEarlyTier, onClose } = handlers;
  const groups = catalogFor(game, game.tierRemaining, opts);

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

    if (g.group === '辅助强化') {
      // 辅助强化按类型分行：每类型一行标题 + 该类型条目横排（owned0 类型整行条目置灰）
      const types = [];
      for (const entry of g.entries) {
        let sub = types.find(t => t.aux === entry.aux);
        if (!sub) { sub = { aux: entry.aux, entries: [] }; types.push(sub); }
        sub.entries.push(entry);
      }
      for (const t of types) {
        const sub = document.createElement('div');
        sub.className = 'shop-row';
        const subLabel = document.createElement('h3');
        subLabel.className = 'shop-row-title';
        subLabel.textContent = AUX_CONFIG[t.aux].name;
        sub.appendChild(subLabel);
        const list = document.createElement('div');
        list.className = 'shop-list';
        for (const entry of t.entries) list.appendChild(buildEntryEl(entry, game, handlers));
        sub.appendChild(list);
        row.appendChild(sub);
      }
    } else {
      const list = document.createElement('div');
      list.className = 'shop-list';
      for (const entry of g.entries) list.appendChild(buildEntryEl(entry, game, handlers));
      row.appendChild(list);
    }
    wrap.appendChild(row);
  }

  const btn = document.createElement('button');
  btn.id = 'shop-close';
  btn.textContent = '离开商店（Esc）';
  btn.addEventListener('click', onClose);

  rootEl.replaceChildren(head, build, wrap, btn);
  rootEl.classList.remove('hidden');
}
