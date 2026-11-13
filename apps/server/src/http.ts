/** Utilidades sobre node:http: leitura de JSON, resposta JSON e entrega de arquivos (com suporte a Range). */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { HttpError } from './errors.ts';

export async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Requisição grande demais.');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

export function sendJson(res: ServerResponse, status: number, value: unknown, cache = 'no-store'): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache });
  res.end(JSON.stringify(value));
}

export function sendText(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(message);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};

export function mimeOf(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Resolve `relative` dentro de `root`; devolve o arquivo se existir e não sair da pasta. */
export function resolveInside(root: string, relative: string): { file: string; size: number } | null {
  const base = path.resolve(root);
  const file = path.resolve(base, `.${path.posix.normalize(`/${relative}`)}`);
  if (!file.startsWith(base + path.sep)) return null;
  try {
    const stat = statSync(file);
    return stat.isFile() ? { file, size: stat.size } : null;
  } catch {
    return null;
  }
}

/** Entrega um arquivo; trata `Range` (o rádio precisa para avançar a faixa). */
export function sendFile(req: IncomingMessage, res: ServerResponse, file: string, size: number, cache: string): void {
  const headers: Record<string, string | number> = { 'content-type': mimeOf(file), 'cache-control': cache, 'accept-ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
      return;
    }
    status = 206;
    headers['content-range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['content-length'] = size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || size === 0) { res.end(); return; }
  createReadStream(file, { start, end }).pipe(res);
}
