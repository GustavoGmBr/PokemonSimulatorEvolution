import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
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
import { getSettings, updateSettings } from '@/lib/settings';
import { gameActions, matchesShortcut, shortcutLabel } from './game-navigation';
import { actionForKey, useBattleKeys, type BattleKeyAction } from '@/lib/battle-keys';
import { act, autoRequest, battleBag, battleBallChance, battleContext, bossCaptureOdds, keepBoss, settleBattle, startHordeBattle, startOpponentBattle, startWildBattle, throwAtBoss, type BattleRequest } from '@/lib/battle/session';
import { AREA_LABEL, isAreaMove } from '@/lib/battle/area';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { levelCap, wildBadges } from '@/lib/wild';
import { canFight, faintedTeamMessage } from '@/lib/pokemon-center';

type Mon = {
  index: number; speciesId: number; name: string; level: number; hp: number; maxHp: number;
  status: StatusKind | null; confused: boolean; shiny: boolean; xp: number;
  /** Buffs (+) e debuffs (−) de atributo em campo, de -6 a +6. */
  stages: Record<StageKey, number>;
  form?: string;
};
/** Última mudança de atributo, para o aviso que sobe do painel (o id muda a cada evento e reinicia a animação). */
type StagePop = { id: number; side: 'player' | 'foe'; stat: StageKey; change: number };
/** Horda: um adversário com o estado do seu sprite; `gone` = capturado. */
type HordeMon = Mon & { state: SpriteState; gone?: boolean };
/** `foe` é o adversário em destaque (o alvo); numa horda, `foes` traz todos eles e `foe.index` diz qual está em destaque. */
type Display = { player: Mon; foe: Mon; playerState: SpriteState; foeState: SpriteState; pop: StagePop | null; foes?: HordeMon[] };
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

