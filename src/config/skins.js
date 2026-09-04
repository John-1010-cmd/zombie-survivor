// src/config/skins.js —— 主角皮肤注册表（设计 §6.2）。
export const SKINS = {
  wastelandAdventurer: {
    id: 'wastelandAdventurer',
    name: '荒野冒险家',
    portrait: 'skin.wastelandAdventurer.portrait',
    sprite: 'skin.wastelandAdventurer.sprite',
    frameSize: 128,
    directions: ['down', 'left', 'right', 'up'],
    framesPerDirection: 2,
    price: { currency: 'gold', amount: 0 },
    description: '在废土中寻找补给与出路的可靠冒险家。',
  },
  neonMercenary: {
    id: 'neonMercenary',
    name: '霓虹雇佣兵',
    portrait: 'skin.neonMercenary.portrait',
    sprite: 'skin.neonMercenary.sprite',
    frameSize: 128,
    directions: ['down', 'left', 'right', 'up'],
    framesPerDirection: 2,
    price: { currency: 'gold', amount: 800 }, // 平衡可调
    description: '在霓虹废墟中执行高风险护送任务的雇佣兵。',
  },
  nightHunter: {
    id: 'nightHunter',
    name: '暗夜猎手',
    portrait: 'skin.nightHunter.portrait',
    sprite: 'skin.nightHunter.sprite',
    frameSize: 128,
    directions: ['down', 'left', 'right', 'up'],
    framesPerDirection: 2,
    price: { currency: 'gold', amount: 1500 }, // 平衡可调
    description: '潜伏在夜色与废墟边缘的冷静猎手。',
  },
};
