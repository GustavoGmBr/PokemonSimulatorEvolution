// Atalhos de teclado da batalha: um por golpe (posição 1 a 4) e um por menu. O jogador pode trocar cada tecla;
// a escolha fica neste navegador (vale para todos os saves).
import { useSyncExternalStore } from 'react';

export const battleKeyActions = [
  { id: 'move1', label: 'Golpe 1', fallback: '1' },
  { id: 'move2', label: 'Golpe 2', fallback: '2' },
  { id: 'move3', label: 'Golpe 3', fallback: '3' },
  { id: 'move4', label: 'Golpe 4', fallback: '4' },
  { id: 'fight', label: 'Lutar (abrir golpes)', fallback: 'Q' },
  { id: 'bag', label: 'Mochila', fallback: 'W' },
  { id: 'team', label: 'Pokémon (trocar)', fallback: 'E' },
  { id: 'run', label: 'Fugir', fallback: 'R' },
] as const;

export type BattleKeyAction = (typeof battleKeyActions)[number]['id'];
export type BattleKeys = Record<BattleKeyAction, string>;

const storageKey = 'pokesim-evolution:battle-keys';
const changeEvent = 'pokesim-battle-keys';

export const defaultBattleKeys = Object.fromEntries(battleKeyActions.map((action) => [action.id, action.fallback])) as BattleKeys;

/** Teclas guardadas: só valem caracteres únicos e sem repetição; o resto volta ao padrão. */
function readKeys(raw: string | null): BattleKeys {
  const keys: BattleKeys = { ...defaultBattleKeys };
  if (!raw) return keys;
  try {
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== 'object' || saved === null) return keys;
    const used = new Set<string>();
    for (const action of battleKeyActions) {
      const key = (saved as Record<string, unknown>)[action.id];
      if (typeof key === 'string' && normalizeKey(key) === key && !used.has(key)) { keys[action.id] = key; used.add(key); }
    }
    // Se alguma escolha repetida foi descartada, o padrão dela pode colidir: nesse caso volta tudo ao padrão.
    return new Set(Object.values(keys)).size === battleKeyActions.length ? keys : { ...defaultBattleKeys };
  } catch {
    return keys;
  }
}

/** Tecla pressionada em forma comparável ("q" → "Q"); null se não pode ser atalho (Enter, setas, Esc, espaço, modificadores…). */
export function normalizeKey(key: string): string | null {
  if (key.length !== 1 || key.trim() === '') return null;
  return key.toUpperCase();
}

let snapshot: BattleKeys | null = null;
let snapshotRaw: string | null = null;

function currentKeys(): BattleKeys {
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
  if (snapshot === null || raw !== snapshotRaw) { snapshot = readKeys(raw); snapshotRaw = raw; }
  return snapshot;
}

export function getBattleKeys(): BattleKeys {
  return currentKeys();
}

function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener(changeEvent, listener); window.removeEventListener('storage', listener); };
}

export function useBattleKeys(): BattleKeys {
  return useSyncExternalStore(subscribe, currentKeys, () => defaultBattleKeys);
}

function store(keys: BattleKeys) {
  try { localStorage.setItem(storageKey, JSON.stringify(keys)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  snapshot = keys;
  snapshotRaw = typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
  window.dispatchEvent(new Event(changeEvent));
}

/** Troca a tecla de uma ação. Se a tecla já era de outra ação, as duas trocam de tecla. Devolve uma mensagem se a tecla não serve. */
export function setBattleKey(action: BattleKeyAction, pressed: string): string | null {
  const key = normalizeKey(pressed);
  if (!key) return 'Use uma letra, número ou símbolo (Enter, Esc, espaço e setas não servem).';
  const keys = currentKeys();
  const owner = battleKeyActions.find((entry) => entry.id !== action && keys[entry.id] === key);
  store(owner ? { ...keys, [action]: key, [owner.id]: keys[action] } : { ...keys, [action]: key });
  return null;
}

export function resetBattleKeys() {
  store({ ...defaultBattleKeys });
}

/** Qual ação a tecla dispara, se houver. */
export function actionForKey(keys: BattleKeys, pressed: string): BattleKeyAction | null {
  const key = normalizeKey(pressed);
  return key ? battleKeyActions.find((action) => keys[action.id] === key)?.id ?? null : null;
}
