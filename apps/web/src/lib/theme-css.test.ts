import assert from 'node:assert/strict';
import { test } from 'node:test';
import postcss from 'postcss';
import { themeCss } from '../../theme-css.ts';

async function run(css: string) {
  return (await postcss([themeCss() as never]).process(css, { from: undefined })).css;
}

test('cores rgb() e rgba() também entram nos temas, mantendo a cor original como fallback', async () => {
  const out = await run('.a { background: rgb(250 248 236 / .95); color: rgba(20, 30, 20, .8); }');
  assert.match(out, /background: var\(--c-bg-[0-9a-f]+, rgb\(250 248 236 \/ \.95\)\)/);
  assert.match(out, /color: var\(--c-fg-[0-9a-f]+, rgba\(20, 30, 20, \.8\)\)/);
  assert.match(out, /html\[data-theme="noturno"\]/);
});

test('--theme-keep e "theme-css: off" mantêm as cores como estão', async () => {
  const kept = await run('.a { --theme-keep: 1; color: #526446; }');
  assert.match(kept, /color: #526446/);
  const off = await run('/* theme-css: off */\n.b { background: #fff; color: #1b2438; }');
  assert.match(off, /background: #fff; color: #1b2438/);
});
