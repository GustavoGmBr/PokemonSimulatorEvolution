// Tipos do sistema de batalha. Os dados (golpes, espécies, tipos) vêm do pacote de dados.
import type { BattleSpecies, GrowthRate, Move, MoveCategory, Stats, TypeInfo, TypeName } from '@pokesim-evolution/data/battle-data';

export type { GrowthRate, Move, MoveCategory, Stats, TypeInfo, TypeName };
export type Species = BattleSpecies;
export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface MoveSlot { name: string; pp: number; maxPp: number }
