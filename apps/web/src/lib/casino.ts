import type { GameState } from './game-state';
import { pokemonValue } from './market';
import { boxPokemon, getAt, locate, removePokemon } from './pokemon-collection';
import { rngFrom } from './battle/rng';
import * as rules from './battle/casino-rules';

type Stake = { chips: number; uid?: string; value?: number };
export type CasinoRound = { stake: Stake } & (
  | { game: 'voltorb'; state: rules.VoltorbState }
  | { game: 'jack'; state: rules.JackState }
  | { game: 'piplup'; state: rules.PiplupState }
);
type Result = { state: GameState; message: string; grid?: rules.SlotCell[] };
const rng = rngFrom((max) => Math.floor(Math.random() * max));

export const casinoPrizes = [
  ['master-ball', 10000], ['shiny-stone', 35000], ['rare-candy', 500],
  ['exp-candy-p', 200], ['exp-candy-m', 700], ['exp-candy-g', 2200], ['exp-candy-gg', 6500],
  ...['iv-hp', 'iv-attack', 'iv-defense', 'iv-special-attack', 'iv-special-defense', 'iv-speed'].map((id) => [id, 100] as const),
] as readonly (readonly [string, number])[];

export function readCasinoRound(value: unknown): CasinoRound | undefined {
  if (!value || typeof value !== 'object') return;
  const round = value as CasinoRound;
  if (!round.stake || !Number.isSafeInteger(round.stake.chips) || round.stake.chips < 0 || !round.state ||
      (round.stake.uid ? typeof round.stake.uid !== 'string' || !Number.isSafeInteger(round.stake.value) || round.stake.value! <= 0 : round.stake.chips < 1)) return;
  if (round.game === 'piplup' && Number.isInteger(round.state.jumps) && round.state.jumps >= 0 && round.state.jumps < rules.PIPLUP_PAYS.length) return round;
  if (round.game === 'voltorb' && Array.isArray(round.state.board) && round.state.board.length === 36 &&
      round.state.board.every((n) => rules.VOLTORB_CARDS.includes(n)) && Array.isArray(round.state.revealed) &&
      round.state.revealed.length < rules.VOLTORB_MAX_PICKS && round.state.revealed.every((i) => Number.isInteger(i) && i >= 0 && i < 36)) return round;
  if (round.game === 'jack') {
    const { deck, player, dealer, done } = round.state;
    const isHand = (hand: unknown): hand is rules.Card[] => Array.isArray(hand) && hand.every((card) =>
      card && rules.RANKS.includes(card.rank) && rules.SUITS.includes(card.suit));
    if (!done && isHand(deck) && isHand(player) && isHand(dealer) && deck.length >= 15 && player.length >= 2 && dealer.length === 2) return round;
  }
}

export function stakeCandidates(game: GameState) {
  const { team } = game.collection;
  return [...(team.length > 1 ? team : []), ...boxPokemon(game.collection).map(({ pokemon }) => pokemon)]
    .filter((pokemon) => !pokemon.favorite);
}

function settle(game: GameState, stake: Stake, multiplier: number, detail: string): Result | string {
  let { collection, progress } = game;
  if (stake.uid) {
    if (multiplier < 1) {
      const removed = removePokemon(collection, [stake.uid]);
      if (typeof removed === 'string' || !removed.removed.length) return 'O Pokémon em jogo não está disponível.';
      collection = removed.collection;
      detail += ' O Pokémon foi perdido.';
    } else {
      const prize = rules.pokemonPrize(stake.value ?? 0, multiplier);
      const chips = Math.floor(prize / rules.CHIP_PRICE);
      progress = { ...progress, money: progress.money + prize, casinoChips: progress.casinoChips + chips };
      detail += ` Prêmio: ₽ ${prize} e ${chips} fichas.`;
    }
  } else {
    const payout = Math.floor(stake.chips * multiplier);
    progress = { ...progress, casinoChips: progress.casinoChips + payout };
    detail += ` Retorno: ${payout} fichas.`;
  }
  return { state: { ...game, collection, progress: { ...progress, casinoRound: undefined } }, message: detail };
}

