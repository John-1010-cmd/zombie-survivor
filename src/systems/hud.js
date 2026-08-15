// HUD 渲染（屏幕空间）+ formatTime 纯函数。renderHud 在 DOM 步骤追加。
export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
