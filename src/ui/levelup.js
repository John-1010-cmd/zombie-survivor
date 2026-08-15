// 升级四选一覆盖层。cardLabel 为纯函数（可单测）；showLevelUp 为 DOM 组装，在 DOM 步骤追加。
import { WEAPONS, ENHANCE_STATS, STAT_LABEL } from '../config/weapons.js';
import { drawCards, applyCard } from '../systems/progression.js';

export function cardLabel(card) {
  if (card.type === 'enhance') return { title: '武器强化', desc: STAT_LABEL[card.stat] };
  if (card.type === 'swap') return { title: '更换武器', desc: WEAPONS[card.weapon].name + '（从 Lv1 开始）' };
  return { title: '急救包', desc: '立即回复 50% HP' };
}

export function showLevelUp(rootEl, game, onDone) {
  rootEl.classList.remove('hidden');
  function render() {
    rootEl.replaceChildren();
    // build 栏：当前武器名 + Lv + 各维度增强次数
    const build = document.createElement('div');
    build.className = 'build';
    const head = document.createElement('div');
    head.className = 'build-head';
    head.textContent = WEAPONS[game.weapon.id].name + ' · Lv' + game.weapon.level;
    build.appendChild(head);
    for (const stat of ENHANCE_STATS) {
      const line = document.createElement('div');
      line.className = 'build-stat';
      line.textContent = STAT_LABEL[stat] + ' ×' + game.weapon.enhance[stat];
      build.appendChild(line);
    }
    rootEl.appendChild(build);
    // 4 张卡
    const cards = drawCards(game.weapon, game.rng);
    const wrap = document.createElement('div');
    wrap.className = 'cards';
    for (const card of cards) {
      const el = document.createElement('div');
      el.className = 'card';
      const { title, desc } = cardLabel(card); // desc 即目标标注：enhance 标出受强化的 stat，swap 标出目标武器
      const h = document.createElement('h3');
      h.textContent = title;
      const p = document.createElement('p');
      p.textContent = desc;
      el.appendChild(h);
      el.appendChild(p);
      el.addEventListener('click', () => {
        applyCard(game, card);
        game.pendingLevelUps--;
        if (game.pendingLevelUps > 0) {
          render(); // 连升多级：重新抽 4 张
        } else {
          rootEl.classList.add('hidden');
          game.paused = false;
          onDone();
        }
      });
      wrap.appendChild(el);
    }
    rootEl.appendChild(wrap);
  }
  render();
}
