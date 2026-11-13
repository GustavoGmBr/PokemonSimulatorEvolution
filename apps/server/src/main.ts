import { mkdirSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { config } from './config.ts';
import { openDatabase } from './db.ts';
import { createApp } from './app.ts';
import { backupDatabase, backupsDirOf } from './backup.ts';

const PORT_ATTEMPTS = 50;

mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = openDatabase(config.dbPath);
const backupsDir = backupsDirOf(config.dbPath);
try {
  const made = backupDatabase(db, backupsDir);
  if (made) console.log(`  backup:  ${path.join(backupsDir, made)}`);
} catch (error) {
  console.error(`Não foi possível criar o backup: ${error instanceof Error ? error.message : String(error)}`);
}

let port = config.port;
function shutdown(): void {
  try { server.close(); } catch { /* já fechado */ }
  try { db.close(); } catch { /* já fechado */ }
  process.exit(0);
}
const server = createApp({ db, recursosDir: config.recursosDir, webDist: config.webDist, backupsDir, version: config.version, onStop: shutdown, port: () => port });

/** A porta padrão guarda o endereço do jogo; se outro programa a ocupa, usa a próxima livre. */
function freePort(first: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const attempt = (candidate: number) => {
      if (candidate >= first + PORT_ATTEMPTS) return reject(new Error(`nenhuma porta livre entre ${first} e ${first + PORT_ATTEMPTS - 1}`));
      const probe = createNetServer();
      probe.once('error', () => attempt(candidate + 1));
      probe.listen(candidate, config.host, () => probe.close(() => resolve(candidate)));
    };
    attempt(first);
  });
}

try {
  port = await freePort(config.port);
} catch (error) {
  console.error(`Não foi possível iniciar: ${error instanceof Error ? error.message : String(error)}`);
  db.close();
  process.exit(1);
}

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Não foi possível iniciar: ${error.message}`);
  db.close();
  process.exit(1);
});

server.listen(port, config.host, () => {
  console.log(`Pokémon Simulator Evolution ${config.version} em http://${config.host}:${port}`);
  console.log(`  banco:    ${config.dbPath}`);
  console.log(`  recursos: ${config.recursosDir}`);
  // O inicializador do Windows espera esta linha para abrir o navegador.
  console.log(`Jogo pronto: http://${config.host}:${port}/`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, shutdown);

// Inicializador gráfico: a linha "stop" (ou o fechamento do stdin) encerra o jogo com o banco fechado.
if (process.env.POKESIM_GUI === '1') {
  const lines = createInterface({ input: process.stdin });
  lines.on('line', (line) => { if (line.trim() === 'stop') shutdown(); });
  lines.on('close', shutdown);
}
