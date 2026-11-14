import { useRef, useState } from 'react';
import type { CasinoOutcome } from '@/lib/casino';
import * as rules from '@/lib/battle/casino-rules';
import { schedule, SpeciesSprite, times, useStage } from './common';

type VoltorbEnd = Extract<CasinoOutcome, { game: 'voltorb' }>;
type JackEnd = Extract<CasinoOutcome, { game: 'jack' }>;
type PiplupEnd = Extract<CasinoOutcome, { game: 'piplup' }>;

const tier = (value: number) => (value === 0 ? 'bomb' : value < 1 ? 'low' : value < 1.5 ? 'mid' : value < 5 ? 'high' : 'top');
const cardCounts = [...new Set(rules.VOLTORB_CARDS)].map((value) => ({ value, count: rules.VOLTORB_CARDS.filter((card) => card === value).length }));

/** Voltorb Flip: 36 cartas viradas uma a uma; um Voltorb zera a rodada. Ao fim, as cartas que sobraram aparecem esmaecidas. */
export function VoltorbStage({ state, outcome, playKey, onDone, onPick, locked }: {
  state?: rules.VoltorbState; outcome?: VoltorbEnd; playKey?: number; onDone: () => void; onPick: (index: number) => void; locked: boolean;
}) {
  const [last, setLast] = useState<VoltorbEnd | undefined>(outcome);
  useStage(playKey, () => {
    if (!outcome) return;
    setLast(outcome);
    return schedule([[900, onDone]]);
  });
  const ended = !state;
  const board = state?.board ?? last?.board;
  const revealed = state?.revealed ?? last?.revealed ?? [];
  const live = state ? rules.voltorbMultiplier(state) : last ? rules.voltorbMultiplier({ stake: 0, board: last.board, revealed: last.revealed }) : 0;
  const lastIndex = revealed[revealed.length - 1];
  return (
    <div className="cz-stage cz-voltorb">
      <div className="cz-hud">
        <span>Cartas <b>{revealed.length}/{rules.VOLTORB_MAX_PICKS}</b></span>
        <span>Acumulado <b>{times(live)}</b></span>
        <span className="cz-hud-hint">Uma linha ou coluna inteira vale +50%</span>
      </div>
      <div className="cz-cards" role="group" aria-label="Cartas do Voltorb Flip">
        {Array.from({ length: 36 }, (_, index) => {
          const value = board?.[index];
          const open = revealed.includes(index);
          const face = open || (ended && board !== undefined);
          return (
            <button key={index} type="button" className="cz-flip" data-open={face} data-faded={face && !open} data-tier={face && value !== undefined ? tier(value) : undefined}
              data-boom={ended && index === lastIndex && value === 0} disabled={locked || ended || open} aria-label={face && value !== undefined ? (value === 0 ? 'Voltorb' : `Carta ${times(value)}`) : `Carta ${index + 1}`}
              onClick={() => onPick(index)}>
              <span className="cz-flip-inner">
                <span className="cz-flip-front">?</span>
                <span className="cz-flip-back">{value === 0 ? <SpeciesSprite id={100} className="cz-sprite cz-sprite-card" /> : value !== undefined ? times(value) : ''}</span>
              </span>
            </button>
          );
        })}
      </div>
      <ul className="cz-legend cz-legend-inline" aria-label="Cartas do baralho">
        {cardCounts.map(({ value, count }) => <li key={value} data-tier={tier(value)}>{count}× {value === 0 ? 'Voltorb' : times(value)}</li>)}
      </ul>
    </div>
  );
}

const red = (suit: string) => suit === '♥' || suit === '♦';

function PlayingCard({ card, hidden, index }: { card?: rules.Card; hidden?: boolean; index: number }) {
  return (
    <span className="cz-playing" data-hidden={hidden} data-red={card ? red(card.suit) : undefined} style={{ animationDelay: `${index * 120}ms` }}
      aria-label={hidden || !card ? 'Carta virada' : `${card.rank} de ${card.suit}`}>
      {!hidden && card && <><b>{card.rank}</b><i>{card.suit}</i></>}
    </span>
  );
}

