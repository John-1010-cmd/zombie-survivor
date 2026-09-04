// src/systems/hud.js —— HUD 渲染（逻辑 CSS 视口）+ formatTime 纯函数。
import { WEAPONS, ENHANCE_STATS, STAT_LABEL } from '../config/bestiary/weapons.js';
import { ITEMS, ITEM_IDS } from '../config/items.js';
import { AUX_CONFIG } from '../entities/companions.js';
import { ADVENTURE_TIER_DURATION, ADVENTURE_LEVELS } from '../config/adventure.js';
import { PALETTE } from '../config/palette.js';
import { getVisualCanvas } from '../core/visuals.js';
import { attachTooltips } from '../ui/tooltip.js';

const HUD_MARGIN = 16;
const HP_BAR_WIDTH = 220;
const HP_BAR_HEIGHT = 16;
const ITEM_SLOT_WIDTH = 72;
const ITEM_SLOT_HEIGHT = 48;
const ITEM_GAP = 8;
const ITEM_BOTTOM = 32;
const ITEM_ICON_SIZE = 32;

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

const ADVENTURE_TIER_COUNT = Math.max(...ADVENTURE_LEVELS.map(l => l.tiers.length));
export function adventureTierProgress(timeSec) {
  const tier = Math.min(ADVENTURE_TIER_COUNT, Math.floor(timeSec / ADVENTURE_TIER_DURATION) + 1);
  const progress = Math.min(1, Math.max(0, (timeSec - (tier - 1) * ADVENTURE_TIER_DURATION) / ADVENTURE_TIER_DURATION));
  return { tier, progress };
}

export function hudLayout(viewport = {}) {
  const width = Math.max(1, Number(viewport.width) || 1);
  const height = Math.max(1, Number(viewport.height) || 1);
  const itemSlots = ITEM_IDS.map((id, index) => {
    const x = HUD_MARGIN + index * (ITEM_SLOT_WIDTH + ITEM_GAP);
    const y = height - ITEM_BOTTOM - ITEM_SLOT_HEIGHT;
    return {
      id, x, y, width: ITEM_SLOT_WIDTH, height: ITEM_SLOT_HEIGHT,
      iconX: x + 8, iconY: y + 8,
    };
  });
  return {
    width, height, leftX: HUD_MARGIN, rightX: width - HUD_MARGIN,
    itemSlots, weaponY: height - 8,
  };
}

export function itemSlotView(id, inventory = {}) {
  const item = ITEMS[id];
  const count = inventory[id] || 0;
  return {
    id, key: item.key, name: item.name, desc: item.desc,
    icon: item.visual.icon, count, empty: count === 0,
  };
}

export function hudTooltipView(slot) {
  return {
    name: slot.name,
    description: slot.desc,
    value: `数量 ${slot.count} · 数字键 ${slot.key}`,
  };
}

function syncHudTooltips(game, layout, slots) {
  if (typeof document === 'undefined') return;
  const overlay = document.getElementById('ui-overlay');
  if (!overlay) return;
  let root = overlay.querySelector('#hud-tooltip-targets');
  if (!root) {
    root = document.createElement('div');
    root.id = 'hud-tooltip-targets';
    root.className = 'hud-tooltip-targets';
    overlay.appendChild(root);
  }
  const itemSlots = slots || ITEM_IDS.map(id => itemSlotView(id, game.inventory));
  let signature = `${layout.width}x${layout.height}`;
  for (let i = 0; i < itemSlots.length; i++) {
    signature += `|${itemSlots[i].id}:${itemSlots[i].count}`;
  }
  if (root.dataset.tooltipSignature === signature) return;
  root.dataset.tooltipSignature = signature;

  for (let i = 0; i < itemSlots.length; i++) {
    const target = root.children[i] || document.createElement('button');
    if (!target.parentNode) root.appendChild(target);
    const slot = layout.itemSlots[i];
    const view = itemSlots[i];
    target.type = 'button';
    target.className = 'hud-tooltip-anchor';
    target.tabIndex = 0;
    target.setAttribute('aria-label', view.name);
    target.dataset.tooltipName = view.name;
    target.dataset.tooltipDescription = view.desc;
    target.dataset.tooltipValue = hudTooltipView(view).value;
    target.style.left = `${slot.x}px`;
    target.style.top = `${slot.y}px`;
    target.style.width = `${slot.width}px`;
    target.style.height = `${slot.height}px`;
    target.hidden = false;
  }
  for (let i = itemSlots.length; i < root.children.length; i++) root.children[i].hidden = true;
  attachTooltips(root);
}

function fillRectWithAlpha(ctx, color, alpha, x, y, width, height) {
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = previousAlpha;
}

