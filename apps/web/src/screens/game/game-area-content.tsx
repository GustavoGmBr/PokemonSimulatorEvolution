import { lazy, Suspense, useState, type ReactNode } from 'react';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChangeGame, GameState } from '@/lib/game-state';
import type { JourneySave } from '@/lib/journey-saves';
import { companionOf, teamSize } from '@/lib/pokemon-collection';
import cover from '@/assets/kanto-cover.webp';
import { PokemonDialog } from './pokemon-dialog';
import { TeamList } from './pokemon-ui';
import { TrainerCard, Wallet } from './trainer-card';
import { battleKeyActions, useBattleKeys } from '@/lib/battle-keys';
import { useControlsVersion, useExploreKeys } from '@/lib/controls';
import { OptionsScreen } from './options-screen';
import { areaGroups, gameActions, gameAreas, getArea, overviewId, shortcutLabel, type GameAreaId } from './game-navigation';

type Props = {
  area: GameAreaId;
  pokemonId?: number;
  save: JourneySave;
  game: GameState;
  change: ChangeGame;
  onChangeSprite: (id: string) => Promise<void>;
  navigate: (id: GameAreaId, pokemonId?: number) => void;
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
  fullscreen: boolean;
  toggleFullscreen: () => Promise<void>;
};

const quickAreas = ['selvagens', 'pokedex', 'missoes'] as const;
const PokedexScreen = lazy(() => import('./pokedex-screen'));
const PcScreen = lazy(() => import('./pc-screen'));
const WildScreen = lazy(() => import('./wild-screen'));
const ShopScreen = lazy(() => import('./shop-screen'));
const MarketScreen = lazy(() => import('./market-screen'));
const InventoryScreen = lazy(() => import('./inventory-screen'));
const MissionsScreen = lazy(() => import('./activities-screen').then(({ MissionsScreen }) => ({ default: MissionsScreen })));
const LineupsScreen = lazy(() => import('./activities-screen').then(({ LineupsScreen }) => ({ default: LineupsScreen })));
const CasinoScreen = lazy(() => import('./casino/casino-screen'));
const ChallengesScreen = lazy(() => import('./challenges-screen'));
const PokemonCenterScreen = lazy(() => import('./pokemon-center-screen'));

function TeamPanel({ game, change, navigate, children }: Pick<Props, 'game' | 'change' | 'navigate'> & { children: (open: (uid: string) => void) => ReactNode }) {
  const [openUid, setOpenUid] = useState<string | null>(null);
  return (
    <>
      {children(setOpenUid)}
      <PokemonDialog uid={openUid} state={game} change={change} onClose={() => setOpenUid(null)}
        onOpenPokedex={(species) => { setOpenUid(null); navigate('pokedex', species); }} />
    </>
  );
}

