// src/ui/bestiary.js —— 图鉴界面（设计 §7）。DOM 胶水；monsterView/weaponView 为纯函数可单测。
// 怪物：当前可达种类网格（special 隐藏），首次击杀解锁（bestiaryKills[id] ≥ 1）；
// 未解锁显示统一 ??? 占位卡（不画形状剪影，避免泄露）。武器：全部可见。
// 数值口径：展示图鉴基础值（关卡 1、局内 0 分钟），局内实际值随关卡与时间增长。
import { playableMonsters } from '../config/bestiary/monsters.js';
import { WEAPONS } from '../config/bestiary/weapons.js';
import { getVisualCanvas } from '../core/visuals.js';

export const BESTIARY_VISUAL_SIZES = Object.freeze([24, 32, 48, 64]);
const BESTIARY_VISUAL_SIZE = 48;

export function monsterView(m, bestiaryKills) {
  const kills = bestiaryKills[m.id] ?? 0;
  if (kills < 1) return { id: m.id, unlocked: false, name: '???', kills: 0 };
  return {
    id: m.id,
    unlocked: true,
    name: m.name,
    desc: m.desc,
    visual: m.visual,
    kills,
    stats: { hp: m.hp, speed: m.speed, damage: m.damage, coin: m.coin },
  };
}

export function weaponView(w, weaponLevels) {
  const level = weaponLevels[w.id] ?? 0;
  return {
    id: w.id,
    name: w.name,
    desc: w.desc,
    icon: w.icon,
    level,
    maxed: level >= 10,
    damage: w.damage,
    nextDamage: w.damage * (1 + 0.2 * (level + 1)),
    nextDelta: Math.round(w.damage * 0.2),
    stats: { fireRate: w.fireRate, range: w.range, pierce: w.pierce },
  };
}

function mountVisualSlots(rootEl, slots) {
  for (const slot of slots) {
    const target = rootEl.querySelector(`[data-visual-slot="${slot.key}"]`);
    if (!target) continue;
    const canvas = getVisualCanvas(slot.id, slot.size, slot.options);
    canvas.className = 'bestiary-visual';
    canvas.setAttribute?.('aria-hidden', 'true');
    target.replaceWith(canvas);
  }
}

export function showBestiary(rootEl, meta, onBack) {
  const render = tab => {
    const monsterCards = playableMonsters().map(m => monsterView(m, meta.bestiaryKills));
    const weaponCards = Object.values(WEAPONS).map(w => weaponView(w, meta.weaponLevels));
    const slots = [];
    const visualSlot = (key, id, options = {}) => {
      slots.push({ key, id, size: BESTIARY_VISUAL_SIZE, options });
      return `<span class="bestiary-visual-slot" data-visual-slot="${key}" aria-hidden="true"></span>`;
    };

    rootEl.innerHTML = `
      <h2>图鉴</h2>
      <div class="bestiary-tabs">
        <button id="bestiary-tab-monsters" class="btn${tab === 'monsters' ? ' active' : ' btn-dim'}">怪物</button>
        <button id="bestiary-tab-weapons" class="btn${tab === 'weapons' ? ' active' : ' btn-dim'}">武器</button>
      </div>
      <div class="bestiary-grid">
        ${tab === 'monsters' ? monsterCards.map(v => v.unlocked ? `
          <div class="card bestiary-card">
            ${visualSlot(`monster-${v.id}`, v.id, { visual: v.visual })}
            <h4>${v.name}</h4><p>${v.desc}</p>
            <p>HP ${v.stats.hp} · 速度 ${v.stats.speed} · 伤害 ${v.stats.damage} · 银币 ${v.stats.coin}</p>
            <p>累计击杀 ${v.kills}</p>
          </div>` : `
          <div class="card bestiary-card locked">
            <span class="bestiary-lock" aria-hidden="true">?</span>
            <h4>???</h4><p>尚未遭遇</p>
          </div>`).join('')
        : weaponCards.map(v => `
          <div class="card bestiary-card">
            ${visualSlot(`weapon-${v.id}`, v.icon)}
            <h4>${v.name}</h4><p>${v.desc}</p>
            <p>伤害 ${v.damage} · 射速 ${v.stats.fireRate}/s · 射程 ${v.stats.range}</p>
            <p>局外等级 Lv ${v.level}/10${v.maxed ? '（已满级）' : ` · 下一级伤害 +${v.nextDelta}`}</p>
          </div>`).join('')}
      </div>
      <p class="bestiary-note">图鉴数值为基础值（关卡 1、局内 0 分钟口径）；局内实际值随关卡与时间增长。</p>
      <button id="bestiary-back" class="btn btn-dim">返回</button>
    `;
    mountVisualSlots(rootEl, slots);
    rootEl.querySelector('#bestiary-tab-monsters').addEventListener('click', () => render('monsters'));
    rootEl.querySelector('#bestiary-tab-weapons').addEventListener('click', () => render('weapons'));
    rootEl.querySelector('#bestiary-back').addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onBack();
    });
  };
  rootEl.classList.remove('hidden');
  render('monsters');
}
