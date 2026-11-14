// Selvagens: sorteio do mapa e dos Pokémon que aparecem nele. Tudo aqui é puro (o sorteio recebe a função aleatória).
import { wildMaps, wildMapIds, type WildMapId } from '@pokesim-evolution/data/wild-maps';
import { getWildSpecies, wildSpecies, type WildSpecies } from '@pokesim-evolution/data/wild-species';
import challenges from '@pokesim-evolution/data/challenges';
import { createUid } from './pokemon-collection';
import { perfectChance, perfectIvs, readIvs, rollIvs, starThresholds, type Ivs } from './ivs';

/** Quantos Pokémon aparecem ao todo em cada mapa, e quantos podem estar soltos ao mesmo tempo. */
const initialSpawns = 8;
const initialCapacity = 4;
const maximumCapacity = 15;
const maximumSpawns = maximumCapacity * 2;

export function wildPopulation(progress: { cycle: number; challenges: { defeated: readonly string[] } }) {
  const continuous = progress.cycle > 0;
  const completed = continuous ? challenges.regions.length : challenges.regions.filter(({ circuits }) =>
    circuits.every(({ champion }) => progress.challenges.defeated.includes(champion.slug))).length;
  const capacity = initialCapacity + Math.round((maximumCapacity - initialCapacity) * completed / challenges.regions.length);
  return { continuous, capacity, total: capacity * 2 };
}

export type WildPopulation = ReturnType<typeof wildPopulation>;
/** Chance de um selvagem ser brilhante (1 em 4096). */
export const shinyChance = 1 / 4096;

export type Random = () => number;
/** Um Pokémon solto no mapa. A posição não é salva: ele anda por conta própria. */
export type WildEncounter = { id: string; species: number; level: number; shiny: boolean; ivs: Ivs };
/**
 * O mapa sorteado: `pending` são os Pokémon que ainda vão aparecer; acabando todos, é preciso procurar outro mapa.
 * `minLevel`/`maxLevel` e `chosenMap` guardam a configuração da procura (`chosenMap` nulo = mapa sorteado).
 */
export type WildBoard = {
  id: string; region: number; map: WildMapId; minLevel: number; maxLevel: number; chosenMap: WildMapId | null;
  total: number; pending: number; encounters: WildEncounter[];
};
/** O que o jogador escolhe na tela de configuração antes de procurar um mapa. */
export type WildSettings = { region: number; minLevel: number; maxLevel: number; map: WildMapId | null };

export const minWildLevel = 1;
const gymLevelCaps = [16, 22, 28, 34, 40, 46, 52, 58] as const;
const baseLevelCap = 10;
const defaultMinLevel = 2;

export const MAX_WILD_LEVEL = 100;
/** "Insígnias" que valem no Novo Jogo+: tudo liberado e sem limite de nível. */
export const postGameBadges = gymLevelCaps.length + 1;

/** As insígnias que contam para as regras de selvagens: no Novo Jogo+ (jogo zerado), todas as liberações valem. */
export function wildBadges(progress: { badges: number; cycle?: number }) {
  return (progress.cycle ?? 0) > 0 ? postGameBadges : progress.badges;
}

/** Nível máximo liberado: 10 antes do primeiro ginásio e sobe a cada insígnia; depois de zerar o jogo, não há limite (100). */
export function levelCap(badges: number) {
  if (badges >= postGameBadges) return MAX_WILD_LEVEL;
  return badges <= 0 ? baseLevelCap : gymLevelCaps[Math.min(gymLevelCaps.length, badges) - 1]!;
}

/** Deixa a faixa de níveis dentro do limite liberado, com o mínimo nunca acima do máximo. */
export function clampLevels(minLevel: number, maxLevel: number, badges: number): [number, number] {
  const cap = levelCap(badges);
  const clamp = (value: number) => Math.min(cap, Math.max(minWildLevel, Math.round(Number.isFinite(value) ? value : minWildLevel)));
  const max = clamp(maxLevel);
  return [Math.min(clamp(minLevel), max), max];
}

/** Configuração inicial: do nível 2 ao máximo liberado, mapa sorteado. */
export function defaultSettings(badges: number, region = 1): WildSettings {
  const [minLevel, maxLevel] = clampLevels(defaultMinLevel, levelCap(badges), badges);
  return { region, minLevel, maxLevel, map: null };
}

