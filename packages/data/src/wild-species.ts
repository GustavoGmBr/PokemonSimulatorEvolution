import species from '../catalog/wild-species.json';
import grid from '../catalog/wild-maps-grid.json';
import type { WildMapId } from './wild-maps';

// Catálogo enxuto gerado por scripts/gerar-selvagens.mjs.
// `special` = lendário ou mítico; `pre` = pré-evoluções, da mais antiga à mais próxima.
export type WildSpecies = { id: number; region: number; types: string[]; special: boolean; pre: number[] };

export const wildSpecies: readonly WildSpecies[] = species;
const byId = new Map(wildSpecies.map((entry) => [entry.id, entry]));

export function getWildSpecies(id: number) {
  return byId.get(id);
}

// Grades de tiles de cada mapa (geradas por scripts/gerar-mapas.py).
// `walkable`: "1" = chão firme, onde o jogador anda e os Pokémon podem ficar.
// `swim`: "1" = água ou lava, que só o jogador atravessa (os Pokémon selvagens ficam fora).
export const wildGrid = {
  cols: grid.cols,
  rows: grid.rows,
  walkable: grid.walkable as Record<WildMapId, string[]>,
  swim: grid.swim as Record<WildMapId, string[]>,
};
