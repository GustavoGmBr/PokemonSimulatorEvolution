import { useEffect, useState } from 'react';
import { ArrowRight, Compass, FolderOpen, MapPin, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { replaceSpecies, starterUid } from '@/lib/pokemon-collection';
import { createSave, loadSaves, savesKey, starterSpeciesIds, updateSaves, type GameMode, type JourneyDraft, type JourneySave } from '@/lib/journey-saves';
import { JourneySetup } from './journey-setup';
import { SaveManager } from './save-manager';
import cover from '@/assets/kanto-cover.webp';
import { gameStorage } from '@/lib/game-storage';

export function HomeScreen({ onPlay, unavailable }: {
  onPlay: (save: JourneySave) => void;
  unavailable: boolean;
}) {
  const [storage, setStorage] = useState(readStoredSaves);
  const [creating, setCreating] = useState(false);
  const [reduceMotion, setReduceMotion] = useMotionPreference();
  const { saves, error } = storage;
  const latest = saves[0];

  useEffect(() => {
    function refresh(event: StorageEvent) {
      if (event.key === savesKey || event.key === null) setStorage(readStoredSaves());
    }
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  async function changeSaves(change: (current: JourneySave[]) => JourneySave[]) {
    const nextSaves = await updateSaves(change);
    setStorage({ saves: nextSaves, error: '' });
  }

  async function editSave(draft: JourneyDraft, id: string) {
    await changeSaves((current) => {
      const existing = current.find((save) => save.id === id);
      if (!existing) throw new Error('Este save já foi excluído.');
      // Ao trocar o inicial, o Pokémon antigo sai da lista de capturados e o novo entra.
      const caughtSpecies = draft.starter === existing.starter ? existing.progress.caughtSpecies
        : [...new Set([...existing.progress.caughtSpecies.filter((species) => species !== starterSpeciesIds[existing.starter]),
          starterSpeciesIds[draft.starter]])];
      // O Pokémon inicial acompanha a troca de inicial, esteja ele na equipe ou no PC.
      const collection = draft.starter === existing.starter ? existing.collection
        : replaceSpecies(existing.collection, starterUid, starterSpeciesIds[draft.starter]);
      return [{ id, ...draft, progress: { ...existing.progress, caughtSpecies }, collection, wild: existing.wild }, ...current.filter((save) => save.id !== id)];
    });
  }

  async function finishSetup(draft: JourneyDraft, mode: GameMode) {
    const save = createSave({ ...draft, mode });
    await changeSaves((current) => [save, ...current]);
    setCreating(false);
    onPlay(save);
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="brand" aria-label="Pokémon Simulator Evolution">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>Pokémon Simulator<small>EVOLUTION</small></span>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="settings-button"><Settings /> Configurações</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Configurações</DialogTitle>
              <DialogDescription>Personalize a apresentação do jogo neste navegador.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <label htmlFor="reduce-motion" className="text-sm font-bold">Reduzir animações</label>
              <Switch id="reduce-motion" checked={reduceMotion} onCheckedChange={setReduceMotion} />
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <main className="home-main">
        <section className="home-copy" aria-labelledby="home-title">
          <h1 id="home-title">Sua jornada<br />começa <em>aqui.</em></h1>
          <p className="home-description">Escolha seu primeiro Pokémon e prepare-se para explorar Kanto.</p>

          <div className="home-actions">
            <Dialog open={creating} onOpenChange={setCreating}>
              <DialogTrigger asChild>
                <Button className="home-action home-action-primary">
                  <Plus /><span>Nova jornada</span><ArrowRight className="action-arrow" />
                </Button>
              </DialogTrigger>
              <DialogContent className="journey-dialog">
                <JourneySetup onSave={finishSetup} submitLabel="Começar jornada" />
              </DialogContent>
            </Dialog>
            <Button variant="outline" className="home-action home-action-secondary" disabled={!latest}
              onClick={() => { if (latest) onPlay(latest); }}>
              <FolderOpen /><span>Continuar jornada</span><ArrowRight className="action-arrow" />
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <p className="home-save" aria-live="polite">
                {latest ? `Último save de ${latest.trainer} · ${latest.starter}` : 'Nenhuma jornada neste navegador.'}
              </p>
              <SaveManager saves={saves} onChange={changeSaves} onEdit={editSave} onPlay={onPlay} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {unavailable && !error && <p role="status" className="text-sm text-muted-foreground">A jornada deste endereço não está disponível neste navegador.</p>}
          </div>
        </section>

        <figure className="home-cover">
          <img src={cover} alt="Bulbasaur, Charmander e Squirtle em uma trilha cercada de campos verdes." fetchPriority="high" />
          <figcaption className="cover-caption">
            <span className="cover-pin"><MapPin aria-hidden="true" /></span>
            <span><small>REGIÃO INICIAL</small><strong>Kanto</strong></span>
            <Compass className="cover-compass" aria-hidden="true" />
          </figcaption>
        </figure>
      </main>

      <footer className="home-footer">
        <span>Projeto de fã</span>
      </footer>
    </div>
  );
}

function readStoredSaves() {
  try {
    return { saves: loadSaves(gameStorage), error: '' };
  } catch {
    return { saves: [], error: 'Não foi possível ler os saves deste navegador.' };
  }
}