/** Pokejack (vinte-e-um): a banca mostra uma carta até o jogador parar. */
export function JackStage({ state, outcome, playKey, onDone }: { state?: rules.JackState; outcome?: JackEnd; playKey?: number; onDone: () => void }) {
  const [last, setLast] = useState<JackEnd | undefined>(outcome);
  useStage(playKey, () => {
    if (!outcome) return;
    setLast(outcome);
    return schedule([[600 + Math.max(0, outcome.dealer.length - 2) * 450, onDone]]);
  });
  const player = state?.player ?? last?.player ?? [];
  const dealer = state?.dealer ?? last?.dealer ?? [];
  const hideDealer = Boolean(state);
  const empty = player.length === 0;
  return (
    <div className="cz-stage cz-jack">
      <div className="cz-hand">
        <h3>Banca {!empty && <span className="cz-total">{hideDealer ? '?' : rules.handValue(dealer).total}</span>}</h3>
        <div className="cz-hand-cards">
          {empty ? <span className="cz-table-hint">Faça sua aposta e jogue para receber as cartas.</span>
            : dealer.map((card, index) => <PlayingCard key={`${index}-${card.rank}${card.suit}-${hideDealer}`} card={card} hidden={hideDealer && index > 0} index={hideDealer ? index : index > 1 ? index - 1 : 0} />)}
        </div>
      </div>
      <div className="cz-hand">
        <h3>Você {!empty && <span className="cz-total" data-bust={rules.handValue(player).total > 21}>{rules.handValue(player).total}</span>}</h3>
        <div className="cz-hand-cards">{player.map((card, index) => <PlayingCard key={`${index}-${card.rank}${card.suit}`} card={card} index={index} />)}</div>
      </div>
    </div>
  );
}

/** Pula Piplup: sete pedras sobre a água; cada salto paga mais e arrisca cair. */
export function PiplupStage({ state, outcome, playKey, onDone }: { state?: rules.PiplupState; outcome?: PiplupEnd; playKey?: number; onDone: () => void }) {
  const [last, setLast] = useState<PiplupEnd | undefined>(outcome);
  const hops = useRef(0);
  useStage(playKey, () => {
    if (!outcome) return;
    hops.current += 1;
    setLast(outcome);
    return schedule([[outcome.fell ? 1300 : 700, onDone]]);
  });
  const jumps = state?.jumps ?? last?.jumps ?? 0;
  const fell = !state && Boolean(last?.fell);
  const at = fell ? jumps + 1 : jumps;
  const stones = rules.PIPLUP_PAYS.length;
  return (
    <div className="cz-stage cz-piplup">
      <div className="cz-pond" data-fell={fell}>
        <span className="cz-bank">Margem</span>
        {rules.PIPLUP_PAYS.map((pay, index) => (
          <span key={index} className="cz-stone" data-done={index < jumps} data-next={state && index === jumps} style={{ left: `${(index + 1) * (86 / (stones + 1)) + 6}%`, bottom: `${22 + index * 7.5}%` }}>
            <b>{times(pay)}</b><small>{rules.PIPLUP_ODDS[index]}%</small>
          </span>
        ))}
        <span key={`${at}-${hops.current}-${jumps}`} className="cz-piplup-sprite" data-fell={fell}
          style={{ left: `${at === 0 ? 3 : at * (86 / (stones + 1)) + 6}%`, bottom: `${at === 0 ? 24 : 22 + (at - 1) * 7.5 + 9}%` }}>
          <SpeciesSprite id={393} className="cz-sprite cz-sprite-piplup" />
        </span>
        <span className="cz-water" aria-hidden="true" />
      </div>
      <p className="cz-caption">{jumps === 0 && !fell ? 'Pule para a primeira pedra ou desista antes de arriscar.' : fell ? 'Piplup escorregou e caiu na água!' : `Já está a ${times(rules.piplupMultiplier(jumps))}. Pule para arriscar mais ou resgate.`}</p>
    </div>
  );
}
