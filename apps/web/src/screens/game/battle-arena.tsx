import type { CSSProperties, ReactNode } from 'react';
import { arenaLayout, arenaOf, type ArenaId, type ArenaSide, type BattleContext } from '@pokesim-evolution/data/arenas';
import '@/styles/arena.css';

const arenaUrl = (path: string) => `${import.meta.env.BASE_URL}recursos/Arenas/${path}`;

/** Ponto da arena (em frações da imagem) onde um dos lados pisa; `data-facing` diz para onde ele olha. */
export function ArenaSpot({ side, children }: { side: ArenaSide; children: ReactNode }) {
  const spot = arenaLayout.spots[side];
  const style: CSSProperties = { left: `${spot.x * 100}%`, top: `${spot.y * 100}%` };
  return <div className="battle-arena-spot" data-side={side} data-facing={spot.olhando} style={style}>{children}</div>;
}

/**
 * A arena de uma batalha. O cenário vem do mapa onde o jogador está (selvagens);
 * ginásios, torneios e treinadores usam o cenário padrão. Os `children` ficam por cima da plataforma
 * (use `ArenaSpot` para posicionar os Pokémon).
 */
export function BattleArena({ context, scene, className, children }: {
  context?: BattleContext;
  /** Força um cenário (para pré-visualizar); sem isso ele sai do `context`. */
  scene?: ArenaId;
  className?: string;
  children?: ReactNode;
}) {
  const id = scene ?? (context ? arenaOf(context) : 'estadio');
  return (
    <div className={['battle-arena', className].filter(Boolean).join(' ')} data-arena={id}>
      <img className="battle-arena-layer" src={arenaUrl(`fundos/${id}.png`)} alt="" draggable={false} />
      <img className="battle-arena-layer" src={arenaUrl('plataforma.png')} alt="" draggable={false} />
      <div className="battle-arena-front">{children}</div>
    </div>
  );
}
