/**
 * Regras puras das missões (sem acesso ao jogo): faixas de renovação, geração das metas por progresso do jogador,
 * contagem de eventos, conquistas de longo prazo e leitura segura do que vem do save.
 */

export const tiers = ['quick', 'daily', 'weekly'] as const;
export type Tier = (typeof tiers)[number];
export const tierLabels: Record<Tier, string> = { quick: 'Rápidas', daily: 'Diárias', weekly: 'Semanais' };

export const missionKinds = ['defeat', 'catch', 'trainer', 'cup', 'boss', 'evolve', 'horde', 'area'] as const;
export type MissionKind = (typeof missionKinds)[number];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const quickDuration = 2 * HOUR;

/**
 * Índice do período de cada faixa. As rápidas duram 2 horas; as diárias viram à meia-noite e as semanais na segunda,
 * no horário do jogador (`offset` = minutos de `Date#getTimezoneOffset`, UTC menos local).
 */
export function tierPeriod(tier: Tier, now: number, offset = 0) {
  if (tier === 'quick') return Math.floor(now / quickDuration);
  const day = Math.floor((now - offset * 60_000) / DAY);
  return tier === 'daily' ? day : Math.floor((day + 3) / 7);
}

/** Instante (em ms) em que o período termina e as metas são renovadas. */
export function tierEnd(tier: Tier, period: number, offset = 0) {
  if (tier === 'quick') return (period + 1) * quickDuration;
  return (tier === 'daily' ? period + 1 : period * 7 + 4) * DAY + offset * 60_000;
}

export type Filter = { type?: string; species?: number; region?: number; shiny?: true; stars?: number };
export type Reward = { money: number; chips: number; items: [string, number][] };
export type Goal = { kind: MissionKind; filter?: Filter; distinct?: true; target: number; reward: Reward };
export type Board = { period: number; goals: Goal[]; counts: number[]; seen: number[][]; claimed: number[]; bonus: Reward };
export type Lifetime = { counts: Record<string, number>; claimed: Record<string, number> };
export type MissionState = { quick?: Board; daily?: Board; weekly?: Board; lifetime: Lifetime };

/** Algo que aconteceu no jogo e pode contar para uma meta. */
export type MissionEvent = {
  kind: MissionKind; species?: number; types?: readonly string[]; region?: number; shiny?: boolean; stars?: number; amount?: number;
};
/** Espécie que pode aparecer agora no mapa (a base para sortear tipos, espécies e gerações). */
export type PoolEntry = { id: number; types: readonly string[]; region: number };
/** O que o jogo informa sobre o jogador: `progress` = insígnias + gerações concluídas; `charm` = tem o Amuleto de Horda. */
export type Profile = { progress: number; charm: boolean; pool: readonly PoolEntry[] };

export const emptyLifetime = (): Lifetime => ({ counts: {}, claimed: {} });
export const emptyMissionState = (): MissionState => ({ lifetime: emptyLifetime() });

export function matches(goal: { kind: MissionKind; filter?: Filter }, event: MissionEvent) {
  if (goal.kind !== event.kind) return false;
  const filter = goal.filter;
  if (!filter) return true;
  return (filter.type === undefined || !!event.types?.includes(filter.type))
    && (filter.species === undefined || event.species === filter.species)
    && (filter.region === undefined || event.region === filter.region)
    && (!filter.shiny || !!event.shiny)
    && (filter.stars === undefined || (event.stars ?? 0) >= filter.stars);
}

export function applyEvent(board: Board, event: MissionEvent): Board {
  let changed = false;
  const counts = [...board.counts];
  const seen = [...board.seen];
  board.goals.forEach((goal, index) => {
    if (!matches(goal, event) || counts[index]! >= goal.target) return;
    if (goal.distinct) {
      if (event.species === undefined || seen[index]!.includes(event.species)) return;
      seen[index] = [...seen[index]!, event.species];
      counts[index] = seen[index]!.length;
    } else counts[index] = Math.min(goal.target, counts[index]! + (event.amount ?? 1));
    changed = true;
  });
  return changed ? { ...board, counts, seen } : board;
}

export const goalDone = (board: Board, index: number) => (board.counts[index] ?? 0) >= (board.goals[index]?.target ?? Infinity);
export const boardDone = (board: Board) => board.goals.every((_, index) => board.claimed.includes(index));

