import type { GameState } from './game-state';
import type { OwnedPokemon } from './pokemon-collection';

export const fieldHealCost = 500;

export function healTeam(game: GameState): GameState {
  return {
    ...game,
    collection: { ...game.collection, team: game.collection.team.map(({ hp: _hp, ...pokemon }) => ({ ...pokemon, status: null })) },
  };
}

export function healTeamInField(game: GameState): GameState | string {
  if (game.progress.money < fieldHealCost) return 'Você precisa de ₽ 500 para curar a equipe no mapa.';
  const healed = healTeam(game);
  return { ...healed, progress: { ...healed.progress, money: healed.progress.money - fieldHealCost } };
}

export const isFainted = (pokemon: Pick<OwnedPokemon, 'hp'>) => pokemon.hp !== undefined && pokemon.hp <= 0;

/** Alguém da equipe ainda está de pé para abrir uma batalha? */
export const canFight = (team: readonly Pick<OwnedPokemon, 'hp'>[]) => team.some((pokemon) => !isFainted(pokemon));

export const faintedTeamMessage = 'Todos os seus Pokémon estão desmaiados. Cure a equipe no Centro Pokémon ou no mapa antes de lutar.';
