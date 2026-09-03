// src/ui/icon.js —— UI 卡片图标节点工厂。
import { getVisualCanvas } from '../core/visuals.js';

export function createIconCanvas(id, size = 48) {
  const source = getVisualCanvas(id, size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'ui-icon';
  canvas.dataset.visualId = id;
  canvas.setAttribute('aria-hidden', 'true');
  const target = canvas.getContext?.('2d');
  if (target && source) target.drawImage(source, 0, 0, size, size);
  return canvas;
}
