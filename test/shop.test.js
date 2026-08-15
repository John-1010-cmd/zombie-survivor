// test/shop.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogFor, buy } from '../src/systems/shop.js';
import { createWeapon } from '../src/entities/weapon.js';
import { createInventory, itemCount } from '../src/systems/inventory.js';
import {
  enhancePrice, earlyTierBonus, weaponPrice, itemPrice,
  WEAPON_BASE_PRICE, AUX_PRICES, AUX_MAX, DEPLOY_PRICES,
} from '../src/config/economy.js';
import { STAT_MAX, ENHANCE_STATS } from '../src/config/weapons.js';

function makeAux() {
  const dims = () => ({ damage: 0, fireRate: 0, projectiles: 0, range: 0 });
  return {
    counts: { drone: 0, gunner: 0, sniper: 0 },
    enhance: { drone: dims(), gunner: dims(), sniper: dims() },
    bodies: [],
  };
}

function makeGame(coins = 100000, weaponId = 'pistol') {
  return {
    coins, weapon: createWeapon(weaponId), inventory: createInventory(),
    aux: makeAux(),
    turretEnhance: { damage: 0, fireRate: 0, projectiles: 0, range: 0 },
    wallEnhance: { hp: 0 },
    weaponBought: 0,
  };
}

function groupOf(cat, name) {
  const g = cat.find(g => g.group === name);
  assert.ok(g, `缺少分组 ${name}`);
  return g.entries;
}

test('catalogFor 返回六组结构（顺序：武器强化/更换武器/辅助武器/辅助强化/道具/风险）', () => {
  const cat = catalogFor(makeGame(), 150);
  assert.deepEqual(cat.map(g => g.group),
    ['武器强化', '更换武器', '辅助武器', '辅助强化', '道具', '风险']);
});

test('初始目录内容：4 武器强化 + 5 武器（含手枪回购）+ 3 辅助 + 12 辅助强化 + 5 道具 + 5 道具强化 + 1 风险', () => {
  const cat = catalogFor(makeGame(), 150);

  const enh = groupOf(cat, '武器强化');
  assert.equal(enh.length, 4);
  assert.deepEqual(enh.map(e => e.stat), ENHANCE_STATS);
  for (const e of enh) { assert.equal(e.owned, 0); assert.equal(e.price, enhancePrice(0)); }

  const weapons = groupOf(cat, '更换武器');
  assert.deepEqual(weapons.map(e => e.weapon).sort(),
    ['grenade', 'mg', 'rifle', 'rocket', 'tesla']); // 当前手枪排除
  for (const e of weapons) assert.equal(e.price, WEAPON_BASE_PRICE[e.weapon]); // 第 1 把 = 基价

  const aux = groupOf(cat, '辅助武器');
  assert.deepEqual(aux.map(e => e.aux), ['drone', 'gunner', 'sniper']);
  assert.deepEqual(aux.map(e => e.price), [60, 90, 120]);

  const auxEnh = groupOf(cat, '辅助强化');
  assert.equal(auxEnh.length, 3 * 4);
  for (const e of auxEnh) { assert.equal(e.price, enhancePrice(0)); assert.equal(e.owned, 0); }

  const items = groupOf(cat, '道具');
  const itemEntries = items.filter(e => e.kind === 'item');
  assert.deepEqual(itemEntries.map(e => e.item).sort(), ['bomb', 'magnet', 'medkit', 'turret', 'wall']);
  assert.deepEqual(itemEntries.map(e => e.price).sort((a, b) => a - b),
    [25, 30, 50, 100, 120].sort((a, b) => a - b));
  const deployEnh = items.filter(e => e.kind === 'deployEnhance');
  assert.equal(deployEnh.length, 5); // turret 四维 + wall 单维
  assert.deepEqual(deployEnh.filter(e => e.target === 'turret').map(e => e.stat), ENHANCE_STATS);
  assert.deepEqual(deployEnh.filter(e => e.target === 'wall').map(e => e.stat), ['hp']);
  for (const e of deployEnh) { assert.equal(e.price, enhancePrice(0)); assert.equal(e.owned, 0); }

  const risk = groupOf(cat, '风险');
  assert.equal(risk.length, 1);
  assert.equal(risk[0].kind, 'earlyTier');
  assert.equal(risk[0].bonus, earlyTierBonus(150));
});

