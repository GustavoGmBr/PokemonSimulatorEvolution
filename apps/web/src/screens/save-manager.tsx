import { useRef, useState, type ChangeEvent } from 'react';
import { Archive, Download, FolderOpen, Pencil, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createSave, downloadSaveBackup, readSaveBackup, type JourneyDraft, type JourneySave } from '@/lib/journey-saves';
import { JourneySetup } from './journey-setup';

type SaveManagerProps = {
  saves: JourneySave[];
  onChange: (change: (current: JourneySave[]) => JourneySave[]) => Promise<void>;
  onEdit: (draft: JourneyDraft, id: string) => Promise<void>;
  onPlay: (save: JourneySave) => void;
};

type SaveView = { action: 'edit' | 'delete'; save: JourneySave };

export function SaveManager({ saves, onChange, onEdit, onPlay }: SaveManagerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SaveView | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function showView(nextView: SaveView | null) {
    setError('');
    setMessage('');
    setView(nextView);
  }

  function pickFile() {
    input.current?.click();
    setOpen(true);
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || busy) return;

    setError('');
    setMessage('');
    setBusy(true);
    try {
      const imported = readSaveBackup(await file.text()).map(createSave);
      await onChange((current) => [...imported, ...current]);
      setMessage(imported.length === 1 ? '1 save importado.' : `${imported.length} saves importados.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível importar o arquivo.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSave(save: JourneySave) {
    setBusy(true);
    setError('');
    try {
      await onChange((current) => current.filter(({ id }) => id !== save.id));
      setView(null);
      setMessage('Save excluído.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível excluir o save.');
    } finally {
      setBusy(false);
    }
  }

  function exportAll() {
    downloadSaveBackup(saves, 'pokemon-evolution-backup.json');
  }

  function exportSave(save: JourneySave) {
    downloadSaveBackup([save], `pokemon-evolution-save-${save.id}.json`);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) showView(null);
    }}>
      <input ref={input} type="file" accept=".json,application/json" hidden
        aria-label="Arquivo de backup" onChange={importFile} />
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="justify-self-start px-2">
              <Archive /> Gerenciar saves
            </Button>
          </DialogTrigger>
        </ContextMenuTrigger>
        <ContextMenuContent className="z-[60]">
          <ContextMenuItem disabled={busy} onSelect={pickFile}><Upload /> Importar saves</ContextMenuItem>
          <ContextMenuItem disabled={saves.length === 0} onSelect={exportAll}><Download /> Exportar todos</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <DialogContent className="journey-dialog">
        {view?.action === 'edit' ? (
          <JourneySetup key={view.save.id} draft={view.save} onSave={async (draft) => {
            await onEdit(draft, view.save.id);
            setView(null);
            setMessage('Jornada atualizada.');
          }} />
        ) : view?.action === 'delete' ? (
          <>
            <DialogHeader>
              <DialogTitle>Excluir save?</DialogTitle>
              <DialogDescription>A jornada de {view.save.trainer} com {view.save.starter} será removida deste navegador.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={() => showView(null)}>Cancelar</Button>
              <Button variant="destructive" disabled={busy} onClick={() => void deleteSave(view.save)}>Excluir save</Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Gerenciar saves</DialogTitle>
              <DialogDescription>Abra uma jornada ou transfira seus saves em um arquivo JSON.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={pickFile}><Upload /> Importar saves</Button>
              <Button variant="outline" size="sm" disabled={saves.length === 0} onClick={exportAll}><Download /> Exportar todos</Button>
            </div>
            {saves.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma jornada salva neste navegador.</p>
            ) : (
              <ul className="grid gap-2">
                {saves.map((save) => (
                  <li key={save.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1 rounded-lg border p-1">
                    <ContextMenu modal={false}>
                      <ContextMenuTrigger asChild>
                        <Button variant="ghost" className="h-auto min-w-0 justify-start px-2 py-1.5"
                          onClick={() => onPlay(save)}>
                          <FolderOpen />
                          <span className="min-w-0 text-left">
                            <strong className="block truncate">{save.trainer}</strong>
                            <small className="block text-muted-foreground">{save.starter}{save.progress.mode === 'permadeath' ? ' · Morte permanente' : ''}{save.progress.cycle > 0 ? ` · Novo Jogo+ ${save.progress.cycle}` : ''}</small>
                          </span>
                        </Button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="z-[60]">
                        <ContextMenuItem onSelect={() => onPlay(save)}><FolderOpen /> Abrir jornada</ContextMenuItem>
                        <ContextMenuItem onSelect={() => showView({ action: 'edit', save })}><Pencil /> Editar jornada</ContextMenuItem>
                        <ContextMenuItem onSelect={() => exportSave(save)}><Download /> Exportar save</ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem variant="destructive" onSelect={() => showView({ action: 'delete', save })}>
                          <Trash2 /> Excluir save
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar save de ${save.trainer}`}
                      onClick={() => showView({ action: 'edit', save })}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Exportar save de ${save.trainer}`} onClick={() => exportSave(save)}>
                      <Download />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Excluir save de ${save.trainer}`}
                      onClick={() => showView({ action: 'delete', save })}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p role="status" className={message ? 'text-sm text-muted-foreground' : 'sr-only'}>{message}</p>
      </DialogContent>
    </Dialog>
  );
}
