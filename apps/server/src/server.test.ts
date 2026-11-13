import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createApp } from './app.ts';
import { backupDatabase, listBackups } from './backup.ts';
import { openDatabase, type Db } from './db.ts';
import { KEY_PREFIX, SAVES_KEY, deleteKey, getState, putKey } from './store.ts';

const save = (id: string, extra: Record<string, unknown> = {}) => ({
  id, trainer: 'Ash', starter: 'bulbasaur', trainerSprite: 'x', gender: 'boy',
  progress: { mode: 'normal', cycle: 1, money: 3000, playSeconds: 12, createdAt: '2026-01-01T00:00:00.000Z' }, collection: {}, wild: null, ...extra,
});
const savesValue = (...ids: string[]) => JSON.stringify({ version: 1, saves: ids.map((id) => save(id)) });

describe('banco', () => {
  let dir: string;
  let db: Db;
  before(() => { dir = mkdtempSync(path.join(os.tmpdir(), 'pokesim-db-')); db = openDatabase(path.join(dir, 'game.db')); });
  after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  test('começa vazio', () => {
    assert.deepEqual(getState(db), { storage: {}, empty: true });
  });

  test('guarda saves e devolve no mesmo formato do navegador', () => {
    putKey(db, SAVES_KEY, savesValue('a', 'b'));
    const state = getState(db);
    assert.equal(state.empty, false);
    const parsed = JSON.parse(state.storage[SAVES_KEY]!);
    assert.equal(parsed.version, 1);
    assert.deepEqual(parsed.saves.map((entry: { id: string }) => entry.id), ['a', 'b']);
    const row = db.prepare('SELECT trainer, cycle, money FROM saves WHERE id = ?').get('a') as { trainer: string; cycle: number; money: number };
    assert.deepEqual({ ...row }, { trainer: 'Ash', cycle: 1, money: 3000 });
  });

  test('regrava, reordena e remove jornadas', () => {
    putKey(db, SAVES_KEY, JSON.stringify({ version: 1, saves: [save('b', { trainer: 'Misty' }), save('c')] }));
    const parsed = JSON.parse(getState(db).storage[SAVES_KEY]!);
    assert.deepEqual(parsed.saves.map((entry: { id: string; trainer: string }) => `${entry.id}:${entry.trainer}`), ['b:Misty', 'c:Ash']);
  });

  test('recusa saves inválidos sem alterar o que existe', () => {
    assert.throws(() => putKey(db, SAVES_KEY, '{"version":1,"saves":[{"id":"x"},{"id":"x"}]}'));
    assert.throws(() => putKey(db, SAVES_KEY, 'nada'));
    assert.equal(JSON.parse(getState(db).storage[SAVES_KEY]!).saves.length, 2);
  });

  test('preferências por chave', () => {
    putKey(db, `${KEY_PREFIX}settings`, '{"theme":"dark"}');
    assert.equal(getState(db).storage[`${KEY_PREFIX}settings`], '{"theme":"dark"}');
    deleteKey(db, `${KEY_PREFIX}settings`);
    assert.equal(getState(db).storage[`${KEY_PREFIX}settings`], undefined);
    assert.throws(() => putKey(db, 'outra-coisa', '1'));
  });

  test('backup consistente, guardando só os últimos', () => {
    const backups = path.join(dir, 'backups');
    for (let i = 0; i < 7; i++) backupDatabase(db, backups, 5, new Date(2026, 0, 1, 10, 0, i));
    const list = listBackups(backups);
    assert.equal(list.length, 5);
    const copy = openDatabase(path.join(backups, list[0]!.name));
    assert.equal((copy.prepare('SELECT COUNT(*) AS n FROM saves').get() as { n: number }).n, 2);
    copy.close();
  });

  test('sem saves não há backup', () => {
    const empty = openDatabase(path.join(dir, 'vazio.db'));
    assert.equal(backupDatabase(empty, path.join(dir, 'b2')), null);
    empty.close();
  });
});

