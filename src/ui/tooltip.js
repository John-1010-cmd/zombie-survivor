// src/ui/tooltip.js —— DOM 覆盖层 tooltip；位置计算保持纯函数可单测。
const VIEWPORT_GAP = 8;

export function parseTooltipAttribute(text = '') {
  const str = String(text ?? '').trim();
  if (!str) return { name: '', description: '', value: '' };
  const colonIdx = str.search(/[:：]/);
  if (colonIdx > 0) {
    return {
      name: str.slice(0, colonIdx).trim(),
      description: str.slice(colonIdx + 1).trim(),
      value: '',
    };
  }
  return {
    name: str,
    description: '',
    value: '',
  };
}

export function normalizeTooltipData(data = {}) {
  if (typeof data === 'string') {
    return parseTooltipAttribute(data);
  }
  if (data && !data.name && !data.description && !data.value && data.tooltip) {
    return parseTooltipAttribute(data.tooltip);
  }
  return {
    name: String(data?.name ?? ''),
    description: String(data?.description ?? ''),
    value: String(data?.value ?? ''),
  };
}

export function extractTooltipData(target) {
  if (!target) return { name: '', description: '', value: '' };
  const dataset = target.dataset || {};
  if (dataset.tooltipName !== undefined || dataset.tooltipDescription !== undefined || dataset.tooltipValue !== undefined) {
    return {
      name: dataset.tooltipName ?? '',
      description: dataset.tooltipDescription ?? '',
      value: dataset.tooltipValue ?? '',
    };
  }
  if (dataset.tooltip !== undefined) {
    return parseTooltipAttribute(dataset.tooltip);
  }
  const rawAttr = target.getAttribute?.('data-tooltip');
  if (rawAttr !== null && rawAttr !== undefined) {
    return parseTooltipAttribute(rawAttr);
  }
  return { name: '', description: '', value: '' };
}

export function positionTooltip(anchorRect, tooltipRect, viewport) {
  const width = Math.max(1, Number(viewport.width) || 1);
  const height = Math.max(1, Number(viewport.height) || 1);
  const maxLeft = Math.max(VIEWPORT_GAP, width - tooltipRect.width - VIEWPORT_GAP);
  const maxTop = Math.max(VIEWPORT_GAP, height - tooltipRect.height - VIEWPORT_GAP);
  const left = Math.min(
    maxLeft,
    Math.max(VIEWPORT_GAP, anchorRect.left + (anchorRect.width - tooltipRect.width) / 2),
  );
  let top = anchorRect.top - tooltipRect.height - VIEWPORT_GAP;
  if (top < VIEWPORT_GAP) top = anchorRect.bottom + VIEWPORT_GAP;
  return {
    left,
    top: Math.min(maxTop, Math.max(VIEWPORT_GAP, top)),
  };
}

function noOpTooltip() {
  return { element: null, show() {}, hide() {}, destroy() {} };
}

export function createTooltip(root = null) {
  const doc = root?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const parent = root || doc?.body;
  if (!doc?.createElement || !parent) return noOpTooltip();

  const element = doc.createElement('div');
  element.className = 'ui-tooltip';
  element.setAttribute('role', 'tooltip');
  element.hidden = true;
  const name = doc.createElement('strong');
  const description = doc.createElement('span');
  const value = doc.createElement('span');
  value.className = 'ui-tooltip-value';
  element.appendChild(name);
  element.appendChild(description);
  element.appendChild(value);
  parent.appendChild(element);

  const show = (anchor, rawData) => {
    const data = normalizeTooltipData(rawData);
    name.textContent = data.name;
    description.textContent = data.description;
    value.textContent = data.value;
    value.hidden = !data.value;
    element.hidden = false;
    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = element.getBoundingClientRect();
    const viewport = {
      width: Number(globalThis.innerWidth) || doc.documentElement?.clientWidth || 1,
      height: Number(globalThis.innerHeight) || doc.documentElement?.clientHeight || 1,
    };
    const p = positionTooltip(anchorRect, tooltipRect, viewport);
    element.style.left = `${p.left}px`;
    element.style.top = `${p.top}px`;
  };
  const hide = () => { element.hidden = true; };
  const destroy = () => {
    if (element.parentNode?.removeChild) element.parentNode.removeChild(element);
    else element.remove?.();
  };
  return { element, show, hide, destroy };
}

export function bindTooltip(target, tooltip, data) {
  target.__tooltipCleanup?.();
  const show = () => tooltip.show(target, data ?? extractTooltipData(target));
  const hide = () => tooltip.hide();
  target.addEventListener('mouseenter', show);
  target.addEventListener('focus', show);
  target.addEventListener('mouseleave', hide);
  target.addEventListener('blur', hide);
  target.__tooltipCleanup = () => {
    target.removeEventListener('mouseenter', show);
    target.removeEventListener('focus', show);
    target.removeEventListener('mouseleave', hide);
    target.removeEventListener('blur', hide);
    target.__tooltipCleanup = null;
  };
  return target;
}

export function attachTooltips(root) {
  if (!root) return noOpTooltip();
  root.__tooltipController?.destroy?.();
  const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const tooltip = createTooltip(doc?.body || root);
  const targets = [];
  const seen = new Set();
  const collect = selector => {
    try {
      const list = root.querySelectorAll?.(selector) || [];
      for (const target of list) {
        if (!seen.has(target)) {
          seen.add(target);
          targets.push(target);
        }
      }
    } catch {}
  };
  collect('[data-tooltip-name]');
  collect('[data-tooltip]');
  for (const target of targets) {
    bindTooltip(target, tooltip, extractTooltipData(target));
  }
  const originalDestroy = tooltip.destroy;
  tooltip.destroy = () => {
    for (const target of targets) {
      target.__tooltipCleanup?.();
    }
    originalDestroy();
  };
  root.__tooltipController = tooltip;
  return tooltip;
}
