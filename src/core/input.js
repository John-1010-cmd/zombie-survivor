const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};
export function createInput() {
  const state = { up: false, down: false, left: false, right: false };
  const onDown = e => { const k = KEYMAP[e.code]; if (k) { state[k] = true; e.preventDefault(); } };
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