describe('http', () => {
  let dir: string;
  let db: Db;
  let base: string;
  let stopped = 0;
  let server: ReturnType<typeof createApp>;
  const headers = { 'x-pokesim': 'app', 'content-type': 'application/json' };

  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokesim-http-'));
    for (const folder of ['web/assets', 'recursos/Treinadores', 'recursos/Sons/Musicas', 'recursos/Pokemons', 'recursos/Segredos']) mkdirSync(path.join(dir, folder), { recursive: true });
    writeFileSync(path.join(dir, 'web/index.html'), '<html>jogo</html>');
    writeFileSync(path.join(dir, 'web/assets/app-abc.js'), 'console.log(1)');
    writeFileSync(path.join(dir, 'recursos/Treinadores/Ash.png'), 'png');
    writeFileSync(path.join(dir, 'recursos/Pokemons/1.png'), 'png');
    writeFileSync(path.join(dir, 'recursos/Segredos/a.png'), 'png');
    writeFileSync(path.join(dir, 'recursos/Sons/Musicas/01 - Pallet Town.mp3'), Buffer.alloc(150_000, 1));
    writeFileSync(path.join(dir, 'recursos/Sons/Musicas/vinheta.mp3'), Buffer.alloc(10, 1));
    db = openDatabase(path.join(dir, 'saves/game.db').replace('saves', '.'));
    server = createApp({ db, recursosDir: path.join(dir, 'recursos'), webDist: path.join(dir, 'web'), backupsDir: path.join(dir, 'backups'), version: '9.9.9', onStop: () => { stopped++; }, port: () => 1 });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => { server.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });

  test('interface, rota desconhecida e arquivos com hash', async () => {
    assert.equal(await (await fetch(`${base}/`)).text(), '<html>jogo</html>');
    assert.equal(await (await fetch(`${base}/qualquer/rota`)).text(), '<html>jogo</html>');
    const asset = await fetch(`${base}/assets/app-abc.js`);
    assert.match(asset.headers.get('cache-control')!, /immutable/);
    assert.equal((await fetch(`${base}/assets/nao-existe.js`)).status, 404);
    assert.equal((await fetch(`${base}/../../etc/passwd`)).status, 200);
  });

  test('recursos: listas, pastas permitidas e Range', async () => {
    assert.deepEqual(await (await fetch(`${base}/recursos/Treinadores/lista.json`)).json(), ['Ash.png']);
    assert.deepEqual(await (await fetch(`${base}/recursos/Sons/Musicas/lista.json`)).json(), [{ file: '01 - Pallet Town.mp3', title: 'Pallet Town' }]);
    assert.equal((await fetch(`${base}/recursos/Pokemons/1.png`)).status, 200);
    assert.equal((await fetch(`${base}/recursos/Segredos/a.png`)).status, 404);
    assert.equal((await fetch(`${base}/recursos/Pokemons/..%2F..%2Fweb%2Findex.html`)).status, 404);
    const part = await fetch(`${base}/recursos/Sons/Musicas/${encodeURIComponent('01 - Pallet Town.mp3')}`, { headers: { range: 'bytes=10-19' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 10-19/150000');
    assert.equal((await part.arrayBuffer()).byteLength, 10);
  });

  test('versão e encerramento só com o cabeçalho certo', async () => {
    assert.deepEqual(await (await fetch(`${base}/_/versao`)).json(), { app: 'pokesim-evolution', version: '9.9.9', recursos: true, port: 1, storage: 'sqlite' });
    assert.equal((await fetch(`${base}/_/sair`, { method: 'POST' })).status, 403);
    assert.equal(stopped, 0);
    assert.equal((await fetch(`${base}/_/sair`, { method: 'POST', headers: { 'x-pokesim': 'stop' } })).status, 204);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(stopped, 1);
  });

  test('só aceita pedidos para o endereço local', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      import('node:http').then(({ request }) => {
        const url = new URL(base);
        request({ host: url.hostname, port: url.port, path: '/', headers: { host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }).on('error', reject).end();
      });
    });
    assert.equal(status, 421);
  });

  test('API: estado, gravação, importação única e proteção', async () => {
    assert.deepEqual(await (await fetch(`${base}/api/state`)).json(), { storage: {}, empty: true });
    const importacao = (storage: Record<string, string>) => fetch(`${base}/api/import`, { method: 'POST', headers, body: JSON.stringify({ storage }) }).then((r) => r.json());
    assert.deepEqual(await importacao({ [SAVES_KEY]: savesValue('a'), [`${KEY_PREFIX}settings`]: '{"theme":"dark"}', 'lixo': '1' }), { imported: true });
    assert.deepEqual(await importacao({ [SAVES_KEY]: savesValue('z') }), { imported: false });
    const state = await (await fetch(`${base}/api/state`)).json() as { storage: Record<string, string>; empty: boolean };
    assert.equal(state.empty, false);
    assert.deepEqual(Object.keys(state.storage).sort(), [SAVES_KEY, `${KEY_PREFIX}settings`].sort());

    const put = await fetch(`${base}/api/storage/${encodeURIComponent(SAVES_KEY)}`, { method: 'PUT', headers, body: JSON.stringify({ value: savesValue('a', 'b') }) });
    assert.equal(put.status, 204);
    assert.equal(JSON.parse(((await (await fetch(`${base}/api/state`)).json()) as { storage: Record<string, string> }).storage[SAVES_KEY]!).saves.length, 2);

    assert.equal((await fetch(`${base}/api/storage/${encodeURIComponent(SAVES_KEY)}`, { method: 'PUT', body: '{"value":"{}"}' })).status, 403);
    assert.equal((await fetch(`${base}/api/storage/${encodeURIComponent(SAVES_KEY)}`, { method: 'PUT', headers, body: '{"value":"quebrado"}' })).status, 400);
    assert.equal((await fetch(`${base}/api/storage/invalida`, { method: 'PUT', headers, body: '{"value":"1"}' })).status, 400);
    assert.equal((await fetch(`${base}/api/storage/${encodeURIComponent(`${KEY_PREFIX}settings`)}`, { method: 'DELETE', headers })).status, 204);
  });

  test('API: backup manual e lista', async () => {
    const made = await (await fetch(`${base}/api/backups`, { method: 'POST', headers })).json() as { name: string | null };
    assert.match(made.name ?? '', /^game-.*\.db$/);
    const list = await (await fetch(`${base}/api/backups`)).json() as { backups: { name: string }[] };
    assert.equal(list.backups[0]!.name, made.name);
  });
});