test('武器强化分维独立计价：各维按各自已购次数', () => {
  const g = makeGame();
  const buyEnh = (stat) => {
    const cat = catalogFor(g, 0);
    const e = groupOf(cat, '武器强化').find(x => x.stat === stat);
    return buy(g, e);
  };
  assert.equal(buyEnh('damage'), true);
  assert.equal(buyEnh('damage'), true);
  assert.equal(buyEnh('range'), true);
  assert.equal(g.weapon.enhance.damage, 2);
  assert.equal(g.weapon.enhance.range, 1);
  const enh = groupOf(catalogFor(g, 0), '武器强化');
  assert.equal(enh.find(e => e.stat === 'damage').owned, 2);
  assert.equal(enh.find(e => e.stat === 'damage').price, enhancePrice(2));
  assert.equal(enh.find(e => e.stat === 'range').owned, 1);
  assert.equal(enh.find(e => e.stat === 'range').price, enhancePrice(1));
  assert.equal(enh.find(e => e.stat === 'fireRate').price, enhancePrice(0), '未购维度价格不变');
});

test('单维满 STAT_MAX 下架该条目，其余维仍在；满维再购被拒', () => {
  const g = makeGame();
  const cat = () => catalogFor(g, 0);
  for (let i = 0; i < STAT_MAX; i++) {
    const e = groupOf(cat(), '武器强化').find(x => x.stat === 'damage');
    assert.equal(buy(g, e), true);
  }
  assert.equal(g.weapon.enhance.damage, STAT_MAX);
  const enh = groupOf(cat(), '武器强化');
  assert.equal(enh.some(e => e.stat === 'damage'), false, '满维条目应下架');
  assert.deepEqual(enh.map(e => e.stat).sort(), ['fireRate', 'projectiles', 'range'].sort());
  // 手动构造满维条目 → buy 拒绝且不扣款
  const coins = g.coins;
  assert.equal(buy(g, { kind: 'enhance', stat: 'damage', price: 1, owned: STAT_MAX }), false);
  assert.equal(g.coins, coins);
});

test('换枪价格递增：weaponBought 计数驱动 1.4^n', () => {
  const g = makeGame(10000);
  const weapons = groupOf(catalogFor(g, 0), '更换武器');
  const rifle = weapons.find(e => e.weapon === 'rifle');
  assert.equal(rifle.price, 80);
  assert.equal(buy(g, rifle), true);
  assert.equal(g.weapon.id, 'rifle');
  assert.equal(g.weaponBought, 1);
  assert.equal(g.coins, 10000 - 80);

  const after = groupOf(catalogFor(g, 0), '更换武器');
  assert.equal(after.some(e => e.weapon === 'rifle'), false, '当前武器不列出');
  const pistol = after.find(e => e.weapon === 'pistol');
  assert.equal(pistol.price, weaponPrice(40, 1)); // 40×1.4 → 55
  const tesla = after.find(e => e.weapon === 'tesla');
  assert.equal(tesla.price, weaponPrice(250, 1)); // 250×1.4 → 350
});

test('buy weapon：换枪后增强清零（新武器实例）', () => {
  const g = makeGame(10000);
  g.weapon.enhance.damage = 3;
  g.weaponBought = 2;
  assert.equal(buy(g, { kind: 'weapon', weapon: 'rocket', price: weaponPrice(150, 2) }), true);
  assert.equal(g.weapon.id, 'rocket');
  assert.equal(g.weapon.enhance.damage, 0);
  assert.equal(g.weaponBought, 3);
});

test('aux 购买：counts+1，达 AUX_MAX 下架并拒买', () => {
  const g = makeGame();
  const auxEntries = () => groupOf(catalogFor(g, 0), '辅助武器');
  for (let i = 0; i < AUX_MAX.drone; i++) {
    const e = auxEntries().find(x => x.aux === 'drone');
    assert.equal(buy(g, e), true);
  }
  assert.equal(g.aux.counts.drone, 3);
  assert.equal(auxEntries().some(e => e.aux === 'drone'), false, '达上限应下架');
  assert.ok(auxEntries().some(e => e.aux === 'gunner'));
  const coins = g.coins;
  assert.equal(buy(g, { kind: 'aux', aux: 'drone', price: 1 }), false);
  assert.equal(g.coins, coins);
  assert.equal(g.aux.counts.drone, 3);
});

