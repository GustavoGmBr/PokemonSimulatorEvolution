import assert from 'node:assert/strict';
import { test } from 'node:test';
import { earn, moneyBonus } from './rewards.ts';

test('o dinheiro ganho em batalha recebe +60%, arredondado para baixo', () => {
  assert.equal(moneyBonus, 1.6);
  assert.equal(earn(300), 480);
  assert.equal(earn(1000), 1600);
  assert.equal(earn(10000), 16000);
  assert.equal(earn(5), 8);
  assert.equal(earn(7), 11);
  assert.equal(earn(0), 0);
});
