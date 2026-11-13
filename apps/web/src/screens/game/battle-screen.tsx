import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArenaId } from '@pokesim-evolution/data/arenas';
import { arenaLayout } from '@pokesim-evolution/data/arenas';
import { battleMoves, getBattleItem } from '@pokesim-evolution/data/battle-data';
import { getPokemon } from '@pokesim-evolution/data/pokedex';
import { spriteSheetUrl } from './pokedex-media';
import { BallFx, type BallFxHandle } from './ball-fx';
import { FxStage, type FxStageHandle, type SpriteState } from './battle-fx-stage';
import { palettes, pickAnimation, type FxType } from '@/lib/battle-fx';
import { type GameState } from '@/lib/game-state';
import type { WildEncounter } from '@/lib/wild';
import { levelProgress } from '@/lib/battle/experience';
import { effectiveness, effectivenessLabel } from '@/lib/battle/typechart';
import { STAGE_KEYS, STAGE_LABELS, emptyStages, type BattleEvent, type BattleState, type Combatant, type StageKey, type StatusKind } from '@/lib/battle/engine';
import { actionForKey, useBattleKeys, type BattleKeyAction } from '@/lib/battle-keys';
import { act, battleBag, battleContext, settleBattle, startOpponentBattle, startWildBattle, type BattleRequest } from '@/lib/battle/session';
import type { Opponent } from '@/lib/battle/challenges';
import { completeOpponent } from '@/lib/battle/challenges';
import { getTrainerSprite } from '@/lib/trainer-sprites';
import { animationFactorOf, textSpeedOf, useSettings } from '@/lib/settings';
import { TypedText, typingMs } from '@/components/typed-text';
import { TrainerSpritePreview } from '@/components/sprite-preview';
import { formOf, localFormSprite, remoteFormSprite } from '@/lib/training';
import '@/styles/battle.css';
import { duckRadio } from '@/lib/radio';
import { playEffect } from '@/lib/sfx';

type Mon = {
  index: number; speciesId: number; name: string; level: number; hp: number; maxHp: number;
  status: StatusKind | null; confused: boolean; shiny: boolean; xp: number;
  /** Buffs (+) e debuffs (−) de atributo em campo, de -6 a +6. */
  stages: Record<StageKey, number>;
  form?: string;
};
/** Última mudança de atributo, para o aviso que sobe do painel (o id muda a cada evento e reinicia a animação). */
type StagePop = { id: number; side: 'player' | 'foe'; stat: StageKey; change: number };
type Display = { player: Mon; foe: Mon; playerState: SpriteState; foeState: SpriteState; pop: StagePop | null };
type Menu = 'main' | 'moves' | 'bag' | 'team' | { heal: string } | null;

const statusNames: Record<StatusKind, string> = { burn: 'QUE', poison: 'ENV', paralysis: 'PAR', sleep: 'SON', freeze: 'CON', confusion: 'CNF' };
const stageNames: Record<StageKey, string> = { atk: 'Atq', def: 'Def', spa: 'Atq.E', spd: 'Def.E', spe: 'Vel', acc: 'Prec', eva: 'Esq' };
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
const typeLabels: Record<string, string> = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico', grass: 'Planta', ice: 'Gelo', fighting: 'Lutador', poison: 'Veneno',
  ground: 'Terra', flying: 'Voador', psychic: 'Psíquico', bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão', dark: 'Sombrio', steel: 'Aço', fairy: 'Fada',
};

const spriteOf = ({ speciesId, shiny, form }: Pick<Mon, 'speciesId' | 'shiny' | 'form'>) => {
  const variant = formOf({ species: speciesId, form });
  const local = variant && localFormSprite(variant.name);
  const entry = getPokemon(speciesId);
  return {
    sheet: local ? spriteSheetUrl(local, shiny) : entry ? spriteSheetUrl(entry.sprite, shiny) : '',
    art: variant && !local ? remoteFormSprite(variant.spriteId, shiny) : undefined,
  };
};

