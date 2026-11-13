// Mercado Pokémon: 15 Pokémon à venda (renovam a cada hora, os fixados ficam) e venda de Pokémon da coleção.
// Mesmas regras do jogo antigo. Tudo aqui é puro: o sorteio recebe a função aleatória.
import { getWildSpecies, wildSpecies } from '@pokesim-evolution/data/wild-species';
import type { GameState, GameUpdate } from './game-state';
import { ivStars, readIvs, rollIvs, type Ivs, type Random } from './ivs';
import { addPokemon, createPokemon, createUid, pokedexTotal, removePokemon, type OwnedPokemon } from './pokemon-collection';
import { unlockedRegions } from './wild';

export const marketRefreshMs = 60 * 60 * 1000;
export const marketSize = 15;
export const marketRefreshPrice = 3_000;
/** Chance de um Pokémon do mercado ser brilhante: 1 em 4086 (a mesma do jogo antigo). */
export const marketShinyDenominator = 4086;
export const marketBasePrice = 10_000;
const minMarketStars = 2;

export type MarketEntry = { id: string; species: number; shiny: boolean; ivs: Ivs; price: number; available: boolean; favorite: boolean };
export type MarketStock = { period: number; entries: MarketEntry[] };

export const marketPeriod = (now: number) => Math.floor(now / marketRefreshMs);
export const msUntilRefresh = (now: number) => (marketPeriod(now) + 1) * marketRefreshMs - now;

export const isRegionUnlocked = (species: number) => {
  const region = getWildSpecies(species)?.region;
  return region !== undefined && unlockedRegions().includes(region);
};

/** Preço de um Pokémon do mercado: ₽ 10.000; ×2 se a região ainda está bloqueada; ×5 shiny; ×1,5 com 3★ e ×2 com 4★. */
export function marketPrice(regionUnlocked: boolean, shiny: boolean, stars: number) {
  return Math.floor(marketBasePrice * (regionUnlocked ? 1 : 2) * (shiny ? 5 : 1) * (stars === 4 ? 2 : stars === 3 ? 1.5 : 1));
}

/** Valor base de cada bola na venda (preço do jogo antigo); as demais bolas valem como a Poké Bola. */
const ballSalePrices: Record<string, number> = { 'poke-ball': 200, 'great-ball': 600, 'ultra-ball': 1200 };

export type SaleInput = { level: number; ball?: string | null; legendary: boolean; shiny: boolean; ivStars: number };

/** Valor de venda: (bola ÷ 2 + 10 por nível) × lendário (×3) × shiny (×10) × IVs (3★ ×1,5; 4★ ×2). Master Bola: 20 por nível. */
export function saleValue(input: SaleInput) {
  const ball = input.ball ?? 'poke-ball';
  const base = ball === 'master-ball' ? input.level * 20 : (ballSalePrices[ball] ?? ballSalePrices['poke-ball']!) / 2 + input.level * 10;
  const ivs = input.ivStars === 4 ? 2 : input.ivStars === 3 ? 1.5 : 1;
  return Math.floor(base * (input.legendary ? 3 : 1) * (input.shiny ? 10 : 1) * ivs);
}

export function pokemonValue(pokemon: OwnedPokemon) {
  return saleValue({
    level: pokemon.level, ball: pokemon.ball, shiny: pokemon.shiny, ivStars: ivStars(pokemon.ivs),
    legendary: Boolean(getWildSpecies(pokemon.species)?.special),
  });
}

function rollEntries(count: number, taken: ReadonlySet<number>, random: Random): MarketEntry[] {
  // Lendários e míticos ficam de fora: no jogo antigo só entravam depois da Elite dos 4, que ainda não existe aqui.
  const pool = wildSpecies.filter((species) => !species.special && !taken.has(species.id));
  const entries: MarketEntry[] = [];
  while (entries.length < count && pool.length > 0) {
    const species = pool.splice(Math.floor(random() * pool.length), 1)[0]!;
    const shiny = Math.floor(random() * marketShinyDenominator) === 0;
    let ivs = rollIvs(random);
    while (ivStars(ivs) < minMarketStars) ivs = rollIvs(random);
    entries.push({
      id: createUid(), species: species.id, shiny, ivs, available: true, favorite: false,
      price: marketPrice(isRegionUnlocked(species.id), shiny, ivStars(ivs)),
    });
  }
  return entries;
}

/** O estoque precisa ser renovado (virou a hora) ou completado? */
export function needsSync(stock: MarketStock | null, now: number) {
  return !stock || stock.period !== marketPeriod(now) || stock.entries.length < marketSize;
}

