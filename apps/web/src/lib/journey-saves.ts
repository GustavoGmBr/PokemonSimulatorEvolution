import { defaultTrainerSprite, getTrainerSprite, isTrainerGender, type TrainerGender } from './trainer-sprites';
import { readWild, type WildBoard } from './wild';
import { newCollection, pokedexTotal, readCollection, type Collection } from './pokemon-collection';
import { readMarket, type MarketStock } from './market';
import { readCasinoRound, type CasinoRound } from './casino';
import type { MissionState } from './missions';

export { pokedexTotal };

/** Os iniciais de cada geração (planta, fogo e água), com o número na Pokédex Nacional. */
export const starterGenerations = [
  { generation: 1, region: 'Kanto', starters: [['Bulbasaur', 1], ['Charmander', 4], ['Squirtle', 7]] },
  { generation: 2, region: 'Johto', starters: [['Chikorita', 152], ['Cyndaquil', 155], ['Totodile', 158]] },
  { generation: 3, region: 'Hoenn', starters: [['Treecko', 252], ['Torchic', 255], ['Mudkip', 258]] },
  { generation: 4, region: 'Sinnoh', starters: [['Turtwig', 387], ['Chimchar', 390], ['Piplup', 393]] },
  { generation: 5, region: 'Unova', starters: [['Snivy', 495], ['Tepig', 498], ['Oshawott', 501]] },
  { generation: 6, region: 'Kalos', starters: [['Chespin', 650], ['Fennekin', 653], ['Froakie', 656]] },
  { generation: 7, region: 'Alola', starters: [['Rowlet', 722], ['Litten', 725], ['Popplio', 728]] },
  { generation: 8, region: 'Galar', starters: [['Grookey', 810], ['Scorbunny', 813], ['Sobble', 816]] },
  { generation: 9, region: 'Paldea', starters: [['Sprigatito', 906], ['Fuecoco', 909], ['Quaxly', 912]] },
] as const;
type StarterEntry = (typeof starterGenerations)[number]['starters'][number];
export type Starter = StarterEntry[0];
const starterEntries = starterGenerations.flatMap(({ starters }) => starters as readonly (readonly [Starter, number])[]);
export const starterNames: readonly Starter[] = starterEntries.map(([name]) => name);
export const starterSpeciesIds = Object.fromEntries(starterEntries) as Record<Starter, number>;
/** Modo de jogo, escolhido ao criar a jornada e fixo depois. */
export type GameMode = 'normal' | 'permadeath';
export const gameModes: readonly { id: GameMode; label: string; description: string }[] = [
  { id: 'normal', label: 'Normal', description: 'Pokémon derrotados se recuperam ao fim da batalha.' },
  { id: 'permadeath', label: 'Morte permanente', description: 'Todo Pokémon derrotado é apagado para sempre. Sem nenhum Pokémon, o save é excluído.' },
];
export type JourneyDraft = { trainer: string; starter: Starter; trainerSprite: string; gender: TrainerGender };
export type ChallengeProgress = {
  defeated: string[];
  tournament: { tier: string; round: number; seed: number } | null;
  bosses: { cycle: number; defeated: string[] } | null;
};
export type JourneyStats = {
  wins: number; losses: number; captures: number; shinies: number; trainersDefeated: number; tournamentTitles: number;
};
/** Mochila: quantidade de cada item (pelo nome do item, ex.: `poke-ball`). */
export type Bag = Record<string, number>;
export type JourneyProgress = {
  mode: GameMode;
  /** Quantas vezes o jogo foi zerado (todos os campeões derrotados). Acima de zero vale o Novo Jogo+. */
  cycle: number;
  /** Jogo zerado: o save recomeça assim que o jogador escolher o novo inicial (`restartJourney`). */
  restart: boolean;
  money: number;
  bag: Bag;
  casinoChips: number;
  badges: number;
  caughtSpecies: number[];
  playSeconds: number;
  createdAt: string | null;
  stats: JourneyStats;
  /** Estoque do Mercado Pokémon; nulo até a primeira visita. */
  market: MarketStock | null;
  challenges: ChallengeProgress;
  missions?: MissionState;
  lineups?: { id: string; name: string; uids: string[] }[];
  casinoRound?: CasinoRound;
};
export type ImportedJourney = JourneyDraft & { progress?: JourneyProgress; collection?: Collection; wild?: WildBoard | null; mode?: GameMode };
export type JourneySave = JourneyDraft & { id: string; progress: JourneyProgress; collection: Collection; wild: WildBoard | null };

export const totalBadges = 8;
export const startingMoney = 3000;
/** O que o treinador leva na mochila ao começar a jornada. */
export const startingBag: Bag = { 'poke-ball': 10, potion: 5, antidote: 2, revive: 1 };

export function newProgress(starter: Starter, createdAt: string | null = new Date().toISOString(), mode: GameMode = 'normal'): JourneyProgress {
  return {
    mode,
    cycle: 0,
    restart: false,
    money: startingMoney,
    bag: { ...startingBag },
    casinoChips: 0,
    badges: 0,
    caughtSpecies: [starterSpeciesIds[starter]],
    playSeconds: 0,
    createdAt,
    stats: { wins: 0, losses: 0, captures: 1, shinies: 0, trainersDefeated: 0, tournamentTitles: 0 },
    market: null,
    challenges: { defeated: [], tournament: null, bosses: null },
  };
}

