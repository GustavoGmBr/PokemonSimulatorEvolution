import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultSettings, readSettings } from './settings.ts';

test('os efeitos sonoros começam ligados, a 70%', () => {
  const settings = readSettings(null);
  assert.equal(settings.effectsEnabled, true);
  assert.equal(settings.effectsVolume, 0.7);
  assert.equal(defaultSettings.effectsEnabled, true);
});

test('o volume dos efeitos e da rádio é limitado a 0–100% em passos de 5%', () => {
  assert.equal(readSettings(JSON.stringify({ effectsVolume: 3 })).effectsVolume, 1);
  assert.equal(readSettings(JSON.stringify({ effectsVolume: -1 })).effectsVolume, 0);
  assert.equal(readSettings(JSON.stringify({ effectsVolume: 0.52 })).effectsVolume, 0.5);
  assert.equal(readSettings(JSON.stringify({ radioVolume: 'alto' })).radioVolume, defaultSettings.radioVolume);
});

test('só "false" desliga os efeitos; configurações antigas, sem o campo, continuam ligadas', () => {
  assert.equal(readSettings(JSON.stringify({ effectsEnabled: false })).effectsEnabled, false);
  assert.equal(readSettings(JSON.stringify({ theme: 'noturno' })).effectsEnabled, true);
});
