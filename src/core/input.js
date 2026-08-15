// src/core/input.js —— 键盘输入（DOM 层，不单测）。
// createInput(opts) 向后兼容无参调用；移动键维持 state；
// Digit1..Digit9 触发 opts.onItem(n)；Escape 触发 opts.onEsc()；
// Backquote（`）触发 opts.onDev()（开发者菜单开关，不 preventDefault）。
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};

export function createInput(opts = {}) {
  const { onItem, onEsc, onDev } = opts;
  const state = { up: false, down: false, left: false, right: false };
  const onDown = e => {
    const k = KEYMAP[e.code];
    if (k) {
      state[k] = true;
      e.preventDefault();
      return;
    }
    if (e.repeat) return; // 长按防抖：道具/暂停只响应首次按下
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 9 && onItem) onItem(n);
      return;
    }
    if (e.code === 'Escape' && onEsc) onEsc();
    if (e.code === 'Backquote' && onDev) onDev();
  };
  const onUp = e => { const k = KEYMAP[e.code]; if (k) state[k] = false; };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  return {
    state,
    destroy() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    },
  };
}
