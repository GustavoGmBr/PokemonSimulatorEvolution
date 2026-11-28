import type { JourneyProgress } from './journey-saves';
import type { WildBoard } from './wild';
import { addPokemon, type Collection, type OwnedPokemon, type Result } from './pokemon-collection';
import { recordCatch } from './missions';

/** Parte do save que muda durante o jogo (o tempo jogado é controlado à parte). */
export type GameState = { progress: JourneyProgress; collection: Collection; wild: WildBoard | null };
export type GameUpdate = (state: GameState) => GameState | string;
/** Aplica a mudança e grava o save. Devolve uma mensagem de erro, ou null se deu certo. */
export type ChangeGame = (update: GameUpdate) => string | null;

/** Adapta uma operação sobre a coleção para uma mudança do estado do jogo. */
export function onCollection(operation: (collection: Collection) => Result): GameUpdate {
  return (state) => {
    const result = operation(state.collection);
    return typeof result === 'string' ? result : { ...state, collection: result };
  };
}

/** Registra uma captura: guarda o Pokémon e atualiza Pokédex, total de capturas e shinies. */
export function capture(state: GameState, pokemon: OwnedPokemon, countMissions = true): GameState | string {
  const collection = addPokemon(state.collection, pokemon);
  if (typeof collection === 'string') return collection;

  const { progress } = state;
  const stored: GameState = {
    ...state,
    collection,
    progress: {
      ...progress,
      caughtSpecies: progress.caughtSpecies.includes(pokemon.species)
        ? progress.caughtSpecies : [...progress.caughtSpecies, pokemon.species],
      stats: {
        ...progress.stats,
        captures: progress.stats.captures + 1,
        shinies: progress.stats.shinies + (pokemon.shiny ? 1 : 0),
      },
    },
  };
  return countMissions ? recordCatch(stored, pokemon) : stored;
}