export const savesKey = 'pokesim-evolution:journey-saves';
const legacyKey = 'pokesim-evolution:journey-draft';
const format = 'pokemon-simulator-evolution';
const version = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDraft(value: unknown): JourneyDraft | null {
  if (!isRecord(value) || typeof value.trainer !== 'string') return null;

  const trainer = value.trainer.trim();
  const starter = starterNames.find((name) => name === value.starter);
  if (!trainer || trainer.length > 24 || !starter) return null;

  const trainerSprite = value.trainerSprite ?? defaultTrainerSprite;
  if (typeof trainerSprite !== 'string' || !getTrainerSprite(trainerSprite)) return null;

  const gender = isTrainerGender(value.gender) ? value.gender : getTrainerSprite(trainerSprite)?.gender ?? 'male';
  return { trainer, starter, trainerSprite, gender };
}

/** Lê a mochila salva; saves de antes da mochila existir começam com os itens iniciais. */
function readBag(value: unknown): Bag {
  if (!isRecord(value)) return { ...startingBag };
  const bag: Bag = {};
  for (const [item, quantity] of Object.entries(value)) {
    if (typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity > 0) bag[item] = Math.min(quantity, 999);
  }
  return bag;
}

function readCount(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

// Saves antigos não têm progresso: os campos ausentes assumem os valores iniciais.
function readProgress(value: unknown, starter: Starter): JourneyProgress {
  const base = newProgress(starter, null);
  if (!isRecord(value)) return base;

  const stats = isRecord(value.stats) ? value.stats : {};
  const species = Array.isArray(value.caughtSpecies)
    ? [...new Set(value.caughtSpecies.filter((id): id is number => Number.isSafeInteger(id) && id > 0))]
    : base.caughtSpecies;
  const createdAt = typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt))
    ? value.createdAt : null;

  return {
    mode: value.mode === 'permadeath' ? 'permadeath' : 'normal',
    cycle: Math.min(readCount(value.cycle, 0), 999),
    restart: value.restart === true,
    money: readCount(value.money, base.money),
    bag: readBag(value.bag),
    casinoChips: readCount(value.casinoChips, base.casinoChips),
    badges: Math.min(readCount(value.badges, base.badges), totalBadges),
    caughtSpecies: species,
    playSeconds: readCount(value.playSeconds, base.playSeconds),
    createdAt,
    stats: {
      wins: readCount(stats.wins, 0),
      losses: readCount(stats.losses, 0),
      captures: readCount(stats.captures, base.stats.captures),
      shinies: readCount(stats.shinies, 0),
      trainersDefeated: readCount(stats.trainersDefeated, 0),
      tournamentTitles: readCount(stats.tournamentTitles, 0),
    },
    market: readMarket(value.market),
    challenges: readChallengeProgress(value.challenges),
    missions: readMissions(value.missions),
    lineups: Array.isArray(value.lineups) ? value.lineups.slice(0, 20).flatMap((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string' || !entry.name.trim() || !Array.isArray(entry.uids)) return [];
      const uids = [...new Set(entry.uids.filter((uid): uid is string => typeof uid === 'string'))].slice(0, 6);
      return uids.length ? [{ id: entry.id, name: entry.name.trim().slice(0, 24), uids }] : [];
    }) : undefined,
    casinoRound: readCasinoRound(value.casinoRound),
  };
}

function readMissions(value: unknown): MissionState | undefined {
  if (!isRecord(value) || typeof value.period !== 'number' || !Number.isSafeInteger(value.period)) return;
  const integers = (data: unknown, max: number) => Array.isArray(data)
    ? [...new Set(data.filter((n): n is number => Number.isSafeInteger(n) && n >= 0 && n <= max))] : [];
  return { period: value.period, captures: integers(value.captures, pokedexTotal), claimed: integers(value.claimed, 10),
    wild: readCount(value.wild, 0), trainer: readCount(value.trainer, 0), cup: readCount(value.cup, 0) };
}

function readChallengeProgress(value: unknown): ChallengeProgress {
  const ids = (input: unknown) => Array.isArray(input) ? [...new Set(input.filter((id): id is string => typeof id === 'string'))] : [];
  const data = isRecord(value) ? value : {};
  const run = isRecord(data.tournament) ? data.tournament : {};
  const bosses = isRecord(data.bosses) ? data.bosses : {};
  return {
    defeated: ids(data.defeated),
    tournament: typeof run.tier === 'string' && typeof run.round === 'number' && Number.isInteger(run.round) && run.round >= 1 && run.round <= 8 &&
      typeof run.seed === 'number' && Number.isSafeInteger(run.seed) ? { tier: run.tier, round: run.round, seed: run.seed } : null,
    bosses: typeof bosses.cycle === 'number' && Number.isSafeInteger(bosses.cycle)
      ? { cycle: bosses.cycle, defeated: ids(bosses.defeated) } : null,
  };
}

