import { Flag, Trophy } from 'lucide-react';
import { useState } from 'react';
import type { CasinoOutcome } from '@/lib/casino';
import * as rules from '@/lib/battle/casino-rules';
import { reducedMotion, SpeciesSprite, times, useStage } from './common';

type Race = Extract<CasinoOutcome, { game: 'race' }>;
export const runnerNames = ['Pikachu', 'Rapidash', 'Arcanine', 'Jolteon', 'Ninjask'];
const start = rules.RACE_RUNNERS.map(() => 0);

/** Pokémon Race: cinco pistas; o jogador escolhe o corredor antes e a corrida passa quadro a quadro. */
export function RaceStage({ outcome, playKey, onDone, pick, onPick, locked }: {
  outcome?: Race; playKey?: number; onDone: () => void; pick: number; onPick: (pick: number) => void; locked: boolean;
}) {
  const [positions, setPositions] = useState<number[]>(outcome ? outcome.frames[outcome.frames.length - 1]! : start);
  const [winner, setWinner] = useState<number | null>(outcome?.winner ?? null);
  const [racing, setRacing] = useState(false);

  useStage(playKey, () => {
    if (!outcome) return;
    const { frames } = outcome;
    setWinner(null);
    if (reducedMotion()) {
      setPositions(frames[frames.length - 1]!);
      setWinner(outcome.winner);
      const done = window.setTimeout(onDone, 0);
      return () => window.clearTimeout(done);
    }
    let step = 0;
    let done = 0;
    setRacing(true);
    setPositions(frames[0]!);
    const timer = window.setInterval(() => {
      step += 1;
      setPositions(frames[Math.min(step, frames.length - 1)]!);
      if (step >= frames.length - 1) {
        window.clearInterval(timer);
        setRacing(false);
        setWinner(outcome.winner);
        done = window.setTimeout(onDone, 1000);
      }
    }, 110);
    return () => { window.clearInterval(timer); window.clearTimeout(done); };
  });

  return (
    <div className="cz-stage cz-race" data-racing={racing}>
      <div className="cz-track">
        {rules.RACE_RUNNERS.map((species, lane) => (
          <button key={species} type="button" className="cz-lane" disabled={locked} aria-pressed={pick === lane}
            data-selected={pick === lane} data-winner={winner === lane} data-lost={winner !== null && winner !== lane}
            aria-label={`Pista ${lane + 1}: ${runnerNames[lane]}${pick === lane ? ' (sua aposta)' : ''}`} onClick={() => onPick(lane)}>
            <span className="cz-lane-id"><b>{lane + 1}</b><small>{runnerNames[lane]}</small></span>
            <span className="cz-lane-road">
              <span className="cz-runner" style={{ left: `${(positions[lane]! / rules.RACE_LENGTH) * 84}%` }} data-running={racing}>
                <SpeciesSprite id={species} className="cz-sprite cz-sprite-runner" />
                {winner === lane && <Trophy className="cz-trophy" aria-hidden="true" />}
              </span>
              <Flag className="cz-finish" aria-hidden="true" />
            </span>
            {pick === lane && <em className="cz-tag">Sua aposta</em>}
          </button>
        ))}
      </div>
      <p className="cz-caption">{winner === null ? `Acertar o vencedor paga ${times(rules.RACE_PAYOUT)}.` : `Vencedor: ${runnerNames[winner]}!`}</p>
    </div>
  );
}