function monOf(c: Combatant, index: number): Mon {
  const species = battleContext.species(c.speciesId);
  return {
    index, speciesId: c.speciesId, name: c.name, level: c.level, hp: c.hp, maxHp: c.stats.hp, status: c.status,
    confused: c.confusion > 0, shiny: c.shiny, form: c.form, xp: levelProgress(species.growthRate, c.level, c.exp), stages: { ...c.stages },
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });
const level = (hp: number, max: number) => (hp / max > 0.5 ? 'high' : hp / max > 0.2 ? 'mid' : 'low');

function Hud({ side, mon, pop }: { side: 'jogador' | 'adversario'; mon: Mon; pop: StagePop | null }) {
  const changed = STAGE_KEYS.filter((key) => mon.stages[key] !== 0);
  return (
    <div className="battle-hud" data-side={side} aria-label={`${mon.name}, nível ${mon.level}, HP ${mon.hp} de ${mon.maxHp}`}>
      <div className="battle-hud-head">
        <span className="battle-hud-name">{mon.name}{mon.shiny ? ' ✨' : ''}</span>
        <span className="battle-hud-level">Nv {mon.level}</span>
      </div>
      <div className="battle-hud-bar">
        <b>HP</b>
        <span className="battle-track"><span className="battle-fill" data-level={level(mon.hp, mon.maxHp)} style={{ width: `${Math.max(mon.hp > 0 ? 2 : 0, (mon.hp / mon.maxHp) * 100)}%` }} /></span>
        {mon.status && <span className="battle-status" data-status={mon.status}>{statusNames[mon.status]}</span>}
        {mon.confused && <span className="battle-status" data-status="confusion">{statusNames.confusion}</span>}
      </div>
      {changed.length > 0 && (
        <ul className="battle-stages" aria-label="Alterações de atributos">
          {changed.map((key) => {
            const value = mon.stages[key];
            return (
              <li key={`${key}:${value}`} className="battle-stage" data-dir={value > 0 ? 'up' : 'down'}
                title={`${STAGE_LABELS[key]} ${signed(value)}`} aria-label={`${STAGE_LABELS[key]} ${signed(value)}`}>
                {stageNames[key]} <b aria-hidden="true">{value > 0 ? '▲' : '▼'}{Math.abs(value)}</b>
              </li>
            );
          })}
        </ul>
      )}
      {pop && (
        <span key={pop.id} className="battle-stage-pop" data-dir={pop.change > 0 ? 'up' : 'down'} aria-hidden="true">
          {STAGE_LABELS[pop.stat]} {(pop.change > 0 ? '▲' : '▼').repeat(Math.min(3, Math.abs(pop.change)))}
        </span>
      )}
      {side === 'jogador' && (
        <>
          <div className="battle-hp-text">{mon.hp} / {mon.maxHp}</div>
          <div className="battle-xp"><span style={{ width: `${mon.xp * 100}%` }} /></div>
        </>
      )}
    </div>
  );
}

