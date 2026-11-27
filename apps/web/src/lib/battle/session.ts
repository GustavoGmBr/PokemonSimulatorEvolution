// Ponte entre o jogo (equipe, mochila, selvagens) e o motor de batalha: monta os combatentes,
// executa as ações do jogador (golpe, troca, fuga, bola, item) e grava o resultado no save.
import { battleMoves, getBattleItem, getBattleSpecies, typeChart } from '@pokesim-evolution/data/battle-data';
import { getPokemon } from '@pokesim-evolution/data/pokedex';
import type { Bag } from '../journey-saves';
import { capture, type GameState, type GameUpdate } from '../game-state';
import { createPokemon, loseDefeated, pokemonCount, type OwnedPokemon } from '../pokemon-collection';
import type { WildEncounter } from '../wild';
import { removeEncounter } from '../wild';
import {
  activeOf, chooseAction, combatantFrom, createBattle, failedThrow, finishCapture,
  type BattleContext, type BattleEvent, type BattleState, type Combatant, type TrainerInfo,
} from './engine';
import { attemptCapture, captureChance, type CaptureInput } from './capture';
import { expForLevel } from './experience';
import { HEAL_EFFECTS, STATUS_CURES, applyHealItem, applyStatusCure } from './items';
import { levelUpMoves, toMoveSlot, type BattleInstance } from './pokemon';
import { resumableRng } from './rng';
import { statsOf } from './pokemon';
import { recordMission } from '../missions';
import { formOf } from '../training';
import type { MoveSlot, Species } from './types';

export const battleContext: BattleContext = {
  species(id) {
    const species = getBattleSpecies(id);
    if (!species) throw new Error(`Espécie ${id} sem dados de batalha.`);
    return species;
  },
  moves: battleMoves,
  chart: typeChart,
};

/** Dinheiro por vencer um selvagem: metade de 10 × o nível dele. */
export const wildReward = (level: number) => Math.floor(level * 10 * 0.5);

export function speciesName(id: number) {
  return getPokemon(id)?.displayName ?? `Espécie ${id}`;
}

function movesOf(pokemon: OwnedPokemon, species: Species): MoveSlot[] {
  const names = pokemon.moves?.filter((name) => battleMoves.has(name));
  if (names && names.length > 0) return names.map((name) => toMoveSlot(battleMoves.get(name)!));
  return levelUpMoves(species, pokemon.level, battleMoves).map(toMoveSlot);
}

function instanceOf(pokemon: OwnedPokemon, species: Species): BattleInstance {
  const stats = statsOf(pokemon, species);
  return {
    speciesId: pokemon.species, level: pokemon.level, exp: pokemon.exp ?? expForLevel(species.growthRate, pokemon.level),
    shiny: pokemon.shiny, ivs: pokemon.ivs, moves: movesOf(pokemon, species), currentHp: stats.hp, friendship: species.baseHappiness,
  };
}

/** A equipe do jogador como combatentes (fora de batalha todos têm o HP cheio). */
export function teamCombatants(team: readonly OwnedPokemon[], playerCap?: number, restore = false): Combatant[] {
  return team.map((pokemon) => {
    const species = battleContext.species(pokemon.species);
    const form = formOf(pokemon);
    const effective = form ? { ...species, types: form.types, baseStats: form.baseStats } : species;
    const combatant = combatantFrom(instanceOf(pokemon, effective), effective, pokemon.nickname ?? form?.displayName ?? speciesName(pokemon.species), pokemon.uid);
    if (form) {
      combatant.form = form.name;
      if (form.kind === 'gmax') combatant.hp = combatant.stats.hp = Math.floor(combatant.stats.hp * 1.5);
    }
    combatant.hp = restore ? combatant.stats.hp : Math.min(combatant.stats.hp, pokemon.hp ?? combatant.stats.hp);
    combatant.status = restore ? null : pokemon.status ?? null;
    if (playerCap !== undefined) combatant.levelCap = playerCap;
    combatant.pendingMoves = [...(pokemon.pendingMoves ?? [])];
    return combatant;
  });
}

