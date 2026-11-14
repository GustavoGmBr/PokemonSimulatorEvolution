import { lazy, Suspense, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ArrowUp, Compass, Crosshair, Footprints, Lock, Search, Settings2, Sparkles, Star, Swords, X } from 'lucide-react';
import { getWildMap, regionNames, wildMaps, type WildMapId } from '@pokesim-evolution/data/wild-maps';
import { getPokemon } from '@pokesim-evolution/data/pokedex';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ChangeGame, GameState } from '@/lib/game-state';
import { gradeBadge, gradeNames, gradeOf, isSpecial, ivStars, specialMessage, starText, type Grade } from '@/lib/ivs';
import type { JourneySave } from '@/lib/journey-saves';
import { averageLevel, companionOf } from '@/lib/pokemon-collection';
import { getTrainerSprite } from '@/lib/trainer-sprites';
import {
  availableMaps, canChooseMap, canSpawn, chanceOfStars, clampLevels, defaultSettings, isCleared, levelCap,
  minWildLevel, pendingSpawns, searchMap, settingsOf, shinyChance, spawnNext, unlockedRegions, wildBadges, wildPopulation,
  type WildBoard, type WildEncounter, type WildPopulation, type WildSettings,
} from '@/lib/wild';
import { exploreActionFor, getExploreKeys, useExploreKeys } from '@/lib/controls';
import { gameActions, shortcutLabel } from './game-navigation';
import {
  bodyRadius, cols, companionGap, followTrail, frameColumn, interactRange, movePlayer, nearestWithin, newTrail,
  newWalker, newWanderer, pushTrail, randomSpot, rows, startSpot, stepWanderer, type Obstacle, type Walker, type Wanderer,
} from '@/lib/wild-world';
import { spriteSheetUrl, TypeBadge } from './pokedex-media';
import { BallFx, type BallFxHandle } from './ball-fx';
// A batalha carrega junto com os dados de golpes e espécies só quando a primeira luta começa.
const BattleScreen = lazy(() => import('./battle-screen'));
const DirectCaptureDialog = lazy(() => import('./direct-capture-dialog'));
import '@/styles/iv.css';
import '@/styles/wild.css';
import { playEffect } from '@/lib/sfx';

type Props = { save: JourneySave; game: GameState; change: ChangeGame };

const mapImageUrl = (map: string) => `${import.meta.env.BASE_URL}recursos/Mapas/${map}.png`;
/** Quantos tiles cabem na largura da tela: o mapa é bem maior que isso, então a câmera acompanha o jogador. */
const visibleColumns = 34;
const visibleRows = 20;
const directionActions = new Set(['up', 'down', 'left', 'right']);

/** A direção que a tecla move (as escolhidas em Opções → Controles ou as setas), se houver. */
function keyDirection(key: string) {
  const action = exploreActionFor(getExploreKeys(), key);
  return action && directionActions.has(action) ? (action as 'up' | 'down' | 'left' | 'right') : undefined;
}

function encounterName(encounter: WildEncounter) {
  return getPokemon(encounter.species)?.displayName ?? `Espécie ${encounter.species}`;
}

/** Selo ao lado do nome do selvagem: ✦ se for brilhante e as estrelas de IV de 1 a 4, sempre em 4 casas (★★☆☆ = 2 estrelas). */
function TagStars({ subject }: { subject: Pick<WildEncounter, 'shiny' | 'ivs'> }) {
  const stars = ivStars(subject.ivs);
  return (
    <>
      {subject.shiny && <b className="wild-shiny-mark" aria-hidden="true">✦</b>}
      {stars >= 1 && (
        <span className="wild-rate" data-stars={stars} aria-hidden="true">
          <i>{'★'.repeat(stars)}</i><i>{'☆'.repeat(4 - stars)}</i>
        </span>
      )}
    </>
  );
}

function sheetPosition(column: number, row: number) {
  return `${(column / 3) * 100}% ${(row / 3) * 100}%`;
}

type WorldProps = {
  population: WildPopulation;
  board: WildBoard;
  trainerUrl: string | null;
  /** Folha do treinador correndo, quando existe; sem ela, correr só acelera a animação de andar. */
  trainerRunUrl: string | null;
  companion: { uid: string; sprite: string; shiny: boolean; name: string } | null;
  paused: boolean;
  /** Setas do HUD que apontam para os Pokémon especiais fora da tela (preenchidas pelo simulador). */
  arrows: MutableRefObject<Map<string, HTMLElement>>;
  onSpawn: () => void;
  onNear: (id: string | null) => void;
  /** E / Enter: enfrentar o Pokémon que está perto. */
  onInteract: (id: string) => void;
  /** F: tentar a captura direta do Pokémon que está perto. */
  onCapture: (id: string) => void;
};

