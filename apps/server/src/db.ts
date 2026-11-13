import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

/**
 * Migrações em ordem. Para mudar o banco, adicione um item novo no final;
 * nunca edite um que já foi publicado.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- uma linha por jornada; "data" é o save completo (JSON), as demais colunas servem para consultar e conferir
  CREATE TABLE saves (
    id           TEXT PRIMARY KEY,
    position     INTEGER NOT NULL,
    trainer      TEXT NOT NULL,
    starter      TEXT NOT NULL,
    mode         TEXT NOT NULL DEFAULT 'normal',
    cycle        INTEGER NOT NULL DEFAULT 0,
    money        INTEGER NOT NULL DEFAULT 0,
    play_seconds INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT,
    updated_at   TEXT NOT NULL,
    data         TEXT NOT NULL
  );
  CREATE INDEX saves_by_position ON saves (position);

  -- preferências (tema, controles, rádio…): chave => JSON
  CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
];

export function openDatabase(file: string): Db {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (current > MIGRATIONS.length) {
    throw new Error(`O banco é de uma versão mais nova do jogo (${current}). Atualize o Pokémon Simulator Evolution.`);
  }
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
