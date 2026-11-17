import type { GameState } from './game-state';

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
