import { useMemo, useState } from 'react';
import type { CasinoOutcome } from '@/lib/casino';
import * as rules from '@/lib/battle/casino-rules';
import { schedule, SlotArt, slotArt, times, useStage } from './common';

type Slots = Extract<CasinoOutcome, { game: 'slots' }>;
const sample: rules.SlotCell[] = ['poke-ball', 'pikachu', 'great-ball', 'ultra-ball', 'mew', 'poke-ball', 'master-ball', 'ditto', 'mewtwo'];

/** Caça-níqueis: três rolos que giram e vão parando da esquerda para a direita; as linhas premiadas acendem. */
export function SlotsStage({ outcome, playKey, onDone }: { outcome?: Slots; playKey?: number; onDone: () => void }) {
  const [grid, setGrid] = useState<rules.SlotCell[]>(sample);
  const [stopped, setStopped] = useState(3);
  const [glow, setGlow] = useState<number[]>([]);
  const [lines, setLines] = useState<rules.SlotLine[]>([]);
  const strips = useMemo(() => Array.from({ length: 3 }, (_, column) => Array.from({ length: 8 }, (_, i) => rules.SLOT_SYMBOLS[(i * 3 + column * 5 + i * i) % rules.SLOT_SYMBOLS.length] as string)), []);

  useStage(playKey, () => {
    if (!outcome) return;
    setGrid(outcome.grid);
    setStopped(0);
    setGlow([]);
    setLines([]);
    const winning = [...new Set(outcome.lines.flatMap(({ line }) => rules.SLOT_LINES[line] as readonly number[]))];
    return schedule([
      [700, () => setStopped(1)], [1100, () => setStopped(2)], [1500, () => setStopped(3)],
      [1900, () => { setGlow(winning); setLines(outcome.lines); }],
      [outcome.lines.length ? 2900 : 2100, onDone],
    ]);
  });

  return (
    <div className="cz-stage cz-slots">
      <div className="cz-machine" data-spinning={stopped < 3}>
        <div className="cz-bulbs" aria-hidden="true" />
        <div className="cz-reels" role="img" aria-label={`Caça-níqueis: ${grid.map((cell) => (cell === 'empty' ? 'vazio' : slotArt[cell]?.label)).join(', ')}`}>
          {[0, 1, 2].map((column) => {
            const spinning = column >= stopped;
            return (
              <div key={column} className="cz-reel" data-spinning={spinning}>
                {spinning
                  ? <div className="cz-reel-strip">{[...strips[column]!, ...strips[column]!].map((symbol, i) => <span key={i} className="cz-cell"><SlotArt symbol={symbol} /></span>)}</div>
                  : [0, 1, 2].map((row) => {
                    const index = row * 3 + column;
                    return <span key={row} className="cz-cell" data-glow={glow.includes(index)}><SlotArt symbol={grid[index] as string} /></span>;
                  })}
              </div>
            );
          })}
        </div>
      </div>
      <ul className="cz-win-lines" aria-live="polite">
        {lines.map(({ line, symbol, multiplier }) => (
          <li key={line}><SlotArt symbol={symbol} size={22} /> {symbol === 'ditto' ? 'Ditto' : slotArt[symbol]?.label} <b>{times(multiplier)}</b></li>
        ))}
      </ul>
      <dl className="cz-paytable" aria-label="Tabela de prêmios">
        {(Object.entries(rules.SLOT_PAYS) as [string, number][]).map(([symbol, pay]) => (
          <div key={symbol}><dt><SlotArt symbol={symbol} size={26} /></dt><dd>{times(pay)}</dd></div>
        ))}
        <div title="Dois Ditto devolvem a aposta; três pagam 4×"><dt><SlotArt symbol="ditto" size={26} /></dt><dd>{times(rules.DITTO_PAIR)}–{times(rules.DITTO_TRIPLE)}</dd></div>
      </dl>
    </div>
  );
}
