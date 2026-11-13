import moves from '../catalog/pokedex-moves.json';
import types from '../catalog/pokedex-types.json';
import evolutionRequirements from '../catalog/pokedex-evolution-requirements.json';

export type BaseStats = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
export type EvolutionNode = { speciesId: number; evolvesTo: EvolutionNode[] };

type PokemonDetails = {
  id: number;
  baseStats: BaseStats;
  height: number | null;
  weight: number | null;
  legendary: boolean;
  mythical: boolean;
  abilities: { name: string; hidden: boolean }[];
  learnset: { move: string; method: string; level: number }[];
  evolutionChain: EvolutionNode | null;
  forms: {
    name: string;
    displayName: string;
    types: string[];
    baseStats: BaseStats;
    spriteId: number;
    sprite: string | null;
    requirements: string[];
  }[];
};

const generationLoaders: Record<number, () => Promise<{ default: PokemonDetails[] }>> = {
  1: () => import('../catalog/pokedex-gen-1.json'),
  2: () => import('../catalog/pokedex-gen-2.json'),
  3: () => import('../catalog/pokedex-gen-3.json'),
  4: () => import('../catalog/pokedex-gen-4.json'),
  5: () => import('../catalog/pokedex-gen-5.json'),
  6: () => import('../catalog/pokedex-gen-6.json'),
  7: () => import('../catalog/pokedex-gen-7.json'),
  8: () => import('../catalog/pokedex-gen-8.json'),
  9: () => import('../catalog/pokedex-gen-9.json'),
};
const movesByName = new Map(moves.map((move) => [move.name, move]));
const requirementsById: Readonly<Record<string, string[]>> = evolutionRequirements;

export async function getPokemonDetails(id: number, generation: number) {
  const loaded = await generationLoaders[generation]?.();
  return loaded?.default.find((entry) => entry.id === id);
}

export function getDexMove(name: string) {
  return movesByName.get(name);
}

export function getEvolutionRequirements(id: number) {
  return requirementsById[id] ?? [];
}

export function getWeaknesses(defenderTypes: string[]) {
  return types.flatMap(({ name, doubleTo, halfTo, noneTo }) => {
    const multiplier = defenderTypes.reduce((result, type) => {
      if (noneTo.includes(type)) return 0;
      if (doubleTo.includes(type)) return result * 2;
      if (halfTo.includes(type)) return result * .5;
      return result;
    }, 1);
    return multiplier > 1 ? [{ type: name, multiplier }] : [];
  }).sort((a, b) => b.multiplier - a.multiplier);
}
