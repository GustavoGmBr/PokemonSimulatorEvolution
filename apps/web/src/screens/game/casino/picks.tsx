import { DoorClosed } from 'lucide-react';
import { useState } from 'react';
import type { CasinoOutcome } from '@/lib/casino';
import * as rules from '@/lib/battle/casino-rules';
import { reducedMotion, schedule, SpeciesSprite, times, useStage } from './common';

type Doors = Extract<CasinoOutcome, { game: 'doors' }>;
type Duel = Extract<CasinoOutcome, { game: 'duel' }>;

/** Portas do Eevee: escolha uma porta; ao jogar elas abrem e o Eevee aparece atrás de uma só. */
export function DoorsStage({ outcome, playKey, onDone, pick, onPick, locked }: {
  outcome?: Doors; playKey?: number; onDone: () => void; pick: number; onPick: (pick: number) => void; locked: boolean;
}) {
  const [open, setOpen] = useState<number[]>(outcome ? [0, 1, 2] : []);
  const [shown, setShown] = useState<Doors | undefined>(outcome);

  useStage(playKey, () => {
    if (!outcome) return;
    setShown(outcome);
    setOpen([]);
    const others = [0, 1, 2].filter((door) => door !== outcome.winner);
    return schedule([[500, () => setOpen([others[0]!])], [1000, () => setOpen([others[0]!, others[1]!])], [1700, () => setOpen([0, 1, 2])], [2900, onDone]]);
  });

  return (
    <div className="cz-stage cz-doors">
      <div className="cz-door-row">
        {Array.from({ length: rules.DOOR_COUNT }, (_, door) => {
          const isOpen = open.includes(door);
          const won = shown?.winner === door;
          return (
            <button key={door} type="button" className="cz-door" disabled={locked} aria-pressed={pick === door} data-selected={pick === door} data-open={isOpen} data-win={isOpen && won}
              aria-label={`Porta ${door + 1}${pick === door ? ' (sua escolha)' : ''}`} onClick={() => onPick(door)}>
              <span className="cz-door-room">{isOpen && <SpeciesSprite id={won ? 133 : 41} className="cz-sprite cz-sprite-door" />}</span>
              <span className="cz-door-panel"><DoorClosed aria-hidden="true" /><b>{door + 1}</b></span>
              {pick === door && <em className="cz-tag">Sua porta</em>}
            </button>
          );
        })}
      </div>
      <p className="cz-caption">O Eevee está atrás de uma delas. Acertar paga {times(rules.DOOR_PAYOUT)}.</p>
    </div>
  );
}

const duelColors = ['#3fae5a', '#ee6a2e', '#3b8de0'];

/** Duelo de tipos: Planta vence Água, Fogo vence Planta e Água vence Fogo. */
export function DuelStage({ outcome, playKey, onDone, pick, onPick, locked }: {
  outcome?: Duel; playKey?: number; onDone: () => void; pick: number; onPick: (pick: number) => void; locked: boolean;
}) {
  const [cursor, setCursor] = useState<number | null>(outcome?.opponent ?? null);
  const [result, setResult] = useState<Duel['result'] | null>(outcome?.result ?? null);
  const [shownPick, setShownPick] = useState<number | null>(outcome?.pick ?? null);

  useStage(playKey, () => {
    if (!outcome) return;
    setResult(null);
    setShownPick(outcome.pick);
    if (reducedMotion()) {
      setCursor(outcome.opponent);
      setResult(outcome.result);
      const done = window.setTimeout(onDone, 0);
      return () => window.clearTimeout(done);
    }
    let step = 0;
    let finish = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setCursor(step % 3);
      if (step >= 12 && step % 3 === outcome.opponent) {
        window.clearInterval(timer);
        setCursor(outcome.opponent);
        finish = window.setTimeout(() => { setResult(outcome.result); finish = window.setTimeout(onDone, 1200); }, 450);
      }
    }, 110);
    return () => { window.clearInterval(timer); window.clearTimeout(finish); };
  });

  const label = { win: 'Você venceu!', draw: 'Empate: aposta devolvida', lose: 'Você perdeu' };
  return (
    <div className="cz-stage cz-duel">
      <div className="cz-duel-side">
        <h3>Você</h3>
        <div className="cz-duel-cards" role="radiogroup" aria-label="Seu tipo">
          {rules.DUEL_TYPES.map(({ name, speciesId }, index) => (
            <button key={name} type="button" role="radio" aria-checked={pick === index} className="cz-duel-card" disabled={locked} data-selected={pick === index}
              data-result={result && shownPick === index ? result : undefined} style={{ ['--duel' as string]: duelColors[index] }} onClick={() => onPick(index)}>
              <SpeciesSprite id={speciesId} className="cz-sprite cz-sprite-duel" /><b>{name}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="cz-versus" aria-hidden="true">VS</div>
      <div className="cz-duel-side">
        <h3>Oponente</h3>
        <div className="cz-duel-cards">
          {rules.DUEL_TYPES.map(({ name, speciesId }, index) => (
            <div key={name} className="cz-duel-card" data-cursor={cursor === index} style={{ ['--duel' as string]: duelColors[index] }}>
              <SpeciesSprite id={speciesId} className="cz-sprite cz-sprite-duel" /><b>{name}</b>
            </div>
          ))}
        </div>
      </div>
      <p className="cz-caption" data-result={result ?? undefined}>{result ? label[result] : `Planta vence Água · Fogo vence Planta · Água vence Fogo. Vitória paga ${times(rules.DUEL_PAYOUT)}.`}</p>
    </div>
  );
}
