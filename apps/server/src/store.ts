import type { Db } from './db.ts';
import { HttpError } from './errors.ts';

/** O jogo guarda tudo sob chaves com este prefixo (as mesmas que usava no localStorage do navegador). */
export const KEY_PREFIX = 'pokesim-evolution:';
export const SAVES_KEY = `${KEY_PREFIX}journey-saves`;
export const MAX_SETTING_BYTES = 256 * 1024;
const MAX_KEY_LENGTH = 80;

type SaveEntry = Record<string, unknown>;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

export function validKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX) && key.length <= MAX_KEY_LENGTH && /^[\w:.-]+$/.test(key);
}

export interface State {
  /** chave => texto, no formato em que o navegador as guardava */
  storage: Record<string, string>;
  /** nenhum save nem preferência no banco ainda: o navegador pode enviar o que já tinha */
  empty: boolean;
}

export function getState(db: Db): State {
  const storage: Record<string, string> = {};
  const version = (db.prepare("SELECT value FROM meta WHERE key = 'saves_version'").get() as { value: string } | undefined)?.value;
  if (version !== undefined) {
    const rows = db.prepare('SELECT data FROM saves ORDER BY position').all() as { data: string }[];
    storage[SAVES_KEY] = `{"version":${version},"saves":[${rows.map((row) => row.data).join(',')}]}`;
  }
  for (const row of db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) storage[row.key] = row.value;
  return { storage, empty: Object.keys(storage).length === 0 };
}

function parseSaves(value: string): { version: number; saves: SaveEntry[] } {
  let data: unknown;
  try { data = JSON.parse(value); } catch { throw new HttpError(400, 'Os saves enviados não são um JSON válido.'); }
  if (!isRecord(data) || typeof data.version !== 'number' || !Number.isSafeInteger(data.version) || !Array.isArray(data.saves)) {
    throw new HttpError(400, 'Formato de saves desconhecido.');
  }
  const ids = new Set<string>();
  const saves = data.saves.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) throw new HttpError(400, 'Os saves enviados contêm uma jornada inválida.');
    ids.add(entry.id);
    return entry;
  });
  return { version: data.version, saves };
}

function transaction(db: Db, run: () => void): void {
  db.exec('BEGIN IMMEDIATE');
  try { run(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
}

/** Guarda o valor de uma chave: as jornadas viram uma linha cada na tabela saves; o resto vai para settings. */
export function putKey(db: Db, key: string, value: string, now = new Date()): void {
  if (!validKey(key)) throw new HttpError(400, 'Chave inválida.');
  const stamp = now.toISOString();
  if (key !== SAVES_KEY) {
    if (Buffer.byteLength(value) > MAX_SETTING_BYTES) throw new HttpError(413, 'Valor grande demais.');
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(key, value, stamp);
    return;
  }

  const { version, saves } = parseSaves(value);
  const upsert = db.prepare(`
    INSERT INTO saves (id, position, trainer, starter, mode, cycle, money, play_seconds, created_at, updated_at, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET position = excluded.position, trainer = excluded.trainer, starter = excluded.starter, mode = excluded.mode,
      cycle = excluded.cycle, money = excluded.money, play_seconds = excluded.play_seconds, created_at = excluded.created_at,
      updated_at = excluded.updated_at, data = excluded.data
    WHERE saves.data <> excluded.data OR saves.position <> excluded.position`);
  transaction(db, () => {
    const keep = new Set(saves.map((entry) => entry.id as string));
    for (const row of db.prepare('SELECT id FROM saves').all() as { id: string }[]) {
      if (!keep.has(row.id)) db.prepare('DELETE FROM saves WHERE id = ?').run(row.id);
    }
    saves.forEach((entry, position) => {
      const progress = isRecord(entry.progress) ? entry.progress : {};
      upsert.run(entry.id as string, position, text(entry.trainer), text(entry.starter), text(progress.mode, 'normal'), count(progress.cycle), count(progress.money),
        count(progress.playSeconds), typeof progress.createdAt === 'string' ? progress.createdAt : null, stamp, JSON.stringify(entry));
    });
    db.prepare("INSERT INTO meta (key, value) VALUES ('saves_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(version));
  });
}

export function deleteKey(db: Db, key: string): void {
  if (!validKey(key)) throw new HttpError(400, 'Chave inválida.');
  if (key === SAVES_KEY) {
    transaction(db, () => {
      db.exec('DELETE FROM saves');
      db.exec("DELETE FROM meta WHERE key = 'saves_version'");
    });
    return;
  }
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}
