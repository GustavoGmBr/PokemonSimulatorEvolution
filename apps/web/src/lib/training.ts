import data from '@pokesim-evolution/data/training';
import { getPokemon, typeLabels } from '@pokesim-evolution/data/pokedex';
import { battleMoves, getBattleItem, getBattleSpecies, type BattleSpecies } from '@pokesim-evolution/data/battle-data';
import type { GameState, GameUpdate } from './game-state';
import { maxIv, statKeys } from './ivs';
import { boxPokemon, getAt, locate, updatePokemon, type OwnedPokemon } from './pokemon-collection';
import { expForLevel, levelForExp } from './battle/experience';
import { isUsableMove, levelUpMoves } from './battle/pokemon';
import { levelCap, wildBadges } from './wild';
import { getShopItem } from '@pokesim-evolution/data/shop-items';

type Condition = { trigger: string; level: number | null; item: string | null; heldItem: string | null; happiness: number | null; timeOfDay: string | null; knownMoveType: string | null };
type Form = { name: string; displayName: string; kind: string; requiredItem: string | null; spriteId: number; types: BattleSpecies['types']; baseStats: BattleSpecies['baseStats'] };
const catalog = data as { evolutions: Record<string, { id: number; conditions: Condition[] }[]>; forms: Record<string, Form[]> };
const candies: Record<string, number> = { 'exp-candy-p': 800, 'exp-candy-m': 3000, 'exp-candy-g': 10000, 'exp-candy-gg': 30000 };
const essences = ['iv-hp', 'iv-attack', 'iv-defense', 'iv-special-attack', 'iv-special-defense', 'iv-speed'];
export const trainingItems = ['rare-candy', ...Object.keys(candies), ...essences, 'shiny-stone'];
const extraNames: Record<string, string> = { 'rare-candy': 'Doce Raro', 'exp-candy-p': 'Doce EXP P', 'exp-candy-m': 'Doce EXP M',
  'exp-candy-g': 'Doce EXP G', 'exp-candy-gg': 'Doce EXP GG', 'shiny-stone': 'Pedra Brilhante' };
