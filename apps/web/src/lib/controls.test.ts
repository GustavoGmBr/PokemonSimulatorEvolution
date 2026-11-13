import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exploreActionFor, defaultExploreKeys, normalizeExploreKey, normalizeShortcut, readControls } from './controls.ts';

const defaults = { 'area:mochila': 'N', 'area:equipe': 'E', 'action:back': 'Backspace' };

test('teclas de atalho: letra, número, símbolo, Backspace e Enter', () => {
  assert.equal(normalizeShortcut('q'), 'Q');
  assert.equal(normalizeShortcut(','), ',');
  assert.equal(normalizeShortcut('backspace'), 'Backspace');
  assert.equal(normalizeShortcut('Enter'), 'Enter');
  assert.equal(normalizeShortcut('ArrowUp'), null);
  assert.equal(normalizeShortcut(' '), null);
  assert.equal(normalizeExploreKey('Enter'), null);
});

test('leitura ignora tecla igual à padrão, inválida ou repetida', () => {
  assert.deepEqual(readControls(null, defaults), { shortcuts: {}, explore: {} });
  assert.deepEqual(readControls('lixo', defaults), { shortcuts: {}, explore: {} });
  assert.deepEqual(readControls(JSON.stringify({ shortcuts: { 'area:mochila': 'K', 'area:equipe': 'E', x: 'Z' } }), defaults).shortcuts, { 'area:mochila': 'K' });
  // duas ações na mesma tecla: tudo volta ao padrão
  assert.deepEqual(readControls(JSON.stringify({ shortcuts: { 'area:mochila': 'K', 'area:equipe': 'K' } }), defaults).shortcuts, {});
  // explorar: a tecla repetida entre ações descarta todas as trocas
  assert.deepEqual(readControls(JSON.stringify({ explore: { up: 'I', down: 'K' } }), defaults).explore, { up: 'I', down: 'K' });
  assert.deepEqual(readControls(JSON.stringify({ explore: { up: 'S' } }), defaults).explore, {});
});

test('explorar: as setas e o Enter sempre funcionam além da tecla escolhida', () => {
  const keys = { ...defaultExploreKeys, up: 'I' };
  assert.equal(exploreActionFor(keys, 'i'), 'up');
  assert.equal(exploreActionFor(keys, 'ArrowUp'), 'up');
  assert.equal(exploreActionFor(keys, 'w'), null);
  assert.equal(exploreActionFor(keys, 'Enter'), 'interact');
  assert.equal(exploreActionFor(keys, 'f'), 'capture');
});
