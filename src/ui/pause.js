// src/ui/pause.js —— Esc 暂停菜单（DOM 胶水，无单测）。
// showPause(rootEl, settings, handlers)：
//   settings = {volume:0–1, damageNumbers:boolean, screenShake:boolean}
//   handlers = {onResume(), onQuit(), onChange(settings)}
// 开关与滑块变更即调 onChange（新 settings 对象）；持久化由调用方负责。
export function showPause(rootEl, settings, handlers) {
  const { onResume, onQuit, onChange } = handlers;
  rootEl.innerHTML = `
    <h2>暂停</h2>
    <div class="pause-row">
      <label>音量 <input id="pause-volume" type="range" min="0" max="100"
        value="${Math.round(settings.volume * 100)}"></label>
    </div>
    <div class="pause-row">
      <label><input id="pause-damage" type="checkbox"${settings.damageNumbers ? ' checked' : ''}> 伤害数字</label>
    </div>
    <div class="pause-row">
      <label><input id="pause-shake" type="checkbox"${settings.screenShake ? ' checked' : ''}> 震屏</label>
    </div>
    <div class="pause-buttons">
      <button id="pause-resume">继续</button>
      <button id="pause-quit">回主菜单</button>
    </div>
  `;
  rootEl.classList.remove('hidden');

  rootEl.querySelector('#pause-resume').addEventListener('click', () => {
    rootEl.classList.add('hidden');
    onResume();
  });
  rootEl.querySelector('#pause-quit').addEventListener('click', () => {
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
}