test('sniper 上限 2：购 2 把后下架', () => {
  const g = makeGame();
  for (let i = 0; i < AUX_MAX.sniper; i++) {
    assert.equal(buy(g, { kind: 'aux', aux: 'sniper', price: AUX_PRICES.sniper }), true);
  }
  assert.equal(g.aux.counts.sniper, 2);
  assert.equal(groupOf(catalogFor(g, 0), '辅助武器').some(e => e.aux === 'sniper'), false);
});

test('auxEnhance：维度级独立计价，单维满 8 下架该条目', () => {
  const g = makeGame();
  assert.equal(buy(g, { kind: 'auxEnhance', aux: 'drone', stat: 'damage', price: enhancePrice(0) }), true);
  assert.equal(g.aux.enhance.drone.damage, 1);

  let enh = groupOf(catalogFor(g, 0), '辅助强化').filter(e => e.aux === 'drone');
  const dmg = enh.find(e => e.stat === 'damage');
  const fr = enh.find(e => e.stat === 'fireRate');
  assert.equal(dmg.owned, 1);
  assert.equal(dmg.price, enhancePrice(1));
  assert.equal(fr.owned, 0, '其他维计数不受影响');
  assert.equal(fr.price, enhancePrice(0), '其他维价格不变（维度级独立计价）');

  // drone damage 补购到满 8（已购 1 次，再购 7 次）
  for (let i = 1; i < STAT_MAX; i++) {
    assert.equal(buy(g, { kind: 'auxEnhance', aux: 'drone', stat: 'damage', price: enhancePrice(i) }), true);
  }
  assert.equal(g.aux.enhance.drone.damage, STAT_MAX);
  enh = groupOf(catalogFor(g, 0), '辅助强化').filter(e => e.aux === 'drone');
  assert.equal(enh.some(e => e.stat === 'damage'), false, '满维条目下架');
  assert.deepEqual(enh.map(e => e.stat).sort(), ['fireRate', 'projectiles', 'range'].sort());
  // 其余维仍按各自计数计价（fireRate=0）
  for (const e of enh) { assert.equal(e.owned, 0); assert.equal(e.price, enhancePrice(0)); }
  // gunner 条目不受影响
  assert.equal(groupOf(catalogFor(g, 0), '辅助强化').filter(e => e.aux === 'gunner').length, 4);
});

test('deployEnhance：turret 四维 / wall 单维，维度级独立计价，满维下架', () => {
  const g = makeGame();
  assert.equal(buy(g, { kind: 'deployEnhance', target: 'turret', stat: 'damage', price: enhancePrice(0) }), true);
  assert.equal(g.turretEnhance.damage, 1);
  assert.equal(buy(g, { kind: 'deployEnhance', target: 'turret', stat: 'fireRate', price: enhancePrice(0) }), true);
  assert.equal(g.turretEnhance.fireRate, 1);

  let deploy = groupOf(catalogFor(g, 0), '道具').filter(e => e.kind === 'deployEnhance' && e.target === 'turret');
  assert.equal(deploy.length, 4);
  const dmg = deploy.find(e => e.stat === 'damage');
  const fr = deploy.find(e => e.stat === 'fireRate');
  assert.equal(dmg.owned, 1);
  assert.equal(dmg.price, enhancePrice(1));
  assert.equal(fr.owned, 1);
  assert.equal(fr.price, enhancePrice(1));
  assert.equal(deploy.find(e => e.stat === 'range').price, enhancePrice(0), '未购维价格不变');

  assert.equal(buy(g, { kind: 'deployEnhance', target: 'wall', stat: 'hp', price: enhancePrice(0) }), true);
  assert.equal(g.wallEnhance.hp, 1);
  const wall = groupOf(catalogFor(g, 0), '道具').find(e => e.kind === 'deployEnhance' && e.target === 'wall');
  assert.equal(wall.owned, 1);
  assert.equal(wall.price, enhancePrice(1));

  // turret damage 补满 8（已购 1 次，再购 7 次）→ 该条目下架，其余维仍在
  for (let i = 1; i < STAT_MAX; i++) {
    assert.equal(buy(g, { kind: 'deployEnhance', target: 'turret', stat: 'damage', price: enhancePrice(i) }), true);
  }
  assert.equal(g.turretEnhance.damage, STAT_MAX);
  deploy = groupOf(catalogFor(g, 0), '道具').filter(e => e.kind === 'deployEnhance' && e.target === 'turret');
  assert.equal(deploy.some(e => e.stat === 'damage'), false);
  assert.equal(deploy.length, 3);

  // wall hp 满 8 → 下架；手动满维 buy 拒绝
  for (let i = 1; i < STAT_MAX; i++) {
    assert.equal(buy(g, { kind: 'deployEnhance', target: 'wall', stat: 'hp', price: enhancePrice(i) }), true);
  }
  assert.equal(groupOf(catalogFor(g, 0), '道具').some(e => e.kind === 'deployEnhance' && e.target === 'wall'), false);
  const coins = g.coins;
  assert.equal(buy(g, { kind: 'deployEnhance', target: 'wall', stat: 'hp', price: 1 }), false);
  assert.equal(g.coins, coins);
});

