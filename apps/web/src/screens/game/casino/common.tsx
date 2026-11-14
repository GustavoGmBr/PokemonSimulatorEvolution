import { getPokemon } from '@pokesim-evolution/data/pokedex';
import { useEffect, useRef } from 'react';
import { ItemIcon } from '@/components/item-icon';
import { GameSprite } from '../pokedex-media';

/** Quem pediu menos movimento (nas Opções ou no sistema) vê o resultado na hora, sem esperar a animação. */
export function reducedMotion() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.hasAttribute('data-reduced-motion') || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}
/** Duração de uma etapa da animação: 0 quando o movimento está reduzido. */
export const span = (ms: number) => (reducedMotion() ? 0 : ms);

/** Roda `play` (que devolve a função de limpeza) cada vez que `key` muda para um valor novo (ignora o valor inicial vazio). */
export function useStage(key: number | undefined, play: () => (() => void) | void) {
  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (key === undefined || key === last.current) return;
    last.current = key;
    return play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Agenda etapas (ms desde o início) e devolve a limpeza de todas. */
export function schedule(steps: readonly (readonly [number, () => void])[]) {
  const timers = steps.map(([ms, run]) => window.setTimeout(run, span(ms)));
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}

export function SpeciesSprite({ id, className = 'cz-sprite', shiny = false }: { id: number; className?: string; shiny?: boolean }) {
  const sprite = getPokemon(id)?.sprite;
  return sprite ? <GameSprite sprite={sprite} shiny={shiny} className={className} /> : <span className={`${className} cz-sprite-missing`} aria-hidden="true" />;
}

/** Ficha dourada do cassino. */
export function Coin({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <span className="cz-coin" data-size={size} aria-hidden="true"><i /></span>;
}

export const slotArt: Record<string, { item?: string; species?: number; label: string }> = {
  'poke-ball': { item: 'poke-ball', label: 'Poké Bola' }, 'great-ball': { item: 'great-ball', label: 'Great Ball' },
  'ultra-ball': { item: 'ultra-ball', label: 'Ultra Ball' }, 'master-ball': { item: 'master-ball', label: 'Master Ball' },
  pikachu: { species: 25, label: 'Pikachu' }, mewtwo: { species: 150, label: 'Mewtwo' }, mew: { species: 151, label: 'Mew' }, ditto: { species: 132, label: 'Ditto' },
};

export function SlotArt({ symbol, size = 44 }: { symbol: string; size?: number }) {
  const art = slotArt[symbol];
  if (!art) return <span className="cz-empty-cell" aria-label="Vazio"><i /></span>;
  return art.item ? <ItemIcon item={art.item} size={size} /> : <SpeciesSprite id={art.species!} className="cz-sprite cz-sprite-slot" />;
}

/** Formata multiplicadores como no resto do jogo (vírgula decimal). */
export const times = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×`;

/** Ângulo (graus) que leva o centro da fatia `index` (de `count`) até o ponteiro no topo, girando ao menos `turns` voltas a partir de `current`. */
export function landRotation(current: number, index: number, count: number, turns = 5) {
  const center = ((index + 0.5) * 360) / count;
  const need = (((-center - current) % 360) + 360) % 360;
  return current + turns * 360 + need;
}

/** Caminho SVG de uma fatia de círculo (ângulos em graus, 0 = topo, sentido horário). */
export function wedge(cx: number, cy: number, r: number, from: number, to: number, inner = 0) {
  const point = (radius: number, angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)] as const;
  };
  const [x1, y1] = point(r, from);
  const [x2, y2] = point(r, to);
  const large = to - from > 180 ? 1 : 0;
  if (!inner) return `M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
  const [x3, y3] = point(inner, to);
  const [x4, y4] = point(inner, from);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${x3.toFixed(2)} ${y3.toFixed(2)} A${inner} ${inner} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
}
