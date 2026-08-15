// src/systems/hud.js —— HUD 渲染（屏幕空间）+ formatTime 纯函数。
// renderHud 为 DOM（canvas）函数，不单测；formatTime 可单测。
import { WEAPONS } from '../config/weapons.js';
import { ITEMS, ITEM_IDS } from '../config/items.js';

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
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

  // 右上：计时（无尽正计时 / 坚守倒计时，剩 60s 变红）+ 击杀数
  ctx.textAlign = 'right';
  let timeColor = '#fff';
  let timeText;
  if (game.mode === 'endless') {
    timeText = formatTime(game.time);
  } else {
    const remain = Math.max(0, (game.duration || 0) - game.time);
    timeText = formatTime(remain);
    if (remain <= 60) timeColor = '#f55';
  }
  ctx.fillStyle = timeColor;
  ctx.fillText(timeText, W - 16, 24);
  ctx.fillStyle = '#fff';
  ctx.fillText('击杀 ' + game.kills, W - 16, 44);

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

  // 道具栏下方：武器名 + Lv
  ctx.fillStyle = '#fff';
  ctx.fillText(WEAPONS[game.weapon.id].name + ' · Lv' + game.weapon.level, mx, H - 8);
}