// ---------- geração ----------

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Template = { kind: MissionKind; base: number; grow?: number; distinct?: true; pick?: 'type' | 'species'; stars?: number };

/** A ordem vai do mais fácil ao mais difícil: o prêmio cresce junto. */
const slots: Record<Tier, (charm: boolean) => Template[]> = {
  quick: (charm) => [
    { kind: 'defeat', base: 3 }, { kind: 'catch', base: 2, distinct: true }, { kind: 'defeat', base: 5 },
    { kind: 'defeat', base: 3, pick: 'type' }, { kind: 'catch', base: 1, pick: 'type' }, { kind: 'trainer', base: 1 },
    { kind: 'defeat', base: 1, pick: 'species', grow: 0.04 }, { kind: 'trainer', base: 2 },
    charm ? { kind: 'horde', base: 1, grow: 0.05 } : { kind: 'catch', base: 3 },
    { kind: 'cup', base: 1, grow: 0 },
  ],
  daily: (charm) => [
    { kind: 'defeat', base: 8 }, { kind: 'catch', base: 3 }, { kind: 'defeat', base: 5, pick: 'type' }, { kind: 'catch', base: 2, pick: 'type' },
    { kind: 'trainer', base: 2 }, { kind: 'defeat', base: 14 }, { kind: 'catch', base: 2, grow: 0.04, stars: 1 },
    { kind: 'defeat', base: 8, pick: 'type' }, { kind: 'catch', base: 5, distinct: true }, { kind: 'catch', base: 3, pick: 'type' },
    { kind: 'defeat', base: 2, pick: 'species', grow: 0.04 }, { kind: 'trainer', base: 5 }, { kind: 'catch', base: 1, pick: 'species', grow: 0.02 },
    ...(charm ? [{ kind: 'horde' as const, base: 3, grow: 0.06 }, { kind: 'area' as const, base: 15, grow: 0.1 }] : [{ kind: 'cup' as const, base: 1, grow: 0 }]),
  ],
  weekly: (charm) => [
    { kind: 'defeat', base: 40 }, { kind: 'catch', base: 8, distinct: true }, { kind: 'defeat', base: 15, pick: 'type' }, { kind: 'catch', base: 5, pick: 'type' },
    { kind: 'trainer', base: 8 }, { kind: 'defeat', base: 60 }, { kind: 'catch', base: 20 }, { kind: 'evolve', base: 2, grow: 0.03 },
    { kind: 'defeat', base: 25, pick: 'type' }, { kind: 'catch', base: 8, pick: 'type' }, { kind: 'catch', base: 12, distinct: true },
    { kind: 'trainer', base: 15 }, { kind: 'catch', base: 2, grow: 0.03, stars: 2 }, { kind: 'catch', base: 2, pick: 'species', grow: 0.02 },
    { kind: 'defeat', base: 5, pick: 'species', grow: 0.04 }, { kind: 'evolve', base: 4, grow: 0.03 }, { kind: 'cup', base: 2, grow: 0 },
    { kind: 'boss', base: 2, grow: 0.03 },
    ...(charm ? [{ kind: 'horde' as const, base: 8, grow: 0.08 }, { kind: 'horde' as const, base: 20, grow: 0.08 },
      { kind: 'area' as const, base: 40, grow: 0.1 }, { kind: 'area' as const, base: 120, grow: 0.1 }] : []),
  ],
};

const essences = ['iv-hp', 'iv-attack', 'iv-defense', 'iv-special-attack', 'iv-special-defense', 'iv-speed'] as const;
const candyFor = (progress: number) => progress < 3 ? 'exp-candy-p' : progress < 8 ? 'exp-candy-m' : progress < 14 ? 'exp-candy-g' : 'exp-candy-gg';
const ballFor = (progress: number) => progress >= 5 ? 'ultra-ball' : 'great-ball';
/** Quanto os prêmios em dinheiro e fichas crescem com o progresso (insígnias + gerações). */
export const rewardGrowth = (progress: number) => 1 + progress * 0.25;
const scale = (value: number, progress: number) => Math.round(value * rewardGrowth(progress));

