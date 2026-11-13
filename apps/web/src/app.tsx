import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { VideoDock } from '@/components/video-dock';
import { startRadio } from '@/lib/radio';
import { useSettings } from '@/lib/settings';
import { loadSaves, savesKey, updateSaves } from '@/lib/journey-saves';
import { getTrainerSprite } from '@/lib/trainer-sprites';
import { HomeScreen } from '@/screens/home-screen';
import { GameScreen } from '@/screens/game/game-screen';
import { gameUrl, readGameUrl } from '@/screens/game/game-navigation';
import { FxGalleryScreen } from '@/screens/fx-gallery-screen';

function subscribeToRoute(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function getRoute() {
  return window.location.hash;
}

function findSave(id: string) {
  try {
    return loadSaves(localStorage).find((save) => save.id === id);
  } catch {
    return undefined;
  }
}

function Routes() {
  const hash = useSyncExternalStore(subscribeToRoute, getRoute);
  const route = readGameUrl(hash);
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const save = route && findSave(route.saveId);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === savesKey || event.key === null) refresh();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (hash === '#/animacoes') return <FxGalleryScreen />;

  if (route && save) {
    return <GameScreen key={save.id} save={save} area={route.area} pokemonId={route.pokemonId}
      onChangeSprite={async (id) => {
        const sprite = getTrainerSprite(id);
        await updateSaves((current) => {
          const active = current.find((entry) => entry.id === save.id);
          if (!active || sprite?.gender !== active.gender) {
            throw new Error('O sprite selecionado não está disponível para esta jornada.');
          }
          return current.map((entry) => entry.id === active.id ? { ...entry, trainerSprite: id } : entry);
        });
        refresh();
      }}
      onChangeStarter={async (starter) => {
        await updateSaves((current) => current.map((entry) => entry.id === save.id ? { ...entry, starter } : entry));
        refresh();
      }}
      onNavigate={(area, pokemonId) => { window.location.hash = gameUrl(save.id, area, pokemonId); }}
      onExit={() => { window.location.hash = ''; }} />;
  }

  return <HomeScreen onPlay={(journey) => { window.location.hash = gameUrl(journey.id); }}
    unavailable={route !== null} />;
}

export function App() {
  const { videoEnabled } = useSettings();
  useEffect(() => startRadio(), []);

  return (
    <>
      <Routes />
      {videoEnabled && <VideoDock />}
    </>
  );
}
