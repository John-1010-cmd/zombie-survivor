// src/systems/hud.js —— HUD 渲染（屏幕空间）+ formatTime 纯函数。
// renderHud 为 DOM（canvas）函数，不单测；formatTime 可单测。
import { WEAPONS, ENHANCE_STATS, STAT_LABEL } from '../config/bestiary/weapons.js';
import { ITEMS, ITEM_IDS } from '../config/items.js';
import { AUX_CONFIG } from '../entities/companions.js';
import { ADVENTURE_TIER_DURATION, ADVENTURE_LEVELS } from '../config/adventure.js';

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// 冒险四档进度（设计 §8 HUD）：tier 1–N、档内进度 0–1；纯函数可单测。
// 档数取自关卡表（当前均 4 档），档时长取 ADVENTURE_TIER_DURATION，消除硬编码 90/4。
const ADVENTURE_TIER_COUNT = Math.max(...ADVENTURE_LEVELS.map(l => l.tiers.length));
export function adventureTierProgress(timeSec) {
  const tier = Math.min(ADVENTURE_TIER_COUNT, Math.floor(timeSec / ADVENTURE_TIER_DURATION) + 1);
  const progress = Math.min(1, Math.max(0, (timeSec - (tier - 1) * ADVENTURE_TIER_DURATION) / ADVENTURE_TIER_DURATION));
  return { tier, progress };
}

// game = { player:{hp,maxHp}, coins, time, mode, kills, weapon:{id,level}, inventory, duration? }
// 布局：左上血条+数值、其下银币数；右上计时（endless 正计时 / holdout 倒计时，
// 剩 60s 变红）、击杀数；左下道具栏（三槽：按键+名称+数量）、武器名+Lv。
export function renderHud(ctx, game) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const barW = 220, barH = 16, mx = 16, my = 16;
  ctx.font = '12px sans-serif';

  // 左上：血条（底 #533、条 #4d4，标注 hp/maxHp 数字）
  ctx.fillStyle = '#533';
  ctx.fillRect(mx, my, barW, barH);
  const hpFrac = Math.max(0, Math.min(1, game.player.hp / game.player.maxHp));
  ctx.fillStyle = '#4d4';
  ctx.fillRect(mx, my, barW * hpFrac, barH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(game.player.hp + '/' + game.player.maxHp, mx + barW / 2, my + 13);

  // 血条下方：银币数
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd75e';
  ctx.fillText('银币 ' + game.coins, mx, my + barH + 20);

  // 右上：计时（无尽/冒险正计时 / 坚守倒计时，剩 60s 变红）+ 击杀数
  ctx.textAlign = 'right';
  let timeColor = '#fff';
  let timeText;
  if (game.mode === 'endless' || game.mode === 'adventure') {
    // 正计时：无尽与冒险都显示 game.time，不变红
    timeText = formatTime(game.time);
  } else {
    // 原倒计时逻辑：坚守（holdout10/20）剩 60s 变红
    const remain = Math.max(0, (game.duration || 0) - game.time);
    timeText = formatTime(remain);
    if (remain <= 60) timeColor = '#f55';
  }
  ctx.fillStyle = timeColor;
  ctx.fillText(timeText, W - 16, 24);
  ctx.fillStyle = '#fff';
  ctx.fillText('击杀 ' + game.kills, W - 16, 44);

  // 冒险：顶部居中四档进度条（当前档高亮 + 档内填充）
  if (game.mode === 'adventure') {
    const { tier, progress } = adventureTierProgress(game.time);
    const segW = 90, segH = 8, gap = 6, totalW = segW * 4 + gap * 3;
    const x0 = (W - totalW) / 2, y0 = 12;
    for (let i = 1; i <= 4; i++) {
      const x = x0 + (i - 1) * (segW + gap);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fillRect(x, y0, segW, segH);
      if (i < tier) { ctx.fillStyle = '#5eff8a'; ctx.fillRect(x, y0, segW, segH); }
      else if (i === tier) {
        ctx.fillStyle = '#5eff8a';
        ctx.fillRect(x, y0, segW * progress, segH);
        ctx.strokeStyle = '#5eff8a'; ctx.strokeRect(x + 0.5, y0 + 0.5, segW - 1, segH - 1);
      }
    }
  }

  // 左下：道具栏（三槽：按键标注 + 名称 + 数量）
  ctx.textAlign = 'left';
  const slotW = 96, slotH = 22, gap = 6;
  const sy = H - 48;
  let sx = mx;
  for (const id of ITEM_IDS) {
    const it = ITEMS[id];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(sx, sy, slotW, slotH);
    ctx.strokeStyle = '#888';
    ctx.strokeRect(sx + 0.5, sy + 0.5, slotW - 1, slotH - 1);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(it.key + ' ' + it.name + '×' + (game.inventory[id] || 0), sx + 6, sy + 15);
    sx += slotW + gap;
  }

  // 道具栏下方：武器名 + 分维等级（迭代 03：level 字段已删除）+ 辅助数量
  ctx.fillStyle = '#fff';
  const dims = ENHANCE_STATS.map(s => `${STAT_LABEL[s].split(' ')[0]}${game.weapon.enhance[s]}`).join(' ');
  let info = WEAPONS[game.weapon.id].name + ' · ' + dims;
  const aux = game.aux;
  if (aux && Object.values(aux.counts).some(n => n > 0)) {
    info += ' · 辅助 ' + Object.entries(aux.counts).filter(([, n]) => n > 0)
      .map(([k, n]) => `${AUX_CONFIG[k].name}×${n}`).join(' ');
  }
  ctx.fillText(info, mx, H - 8);
}
