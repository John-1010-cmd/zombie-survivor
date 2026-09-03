// src/ui/tooltip.js —— DOM 覆盖层 tooltip；位置计算保持纯函数可单测。
const VIEWPORT_GAP = 8;

export function normalizeTooltipData(data = {}) {
  return {
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    value: String(data.value ?? ''),
  };
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
  const show = () => tooltip.show(target, data ?? {
    name: target.dataset.tooltipName,
    description: target.dataset.tooltipDescription,
    value: target.dataset.tooltipValue,
  });
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
  const targets = root.querySelectorAll?.('[data-tooltip-name]') || [];
  for (const target of targets) {
    bindTooltip(target, tooltip, {
      name: target.dataset.tooltipName,
      description: target.dataset.tooltipDescription,
      value: target.dataset.tooltipValue,
    });
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
