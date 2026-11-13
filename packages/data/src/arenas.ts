import arenas from '../catalog/arenas.json';
import type { WildMapId } from './wild-maps';

// Arenas de batalha (imagens geradas por scripts/gerar-arenas.py). Cada batalha tem a mesma plataforma;
// o que muda é o cenário atrás dela: o mapa onde o jogador está nos selvagens, ou o "estadio" nos demais casos.
export type ArenaId = WildMapId | 'estadio';

/** De onde vem a batalha. Fora dos selvagens o cenário é sempre o padrão. */
export type BattleContext =
  | { kind: 'selvagem'; map: WildMapId }
  | { kind: 'ginasio' | 'torneio' | 'treinador' };

export const defaultArena: ArenaId = 'estadio';

export function arenaOf(context: BattleContext): ArenaId {
  return context.kind === 'selvagem' ? context.map : defaultArena;
}

export const arenaIds = arenas.cenarios as readonly ArenaId[];

export type ArenaSide = 'jogador' | 'adversario';
/** Para onde o Pokémon olha: o do jogador fica à esquerda olhando para a direita, e o inimigo o contrário. */
export type ArenaFacing = 'direita' | 'esquerda';

/** Tamanho da imagem em pixels e posição (em frações 0–1) onde cada lado pisa na plataforma, com a direção do olhar. */
export const arenaLayout = {
  width: arenas.largura,
  height: arenas.altura,
  horizon: arenas.horizonte,
  spots: arenas.posicoes as Record<ArenaSide, { x: number; y: number; olhando: ArenaFacing }>,
};
