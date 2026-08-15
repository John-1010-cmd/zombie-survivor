// 升级四选一覆盖层。cardLabel 为纯函数（可单测）；showLevelUp 为 DOM 组装，在 DOM 步骤追加。
import { WEAPONS, STAT_LABEL } from '../config/weapons.js';

export function cardLabel(card) {
  if (card.type === 'enhance') return { title: '武器强化', desc: STAT_LABEL[card.stat] };
  if (card.type === 'swap') return { title: '更换武器', desc: WEAPONS[card.weapon].name + '（从 Lv1 开始）' };
  return { title: '急救包', desc: '立即回复 50% HP' };
}
