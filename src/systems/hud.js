// HUD 渲染（屏幕空间）+ formatTime 纯函数。renderHud 在 DOM 步骤追加。
import { xpNeed } from './progression.js';
import { getTier } from '../config/difficulty.js';
import { WEAPONS, ENHANCE_STATS, STAT_LABEL } from '../config/weapons.js';

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function renderHud(ctx, game) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const barW = 220, barH = 16, mx = 16, my = 16;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  // 左上：血条（底 #533、条 #4d4，标注 hp/maxHp 数字）
  ctx.fillStyle = '#533';
  ctx.fillRect(mx, my, barW, barH);
  const hpFrac = Math.max(0, Math.min(1, game.player.hp / game.player.maxHp));
  ctx.fillStyle = '#4d4';
  ctx.fillRect(mx, my, barW * hpFrac, barH);
  ctx.fillStyle = '#fff';
  ctx.fillText(game.player.hp + '/' + game.player.maxHp, mx + barW / 2, my + 13);
  // 血条下方：经验条（底 #334、条 #5ef，填充比例 = xp/xpNeed(level)，标注 Lv）
  const ey = my + barH + 8;
  ctx.fillStyle = '#334';
  ctx.fillRect(mx, ey, barW, barH);
  const need = xpNeed(game.player.level);
  const xpFrac = Math.max(0, Math.min(1, game.player.xp / need));
  ctx.fillStyle = '#5ef';
  ctx.fillRect(mx, ey, barW * xpFrac, barH);
  ctx.fillStyle = '#fff';
  ctx.fillText('Lv' + game.player.level, mx + barW / 2, ey + 13);
  // 右上：计时 + 难度档 + 击杀数
  ctx.textAlign = 'right';
  ctx.fillText(formatTime(game.time) + ' · 难度档 ' + getTier(game.time), W - 16, 24);
  ctx.fillText('击杀 ' + game.kills, W - 16, 44);
  // 左下：武器名 + Lv + enhance 各维次数
  ctx.textAlign = 'left';
  ctx.fillText(WEAPONS[game.weapon.id].name + ' · Lv' + game.weapon.level, mx, H - 8);
  ctx.fillText(ENHANCE_STATS.map(s => STAT_LABEL[s] + '×' + game.weapon.enhance[s]).join('  '), mx, H - 24);
}
