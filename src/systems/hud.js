// src/systems/hud.js —— HUD 渲染（逻辑 CSS 视口）+ formatTime 纯函数。
import { WEAPONS, ENHANCE_STATS, STAT_LABEL } from '../config/bestiary/weapons.js';
import { ITEMS, ITEM_IDS } from '../config/items.js';
import { AUX_CONFIG } from '../entities/companions.js';
import { ADVENTURE_TIER_DURATION, ADVENTURE_LEVELS } from '../config/adventure.js';
import { PALETTE } from '../config/palette.js';

const HUD_MARGIN = 16;
const HP_BAR_WIDTH = 220;
const HP_BAR_HEIGHT = 16;
const SLOT_GAP = 6;
const SLOT_HEIGHT = 22;

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

function fillRectWithAlpha(ctx, color, alpha, x, y, width, height) {
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = previousAlpha;
}

export function renderHud(ctx, game, viewport) {
  const W = viewport.width;
  const H = viewport.height;
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
  ctx.fillText(game.player.hp + '/' + game.player.maxHp, topX + barW / 2, topY + 13);

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
  ctx.fillText(timeText, W - HUD_MARGIN, topY + 8);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('击杀 ' + game.kills, W - HUD_MARGIN, topY + 28);

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

  ctx.textAlign = 'left';
  const slotWidth = Math.min(96, Math.max(32, (W - HUD_MARGIN * 2 - SLOT_GAP * 4) / ITEM_IDS.length));
  const infoY = H - HUD_MARGIN;
  const slotY = infoY - 30;
  let slotX = HUD_MARGIN;
  for (const id of ITEM_IDS) {
    const item = ITEMS[id];
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(slotX, slotY, slotWidth, SLOT_HEIGHT);
    ctx.strokeStyle = PALETTE.neonDim;
    ctx.strokeRect(slotX, slotY, slotWidth, SLOT_HEIGHT);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(item.key + ' ' + item.name + '×' + (game.inventory[id] || 0), slotX + 6, slotY + 15);
    slotX += slotWidth + SLOT_GAP;
  }

  ctx.fillStyle = PALETTE.text;
  const dims = ENHANCE_STATS.map(s => `${STAT_LABEL[s].split(' ')[0]}${game.weapon.enhance[s]}`).join(' ');
  let info = WEAPONS[game.weapon.id].name + ' · ' + dims;
  const aux = game.aux;
  if (aux && Object.values(aux.counts).some(n => n > 0)) {
    info += ' · 辅助 ' + Object.entries(aux.counts).filter(([, n]) => n > 0)
      .map(([k, n]) => `${AUX_CONFIG[k].name}×${n}`).join(' ');
  }
  ctx.fillText(info, HUD_MARGIN, infoY);

  if (game.interactionPrompt) {
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(game.interactionPrompt, W - HUD_MARGIN, H - HUD_MARGIN);
  }
  ctx.textAlign = 'left';
}
