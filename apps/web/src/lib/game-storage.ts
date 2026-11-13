// Onde o jogo guarda saves e preferências.
//
// No pacote do Windows o servidor local grava tudo num banco SQLite (saves/game.db, ao lado do .exe). A interface mantém uma
// cópia em memória, lida uma vez ao abrir, e envia cada alteração ao banco. Se o servidor não responde (npm run dev, build
// hospedado em outro lugar), usa o localStorage do navegador, como antes.
export type GameStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const prefix = 'pokesim-evolution:';
/** Marca no navegador: o que ele já guardava foi enviado ao banco (não envia de novo se o banco for apagado de propósito). */
const migratedKey = `${prefix}migrado-para-banco`;
const headers = { 'content-type': 'application/json', 'x-pokesim': 'app' };

type State = { storage: Record<string, string>; empty: boolean };

let remote = false;
let memory = new Map<string, string>();
const pending = new Map<string, string | null>();
const inFlight = new Set<string>();
let failures = 0;

function browserStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function isState(value: unknown): value is State {
  if (typeof value !== 'object' || value === null) return false;
  const { storage } = value as { storage?: unknown };
  return typeof storage === 'object' && storage !== null && Object.values(storage).every((item) => typeof item === 'string');
}

async function fetchState(): Promise<State> {
  const response = await fetch('/api/state', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const state: unknown = await response.json();
  if (!isState(state)) throw new Error('resposta inesperada');
  return state;
}

function legacyEntries(): Record<string, string> {
  const local = browserStorage();
  const found: Record<string, string> = {};
  if (!local) return found;
  try {
    for (let i = 0; i < local.length; i++) {
      const key = local.key(i);
      const value = key?.startsWith(prefix) && key !== migratedKey ? local.getItem(key) : null;
      if (key && value !== null) found[key] = value;
    }
  } catch { /* sem acesso ao localStorage */ }
  return found;
}

/** Chamado uma vez antes de a interface abrir. */
export async function initGameStorage(): Promise<void> {
  try {
    let state = await fetchState();
    const local = browserStorage();
    if (state.empty && local && local.getItem(migratedKey) === null) {
      const legacy = legacyEntries();
      if (Object.keys(legacy).length > 0) {
        const response = await fetch('/api/import', { method: 'POST', headers, body: JSON.stringify({ storage: legacy }) });
        if (response.ok) { try { local.setItem(migratedKey, new Date().toISOString()); } catch { /* ignora */ } state = await fetchState(); }
      }
    }
    memory = new Map(Object.entries(state.storage));
    remote = true;
    startRefreshOnFocus();
  } catch {
    remote = false; // sem servidor do jogo: localStorage
  }
}

async function flush(key: string): Promise<void> {
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    while (pending.has(key)) {
      const value = pending.get(key)!;
      pending.delete(key);
      const url = `/api/storage/${encodeURIComponent(key)}`;
      try {
        const response = await (value === null
          ? fetch(url, { method: 'DELETE', headers })
          : fetch(url, { method: 'PUT', headers, body: JSON.stringify({ value }) }));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        failures = 0;
      } catch {
        failures += 1;
        if (!pending.has(key) && failures < 5) { pending.set(key, value); await new Promise((resolve) => setTimeout(resolve, 1000 * failures)); }
      }
    }
  } finally { inFlight.delete(key); }
}

/** Outra aba pode ter gravado: ao voltar para esta, relê o banco (sem sobrescrever o que ainda não foi enviado). */
function startRefreshOnFocus() {
  if (typeof document === 'undefined') return;
  const refresh = async () => {
    if (document.visibilityState !== 'visible' || pending.size > 0 || inFlight.size > 0) return;
    try {
      const { storage } = await fetchState();
      const next = new Map(Object.entries(storage));
      const changed = next.size !== memory.size || [...next].some(([key, value]) => memory.get(key) !== value);
      if (changed && pending.size === 0) { memory = next; window.dispatchEvent(new Event('storage')); }
    } catch { /* servidor fora do ar: mantém o que há na memória */ }
  };
  document.addEventListener('visibilitychange', () => void refresh());
}

export const gameStorage: GameStorage = {
  getItem(key) {
    if (!remote) return browserStorage()?.getItem(key) ?? null;
    return memory.get(key) ?? null;
  },
  setItem(key, value) {
    if (!remote) { browserStorage()?.setItem(key, value); return; }
    memory.set(key, value);
    pending.set(key, value);
    void flush(key);
  },
  removeItem(key) {
    if (!remote) { browserStorage()?.removeItem(key); return; }
    memory.delete(key);
    pending.set(key, null);
    void flush(key);
  },
};

/** Para os testes e para a tela de opções: o jogo está gravando no banco do servidor? */
export function usingDatabase() {
  return remote;
}
