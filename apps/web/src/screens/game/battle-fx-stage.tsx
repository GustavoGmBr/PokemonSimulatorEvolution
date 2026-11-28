import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import type { ArenaId } from '@pokesim-evolution/data/arenas';
import { arenaLayout } from '@pokesim-evolution/data/arenas';
import { ArenaSpot, BattleArena } from './battle-arena';
import { clearStage, playAnimation, prepareCanvas, type FxAnimation, type FxPlayback } from '@/lib/battle-fx';

export type SpriteState = 'idle' | 'fainted' | 'hidden' | 'captured';

function CombatImage({ sheet, art }: { sheet: string; art?: string }) {
  return <img key={art ?? sheet} src={art ?? sheet} className={art ? 'battle-form-art' : undefined}
    alt="" draggable={false} onError={(event) => {
      if (!event.currentTarget.classList.contains('battle-form-art')) return;
      event.currentTarget.classList.remove('battle-form-art');
      event.currentTarget.src = sheet;
    }} />;
}

/** Horda: os adversários fora de destaque, menores e ao redor do que está em destaque. Clicar num deles o escolhe como alvo. */
export interface HordeSprite { key: string; sheet: string; art?: string; state: SpriteState; label: string; onPick?: () => void }
/** Deslocamento (fração da arena) de cada acompanhante em relação ao adversário em destaque. */
const hordeOffsets = [[-0.15, 0.06], [0.1, 0.085], [-0.1, -0.07], [0.13, -0.06]] as const;

export interface FxStageHandle {
  /** Toca a animação de um golpe; `attacker` é quem ataca. Resolve quando termina. */
  play(animation: FxAnimation, attacker: 'jogador' | 'adversario', speed?: number): Promise<void>;
  stop(): void;
}

/** Arena com os dois Pokémon (folhas de sprites) e a camada onde os golpes são desenhados. */
export const FxStage = forwardRef<FxStageHandle, {
  scene?: ArenaId;
  playerSheet: string;
  enemySheet: string;
  playerArt?: string;
  enemyArt?: string;
  /** `fainted` some com uma queda; `hidden` ainda não entrou em campo; `captured` foi para dentro da bola. */
  playerState?: SpriteState;
  enemyState?: SpriteState;
  /** Horda: os outros adversários em campo. */
  others?: HordeSprite[];
  /** Camada por cima de tudo (painéis, bola de captura…); posicione com `position: absolute`. */
  overlay?: ReactNode;
  className?: string;
}>(function FxStage({ scene, playerSheet, enemySheet, playerArt, enemyArt, playerState = 'idle', enemyState = 'idle', others, overlay, className }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shaker = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLSpanElement>(null);
  const enemy = useRef<HTMLSpanElement>(null);
  const current = useRef<FxPlayback | null>(null);
  const seed = useRef(1);

  useEffect(() => { if (canvas.current) prepareCanvas(canvas.current); }, []);
  useEffect(() => () => current.current?.cancel(), []);

  useImperativeHandle(ref, () => ({
    async play(animation, attacker, speed = 1) {
      if (!canvas.current || !shaker.current) return;
      current.current?.cancel();
      seed.current += 1;
      const playback = playAnimation(
        { canvas: canvas.current, scene: shaker.current, actors: { jogador: player.current, adversario: enemy.current } },
        animation, attacker, seed.current * 7919, speed,
      );
      current.current = playback;
      await playback.done;
    },
    stop() {
      current.current?.cancel();
      if (canvas.current && shaker.current) {
        clearStage({ canvas: canvas.current, scene: shaker.current, actors: { jogador: player.current, adversario: enemy.current } });
      }
    },
  }), []);

  return (
    <BattleArena scene={scene} className={className}>
      <div className="battle-arena-shaker" ref={shaker}>
        <ArenaSpot side="jogador">
          <span className="battle-sprite" data-side="jogador" data-facing="direita" data-state={playerState} ref={player}><CombatImage sheet={playerSheet} art={playerArt} /></span>
        </ArenaSpot>
        <ArenaSpot side="adversario">
          <span className="battle-sprite" data-side="adversario" data-facing="esquerda" data-state={enemyState} ref={enemy}><CombatImage sheet={enemySheet} art={enemyArt} /></span>
        </ArenaSpot>
        {others?.map((other, slot) => {
          const [dx, dy] = hordeOffsets[slot % hordeOffsets.length]!;
          const spot = arenaLayout.spots.adversario;
          return (
            <div key={other.key} className="battle-arena-spot" data-side="adversario" data-facing="esquerda"
              style={{ left: `${(spot.x + dx) * 100}%`, top: `${(spot.y + dy) * 100}%`, zIndex: Math.round((spot.y + dy) * 100) }}>
              <button type="button" className="battle-sprite battle-horde-sprite" data-side="adversario" data-facing="esquerda" data-state={other.state}
                aria-label={`Escolher ${other.label} como alvo`} tabIndex={other.state === 'idle' ? 0 : -1} onClick={other.onPick}>
                <CombatImage sheet={other.sheet} art={other.art} />
              </button>
            </div>
          );
        })}
        <canvas className="battle-fx-canvas" ref={canvas} />
      </div>
      {overlay}
    </BattleArena>
  );
});