function slotReward(tier: Tier, slot: number, kind: MissionKind, progress: number, random: () => number): Reward {
  const thing = kind === 'catch' || kind === 'trainer' ? ballFor(progress) : candyFor(progress);
  if (tier === 'quick') {
    return { money: scale(100 + 50 * slot, progress), chips: scale(50 + 25 * slot, progress), items: [[thing, 1], [essences[slot % 6]!, 1]] };
  }
  const essence = essences[Math.floor(random() * 6)]!;
  if (tier === 'daily') {
    const items: [string, number][] = [[thing, 2], [essence, 1]];
    if (slot >= 6) items.push(['rare-candy', 1]);
    return { money: scale(1200 + 400 * slot, progress), chips: scale(600 + 200 * slot, progress), items };
  }
  return { money: scale(8000 + 2000 * slot, progress), chips: scale(4000 + 1000 * slot, progress),
    items: [[thing, 3], [essence, 2], ['rare-candy', slot >= 9 ? 2 : 1]] };
}

/** O bônus de completar a faixa dá só dinheiro e itens (sem fichas de cassino). */
function bonusReward(tier: Tier, progress: number, random: () => number): Reward {
  const essence = essences[Math.floor(random() * 6)]!;
  const ball = ballFor(progress);
  if (tier === 'quick') return { money: scale(4000, progress), chips: 0, items: [['rare-candy', 1], [ball, 2]] };
  if (tier === 'daily') return { money: scale(25000, progress), chips: 0, items: [['rare-candy', 4], [essence, 3], [ball, 5]] };
  const second = essences[(essences.indexOf(essence) + 1 + Math.floor(random() * 5)) % 6]!;
  return { money: scale(140000, progress), chips: 0, items: [['rare-candy', 12], [essence, 4], [second, 3], [ball, 10], ['max-revive', 3]] };
}

const seedOf = (tier: Tier, period: number) => (Math.imul(period | 0, 2654435761) ^ (tiers.indexOf(tier) + 1) * 40503) >>> 0;

/** Sorteia as metas de um período (mesmo período e mesmo perfil dão sempre o mesmo resultado). */
export function generateBoard(tier: Tier, period: number, profile: Profile): Board {
  const random = seeded(seedOf(tier, period));
  const { progress, pool } = profile;
  const types = [...new Set(pool.flatMap((entry) => entry.types))];
  const regions = [...new Set(pool.map((entry) => entry.region))];
  const used = new Set<string>();
  const goals = slots[tier](profile.charm).map((template, slot): Goal => {
    const grow = template.grow ?? 0.1;
    const target = Math.max(1, Math.round(template.base * (1 + progress * grow)));
    let filter: Filter | undefined = template.stars ? { stars: template.stars } : undefined;
    if (template.pick) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        let candidate: Filter | undefined;
        if (template.pick === 'species' && pool.length) candidate = { species: pool[Math.floor(random() * pool.length)]!.id };
        else if (template.pick === 'type' && regions.length > 1 && random() < 0.34) candidate = { region: regions[Math.floor(random() * regions.length)]! };
        else if (template.pick === 'type' && types.length) candidate = { type: types[Math.floor(random() * types.length)]! };
        if (!candidate) break;
        const key = `${template.kind}:${JSON.stringify(candidate)}`;
        if (used.has(key)) continue;
        used.add(key);
        filter = candidate;
        break;
      }
    }
    return { kind: template.kind, ...(filter ? { filter } : {}), ...(template.distinct ? { distinct: true as const } : {}), target,
      reward: slotReward(tier, slot, template.kind, progress, random) };
  });
  return { period, goals, counts: goals.map(() => 0), seen: goals.map(() => []), claimed: [], bonus: bonusReward(tier, progress, random) };
}

// ---------- descrição ----------

export type Names = { type(id: string): string; species(id: number): string; region(id: number): string };

