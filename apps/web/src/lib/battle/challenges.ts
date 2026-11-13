import catalog from '@pokesim-evolution/data/challenges';
import { getBattleSpecies } from '@pokesim-evolution/data/battle-data';
import { pokedexEntries } from '@pokesim-evolution/data/pokedex';
import { getWildSpecies } from '@pokesim-evolution/data/wild-species';
import type { GameState } from '../game-state';
import { rollIvs } from '../ivs';
import { defaultSpriteByGender, getTrainerSprite, trainerSprites, type TrainerGender } from '../trainer-sprites';
import type { WildEncounter } from '../wild';
import type { TrainerInfo } from './engine';
import { resumableRng } from './rng';
import { speciesName } from './session';
import { recordMission } from '../missions';

type Mode = 'treinadores' | 'ginasios' | 'torneios' | 'chefes';
export type ChallengeMode = Mode;
export type Opponent = {
  id: string; mode: Mode; name: string; title: string; sprite?: string; partnerSprite?: string; team: WildEncounter[];
  skill: TrainerInfo['skill']; reward: number; cap?: number; note?: string;
  circuit?: string; gym?: boolean; champion?: boolean; cycle?: number;
  tournament?: { tier: string; round: number; seed: number };
  /** Novo Jogo+: o nível dos adversários é a média da equipe somada a este ajuste. */
  levelOffset?: number;
};

// ---------- Novo Jogo+ ----------
// Depois de derrotar todos os campeões o jogo reinicia a progressão e os adversários passam a acompanhar o nível da equipe.
const MAX_LEVEL = 100;
/** Média de nível da equipe (arredondada); é a base da escala dos adversários no Novo Jogo+. */
export function averageLevel(team: readonly { level: number }[]) {
  return team.length ? Math.round(team.reduce((sum, { level }) => sum + level, 0) / team.length) : 5;
}
export const scaledLevel = (average: number, offset: number) => Math.max(1, Math.min(MAX_LEVEL, average + offset));
/** Ajuste de nível por dificuldade (somado à média da equipe). */
export const scaleOffsets = {
  trainers: { iniciante: -10, facil: -5, medio: 0, dificil: 5 } as Record<string, number>,
  gym: 0, elite: 3, champion: 6,
  bosses: [-10, -5, 0, 5, 10, 15] as readonly number[],
} as const;

/** Refaz os níveis de um treinador sorteado com a média atual da equipe (os Pokémon continuam os mesmos). */
export function rescaleOpponent(opponent: Opponent, average: number): Opponent {
  if (opponent.levelOffset === undefined) return opponent;
  const level = scaledLevel(average, opponent.levelOffset);
  return { ...opponent, team: opponent.team.map((member) => ({ ...member, level })) };
}

const maleNames = ['Caio', 'Rafael', 'Hugo', 'Miguel', 'Lucas', 'Davi'];
const femaleNames = ['Lia', 'Clara', 'Alice', 'Marina', 'Sofia', 'Júlia'];
const pick = <T,>(list: readonly T[], rand: () => number) => list[Math.floor(rand() * list.length)]!;
const battlePool = pokedexEntries.filter((entry) => getBattleSpecies(entry.id));

function npc(rand: () => number) {
  const gender: TrainerGender = rand() < .5 ? 'male' : 'female';
  const options = trainerSprites.filter((sprite) => sprite.gender === gender && /_(male|female)$/.test(sprite.id));
  return {
    name: pick(gender === 'male' ? maleNames : femaleNames, rand),
    sprite: options.length ? pick(options, rand).id : defaultSpriteByGender[gender],
    title: gender === 'male' ? 'Treinador' : 'Treinadora',
  };
}

function encounter(id: string, species: number, level: number, rand: () => number): WildEncounter {
  return { id, species, level, shiny: false, ivs: rollIvs(rand) };
}

function randomTeam(id: string, size: number, min: number, max: number, rand: () => number) {
  const pool = battlePool.filter(({ id }) => {
    const species = getWildSpecies(id);
    return species && (max >= 99 || !species.special) &&
      (max > 15 || species.pre.length === 0) && (min < 50 || species.pre.length > 0 || species.special);
  });
  return Array.from({ length: size }, (_, index) =>
    encounter(`${id}:${index}`, pick(pool, rand).id, min + Math.floor(rand() * (max - min + 1)), rand));
}