export function wildCombatant(encounter: WildEncounter): Combatant {
  const species = battleContext.species(encounter.species);
  const instance: BattleInstance = {
    speciesId: encounter.species, level: encounter.level, exp: expForLevel(species.growthRate, encounter.level), shiny: encounter.shiny,
    ivs: encounter.ivs, moves: levelUpMoves(species, encounter.level, battleMoves).map(toMoveSlot), currentHp: 1, friendship: species.baseHappiness,
  };
  const combatant = combatantFrom(instance, species, speciesName(encounter.species));
  combatant.hp = combatant.stats.hp;
  return combatant;
}

/** Começa a luta contra um selvagem; `lead` é o Pokémon da equipe que abre a batalha. */
export function startWildBattle(team: readonly OwnedPokemon[], encounter: WildEncounter, leadUid?: string | null, playerCap?: number) {
  const player = teamCombatants(team, playerCap);
  const lead = player.findIndex((c) => c.ref === leadUid);
  if (lead > 0) player.unshift(...player.splice(lead, 1));
  return createBattle({ player, foe: [wildCombatant(encounter)], seed: Math.floor(Math.random() * 2 ** 31), kind: 'wild' });
}

export function startOpponentBattle(team: readonly OwnedPokemon[], opponents: readonly WildEncounter[], trainer: TrainerInfo, opponentCap?: number, playerCap?: number) {
  // Fora das lutas contra selvagens (treinadores, ginásios, torneios…) a equipe entra e sai com HP cheio e sem status.
  const player = team.flatMap((pokemon) => {
    if (opponentCap === undefined || pokemon.level <= opponentCap) return teamCombatants([pokemon], playerCap, true);
    const species = battleContext.species(pokemon.species);
    const scaled = { ...pokemon, level: opponentCap, exp: expForLevel(species.growthRate, opponentCap) };
    const combatant = teamCombatants([scaled], playerCap, true)[0]!;
    return [{ ...combatant, capped: true }];
  });
  return createBattle({ player, foe: opponents.map(wildCombatant), seed: Math.floor(Math.random() * 2 ** 31), kind: 'trainer', trainer });
}

export type BattleRequest =
  | { kind: 'move'; slot: number }
  | { kind: 'switch'; to: number }
  | { kind: 'run' }
  | { kind: 'ball'; item: string }
  | { kind: 'item'; item: string; target: number };

export interface BattleStep { state: BattleState; events: BattleEvent[]; bag: Bag }

function take(bag: Bag, item: string): Bag | null {
  const left = bag[item] ?? 0;
  if (left <= 0) return null;
  const next = { ...bag, [item]: left - 1 };
  if (next[item] === 0) delete next[item];
  return next;
}

function captureInput(state: BattleState, ball: string, bag?: Bag): CaptureInput {
  const foe = activeOf(state, 'foe');
  const species = battleContext.species(foe.speciesId);
  return {
    maxHp: foe.stats.hp, currentHp: foe.hp, captureRate: species.captureRate, ball,
    catchingCharm: (bag?.['catching-charm'] ?? 0) > 0,
    statusMultiplier: foe.status === 'sleep' || foe.status === 'freeze' ? 2 : foe.status ? 1.5 : 1,
    context: {
      types: foe.types, weight: species.weight, height: species.height, firstTurn: state.turn === 0,
      leadTypes: activeOf(state, 'player').types, asleep: foe.status === 'sleep',
    },
  };
}

/** Quais bolas e itens de cura a mochila tem para usar em batalha. */
export function battleBag(bag: Bag, kind: 'wild' | 'trainer') {
  const have = (category: 'captura' | 'cura') => Object.entries(bag)
    .filter(([, quantity]) => quantity > 0)
    .flatMap(([name, quantity]) => {
      const item = getBattleItem(name);
      return item && item.category === category && (category === 'captura' || name in HEAL_EFFECTS || name in STATUS_CURES)
        ? [{ name, displayName: item.displayName, quantity }] : [];
    });
  return { balls: kind === 'trainer' ? [] : have('captura'), heals: have('cura') };
}