export function settingsOf(board: WildBoard, badges: number): WildSettings {
  const [minLevel, maxLevel] = clampLevels(board.minLevel, board.maxLevel, badges);
  return { region: board.region, minLevel, maxLevel, map: canChooseMap() ? board.chosenMap : null };
}

/**
 * Escolher o mapa (em vez de sorteá-lo) só será possível depois de vencer o Campeão da região.
 * Essa conquista ainda não existe no jogo, então por enquanto o mapa é sempre sorteado.
 */
export function canChooseMap() {
  return false;
}

/** Regiões liberadas (por enquanto só Kanto, a geração 1). */
export function unlockedRegions(): number[] {
  return [1];
}

/** 0–1 insígnias: só o primeiro estágio; 2–4: até o segundo; 5 ou mais: todos. */
function maxStage(badges: number) {
  return badges <= 1 ? 0 : badges <= 4 ? 1 : Infinity;
}

/** Estágio de evolução = pré-evoluções que existem em regiões liberadas. */
function stageOf(species: WildSpecies, unlocked: readonly number[]) {
  return species.pre.filter((id) => {
    const pre = getWildSpecies(id);
    return pre !== undefined && unlocked.includes(pre.region);
  }).length;
}

export function eligibleSpecies(map: WildMapId, region: number, badges: number, unlocked: readonly number[] = unlockedRegions()) {
  const types = wildMaps.find((entry) => entry.id === map)!.types as readonly string[];
  const limit = maxStage(badges);
  return wildSpecies.filter((species) => !species.special && species.region === region &&
    species.types.some((type) => types.includes(type)) && stageOf(species, unlocked) <= limit);
}

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length)]!;
}

function sorteio(board: WildBoard, badges: number, random: Random, teamLevel?: number): WildEncounter | null {
  const { map, region, encounters: alive } = board;
  const pool = eligibleSpecies(map, region, badges);
  if (!pool.length) return null;

  // Prefere uma espécie que ainda não esteja solta no mapa.
  const fresh = pool.filter((species) => !alive.some((encounter) => encounter.species === species.id));
  const species = pick(fresh.length ? fresh : pool, random);
  const [low, high] = clampLevels(board.minLevel, board.maxLevel, badges);
  return {
    id: createUid(),
    species: species.id,
    level: teamLevel ?? low + Math.floor(random() * (high - low + 1)),
    shiny: random() < shinyChance,
    ivs: random() < perfectChance ? perfectIvs() : rollIvs(random),
  };
}

/** Mapas da região em que há pelo menos uma espécie possível. */
export function availableMaps(region: number, badges: number): WildMapId[] {
  return wildMapIds.filter((id) => eligibleSpecies(id as WildMapId, region, badges).length > 0) as WildMapId[];
}

/** Procura um mapa novo conforme a configuração. Sem mapa escolhido, sorteia entre os possíveis; os Pokémon aparecem aos poucos. */
export function searchMap(settings: WildSettings, badges: number, population: WildPopulation, random: Random = Math.random): WildBoard | string {
  const { region } = settings;
  if (!unlockedRegions().includes(region)) return 'Esta região ainda está bloqueada.';
  const maps = availableMaps(region, badges);
  if (!maps.length) return 'Nenhum Pokémon aparece nesta região ainda.';

  let map: WildMapId;
  if (settings.map) {
    if (!canChooseMap()) return 'Escolher o mapa só será possível depois de vencer o Campeão da região.';
    if (!maps.includes(settings.map)) return 'Nenhum Pokémon aparece neste mapa ainda.';
    map = settings.map;
  } else {
    map = pick(maps, random);
  }

  const [minLevel, maxLevel] = clampLevels(settings.minLevel, settings.maxLevel, badges);
  return {
    id: createUid(), region, map, minLevel, maxLevel, chosenMap: settings.map,
    total: population.total, pending: population.continuous ? 0 : population.total, encounters: [],
  };
}

export function pendingSpawns(board: WildBoard, population: WildPopulation) {
  return board.pending + Math.max(0, population.total - board.total);
}

export function canSpawn(board: WildBoard, population: WildPopulation) {
  return board.encounters.length < population.capacity && (population.continuous || pendingSpawns(board, population) > 0);
}