export function renderHud(ctx, game, viewport) {
  const layout = hudLayout(viewport);
  const W = layout.width;
  const H = layout.height;
  const barW = Math.min(HP_BAR_WIDTH, Math.max(80, W - HUD_MARGIN * 2));
  const barH = HP_BAR_HEIGHT;
  const topX = HUD_MARGIN;
  const topY = HUD_MARGIN;
  ctx.font = '12px sans-serif';

  ctx.fillStyle = PALETTE.hudPanel;
  ctx.fillRect(topX, topY, barW, barH);
  const hpFrac = Math.max(0, Math.min(1, game.player.hp / game.player.maxHp));
  ctx.fillStyle = PALETTE.neon;
  ctx.fillRect(topX, topY, barW * hpFrac, barH);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(Math.max(0, Math.ceil(game.player.hp)) + '/' + game.player.maxHp, topX + barW / 2, topY + 13);

  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText('银币 ' + game.coins, topX, topY + barH + 20);

  ctx.textAlign = 'right';
  let timeColor = PALETTE.text;
  let timeText;
  if (game.mode === 'endless' || game.mode === 'adventure') {
    timeText = formatTime(game.time);
  } else {
    const remain = Math.max(0, (game.duration || 0) - game.time);
    timeText = formatTime(remain);
    if (remain <= 60) timeColor = PALETTE.gold;
  }
  ctx.fillStyle = timeColor;
  ctx.fillText(timeText, layout.rightX, topY + 8);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('击杀 ' + game.kills, layout.rightX, topY + 28);

  if (game.mode === 'adventure') {
    const progressState = adventureTierProgress(game.time);
    const segmentGap = 6;
    const segmentWidth = Math.min(90, Math.max(32, (W - HUD_MARGIN * 2 - segmentGap * 3) / 4));
    const segmentHeight = 8;
    const totalWidth = segmentWidth * 4 + segmentGap * 3;
    const x0 = (W - totalWidth) / 2;
    const y0 = W >= 520 ? HUD_MARGIN : HUD_MARGIN + 48;
    for (let i = 1; i <= 4; i++) {
      const x = x0 + (i - 1) * (segmentWidth + segmentGap);
      fillRectWithAlpha(ctx, PALETTE.neonDim, 0.35, x, y0, segmentWidth, segmentHeight);
      if (i < progressState.tier) {
        ctx.fillStyle = PALETTE.neon;
        ctx.fillRect(x, y0, segmentWidth, segmentHeight);
      } else if (i === progressState.tier) {
        ctx.fillStyle = PALETTE.neon;
        ctx.fillRect(x, y0, segmentWidth * progressState.progress, segmentHeight);
        ctx.strokeStyle = PALETTE.neon;
        ctx.strokeRect(x + 0.5, y0 + 0.5, segmentWidth - 1, segmentHeight - 1);
      }
    }
  }

  // 左下：5 个道具槽；非空槽从 id+size 离屏缓存贴图，空槽只画低对比锁定框。
  ctx.textAlign = 'left';
  const slots = ITEM_IDS.map(id => itemSlotView(id, game.inventory));
  for (let i = 0; i < slots.length; i++) {
    const view = slots[i];
    const slot = layout.itemSlots[i];
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
    ctx.strokeStyle = PALETTE.neonDim;
    ctx.strokeRect(slot.x + 0.5, slot.y + 0.5, slot.width - 1, slot.height - 1);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(String(view.key), slot.x + 6, slot.y + 14);
    if (view.empty) {
      ctx.beginPath();
      ctx.arc(slot.x + slot.width / 2, slot.y + 19, 7, Math.PI, 0);
      ctx.strokeStyle = PALETTE.neonDim;
      ctx.stroke();
      ctx.strokeRect(slot.x + slot.width / 2 - 9, slot.y + 19, 18, 14);
    } else {
      ctx.drawImage(getVisualCanvas(view.icon, ITEM_ICON_SIZE), slot.iconX, slot.iconY, ITEM_ICON_SIZE, ITEM_ICON_SIZE);
      ctx.fillStyle = PALETTE.neonDim;
      ctx.fillRect(slot.x + slot.width - 24, slot.y + slot.height - 20, 18, 16);
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(String(view.count), slot.x + slot.width - 14, slot.y + slot.height - 8);
    }
  }

  // 底部当前武器信息仍使用逻辑 CSS viewport，不使用物理 canvas 尺寸。
  ctx.fillStyle = PALETTE.text;
  const dims = ENHANCE_STATS.map(s => `${STAT_LABEL[s].split(' ')[0]}${game.weapon.enhance[s]}`).join(' ');
  let info = WEAPONS[game.weapon.id].name + ' · ' + dims;
  const aux = game.aux;
  if (aux && Object.values(aux.counts).some(n => n > 0)) {
    info += ' · 辅助 ' + Object.entries(aux.counts).filter(([, n]) => n > 0)
      .map(([k, n]) => `${AUX_CONFIG[k].name}×${n}`).join(' ');
  }
  ctx.fillText(info, layout.leftX, layout.weaponY);
  syncHudTooltips(game, layout, slots);

  if (game.interactionPrompt) {
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(game.interactionPrompt, layout.rightX, layout.weaponY);
  }
  ctx.textAlign = 'left';
}