/** Chance de captura atual, com HP, status, turno e Amuleto de Captura da mochila. */
export function battleBallChance(state: BattleState, ball: string, bag?: Bag) {
  return state.kind === 'trainer' ? 0 : captureChance(captureInput(state, ball, bag));
}

/** Aplica uma ação do jogador. Lança um `Error` com a mensagem se a ação não vale (item sem efeito, sem bola…). */
export function act(state: BattleState, bag: Bag, request: BattleRequest): BattleStep {
  const ctx = battleContext;
  switch (request.kind) {
    case 'move': {
      const result = chooseAction(state, { kind: 'move', slot: request.slot }, ctx);
      return { ...result, bag };
    }
    case 'switch': {
      const result = chooseAction(state, { kind: 'switch', to: request.to }, ctx);
      return { ...result, bag };
    }
    case 'run': {
      if (state.phase !== 'choose') throw new Error('Escolha o próximo Pokémon primeiro.');
      return { ...chooseAction(state, { kind: 'run' }, ctx), bag };
    }
    case 'ball': {
      if (state.kind === 'trainer') throw new Error('Não dá para capturar o Pokémon de um treinador!');
      if (state.phase !== 'choose') throw new Error('Escolha o próximo Pokémon primeiro.');
      const item = getBattleItem(request.item);
      if (!item || item.category !== 'captura') throw new Error('Escolha uma Poké Bola.');
      const left = take(bag, item.name);
      if (!left) throw new Error(`Você não tem ${item.displayName}.`);
      const rng = resumableRng(state.rng);
      const attempt = attemptCapture(rng, captureInput(state, item.name, bag));
      const next: BattleState = { ...state, rng: rng.state };
      const throwText = `Você lançou ${item.displayName}!`;
      if (attempt.caught) {
        const result = finishCapture(next, ctx, item.name, attempt.shakes, `${throwText} Capturou ${activeOf(next, 'foe').name}!`);
        return { ...result, bag: left };
      }
      const result = failedThrow(next, ctx, item.name, attempt.shakes, `${throwText} ${activeOf(next, 'foe').name} escapou!`);
      return { ...result, bag: left };
    }
    case 'item': {
      if (state.phase !== 'choose') throw new Error('Escolha o próximo Pokémon primeiro.');
      const item = getBattleItem(request.item);
      const target = state.player.team[request.target];
      if (!item || !(item.name in HEAL_EFFECTS || item.name in STATUS_CURES) || !target) throw new Error('Item ou alvo inválido.');
      const heals = item.name in HEAL_EFFECTS;
      const cure = item.name in STATUS_CURES ? applyStatusCure(item.name, target.status, target.confusion > 0, target.hp <= 0) : null;
      const hpUse = heals ? applyHealItem(item.name, target.hp, target.stats.hp) : null;
      const hpOk = hpUse?.ok === true;
      const cureOk = cure?.ok === true;
      if (!hpOk && !cureOk) {
        const hpReason = hpUse && !hpUse.ok ? hpUse.reason : null;
        const cureReason = cure && !cure.ok ? cure.reason : null;
        throw new Error(heals && cure ? (target.hp <= 0 ? (hpReason as string) : 'Não surtiria efeito.') : (hpReason ?? cureReason ?? 'Não surtiria efeito.'));
      }
      const left = take(bag, item.name);
      if (!left) throw new Error(`Você não tem ${item.displayName}.`);
      const next = JSON.parse(JSON.stringify(state)) as BattleState;
      const mon = next.player.team[request.target] as Combatant;
      const parts: string[] = [];
      let healed = 0;
      if (hpUse && hpUse.ok) { mon.hp = hpUse.newHp; healed = hpUse.healed; parts.push(`Recuperou ${hpUse.healed} HP.`); }
      if (cure && cure.ok) {
        if (cure.status) mon.status = null;
        if (cure.confusion) mon.confusion = 0;
        parts.push(cure.status ? 'O problema de status foi curado!' : 'A confusão passou!');
      }
      const result = chooseAction(next, { kind: 'pass', text: `Você usou ${item.displayName} em ${mon.name}! ${parts.join(' ')}` }, ctx);
      if (healed > 0 && request.target === next.player.active) result.events.unshift({ k: 'heal', side: 'player', amount: healed, hp: mon.hp, maxHp: mon.stats.hp, text: '' });
      return { ...result, bag: left };
    }
  }
}

