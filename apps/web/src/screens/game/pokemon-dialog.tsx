import { lazy, Suspense } from 'react';
import type { ChangeGame, GameState } from '@/lib/game-state';

const PokemonPanel = lazy(() => import('./pokemon-panel'));

type Props = {
  uid: string | null;
  state: GameState;
  change: ChangeGame;
  onClose: () => void;
  onOpenPokedex: (species: number) => void;
};

/** Ficha de um Pokémon (informações e gerenciamento), carregada só quando é aberta. */
export function PokemonDialog({ uid, ...props }: Props) {
  if (!uid) return null;
  return (
    <Suspense fallback={null}>
      <PokemonPanel uid={uid} {...props} />
    </Suspense>
  );
}
