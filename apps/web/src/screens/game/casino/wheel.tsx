import { useState } from 'react';
import type { CasinoOutcome } from '@/lib/casino';
import * as rules from '@/lib/battle/casino-rules';
import { landRotation, schedule, span, times, useStage, wedge } from './common';

type Wheel = Extract<CasinoOutcome, { game: 'wheel' }>;
const colors: Record<number, string> = { 0: '#4b4a63', 0.25: '#7a5bd1', 0.5: '#2f86e0', 1: '#19a67c', 2: '#f2b705', 5: '#ff7a1a', 10: '#ff3d71' };

/** Wheel of Fortune: 50 casas coloridas pelo multiplicador; a roda gira e para sob o ponteiro. */
export function WheelStage({ outcome, playKey, onDone }: { outcome?: Wheel; playKey?: number; onDone: () => void }) {
  const [rotation, setRotation] = useState(0);
  const [landed, setLanded] = useState<number | null>(outcome ? (rules.WHEEL_LAYOUT[outcome.index] as number) : null);
  const [spinning, setSpinning] = useState(false);
  const count = rules.WHEEL_LAYOUT.length;
  const slice = 360 / count;

  useStage(playKey, () => {
    if (!outcome) return;
    setLanded(null);
    setSpinning(true);
    setRotation((current) => landRotation(current, outcome.index, count, 6));
    return schedule([[4600, () => { setSpinning(false); setLanded(rules.WHEEL_LAYOUT[outcome.index] as number); }], [5400, onDone]]);
  });

  return (
    <div className="cz-stage cz-fortune">
      <div className="cz-wheel-box">
        <span className="cz-pointer" aria-hidden="true" />
        <svg className="cz-wheel" viewBox="0 0 200 200" role="img" aria-label={landed === null ? 'Roda da fortuna' : `A roda parou em ${times(landed)}`}
          style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${span(4400)}ms` }}>
          <circle cx="100" cy="100" r="98" fill="#e8b84a" />
          {rules.WHEEL_LAYOUT.map((multiplier, index) => (
            <path key={index} d={wedge(100, 100, 94, index * slice, (index + 1) * slice)} fill={colors[multiplier]} stroke="#17132b" strokeWidth=".6" />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((tick) => (
            <circle key={tick} cx={100 + 96 * Math.cos((tick * 36 * Math.PI) / 180)} cy={100 + 96 * Math.sin((tick * 36 * Math.PI) / 180)} r="1.6" fill="#fff6dc" />
          ))}
          <circle cx="100" cy="100" r="30" fill="#2a1f4d" stroke="#e8b84a" strokeWidth="3" />
        </svg>
        <div className="cz-hub cz-hub-wheel" data-spinning={spinning} data-hit={landed !== null && landed >= 1}>{landed === null ? '?' : times(landed)}</div>
      </div>
      <ul className="cz-legend" aria-label="Multiplicadores da roda">
        {rules.WHEEL_SEGMENTS.map(({ multiplier, cells }) => (
          <li key={multiplier} data-hit={landed === multiplier}><i style={{ background: colors[multiplier] }} />{times(multiplier)} <small>{Math.round((cells / count) * 100)}%</small></li>
        ))}
      </ul>
    </div>
  );
}