export function describeGoal(goal: { kind: MissionKind; filter?: Filter; distinct?: true; target: number }, names: Names) {
  const { filter, target } = goal;
  const of = filter?.type ? ` do tipo ${names.type(filter.type)}` : filter?.region !== undefined ? ` de ${names.region(filter.region)}` : '';
  const times = target === 1 ? '' : ` ${target} vezes`;
  switch (goal.kind) {
    case 'defeat':
      return filter?.species !== undefined ? `Derrote ${names.species(filter.species)} selvagem${times}` : `Derrote ${target} Pokémon selvagens${of}`;
    case 'catch':
      if (filter?.species !== undefined) return `Capture ${names.species(filter.species)}${times}`;
      if (filter?.shiny) return `Capture ${target} Pokémon brilhantes`;
      if (filter?.stars) return `Capture ${target} Pokémon com ${filter.stars}★ ou mais nos IVs`;
      return goal.distinct ? `Capture ${target} espécies diferentes` : `Capture ${target} Pokémon${of}`;
    case 'trainer': return `Vença ${target} ${target === 1 ? 'treinador aleatório' : 'treinadores aleatórios'}`;
    case 'cup': return `Vença ${target} ${target === 1 ? 'torneio' : 'torneios'}`;
    case 'boss': return `Derrote ${target} ${target === 1 ? 'chefe' : 'chefes'}`;
    case 'evolve': return `Evolua ${target} Pokémon`;
    case 'horde': return `Vença ${target} ${target === 1 ? 'horda' : 'hordas'}`;
    case 'area': return `Use golpes em área ${target} ${target === 1 ? 'vez' : 'vezes'}`;
  }
}

// ---------- conquistas (longo prazo) ----------

export type Achievement = {
  id: string; label: string; kind?: MissionKind; filter?: Filter; derived?: 'dex' | 'types'; levels: readonly number[];
};

export const achievements: readonly Achievement[] = [
  { id: 'defeat', label: 'Derrotar Pokémon selvagens', kind: 'defeat', levels: [25, 100, 300, 750, 2000] },
  { id: 'catch', label: 'Capturar Pokémon', kind: 'catch', levels: [10, 50, 150, 400, 1000] },
  { id: 'shiny', label: 'Capturar Pokémon brilhantes', kind: 'catch', filter: { shiny: true }, levels: [1, 3, 10, 25, 50] },
  { id: 'stars2', label: 'Capturar Pokémon com 2★ ou mais nos IVs', kind: 'catch', filter: { stars: 2 }, levels: [1, 5, 20, 60, 150] },
  { id: 'stars3', label: 'Capturar Pokémon com 3★ nos IVs', kind: 'catch', filter: { stars: 3 }, levels: [1, 3, 10, 25, 50] },
  { id: 'evolve', label: 'Evoluir Pokémon', kind: 'evolve', levels: [1, 5, 15, 40, 100] },
  { id: 'trainer', label: 'Vencer treinadores aleatórios', kind: 'trainer', levels: [5, 25, 75, 200, 500] },
  { id: 'cup', label: 'Vencer torneios', kind: 'cup', levels: [1, 3, 10, 25, 60] },
  { id: 'boss', label: 'Derrotar chefes', kind: 'boss', levels: [1, 5, 15, 40, 100] },
  { id: 'horde', label: 'Vencer hordas', kind: 'horde', levels: [1, 10, 40, 120, 300] },
  { id: 'area', label: 'Usar golpes em área', kind: 'area', levels: [10, 50, 200, 600, 1500] },
  { id: 'dex', label: 'Espécies na Pokédex', derived: 'dex', levels: [10, 25, 50, 100, 150, 250, 400, 600] },
  { id: 'types', label: 'Tipos diferentes capturados', derived: 'types', levels: [3, 6, 10, 14, 18] },
];

export type Derived = { dex: number; types: number };

export function achievementValue(achievement: Achievement, lifetime: Lifetime, derived: Derived) {
  return achievement.derived ? derived[achievement.derived] : lifetime.counts[achievement.id] ?? 0;
}

export function applyLifetime(lifetime: Lifetime, event: MissionEvent): Lifetime {
  let counts = lifetime.counts;
  for (const achievement of achievements) {
    if (!achievement.kind || !matches({ kind: achievement.kind, filter: achievement.filter }, event)) continue;
    counts = { ...counts, [achievement.id]: (counts[achievement.id] ?? 0) + (event.amount ?? 1) };
  }
  return counts === lifetime.counts ? lifetime : { ...lifetime, counts };
}

