import type { Move, MoveSlot, Species, Stats } from './types';
import { calcStats } from './stats';

/** Golpes que nocauteiam o próprio usuário; ficam fora dos movesets automáticos (já estão fora do catálogo de aprendizado). */
export function isUsableMove(move: Move): boolean {
  return move.category === 'status' || move.power > 0;
}

/** O que o motor precisa saber de um Pokémon para criar um combatente. */
export interface BattleInstance {
  speciesId: number;
  level: number;
  exp: number;
  shiny: boolean;
  ivs: Stats;
  moves: MoveSlot[];
  currentHp: number;
  friendship: number;
}

export function toMoveSlot(move: Move): MoveSlot {
  return { name: move.name, pp: move.pp, maxPp: move.pp };
}

/**
 * Os quatro golpes mais recentes que a espécie aprende por nível até `level`.
 * Em empate de nível, golpes de dano e do mesmo tipo da espécie vêm primeiro.
 */
export function levelUpMoves(species: Species, level: number, moves: ReadonlyMap<string, Move>): Move[] {
  const learned = new Map<string, number>();
  for (const [at, name] of species.learnset) {
    if (at > level) continue;
    const move = moves.get(name);
    if (!move || !isUsableMove(move)) continue;
    learned.set(name, Math.max(learned.get(name) ?? 0, at));
  }
  const score = (move: Move) => (move.category !== 'status' ? 2 : 0) + (species.types.includes(move.type) ? 1 : 0);
  const selected = [...learned.entries()]
    .map(([name, learnedAt]) => ({ move: moves.get(name) as Move, learnedAt }))
    .sort((a, b) => b.learnedAt - a.learnedAt || score(b.move) - score(a.move) || a.move.name.localeCompare(b.move.name))
    .slice(0, 4)
    .map((entry) => entry.move);
  if (selected.length > 0) return selected;
  const fallback = moves.get('tackle') ?? moves.get('pound');
  return fallback ? [fallback] : [];
}

export function statsOf(instance: Pick<BattleInstance, 'level' | 'ivs' | 'shiny'>, species: Species): Stats {
  return calcStats(species.baseStats, instance.level, instance.ivs, instance.shiny);
}
