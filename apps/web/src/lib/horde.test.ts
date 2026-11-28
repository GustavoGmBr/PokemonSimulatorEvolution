import assert from 'node:assert/strict';
import test from 'node:test';
import { hordeCharmPrice, hordeOdds, hordeSize } from './horde.ts';
import { AREA_DAMAGE, isAreaMove } from './battle/area.ts';
import { pickAutoOption } from './battle/auto-battle.ts';

test('sem o amuleto não há hordas', () => {
  assert.equal(hordeOdds(0, false), null);
  assert.equal(hordeOdds(9, false), null);
});

test('com o amuleto: 10% e hordas de 2 ou 3 Pokémon', () => {
  assert.deepEqual(hordeOdds(0, true), { chance: 0.1, minSize: 2, maxSize: 3 });
  assert.equal(hordeCharmPrice, 35000);
});

test('gerações concluídas aumentam a chance e o tamanho, com teto', () => {
  const one = hordeOdds(1, true)!;
  assert.ok(Math.abs(one.chance - 0.15) < 1e-9);
  assert.equal(one.maxSize, 3);
  assert.equal(hordeOdds(3, true)!.maxSize, 4);
  assert.equal(hordeOdds(5, true)!.minSize, 3);
  const all = hordeOdds(9, true)!;
  assert.ok(all.chance <= 0.55 + 1e-9);
  assert.equal(all.maxSize, 5);
  assert.ok(hordeOdds(30, true)!.chance <= 0.55 + 1e-9);
  for (let generations = 0; generations <= 9; generations += 1) {
    const odds = hordeOdds(generations, true)!;
    assert.ok(odds.minSize <= odds.maxSize);
    assert.ok(odds.chance >= (hordeOdds(Math.max(0, generations - 1), true)!.chance));
  }
});

test('o tamanho da horda fica entre o mínimo e o máximo', () => {
  const odds = { chance: 1, minSize: 2, maxSize: 4 };
  assert.equal(hordeSize(odds, () => 0), 2);
  assert.equal(hordeSize(odds, () => 0.999999), 4);
  const seen = new Set<number>();
  for (let step = 0; step < 100; step += 1) seen.add(hordeSize(odds, () => step / 100));
  assert.deepEqual([...seen].sort(), [2, 3, 4]);
});

test('golpes em área: todos os adversários e todos os outros Pokémon', () => {
  assert.equal(isAreaMove({ target: 'all-opponents' }), true);
  assert.equal(isAreaMove({ target: 'all-other-pokemon' }), true);
  assert.equal(isAreaMove({ target: 'selected-pokemon' }), false);
  assert.equal(isAreaMove({ target: 'user' }), false);
  assert.ok(AREA_DAMAGE > 0 && AREA_DAMAGE < 1);
});

test('auto-batalha na horda devolve o golpe e o alvo', () => {
  const pick = pickAutoOption([
    { slot: 0, score: 30, attack: true, target: 2 },
    { slot: 1, score: 80, attack: true, target: 1 },
    { slot: 2, score: 500, attack: false, target: 0 },
  ]);
  assert.deepEqual(pick, { slot: 1, score: 80, attack: true, target: 1 });
});