export function randomTrainers(average?: number): Opponent[] {
  return [
    { id: 'iniciante', min: 4, max: 8, size: 2, skill: 1, reward: 300, note: 'Iniciante' },
    { id: 'facil', min: 20, max: 30, size: 3, skill: 1, reward: 1000, note: 'Fácil' },
    { id: 'medio', min: 40, max: 50, size: 4, skill: 2, reward: 3000, note: 'Médio' },
    { id: 'dificil', min: 100, max: 100, size: 6, skill: 3, reward: 10000, note: 'Difícil' },
  ].map(({ id, min, max, size, skill, reward, note }) => {
    const offset = scaleOffsets.trainers[id]!;
    const level = average === undefined ? undefined : scaledLevel(average, offset);
    return {
      id, mode: 'treinadores' as const, ...npc(Math.random),
      team: randomTeam(id, size, level ?? min, level ?? max, Math.random), skill: skill as TrainerInfo['skill'], reward, note,
      ...(level === undefined ? {} : { levelOffset: offset }),
    };
  });
}

const spriteAliases: Record<string, string> = {
  brock: 'brock', misty: 'misty', sabrina: 'sabrina', blaine: 'blaine_in_disguise',
  blue: 'gary_oak', 'hoenn-tate-liza': 'leader_tate',
  'hoenn-sidney': 'elite_four_sidney', 'hoenn-phoebe': 'elite_four_phoebe', 'hoenn-glacia': 'elite_four_glacia',
  'hoenn-drake': 'elite_four_drake', 'hoenn-steven': 'steven', 'sinnoh-cynthia': 'cynthia',
};

export const circuits = catalog.regions.flatMap(({ circuits }) => circuits);
type Circuit = (typeof circuits)[number];

function gymSprite(slug: string) {
  const name = slug.replace(/^(johto|hoenn|sinnoh|unova[12]|kalos|alola|galar|paldea)-/, '');
  return [spriteAliases[slug], name, `leader_${name}`].flatMap((id) => {
    const sprite = id && getTrainerSprite(`player_${id}`);
    return sprite ? [sprite.id] : [];
  })[0];
}

export function gymOpponents(circuit: Circuit, defeated: readonly string[], average?: number): Opponent[] {
  const gymsDone = circuit.gyms.every((entry) => defeated.includes(entry.slug));
  const elite = gymsDone ? circuit.elite.filter((_, i) => circuit.elite.slice(0, i).every((entry) => defeated.includes(entry.slug))) : [];
  const champions = gymsDone && circuit.elite.every((entry) => defeated.includes(entry.slug)) ? [circuit.champion] : [];
  return [...circuit.gyms, ...elite, ...champions].map((entry) => {
    const gym = circuit.gyms.some(({ slug }) => slug === entry.slug);
    const champion = entry.slug === circuit.champion.slug;
    const rand = seeded(entry.level * 347 + entry.team[0]!);
    // Novo Jogo+: sem teto de nível; o líder usa a média da equipe (a Elite e o campeão, um pouco acima).
    const level = average === undefined ? entry.level
      : scaledLevel(average, champion ? scaleOffsets.champion : gym ? scaleOffsets.gym : scaleOffsets.elite);
    return {
      id: entry.slug, mode: 'ginasios', name: entry.name, sprite: gymSprite(entry.slug),
      partnerSprite: entry.slug === 'hoenn-tate-liza' ? 'player_leader_liza' : undefined,
      title: gym ? circuit.gymLabel : champion ? 'Campeonato regional' : circuit.eliteLabel,
      team: entry.team.filter((id) => getBattleSpecies(id)).map((id, index) => encounter(`${entry.slug}:${index}`, id, level, rand)),
      skill: champion ? 3 : 2, reward: entry.team.length * level * 10,
      cap: average === undefined ? entry.level : undefined, circuit: circuit.id, gym, champion,
    };
  });
}

export function circuitUnlocked(circuit: Circuit, defeated: readonly string[]) {
  const index = circuits.indexOf(circuit);
  return index === 0 || defeated.includes(circuits[index - 1]!.champion.slug);
}

export const tournamentRounds = 8;
export const tiers = [
  { id: 'muito-facil', name: 'Muito Fácil', min: 2, cap: 10, size: 3, fee: 150, prize: 60 },
  { id: 'facil', name: 'Fácil', min: 10, cap: 30, size: 3, fee: 500, prize: 200 },
  { id: 'intermediario', name: 'Intermediário', min: 30, cap: 50, size: 4, fee: 1500, prize: 600 },
  { id: 'dificil', name: 'Difícil', min: 50, cap: 70, size: 5, fee: 4000, prize: 1600 },
  { id: 'muito-dificil', name: 'Muito Difícil', min: 70, cap: 99, size: 6, fee: 10000, prize: 4000 },
  { id: 'copa-prime', name: 'Copa Prime', min: 100, cap: 100, size: 6, fee: 25000, prize: 10000 },
] as const;

/** Novo Jogo+: copa acima da Copa Prime, com adversários no nível médio da equipe (um pouco acima). */
export const scalingTier = { id: 'copa-evolution', name: 'Copa Evolution', size: 6, fee: 50000, prize: 20000, offset: 5 } as const;
export type Tier = (typeof tiers)[number] | typeof scalingTier;
export const availableTiers = (postGame: boolean): readonly Tier[] => (postGame ? [...tiers, scalingTier] : tiers);