/** No Novo Jogo+, a média da equipe define o nível e cada vaga pode ser reposta indefinidamente. */
export function spawnNext(board: WildBoard, badges: number, population: WildPopulation, teamLevel?: number, random: Random = Math.random): WildBoard | null {
  if (!canSpawn(board, population)) return null;
  const encounter = sorteio(board, badges, random, teamLevel);
  if (!encounter) return null;
  return {
    ...board, total: Math.max(board.total, population.total),
    pending: population.continuous ? 0 : pendingSpawns(board, population) - 1,
    encounters: [...board.encounters, encounter],
  };
}

/** Mapa concluído: nada mais vai aparecer e não sobrou nenhum Pokémon. */
export function isCleared(board: WildBoard, population: WildPopulation) {
  return !population.continuous && pendingSpawns(board, population) === 0 && board.encounters.length === 0;
}

export function removeEncounter(board: WildBoard, id: string): WildBoard {
  return { ...board, encounters: board.encounters.filter((encounter) => encounter.id !== id) };
}

// ---------- Leitura de dados salvos ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readWild(value: unknown): WildBoard | null {
  if (!isRecord(value) || !Array.isArray(value.encounters)) return null;
  const { id, region, map, pending } = value;
  const total = typeof value.total === 'number' && Number.isSafeInteger(value.total) &&
    value.total >= initialSpawns && value.total <= maximumSpawns ? value.total : initialSpawns;
  if (typeof id !== 'string' || !id || typeof region !== 'number' || !Number.isSafeInteger(region) || region < 1 || region > 9 ||
      typeof map !== 'string' || !wildMapIds.includes(map) ||
      typeof pending !== 'number' || !Number.isSafeInteger(pending) || pending < 0 || pending > total) return null;

  const ids = new Set<string>();
  const encounters = value.encounters.flatMap((entry: unknown): WildEncounter[] => {
    if (!isRecord(entry)) return [];
    const { id: encounterId, species, level } = entry;
    if (typeof encounterId !== 'string' || !encounterId || ids.has(encounterId) || typeof species !== 'number' ||
        !getWildSpecies(species) || typeof level !== 'number' || !Number.isSafeInteger(level)) return [];
    ids.add(encounterId);
    return [{
      id: encounterId, species, level: Math.min(100, Math.max(1, level)), shiny: entry.shiny === true,
      ivs: readIvs(entry.ivs, encounterId),
    }];
  }).slice(0, maximumCapacity);

  // Mapas salvos antes da configuração não guardam os níveis: valem do 2 ao máximo liberado (ajustado ao sortear).
  const whole = (entry: unknown, fallback: number) =>
    typeof entry === 'number' && Number.isSafeInteger(entry) && entry >= 1 && entry <= 100 ? entry : fallback;
  const chosenMap = typeof value.chosenMap === 'string' && wildMapIds.includes(value.chosenMap) ? value.chosenMap as WildMapId : null;
  return {
    id, region, map: map as WildMapId, minLevel: whole(value.minLevel, defaultMinLevel), maxLevel: whole(value.maxLevel, 100),
    chosenMap, total, pending, encounters,
  };
}

// ---------- Chances (para mostrar na configuração) ----------

let naturalStarOdds: number[] | null = null;

/** Chance natural de cada nível de estrela (índice 0–4) só com IVs sorteados; 4★ natural é praticamente impossível. */
export function starOdds(): number[] {
  if (naturalStarOdds) return naturalStarOdds;
  // Distribuição da soma de seis IVs (0–31) por convolução.
  let sums = [1];
  for (let step = 0; step < 6; step += 1) {
    const next = new Array<number>(sums.length + 31).fill(0);
    sums.forEach((count, total) => { for (let iv = 0; iv <= 31; iv += 1) next[total + iv]! += count; });
    sums = next;
  }
  const all = 32 ** 6;
  const atLeast = (minimum: number) => sums.slice(minimum).reduce((sum, count) => sum + count, 0) / all;
  const reached = [1, ...starThresholds.map(atLeast)];
  naturalStarOdds = reached.map((value, stars) => value - (reached[stars + 1] ?? 0));
  return naturalStarOdds;
}

/** Chance de um selvagem sair com pelo menos `stars` estrelas, contando os IVs perfeitos garantidos. */
export function chanceOfStars(stars: 3 | 4) {
  const odds = starOdds();
  const natural = stars === 3 ? odds[3]! + odds[4]! : odds[4]!;
  return perfectChance + (1 - perfectChance) * natural;
}