/** Estoque atual: na virada da hora só os fixados (ainda à venda) ficam; faltando Pokémon, completa. */
export function syncStock(stock: MarketStock | null, now: number, random: Random = Math.random): MarketStock {
  const period = marketPeriod(now);
  const kept = !stock ? [] : stock.period === period ? stock.entries : stock.entries.filter((entry) => entry.favorite && entry.available);
  const entries = [...kept, ...rollEntries(marketSize - kept.length, new Set(kept.map((entry) => entry.species)), random)];
  return { period, entries };
}

function withMarket(state: GameState, market: MarketStock): GameState {
  return { ...state, progress: { ...state.progress, market } };
}

/** Garante o estoque da hora ao abrir o mercado (e quando a hora vira). */
export function openMarket(now: number): GameUpdate {
  return (state) => (needsSync(state.progress.market, now) ? withMarket(state, syncStock(state.progress.market, now)) : state);
}

/** Troca o estoque (₽ 3.000); os fixados ficam. */
export function refreshMarket(now: number): GameUpdate {
  return (state) => {
    if (state.progress.money < marketRefreshPrice) return `São necessários ₽ ${marketRefreshPrice.toLocaleString('pt-BR')} para atualizar o estoque.`;
    const current = syncStock(state.progress.market, now);
    const kept = current.entries.filter((entry) => entry.favorite && entry.available);
    const entries = [...kept, ...rollEntries(marketSize - kept.length, new Set(kept.map((entry) => entry.species)), Math.random)];
    return { ...state, progress: { ...state.progress, money: state.progress.money - marketRefreshPrice, market: { period: current.period, entries } } };
  };
}

/** Fixa (ou solta) um Pokémon do estoque: ele sobrevive às renovações até ser comprado. */
export function pinEntry(id: string, favorite: boolean, now: number): GameUpdate {
  return (state) => {
    const stock = syncStock(state.progress.market, now);
    const entry = stock.entries.find((item) => item.id === id);
    if (!entry) return 'Este Pokémon não está mais no estoque.';
    if (!entry.available) return 'Um Pokémon comprado não pode ser fixado.';
    return withMarket(state, { ...stock, entries: stock.entries.map((item) => (item.id === id ? { ...item, favorite } : item)) });
  };
}

/** Compra um Pokémon do estoque: ele chega no nível 1, com os IVs mostrados, numa Poké Bola. */
export function buyEntry(id: string, now: number): GameUpdate {
  return (state) => {
    const stock = syncStock(state.progress.market, now);
    const entry = stock.entries.find((item) => item.id === id);
    if (!entry) return 'Este Pokémon não está mais no estoque. Veja as novas ofertas.';
    if (!entry.available) return 'Este Pokémon já foi comprado.';
    if (state.progress.money < entry.price) return 'Dinheiro insuficiente.';
    const collection = addPokemon(state.collection, createPokemon(entry.species, { level: 1, shiny: entry.shiny, ivs: entry.ivs, ball: 'poke-ball' }));
    if (typeof collection === 'string') return collection;
    const { progress } = state;
    return {
      ...state, collection,
      progress: {
        ...progress, money: progress.money - entry.price,
        caughtSpecies: progress.caughtSpecies.includes(entry.species) ? progress.caughtSpecies : [...progress.caughtSpecies, entry.species],
        market: { ...stock, entries: stock.entries.map((item) => (item.id === id ? { ...item, available: false, favorite: false } : item)) },
      },
    };
  };
}

/** Vende Pokémon da equipe ou do PC. Favoritos ficam, e a equipe não pode ficar vazia. */
export function sellPokemon(uids: readonly string[]): GameUpdate {
  return (state) => {
    if (uids.length === 0) return 'Escolha ao menos um Pokémon.';
    const result = removePokemon(state.collection, uids);
    if (typeof result === 'string') return result;
    if (result.removed.length === 0) return 'Remova a marca de favorito antes de vender este Pokémon.';
    const total = result.removed.reduce((sum, pokemon) => sum + pokemonValue(pokemon), 0);
    return { ...state, collection: result.collection, progress: { ...state.progress, money: state.progress.money + total } };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEntry(value: unknown): MarketEntry | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null;
  const { species, price } = value;
  if (typeof species !== 'number' || !Number.isSafeInteger(species) || species < 1 || species > pokedexTotal) return null;
  if (typeof price !== 'number' || !Number.isSafeInteger(price) || price < 0) return null;
  return {
    id: value.id, species, price, shiny: value.shiny === true, ivs: readIvs(value.ivs, value.id),
    available: value.available !== false, favorite: value.favorite === true,
  };
}

export function readMarket(value: unknown): MarketStock | null {
  if (!isRecord(value) || typeof value.period !== 'number' || !Number.isSafeInteger(value.period) || !Array.isArray(value.entries)) return null;
  const entries = value.entries.slice(0, marketSize * 2).map(readEntry).filter((entry): entry is MarketEntry => entry !== null);
  return { period: value.period, entries };
}
