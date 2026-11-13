import { useEffect, useState, type ReactNode } from 'react';
import { Maximize, Minimize, Music, RotateCcw, SkipForward, Video, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { battleKeyActions, resetBattleKeys, setBattleKey, useBattleKeys, type BattleKeyAction } from '@/lib/battle-keys';
import {
  exploreActions, resetExploreKeys, resetShortcutKeys, setExploreKey, setShortcutKey, useControlsVersion, useExploreKeys, type ExploreAction,
} from '@/lib/controls';
import { nextTrack, useRadio } from '@/lib/radio';
import { animationSpeeds, textSpeeds, themes, updateSettings, useSettings, type Settings } from '@/lib/settings';
import { gameActions, gameAreas, shortcutLabel } from './game-navigation';

type Props = {
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
  fullscreen: boolean;
  toggleFullscreen: () => Promise<void>;
};

function Section({ id, title, description, wide, children }: { id: string; title: string; description?: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`game-panel grid gap-3 self-start${wide ? ' xl:col-span-2' : ''}`} aria-labelledby={`options-section-${id}`}>
      <div>
        <h2 id={`options-section-${id}`} className="game-section-title">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-bold" id={`choice-${label}`}>{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`choice-${label}`}>
        {options.map((option) => (
          <Button key={option.id} type="button" size="sm" variant={option.id === value ? 'default' : 'outline'}
            role="radio" aria-checked={option.id === value} onClick={() => onChange(option.id)}>
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Linha "ação → tecla": clicar e apertar a nova tecla (Esc cancela). */
function KeyRow({ label, scope, shown, binding, onBind, onKey }: {
  label: string;
  /** Grupo da tecla (só para leitores de tela: "Mochila" existe na batalha e no menu). */
  scope: string;
  shown: string;
  binding: boolean;
  onBind: () => void;
  onKey: (key: string) => void;
}) {
  useEffect(() => {
    if (!binding) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return;
      event.preventDefault();
      event.stopPropagation();
      onKey(event.key);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [binding, onKey]);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Button type="button" size="sm" variant={binding ? 'default' : 'outline'} onClick={onBind}
        aria-label={binding ? `${scope} ${label}: aperte a nova tecla (Esc cancela)` : `${scope} ${label}: tecla ${shown}. Trocar`}>
        {binding ? 'Aperte uma tecla…' : <kbd className="game-key">{shown}</kbd>}
      </Button>
    </div>
  );
}

function Controls() {
  useControlsVersion();
  const explore = useExploreKeys();
  const battle = useBattleKeys();
  const [binding, setBinding] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  /** Aplica a tecla apertada à linha que está esperando; Esc cancela. */
  const finish = (apply: (key: string) => string | null) => (key: string) => {
    if (key === 'Escape') { setBinding(null); setMessage(''); return; }
    const problem = apply(key);
    setMessage(problem ?? '');
    if (!problem) setBinding(null);
  };

  const shortcuts = [
    ...(['command', 'sidebar', 'fullscreen', 'motion', 'exit', 'back', 'confirm'] as const).map((id) => ({
      id: `action:${id}`, label: gameActions[id].label, key: gameActions[id].key,
    })),
    ...gameAreas.map((area) => ({ id: `area:${area.id}`, label: area.label, key: area.key })),
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section id="controls-explore" title="Explorar o mapa" description="Setas e Enter continuam funcionando além das teclas abaixo.">
        {exploreActions.map((action) => (
          <KeyRow key={action.id} scope="Explorar:" label={action.label} shown={explore[action.id]} binding={binding === `explore:${action.id}`}
            onBind={() => { setBinding(`explore:${action.id}`); setMessage(''); }}
            onKey={finish((key) => setExploreKey(action.id as ExploreAction, key))} />
        ))}
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => { resetExploreKeys(); setMessage(''); }}>
          <RotateCcw /> Restaurar padrão
        </Button>
      </Section>

      <Section id="controls-battle" title="Batalha" description="Um atalho por golpe e um por menu.">
        {battleKeyActions.map((action) => (
          <KeyRow key={action.id} scope="Batalha:" label={action.label} shown={battle[action.id]} binding={binding === `battle:${action.id}`}
            onBind={() => { setBinding(`battle:${action.id}`); setMessage(''); }}
            onKey={finish((key) => setBattleKey(action.id as BattleKeyAction, key))} />
        ))}
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => { resetBattleKeys(); setMessage(''); }}>
          <RotateCcw /> Restaurar padrão
        </Button>
      </Section>

      <Section id="controls-menu" wide title="Atalhos do menu (Ctrl/⌘ + tecla)" description="Se a tecla já tiver dono, as duas ações trocam de tecla.">
        <div className="grid gap-2 md:grid-cols-2 md:gap-x-8 xl:grid-cols-3">
          {shortcuts.map((shortcut) => (
            <KeyRow key={shortcut.id} scope="Menu:" label={shortcut.label} shown={shortcutLabel(shortcut.key)} binding={binding === shortcut.id}
              onBind={() => { setBinding(shortcut.id); setMessage(''); }}
              onKey={finish((key) => setShortcutKey(shortcut.id, key))} />
          ))}
        </div>
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => { resetShortcutKeys(); setMessage(''); }}>
          <RotateCcw /> Restaurar padrão
        </Button>
      </Section>

      {message && <p role="alert" className="text-sm font-bold text-destructive xl:col-span-2">{message}</p>}
    </div>
  );
}

export function OptionsScreen({ reduceMotion, setReduceMotion, fullscreen, toggleFullscreen }: Props) {
  const settings = useSettings();
  const radio = useRadio();
  const set = (patch: Partial<Settings>) => updateSettings(patch);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Section id="theme" title="Aparência" description="O tema vale para todo o jogo, em todos os saves.">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tema">
            {themes.map((theme) => (
              <button key={theme.id} type="button" role="radio" aria-checked={settings.theme === theme.id}
                className="options-theme" data-active={settings.theme === theme.id} onClick={() => set({ theme: theme.id })}>
                <span className="options-swatch" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${theme.swatch[0]} 50%, ${theme.swatch[1]} 50%)` }} />
                <span className="grid text-left"><span className="font-bold">{theme.label}</span><span className="text-xs text-muted-foreground">{theme.description}</span></span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="game-reduce-motion" className="text-sm font-bold">Reduzir animações <kbd className="game-key">{shortcutLabel(gameActions.motion.key)}</kbd></label>
            <Switch id="game-reduce-motion" checked={reduceMotion} onCheckedChange={setReduceMotion} />
          </div>
          {document.fullscreenEnabled && (
            <Button variant="outline" className="justify-between" onClick={() => void toggleFullscreen()}>
              {fullscreen ? <Minimize /> : <Maximize />}
              <span className="mr-auto">{fullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}</span>
              <kbd className="game-key">{shortcutLabel(gameActions.fullscreen.key)}</kbd>
            </Button>
          )}
        </Section>

        <div className="grid gap-4 self-start">
          <Section id="speed" title="Velocidade" description="Do texto das batalhas e das animações dos golpes.">
            <Choice label="Velocidade do texto" value={settings.textSpeed} options={textSpeeds} onChange={(textSpeed) => set({ textSpeed })} />
            <Choice label="Velocidade das animações" value={settings.animationSpeed} options={animationSpeeds} onChange={(animationSpeed) => set({ animationSpeed })} />
          </Section>

          <Section id="radio" title="Rádio" description="Toca, em ordem aleatória, as músicas da pasta recursos/Sons/Musicas.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="options-radio" className="flex items-center gap-2 text-sm font-bold"><Music aria-hidden="true" className="size-4" /> Ligar o rádio</label>
              <Switch id="options-radio" checked={settings.radioEnabled} disabled={!radio.available}
                onCheckedChange={(radioEnabled) => set({ radioEnabled })} />
            </div>
            {!radio.available && <p className="text-sm text-muted-foreground">Nenhuma música encontrada na pasta de músicas.</p>}
            <label className="grid gap-1 text-sm font-bold">
              Volume ({Math.round(settings.radioVolume * 100)}%)
              <input type="range" min={0} max={100} step={5} value={Math.round(settings.radioVolume * 100)}
                onChange={(event) => set({ radioVolume: Number(event.target.value) / 100 })} />
            </label>
            {settings.radioEnabled && (
              <div className="flex flex-wrap items-center justify-between gap-2" role="status">
                <span className="text-sm text-muted-foreground">
                  {radio.waiting ? 'Aperte qualquer tecla ou clique na página para o navegador liberar o som.' : radio.title ? `Tocando: ${radio.title}` : 'Carregando…'}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={nextTrack}><SkipForward /> Próxima</Button>
              </div>
            )}
          </Section>

          <Section id="effects" title="Efeitos sonoros" description="Música de abertura da batalha, captura e Pokémon brilhante (pasta recursos/Sons/Efeitos). Durante a batalha o rádio fica a 10%.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="options-effects" className="flex items-center gap-2 text-sm font-bold"><Volume2 aria-hidden="true" className="size-4" /> Ligar os efeitos</label>
              <Switch id="options-effects" checked={settings.effectsEnabled} onCheckedChange={(effectsEnabled) => set({ effectsEnabled })} />
            </div>
            <label className="grid gap-1 text-sm font-bold">
              Volume ({Math.round(settings.effectsVolume * 100)}%)
              <input type="range" min={0} max={100} step={5} value={Math.round(settings.effectsVolume * 100)} disabled={!settings.effectsEnabled}
                onChange={(event) => set({ effectsVolume: Number(event.target.value) / 100 })} />
            </label>
          </Section>

          <Section id="video" title="Player de vídeo" description="Um player do YouTube no canto da tela, para música, vídeos ou lives enquanto joga.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="options-video" className="flex items-center gap-2 text-sm font-bold"><Video aria-hidden="true" className="size-4" /> Mostrar o player</label>
              <Switch id="options-video" checked={settings.videoEnabled} onCheckedChange={(videoEnabled) => set({ videoEnabled })} />
            </div>
          </Section>
        </div>
      </div>

      <h2 className="game-section-title mt-2">Controles</h2>
      <Controls />
    </div>
  );
}
