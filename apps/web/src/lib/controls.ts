// Controles que o jogador pode trocar em Opções, guardados neste navegador (valem para todos os saves):
//  - atalhos com Ctrl/⌘ (áreas do menu e ações do jogo);
//  - teclas de explorar o mapa dos Selvagens (andar, interagir, capturar).
// As teclas dos golpes na batalha têm a sua própria loja em battle-keys.ts.
import { useSyncExternalStore } from 'react';

export const exploreActions = [
  { id: 'up', label: 'Andar para cima', fallback: 'W' },
  { id: 'down', label: 'Andar para baixo', fallback: 'S' },
  { id: 'left', label: 'Andar para a esquerda', fallback: 'A' },
  { id: 'right', label: 'Andar para a direita', fallback: 'D' },
  { id: 'interact', label: 'Interagir / enfrentar', fallback: 'E' },
  { id: 'capture', label: 'Capturar', fallback: 'F' },
] as const;
export type ExploreAction = (typeof exploreActions)[number]['id'];
export type ExploreKeys = Record<ExploreAction, string>;
export const defaultExploreKeys = Object.fromEntries(exploreActions.map((action) => [action.id, action.fallback])) as ExploreKeys;

/** Setas (e Enter para interagir) sempre funcionam, além da tecla escolhida. */
export const fixedExploreKeys: Record<string, ExploreAction> = {
  arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', enter: 'interact',
};

/** Combinações com Ctrl que o navegador reserva (nova aba/janela, fechar aba) ou que o texto usa (copiar, colar, desfazer). */
export const reservedShortcutKeys = ['T', 'W', 'N', 'C', 'V', 'Z'];

const shortcutNames: Record<string, string> = { backspace: 'Backspace', enter: 'Enter' };

/** Tecla pressionada em forma comparável: letra/número/símbolo em maiúscula, ou "Backspace"/"Enter"; null se não serve. */
export function normalizeShortcut(key: string): string | null {
  const named = shortcutNames[key.toLowerCase()];
  if (named) return named;
  if (key.length !== 1 || key.trim() === '') return null;
  return key.toUpperCase();
}

/** Tecla de explorar: uma letra, número ou símbolo (setas e Enter já funcionam sempre). */
export function normalizeExploreKey(key: string): string | null {
  if (key.length !== 1 || key.trim() === '') return null;
  return key.toUpperCase();
}

type Overrides = Record<string, string>;
type Stored = { shortcuts: Overrides; explore: Partial<ExploreKeys> };

const storageKey = 'pokesim-evolution:controls';
const changeEvent = 'pokesim-controls';
const empty: Stored = { shortcuts: {}, explore: {} };

/** Lê o que foi guardado; o que for inválido, repetido ou reservado volta ao padrão. */
export function readControls(raw: string | null, shortcutDefaults: Overrides): Stored {
  if (!raw) return empty;
  try {
    const saved = JSON.parse(raw) as { shortcuts?: unknown; explore?: unknown } | null;
    const shortcuts: Overrides = {};
    const rawShortcuts = typeof saved?.shortcuts === 'object' && saved.shortcuts ? (saved.shortcuts as Record<string, unknown>) : {};
    for (const [id, fallback] of Object.entries(shortcutDefaults)) {
      const value = rawShortcuts[id];
      if (typeof value !== 'string') continue;
      const key = normalizeShortcut(value);
      if (key === value && value !== fallback) shortcuts[id] = value;
    }
    // Duas ações na mesma tecla: a leitura inteira volta ao padrão, em vez de adivinhar qual vale.
    const effective = Object.keys(shortcutDefaults).map((id) => (shortcuts[id] ?? shortcutDefaults[id]!).toLowerCase());
    const valid = new Set(effective).size === effective.length;

    const explore: Partial<ExploreKeys> = {};
    const rawExplore = typeof saved?.explore === 'object' && saved.explore ? (saved.explore as Record<string, unknown>) : {};
    for (const action of exploreActions) {
      const value = rawExplore[action.id];
      if (typeof value === 'string' && normalizeExploreKey(value) === value && value !== action.fallback) explore[action.id] = value;
    }
    const exploreKeys = exploreActions.map((action) => explore[action.id] ?? action.fallback);
    return { shortcuts: valid ? shortcuts : {}, explore: new Set(exploreKeys).size === exploreKeys.length ? explore : {} };
  } catch {
    return empty;
  }
}

