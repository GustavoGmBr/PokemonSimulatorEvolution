import { cpSync, createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { themeCss } from './theme-css.ts';

const recursosDir = fileURLToPath(new URL('../../recursos', import.meta.url));
// Pastas de imagens servidas em /recursos/ (cada imagem só é pedida quando aparece na tela).
// O launcher (launcher/) serve exatamente as mesmas pastas em produção: mantenha as duas listas iguais.
const recursosPublicos = ['Pokemons', 'Shinys', 'Mapas', 'Arenas', 'Pokebolas', 'Itens', 'Treinadores'];
// Sons (efeitos e músicas do rádio), servidos em /recursos/Sons/ com suporte a Range para o player poder avançar a faixa.
const recursosSons = 'Sons';
const musicasDir = join(recursosDir, recursosSons, 'Musicas');
// Faixas menores que isto são vinhetas de poucos segundos (item obtido, subir de nível…) e ficam fora do rádio.
const tamanhoMinimoDaMusica = 100_000;
// Lista das imagens de treinador (os nomes dão rótulo e gênero aos sprites); fica versionada para o build não depender de recursos/.
const treinadoresManifesto = fileURLToPath(new URL('./src/lib/trainer-sprite-files.json', import.meta.url));

/** "03 - Pallet Town.mp3" → "Pallet Town". */
function tituloDaMusica(arquivo: string) {
  return arquivo.replace(/\.mp3$/i, '').replace(/^\d+\s*-\s*/, '').trim();
}

/** Músicas de recursos/Sons/Musicas (sem as vinhetas curtas), no mesmo formato que o launcher entrega em produção. */
function listaDeMusicas() {
  let files: string[] = [];
  try {
    files = readdirSync(musicasDir).filter((file) => /\.mp3$/i.test(file) && statSync(join(musicasDir, file)).size >= tamanhoMinimoDaMusica).sort();
  } catch {
    // sem a pasta de músicas, o rádio fica sem faixas
  }
  return files.map((file) => ({ file, title: tituloDaMusica(file) }));
}

/** Nomes dos arquivos de recursos/Treinadores. */
function listaDeTreinadores() {
  try {
    return readdirSync(join(recursosDir, 'Treinadores')).filter((file) => /\.png$/i.test(file)).sort();
  } catch {
    return [];
  }
}

/** Atualiza a lista de sprites de treinador quando a pasta existe (no CI, sem recursos/, vale a que está versionada). */
function atualizarManifestoDeTreinadores() {
  if (!existsSync(join(recursosDir, 'Treinadores'))) return;
  const files = listaDeTreinadores();
  const text = `${JSON.stringify(files, null, 2)}\n`;
  const atual = existsSync(treinadoresManifesto) ? readFileSync(treinadoresManifesto, 'utf8') : '';
  if (atual !== text) writeFileSync(treinadoresManifesto, text);
}

function recursosEstaticos(): Plugin {
  let outDir = '';

  return {
    name: 'recursos-estaticos',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    buildStart() {
      atualizarManifestoDeTreinadores();
    },
    configureServer(server) {
      atualizarManifestoDeTreinadores();
      server.middlewares.use('/recursos', (request, response, next) => {
        let relative: string;
        try {
          relative = decodeURIComponent((request.url ?? '').split('?')[0] ?? '');
        } catch {
          return next();
        }

        // Listas de arquivos que o jogo pede ao iniciar (o launcher entrega as mesmas em produção).
        if (relative === '/Sons/Musicas/lista.json' || relative === '/Treinadores/lista.json') {
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(JSON.stringify(relative.startsWith('/Sons') ? listaDeMusicas() : listaDeTreinadores()));
          return;
        }

        const folder = relative.split('/').filter(Boolean)[0] ?? '';
        const file = resolve(recursosDir, `.${relative}`);
        const audio = folder === recursosSons && file.endsWith('.mp3');
        if (!(recursosPublicos.includes(folder) && file.endsWith('.png')) && !audio) return next();
        if (!file.startsWith(recursosDir + sep)) return next();

        try {
          const stats = statSync(file);
          if (!stats.isFile()) return next();
          response.setHeader('Cache-Control', 'public, max-age=86400');
          if (!audio) {
            response.setHeader('Content-Type', 'image/png');
            response.setHeader('Content-Length', stats.size);
            createReadStream(file).pipe(response);
            return;
          }
          // Áudio: o navegador pede trechos (Range) para tocar e avançar a faixa.
          response.setHeader('Content-Type', 'audio/mpeg');
          response.setHeader('Accept-Ranges', 'bytes');
          const range = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range ?? ''));
          if (!range) {
            response.setHeader('Content-Length', stats.size);
            createReadStream(file).pipe(response);
            return;
          }
          const start = range[1] ? Number(range[1]) : Math.max(0, stats.size - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(Number(range[2]), stats.size - 1) : stats.size - 1;
          if (start > end || start >= stats.size) {
            response.statusCode = 416;
            response.setHeader('Content-Range', `bytes */${stats.size}`);
            response.end();
            return;
          }
          response.statusCode = 206;
          response.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
          response.setHeader('Content-Length', end - start + 1);
          createReadStream(file, { start, end }).pipe(response);
        } catch {
          response.statusCode = 404;
          response.end();
        }
      });
    },
    writeBundle() {
      // As imagens e músicas são servidas direto da pasta recursos/ (pelo launcher, ou por `npm run dev`); copiá-las para
      // dist/ só serve para hospedar o build em outro lugar: POKESIM_COPY_RECURSOS=1 npm run build.
      if (process.env.POKESIM_COPY_RECURSOS !== '1') return;
      for (const folder of [...recursosPublicos, recursosSons]) {
        if (existsSync(join(recursosDir, folder))) cpSync(join(recursosDir, folder), join(outDir, 'recursos', folder), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), recursosEstaticos()],
  css: { postcss: { plugins: [themeCss()] } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
