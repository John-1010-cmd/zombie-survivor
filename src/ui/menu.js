// src/ui/menu.js —— 主菜单覆盖层（DOM 胶水）。
import { formatTime } from '../systems/hud.js';

export function showMenu(rootEl, best, handlers) {
  const { onAdventure, onEndless, onBestiary, onUpgrades, onSkins } = handlers;
  const rec = (best || {}).endless;
  const bestLine = rec ? `无尽最佳：存活 ${formatTime(rec.time)} / 击杀 ${rec.kills}` : '暂无纪录';
  rootEl.innerHTML = `
    <h1>Zombie Survivor</h1>
    <button id="menu-adventure" class="btn">冒险</button>
    <button id="menu-endless" class="btn">无尽</button>
    <button id="menu-bestiary" class="btn btn-dim">图鉴</button>
    <button id="menu-upgrades" class="btn btn-dim">武器升级</button>
    <button id="menu-skins" class="btn btn-dim">外观</button>
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
  wire('menu-skins', onSkins);
}