export function startCasino(game: GameState, id: rules.CasinoGame, chips: number, uid: string, pick: number, roulette: rules.RouletteBet | null): Result | string {
  if (game.progress.casinoRound) return 'Termine a rodada em andamento primeiro.';
  let stake: Stake;
  if (uid) {
    const pokemon = stakeCandidates(game).find((entry) => entry.uid === uid);
    if (!pokemon) return 'Este Pokémon não pode ser apostado.';
    stake = { chips: 0, uid, value: pokemonValue(pokemon) };
  } else {
    if (!Number.isSafeInteger(chips) || chips < 1 || chips > rules.MAX_BET || chips > game.progress.casinoChips) return 'Aposta inválida ou fichas insuficientes.';
    stake = { chips };
  }
  const state = { ...game, progress: { ...game.progress, casinoChips: game.progress.casinoChips - stake.chips } };
  const started = (round: CasinoRound): Result => ({ state: { ...state, progress: { ...state.progress, casinoRound: round } }, message: 'Rodada iniciada.' });
  switch (id) {
    case 'slots': {
      const spin = rules.spinSlots(rng);
      const result = settle(state, stake, spin.multiplier, `Caça-níqueis: ${spin.multiplier}×.`);
      return typeof result === 'string' ? result : { ...result, grid: spin.grid };
    }
    case 'roulette': {
      if (!roulette) return 'Escolha uma aposta de roleta válida.';
      const number = rules.spinRoulette(rng);
      return settle(state, stake, rules.roulettePayout(roulette, number), `Número sorteado: ${number}.`);
    }
    case 'race': {
      const result = rules.runRace(rng);
      return settle(state, stake, result.winner === pick ? rules.RACE_PAYOUT : 0, `Vencedor: corredor ${result.winner + 1}.`);
    }
    case 'wheel': {
      const result = rules.spinWheel(rng);
      return settle(state, stake, result.multiplier, `A roda parou em ${result.multiplier}×.`);
    }
    case 'doors': {
      const result = rules.openCasinoDoor(pick, rng);
      return settle(state, stake, result.multiplier, `Porta premiada: ${result.winner + 1}.`);
    }
    case 'duel': {
      const result = rules.playTypeDuel(pick, rng);
      return settle(state, stake, result.multiplier, `Oponente: ${rules.DUEL_TYPES[result.opponent]!.name}. ${{ win: 'Vitória', draw: 'Empate', lose: 'Derrota' }[result.result]}.`);
    }
    case 'voltorb': return started({ game: id, stake, state: { stake: stake.chips, board: rules.newVoltorb(rng), revealed: [] } });
    case 'piplup': return started({ game: id, stake, state: { stake: stake.chips, jumps: 0 } });
    case 'jack': {
      const dealt = rules.dealJack(stake.chips, rng);
      return dealt.done ? settle(state, stake, rules.jackMultiplier(dealt), `Pokejack: ${rules.handValue(dealt.player).total} contra ${rules.handValue(dealt.dealer).total}.`)
        : started({ game: id, stake, state: dealt });
    }
  }
}

export function casinoAction(game: GameState, action: 'take' | 'play' | 'double' | 'abandon', index = 0): Result | string {
  const pending = game.progress.casinoRound;
  if (!pending) return 'Não há rodada em andamento.';
  const round = structuredClone(pending);
  if (round.stake.uid) {
    const place = locate(game.collection, round.stake.uid);
    if (!place || !getAt(game.collection, place)) return { state: { ...game, progress: { ...game.progress, casinoRound: undefined } }, message: 'O Pokémon saiu da coleção. Rodada encerrada.' };
  }
  if (action === 'abandon') return settle(game, round.stake, 0, 'Rodada abandonada.');
  if (round.game === 'voltorb') {
    if (action === 'take') return settle(game, round.stake, rules.voltorbMultiplier(round.state), 'Cartas resgatadas.');
    if (!Number.isInteger(index) || index < 0 || index >= 36 || round.state.revealed.includes(index)) return 'Escolha uma carta fechada.';
    round.state.revealed.push(index);
    if (round.state.board[index] === 0) return settle(game, round.stake, 0, 'Você encontrou um Voltorb.');
    if (round.state.revealed.length === rules.VOLTORB_MAX_PICKS) return settle(game, round.stake, rules.voltorbMultiplier(round.state), 'Seis cartas abertas.');
  } else if (round.game === 'piplup') {
    if (action === 'take') return settle(game, round.stake, rules.piplupMultiplier(round.state.jumps), 'Piplup voltou em segurança.');
    if (rules.piplupJump(round.state, rng) === 'fall') return settle(game, round.stake, 0, 'Piplup caiu.');
    if (round.state.jumps === rules.PIPLUP_PAYS.length) return settle(game, round.stake, rules.piplupMultiplier(round.state.jumps), 'Piplup completou todos os saltos.');
  } else {
    if (action === 'double') {
      if (round.stake.uid || round.state.player.length !== 2 || game.progress.casinoChips < round.stake.chips) return 'Não é possível dobrar.';
      game = { ...game, progress: { ...game.progress, casinoChips: game.progress.casinoChips - round.stake.chips } };
      rules.jackDouble(round.state);
    } else if (action === 'take') rules.finishJack(round.state);
    else rules.jackHit(round.state);
    if (round.state.done) return settle(game, round.stake, rules.jackMultiplier(round.state),
      `Pokejack: ${rules.handValue(round.state.player).total} contra ${rules.handValue(round.state.dealer).total}.`);
  }
  return { state: { ...game, progress: { ...game.progress, casinoRound: round } }, message: 'Rodada em andamento.' };
}