export interface BattleOutcome {
  result: NonNullable<BattleState['result']>;
  money: number;
  caught: OwnedPokemon | null;
  levels: { name: string; level: number }[];
  /** mensagem se algo não coube no save (PC cheio) */
  problem: string | null;
  /** Morte permanente: nomes dos Pokémon derrotados que foram apagados. */
  lost: string[];
  fainted: string[];
  /** Morte permanente: não sobrou nenhum Pokémon, então o save será apagado. */
  gameOver: boolean;
}

/**
 * Grava no save o que a batalha rendeu: XP, níveis e golpes da equipe, mochila, dinheiro, captura (com Pokédex)
 * e a saída do selvagem do mapa quando ele foi vencido ou capturado. HP/status só são persistidos nas lutas contra selvagens; as demais batalhas curam a equipe.
 */
export function settleBattle(game: GameState, battle: BattleState, bag: Bag, encounterId: string | null, ball: string | null, opponentReward = 0, saveExperience = true): { state: GameState; outcome: BattleOutcome } {
  const result = battle.result ?? 'fled';
  const before = new Map(game.collection.team.map((pokemon) => [pokemon.uid, pokemon.level]));
  const grown = new Map(battle.player.team.filter((c) => c.ref).map((c) => [c.ref, c]));
  const patch = (pokemon: OwnedPokemon): OwnedPokemon => {
    const fought = grown.get(pokemon.uid);
    if (!saveExperience || !fought || fought.capped) return pokemon;
    return {
      ...pokemon, level: fought.level, exp: fought.exp, moves: fought.moves.map((slot) => slot.name),
      ...(fought.pendingMoves.length > 0 ? { pendingMoves: [...fought.pendingMoves] } : { pendingMoves: undefined }),
    };
  };
  let collection = {
    ...game.collection,
    team: game.collection.team.map((pokemon) => {
      const fought = grown.get(pokemon.uid);
      if (!fought) return patch(pokemon);
      // Só a luta contra selvagens deixa marcas: depois de qualquer outra batalha a equipe volta curada.
      if (battle.kind === 'trainer') { const { hp: _hp, ...healed } = patch(pokemon); return { ...healed, status: null }; }
      return { ...patch(pokemon), hp: fought.hp, status: fought.status };
    }),
    boxes: game.collection.boxes.map((box) => ({ ...box, slots: box.slots.map((slot) => (slot ? patch(slot) : slot)) })),
  };
  // Morte permanente: quem ainda estiver desmaiado no fim da luta (mesmo que ela tenha sido uma fuga) é apagado.
  // O Pokémon apostado no cassino fica de fora: a rodada precisa terminar antes de ele sair da coleção.
  const permadeath = game.progress.mode === 'permadeath';
  const staked = game.progress.casinoRound?.stake.uid;
  const dead = permadeath ? battle.player.team.filter((c) => c.ref && c.hp <= 0 && c.ref !== staked) : [];
  if (dead.length > 0) collection = loseDefeated(collection, dead.map((c) => c.ref));
  const foe = activeOf(battle, 'foe');
  const money = result === 'win' ? (encounterId === null ? opponentReward : wildReward(foe.level)) : 0;
  const progress = {
    ...game.progress, bag,
    money: game.progress.money + money,
    stats: {
      ...game.progress.stats,
      wins: game.progress.stats.wins + (result === 'win' ? 1 : 0),
      losses: game.progress.stats.losses + (result === 'lose' ? 1 : 0),
    },
  };
  let state: GameState = { ...game, collection, progress, wild: encounterId && game.wild && (result === 'win' || result === 'captured') ? removeEncounter(game.wild, encounterId) : game.wild };
  if (encounterId && result === 'win') state = recordMission(state, 'wild');

  let caught: OwnedPokemon | null = null;
  let problem: string | null = null;
  if (result === 'captured') {
    const species = battleContext.species(foe.speciesId);
    caught = { ...createPokemon(foe.speciesId, { level: foe.level, shiny: foe.shiny, ivs: foe.ivs, ball: ball ?? undefined }), exp: expForLevel(species.growthRate, foe.level), moves: foe.moves.map((slot) => slot.name) };
    const stored = capture(state, caught);
    if (typeof stored === 'string') { problem = stored; caught = null; } else state = stored;
  }
  const levels = saveExperience ? battle.player.team.filter((c) => c.ref && !c.capped && c.level > (before.get(c.ref) ?? c.level)).map((c) => ({ name: c.name, level: c.level })) : [];
  const gameOver = permadeath && pokemonCount(state.collection) === 0;
  const fainted = battle.player.team.filter((c) => c.ref && c.hp <= 0).map((c) => c.name);
  return { state, outcome: { result, money, caught, levels, problem, lost: dead.map((c) => c.name), fainted, gameOver } };
}