/** Prêmio do nível `level` (0 = primeiro) da conquista de posição `position`. */
export function achievementReward(position: number, level: number): Reward {
  const step = Math.min(level, 4);
  const extra = level > 4 ? level - 3 : 1;
  const essence = essences[position % 6]!;
  const items: [string, number][][] = [
    [['exp-candy-m', 2]],
    [['exp-candy-g', 2], [essence, 1]],
    [['rare-candy', 2], [essence, 2]],
    [['rare-candy', 4], [essence, 3], ['ultra-ball', 5]],
    [['rare-candy', 8], [essence, 5], ['max-revive', 3]],
  ];
  return { money: 2000 * 3 ** step * extra, chips: 1000 * 2 ** step * extra,
    items: items[step]!.map(([name, quantity]) => [name, quantity * extra] as [string, number]) };
}

// ---------- leitura do save ----------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const itemId = /^[a-z0-9-]{1,40}$/;

function readReward(value: unknown): Reward | undefined {
  if (!isRecord(value) || !integer(value.money, 0, 1e9) || !integer(value.chips, 0, 1e9) || !Array.isArray(value.items) || value.items.length > 8) return;
  const items: [string, number][] = [];
  for (const entry of value.items) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !itemId.test(entry[0]) || !integer(entry[1], 1, 999)) return;
    items.push([entry[0], entry[1]]);
  }
  return { money: value.money, chips: value.chips, items };
}

function readFilter(value: unknown): Filter | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const filter: Filter = {};
  if (value.type !== undefined) { if (typeof value.type !== 'string' || !/^[a-z]{3,12}$/.test(value.type)) return null; filter.type = value.type; }
  if (value.species !== undefined) { if (!integer(value.species, 1, 5000)) return null; filter.species = value.species; }
  if (value.region !== undefined) { if (!integer(value.region, 1, 50)) return null; filter.region = value.region; }
  if (value.shiny !== undefined) { if (value.shiny !== true) return null; filter.shiny = true; }
  if (value.stars !== undefined) { if (!integer(value.stars, 1, 3)) return null; filter.stars = value.stars; }
  return filter;
}

function readGoal(value: unknown): Goal | undefined {
  if (!isRecord(value) || !missionKinds.includes(value.kind as MissionKind) || !integer(value.target, 1, 1e6)) return;
  const filter = readFilter(value.filter);
  const reward = readReward(value.reward);
  if (filter === null || !reward) return;
  return { kind: value.kind as MissionKind, ...(filter ? { filter } : {}), ...(value.distinct === true ? { distinct: true as const } : {}), target: value.target, reward };
}

function readBoard(value: unknown): Board | undefined {
  if (!isRecord(value) || !integer(value.period, 0, 1e9) || !Array.isArray(value.goals) || value.goals.length < 1 || value.goals.length > 16) return;
  const goals = value.goals.map(readGoal);
  if (goals.some((goal) => !goal) || !Array.isArray(value.counts) || !Array.isArray(value.seen) || !Array.isArray(value.claimed)) return;
  const valid = goals as Goal[];
  const counts = valid.map((goal, index) => {
    const count = (value.counts as unknown[])[index];
    return integer(count, 0, goal.target) ? count : 0;
  });
  const seen = valid.map((_, index) => {
    const list = (value.seen as unknown[])[index];
    return Array.isArray(list) ? [...new Set(list.filter((id): id is number => integer(id, 1, 5000)))].slice(0, 100) : [];
  });
  const claimed = [...new Set((value.claimed as unknown[]).filter((index): index is number => integer(index, 0, valid.length)))];
  const bonus = readReward(value.bonus);
  return bonus ? { period: value.period, goals: valid, counts, seen, claimed, bonus } : undefined;
}

function readLifetime(value: unknown): Lifetime {
  if (!isRecord(value)) return emptyLifetime();
  const read = (data: unknown, max: number) => Object.fromEntries(achievements.flatMap(({ id }) => {
    const amount = isRecord(data) ? data[id] : undefined;
    return integer(amount, 0, max) && amount > 0 ? [[id, amount]] : [];
  }));
  return { counts: read(value.counts, 1e9), claimed: read(value.claimed, 100) };
}

/** Lê as missões salvas; saves antigos (formato de uma faixa só) viram um quadro vazio e as metas são sorteadas de novo. */
export function readMissionState(value: unknown): MissionState | undefined {
  if (!isRecord(value)) return;
  return { quick: readBoard(value.quick), daily: readBoard(value.daily), weekly: readBoard(value.weekly), lifetime: readLifetime(value.lifetime) };
}
