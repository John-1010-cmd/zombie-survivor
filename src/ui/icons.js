// src/ui/icons.js —— DOM 图标标签与图片失败回退。
import { ASSET_BY_ID } from '../config/assets.js';
import { getVisualCanvas } from '../core/visuals.js';

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
}

export function createIconMarkup(id, label, size = 32) {
  const safeId = escapeAttr(id);
  const safeLabel = escapeAttr(label);
  const safeSize = Math.max(1, Math.round(Number(size) || 32));
  const asset = ASSET_BY_ID[id];
  if (!asset) {
    return `<span class="ui-icon ui-icon-fallback" data-visual-id="${safeId}" data-icon-size="${safeSize}" role="img" aria-label="${safeLabel}"></span>`;
  }
  return `<img class="ui-icon" data-visual-id="${safeId}" data-icon-size="${safeSize}" src="${escapeAttr(asset.path)}" width="${safeSize}" height="${safeSize}" alt="${safeLabel}" loading="eager">`;
}

function replaceWithFallback(node) {
  const id = node.dataset.visualId;
  const size = Math.max(1, Math.round(Number(node.dataset.iconSize || node.getAttribute('width') || 32)));
  const canvas = getVisualCanvas(id, size);
  if (!canvas || typeof node.replaceWith !== 'function') return;
  canvas.className = 'ui-icon';
  canvas.dataset.visualId = id;
  canvas.dataset.iconSize = String(size);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', node.getAttribute('aria-label') || node.alt || id);
  node.replaceWith(canvas);
}

export function bindIconFallback(rootEl) {
  for (const node of rootEl.querySelectorAll('[data-visual-id]')) {
    if (node.tagName === 'IMG') {
      node.addEventListener('error', () => replaceWithFallback(node), { once: true });
    } else if (node.classList?.contains('ui-icon-fallback')) {
      replaceWithFallback(node);
    }
  }
}