let defaults: Overrides = {};
let snapshot: Stored = empty;
let snapshotRaw: string | null = null;
let version = 0;

function rawControls() {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey); } catch { return null; }
}

function current(): Stored {
  const raw = rawControls();
  if (raw !== snapshotRaw) { snapshot = readControls(raw, defaults); snapshotRaw = raw; version += 1; }
  return snapshot;
}

/** Informa os atalhos padrão (id → tecla); chamado uma vez por game-navigation.ts. */
export function registerShortcutDefaults(next: Overrides) {
  defaults = next;
  snapshotRaw = '\u0000';
}

/** Tecla atual de um atalho com Ctrl (a escolhida, ou a padrão). */
export function shortcutKey(id: string): string {
  return current().shortcuts[id] ?? defaults[id] ?? '';
}

export function getExploreKeys(): ExploreKeys {
  const { explore } = current();
  return { ...defaultExploreKeys, ...explore };
}

function store(next: Stored) {
  try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  snapshot = next;
  snapshotRaw = rawControls();
  version += 1;
  window.dispatchEvent(new Event(changeEvent));
}

/** Troca a tecla de um atalho. Se outra ação já usava a tecla, as duas trocam. Devolve uma mensagem se a tecla não serve. */
export function setShortcutKey(id: string, pressed: string): string | null {
  const key = normalizeShortcut(pressed);
  if (!key) return 'Use uma letra, número ou símbolo (Backspace e Enter também servem).';
  const stored = current();
  if (reservedShortcutKeys.includes(key) && key.toLowerCase() !== (defaults[id] ?? '').toLowerCase()) {
    return `Ctrl ${key} é reservado pelo navegador ou pelo texto; escolha outra tecla.`;
  }
  const owner = Object.keys(defaults).find((other) => other !== id && shortcutKey(other).toLowerCase() === key.toLowerCase());
  const shortcuts = { ...stored.shortcuts, [id]: key };
  if (owner) shortcuts[owner] = shortcutKey(id);
  for (const [other, value] of Object.entries(shortcuts)) if (value === defaults[other]) delete shortcuts[other];
  store({ ...stored, shortcuts });
  return null;
}

export function setExploreKey(action: ExploreAction, pressed: string): string | null {
  const key = normalizeExploreKey(pressed);
  if (!key) return 'Use uma letra, número ou símbolo (as setas já funcionam sempre).';
  const stored = current();
  const keys = getExploreKeys();
  const owner = exploreActions.find((entry) => entry.id !== action && keys[entry.id] === key);
  const next = { ...keys, [action]: key, ...(owner ? { [owner.id]: keys[action] } : {}) };
  const explore: Partial<ExploreKeys> = {};
  for (const entry of exploreActions) if (next[entry.id] !== entry.fallback) explore[entry.id] = next[entry.id];
  store({ ...stored, explore });
  return null;
}

export function resetShortcutKeys() { store({ ...current(), shortcuts: {} }); }
export function resetExploreKeys() { store({ ...current(), explore: {} }); }

/** Qual ação de explorar a tecla pressionada dispara (a escolhida ou as fixas: setas e Enter). */
export function exploreActionFor(keys: ExploreKeys, pressed: string): ExploreAction | null {
  const fixed = fixedExploreKeys[pressed.toLowerCase()];
  if (fixed) return fixed;
  const key = normalizeExploreKey(pressed);
  return key ? exploreActions.find((action) => keys[action.id] === key)?.id ?? null : null;
}

function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener(changeEvent, listener); window.removeEventListener('storage', listener); };
}

/** Faz o componente redesenhar quando qualquer atalho muda (as teclas mostradas na tela vêm de shortcutKey). */
export function useControlsVersion(): number {
  return useSyncExternalStore(subscribe, () => { current(); return version; }, () => 0);
}

export function useExploreKeys(): ExploreKeys {
  useControlsVersion();
  return getExploreKeys();
}
