// Golpes de um Pokémon do jogador: quais ele sabe, quais pode aprender (por nível ou TM), preço das TMs
// e as operações da área de golpes (ensinar, esquecer, reordenar, comprar TM). Tudo puro, como o resto da coleção.
import { battleMoves, getBattleSpecies, type Move } from '@pokesim-evolution/data/battle-data';
import type { GameState } from '../game-state';
import { updatePokemon, getAt, locate, type Collection, type OwnedPokemon, type Result } from '../pokemon-collection';
import { isUsableMove, levelUpMoves } from './pokemon';

export const maxMoves = 4;

export type LearnSource = 'level' | 'machine';
export interface Learnable {
  move: Move;
  source: LearnSource;
  /** Nível em que aprende (só `level`). */
  level: number;
  /** Preço da TM que falta comprar; 0 se é por nível ou já foi comprada. */
  price: number;
  /** Pode ser ensinado agora (por nível, ou TM já comprada). */
  owned: boolean;
  known: boolean;
}

/** Aumento de preço das TMs em relação ao jogo antigo: ×2,4 (+60% e depois +50%). */
export const tmPriceRaise = 2.4;

/** Preço da TM: a conta do jogo antigo (status ₽ 2.250; dano 25 por ponto de poder, mínimo ₽ 1.500) × 2,4: status ₽ 5.400, dano mínimo ₽ 3.600. */
export function tmPrice(move: Pick<Move, 'category' | 'power'>): number {
  const base = move.category === 'status' ? 1500 : Math.max(1000, Math.round((move.power * 25) / 100) * 100);
  // Contas inteiras (×24 ÷10) para não deixar um arredondamento de ponto flutuante somar ₽ 1.
  return Math.ceil((Math.ceil(base * 1.5) * Math.round(tmPriceRaise * 10)) / 10);
}

/** Nomes dos golpes que o Pokémon sabe, na ordem das vagas. Sem golpes salvos, valem os que a espécie aprende até o nível. */
export function currentMoves(pokemon: OwnedPokemon): string[] {
  const saved = pokemon.moves?.filter((name) => battleMoves.has(name));
  if (saved && saved.length > 0) return saved.slice(0, maxMoves);
  const species = getBattleSpecies(pokemon.species);
  return species ? levelUpMoves(species, pokemon.level, battleMoves).map((move) => move.name) : [];
}

/** Golpes que ele pode usar: os de nível já alcançados (grátis) e os de TM (`tmNames`, comprados uma vez por Pokémon). */
export function learnableMoves(pokemon: OwnedPokemon, tmNames: readonly string[]): Learnable[] {
  const species = getBattleSpecies(pokemon.species);
  if (!species) return [];
  const known = new Set(currentMoves(pokemon));
  const bought = new Set(pokemon.tms ?? []);
  const found = new Map<string, Learnable>();
  for (const [at, name] of species.learnset) {
    const move = battleMoves.get(name);
    if (!move || !isUsableMove(move) || at > pokemon.level) continue;
    const before = found.get(name);
    if (before && before.level <= at) continue;
    found.set(name, { move, source: 'level', level: at, price: 0, owned: true, known: known.has(name) });
  }
  for (const name of tmNames) {
    const move = battleMoves.get(name);
    if (!move || !isUsableMove(move) || found.has(name)) continue;
    const owned = bought.has(name);
    found.set(name, { move, source: 'machine', level: 0, price: owned ? 0 : tmPrice(move), owned, known: known.has(name) });
  }
  return [...found.values()].sort((a, b) => a.source !== b.source ? (a.source === 'level' ? -1 : 1)
    : a.source === 'level' ? a.level - b.level || a.move.displayName.localeCompare(b.move.displayName)
      : a.move.displayName.localeCompare(b.move.displayName));
}

function withMoves(collection: Collection, uid: string, change: (moves: string[], pokemon: OwnedPokemon) => string[] | string): Result {
  const place = locate(collection, uid);
  const pokemon = place && getAt(collection, place);
  if (!pokemon) return 'Pokémon não encontrado.';
  const result = change(currentMoves(pokemon), pokemon);
  if (typeof result === 'string') return result;
  return updatePokemon(collection, uid, (current) => ({ ...current, moves: result }));
}

