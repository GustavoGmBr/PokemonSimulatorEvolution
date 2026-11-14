import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRng } from './battle/rng.ts';
import * as rules from './battle/casino-rules.ts';

test('a corrida entrega quadros crescentes e termina com o vencedor na linha de chegada', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { frames, winner } = rules.runRace(seededRng(seed));
    assert.deepEqual(frames[0], rules.RACE_RUNNERS.map(() => 0));
    for (let i = 1; i < frames.length; i++) frames[i]!.forEach((p, lane) => assert.ok(p >= frames[i - 1]![lane]!));
    const last = frames.at(-1)!;
    assert.equal(last[winner], rules.RACE_LENGTH);
    assert.ok(last.every((p) => p <= rules.RACE_LENGTH));
  }
});

test('a roda tem 50 casas e o índice sorteado aponta para o multiplicador devolvido', () => {
  assert.equal(rules.WHEEL_LAYOUT.length, 50);
  for (let seed = 1; seed <= 25; seed++) {
    const { index, multiplier } = rules.spinWheel(seededRng(seed));
    assert.equal(rules.WHEEL_LAYOUT[index], multiplier);
  }
});

test('o caça-níqueis devolve a grade 3×3 e linhas coerentes com o multiplicador', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const spin = rules.spinSlots(seededRng(seed));
    assert.equal(spin.grid.length, 9);
    assert.ok(spin.grid.every((cell) => rules.SLOT_CELLS.includes(cell)));
    assert.ok(spin.multiplier >= 0);
    for (const line of spin.lines) assert.ok(line.line >= 0 && line.line < rules.SLOT_LINES.length);
    if (spin.lines.length === 0) assert.equal(spin.multiplier, 0);
  }
});

test('a roleta sorteia de 0 a 36 e paga conforme a aposta', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const n = rules.spinRoulette(seededRng(seed));
    assert.ok(Number.isInteger(n) && n >= 0 && n <= 36);
  }
  assert.ok(rules.roulettePayout({ kind: 'number', value: 17 }, 17) > rules.roulettePayout({ kind: 'color', value: 'red' }, 1));
  assert.equal(rules.roulettePayout({ kind: 'number', value: 17 }, 18), 0);
  assert.equal(rules.roulettePayout({ kind: 'color', value: 'red' }, 0), 0);
  assert.equal(rules.colorOf(0), 'green');
});

test('portas e duelo informam o que a animação precisa mostrar', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const door = rules.openCasinoDoor(1, seededRng(seed));
    assert.ok(door.winner >= 0 && door.winner < rules.DOOR_COUNT);
    assert.equal(door.multiplier, door.winner === 1 ? rules.DOOR_PAYOUT : 0);
    const duel = rules.playTypeDuel(0, seededRng(seed));
    assert.ok(duel.opponent >= 0 && duel.opponent < rules.DUEL_TYPES.length);
    assert.ok(['win', 'draw', 'lose'].includes(duel.result));
    assert.equal(duel.multiplier, duel.result === 'win' ? rules.DUEL_PAYOUT : duel.result === 'draw' ? 1 : 0);
  }
});

test('Piplup paga conforme o número de pulos', () => {
  assert.equal(rules.piplupMultiplier(0), 0);
  assert.equal(rules.piplupMultiplier(1), 1);
  assert.equal(rules.piplupMultiplier(7), 5);
});
