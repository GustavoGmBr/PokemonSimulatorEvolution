// Gera packages/data/catalog/wild-species.json, o catálogo enxuto usado na área Selvagens.
// Uso (na raiz do projeto): node scripts/gerar-selvagens.mjs
// Lê pokedex-index.json e pokedex-gen-1..9.json e guarda, por espécie: região (= geração), tipos,
// se é lendário/mítico e a lista de pré-evoluções (para o limite de estágio por insígnias).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const catalog = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'data', 'catalog');
const read = (name) => JSON.parse(readFileSync(join(catalog, name), 'utf8'));

const index = read('pokedex-index.json');
const details = new Map();
for (let generation = 1; generation <= 9; generation += 1) {
  for (const entry of read(`pokedex-gen-${generation}.json`)) details.set(entry.id, entry);
}

// Pré-evoluções de cada espécie, da mais antiga à mais próxima, a partir da árvore evolutiva.
const ancestors = new Map();
function walk(node, path) {
  ancestors.set(node.speciesId, path);
  for (const next of node.evolvesTo) walk(next, [...path, node.speciesId]);
}
for (const entry of details.values()) if (entry.evolutionChain) walk(entry.evolutionChain, []);

const species = index.map(({ id, generation, types }) => {
  const detail = details.get(id);
  return {
    id,
    region: generation,
    types,
    special: Boolean(detail?.legendary || detail?.mythical),
    pre: ancestors.get(id) ?? [],
  };
});

writeFileSync(join(catalog, 'wild-species.json'), `${JSON.stringify(species)}\n`);
console.log(`${species.length} espécies, ${species.filter((entry) => entry.special).length} lendárias ou míticas.`);
