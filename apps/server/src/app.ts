import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Db } from './db.ts';
import { HttpError } from './errors.ts';
import { readJson, resolveInside, sendFile, sendJson, sendText } from './http.ts';
import { musicList, pngList, publicFolders } from './recursos.ts';
import { backupDatabase, listBackups } from './backup.ts';
import { deleteKey, getState, putKey, SAVES_KEY, validKey } from './store.ts';

export const APP_ID = 'pokesim-evolution';
/** Os saves de uma jornada com muitos Pokémon passam de vários MB; 32 MB é folga de sobra. */
const MAX_STORAGE_BODY = 32 * 1024 * 1024;

export interface AppOptions {
  db: Db;
  recursosDir: string;
  webDist: string;
  backupsDir: string;
  version: string;
  /** chamado quando o launcher pede para encerrar (POST /_/sair) */
  onStop?: () => void;
  port?: () => number;
}

const hostAllowed = (host: string | undefined) => {
  const name = (host ?? '').replace(/:\d+$/, '');
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
};

export function createApp(options: AppOptions): Server {
  return createServer((req, res) => {
    handle(options, req, res).catch((error: unknown) => {
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message });
      console.error(error);
      if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno no servidor do jogo.' });
      else res.end();
    });
  });
}

async function handle(o: AppOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!hostAllowed(req.headers.host)) return sendText(res, 421, 'host não permitido');
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const pathname = url.pathname;
  const method = req.method ?? 'GET';

  if (pathname === '/_/sair') {
    // Só o launcher usa isto; o cabeçalho próprio impede que uma página qualquer dispare (exigiria CORS).
    if (method !== 'POST' || req.headers['x-pokesim'] !== 'stop') return sendText(res, 403, 'não permitido');
    res.writeHead(204).end();
    setImmediate(() => o.onStop?.());
    return;
  }
  if (pathname === '/_/versao' && (method === 'GET' || method === 'HEAD')) {
    return sendJson(res, 200, { app: APP_ID, version: o.version, recursos: existsSync(o.recursosDir), port: o.port?.() ?? null, storage: 'sqlite' });
  }
  if (pathname.startsWith('/api/')) {
    // Pedidos que alteram dados só valem vindos da própria página (um site qualquer não consegue enviar este cabeçalho sem CORS).
    if (method !== 'GET' && req.headers['x-pokesim'] !== 'app') return sendText(res, 403, 'não permitido');
    return api(o, req, res, method, pathname);
  }
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD');
    return sendText(res, 405, 'método não permitido');
  }
  if (pathname.startsWith('/recursos/')) {
    let rel: string;
    try { rel = decodeURIComponent(pathname.slice('/recursos/'.length)); } catch { return sendText(res, 400, 'endereço inválido'); }
    return recursos(o, req, res, rel);
  }
  return web(o, req, res, pathname);
}

async function api(o: AppOptions, req: IncomingMessage, res: ServerResponse, method: string, pathname: string): Promise<void> {
  if (pathname === '/api/state' && method === 'GET') return sendJson(res, 200, getState(o.db));

  const item = /^\/api\/storage\/([^/]+)$/.exec(pathname);
  if (item) {
    const key = decodeURIComponent(item[1]!);
    if (!validKey(key)) throw new HttpError(400, 'Chave inválida.');
    if (method === 'PUT') {
      const body = await readJson(req, MAX_STORAGE_BODY);
      if (typeof body !== 'object' || body === null || typeof (body as { value?: unknown }).value !== 'string') throw new HttpError(400, 'Informe { "value": "texto" }.');
      putKey(o.db, key, (body as { value: string }).value);
      res.writeHead(204).end();
      return;
    }
    if (method === 'DELETE') { deleteKey(o.db, key); res.writeHead(204).end(); return; }
  }

  // Envio único do que o navegador já guardava (localStorage), feito só se o banco ainda está vazio.
  if (pathname === '/api/import' && method === 'POST') {
    const body = await readJson(req, MAX_STORAGE_BODY);
    const storage = typeof body === 'object' && body !== null ? (body as { storage?: unknown }).storage : undefined;
    if (typeof storage !== 'object' || storage === null) throw new HttpError(400, 'Informe { "storage": { chave: texto } }.');
    if (!getState(o.db).empty) return sendJson(res, 200, { imported: false });
    for (const [key, value] of Object.entries(storage)) {
      if (typeof value !== 'string') throw new HttpError(400, 'Os valores precisam ser texto.');
      if (validKey(key)) putKey(o.db, key, value);
    }
    return sendJson(res, 200, { imported: true });
  }

  if (pathname === '/api/backups' && method === 'GET') return sendJson(res, 200, { backups: listBackups(o.backupsDir) });
  if (pathname === '/api/backups' && method === 'POST') {
    const name = backupDatabase(o.db, o.backupsDir);
    return sendJson(res, 200, { name });
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

function recursos(o: AppOptions, req: IncomingMessage, res: ServerResponse, rel: string): void {
  if (rel === 'Sons/Musicas/lista.json') return sendJson(res, 200, musicList(o.recursosDir), 'no-cache');
  if (rel === 'Treinadores/lista.json') return sendJson(res, 200, pngList(o.recursosDir, 'Treinadores'), 'no-cache');
  const clean = path.posix.normalize(`/${rel}`).slice(1);
  const [folder, ...rest] = clean.split('/');
  const extensions = folder ? publicFolders[folder] : undefined;
  const found = rest.length > 0 && clean === rel && extensions?.includes(path.extname(clean).toLowerCase());
  const file = found ? resolveInside(o.recursosDir, clean) : null;
  if (!file) return sendText(res, 404, 'não encontrado');
  sendFile(req, res, file.file, file.size, 'public, max-age=86400');
}

function web(o: AppOptions, req: IncomingMessage, res: ServerResponse, pathname: string): void {
  let name: string;
  try { name = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'; } catch { return sendText(res, 400, 'endereço inválido'); }
  let file = resolveInside(o.webDist, name);
  if (!file) {
    if (path.extname(name) !== '') return sendText(res, 404, 'não encontrado');
    file = resolveInside(o.webDist, 'index.html'); // rotas sem arquivo caem na interface (o jogo navega por #/…)
    if (!file) return sendText(res, 500, 'interface não encontrada neste pacote');
    name = 'index.html';
  }
  sendFile(req, res, file.file, file.size, name.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
}

export { SAVES_KEY };
