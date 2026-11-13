import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

type Call = { url: string; method: string; body?: string };

function fakeServer(options: { empty?: boolean; storage?: Record<string, string>; down?: boolean } = {}) {
  const calls: Call[] = [];
  let storage = { ...(options.storage ?? {}) };
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body as string | undefined });
    if (options.down) throw new Error('offline');
    if (url === '/api/state') return Response.json({ storage, empty: Object.keys(storage).length === 0 });
    if (url === '/api/import') { storage = { ...JSON.parse(init!.body as string).storage }; return Response.json({ imported: true }); }
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  return calls;
}

function fakeLocalStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  (globalThis as { localStorage?: unknown }).localStorage = {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
  return data;
}

async function fresh() {
  return (await import(`./game-storage.ts?x=${Math.random()}`)) as typeof import('./game-storage.ts');
}

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

test('sem servidor usa o localStorage', async () => {
  const local = fakeLocalStorage();
  fakeServer({ down: true });
  const { initGameStorage, gameStorage, usingDatabase } = await fresh();
  await initGameStorage();
  assert.equal(usingDatabase(), false);
  gameStorage.setItem('pokesim-evolution:a', '1');
  assert.equal(local.get('pokesim-evolution:a'), '1');
  assert.equal(gameStorage.getItem('pokesim-evolution:a'), '1');
});

test('com servidor lê do banco e envia cada alteração', async () => {
  fakeLocalStorage();
  const calls = fakeServer({ storage: { 'pokesim-evolution:a': 'x' } });
  const { initGameStorage, gameStorage, usingDatabase } = await fresh();
  await initGameStorage();
  assert.equal(usingDatabase(), true);
  assert.equal(gameStorage.getItem('pokesim-evolution:a'), 'x');
  gameStorage.setItem('pokesim-evolution:a', 'y');
  assert.equal(gameStorage.getItem('pokesim-evolution:a'), 'y');
  gameStorage.removeItem('pokesim-evolution:b');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const put = calls.find((c) => c.method === 'PUT')!;
  assert.equal(put.url, '/api/storage/pokesim-evolution%3Aa');
  assert.equal(JSON.parse(put.body!).value, 'y');
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('pokesim-evolution%3Ab')));
});

test('envia uma única vez o que o navegador já guardava', async () => {
  const local = fakeLocalStorage({ 'pokesim-evolution:journey-saves': '{"version":1,"saves":[]}', 'pokesim-evolution:settings': '{}', outra: '1' });
  const calls = fakeServer();
  const { initGameStorage } = await fresh();
  await initGameStorage();
  const sent = JSON.parse(calls.find((c) => c.url === '/api/import')!.body!).storage as Record<string, string>;
  assert.deepEqual(Object.keys(sent).sort(), ['pokesim-evolution:journey-saves', 'pokesim-evolution:settings']);
  assert.ok(local.has('pokesim-evolution:migrado-para-banco'));

  const again = fakeServer();
  const second = await fresh();
  await second.initGameStorage();
  assert.equal(again.some((c) => c.url === '/api/import'), false);
});
