// src/ui/pause.js —— Esc 暂停菜单（DOM 胶水）。
import { attachTooltips, hideTooltip } from './tooltip.js';

export function showPause(rootEl, settings, handlers) {
  const { onResume, onQuit, onChange } = handlers;
  rootEl.innerHTML = `
    <h2>暂停</h2>
    <div class="pause-row">
      <label data-tooltip="音量：调整音量">
        音量 <input id="pause-volume" type="range" min="0" max="100"
          value="${Math.round(settings.volume * 100)}" aria-label="音量">
      </label>
    </div>
    <div class="pause-row">
      <label data-tooltip="伤害数字：显示或隐藏战斗伤害数字">
        <input id="pause-damage" type="checkbox"${settings.damageNumbers ? ' checked' : ''}> 伤害数字
      </label>
    </div>
    <div class="pause-row">
      <label data-tooltip="震屏：受击和爆炸时启用或关闭屏幕震动">
        <input id="pause-shake" type="checkbox"${settings.screenShake ? ' checked' : ''}> 震屏
      </label>
    </div>
    <div class="pause-buttons">
      <button id="pause-resume" class="btn" title="继续游戏">继续</button>
      <button id="pause-quit" class="btn btn-dim" title="回主菜单">回主菜单</button>
    </div>
  `;
  rootEl.classList.remove('hidden');

  rootEl.querySelector('#pause-resume').addEventListener('click', () => {
    hideTooltip();
    rootEl.classList.add('hidden');
    onResume();
  });
  rootEl.querySelector('#pause-quit').addEventListener('click', () => {
    hideTooltip();
    rootEl.classList.add('hidden');
    onQuit();
  });
  rootEl.querySelector('#pause-volume').addEventListener('input', e => {
    onChange({ ...settings, volume: Number(e.target.value) / 100 });
  });
  rootEl.querySelector('#pause-damage').addEventListener('change', e => {
    onChange({ ...settings, damageNumbers: e.target.checked });
  });
  rootEl.querySelector('#pause-shake').addEventListener('change', e => {
    onChange({ ...settings, screenShake: e.target.checked });
  });
  attachTooltips(rootEl);
}