/** O cenário em tempo real: o jogador, o companheiro e os selvagens andando pelo mapa. */
function WildWorld(props: WorldProps) {
  const { board } = props;
  const explore = useExploreKeys();
  const viewRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const companionRef = useRef<HTMLDivElement>(null);
  const actorEls = useRef(new Map<string, HTMLDivElement>());
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    const view = viewRef.current!;
    const world = worldRef.current!;
    const map = board.map;
    const random = Math.random;

    if (latest.current.trainerRunUrl) new Image().src = latest.current.trainerRunUrl;
    const start = startSpot(map);
    const player: Walker = newWalker(start);
    const companion: Walker = newWalker(start);
    const trail = newTrail(start);
    const actors = new Map<string, Wanderer>();
    const pressed = new Set<string>();
    let running = false;
    let usingRunSheet = false;
    let tile = 1;
    let viewWidth = 1;
    let viewHeight = 1;
    let near: string | null = null;
    let spawnTimer = 0.6;
    let frameId = 0;
    let last = performance.now();

    function resize() {
      viewWidth = view.clientWidth || 1;
      viewHeight = view.clientHeight || 1;
      // O mapa é maior que a tela: cada tile tem um tamanho fixo em relação a ela e a câmera segue o jogador.
      tile = Math.max(viewWidth / visibleColumns, viewHeight / visibleRows);
      world.style.width = `${tile * cols}px`;
      world.style.height = `${tile * rows}px`;
      world.style.setProperty('--tile', `${tile}px`);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(view);
    resize();

    function place(element: HTMLElement | null | undefined, walker: Walker, rowOffset = 0) {
      if (!element) return;
      element.style.transform = `translate3d(${walker.x * tile}px, ${walker.y * tile}px, 0)`;
      element.style.zIndex = String(Math.round(walker.y * 100));
      const sprite = element.querySelector<HTMLElement>('.wild-sprite');
      if (sprite) sprite.style.backgroundPosition = sheetPosition(frameColumn(walker), walker.facing + rowOffset);
    }

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const { board: current, paused } = latest.current;

      // Selvagens novos entram no mapa longe do jogador; os que saíram do save somem.
      for (const encounter of current.encounters) {
        if (!actors.has(encounter.id)) {
          actors.set(encounter.id, newWanderer(randomSpot(map, random, player, 8, [...actors.values()]), random));
        }
      }
      for (const id of actors.keys()) if (!current.encounters.some((encounter) => encounter.id === id)) actors.delete(id);

      if (!paused) {
        const wildBodies: Obstacle[] = [...actors.values()].map((actor) => ({ x: actor.x, y: actor.y, radius: bodyRadius.wild }));
        movePlayer(map, player, {
          x: (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0),
          y: (pressed.has('down') ? 1 : 0) - (pressed.has('up') ? 1 : 0),
        }, dt, wildBodies, running);
        pushTrail(trail, player);
        const behind = followTrail(trail, companionGap);
        const dx = behind.x - companion.x;
        const dy = behind.y - companion.y;
        companion.moving = Math.hypot(dx, dy) > 0.004;
        if (companion.moving) {
          companion.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
          companion.clock += dt * (running && player.moving ? 12 : 8);
        }
        companion.x = behind.x;
        companion.y = behind.y;
        const playerBodies: Obstacle[] = [
          { x: player.x, y: player.y, radius: bodyRadius.player },
          { x: companion.x, y: companion.y, radius: bodyRadius.companion },
        ];
        for (const actor of actors.values()) {
          const others = [...actors.values()].filter((other) => other !== actor)
            .map((other) => ({ x: other.x, y: other.y, radius: bodyRadius.wild }));
          stepWanderer(map, actor, dt, random, [...playerBodies, ...others]);
        }

        if (canSpawn(current, latest.current.population)) {
          spawnTimer -= dt;
          if (spawnTimer <= 0) {
            spawnTimer = 3 + random() * 3;
            latest.current.onSpawn();
          }
        }
      }

      const closest = nearestWithin(player, [...actors].map(([id, actor]) => ({ id, x: actor.x, y: actor.y })), interactRange);
      const nearId = closest?.id ?? null;
      if (nearId !== near) {
        near = nearId;
        latest.current.onNear(nearId);
      }

      for (const [id, actor] of actors) {
        const element = actorEls.current.get(id);
        if (!element) continue;
        place(element, actor);
        element.dataset.near = String(id === near);
        element.style.opacity = '1';
      }
      // Correndo, troca para a folha de corrida (se o treinador tiver uma).
      const runSheet = Boolean(latest.current.trainerRunUrl) && running && player.moving;
      if (runSheet !== usingRunSheet) {
        usingRunSheet = runSheet;
        const sprite = playerRef.current?.querySelector<HTMLElement>('.wild-sprite');
        const url = runSheet ? latest.current.trainerRunUrl : latest.current.trainerUrl;
        if (sprite && url) sprite.style.backgroundImage = `url("${url}")`;
      }
      place(playerRef.current, player);
      place(companionRef.current, companion);

      // Câmera: acompanha o jogador sem sair dos limites do mapa.
      const worldWidth = tile * cols;
      const worldHeight = tile * rows;
      const cameraX = Math.min(Math.max(player.x * tile - viewWidth / 2, 0), Math.max(0, worldWidth - viewWidth));
      const cameraY = Math.min(Math.max(player.y * tile - viewHeight / 2, 0), Math.max(0, worldHeight - viewHeight));
      world.style.transform = `translate3d(${-cameraX}px, ${-cameraY}px, 0)`;

      // Setas dos especiais: só aparecem quando o Pokémon está fora da tela e apontam para ele.
      for (const [id, arrow] of latest.current.arrows.current) {
        const actor = actors.get(id);
        if (!actor) continue;
        const screenX = actor.x * tile - cameraX;
        const screenY = actor.y * tile - cameraY;
        const visible = screenX > 0 && screenX < viewWidth && screenY > 0 && screenY < viewHeight;
        arrow.dataset.onscreen = String(visible);
        if (!visible) {
          const angle = Math.atan2(screenY - viewHeight / 2, screenX - viewWidth / 2) * (180 / Math.PI) + 90;
          arrow.style.transform = `rotate(${angle.toFixed(1)}deg)`;
        }
      }

      frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);

    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      running = event.shiftKey;
      const key = event.key.toLowerCase();
      if (key === 'shift') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      // Janelas abertas (ficha, busca no menu…) e campos de texto ficam com o teclado.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (target?.closest('input, textarea, select, [role="listbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])')) return;

      const direction = keyDirection(key);
      if (direction) {
        // Dentro do menu lateral, as setas e WASD continuam navegando no menu.
        if (target?.closest('[data-sidebar="sidebar"]')) return;
        event.preventDefault();
        pressed.add(direction);
        return;
      }
      const action = exploreActionFor(getExploreKeys(), key);
      if (action === 'interact') {
        // Enter num botão ou link continua ativando o botão.
        if (key === 'enter' && target?.closest('button, a[href], [role="button"]')) return;
        event.preventDefault();
        if (!event.repeat && near && !latest.current.paused) latest.current.onInteract(near);
      } else if (action === 'capture') {
        event.preventDefault();
        if (!event.repeat && near && !latest.current.paused) latest.current.onCapture(near);
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      running = event.shiftKey;
      const direction = keyDirection(event.key);
      if (direction) pressed.delete(direction);
    }
    function onBlur() {
      pressed.clear();
      running = false;
    }
    // Na captura, para que o atalho "E" (abrir Equipe) e as teclas do menu não disputem as mesmas teclas.
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      latest.current.onNear(null);
    };
  }, [board.map, board.id]);

  const { trainerUrl, companion } = props;
  return (
    <div ref={viewRef} className="wild-view">
      <div ref={worldRef} className="wild-world">
        <img className="wild-map" src={mapImageUrl(board.map)} alt={`Mapa: ${getWildMap(board.map).name}`} draggable={false} />

        {board.encounters.map((encounter) => {
          const entry = getPokemon(encounter.species);
          const grade = gradeOf(encounter);
          return (
            <div key={encounter.id} className="wild-entity wild-actor" data-near="false" data-wild-id={encounter.id} style={{ opacity: 0 }}
              ref={(element) => {
                if (element) actorEls.current.set(encounter.id, element);
                else actorEls.current.delete(encounter.id);
              }}>
              <div className="wild-body wild-body-pokemon" data-grade={grade ?? undefined}>
                {grade && <span className="wild-aura" aria-hidden="true" />}
                {entry?.sprite && (
                  <span className="wild-sprite" role="img"
                    aria-label={`${encounterName(encounter)}, nível ${encounter.level}${encounter.shiny ? ', brilhante' : ''}${ivStars(encounter.ivs) >= 1 ? `, ${ivStars(encounter.ivs)} ${ivStars(encounter.ivs) === 1 ? 'estrela' : 'estrelas'}` : ''}`}
                    style={{ backgroundImage: `url("${spriteSheetUrl(entry.sprite, encounter.shiny)}")` }} />
                )}
                <span className="wild-tag" data-grade={grade ?? undefined}>
                  <TagStars subject={encounter} />
                  {encounterName(encounter)} · Nv {encounter.level}
                </span>
                <span className="wild-prompt" aria-hidden="true">{explore.interact}</span>
              </div>
            </div>
          );
        })}

        {companion && (
          <div ref={companionRef} className="wild-entity">
            <div className="wild-body wild-body-pokemon">
              <span className="wild-sprite" role="img" aria-label={`Seu companheiro: ${companion.name}`}
                style={{ backgroundImage: `url("${spriteSheetUrl(companion.sprite, companion.shiny)}")` }} />
            </div>
          </div>
        )}

        <div ref={playerRef} className="wild-entity" data-wild-player="">
          <div className="wild-body wild-body-trainer">
            {trainerUrl && <span className="wild-sprite" role="img" aria-label="Você" style={{ backgroundImage: `url("${trainerUrl}")` }} />}
          </div>
        </div>
      </div>
    </div>
  );
}

