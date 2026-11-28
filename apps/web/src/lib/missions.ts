import { getWildSpecies } from '@pokesim-evolution/data/wild-species';
import type { GameState, GameUpdate } from './game-state';
import {
  achievementReward, achievements, achievementValue, applyEvent, applyLifetime, boardDone, emptyMissionState, generateBoard, goalDone,
  tierEnd, tierPeriod, tiers, type Board, type Derived, type MissionEvent, type MissionKind, type MissionState, type Profile, type Reward, type Tier,
} from './mission-goals';
import { completedGenerations, spawnableSpecies, unlockedRegions, wildBadges } from './wild';
import { hordeCharm } from './horde';
import { ivStars } from './ivs';
import type { OwnedPokemon } from './pokemon-collection';

export * from './mission-goals';

const offsetOf = (now: number) => new Date(now).getTimezoneOffset();

/** O perfil do jogador usado para sortear metas: insígnias + gerações concluídas, Amuleto de Horda e espécies que aparecem no mapa. */
export function profileOf(game: GameState): Profile {
  const { progress } = game;
  const badges = wildBadges(progress);
  return {
    progress: badges + completedGenerations(progress),
    charm: (progress.bag[hordeCharm] ?? 0) > 0,
    pool: spawnableSpecies(badges, unlockedRegions()).map(({ id, types, region }) => ({ id, types, region })),
  };
}

/** As missões do jogador com as faixas vencidas já renovadas (nada é gravado até um evento ou resgate). */
export function missionsAt(game: GameState, now: number): MissionState {
  const saved = game.progress.missions ?? emptyMissionState();
  const offset = offsetOf(now);
  let profile: Profile | undefined;
  let next = saved;
  for (const tier of tiers) {
    const period = tierPeriod(tier, now, offset);
    if (saved[tier]?.period === period) continue;
    profile ??= profileOf(game);
    next = { ...next, [tier]: generateBoard(tier, period, profile) };
  }
  return next;
}

export const boardOf = (state: MissionState, tier: Tier) => state[tier]!;
export const renewalOf = (tier: Tier, board: Board, now: number) => tierEnd(tier, board.period, offsetOf(now));

/** Registra algo que aconteceu (captura, vitória, evolução…) nas três faixas e nas conquistas. */
export function recordMission(game: GameState, event: MissionEvent, now = Date.now()): GameState {
  const current = missionsAt(game, now);
  const missions: MissionState = { ...current, lifetime: applyLifetime(current.lifetime, event) };
  for (const tier of tiers) missions[tier] = applyEvent(current[tier]!, event);
  return { ...game, progress: { ...game.progress, missions } };
}

const infoOf = (species: number) => {
  const info = getWildSpecies(species);
  return info ? { types: info.types, region: info.region } : {};
};

export const recordSimple = (game: GameState, kind: MissionKind, amount = 1): GameState => amount > 0 ? recordMission(game, { kind, amount }) : game;
export const recordDefeat = (game: GameState, species: number): GameState => recordMission(game, { kind: 'defeat', species, ...infoOf(species) });
export const recordEvolution = (game: GameState, species: number): GameState => recordMission(game, { kind: 'evolve', species, ...infoOf(species) });
export const recordCatch = (game: GameState, pokemon: OwnedPokemon): GameState =>
  recordMission(game, { kind: 'catch', species: pokemon.species, ...infoOf(pokemon.species), shiny: pokemon.shiny, stars: pokemon.ivs ? ivStars(pokemon.ivs) : 0 });

/** Valores calculados do estado do jogo para as conquistas da Pokédex e dos tipos. */
export function derivedOf(game: GameState): Derived {
  const types = new Set<string>();
  for (const id of game.progress.caughtSpecies) for (const type of getWildSpecies(id)?.types ?? []) types.add(type);
  return { dex: game.progress.caughtSpecies.length, types: types.size };
}

function give(game: GameState, reward: Reward, missions: MissionState): GameState {
  const bag = { ...game.progress.bag };
  for (const [name, quantity] of reward.items) bag[name] = Math.min(999, (bag[name] ?? 0) + quantity);
  return { ...game, progress: { ...game.progress, bag, money: game.progress.money + reward.money,
    casinoChips: game.progress.casinoChips + reward.chips, missions } };
}

/** Resgata o prêmio de uma meta, ou o bônus de completar a faixa (`index` igual ao número de metas). */
export function claimMission(tier: Tier, index: number, period: number, now = Date.now()): GameUpdate {
  return (game) => {
    const missions = missionsAt(game, now);
    const board = missions[tier]!;
    if (board.period !== period) return 'As missões foram renovadas.';
    if (board.claimed.includes(index)) return 'Prêmio já resgatado.';
    const bonus = index === board.goals.length;
    if (bonus ? !boardDone(board) : !board.goals[index] || !goalDone(board, index)) return 'Missão ainda incompleta.';
    const reward = bonus ? board.bonus : board.goals[index]!.reward;
    return give(game, reward, { ...missions, [tier]: { ...board, claimed: [...board.claimed, index] } });
  };
}

/** Resgata o próximo nível de uma conquista de longo prazo. */
export function claimAchievement(id: string, now = Date.now()): GameUpdate {
  return (game) => {
    const position = achievements.findIndex((entry) => entry.id === id);
    const achievement = achievements[position];
    if (!achievement) return 'Conquista desconhecida.';
    const missions = missionsAt(game, now);
    const level = missions.lifetime.claimed[id] ?? 0;
    const goal = achievement.levels[level];
    if (goal === undefined) return 'Conquista completa.';
    if (achievementValue(achievement, missions.lifetime, derivedOf(game)) < goal) return 'Conquista ainda incompleta.';
    const lifetime = { ...missions.lifetime, claimed: { ...missions.lifetime.claimed, [id]: level + 1 } };
    return give(game, achievementReward(position, level), { ...missions, lifetime });
  };
}
