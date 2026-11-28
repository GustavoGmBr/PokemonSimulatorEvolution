import assert from 'node:assert/strict';
import test from 'node:test';
import { pickAutoReplacement, pickAutoSlot } from './battle/auto-battle.ts';

test('escolhe o ataque de maior pontuação', () => {
  assert.equal(pickAutoSlot([
    { slot: 0, score: 40, attack: true },
    { slot: 1, score: 95, attack: true },
    { slot: 2, score: 60, attack: true },
  ]), 1);
});

test('golpe de status só é usado quando não há ataque útil', () => {
  assert.equal(pickAutoSlot([
    { slot: 0, score: 500, attack: false },
    { slot: 1, score: 12, attack: true },
  ]), 1);
  assert.equal(pickAutoSlot([
    { slot: 0, score: 3, attack: false },
    { slot: 1, score: 0, attack: true },
  ]), 1);
});

test('empate fica com o primeiro golpe e sem golpes vira Struggle', () => {
  assert.equal(pickAutoSlot([{ slot: 0, score: 30, attack: true }, { slot: 1, score: 30, attack: true }]), 0);
  assert.equal(pickAutoSlot([]), -1);
});

test('só status: usa o de maior pontuação', () => {
  assert.equal(pickAutoSlot([{ slot: 0, score: 2, attack: false }, { slot: 1, score: 9, attack: false }]), 1);
});

test('substituto: melhor confronto, empate no primeiro, ninguém = -1', () => {
  assert.equal(pickAutoReplacement([{ index: 2, matchup: 1 }, { index: 3, matchup: 5 }, { index: 4, matchup: 5 }]), 3);
  assert.equal(pickAutoReplacement([]), -1);
});