const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
/** "1 em 4.096" a partir de uma probabilidade. */
const oneIn = (probability: number) => `1 em ${Math.round(1 / probability).toLocaleString('pt-BR')}`;

function LevelField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  return (
    <div className="wild-field" role="group" aria-label={label}>
      <span className="wild-field-label">{label}</span>
      <div className="wild-stepper">
        <Button type="button" variant="outline" size="sm" disabled={value <= min} onClick={() => step(-10)} aria-label={`${label}: menos 10`}>−10</Button>
        <Button type="button" variant="outline" size="sm" disabled={value <= min} onClick={() => step(-1)} aria-label={`${label}: menos 1`}>−</Button>
        <Input type="number" inputMode="numeric" min={min} max={max} value={value} aria-label={label} className="wild-level-input"
          onChange={(event) => { if (event.target.value !== '') onChange(Number(event.target.value)); }} />
        <Button type="button" variant="outline" size="sm" disabled={value >= max} onClick={() => step(1)} aria-label={`${label}: mais 1`}>+</Button>
        <Button type="button" variant="outline" size="sm" disabled={value >= max} onClick={() => step(10)} aria-label={`${label}: mais 10`}>+10</Button>
      </div>
    </div>
  );
}

/** A tela de configuração: região, faixa de nível e mapa, antes de procurar selvagens (como no jogo antigo). */
function WildSetup({ badges, population, teamLevel, settings, onChange, board, onSearch, onResume, message }: {
  badges: number;
  population: WildPopulation;
  teamLevel: number | undefined;
  settings: WildSettings;
  onChange: (settings: WildSettings) => void;
  board: WildBoard | null;
  onSearch: () => void;
  onResume: () => void;
  message: string | null;
}) {
  const explore = useExploreKeys();
  const unlocked = unlockedRegions();
  const cap = levelCap(badges);
  const maps = availableMaps(settings.region, badges);
  const mayChoose = canChooseMap();
  const regionUnlocked = unlocked.includes(settings.region);
  const resumeMap = board ? getWildMap(board.map) : null;

  function setLevels(minLevel: number, maxLevel: number, edited: 'min' | 'max') {
    const [lo, hi] = edited === 'min'
      ? clampLevels(minLevel, Math.max(minLevel, maxLevel), badges)
      : clampLevels(Math.min(minLevel, maxLevel), maxLevel, badges);
    onChange({ ...settings, minLevel: lo, maxLevel: hi });
  }

  return (
    <div className="wild-setup">
      <div className="wild-setup-inner">
        <header className="wild-setup-header">
          <div>
            <h2>Selvagens</h2>
            <p>Escolha onde procurar. Encoste em um Pokémon e aperte {explore.interact} ou Enter para enfrentá-lo.</p>
          </div>
          {board && resumeMap && (
            <Button variant="secondary" onClick={onResume}>
              <Compass aria-hidden="true" /> Voltar ao mapa: {resumeMap.name}
              <span className="wild-count">{wildCount(board, population)}</span>
            </Button>
          )}
        </header>

        <div className="wild-setup-grid">
          <section className="game-panel" aria-labelledby="wild-region-title">
            <h3 id="wild-region-title" className="game-section-title">Região</h3>
            <div className="wild-region-list" role="radiogroup" aria-label="Região">
              {regionNames.map((name, index) => {
                const id = index + 1;
                const open = unlocked.includes(id);
                return (
                  <button key={id} type="button" role="radio" aria-checked={settings.region === id} disabled={!open}
                    className="wild-choice" onClick={() => onChange({ ...settings, region: id, map: null })}>
                    <strong>{name}</strong>
                    <span>{open ? `Geração ${id}` : <><Lock aria-hidden="true" /> Bloqueada</>}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="wild-setup-main">
          <section className="game-panel" aria-labelledby="wild-info-title">
            <h3 id="wild-info-title" className="game-section-title">{regionNames[settings.region - 1]} · Geração {settings.region}</h3>
            {regionUnlocked ? (
              <ul className="wild-facts">
                {teamLevel === undefined ? <>
                  <li>Insígnias: <b>{Math.min(badges, 8)}/8</b></li>
                  <li>Nível máximo liberado: <b>{cap}</b> <small>(sobe a cada insígnia)</small></li>
                  <li>Pokémon por mapa: <b>{population.total}</b>, até <b>{population.capacity}</b> ao mesmo tempo</li>
                </> : <li>Encontros contínuos, até <b>{population.capacity}</b> Pokémon ao mesmo tempo</li>}
                <li>Mapas com Pokémon nesta região: <b>{maps.length}</b> de {wildMaps.length}</li>
                <li>Brilhante: <b>{oneIn(shinyChance)}</b></li>
                <li><span className="wild-stars" data-stars="3">★★★</span> IVs excelentes: <b>≈ {oneIn(chanceOfStars(3))}</b></li>
                <li><span className="wild-stars" data-stars="4">★★★★</span> IVs perfeitos: <b>≈ {oneIn(chanceOfStars(4))}</b></li>
                <li className="text-muted-foreground">
                  Os especiais (<span className="wild-legend" data-grade="shiny">brilhante</span>,{' '}
                  <span className="wild-legend" data-grade="great">3★</span>,{' '}
                  <span className="wild-legend" data-grade="perfect">4★</span>) ganham destaque e um aviso no mapa.
                </li>
              </ul>
            ) : (
              <p className="wild-locked"><Lock aria-hidden="true" /> Bloqueada. Conclua a região anterior para liberar.</p>
            )}
          </section>

          <section className="game-panel wild-search-panel" aria-labelledby="wild-search-title">
            <h3 id="wild-search-title" className="game-section-title">Procura</h3>
            {teamLevel === undefined ? <>
              <LevelField label="Nível mínimo" value={settings.minLevel} min={minWildLevel} max={cap}
                onChange={(value) => setLevels(value, settings.maxLevel, 'min')} />
              <LevelField label="Nível máximo" value={settings.maxLevel} min={minWildLevel} max={cap}
                onChange={(value) => setLevels(settings.minLevel, value, 'max')} />
              <p className="wild-note">Os níveis vão de {minWildLevel} até o máximo liberado ({cap}) e valem para todos os Pokémon deste mapa.</p>
            </> : <p className="wild-note">Novos selvagens aparecem no nível médio da equipe: <b>{teamLevel}</b>.</p>}

            <div className="wild-field-label" id="wild-map-label">Mapa</div>
            <div className="wild-map-grid" role="radiogroup" aria-labelledby="wild-map-label">
              <button type="button" role="radio" aria-checked={settings.map === null} className="wild-choice wild-map-choice"
                onClick={() => onChange({ ...settings, map: null })}>
                <strong>Sorteado</strong>
                <span>Um dos {maps.length} mapas possíveis</span>
              </button>
              {wildMaps.map((entry) => {
                const available = maps.includes(entry.id);
                const disabled = !mayChoose || !available;
                return (
                  <button key={entry.id} type="button" role="radio" aria-checked={settings.map === entry.id} disabled={disabled}
                    className="wild-choice wild-map-choice" title={entry.description}
                    onClick={() => onChange({ ...settings, map: entry.id as WildMapId })}>
                    <span className="wild-map-thumb" aria-hidden="true" style={{ backgroundImage: `url("${mapImageUrl(entry.id)}")` }} />
                    <strong>{!mayChoose && <Lock aria-hidden="true" />}{entry.name}</strong>
                    <span className="flex gap-1">{entry.types.map((type) => <TypeBadge key={type} type={type} />)}</span>
                    {mayChoose && !available && <span>Sem Pokémon ainda</span>}
                  </button>
                );
              })}
            </div>
            {!mayChoose && (
              <p className="wild-note"><Lock aria-hidden="true" /> Escolher o mapa será liberado ao vencer o Campeão da região. Por enquanto ele é sempre sorteado.</p>
            )}

            <Button className="wild-search-button" size="lg" disabled={!regionUnlocked} onClick={onSearch}>
              <Search aria-hidden="true" /> Procurar selvagens <kbd className="game-key">{shortcutLabel(gameActions.confirm.key)}</kbd>
            </Button>
            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
          </section>
          </div>
        </div>
      </div>
    </div>
  );
}

type Alert = { id: string; text: string; grade: Grade };

function wildCount(board: WildBoard, population: WildPopulation) {
  return population.continuous
    ? `${board.encounters.length} / ${population.capacity}`
    : `${pendingSpawns(board, population) + board.encounters.length} / ${Math.max(board.total, population.total)}`;
}

export default function WildScreen({ save, game, change }: Props) {
  const explore = useExploreKeys();
  const { wild, progress } = game;
  const population = wildPopulation(progress);
  const postGame = population.continuous;
  const teamLevel = postGame ? averageLevel(game.collection.team) : undefined;
  const badges = wildBadges(progress);
  const [view, setView] = useState<'config' | 'map'>(wild ? 'map' : 'config');
  const [settings, setSettings] = useState<WildSettings>(() => wild ? settingsOf(wild, badges) : defaultSettings(badges));
  const [battleId, setBattleId] = useState<string | null>(null);
  /** Selvagem da captura direta em andamento (guardado inteiro: ele sai do mapa assim que a bola é lançada). */
  const [catching, setCatching] = useState<{ encounter: WildEncounter; phase: 'choose' | 'throwing' } | null>(null);
  const ballFx = useRef<BallFxHandle>(null);
  const [nearId, setNearId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [confirmSearch, setConfirmSearch] = useState(false);
  const announced = useRef(new Set<string>());
  const arrows = useRef(new Map<string, HTMLElement>());
  const timers = useRef<number[]>([]);
  const fighting = wild?.encounters.find((encounter) => encounter.id === battleId) ?? null;
  const near = wild?.encounters.find((encounter) => encounter.id === nearId) ?? null;
  const map = wild ? getWildMap(wild.map) : null;
  const cleared = wild ? isCleared(wild, population) : false;
  const specials = wild?.encounters.filter(isSpecial) ?? [];
  const trainer = getTrainerSprite(save.trainerSprite);
  // Quem tem folha de corrida chama "..._run" no lugar de "..._default".
  const trainerRun = getTrainerSprite(`${save.trainerSprite.replace(/_default$/, '')}_run`);
  const buddy = companionOf(game.collection);
  const buddyEntry = getPokemon(buddy.species);
  const showingMap = view === 'map' && wild !== null && map !== null;

  // A faixa de níveis nunca passa do limite liberado (que pode mudar com as insígnias).
  useEffect(() => {
    setSettings((current) => {
      const [minLevel, maxLevel] = clampLevels(current.minLevel, current.maxLevel, badges);
      return minLevel === current.minLevel && maxLevel === current.maxLevel ? current : { ...current, minLevel, maxLevel };
    });
  }, [badges]);

  // Avisa quando um Pokémon especial aparece (ou já estava no mapa ao voltar para ele).
  useEffect(() => {
    if (!showingMap || !wild) return;
    const fresh = wild.encounters.filter((encounter) => !announced.current.has(encounter.id));
    announced.current = new Set(wild.encounters.map((encounter) => encounter.id));
    const news = fresh.flatMap((encounter): Alert[] => {
      const text = specialMessage(encounterName(encounter), encounter);
      const grade = gradeOf(encounter);
      return text && grade ? [{ id: encounter.id, text, grade }] : [];
    });
    if (!news.length) return;
    if (news.some((alert) => alert.grade === 'shiny')) playEffect('shiny');
    setAlerts((current) => [...current, ...news].slice(-3));
    for (const { id } of news) {
      timers.current.push(window.setTimeout(() => setAlerts((current) => current.filter((alert) => alert.id !== id)), 9000));
    }
  }, [showingMap, wild]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  function startSearch(force = false) {
    // Procurar outro mapa faz os Pokémon que sobraram sumirem: pede confirmação se houver algum especial solto.
    if (!force && wild && wild.encounters.some(isSpecial)) {
      setConfirmSearch(true);
      return;
    }
    setConfirmSearch(false);
    let error: string | null = null;
    const failure = change((state) => {
      const board = searchMap(settings, wildBadges(state.progress), wildPopulation(state.progress));
      if (typeof board === 'string') {
        error = board;
        return board;
      }
      return { ...state, wild: board };
    });
    setMessage(failure ?? error);
    if (!failure) {
      announced.current = new Set();
      setAlerts([]);
      setView('map');
    }
  }

  /** "Procurar outro mapa" (no mapa): repete a configuração do mapa atual. */
  function searchAgain() {
    if (wild) setSettings(settingsOf(wild, badges));
    startSearch();
  }

  function openConfig() {
    if (wild) setSettings(settingsOf(wild, badges));
    setMessage(null);
    setView('config');
  }

  // O simulador chama isto de tempos em tempos; sem vaga ou sem Pokémon a aparecer, nada muda.
  function spawn() {
    change((state) => {
      const currentPopulation = wildPopulation(state.progress);
      const level = currentPopulation.continuous ? averageLevel(state.collection.team) : undefined;
      const board = state.wild && spawnNext(state.wild, wildBadges(state.progress), currentPopulation, level);
      return board ? { ...state, wild: board } : 'Nada a fazer.';
    });
  }

  function startCatch(encounter: WildEncounter | undefined) {
    if (encounter && !catching) setCatching({ encounter, phase: 'choose' });
  }

  /** Arremessa a bola escolhida: a bola voa do treinador até o Pokémon, o engole, balança e mostra o resultado. */
  async function throwAt(ball: string) {
    if (!catching || catching.phase !== 'choose') return;
    const { encounter } = catching;
    let thrown;
    try {
      // A lógica de batalha (e seus catálogos) só é baixada quando alguém tenta capturar.
      const { throwDirect } = await import('@/lib/battle/session');
      thrown = throwDirect(game, encounter, ball);
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Não deu para lançar a bola.');
      setCatching(null);
      return;
    }
    setCatching({ encounter, phase: 'throwing' });
    // Deixa a janela sair da tela antes de medir onde estão o treinador e o Pokémon.
    await new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); });
    const actor = document.querySelector<HTMLElement>(`[data-wild-id="${CSS.escape(encounter.id)}"]`);
    const you = document.querySelector<HTMLElement>('[data-wild-player] .wild-sprite') ?? document.querySelector<HTMLElement>('[data-wild-player]');
    const target = actor?.querySelector<HTMLElement>('.wild-sprite')?.getBoundingClientRect();
    if (actor && you && target) {
      const mine = you.getBoundingClientRect();
      const cell = target.width * 1.9;
      const to = { x: target.left + target.width / 2, y: target.top + target.height * 0.5 };
      const from = { x: mine.left + mine.width * 0.6, y: mine.top + mine.height * 0.3 };
      await ballFx.current?.play({
        ball, unit: 'px', cell: `${cell}px`, from, to,
        ground: { x: to.x, y: target.bottom - cell * 0.16 },
        arc: 60 + Math.abs(to.x - from.x) * 0.25, caught: thrown.caught, shakes: thrown.shakes,
        onOpen: () => { actor.dataset.capture = 'absorbed'; },
        onRelease: () => { actor.dataset.capture = 'released'; },
        onCaught: () => { playEffect('catching'); },
      });
      if (!thrown.caught) {
        // Escapou: o Pokémon reaparece, olha para você e foge para longe.
        actor.dataset.capture = 'fled';
        await new Promise<void>((resolve) => { window.setTimeout(resolve, 700); });
      }
    }
    const problem = change(thrown.apply);
    // Sem mensagem: se capturou, a bola escura com faíscas fica um instante no chão e some.
    if (thrown.caught && !problem) await new Promise<void>((resolve) => { window.setTimeout(resolve, 1100); });
    ballFx.current?.clear();
    setCatching(null);
    if (problem) setMessage(problem);
  }

  function closeCatch() {
    ballFx.current?.clear();
    setCatching(null);
  }

  // Atalhos desta tela (sempre com Ctrl/⌘): voltar do mapa para a configuração e procurar a partir dela.
  const shortcut = useRef({ view, openConfig, startSearch });
  useEffect(() => { shortcut.current = { view, openConfig, startSearch }; });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = event.key.toLowerCase();
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editable = target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
      const { view: current } = shortcut.current;
      if (key === gameActions.back.key.toLowerCase() && current === 'map' && !editable) {
        event.preventDefault();
        shortcut.current.openConfig();
      } else if (key === gameActions.confirm.key.toLowerCase() && current === 'config') {
        event.preventDefault();
        shortcut.current.startSearch();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const backLabel = shortcutLabel(gameActions.back.key);

  return (
    <div className="wild-stage" data-view={showingMap ? 'map' : 'config'}>
      {showingMap && wild && map ? (
        <>
          <WildWorld key={wild.id} board={wild} population={population} paused={catching !== null || confirmSearch || fighting !== null} arrows={arrows} onSpawn={spawn} onNear={setNearId}
            onInteract={setBattleId} onCapture={(id) => startCatch(wild.encounters.find((encounter) => encounter.id === id))} trainerUrl={trainer?.url ?? null} trainerRunUrl={trainerRun?.url ?? null}
            companion={buddyEntry?.sprite ? {
              uid: buddy.uid, sprite: buddyEntry.sprite, shiny: buddy.shiny, name: buddy.nickname ?? buddyEntry.displayName,
            } : null} />

          <div className="wild-hud wild-hud-top">
            <div className="wild-top-left">
              <div className="wild-chip">
                <strong>{map.name}</strong>
                <span className="flex gap-1">{map.types.map((type) => <TypeBadge key={type} type={type} />)}</span>
                <span className="wild-count" title={postGame ? 'Pokémon no mapa' : 'Pokémon que ainda vão aparecer ou estão no mapa'}>
                  {wildCount(wild, population)}
                </span>
                <span className="wild-sub">
                  {regionNames[wild.region - 1]} · {postGame ? `Novos encontros: Nv ${teamLevel}`
                    : `Nv ${wild.minLevel}–${wild.maxLevel} · ${progress.badges} ${progress.badges === 1 ? 'insígnia' : 'insígnias'}`}
                </span>
              </div>
              {specials.length > 0 && (
                <ul className="wild-specials" aria-label="Pokémon especiais no mapa">
                  {specials.map((encounter) => {
                    const grade = gradeOf(encounter)!;
                    return (
                      <li key={encounter.id} className="wild-special" data-grade={grade}
                        title={`${gradeNames[grade]}${ivStars(encounter.ivs) >= 3 && grade === 'shiny' ? ` · ${starText(ivStars(encounter.ivs))}` : ''}`}>
                        <span ref={(element) => {
                          if (element) arrows.current.set(encounter.id, element);
                          else arrows.current.delete(encounter.id);
                        }} className="wild-arrow" data-onscreen="true" aria-hidden="true"><ArrowUp /></span>
                        <b>{gradeBadge(encounter)}</b> {encounterName(encounter)} Nv {encounter.level}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="wild-top-actions">
              <Button variant="secondary" onClick={openConfig} aria-keyshortcuts="Control+Backspace Meta+Backspace">
                <Settings2 aria-hidden="true" /> Configuração <kbd className="game-key">{backLabel}</kbd>
              </Button>
              <Button variant="secondary" onClick={searchAgain}><Search aria-hidden="true" /> Procurar outro mapa</Button>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="wild-alerts" role="alert">
              {alerts.map((alert) => (
                <p key={alert.id} className="wild-alert" data-grade={alert.grade}>
                  {alert.grade === 'shiny' ? <Sparkles aria-hidden="true" /> : <Star aria-hidden="true" />}
                  <span>{alert.text}</span>
                  <button type="button" aria-label="Dispensar aviso" onClick={() => setAlerts((current) => current.filter((entry) => entry.id !== alert.id))}><X /></button>
                </p>
              ))}
            </div>
          )}

          <div className="wild-hud wild-hud-bottom">
            <p className="wild-chip wild-help">
              <Footprints aria-hidden="true" /> <kbd className="game-key">{explore.up}{explore.left}{explore.down}{explore.right}</kbd> / <kbd className="game-key">↑↓←→</kbd> mover
              <span aria-hidden="true">·</span> <kbd className="game-key">Shift</kbd> correr
              <span aria-hidden="true">·</span> <kbd className="game-key">{explore.interact}</kbd> / <kbd className="game-key">Enter</kbd> enfrentar
              <span aria-hidden="true">·</span> <kbd className="game-key">{explore.capture}</kbd> capturar
              <span aria-hidden="true">·</span> <kbd className="game-key">{backLabel}</kbd> configuração
            </p>
            {near && !catching && !fighting && (
              <div className="wild-prompt-actions">
                <Button className="wild-prompt-button" onClick={() => setBattleId(near.id)}>
                  <Swords aria-hidden="true" /> Enfrentar {encounterName(near)} · Nv {near.level} <kbd className="game-key">{explore.interact}</kbd>
                </Button>
                <Button variant="secondary" className="wild-prompt-button" onClick={() => startCatch(near)}>
                  <Crosshair aria-hidden="true" /> Capturar <kbd className="game-key">{explore.capture}</kbd>
                </Button>
              </div>
            )}
            {message && <p role="alert" className="wild-chip text-destructive">{message}</p>}
          </div>

          {cleared && (
            <div className="wild-overlay" role="status">
              <div className="wild-card">
                <h2>Mapa concluído!</h2>
                <p>Todos os Pokémon deste mapa foram enfrentados. Procure outro mapa com a mesma configuração ou volte para ajustá-la.</p>
                <Button onClick={searchAgain}><Search aria-hidden="true" /> Procurar outro mapa</Button>
                <Button variant="outline" onClick={openConfig}><Settings2 aria-hidden="true" /> Configuração <kbd className="game-key">{backLabel}</kbd></Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <WildSetup badges={badges} population={population} teamLevel={teamLevel} settings={settings} onChange={setSettings} board={wild} message={message}
          onSearch={() => startSearch()} onResume={() => { setMessage(null); setView('map'); }} />
      )}

      {catching && catching.phase === 'choose' && (
        <Suspense fallback={null}>
          <DirectCaptureDialog key={catching.encounter.id} encounter={catching.encounter} game={game}
            onThrow={(ball) => void throwAt(ball)} onClose={closeCatch} />
        </Suspense>
      )}
      <div className="ball-fx-layer"><BallFx ref={ballFx} cell="8rem" /></div>
      {fighting && wild && (
        <Suspense fallback={<div className="battle-overlay" role="status">Preparando a batalha…</div>}>
          <BattleScreen key={fighting.id} encounter={fighting} game={game} scene={wild.map}
            onFinish={(settle) => {
              change(settle);
              setBattleId(null);
            }} />
        </Suspense>
      )}

      <Dialog open={confirmSearch} onOpenChange={setConfirmSearch}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Procurar outro mapa?</DialogTitle>
            <DialogDescription>
              Ainda há {specials.length === 1 ? 'um Pokémon especial solto' : `${specials.length} Pokémon especiais soltos`} neste mapa:{' '}
              {specials.map((encounter) => `${gradeBadge(encounter)} ${encounterName(encounter)}`).join(', ')}.
              Um mapa novo faz todos eles sumirem.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmSearch(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => startSearch(true)}>Procurar outro mapa</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
