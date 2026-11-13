import { useCallback, useRef, useState } from 'react';
import type { ChangeGame, GameState } from '@/lib/game-state';
import { deleteSave, saveGameState, type JourneySave } from '@/lib/journey-saves';
import { getAt, locate } from '@/lib/pokemon-collection';

/** Estado do jogo em andamento (coleção e progresso): muda na tela na hora e é gravado no save em seguida. */
export function useJourneyState(save: JourneySave): [GameState, ChangeGame, boolean] {
  const [state, setState] = useState<GameState>(() => ({ progress: save.progress, collection: save.collection, wild: save.wild }));
  const [gameOver, setGameOver] = useState(false);
  const latest = useRef(state);
  const over = useRef(false);
  const saveId = save.id;

  const change = useCallback<ChangeGame>((update) => {
    if (over.current) return 'O save foi apagado.';
    const result = update(latest.current);
    if (typeof result === 'string') return result;
    // Morte permanente: sem nenhum Pokémon (a equipe só fica vazia nesse caso), o save é apagado em vez de gravado.
    if (result.progress.mode === 'permadeath' && result.collection.team.length === 0) {
      over.current = true;
      setGameOver(true);
      void deleteSave(saveId).catch(() => undefined);
      return null;
    }
    const stake = latest.current.progress.casinoRound?.stake.uid;
    if (stake && result.progress.casinoRound) {
      const place = locate(result.collection, stake);
      const pokemon = place && getAt(result.collection, place);
      if (!pokemon || pokemon.favorite || (place.kind === 'team' && result.collection.team.length === 1)) {
        return 'Termine a rodada do cassino antes de proteger ou remover o Pokémon apostado.';
      }
    }

    latest.current = result;
    setState(result);
    void saveGameState(saveId, result).catch(() => undefined);
    return null;
  }, [saveId]);

  return [state, change, gameOver];
}
