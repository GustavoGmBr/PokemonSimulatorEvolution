import { useState } from 'react';
import type { CasinoOutcome } from '@/lib/casino';
import * as rules from '@/lib/battle/casino-rules';
import { landRotation, schedule, span, SpeciesSprite, times, useStage, wedge } from './common';

type Roulette = Extract<CasinoOutcome, { game: 'roulette' }>;
/** Ordem real dos números numa roleta europeia (sentido horário a partir do zero). */
const order = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const fill = { red: '#c8283b', black: '#1b1b26', green: '#167a4d' } as const;

export function RouletteStage({ outcome, playKey, onDone }: { outcome?: Roulette; playKey?: number; onDone: () => void }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState<number | null>(outcome?.number ?? null);
  const slice = 360 / order.length;

  useStage(playKey, () => {
    if (!outcome) return;
    setLanded(null);
    setSpinning(true);
    setRotation((current) => landRotation(current, order.indexOf(outcome.number), order.length, 5));
    return schedule([[4400, () => { setSpinning(false); setLanded(outcome.number); }], [5300, onDone]]);
  });

  const color = landed === null ? null : rules.colorOf(landed);
  return (
    <div className="cz-stage cz-roulette">
      <div className="cz-wheel-box">
        <span className="cz-pointer" aria-hidden="true" />
        <svg className="cz-wheel" viewBox="0 0 200 200" role="img" aria-label={landed === null ? 'Roleta' : `Roleta parou no ${landed}`}
          style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${span(4200)}ms` }}>
          <circle cx="100" cy="100" r="98" fill="#e8b84a" />
          {order.map((number, index) => (
            <g key={number}>
              <path d={wedge(100, 100, 93, index * slice, (index + 1) * slice, 54)} fill={fill[rules.colorOf(number)]} stroke="#0d0d14" strokeWidth=".5" />
              <text x="100" y="19" textAnchor="middle" fontSize="8.4" fontWeight="800" fill="#fff6dc" transform={`rotate(${(index + 0.5) * slice} 100 100)`}>{number}</text>
            </g>
          ))}
          <circle cx="100" cy="100" r="52" fill="#2a1f4d" stroke="#e8b84a" strokeWidth="2" />
          <circle cx="100" cy="100" r="40" fill="none" stroke="#e8b84a" strokeWidth=".6" strokeDasharray="2 3" />
        </svg>
        <div className="cz-hub" data-color={color ?? 'idle'} data-spinning={spinning}>{landed ?? '·'}</div>
      </div>
      <p className="cz-caption">{landed === null ? (spinning ? 'A roleta está girando…' : 'Escolha sua aposta na mesa e jogue.') : `Caiu no ${landed} · ${{ red: 'vermelho', black: 'preto', green: 'verde' }[rules.colorOf(landed)]}`}</p>
    </div>
  );
}

const keyOf = (kind: string, value: string | number) => `${kind}:${value}`;

/** Qual retorno o jogador teria se acertasse (um número qualquer que ganha). */
function payoutLabel(key: string) {
  const [kind, value] = key.split(':') as [string, string];
  const bet = rules.parseRouletteBet({ kind, value: kind === 'number' || kind === 'dozen' ? Number(value) : value });
  if (!bet) return '';
  for (let n = 0; n <= 36; n++) {
    const pay = rules.roulettePayout(bet, n);
    if (pay > 0) return times(pay);
  }
  return '';
}

/** Mesa de apostas da roleta: números, cores, par/ímpar, metades, dúzias e os grupos de Pokémon. */
export function RouletteBoard({ bet, onBet, disabled }: { bet: string; onBet: (bet: string) => void; disabled?: boolean }) {
  const cell = (kind: string, value: string | number, label: React.ReactNode, className: string, title?: string) => {
    const key = keyOf(kind, value);
    return <button key={key} type="button" className={className} data-selected={bet === key} aria-pressed={bet === key} disabled={disabled} title={title}
      onClick={() => onBet(key)}>{label}</button>;
  };
  const rows = [3, 2, 1].map((offset) => Array.from({ length: 12 }, (_, column) => column * 3 + offset));
  return (
    <div className="cz-board" role="group" aria-label="Mesa da roleta">
      <div className="cz-board-numbers">
        {cell('number', 0, '0', 'cz-num cz-zero', 'Número 0')}
        <div className="cz-board-grid">
          {rows.flat().map((n) => <span key={n} className="cz-num-wrap" data-color={rules.colorOf(n)}>{cell('number', n, n, 'cz-num', `Número ${n}`)}</span>)}
        </div>
      </div>
      <div className="cz-board-outside">
        {cell('color', 'red', 'Vermelho', 'cz-out cz-red')}
        {cell('color', 'black', 'Preto', 'cz-out cz-black')}
        {cell('color', 'green', 'Verde (0)', 'cz-out cz-green')}
        {cell('parity', 'odd', 'Ímpar', 'cz-out')}
        {cell('parity', 'even', 'Par', 'cz-out')}
        {cell('half', 'low', '1 a 18', 'cz-out')}
        {cell('half', 'high', '19 a 36', 'cz-out')}
        {[1, 2, 3].map((d) => cell('dozen', d, `${d}ª dúzia`, 'cz-out'))}
      </div>
      <div className="cz-board-groups">
        {(Object.entries(rules.GROUP_SPECIES) as [rules.RouletteGroup, number][]).map(([group, species]) =>
          cell('group', group, <><SpeciesSprite id={species} className="cz-sprite cz-sprite-chip" /><span>{group[0]!.toUpperCase()}{group.slice(1)}</span></>, 'cz-out cz-group', `Grupo ${group}`))}
      </div>
      <p className="cz-bet-hint">Aposta: <b>{betName(bet)}</b>{payoutLabel(bet) && <> · paga <b>{payoutLabel(bet)}</b></>}</p>
    </div>
  );
}

const names: Record<string, string> = {
  'color:red': 'Vermelho', 'color:black': 'Preto', 'color:green': 'Verde', 'parity:odd': 'Ímpar', 'parity:even': 'Par', 'half:low': '1 a 18', 'half:high': '19 a 36',
};
export function betName(key: string) {
  if (names[key]) return names[key];
  const [kind, value] = key.split(':');
  if (kind === 'number') return `Número ${value}`;
  if (kind === 'dozen') return `${value}ª dúzia`;
  if (kind === 'group') return `Grupo ${value}`;
  return key;
}