export function loadSaves(storage: Storage): JourneySave[] {
  const raw = storage.getItem(savesKey);
  if (raw === null) {
    const legacy = storage.getItem(legacyKey);
    const draft = legacy === null ? null : readDraft(JSON.parse(legacy));
    return draft ? [{
      id: 'legacy-draft', ...draft, progress: newProgress(draft.starter, null),
      collection: newCollection(starterSpeciesIds[draft.starter]), wild: null,
    }] : [];
  }

  const data: unknown = JSON.parse(raw);
  if (!isRecord(data) || data.version !== version || !Array.isArray(data.saves)) {
    throw new Error('Formato de armazenamento desconhecido.');
  }

  const ids = new Set<string>();
  return data.saves.map((entry: unknown) => {
    const draft = readDraft(entry);
    if (!draft || !isRecord(entry) || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) {
      throw new Error('O armazenamento contém um save inválido.');
    }
    ids.add(entry.id);
    return {
      id: entry.id, ...draft,
      progress: readProgress(entry.progress, draft.starter),
      collection: readCollection(entry.collection, starterSpeciesIds[draft.starter]),
      wild: readWild(entry.wild),
    };
  });
}

export async function updateSaves(change: (current: JourneySave[]) => JourneySave[]) {
  const write = () => {
    const saves = change(loadSaves(localStorage));
    localStorage.setItem(savesKey, JSON.stringify({ version, saves }));
    return saves;
  };

  return navigator.locks ? navigator.locks.request(savesKey, write) : write();
}

export function createSave({ progress, collection, wild, mode, ...draft }: ImportedJourney): JourneySave {
  const random = crypto.getRandomValues(new Uint32Array(4));
  const id = Array.from(random, (part) => part.toString(16).padStart(8, '0')).join('');
  return {
    id, ...draft,
    progress: progress ?? newProgress(draft.starter, undefined, mode),
    collection: collection ?? newCollection(starterSpeciesIds[draft.starter]),
    wild: wild ?? null,
  };
}

/**
 * Novo Jogo+: recomeça a jornada do zero com o inicial escolhido. Fica só o que é do treinador e do save:
 * nome, aparência, modo de jogo, tempo de jogo, data de criação e quantas vezes o jogo foi zerado.
 */
export function restartJourney(state: { progress: JourneyProgress }, starter: Starter) {
  const { progress } = state;
  return {
    progress: { ...newProgress(starter, progress.createdAt, progress.mode), cycle: progress.cycle, playSeconds: progress.playSeconds },
    collection: newCollection(starterSpeciesIds[starter]),
    wild: null,
  };
}

/** Apaga o save do navegador (a Morte Permanente usa isto quando não sobra nenhum Pokémon). */
export async function deleteSave(id: string) {
  await updateSaves((current) => current.filter((save) => save.id !== id));
}

// Grava o que muda durante o jogo, preservando o tempo jogado que outra parte da tela possa ter gravado.
export async function saveGameState(id: string, state: { progress: JourneyProgress; collection: Collection; wild: WildBoard | null }) {
  await updateSaves((current) => current.map((save) => save.id !== id ? save : {
    ...save,
    collection: state.collection,
    wild: state.wild,
    progress: {
      ...state.progress,
      playSeconds: save.progress.playSeconds,
      createdAt: save.progress.createdAt ?? state.progress.createdAt,
    },
  }));
}

// Soma o tempo jogado ao save; o primeiro registro de um save antigo também define a data de início.
export async function savePlaySeconds(id: string, playSeconds: number) {
  await updateSaves((current) => current.map((save) => save.id !== id ? save : {
    ...save,
    progress: {
      ...save.progress,
      playSeconds: Math.max(save.progress.playSeconds, playSeconds),
      createdAt: save.progress.createdAt ?? new Date().toISOString(),
    },
  }));
}

export function readSaveBackup(raw: string): ImportedJourney[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('O arquivo precisa conter JSON válido.');
  }
  if (!isRecord(data) || data.format !== format || data.version !== version ||
      !Array.isArray(data.saves) || data.saves.length === 0) {
    throw new Error('Selecione um backup exportado pelo Pokémon Simulator Evolution.');
  }

  return data.saves.map((entry: unknown) => {
    const draft = readDraft(entry);
    if (!draft) throw new Error('O backup contém uma jornada inválida.');
    if (!isRecord(entry)) return draft;
    return {
      ...draft,
      ...(isRecord(entry.progress) && { progress: readProgress(entry.progress, draft.starter) }),
      ...(isRecord(entry.collection) && { collection: readCollection(entry.collection, starterSpeciesIds[draft.starter]) }),
      ...(isRecord(entry.wild) && { wild: readWild(entry.wild) }),
    };
  });
}

export function downloadSaveBackup(saves: JourneySave[], filename: string) {
  const drafts = saves.map(({ id: _id, ...draft }) => draft);
  const contents = JSON.stringify({ format, version, saves: drafts }, null, 2);
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
