// src/config/items.js —— 道具数据表（数字键槽位）。纯逻辑，无 DOM 依赖。
export const ITEMS = {
  medkit: { id: 'medkit', name: '医疗包', key: 1, desc: '立即回复 50% HP' },
  magnet: { id: 'magnet', name: '磁铁', key: 2, desc: '吸附全场银币' },
  bomb: { id: 'bomb', name: '炸弹', key: 3, desc: '半径 350 爆炸，伤害 250' },
  turret: { id: 'turret', name: '固定火炮', key: 4, desc: '部署自动炮台（耐久200）' },
  wall: { id: 'wall', name: '围墙', key: 5, desc: '环形8段墙（每段耐久150）' },
};

// 道具槽位顺序（按 key 升序）
export const ITEM_IDS = ['medkit', 'magnet', 'bomb', 'turret', 'wall'];
