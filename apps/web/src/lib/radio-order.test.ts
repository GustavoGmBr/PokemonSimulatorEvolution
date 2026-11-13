import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTrack } from './radio-order.ts';

test('sem músicas não há faixa; com uma só ela se repete', () => {
  assert.equal(pickTrack(0, null), -1);
  assert.equal(pickTrack(1, 0), 0);
});

test('a próxima faixa nunca é a que acabou de tocar e todas podem sair', () => {
  const seen = new Set<number>();
  for (let step = 0; step < 200; step += 1) {
    for (const previous of [0, 1, 2, 3]) {
      const next = pickTrack(4, previous);
      assert.notEqual(next, previous);
      assert.ok(next >= 0 && next < 4);
      if (previous === 0) seen.add(next);
    }
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
  assert.ok(pickTrack(4, null, () => 0.99) <= 3);
});
