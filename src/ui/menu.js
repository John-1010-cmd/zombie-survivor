// src/ui/menu.js —— 主菜单覆盖层（DOM 胶水，无单测）
// showMenu(rootEl, best, onStart(mode))：三模式入口 + 各模式最佳纪录文案。
import { formatTime } from '../systems/hud.js';

function bestText(mode, rec) {
  if (!rec) return '暂无纪录';
  if (mode === 'endless') {
    return `存活 ${formatTime(rec.time)} / 击杀 ${rec.kills}`;
  }
  return rec.cleared
    ? `已救援 · 剩余 HP ${rec.hp}`
    : `存活 ${formatTime(rec.time)}`;
}

export function showMenu(rootEl, best, onStart) {
  const b = best || {};
  const modes = [
    { key: 'endless', label: '无尽模式' },
    { key: 'holdout10', label: '坚守 10 分钟' },
    { key: 'holdout20', label: '坚守 20 分钟' },
  ];
  rootEl.innerHTML = `
    <h1>Zombie Survivor</h1>
    ${modes.map(m => `
      <p id="menu-best-${m.key}">${m.label}：${bestText(m.key, b[m.key])}</p>
    `).join('')}
    ${modes.map(m => `
      <button id="menu-start-${m.key}">${m.label}</button>
    `).join('')}
  `;
  rootEl.classList.remove('hidden');
  for (const m of modes) {
    rootEl.querySelector('#menu-start-' + m.key).addEventListener('click', () => {
      rootEl.classList.add('hidden');
      onStart(m.key);
    });
  }
}