function Overview({ save, game, change, navigate }: Pick<Props, 'save' | 'game' | 'change' | 'navigate'>) {
  return (
    <div className="game-overview">
      <section className="game-panel game-overview-wallet" aria-labelledby="overview-wallet">
        <h2 id="overview-wallet" className="game-section-title">Seus recursos</h2>
        <Wallet progress={game.progress} className="game-wallet-overview" />
      </section>

      <div className="game-overview-grid">
        <section className="game-region" aria-label="Região inicial">
          <img src={cover} alt="" />
          <div className="game-region-copy">
            <span><MapPin aria-hidden="true" /> Região inicial</span>
            <h2>Kanto</h2>
          </div>
        </section>
        <section className="game-panel game-overview-team" aria-labelledby="overview-team">
          <div className="game-panel-heading">
            <h2 id="overview-team">Sua equipe</h2>
            <span className="text-sm text-muted-foreground">{game.collection.team.length} / {teamSize}</span>
          </div>
          <TeamPanel game={game} change={change} navigate={navigate}>
            {(open) => <TeamList team={game.collection.team} onOpen={open} showEmpty={false} companion={companionOf(game.collection).uid} />}
          </TeamPanel>
          <Button variant="outline" className="mt-auto justify-between" onClick={() => navigate('equipe')}>
            Ver equipe <kbd className="game-key">{shortcutLabel(getArea('equipe').key)}</kbd>
          </Button>
        </section>
      </div>

      <section aria-labelledby="game-quick-heading" className="grid gap-3">
        <h2 id="game-quick-heading" className="game-section-title">Acesso rápido</h2>
        <div className="game-quick-grid">
          {quickAreas.map((id) => {
            const item = gameAreas.find((entry) => entry.id === id)!;
            return (
              <Button key={id} variant="outline" className="game-quick-button" onClick={() => navigate(id)}>
                <span className="game-quick-icon"><item.icon aria-hidden="true" /></span>
                <span className="min-w-0 text-left">
                  <strong className="block">{item.label}</strong>
                  <span className="block text-xs text-muted-foreground">{item.key}</span>
                </span>
                <ArrowUpRight aria-hidden="true" className="ml-auto text-muted-foreground" />
              </Button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ShortcutList() {
  const battleKeys = useBattleKeys();
  useControlsVersion();
  const explore = useExploreKeys();
  // Todo atalho é Ctrl (⌘ no Mac) + tecla; as teclas de jogar e de navegar não levam Ctrl.
  const combo = (key: string) => `Ctrl/⌘ + ${shortcutLabel(key).replace('Ctrl ', '')}`;
  const controls = [
    ['Mover o foco no menu', 'Setas / WASD'],
    ['Confirmar ação', 'Enter / Espaço'],
    ['Voltar ou fechar o menu lateral', 'Esc / Backspace'],
    [gameActions.command.label, combo(gameActions.command.key)],
    [gameActions.sidebar.label, combo(gameActions.sidebar.key)],
    [gameActions.fullscreen.label, combo(gameActions.fullscreen.key)],
    [gameActions.motion.label, combo(gameActions.motion.key)],
    [gameActions.autoBattle.label, combo(gameActions.autoBattle.key)],
    [gameActions.exit.label, combo(gameActions.exit.key)],
  ];
  const wildControls = [
    ['Andar pelo mapa', `${explore.up}${explore.left}${explore.down}${explore.right} / Setas`],
    ['Correr', 'Shift'],
    ['Enfrentar o Pokémon encostado', `${explore.interact} / Enter`],
    ['Capturar o Pokémon encostado', explore.capture],
    [gameActions.back.label, combo(gameActions.back.key)],
    [gameActions.confirm.label, combo(gameActions.confirm.key)],
    ['Trocar de caixa no PC', 'Ctrl/⌘ + ← / → ou PageUp / PageDown'],
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="game-panel self-start">
        <h2 className="game-section-title">Controles do menu</h2>
        <dl className="game-shortcut-list">
          {controls.map(([label, shortcut]) => (
            <div key={label}><dt>{label}</dt><dd><kbd className="game-key">{shortcut}</kbd></dd></div>
          ))}
        </dl>
        <h2 className="game-section-title mt-4">Batalha</h2>
        <dl className="game-shortcut-list">
          {battleKeyActions.map((action) => (
            <div key={action.id}><dt>{action.label}</dt><dd><kbd className="game-key">{battleKeys[action.id]}</kbd></dd></div>
          ))}
          <div><dt>Voltar no menu da batalha</dt><dd><kbd className="game-key">Esc / Backspace</kbd></dd></div>
          <div><dt>Mudar as teclas</dt><dd>ficha do Pokémon → Golpes</dd></div>
        </dl>
        <h2 className="game-section-title mt-4">Selvagens e PC</h2>
        <dl className="game-shortcut-list">
          {wildControls.map(([label, shortcut]) => (
            <div key={label}><dt>{label}</dt><dd><kbd className="game-key">{shortcut}</kbd></dd></div>
          ))}
        </dl>
      </section>
      <section className="game-panel">
        <h2 className="game-section-title">Ir para uma área</h2>
        <p className="text-sm text-muted-foreground">Pressione Ctrl (⌘ no Mac) junto com a tecla indicada para abrir a área.</p>
        {areaGroups.map(({ label, areas }) => (
          <div key={label}>
            <h3 className="mb-1 text-sm font-bold">{label}</h3>
            <dl className="game-shortcut-list">
              {areas.map((item) => (
                <div key={item.id}><dt>{item.label}</dt><dd><kbd className="game-key">{shortcutLabel(item.key)}</kbd></dd></div>
              ))}
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}

export function GameAreaContent(props: Props) {
  const { area, pokemonId, save, game, change, navigate, reduceMotion, setReduceMotion, fullscreen, toggleFullscreen } = props;

  switch (area) {
    case 'centro-pokemon':
      return <PokemonCenterScreen game={game} change={change} />;
    case 'mochila':
    case 'missoes':
    case 'equipes':
    case 'cassino':
      return <Suspense fallback={<p role="status">Carregando…</p>}>
        {area === 'mochila' ? <InventoryScreen game={game} change={change} /> :
          area === 'missoes' ? <MissionsScreen game={game} change={change} /> :
          area === 'equipes' ? <LineupsScreen game={game} change={change} /> : <CasinoScreen game={game} change={change} />}
      </Suspense>;
    case 'treinadores':
    case 'ginasios':
    case 'torneios':
    case 'chefes':
      return (
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Preparando adversários…</p>}>
          <ChallengesScreen key={area} mode={area} game={game} change={change} />
        </Suspense>
      );
    case overviewId:
      return <Overview save={save} game={game} change={change} navigate={navigate} />;
    case 'pokedex':
      return (
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Carregando a Pokédex…</p>}>
          <PokedexScreen pokemonId={pokemonId} caughtSpecies={game.progress.caughtSpecies} onSelect={(id) => navigate('pokedex', id)} />
        </Suspense>
      );
    case 'equipe':
      return (
        <section className="game-panel" aria-label="Pokémon da equipe">
          <div className="game-panel-heading"><h2>Pokémon na equipe</h2><span>{game.collection.team.length} / {teamSize}</span></div>
          <TeamPanel game={game} change={change} navigate={navigate}>
            {(open) => <TeamList team={game.collection.team} onOpen={open} companion={companionOf(game.collection).uid} showMoves />}
          </TeamPanel>
          <p className="text-sm text-muted-foreground">Abra a ficha para dar apelido, favoritar, escolher o companheiro de caminhada, reordenar, enviar um Pokémon ao PC ou vendê-lo. Na seção Golpes você aprende, esquece e reordena golpes, compra TMs e troca os atalhos da batalha.</p>
          <Button variant="outline" className="justify-between sm:w-fit" onClick={() => navigate('pc')}>
            Abrir o PC <kbd className="game-key">{shortcutLabel(getArea('pc').key)}</kbd>
          </Button>
        </section>
      );
    case 'pc':
      return (
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Carregando o PC…</p>}>
          <PcScreen state={game} change={change} onOpenPokedex={(species) => navigate('pokedex', species)} />
        </Suspense>
      );
    case 'selvagens':
      return (
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Carregando os selvagens…</p>}>
          <WildScreen save={save} game={game} change={change} />
        </Suspense>
      );
    case 'loja':
      return (
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Abrindo a loja…</p>}>
          <ShopScreen game={game} change={change} />
        </Suspense>
      );
    case 'mercado':
      return (
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Abrindo o mercado…</p>}>
          <MarketScreen game={game} change={change} />
        </Suspense>
      );
    case 'treinador':
      return <TrainerCard save={save} onChangeSprite={props.onChangeSprite} />;
    case 'opcoes':
      return <OptionsScreen reduceMotion={reduceMotion} setReduceMotion={setReduceMotion} fullscreen={fullscreen} toggleFullscreen={toggleFullscreen} />;
    case 'atalhos':
      return <ShortcutList />;
    default:
      return (
        <section className="game-panel game-pending" aria-label="Disponibilidade da área">
          <h2 className="game-section-title">Em preparação</h2>
          <p className="text-sm text-muted-foreground">Esta área estará disponível quando suas mecânicas forem implementadas.</p>
        </section>
      );
  }
}
