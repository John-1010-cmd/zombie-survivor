// src/ui/menu.js —— 主菜单覆盖层（DOM 胶水，无单测）
// showMenu(rootEl, best, handlers)：handlers = { onAdventure, onEndless, onBestiary, onUpgrades }
// 坚守 10/20 从菜单移除（代码与 MODES 保留，开发者菜单提供调试入口，设计 §8/§10）。
import { formatTime } from '../systems/hud.js';

export function showMenu(rootEl, best, handlers) {
  const { onAdventure, onEndless, onBestiary, onUpgrades } = handlers;
  const rec = (best || {}).endless;
  const bestLine = rec ? `无尽最佳：存活 ${formatTime(rec.time)} / 击杀 ${rec.kills}` : '暂无纪录';
  rootEl.innerHTML = `
    <h1>Zombie Survivor</h1>
    <button id="menu-adventure">冒险</button>
    <button id="menu-endless">无尽</button>
    <button id="menu-bestiary">图鉴</button>
    <button id="menu-upgrades">武器升级</button>
    <p id="menu-best-endless">${bestLine}</p>
  `;
  rootEl.classList.remove('hidden');
  const wire = (id, fn) => rootEl.querySelector('#' + id).addEventListener('click', () => {
    rootEl.classList.add('hidden');
    fn();
  });
  wire('menu-adventure', onAdventure);
  wire('menu-endless', onEndless);
  wire('menu-bestiary', onBestiary);
  wire('menu-upgrades', onUpgrades);
}
