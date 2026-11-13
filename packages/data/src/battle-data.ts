// Dados do sistema de batalha: golpes, espécies (atributos base, captura, XP, golpes por nível), tipos e itens.
// Os catálogos são compactos (ver scripts/gerar-dados-batalha.py); aqui eles viram objetos prontos para o motor.
import movesJson from '../catalog/battle-moves.json';
import speciesJson from '../catalog/battle-species.json';
import itemsJson from '../catalog/battle-items.json';
import typesJson from '../catalog/pokedex-types.json';

export const typeNames = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type TypeName = (typeof typeNames)[number];
export type MoveCategory = 'physical' | 'special' | 'status';
export type GrowthRate = 'fast' | 'medium' | 'medium-slow' | 'slow' | 'slow-then-very-fast' | 'fast-then-very-slow';
export type Stats = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };

export interface Move {
  name: string;
  displayName: string;
  type: TypeName;
  category: MoveCategory;
  power: number;
  /** null = nunca erra */
  accuracy: number | null;
  pp: number;
  priority: number;
  target: string;
  ailment: string | null;
  ailmentChance: number;
  flinchChance: number;
  critRate: number;
  drain: number;
  healing: number;
  minHits: number | null;
  maxHits: number | null;
  statChanges: { stat: string; change: number }[];
  statChance: number;
}

export interface BattleSpecies {
  id: number;
  types: TypeName[];
  baseStats: Stats;
  baseExp: number;
  captureRate: number;
  growthRate: GrowthRate;
  weight: number;
  height: number;
  baseHappiness: number;
  /** golpes aprendidos por nível, em ordem: [nível, nome do golpe] */
  learnset: readonly (readonly [number, string])[];
}

export interface TypeInfo { name: TypeName; doubleTo: TypeName[]; halfTo: TypeName[]; noneTo: TypeName[] }

export type BattleItemCategory = 'captura' | 'cura';
export interface BattleItem { name: string; displayName: string; category: BattleItemCategory; description: string; price: number | null }

type RawMove = Partial<Move> & Pick<Move, 'name' | 'displayName' | 'type' | 'category' | 'power' | 'accuracy' | 'pp' | 'priority'>;

function fillMove(raw: RawMove): Move {
  return {
    target: 'selected-pokemon', ailment: null, ailmentChance: 0, flinchChance: 0, critRate: 0, drain: 0, healing: 0,
    minHits: null, maxHits: null, statChanges: [], statChance: 0, ...raw,
  };
}

export const battleMoves: ReadonlyMap<string, Move> = new Map(
  (movesJson as unknown as RawMove[]).map((raw) => [raw.name, fillMove(raw)]),
);

type RawSpecies = { id: number; types: string[]; stats: number[]; exp: number; catch: number; growth: string; weight: number; height: number; happy: number; learn: [number, string][] };

const speciesById = new Map<number, BattleSpecies>();
for (const raw of speciesJson as unknown as RawSpecies[]) {
  const [hp, atk, def, spa, spd, spe] = raw.stats as [number, number, number, number, number, number];
  speciesById.set(raw.id, {
    id: raw.id, types: raw.types as TypeName[], baseStats: { hp, atk, def, spa, spd, spe }, baseExp: raw.exp, captureRate: raw.catch,
    growthRate: raw.growth as GrowthRate, weight: raw.weight, height: raw.height, baseHappiness: raw.happy, learnset: raw.learn,
  });
}

export function getBattleSpecies(id: number): BattleSpecies | undefined {
  return speciesById.get(id);
}

export const typeChart: ReadonlyMap<TypeName, TypeInfo> = new Map(
  (typesJson as unknown as TypeInfo[]).map((info) => [info.name, info]),
);

export const battleItems: readonly BattleItem[] = itemsJson as unknown as BattleItem[];
const itemsByName = new Map(battleItems.map((item) => [item.name, item]));
export function getBattleItem(name: string): BattleItem | undefined {
  return itemsByName.get(name);
}
