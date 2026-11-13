import { useControlsVersion } from '@/lib/controls';
import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { defaultFilter } from 'cmdk';
import { ChevronDown, ChevronRight, House, IdCard, Keyboard, LogOut, Maximize, Minimize, PanelLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { TrainerSpritePreview } from '@/components/sprite-preview';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { restartJourney, savePlaySeconds, type JourneySave, type Starter } from '@/lib/journey-saves';
import { getTrainerSprite } from '@/lib/trainer-sprites';
import {
  areaGroups, gameActions, gameAreas, getArea, matchesShortcut, menuSections, overviewId, profileSection, sectionOf,
  shortcutAria, shortcutLabel, type GameAreaId,
} from './game-navigation';
import { StarterPicker } from '../starter-picker';
import { GameAreaContent } from './game-area-content';
import { Wallet } from './trainer-card';
import { useJourneyState } from './use-journey-state';

const PokemonCommands = lazy(() => import('./pokemon-commands'));

type GameScreenProps = {
  onChangeSprite: (id: string) => Promise<void>;
  onChangeStarter: (starter: Starter) => Promise<void>;
  save: JourneySave;
  area: GameAreaId;
  pokemonId?: number;
  onNavigate: (id: GameAreaId, pokemonId?: number) => void;
  onExit: () => void;
};

type SidebarSectionProps = {
  section: (typeof menuSections)[number];
  area: GameAreaId;
  open: boolean;
  onToggle: () => void;
  goTo: (id: GameAreaId) => void;
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  large?: boolean;
  extra?: ReactNode;
};

function SidebarSection({ section, area, open, onToggle, goTo, icon, title = section.label, subtitle, large, extra }: SidebarSectionProps) {
  const active = (section.areas as readonly GameAreaId[]).includes(area);
  const listId = `game-submenu-${section.id}`;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton data-game-area={section.id} size={large ? 'lg' : 'default'} isActive={active && !open}
        aria-expanded={open} aria-controls={listId} tooltip={title} onClick={onToggle}>
        {icon ?? <section.icon aria-hidden="true" />}
        {subtitle ? (
          <span className="game-profile-text"><strong>{title}</strong><small>{subtitle}</small></span>
        ) : <span>{title}</span>}
        <ChevronDown className={`game-nav-chevron ml-auto ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub id={listId}>
          {section.areas.map((id) => {
            const item = getArea(id);
            return (
              <SidebarMenuSubItem key={id}>
                <SidebarMenuSubButton asChild isActive={id === area}>
                  <button type="button" className="w-full cursor-pointer text-left" data-game-area={id}
                    aria-current={id === area ? 'page' : undefined} aria-keyshortcuts={shortcutAria(item.key)}
                    onClick={() => goTo(id)}>
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                    <kbd className="game-nav-key" aria-hidden="true">{shortcutLabel(item.key)}</kbd>
                  </button>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
          {extra}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

export function GameScreen(props: GameScreenProps) {
  useControlsVersion(); // as teclas dos atalhos mostradas na tela mudam junto com Opções → Controles
  return (
    <SidebarProvider className="game-shell" style={{ '--sidebar-width': '15.5rem' } as React.CSSProperties}>
      <GameLayout {...props} />
    </SidebarProvider>
  );
}

function GameLayout({ save, area, pokemonId, onNavigate, onExit, onChangeSprite, onChangeStarter }: GameScreenProps) {
  const { isMobile, open, openMobile, setOpen, setOpenMobile, toggleSidebar } = useSidebar();
  const [commandOpen, setCommandOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [displayError, setDisplayError] = useState('');
  const [reduceMotion, setReduceMotion] = useMotionPreference();
  const navigation = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = gameAreas.find(({ id }) => id === area) ?? gameAreas[0]!;
  const trainerSprite = getTrainerSprite(save.trainerSprite);
  const [playSeconds, setPlaySeconds] = useState(save.progress.playSeconds);
  const [game, change, gameOver] = useJourneyState(save);
  const liveSave = { ...save, progress: { ...game.progress, playSeconds }, collection: game.collection };
  const [newStarter, setNewStarter] = useState<Starter | null>(null);
  const [restartError, setRestartError] = useState('');

  /** Novo Jogo+: recomeça o save do zero com o inicial escolhido (qualquer geração). */
  async function startNewGamePlus() {
    if (!newStarter) return;
    const starter = newStarter;
    const error = change((state) => (state.progress.restart ? restartJourney(state, starter) : 'O jogo já recomeçou.'));
    if (error) { setRestartError(error); return; }
    setRestartError('');
    setNewStarter(null);
    try { await onChangeStarter(starter); } catch { /* o save já recomeçou; só o nome do inicial no menu não foi atualizado */ }
    onNavigate(overviewId);
  }

  // Conta o tempo jogado enquanto a aba está visível e grava a cada 30 s, ao ocultar a aba e ao sair.
  useEffect(() => {
    let seconds = save.progress.playSeconds;
    let saved = Math.floor(seconds);
    let last = performance.now();
    let visible = document.visibilityState === 'visible';

    function commit() {
      const now = performance.now();
      if (visible) seconds += (now - last) / 1000;
      last = now;
      const whole = Math.floor(seconds);
      setPlaySeconds(whole);
      if (whole !== saved) {
        saved = whole;
        void savePlaySeconds(save.id, whole).catch(() => undefined);
      }
    }
    function onVisibility() {
      commit();
      visible = document.visibilityState === 'visible';
    }

    const interval = window.setInterval(commit, 30_000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', commit);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', commit);
      commit();
    };
  }, [save.id]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const section = sectionOf(area);
    return section ? { [section.id]: true } : {};
  });

  useEffect(() => {
    const section = sectionOf(area);
    if (section) setOpenSections((previous) => previous[section.id] ? previous : { ...previous, [section.id]: true });
  }, [area]);

  function toggleSection(id: string) {
    // Com o menu recolhido (só ícones), o clique expande o menu e abre o submenu.
    if (!isMobile && !open) {
      setOpen(true);
      setOpenSections((previous) => ({ ...previous, [id]: true }));
    } else {
      setOpenSections((previous) => ({ ...previous, [id]: !previous[id] }));
    }
  }

  function goTo(id: GameAreaId, speciesId?: number) {
    setCommandOpen(false);
    setOpenMobile(false);
    onNavigate(id, speciesId);
  }

  function openCommand() {
    setOpenMobile(false);
    setCommandOpen(true);
  }

  async function toggleFullscreen() {
    setDisplayError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setDisplayError('O navegador não conseguiu alternar a tela cheia.');
    }
  }

  function moveFocus(key: string, target: HTMLElement | null) {
    const nav = navigation.current?.closest<HTMLElement>('[data-sidebar="sidebar"]') ?? navigation.current;
    const inNav = Boolean(target && nav?.contains(target));
    const left = key === 'arrowleft' || key === 'a';
    const right = key === 'arrowright' || key === 'd';

    if (right && inNav) {
      if (isMobile) setOpenMobile(false);
      requestAnimationFrame(() => heading.current?.focus());
      return true;
    }
    if (left && !inNav && isMobile && !openMobile) {
      setOpenMobile(true);
      return true;
    }
    if (!nav || (!inNav && !left && target !== document.body && target !== heading.current)) return false;

    const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-game-area]'));
    const active = buttons.find((button) => button.dataset.gameArea === area);
    const index = buttons.findIndex((button) => button === target);
    const up = key === 'arrowup' || key === 'w';
    const down = key === 'arrowdown' || key === 's';
    const next = index >= 0 && (up || down)
      ? buttons[(index + (up ? -1 : 1) + buttons.length) % buttons.length]
      : (active ?? buttons[0]);
    if (!next || (!left && !up && !down)) return false;

    next.focus();
    return true;
  }

  const onGameKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    const key = event.key.toLowerCase();
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (document.querySelector('.battle-overlay')) return;
    const editable = target?.closest('input, textarea, select, [role="listbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])');
    const modifier = event.ctrlKey || event.metaKey;

    if (modifier && !event.altKey && !event.shiftKey && !event.repeat && matchesShortcut(event, gameActions.command.key)) {
      event.preventDefault();
      if (commandOpen) setCommandOpen(false);
      else openCommand();
      return;
    }
    if (commandOpen || editable || event.altKey) return;

    // Atalhos: sempre Ctrl (⌘) + tecla. Letras soltas ficam livres para jogar (WASD, E…) e para digitar.
    if (modifier && !event.shiftKey) {
      if (event.repeat) return;
      if (matchesShortcut(event, gameActions.sidebar.key)) {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (matchesShortcut(event, gameActions.exit.key)) {
        event.preventDefault();
        onExit();
        return;
      }
      if (matchesShortcut(event, gameActions.fullscreen.key)) {
        event.preventDefault();
        if (document.fullscreenEnabled) void toggleFullscreen();
        return;
      }
      if (matchesShortcut(event, gameActions.motion.key)) {
        event.preventDefault();
        setReduceMotion((previous) => !previous);
        return;
      }
      const destination = gameAreas.find((entry) => matchesShortcut(event, entry.key));
      if (destination) {
        event.preventDefault();
        goTo(destination.id);
      }
      return;
    }
    if (modifier || event.shiftKey) return;

    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
      if (moveFocus(key, target)) event.preventDefault();
    } else if (['escape', 'backspace'].includes(key) && !event.repeat) {
      if (openMobile && key === 'escape') return;
      if (openMobile || area !== overviewId) {
        event.preventDefault();
        if (openMobile) setOpenMobile(false);
        else goTo(area === 'pokedex' && pokemonId !== undefined ? 'pokedex' : overviewId);
      }
    }
  });

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      onGameKey(event);
    }
    function onFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    window.addEventListener('keydown', keydown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('keydown', keydown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="game-sidebar-header">
          <div className="game-sidebar-brand">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span className="game-sidebar-text"><strong>Pokémon Simulator</strong><small>EVOLUTION</small></span>
          </div>
          {isMobile && (
            <Button size="icon-sm" variant="ghost" onClick={() => setOpenMobile(false)} aria-label="Fechar menu lateral">
              <X />
            </Button>
          )}
        </SidebarHeader>
        <SidebarContent>
          <nav ref={navigation} aria-label="Áreas do jogo" className="grid gap-1">
            <SidebarGroup className="px-2 py-0">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton data-game-area={overviewId} isActive={area === overviewId}
                      aria-current={area === overviewId ? 'page' : undefined} aria-keyshortcuts={shortcutAria(getArea('inicio').key)}
                      tooltip={`Início · ${shortcutLabel(getArea('inicio').key)}`} onClick={() => goTo(overviewId)}>
                      <House aria-hidden="true" />
                      <span>Início</span>
                      <kbd className="game-nav-key" aria-hidden="true">{shortcutLabel(getArea('inicio').key)}</kbd>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {menuSections.filter(({ id }) => id !== profileSection.id).map((section) => (
                    <SidebarSection key={section.id} section={section} area={area} goTo={goTo}
                      open={Boolean(openSections[section.id])} onToggle={() => toggleSection(section.id)} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>
        <SidebarFooter className="game-sidebar-footer">
          <nav aria-label="Perfil do treinador">
            <SidebarMenu>
              <SidebarSection section={profileSection} area={area} goTo={goTo} large title={save.trainer} subtitle="Perfil"
                icon={trainerSprite ? <span className="game-profile-avatar"><TrainerSpritePreview sprite={trainerSprite} /></span> : <IdCard aria-hidden="true" />}
                open={Boolean(openSections[profileSection.id])} onToggle={() => toggleSection(profileSection.id)}
                extra={(
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild>
                      <button type="button" className="w-full cursor-pointer text-left" data-game-area="desconectar"
                        aria-keyshortcuts={shortcutAria(gameActions.exit.key)} onClick={onExit}>
                        <LogOut aria-hidden="true" />
                        <span>{gameActions.exit.label}</span>
                        <kbd className="game-nav-key" aria-hidden="true">{shortcutLabel(gameActions.exit.key)}</kbd>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                )} />
            </SidebarMenu>
          </nav>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="game-main">
        <header className="game-topbar">
          <div className="game-breadcrumb">
            <SidebarTrigger className="size-9" aria-label="Alternar menu lateral" aria-expanded={isMobile ? openMobile : open}
              aria-keyshortcuts={shortcutAria(gameActions.sidebar.key)} title={`Alternar menu lateral (${shortcutLabel(gameActions.sidebar.key)})`} />
            <span className="hidden sm:inline">{sectionOf(area)?.label ?? 'Jornada'}</span>
            <ChevronRight className="hidden size-3.5 sm:block" aria-hidden="true" />
            <strong className="truncate">{current.label}</strong>
          </div>
          <div className="game-toolbar">
            <Wallet progress={game.progress} className="game-wallet-topbar" />
            <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="game-command-button" aria-label="Buscar no menu"
                  aria-keyshortcuts={shortcutAria(gameActions.command.key)} title={`Buscar no menu (${shortcutLabel(gameActions.command.key)})`}>
                  <gameActions.command.icon /><span className="hidden sm:inline">Buscar no menu</span>
                  <kbd className="game-key hidden sm:inline-flex">{shortcutLabel(gameActions.command.key)}</kbd>
                </Button>
              </DialogTrigger>
              <DialogContent className="overflow-hidden p-0">
                <DialogHeader className="sr-only">
                  <DialogTitle>Buscar no menu</DialogTitle>
                  <DialogDescription>Pesquise uma área, um Pokémon ou uma ação da jornada.</DialogDescription>
                </DialogHeader>
                <Command loop vimBindings={false} filter={filterGameCommand}>
                  <CommandInput className="pr-9" placeholder="Busque uma área, Pokémon ou ação…" aria-label="Pesquisar comandos" />
                  <CommandList className="max-h-[min(25rem,65dvh)] p-1">
                    <CommandEmpty>Nenhum comando encontrado.</CommandEmpty>
                    <Suspense fallback={null}><PokemonCommands onSelect={(id) => goTo('pokedex', id)} /></Suspense>
                    {areaGroups.map((group) => (
                      <CommandGroup key={group.label} heading={group.label}>
                        {group.areas.map((item) => (
                          <CommandItem key={item.id} value={item.label}
                            keywords={[item.id, item.description]} onSelect={() => goTo(item.id)}>
                            <item.icon /><span>{item.label}</span><CommandShortcut>{shortcutLabel(item.key)}</CommandShortcut>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                    <CommandGroup heading="Ações">
                      <CommandItem onSelect={() => { setCommandOpen(false); toggleSidebar(); }}>
                        <PanelLeft /><span>{gameActions.sidebar.label}</span><CommandShortcut>{shortcutLabel(gameActions.sidebar.key)}</CommandShortcut>
                      </CommandItem>
                      {document.fullscreenEnabled && (
                        <CommandItem onSelect={() => { setCommandOpen(false); void toggleFullscreen(); }}>
                          <Maximize /><span>{gameActions.fullscreen.label}</span><CommandShortcut>{shortcutLabel(gameActions.fullscreen.key)}</CommandShortcut>
                        </CommandItem>
                      )}
                      <CommandItem onSelect={() => { setCommandOpen(false); setReduceMotion((value) => !value); }}>
                        <Keyboard /><span>{gameActions.motion.label}</span><CommandShortcut>{shortcutLabel(gameActions.motion.key)}</CommandShortcut>
                      </CommandItem>
                      <CommandItem onSelect={onExit}>
                        <LogOut /><span>{gameActions.exit.label}</span><CommandShortcut>{shortcutLabel(gameActions.exit.key)}</CommandShortcut>
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </DialogContent>
            </Dialog>
            {document.fullscreenEnabled && (
              <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => void toggleFullscreen()}
                aria-label={fullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'} aria-keyshortcuts={shortcutAria(gameActions.fullscreen.key)}
                title={`Alternar tela cheia (${shortcutLabel(gameActions.fullscreen.key)})`}>
                {fullscreen ? <Minimize /> : <Maximize />}
              </Button>
            )}
            {trainerSprite && (
              <Button variant="ghost" size="icon" className="game-trainer-button" onClick={() => goTo('treinador')}
                aria-label="Abrir o cartão do treinador" title="Treinador (U)">
                <TrainerSpritePreview sprite={trainerSprite} />
              </Button>
            )}
          </div>
        </header>

        <div className="game-content" data-area={area}>
          <div className={area === 'selvagens' ? 'game-page-heading sr-only' : 'game-page-heading'}>
            <h1 ref={heading} tabIndex={-1} key={area}>{current.label}</h1>
            <p>{current.description}</p>
          </div>
          {displayError && <p role="alert" className="text-sm text-destructive">{displayError}</p>}
          <GameAreaContent area={area} pokemonId={pokemonId} save={liveSave} game={game} change={change} navigate={goTo} onChangeSprite={onChangeSprite}
            reduceMotion={reduceMotion} setReduceMotion={setReduceMotion}
            fullscreen={fullscreen} toggleFullscreen={toggleFullscreen} />
        </div>
      </SidebarInset>

      <Dialog open={game.progress.restart && !gameOver}>
        <DialogContent showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Jogo zerado!</DialogTitle>
            <DialogDescription>
              Você derrotou todos os campeões. Começa o Novo Jogo+ {game.progress.cycle}: a jornada recomeça do zero, sem limite de nível
              e com adversários que acompanham a média da sua equipe. Escolha o seu novo inicial, de qualquer geração.
            </DialogDescription>
          </DialogHeader>
          <StarterPicker value={newStarter} onChange={setNewStarter} name="restart-starter" />
          {restartError && <p role="alert" className="text-sm text-destructive">{restartError}</p>}
          <Button disabled={!newStarter} onClick={() => void startNewGamePlus()}>Começar Novo Jogo+</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={gameOver}>
        <DialogContent showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Fim de jogo</DialogTitle>
            <DialogDescription>
              Todos os seus Pokémon foram derrotados. Na Morte permanente, o save de {save.trainer} foi apagado.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={onExit}>Voltar ao menu</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function filterGameCommand(value: string, query: string, keywords?: string[]) {
  return value.startsWith('pokemon:') ? 1 : defaultFilter(value, query, keywords);
}