function BattleSession({ encounter, opponent, game, scene, onFinish }: ({
  encounter: WildEncounter; opponent?: never;
} | {
  opponent: Opponent; encounter?: never;
}) & {
  game: GameState;
  scene: ArenaId;
  /** Chamado ao fechar a tela de resultado, com a função que grava o resultado no save. */
  onFinish: (settle: (state: GameState) => GameState) => void;
}) {
  const playerCap = levelCap(wildBadges(game.progress));
  const initial = useMemo(() => encounter?.horde ? startHordeBattle(game.collection.team, encounter, game.collection.companion, playerCap) : opponent ? startOpponentBattle(game.collection.team, opponent.team, {
    name: opponent.name, title: opponent.title, skill: opponent.skill, lastSwitch: -3,
    bag: opponent.skill > 1 ? [{ item: 'super-potion', name: 'Super Poção', heal: 50, cures: false, qty: 1 }] : [],
  }, opponent.cap, playerCap) : startWildBattle(game.collection.team, encounter!, game.collection.companion, playerCap), []); // eslint-disable-line react-hooks/exhaustive-deps
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
  const [display, setDisplay] = useState<Display>(() => {
    const foes = initial.state.horde ? initial.state.foe.team.map((c, index): HordeMon => ({ ...monOf(c, index), state: 'hidden' })) : undefined;
    return {
      player: monOf(initial.state.player.team[initial.state.player.active]!, initial.state.player.active),
      foe: foes ? foes[0]! : monOf(initial.state.foe.team[0]!, 0), playerState: 'hidden', foeState: 'hidden', pop: null, foes,
    };
  });
  const [message, setMessage] = useState('');
  const [menu, setMenu] = useState<Menu>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ballFx = useRef<BallFxHandle>(null);
  const [fast, setFast] = useState(false);
  const [bagTab, setBagTab] = useState<'captura' | 'cura'>('captura');
  const [analysisIndex, setAnalysisIndex] = useState<number | null>(null);
  // Chefe derrotado: dá para tentar capturá-lo, enfraquecido, antes de fechar o resultado.
  const [bossBusy, setBossBusy] = useState(false);
  const [bossCaught, setBossCaught] = useState<string | null>(null);
  const [bossMisses, setBossMisses] = useState(0);
  const keys = useBattleKeys();

  const wait = (ms: number) => sleep(ms / speed.current);
  /** Altera o painel de um lado; na horda, `target` é o adversário atingido (sem ele, o que está em destaque). */
  const patch = (side: 'player' | 'foe', change: Partial<Mon>, target?: number) => setDisplay((d) => {
    if (side === 'foe' && d.foes) {
      const at = target ?? d.foe.index;
      const foes = d.foes.map((entry, index) => (index === at ? { ...entry, ...change } : entry));
      return { ...d, foes, foe: foes[d.foe.index]! };
    }
    return { ...d, [side]: { ...d[side], ...change } };
  });
  /** Horda: muda o estado do sprite de um adversário (e o do palco, se ele estiver em destaque). */
  const setFoeState = (target: number, state: SpriteState, change: Partial<HordeMon> = {}) => setDisplay((d) => {
    if (!d.foes) return { ...d, foeState: state };
    const foes = d.foes.map((entry, index) => (index === target ? { ...entry, ...change, state } : entry));
    return { ...d, foes, foe: foes[d.foe.index]!, foeState: target === d.foe.index ? state : d.foeState };
  });
  /** Horda: põe outro adversário em destaque (é nele que o golpe ou a bola vai cair). */
  const focusOn = (index: number) => setDisplay((d) => (d.foes?.[index] ? { ...d, foe: d.foes[index]!, foeState: d.foes[index]!.state, pop: null } : d));

  /** Arremesso da Poké Bola: sai do jogador, engole o selvagem, cai no chão e balança; o resultado vem do motor. */
  async function throwBall(ev: Extract<BattleEvent, { k: 'ball' }>) {
    // Horda: a bola vai no adversário escolhido, que sobe para o palco antes do arremesso.
    const horde = ev.target !== undefined ? { index: ev.target } : null;
    if (horde) focusOn(horde.index);
    const me = arenaLayout.spots.jogador;
    const them = arenaLayout.spots.adversario;
    await ballFx.current?.play({
      ball: ev.ball, unit: '%', arc: 24, caught: ev.caught, shakes: ev.shakes, speed: speed.current,
      from: { x: me.x * 100 + 5, y: (me.y - 0.14) * 100 },
      to: { x: them.x * 100, y: (them.y - 0.11) * 100 },
      ground: { x: them.x * 100, y: (them.y - 0.04) * 100 },
      onOpen: () => (horde ? setFoeState(horde.index, 'captured') : setDisplay((d) => ({ ...d, foeState: 'captured' }))),
      onRelease: () => (horde ? setFoeState(horde.index, 'idle') : setDisplay((d) => ({ ...d, foeState: 'idle' }))),
      onCaught: () => { playEffect('catching'); if (horde) setFoeState(horde.index, 'captured', { gone: true, hp: 0 }); },
    });
  }

  async function throwAtDefeatedBoss(ball: string) {
    if (!opponent || bossBusy || bossCaught) return;
    const boss = opponent.team[0]!;
    const attempt = throwAtBoss(boss, ball, game.collection.team);
    const me = arenaLayout.spots.jogador;
    const them = arenaLayout.spots.adversario;
    setBossBusy(true);
    setBag((current) => ({ ...current, [ball]: Math.max(0, (current[ball] ?? 0) - 1) }));
    setDisplay((d) => ({ ...d, foeState: 'idle' }));
    await ballFx.current?.play({
      ball, unit: '%', arc: 24, caught: attempt.caught, shakes: attempt.shakes, speed: speed.current,
      from: { x: me.x * 100 + 5, y: (me.y - 0.14) * 100 },
      to: { x: them.x * 100, y: (them.y - 0.11) * 100 },
      ground: { x: them.x * 100, y: (them.y - 0.04) * 100 },
      onOpen: () => setDisplay((d) => ({ ...d, foeState: 'captured' })),
      onRelease: () => setDisplay((d) => ({ ...d, foeState: 'idle' })),
      onCaught: () => { playEffect('catching'); },
    });
    if (attempt.caught) setBossCaught(ball);
    else { setBossMisses((count) => count + 1); setDisplay((d) => ({ ...d, foeState: 'fainted' })); }
    setBossBusy(false);
  }

  async function play(before: BattleState, events: BattleEvent[]) {
    for (const ev of events) {
      if (ev.text) setMessage(ev.text);
      const startedAt = performance.now();
      switch (ev.k) {
        case 'send': {
          const team = ev.side === 'player' ? before.player.team : before.foe.team;
          const c = team[ev.index];
          if (ev.side === 'foe' && before.horde) {
            // Horda: cada adversário aparece no seu lugar; o primeiro já fica em destaque.
            if (c) setFoeState(ev.index, 'idle', monOf(c, ev.index));
            await wait(450);
            break;
          }
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
          patch(ev.side === 'player' ? 'player' : 'foe', { hp: ev.hp }, ev.target);
          await wait(700);
          break;
        case 'heal':
          patch(ev.side === 'player' ? 'player' : 'foe', { hp: ev.hp }, ev.target);
          await wait(700);
          break;
        case 'status':
          if (ev.status === 'confusion') patch(ev.side === 'player' ? 'player' : 'foe', { confused: true }, ev.target);
          else patch(ev.side === 'player' ? 'player' : 'foe', { status: ev.status }, ev.target);
          await wait(900);
          break;
        case 'status-end':
          if (ev.status === 'confusion') patch(ev.side === 'player' ? 'player' : 'foe', { confused: false }, ev.target);
          else patch(ev.side === 'player' ? 'player' : 'foe', { status: null }, ev.target);
          await wait(800);
          break;
        case 'faint':
          if (ev.side === 'foe' && before.horde) {
            setFoeState(ev.target ?? 0, 'fainted', { stages: emptyStages() });
            await wait(1000);
            break;
          }
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
        case 'focus':
          focusOn(ev.index);
          break;
        case 'ball':
          await throwBall(ev);
          break;
        case 'stage': {
          const side = ev.side === 'player' ? 'player' : 'foe';
          setDisplay((d) => {
            if (side === 'foe' && d.foes) {
              const at = ev.target ?? d.foe.index;
              const foes = d.foes.map((entry, index) => (index === at ? { ...entry, stages: { ...entry.stages, [ev.stat]: ev.value } } : entry));
              return { ...d, foes, foe: foes[d.foe.index]!, pop: at === d.foe.index ? { id: (d.pop?.id ?? 0) + 1, side, stat: ev.stat, change: ev.change } : d.pop };
            }
            return {
              ...d,
              [side]: { ...d[side], stages: { ...d[side].stages, [ev.stat]: ev.value } },
              pop: { id: (d.pop?.id ?? 0) + 1, side, stat: ev.stat, change: ev.change },
            };
          });
          await wait(before.horde && ev.side === 'foe' ? 450 : 850);
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

  // Auto-batalha: com a vez livre, escolhe o golpe (ou quem entra) depois de uma pausa curta, que dá tempo de desligar.
  useEffect(() => {
    if (!settings.autoBattle || busy || bossBusy || battle.phase === 'ended') return;
    const timer = window.setTimeout(() => {
      const request = autoRequest(battle);
      if (request) void run(request);
    }, 600 / speed.current);
    return () => window.clearTimeout(timer);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(input: BattleRequest) {
    if (busy || battle.phase === 'ended') return;
    setError(null);
    // Horde: golpes e bolas caem no adversário em destaque, a menos que o pedido já traga o alvo.
    const request: BattleRequest = battle.horde && (input.kind === 'move' || input.kind === 'ball') && input.target === undefined
      ? { ...input, target: display.foe.index } : input;
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
  const focus = battle.horde ? display.foe.index : battle.foe.active;
  const foe = battle.foe.team[focus]!;
  /** Estado visto pelo jogador: na horda, o alvo em destaque (chance de captura e efetividade dependem dele). */
  const view = battle.horde && focus !== battle.foe.active ? { ...battle, foe: { ...battle.foe, active: focus } } : battle;
  const items = battleBag(bag, battle.kind);
  const ended = battle.phase === 'ended' && !busy;
  const bossBalls = opponent?.mode === 'chefes' && battle.result === 'win' && !bossCaught ? battleBag(bag, 'wild').balls : [];
  const settle = (state: GameState) => settleBattle(state, battle, bag, encounter?.id ?? null,
    ballUsed.current, opponent?.reward, opponent?.mode !== 'torneios');
  const settled = useMemo(() => ended ? settle(game) : null, [ended]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (finished.current || bossBusy) return;
    finished.current = true;
    onFinish((state) => {
      const result = settle(state).state;
      const completed = opponent ? completeOpponent(result, opponent, battle.result === 'win') : result;
      const kept = opponent && bossCaught ? keepBoss(completed, opponent.team[0]!, bossCaught) : completed;
      return typeof kept === 'string' ? completed : kept;
    });
  };

  // O atalho global da auto-batalha (Ctrl + tecla) também vale durante a luta, onde os atalhos da tela do jogo ficam desligados.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.repeat || !matchesShortcut(event, gameActions.autoBattle.key)) return;
      event.preventDefault();
      updateSettings({ autoBattle: !getSettings().autoBattle });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      <div className="battle-panel" data-horde={battle.horde ? 'true' : undefined}>
        <div className="battle-tools">
          {opponent && <div className="flex items-center gap-2">
            {opponentSprite && <TrainerSpritePreview sprite={opponentSprite} />}
            {partnerSprite && <TrainerSpritePreview sprite={partnerSprite} />}
            <strong className="text-sm">{opponent.name}</strong>
          </div>}
          <button type="button" onClick={() => updateSettings({ autoBattle: !settings.autoBattle })} aria-pressed={settings.autoBattle}
            title={`${gameActions.autoBattle.label} (${shortcutLabel(gameActions.autoBattle.key)})`}>Auto-batalha {settings.autoBattle ? 'ligada' : 'desligada'}</button>
          <button type="button" onClick={() => setFast((f) => !f)} aria-pressed={fast}>Velocidade {fast ? '×2' : '×1'}</button>
        </div>
        <FxStage ref={stage} scene={scene} playerSheet={playerSprite.sheet} playerArt={playerSprite.art}
          enemySheet={foeSprite.sheet} enemyArt={foeSprite.art} playerState={display.playerState} enemyState={display.foeState}
          others={display.foes?.flatMap((entry, index) => (index === display.foe.index ? [] : [{
            key: `${battle.foe.team[index]!.ref || 'horda'}:${index}`, ...spriteOf(entry), state: entry.state,
            label: `${entry.name} nível ${entry.level}`, onPick: () => { if (!busy && !ended) focusOn(index); },
          }]))}
          overlay={(
            <div className="battle-arena-front" style={{ pointerEvents: 'none' }}>
              <Hud side="adversario" mon={display.foe} pop={display.pop?.side === 'foe' ? display.pop : null} />
              <Hud side="jogador" mon={display.player} pop={display.pop?.side === 'player' ? display.pop : null} />
              <BallFx ref={ballFx} cell="22cqw" />
            </div>
          )} />

        {display.foes && (
          <ul className="battle-horde" aria-label="Horda: escolha o alvo">
            {display.foes.map((entry, index) => {
              const down = entry.hp <= 0 || entry.gone;
              return (
                <li key={index}>
                  <button type="button" data-active={index === display.foe.index} data-down={down ? 'true' : undefined}
                    disabled={down || busy || ended} aria-pressed={index === display.foe.index} onClick={() => focusOn(index)}>
                    <span className="battle-horde-name">{entry.name}{entry.shiny ? ' ✨' : ''} <small>Nv {entry.level}</small></span>
                    <span className="battle-track"><span className="battle-fill" data-level={level(entry.hp, entry.maxHp)} style={{ width: `${entry.hp > 0 ? Math.max(2, (entry.hp / entry.maxHp) * 100) : 0}%` }} /></span>
                    {entry.status && <span className="battle-status" data-status={entry.status}>{statusNames[entry.status]}</span>}
                    {entry.gone && <small>capturado</small>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="battle-console">
          <div className="battle-message" aria-live="polite">
            {ended && settled ? (
              <div className="battle-result">
                <h2>{resultTitle}</h2>
                <ul>
                  {settled.outcome.caughtAll.map((pokemon) => <li key={pokemon.uid}>{pokemon.nickname ?? getPokemon(pokemon.species)?.displayName ?? foe.name} foi para o seu time ou PC.</li>)}
                  {settled.outcome.problem && <li className="battle-error">{settled.outcome.problem}</li>}
                  {settled.outcome.money > 0 && <li>Você ganhou ₽ {settled.outcome.money.toLocaleString('pt-BR')}.</li>}
                  {settled.outcome.levels.map((entry) => <li key={entry.name}>{entry.name} chegou ao nível {entry.level}.</li>)}
                  {settled.outcome.fainted.length > 0 && battle.kind === 'wild' && game.progress.mode !== 'permadeath' && <li>Desmaiados: {settled.outcome.fainted.join(', ')}. Cure-os no Centro Pokémon ou no mapa por ₽ 500.</li>}
                  {settled.outcome.lost.map((name) => <li key={name} className="battle-error">{name} foi derrotado e perdido para sempre.</li>)}
                  {settled.outcome.gameOver && <li className="battle-error">Todos os seus Pokémon foram derrotados. O save será apagado.</li>}
                  {battle.kind === 'trainer' && game.progress.mode !== 'permadeath' && <li>Sua equipe foi curada.</li>}
                  {battle.result === 'fled' && <li>{battle.horde && settled.outcome.caughtAll.length > 0 ? 'O restante da horda foi embora.' : battle.horde ? 'A horda continua no mapa.' : 'O Pokémon continua no mapa.'}</li>}
                  {opponent?.mode === 'chefes' && battle.result === 'win' && !bossCaught && bossMisses === 0 && bossBalls.length > 0 && <li>{foe.name} está enfraquecido: dá para tentar capturá-lo antes de continuar.</li>}
                  {bossMisses > 0 && !bossCaught && <li>{foe.name} escapou {bossMisses === 1 ? 'da bola' : `de ${bossMisses} bolas`}.</li>}
                  {bossCaught && <li className="font-bold">{foe.name} foi capturado e vai para o seu time ou PC!</li>}
                </ul>
              </div>
            ) : <TypedText text={message} />}
          </div>

          <div className="battle-menu">
            {error && <p className="battle-error" role="alert">{error}</p>}
            {ended && settled && bossBalls.length > 0 && <div className="battle-menu-grid">{bossBalls.map((ball) => {
              const odds = Math.round(bossCaptureOdds(opponent!.team[0]!, ball.name, game.collection.team) * 1000) / 10;
              return (
                <button key={ball.name} type="button" className="battle-btn" disabled={bossBusy} onClick={() => void throwAtDefeatedBoss(ball.name)}>
                  <span className="battle-ball-copy">{ball.displayName}<strong className="battle-capture-chance" aria-label={`Chance de captura ${odds}%`}>Captura: {odds}%</strong></span><b>×{ball.quantity}</b>
                </button>
              );
            })}</div>}
            {ended && settled && (
              <button type="button" className="battle-btn" data-primary="true" disabled={bossBusy}
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
                        <span>{move?.displayName ?? slot.name}<br /><small>{typeLabels[move?.type ?? 'normal']} · {move && move.category !== 'status' ? `poder ${move.power}` : 'status'}{move && isAreaMove(move) && <> · <b className="battle-area" title="Atinge todos os adversários de uma horda">{AREA_LABEL}</b></>}</small></span>
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
                <div className="battle-bag-tabs" role="tablist" aria-label="Categorias da mochila">
                  <button type="button" role="tab" aria-selected={bagTab === 'captura'} onClick={() => setBagTab('captura')}>Poké Bolas · {items.balls.length}</button>
                  <button type="button" role="tab" aria-selected={bagTab === 'cura'} onClick={() => setBagTab('cura')}>Cura · {items.heals.length}</button>
                </div>
                {bagTab === 'captura' && items.balls.map((ball) => (
                  <button key={ball.name} type="button" className="battle-btn" disabled={busy} onClick={() => void run({ kind: 'ball', item: ball.name })}>
                    <span className="battle-ball-copy">{ball.displayName}<small>{getBattleItem(ball.name)?.description}</small><strong className="battle-capture-chance" aria-label={`Chance de captura ${Math.round(battleBallChance(view, ball.name, bag) * 1000) / 10}%`}>Captura: {Math.round(battleBallChance(view, ball.name, bag) * 1000) / 10}%</strong></span><b>×{ball.quantity}</b>
                  </button>
                ))}
                {bagTab === 'cura' && items.heals.map((heal) => (
                  <button key={heal.name} type="button" className="battle-btn" disabled={busy} onClick={() => setMenu({ heal: heal.name })}>
                    <span>{heal.displayName}<br /><small>{getBattleItem(heal.name)?.description}</small></span><b>×{heal.quantity}</b>
                  </button>
                ))}
                {((bagTab === 'captura' && items.balls.length === 0) || (bagTab === 'cura' && items.heals.length === 0)) && <p className="battle-message" style={{ minHeight: 0 }}>Nenhum item nesta aba.</p>}
                <button type="button" className="battle-back" onClick={() => setMenu('main')}>Voltar</button>
              </>
            )}
            {!ended && (menu === 'team' || (menu !== null && typeof menu === 'object')) && (
              <>
                {typeof menu === 'object' && menu !== null && <p className="battle-message" style={{ minHeight: 0 }}>Usar {getBattleItem(menu.heal)?.displayName} em quem?</p>}
                {battle.player.team.map((c, index) => {
                  const picking = typeof menu === 'object' && menu !== null ? menu.heal : null;
                  const disabled = busy || (picking === null && (c.hp <= 0 || index === battle.player.active));
                  return <div key={c.ref || index} className="battle-team-choice">
                    <button type="button" className="battle-btn battle-team-row" disabled={disabled}
                      onClick={() => void run(picking ? { kind: 'item', item: picking, target: index } : { kind: 'switch', to: index })}>
                      <span className="battle-team-sprite"><img src={spriteOf(c).sheet} alt="" draggable={false} /></span>
                      <span>{c.name} <small>Nv {c.level}</small>
                        <span className="battle-track"><span className="battle-fill" data-level={level(c.hp, c.stats.hp)} style={{ width: `${(c.hp / c.stats.hp) * 100}%` }} /></span>
                      </span>
                      <small>{c.hp}/{c.stats.hp}</small>
                    </button>
                    <button type="button" className="battle-btn battle-analyze" disabled={busy} onClick={() => setAnalysisIndex(index)}>Analisar IVs</button>
                  </div>;
                })}
                {battle.phase !== 'replace' && <button type="button" className="battle-back" onClick={() => setMenu(typeof menu === 'object' && menu !== null ? 'bag' : 'main')}>Voltar</button>}
              </>
            )}
          </div>
        </div>
      </div>
      <Dialog open={analysisIndex !== null} onOpenChange={(open) => { if (!open) setAnalysisIndex(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Análise de IVs</DialogTitle><DialogDescription>{analysisIndex === null ? '' : battle.player.team[analysisIndex]?.name}</DialogDescription></DialogHeader>
          {analysisIndex !== null && <dl className="grid grid-cols-2 gap-2 text-sm">{Object.entries(battle.player.team[analysisIndex]!.ivs).map(([stat, value]) => <div key={stat} className="flex justify-between rounded-md border p-2"><dt>{({ hp: 'HP', atk: 'Ataque', def: 'Defesa', spa: 'Ataque especial', spd: 'Defesa especial', spe: 'Velocidade' } as Record<string, string>)[stat] ?? stat}</dt><dd>{value}/31</dd></div>)}</dl>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Sem ninguém de pé não há como abrir uma luta contra selvagens: avisa em vez de quebrar a tela. */
export default function BattleScreen(props: ComponentProps<typeof BattleSession>) {
  if (!props.opponent && !canFight(props.game.collection.team)) {
    return (
      <div className="battle-overlay" role="alertdialog" aria-label="Equipe desmaiada">
        <div className="battle-result">
          <h2>Equipe desmaiada</h2>
          <p>{faintedTeamMessage}</p>
          <button type="button" className="battle-btn" onClick={() => props.onFinish((state) => state)}>Voltar</button>
        </div>
      </div>
    );
  }
  return <BattleSession {...props} />;
}