export const itemName = (id: string) => getShopItem(id)?.displayName ?? getBattleItem(id)?.displayName ?? extraNames[id] ?? id.replaceAll('-', ' ');
export const formOf = (pokemon: Pick<OwnedPokemon, 'species' | 'form'>) => catalog.forms[pokemon.species]?.find(({ name }) => name === pokemon.form);
export const localFormSprite = (form: string) => ({ 'necrozma-dusk': 'NECROZMA_1', 'necrozma-dawn': 'NECROZMA_2' })[form];
export function remoteFormSprite(id: number, shiny: boolean) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shiny ? 'shiny/' : ''}${id}.png`;
}

type Choice = { label: string; item?: string; reason?: string; species?: number; form?: string };

export function evolutionChoices(pokemon: OwnedPokemon, now: number): Choice[] {
  const hour = new Date(now).getHours();
  const phase = hour >= 6 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night';
  const species = getBattleSpecies(pokemon.species);
  if (!species || pokemon.form) return [];
  const known = (pokemon.moves ?? levelUpMoves(species, pokemon.level, battleMoves).map(({ name }) => name))
    .map((name) => battleMoves.get(name)?.type);
  return (catalog.evolutions[pokemon.species] ?? []).flatMap(({ id, conditions }) => {
    const label = getPokemon(id)?.displayName;
    if (!label || !getBattleSpecies(id)) return [];
    const options = conditions.flatMap((condition): Choice[] => {
      const { trigger, item, heldItem, level, timeOfDay, knownMoveType, happiness } = condition;
      if (happiness !== null) return [];
      if (!['trade', 'use-item', 'level-up'].includes(trigger)) return [];
      const required = trigger === 'trade' ? heldItem ?? 'linking-cord' : trigger === 'use-item' ? item : heldItem;
      if (!required && (trigger !== 'level-up' || !(level || timeOfDay || knownMoveType))) return [];
      const reason = level && pokemon.level < level ? `Requer nível ${level}.` :
        timeOfDay && phase !== timeOfDay ? 'Requer outro horário.' :
        knownMoveType && !known.some((type) => type === knownMoveType) ? `Requer golpe do tipo ${typeLabels[knownMoveType] ?? knownMoveType}.` : undefined;
      return [{ label, species: id, item: required ?? undefined, reason }];
    });
    return options.filter((choice, index) => options.findIndex((other) => other.item === choice.item && other.reason === choice.reason) === index);
  });
}

export function formChoices(game: GameState, pokemon: OwnedPokemon): Choice[] {
  if (pokemon.form && !['necrozma-dusk', 'necrozma-dawn'].includes(pokemon.form)) return [];
  const owned = new Set([...game.collection.team, ...boxPokemon(game.collection).map(({ pokemon }) => pokemon)].map(({ species }) => species));
  return (catalog.forms[pokemon.species] ?? []).filter(({ name }) => name !== pokemon.form).map((form) => {
    const partners = form.name === 'necrozma-dusk' ? [791] : form.name === 'necrozma-dawn' ? [792] : form.name === 'necrozma-ultra' ? [791, 792] : [];
    const missing = partners.filter((id) => !owned.has(id)).map((id) => getPokemon(id)?.displayName);
    const reason = (form.kind === 'mega' || form.kind === 'primal') && pokemon.level < 60 ? 'Requer nível 60.' :
      missing.length ? `Falta ${missing.join(' e ')} na coleção.` : undefined;
    return { label: form.displayName, form: form.name, item: form.requiredItem ?? undefined, reason };
  });
}

function train(game: GameState, pokemon: OwnedPokemon, item: string): OwnedPokemon | string {
  if (item === 'shiny-stone') return pokemon.shiny ? 'Este Pokémon já é brilhante.' : { ...pokemon, shiny: true };
  const stat = statKeys[essences.indexOf(item)];
  if (stat) return pokemon.ivs[stat] >= maxIv ? 'Este IV já está no máximo.' : { ...pokemon, ivs: { ...pokemon.ivs, [stat]: pokemon.ivs[stat] + 1 } };
  const species = getBattleSpecies(pokemon.species);
  if (!species || (item !== 'rare-candy' && !Object.hasOwn(candies, item))) return 'Este item não pode ser usado fora de batalha.';
  const cap = levelCap(wildBadges(game.progress));
  if (pokemon.level >= cap) return 'Este Pokémon atingiu o nível máximo liberado.';
  const exp = Math.min(expForLevel(species.growthRate, cap), item === 'rare-candy'
    ? expForLevel(species.growthRate, pokemon.level + 1)
    : (pokemon.exp ?? expForLevel(species.growthRate, pokemon.level)) + candies[item]!);
  const level = levelForExp(species.growthRate, exp);
  const moves = [...(pokemon.moves ?? levelUpMoves(species, pokemon.level, battleMoves).map(({ name }) => name))];
  const pending = [...(pokemon.pendingMoves ?? [])];
  for (const [at, name] of species.learnset) {
    const move = battleMoves.get(name);
    if (at <= pokemon.level || at > level || !move || !isUsableMove(move) || moves.includes(name) || pending.includes(name)) continue;
    (moves.length < 4 ? moves : pending).push(name);
  }
  return { ...pokemon, exp, level, moves, pendingMoves: pending };
}

export function usePokemonItem(uid: string, action: { item: string } | Choice, now = Date.now()): GameUpdate {
  return (game) => {
    const place = locate(game.collection, uid);
    const pokemon = place && getAt(game.collection, place);
    if (!pokemon) return 'Pokémon não encontrado.';
    let next: OwnedPokemon | string;
    let item = action.item;
    if ('species' in action && action.species !== undefined) {
      const choice = evolutionChoices(pokemon, now).find((entry) => entry.species === action.species && entry.item === item && !entry.reason);
      if (!choice) return 'Os requisitos de evolução ainda não foram cumpridos.';
      const previous = getBattleSpecies(pokemon.species)!;
      const evolved = getBattleSpecies(action.species)!;
      next = { ...pokemon, species: action.species, exp: expForLevel(evolved.growthRate, pokemon.level),
        moves: pokemon.moves ?? levelUpMoves(previous, pokemon.level, battleMoves).map(({ name }) => name) };
    } else if ('form' in action && action.form) {
      const choice = formChoices(game, pokemon).find((entry) => entry.form === action.form && !entry.reason);
      if (!choice) return 'Os requisitos da forma ainda não foram cumpridos.';
      item = choice.item;
      next = { ...pokemon, form: action.form };
    } else {
      next = item ? train(game, pokemon, item) : 'Escolha um item.';
    }
    if (typeof next === 'string') return next;
    const bag = { ...game.progress.bag };
    if (item) {
      const quantity = bag[item] ?? 0;
      if (!quantity) return `Você não tem ${itemName(item)}.`;
      if (quantity === 1) delete bag[item];
      else bag[item] = quantity - 1;
    }
    return { ...game, collection: updatePokemon(game.collection, uid, () => next), progress: {
      ...game.progress, bag, caughtSpecies: [...new Set([...game.progress.caughtSpecies, next.species])],
    } };
  };
}