/** Ensina um golpe na vaga `slot` (0 a 3; a vaga logo após o último golpe adiciona um novo). */
export function teachMove(collection: Collection, uid: string, name: string, slot: number, learnable: readonly Learnable[]): Result {
  const choice = learnable.find((entry) => entry.move.name === name);
  if (!choice) return 'Esse Pokémon não pode aprender esse golpe.';
  if (choice.known) return 'Ele já conhece esse golpe.';
  if (!choice.owned) return `Compre a TM de ${choice.move.displayName} para este Pokémon primeiro.`;
  const taught = withMoves(collection, uid, (moves) => {
    if (!Number.isInteger(slot) || slot < 0 || slot > Math.min(moves.length, maxMoves - 1)) return 'Escolha uma vaga de golpe.';
    const next = [...moves];
    next[slot] = name;
    return next;
  });
  if (typeof taught === 'string') return taught;
  return updatePokemon(taught, uid, (pokemon) => pokemon.pendingMoves?.includes(name)
    ? { ...pokemon, pendingMoves: pokemon.pendingMoves.filter((entry) => entry !== name) } : pokemon);
}

/** Esquece o golpe da vaga; o Pokémon sempre fica com pelo menos um. */
export function forgetMove(collection: Collection, uid: string, slot: number): Result {
  return withMoves(collection, uid, (moves) => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= moves.length) return 'Escolha um golpe para esquecer.';
    if (moves.length <= 1) return 'Ele precisa conhecer pelo menos um golpe.';
    return moves.filter((_, index) => index !== slot);
  });
}

/** Leva o golpe da posição `from` para `to`; os demais deslizam. A ordem vale para a batalha e para os atalhos. */
export function reorderMoves(collection: Collection, uid: string, from: number, to: number): Result {
  return withMoves(collection, uid, (moves) => {
    const valid = (index: number) => Number.isInteger(index) && index >= 0 && index < moves.length;
    if (!valid(from) || !valid(to)) return 'Escolha posições de golpe válidas.';
    const next = [...moves];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    return next;
  });
}

/** Resolve um golpe pendente: aprende no lugar do golpe `replace` (ou numa vaga livre) ou descarta (`replace` = null). */
export function resolvePending(collection: Collection, uid: string, name: string, replace: number | null): Result {
  const place = locate(collection, uid);
  const pokemon = place && getAt(collection, place);
  if (!pokemon) return 'Pokémon não encontrado.';
  if (!pokemon.pendingMoves?.includes(name)) return 'Esse golpe não está esperando uma vaga.';
  let next: Result = collection;
  if (replace !== null) {
    if (currentMoves(pokemon).includes(name)) return 'Ele já conhece esse golpe.';
    next = withMoves(collection, uid, (moves) => {
      if (!Number.isInteger(replace) || replace < 0 || replace > Math.min(moves.length, maxMoves - 1)) return 'Escolha qual golpe esquecer.';
      const updated = [...moves];
      updated[replace] = name;
      return updated;
    });
    if (typeof next === 'string') return next;
  }
  return updatePokemon(next, uid, (current) => {
    const pending = (current.pendingMoves ?? []).filter((entry) => entry !== name);
    const { pendingMoves: _old, ...rest } = current;
    return pending.length > 0 ? { ...rest, pendingMoves: pending } : rest;
  });
}

/** Compra a TM de um golpe para um Pokémon: tira o dinheiro e guarda a TM nele. */
export function buyTm(state: GameState, uid: string, name: string, learnable: readonly Learnable[]): GameState | string {
  const choice = learnable.find((entry) => entry.move.name === name && entry.source === 'machine');
  if (!choice) return 'Esse Pokémon não aprende esse golpe por TM.';
  if (choice.owned) return 'Ele já tem essa TM.';
  if (state.progress.money < choice.price) return `Dinheiro insuficiente: essa TM custa ₽ ${choice.price.toLocaleString('pt-BR')}.`;
  return {
    ...state,
    progress: { ...state.progress, money: state.progress.money - choice.price },
    collection: updatePokemon(state.collection, uid, (pokemon) => ({ ...pokemon, tms: [...(pokemon.tms ?? []), name] })),
  };
}