// ---------- Captura direta (sem batalha) ----------

/** Dados da captura de um selvagem sem lutar: HP cheio, sem status e a primeira bola do encontro. */
function directInput(encounter: WildEncounter, ball: string, team: readonly OwnedPokemon[]): CaptureInput {
  const species = battleContext.species(encounter.species);
  const lead = team[0] ? battleContext.species(team[0].species) : null;
  const maxHp = statsOf({ level: encounter.level, ivs: encounter.ivs, shiny: encounter.shiny }, species).hp;
  return {
    maxHp, currentHp: maxHp, captureRate: species.captureRate, ball, statusMultiplier: 1,
    context: { types: species.types, weight: species.weight, height: species.height, firstTurn: true, leadTypes: lead?.types ?? [], asleep: false },
  };
}

/** Chance (0 a 1) de a bola capturar o selvagem sem batalha. */
export function directCaptureOdds(encounter: WildEncounter, ball: string, team: readonly OwnedPokemon[]): number {
  return captureChance(directInput(encounter, ball, team));
}

export interface DirectThrow {
  caught: boolean;
  shakes: 0 | 1 | 2 | 3;
  /** Grava o resultado: gasta a bola, guarda o Pokémon capturado e tira o selvagem do mapa (também quando ele escapa). */
  apply: GameUpdate;
}

/** Lança uma bola num selvagem sem batalha. Lança um `Error` com a mensagem se não vale (sem a bola, não é uma bola). */
export function throwDirect(state: GameState, encounter: WildEncounter, ball: string): DirectThrow {
  const item = getBattleItem(ball);
  if (!item || item.category !== 'captura') throw new Error('Escolha uma Poké Bola.');
  if (!take(state.progress.bag, item.name)) throw new Error(`Você não tem ${item.displayName}.`);
  const attempt = attemptCapture({ int: (max) => Math.floor(Math.random() * max) }, directInput(encounter, item.name, state.collection.team));
  const apply: GameUpdate = (current) => {
    const bag = take(current.progress.bag, item.name);
    if (!bag) return `Você não tem ${item.displayName}.`;
    let next: GameState = { ...current, progress: { ...current.progress, bag } };
    if (attempt.caught) {
      const caught = capture(next, createPokemon(encounter.species, { level: encounter.level, shiny: encounter.shiny, ivs: encounter.ivs, ball: item.name }));
      if (typeof caught === 'string') return caught;
      next = caught;
    }
    return { ...next, wild: next.wild ? removeEncounter(next.wild, encounter.id) : null };
  };
  return { caught: attempt.caught, shakes: attempt.shakes, apply };
}
