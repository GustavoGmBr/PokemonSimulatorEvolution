import index from '../catalog/pokedex-index.json';

export const typeLabels: Record<string, string> = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico', grass: 'Planta',
  ice: 'Gelo', fighting: 'Lutador', poison: 'Venenoso', ground: 'Terrestre', flying: 'Voador',
  psychic: 'Psíquico', bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão',
  dark: 'Sombrio', steel: 'Aço', fairy: 'Fada',
};

export type PokemonEntry = (typeof index)[number];
export const pokedexEntries = index;
const entriesById = new Map(index.map((entry) => [entry.id, entry]));

export function getPokemon(id: number) {
  return entriesById.get(id);
}

export function formatDexNumber(id: number) {
  return `#${String(id).padStart(4, '0')}`;
}

export function normalizeDexSearch(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replaceAll('♀', 'f').replaceAll('♂', 'm').replace(/[^a-z0-9]/g, '');
}

const searchIndex = index.map((entry) => ({
  entry,
  names: [normalizeDexSearch(entry.displayName), normalizeDexSearch(entry.name)],
}));

export function searchPokemon(query: string): PokemonEntry[] {
  if (!query.trim()) return index;

  const normalized = normalizeDexSearch(query);
  if (!normalized) return [];
  if (/^#?\s*\d+$/.test(query.trim())) {
    const exact = getPokemon(Number(normalized));
    return exact ? [exact] : [];
  }

  const exact: PokemonEntry[] = [];
  const starts: PokemonEntry[] = [];
  const partial: PokemonEntry[] = [];
  for (const { entry, names } of searchIndex) {
    if (names.includes(normalized)) exact.push(entry);
    else if (names.some((name) => name.startsWith(normalized))) starts.push(entry);
    else if (names.some((name) => name.includes(normalized))) partial.push(entry);
  }
  return [...exact, ...starts, ...partial];
}
