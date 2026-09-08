const DEFAULT_PALETTE = {
  bg: '#0e141d',
  panel: 'rgba(14,20,29,.92)',
  neon: '#45c8e0',
  neonDim: '#223846',
  gold: '#ffd75e',
  text: '#e8f0f8',
  textDim: '#9aaec0',
  ground: '#151d28',
  obstacle: '#3b4654',
  hudPanel: '#101923',
  boundary: '#223846',
};
const PALETTE_KEYS = [
  'bg', 'panel', 'neon', 'neonDim', 'gold', 'text', 'textDim',
  'ground', 'obstacle', 'hudPanel', 'boundary',
];

export const PALETTE = Object.assign({}, DEFAULT_PALETTE);
const listeners = new Set();

function readToken(styles, name, fallback) {
  const value = styles.getPropertyValue(name);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function applyPalette(next) {
  const changed = PALETTE_KEYS.some(key => PALETTE[key] !== next[key]);
  if (!changed) return;
  Object.assign(PALETTE, next);
  const snapshot = Object.assign({}, PALETTE);
  for (const listener of listeners) listener(snapshot);
}

export function onPaletteChange(listener) {
  if (typeof listener !== 'function') throw new TypeError('listener 必须是函数');
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initPalette() {
  const doc = globalThis.document;
  const getStyles = globalThis.getComputedStyle || globalThis.window?.getComputedStyle;
  if (!doc?.documentElement || typeof getStyles !== 'function') {
    applyPalette(DEFAULT_PALETTE);
    return PALETTE;
  }

  const styles = getStyles.call(globalThis.window || globalThis, doc.documentElement);
  const next = {
    bg: readToken(styles, '--bg', DEFAULT_PALETTE.bg),
    panel: readToken(styles, '--panel', DEFAULT_PALETTE.panel),
    neon: readToken(styles, '--neon', DEFAULT_PALETTE.neon),
    neonDim: readToken(styles, '--neon-dim', DEFAULT_PALETTE.neonDim),
    gold: readToken(styles, '--gold', DEFAULT_PALETTE.gold),
    text: readToken(styles, '--text', DEFAULT_PALETTE.text),
    textDim: readToken(styles, '--text-dim', DEFAULT_PALETTE.textDim),
    ground: readToken(styles, '--canvas-ground', DEFAULT_PALETTE.ground),
    obstacle: readToken(styles, '--canvas-obstacle', DEFAULT_PALETTE.obstacle),
    hudPanel: readToken(styles, '--canvas-hud-panel', DEFAULT_PALETTE.hudPanel),
    boundary: readToken(
      styles,
      '--canvas-boundary',
      readToken(styles, '--neon-dim', DEFAULT_PALETTE.boundary),
    ),
  };
  applyPalette(next);
  return PALETTE;
}