function seeded(seed: number) {
  const rng = resumableRng(seed);
  return () => rng.int(1 << 24) / (1 << 24);
}

export function tournamentOpponent(run: NonNullable<GameState['progress']['challenges']['tournament']>, average?: number): Opponent | null {
  const tier: Tier | undefined = availableTiers(true).find(({ id }) => id === run.tier);
  if (!tier) return null;
  const rand = seeded(run.seed + 497 * run.round), id = `${run.tier}:${run.seed}:${run.round}`;
  const base = { id, mode: 'torneios' as const, ...npc(rand), note: `Rodada ${run.round} de ${tournamentRounds}`,
    skill: (run.round > 5 ? 3 : 2) as TrainerInfo['skill'], reward: run.round === tournamentRounds ? tier.prize : 0, tournament: run };
  if ('offset' in tier) {
    // Os Pokémon saem do grupo de nível 100 (assim a escolha não muda quando a equipe sobe de nível); só o nível acompanha a equipe.
    const level = scaledLevel(average ?? 5, tier.offset);
    return { ...base, team: randomTeam(id, tier.size, MAX_LEVEL, MAX_LEVEL, rand).map((member) => ({ ...member, level })), levelOffset: tier.offset };
  }
  return { ...base, cap: tier.cap, team: randomTeam(id, tier.size, tier.min, tier.cap, rand) };
}

export const bossCycle = (now: number) => Math.floor(now / 600_000);
export function bossesOf(cycle: number, average?: number): Opponent[] {
  const rand = seeded(cycle);
  return Array.from({ length: 6 }, (_, index) => {
    const stars = 1 + Math.floor(rand() * 6), fixed = [10, 25, 40, 60, 80, 100][stars - 1]!;
    const id = `boss:${cycle}:${index}`, drawn = randomTeam(id, 1, fixed, fixed, rand)[0]!;
    // Novo Jogo+: a espécie continua a do nível fixo, mas o nível acompanha a média da equipe (mais alto a cada estrela).
    const level = average === undefined ? fixed : scaledLevel(average, scaleOffsets.bosses[stars - 1]!);
    const pokemon = { ...drawn, level };
    return { id, mode: 'chefes' as const, name: speciesName(pokemon.species), title: 'Chefe',
      note: average === undefined ? `${stars} ★ · equipe no nível ${level} ou superior` : `${stars} ★ · nível ${level} (acompanha a sua equipe)`,
      team: [pokemon], skill: 3 as TrainerInfo['skill'], reward: stars * level * 20, cycle };
  });
}

export function completeOpponent(game: GameState, opponent: Opponent, win: boolean): GameState {
  const { progress } = game;
  const { challenges } = progress;
  const next = { ...challenges };
  const stats = { ...progress.stats };
  let badges = progress.badges;
  let cycle = progress.cycle;
  let restart = progress.restart;
  const bag = { ...progress.bag };
  if (opponent.mode === 'ginasios' && win && !challenges.defeated.includes(opponent.id)) {
    next.defeated = [...challenges.defeated, opponent.id];
    if (opponent.gym && opponent.circuit === 'kanto') badges = Math.max(badges, next.defeated.filter((id) => circuits[0]!.gyms.some((gym) => gym.slug === id)).length);
    // Todos os campeões derrotados: o jogo foi zerado. O save recomeça (`restartJourney`) quando o jogador
    // escolher o novo inicial; até lá o ciclo já conta e a tela de escolha fica aberta.
    if (!restart && circuits.every(({ champion }) => next.defeated.includes(champion.slug))) {
      cycle += 1;
      restart = true;
    }
  }
  if (opponent.mode === 'treinadores' && win) stats.trainersDefeated += 1;
  if (opponent.mode === 'chefes' && win && opponent.cycle !== undefined) {
    const previous = challenges.bosses?.cycle === opponent.cycle ? challenges.bosses.defeated : [];
    next.bosses = { cycle: opponent.cycle, defeated: [...new Set([...previous, opponent.id])] };
    bag['great-ball'] = (bag['great-ball'] ?? 0) + 1;
  }
  if (opponent.tournament) {
    const { round } = opponent.tournament;
    next.tournament = win && round < tournamentRounds ? { ...opponent.tournament, round: round + 1 } : null;
    if (win && round === tournamentRounds) {
      stats.tournamentTitles += 1;
      const item = opponent.tournament.tier === 'copa-prime' ? 'master-ball' : 'ultra-ball';
      bag[item] = (bag[item] ?? 0) + 3;
    }
  }
  const updated = { ...game, progress: { ...progress, badges, cycle, restart, bag, stats, challenges: next } };
  if (win && opponent.mode === 'treinadores') return recordMission(updated, 'trainer');
  if (win && opponent.tournament?.round === tournamentRounds) return recordMission(updated, 'cup');
  return updated;
}