export default function BattleScreen({ encounter, opponent, game, scene, onFinish }: ({
  encounter: WildEncounter; opponent?: never;
} | {
  opponent: Opponent; encounter?: never;
}) & {
  game: GameState;
  scene: ArenaId;
  /** Chamado ao fechar a tela de resultado, com a função que grava o resultado no save. */
  onFinish: (settle: (state: GameState) => GameState) => void;
}) {
  const initial = useMemo(() => opponent ? startOpponentBattle(game.collection.team, opponent.team, {
    name: opponent.name, title: opponent.title, skill: opponent.skill, lastSwitch: -3,
    bag: opponent.skill > 1 ? [{ item: 'super-potion', name: 'Super Poção', heal: 50, cures: false, qty: 1 }] : [],
  }, opponent.cap) : startWildBattle(game.collection.team, encounter!, game.collection.companion), []); // eslint-disable-line react-hooks/exhaustive-deps
  const opponentSprite = opponent?.sprite ? getTrainerSprite(opponent.sprite) : undefined;
  const partnerSprite = opponent?.partnerSprite ? getTrainerSprite(opponent.partnerSprite) : undefined;
  const finished = useRef(false);
  const stage = useRef<FxStageHandle>(null);
  const started = useRef(false);
  const speed = useRef(1);
  const textCps = useRef(60);
  const ballUsed = useRef<string | null>(null);
  const [battle, setBattle] = useState<BattleState>(initial.state);
  const [bag, setBag] = useState(game.progress.bag);
  const [display, setDisplay] = useState<Display>(() => ({
    player: monOf(initial.state.player.team[initial.state.player.active]!, initial.state.player.active),
    foe: monOf(initial.state.foe.team[0]!, 0), playerState: 'hidden', foeState: 'hidden', pop: null,
  }));
  const [message, setMessage] = useState('');
  const [menu, setMenu] = useState<Menu>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ballFx = useRef<BallFxHandle>(null);
  const [fast, setFast] = useState(false);
  const keys = useBattleKeys();

  const wait = (ms: number) => sleep(ms / speed.current);
  const patch = (side: 'player' | 'foe', change: Partial<Mon>) => setDisplay((d) => ({ ...d, [side]: { ...d[side], ...change } }));

  /** Arremesso da Poké Bola: sai do jogador, engole o selvagem, cai no chão e balança; o resultado vem do motor. */
  async function throwBall(ev: Extract<BattleEvent, { k: 'ball' }>) {
    const me = arenaLayout.spots.jogador;
    const them = arenaLayout.spots.adversario;
    await ballFx.current?.play({
      ball: ev.ball, unit: '%', arc: 24, caught: ev.caught, shakes: ev.shakes, speed: speed.current,
      from: { x: me.x * 100 + 5, y: (me.y - 0.14) * 100 },
      to: { x: them.x * 100, y: (them.y - 0.11) * 100 },
      ground: { x: them.x * 100, y: (them.y - 0.04) * 100 },
      onOpen: () => setDisplay((d) => ({ ...d, foeState: 'captured' })),
      onRelease: () => setDisplay((d) => ({ ...d, foeState: 'idle' })),
      onCaught: () => { playEffect('catching'); },
    });
  }

  async function play(before: BattleState, events: BattleEvent[]) {
    for (const ev of events) {
      if (ev.text) setMessage(ev.text);
      const startedAt = performance.now();
      switch (ev.k) {
        case 'send': {
          const team = ev.side === 'player' ? before.player.team : before.foe.team;
          const c = team[ev.index];
          if (c) {
            setDisplay((d) => ({ ...d, [ev.side === 'player' ? 'player' : 'foe']: monOf(c, ev.index), [ev.side === 'player' ? 'playerState' : 'foeState']: 'idle' }));
          }
          await wait(1100);
          break;
        }
        case 'move': {
          const type = (palettes[ev.type as FxType] ? ev.type : 'normal') as FxType;
          await stage.current?.play(pickAnimation({ slug: ev.move, type, category: ev.category }), ev.side === 'player' ? 'jogador' : 'adversario', speed.current);
          await wait(120);
          break;
        }
        case 'hit':
          patch(ev.side === 'player' ? 'player' : 'foe', { hp: ev.hp });
          await wait(700);
          break;
        case 'heal':
          patch(ev.side === 'player' ? 'player' : 'foe', { hp: ev.hp });
          await wait(700);
          break;
        case 'status':
          if (ev.status === 'confusion') patch(ev.side === 'player' ? 'player' : 'foe', { confused: true });
          else patch(ev.side === 'player' ? 'player' : 'foe', { status: ev.status });
          await wait(900);
          break;
        case 'status-end':
          if (ev.status === 'confusion') patch(ev.side === 'player' ? 'player' : 'foe', { confused: false });
          else patch(ev.side === 'player' ? 'player' : 'foe', { status: null });
          await wait(800);
          break;
        case 'faint':
          // Ao desmaiar, os buffs e debuffs somem do painel.
          setDisplay((d) => {
            const side = ev.side === 'player' ? 'player' : 'foe';
            return { ...d, [side]: { ...d[side], stages: emptyStages() }, [ev.side === 'player' ? 'playerState' : 'foeState']: 'fainted' };
          });
          await wait(1100);
          break;
        case 'xp':
          setDisplay((d) => (d.player.index === ev.index ? { ...d, player: { ...d.player, xp: ev.progress } } : d));
          await wait(900);
          break;
        case 'level':
          setDisplay((d) => (d.player.index === ev.index ? { ...d, player: { ...d.player, level: ev.level, hp: ev.hp, maxHp: ev.maxHp, xp: ev.progress } } : d));
          await wait(1000);
          break;
        case 'ball':
          await throwBall(ev);
          break;
        case 'stage': {
          const side = ev.side === 'player' ? 'player' : 'foe';
          setDisplay((d) => ({
            ...d,
            [side]: { ...d[side], stages: { ...d[side].stages, [ev.stat]: ev.value } },
            pop: { id: (d.pop?.id ?? 0) + 1, side, stat: ev.stat, change: ev.change },
          }));
          await wait(850);
          break;
        }
        case 'miss':
        case 'learn':
        case 'run':
        case 'money':
          await wait(850);
          break;
        case 'end':
          break;
        default:
          if (ev.text) await wait(500 + ev.text.length * 8);
      }
      // A velocidade de texto (Opções): o próximo aviso só entra depois que este terminou de ser escrito.
      if (ev.text) {
        const remaining = typingMs(ev.text.length, textCps.current) + 250 - (performance.now() - startedAt);
        if (remaining > 0) await sleep(remaining);
      }
    }
  }

  async function finishStep(before: BattleState, step: { state: BattleState; events: BattleEvent[] }) {
    await play(before, step.events);
    setBattle(step.state);
    setBusy(false);
    setMenu(step.state.phase === 'ended' ? null : step.state.phase === 'replace' ? 'team' : 'main');
    if (step.state.phase !== 'ended') setMessage(step.state.phase === 'replace' ? 'Escolha o próximo Pokémon.' : `O que ${step.state.player.team[step.state.player.active]!.name} vai fazer?`);
  }

  // Durante a batalha o rádio fica a 10% e a música de abertura toca no início.
  useEffect(() => {
    const release = duckRadio();
    const intro = playEffect('battle');
    return () => { intro.stop(); release(); };
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void finishStep(initial.state, { state: initial.state, events: initial.events });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const settings = useSettings();
  textCps.current = textSpeedOf(settings.textSpeed).cps;
  useEffect(() => { speed.current = (fast ? 2.2 : 1) * animationFactorOf(settings.animationSpeed); }, [fast, settings.animationSpeed]);

  async function run(request: BattleRequest) {
    if (busy || battle.phase === 'ended') return;
    setError(null);
    let step;
    try { step = act(battle, bag, request); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Ação inválida.'); return; }
    if (request.kind === 'ball') ballUsed.current = request.item;
    setBusy(true);
    setMenu(null);
    setBag(step.bag);
    await finishStep(battle, step);
    setDisplay((d) => ({ ...d, player: d.player }));
  }

  const me = battle.player.team[battle.player.active]!;
  const foe = battle.foe.team[battle.foe.active]!;
  const items = battleBag(bag, battle.kind);
  const ended = battle.phase === 'ended' && !busy;
  const settle = (state: GameState) => settleBattle(state, battle, bag, encounter?.id ?? null,
    ballUsed.current, opponent?.reward, opponent?.mode !== 'torneios');
  const settled = useMemo(() => ended ? settle(game) : null, [ended]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onFinish((state) => {
      const result = settle(state).state;
      return opponent ? completeOpponent(result, opponent, battle.result === 'win') : result;
    });
  };

  // Atalhos de teclado (as teclas são configuráveis na ficha do Pokémon): golpes 1 a 4 e os botões do menu principal.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (ended && settled) {
        if (event.key === 'Enter') { event.preventDefault(); finish(); }
        return;
      }
      if (busy || battle.phase === 'ended') return;
      if (event.key === 'Escape' || event.key === 'Backspace') {
        if (typeof menu === 'object' && menu !== null) setMenu('bag');
        else if ((menu === 'moves' || menu === 'bag' || menu === 'team') && battle.phase !== 'replace') setMenu('main');
        else return;
        event.preventDefault();
        return;
      }
      const action = actionForKey(keys, event.key);
      if (!action) return;
      const slot = (['move1', 'move2', 'move3', 'move4'] as BattleKeyAction[]).indexOf(action);
      if (slot >= 0) {
        if ((menu === 'main' || menu === 'moves') && slot < me.moves.length) { event.preventDefault(); void run({ kind: 'move', slot }); }
        return;
      }
      if (menu !== 'main') return;
      event.preventDefault();
      if (action === 'fight') setMenu('moves');
      else if (action === 'bag') setMenu('bag');
      else if (action === 'team') setMenu('team');
      else if (action === 'run' && battle.kind !== 'trainer') void run({ kind: 'run' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const resultTitle = battle.result === 'win' ? 'Você venceu!' : battle.result === 'captured' ? 'Captura feita!' : battle.result === 'fled' ? 'Você fugiu.' : 'Você perdeu...';
  const playerSprite = spriteOf(display.player);
  const foeSprite = spriteOf(display.foe);

  return (
    <div className="battle-overlay" role="dialog" aria-modal="true" aria-label="Batalha">
      <div className="battle-panel">
        <div className="battle-tools">
          {opponent && <div className="flex items-center gap-2">
            {opponentSprite && <TrainerSpritePreview sprite={opponentSprite} />}
            {partnerSprite && <TrainerSpritePreview sprite={partnerSprite} />}
            <strong className="text-sm">{opponent.name}</strong>
          </div>}
          <button type="button" onClick={() => setFast((f) => !f)} aria-pressed={fast}>Velocidade {fast ? '×2' : '×1'}</button>
        </div>
        <FxStage ref={stage} scene={scene} playerSheet={playerSprite.sheet} playerArt={playerSprite.art}
          enemySheet={foeSprite.sheet} enemyArt={foeSprite.art} playerState={display.playerState} enemyState={display.foeState}
          overlay={(
            <div className="battle-arena-front" style={{ pointerEvents: 'none' }}>
              <Hud side="adversario" mon={display.foe} pop={display.pop?.side === 'foe' ? display.pop : null} />
              <Hud side="jogador" mon={display.player} pop={display.pop?.side === 'player' ? display.pop : null} />
              <BallFx ref={ballFx} cell="22cqw" />
            </div>
          )} />

        <div className="battle-console">
          <div className="battle-message" aria-live="polite">
            {ended && settled ? (
              <div className="battle-result">
                <h2>{resultTitle}</h2>
                <ul>
                  {settled.outcome.caught && <li>{settled.outcome.caught.nickname ?? foe.name} foi para o seu time ou PC.</li>}
                  {settled.outcome.problem && <li className="battle-error">{settled.outcome.problem}</li>}
                  {settled.outcome.money > 0 && <li>Você ganhou ₽ {settled.outcome.money.toLocaleString('pt-BR')}.</li>}
                  {settled.outcome.levels.map((entry) => <li key={entry.name}>{entry.name} chegou ao nível {entry.level}.</li>)}
                  {settled.outcome.lost.map((name) => <li key={name} className="battle-error">{name} foi derrotado e perdido para sempre.</li>)}
                  {settled.outcome.gameOver && <li className="battle-error">Todos os seus Pokémon foram derrotados. O save será apagado.</li>}
                  {battle.result === 'lose' && game.progress.mode !== 'permadeath' && <li>Seus Pokémon foram curados. Tente de novo!</li>}
                  {battle.result === 'fled' && <li>O Pokémon continua no mapa.</li>}
                </ul>
              </div>
            ) : <TypedText text={message} />}
          </div>

          <div className="battle-menu">
            {error && <p className="battle-error" role="alert">{error}</p>}
            {ended && settled && (
              <button type="button" className="battle-btn" data-primary="true"
                onClick={finish}>
                Continuar <kbd className="battle-key">Enter</kbd>
              </button>
            )}
            {!ended && menu === 'main' && (
              <div className="battle-menu-grid">
                <button type="button" className="battle-btn" data-primary="true" disabled={busy} onClick={() => setMenu('moves')}>Lutar <kbd className="battle-key">{keys.fight}</kbd></button>
                <button type="button" className="battle-btn" disabled={busy} onClick={() => setMenu('bag')}>Mochila <kbd className="battle-key">{keys.bag}</kbd></button>
                <button type="button" className="battle-btn" disabled={busy} onClick={() => setMenu('team')}>Pokémon <kbd className="battle-key">{keys.team}</kbd></button>
                <button type="button" className="battle-btn" disabled={busy || battle.kind === 'trainer'} onClick={() => void run({ kind: 'run' })}>Fugir <kbd className="battle-key">{keys.run}</kbd></button>
              </div>
            )}
            {!ended && menu === 'moves' && (
              <>
                <div className="battle-menu-grid">
                  {me.moves.map((slot, index) => {
                    const move = battleMoves.get(slot.name);
                    const mult = move && move.category !== 'status' ? effectiveness(battleContext.chart, move.type, foe.types) : null;
                    return (
                      <button key={slot.name} type="button" className="battle-btn" data-move-type={move?.type} disabled={busy}
                        style={{ ['--move-color' as string]: palettes[(move?.type ?? 'normal') as FxType].mid }}
                        onClick={() => void run({ kind: 'move', slot: index })}>
                        <span>{move?.displayName ?? slot.name}<br /><small>{typeLabels[move?.type ?? 'normal']} · {move && move.category !== 'status' ? `poder ${move.power}` : 'status'}</small></span>
                        <span className="battle-btn-side">
                          {mult !== null && mult !== 1 && <small>{effectivenessLabel(mult)}</small>}
                          <kbd className="battle-key">{keys[`move${index + 1}` as BattleKeyAction]}</kbd>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="battle-back" onClick={() => setMenu('main')}>Voltar</button>
              </>
            )}
            {!ended && menu === 'bag' && (
              <>
                {items.balls.length === 0 && items.heals.length === 0 && <p className="battle-message" style={{ minHeight: 0 }}>A mochila está vazia.</p>}
                {items.balls.map((ball) => (
                  <button key={ball.name} type="button" className="battle-btn" disabled={busy} onClick={() => void run({ kind: 'ball', item: ball.name })}>
                    <span>{ball.displayName}<br /><small>{getBattleItem(ball.name)?.description}</small></span><b>×{ball.quantity}</b>
                  </button>
                ))}
                {items.heals.map((heal) => (
                  <button key={heal.name} type="button" className="battle-btn" disabled={busy} onClick={() => setMenu({ heal: heal.name })}>
                    <span>{heal.displayName}<br /><small>{getBattleItem(heal.name)?.description}</small></span><b>×{heal.quantity}</b>
                  </button>
                ))}
                <button type="button" className="battle-back" onClick={() => setMenu('main')}>Voltar</button>
              </>
            )}
            {!ended && (menu === 'team' || (menu !== null && typeof menu === 'object')) && (
              <>
                {typeof menu === 'object' && menu !== null && <p className="battle-message" style={{ minHeight: 0 }}>Usar {getBattleItem(menu.heal)?.displayName} em quem?</p>}
                {battle.player.team.map((c, index) => {
                  const picking = typeof menu === 'object' && menu !== null ? menu.heal : null;
                  const disabled = busy || (picking === null && (c.hp <= 0 || index === battle.player.active));
                  return (
                    <button key={c.ref || index} type="button" className="battle-btn battle-team-row" disabled={disabled}
                      onClick={() => void run(picking ? { kind: 'item', item: picking, target: index } : { kind: 'switch', to: index })}>
                      <span className="battle-team-sprite"><img src={spriteOf(c).sheet} alt="" draggable={false} /></span>
                      <span>{c.name} <small>Nv {c.level}</small>
                        <span className="battle-track"><span className="battle-fill" data-level={level(c.hp, c.stats.hp)} style={{ width: `${(c.hp / c.stats.hp) * 100}%` }} /></span>
                      </span>
                      <small>{c.hp}/{c.stats.hp}</small>
                    </button>
                  );
                })}
                {battle.phase !== 'replace' && <button type="button" className="battle-back" onClick={() => setMenu(typeof menu === 'object' && menu !== null ? 'bag' : 'main')}>Voltar</button>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
