import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardLabel } from '../src/ui/levelup.js';

test('enhance 卡：标题武器强化，描述为 STAT_LABEL[stat]', () => {
  assert.deepEqual(cardLabel({ type: 'enhance', stat: 'damage' }), { title: '武器强化', desc: '伤害 +25%' });
  assert.deepEqual(cardLabel({ type: 'enhance', stat: 'fireRate' }), { title: '武器强化', desc: '攻速 +20%' });
  assert.deepEqual(cardLabel({ type: 'enhance', stat: 'projectiles' }), { title: '武器强化', desc: '弹道 +1' });
  assert.deepEqual(cardLabel({ type: 'enhance', stat: 'range' }), { title: '武器强化', desc: '攻击范围 +20%' });
});

test('swap 卡：标题更换武器，描述为目标武器名 + 从 Lv1 开始', () => {
  assert.deepEqual(cardLabel({ type: 'swap', weapon: 'mg' }), { title: '更换武器', desc: '机枪（从 Lv1 开始）' });
  assert.deepEqual(cardLabel({ type: 'swap', weapon: 'rifle' }), { title: '更换武器', desc: '步枪（从 Lv1 开始）' });
});

test('heal 卡：标题急救包，描述为立即回复 50% HP', () => {
  assert.deepEqual(cardLabel({ type: 'heal' }), { title: '急救包', desc: '立即回复 50% HP' });
});
