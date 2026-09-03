// src/config/items.js —— 道具数据表（数字键槽位）。纯逻辑，无 DOM 依赖。
export const ITEMS = {
  medkit: { id: 'medkit', name: '医疗包', key: 1, desc: '立即回复 50% HP', visual: { icon: 'icon.item.medkit' } },
  magnet: { id: 'magnet', name: '磁铁', key: 2, desc: '吸附全场银币', visual: { icon: 'icon.item.magnet' } },
  bomb: { id: 'bomb', name: '炸弹', key: 3, desc: '半径 350 爆炸，伤害 250', visual: { icon: 'icon.item.bomb' } },
  turret: { id: 'turret', name: '固定火炮', key: 4, desc: '部署自动炮台（耐久200）', visual: { icon: 'icon.item.turret' } },
  wall: { id: 'wall', name: '围墙', key: 5, desc: '环形8段墙（每段耐久150）', visual: { icon: 'icon.item.wall' } },
};

// 道具槽位顺序（按 key 升序）
export const ITEM_IDS = ['medkit', 'magnet', 'bomb', 'turret', 'wall'];