test('item 价格按各自已购次数递增：itemBought 驱动 1.25^n', () => {
  const g = makeGame();
  const itemsOf = () => groupOf(catalogFor(g, 0), '道具').filter(e => e.kind === 'item');
  assert.equal(itemsOf().find(e => e.item === 'medkit').price, 30, '第 1 个 = 基价');
  assert.equal(buy(g, { kind: 'item', item: 'medkit', price: 30 }), true);
  assert.equal(itemsOf().find(e => e.item === 'medkit').price, itemPrice(30, 1), 'medkit 递增');
  assert.equal(itemsOf().find(e => e.item === 'bomb').price, 50, 'bomb 不受 medkit 购买影响（各自独立）');
  assert.equal(buy(g, { kind: 'item', item: 'bomb', price: 50 }), true);
  assert.equal(itemsOf().find(e => e.item === 'bomb').price, itemPrice(50, 1));
  assert.equal(itemsOf().find(e => e.item === 'medkit').price, itemPrice(30, 1), 'medkit 价格仍按自身计数');
});

test('aux 武器价格按该类型已购数量递增', () => {
  const g = makeGame();
  const auxOf = () => groupOf(catalogFor(g, 0), '辅助武器');
  assert.equal(buy(g, auxOf().find(e => e.aux === 'drone')), true);
  assert.equal(auxOf().find(e => e.aux === 'drone').price, weaponPrice(60, 1));
  assert.equal(auxOf().find(e => e.aux === 'gunner').price, 90, 'gunner 不受 drone 购买影响');
});

test('item 购买：五种道具入库（turret/wall 走 addItem）', () => {
  const g = makeGame();
  for (const [id, price] of [['medkit', 30], ['magnet', 25], ['bomb', 50], ['turret', 120], ['wall', 100]]) {
    assert.equal(buy(g, { kind: 'item', item: id, price }), true);
    assert.equal(itemCount(g.inventory, id), 1);
  }
  assert.equal(g.coins, 100000 - (30 + 25 + 50 + 120 + 100));
});

test('道具价格来源：ITEM_PRICES 与 DEPLOY_PRICES 一致', () => {
  const g = makeGame();
  const items = groupOf(catalogFor(g, 0), '道具').filter(e => e.kind === 'item');
  const byId = Object.fromEntries(items.map(e => [e.item, e.price]));
  assert.equal(byId.turret, DEPLOY_PRICES.turret);
  assert.equal(byId.wall, DEPLOY_PRICES.wall);
  assert.equal(byId.medkit, 30);
});

test('earlyTier：bonus=0 仍列出；不经 buy 且无副作用', () => {
  const g = makeGame();
  const risk = groupOf(catalogFor(g, 0), '风险');
  assert.equal(risk.length, 1);
  assert.equal(risk[0].bonus, 0);
  const coins = g.coins;
  assert.equal(buy(g, risk[0]), false);
  assert.equal(g.coins, coins);
  assert.equal(g.weapon.enhance.damage, 0);
});

test('buy：余额不足返回 false 且无副作用', () => {
  const g = makeGame(10);
  assert.equal(buy(g, { kind: 'item', item: 'medkit', price: 30 }), false);
  assert.equal(g.coins, 10);
  assert.equal(itemCount(g.inventory, 'medkit'), 0);
});

test('未知条目类型返回 false', () => {
  const g = makeGame();
  assert.equal(buy(g, { kind: 'mystery' }), false);
  assert.equal(g.coins, 100000);
});
