import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Coins, Keyboard, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { battleMoves, type Move } from '@pokesim-evolution/data/battle-data';
import { loadTmMoves } from '@pokesim-evolution/data/battle-tms';
import { Button } from '@/components/ui/button';
import { onCollection, type ChangeGame, type GameState } from '@/lib/game-state';
import type { OwnedPokemon } from '@/lib/pokemon-collection';
import { battleKeyActions, resetBattleKeys, setBattleKey, useBattleKeys, type BattleKeyAction } from '@/lib/battle-keys';
import {
  buyTm, currentMoves, forgetMove, learnableMoves, maxMoves, reorderMoves, resolvePending, teachMove, type Learnable,
} from '@/lib/battle/moveset';
import { AREA_LABEL, isAreaMove } from '@/lib/battle/area';
import { TypeBadge } from './pokedex-media';
import '@/styles/moves.css';

const money = (value: number) => `₽ ${value.toLocaleString('pt-BR')}`;
const categoryLabel = { physical: 'Físico', special: 'Especial', status: 'Status' } as const;

function Stats({ move }: { move: Move }) {
  return (
    <span className="mv-stats">
      {categoryLabel[move.category]} · {move.category === 'status' ? 'sem dano' : `poder ${move.power}`} · {move.accuracy === null ? 'não erra' : `${move.accuracy}%`} · PP {move.pp}
      {isAreaMove(move) && <> · <b className="mv-area" title="Atinge todos os adversários de uma horda">{AREA_LABEL}</b></>}
    </span>
  );
}

type Panel = null | 'learn' | { place: string; price?: number } | { pending: string };

/** Golpes do Pokémon: vagas e ordem, aprender por nível ou TM (comprada por Pokémon), golpes à espera de vaga e atalhos da batalha. */
export function MovesSection({ pokemon, state, change }: { pokemon: OwnedPokemon; state: GameState; change: ChangeGame }) {
  const keys = useBattleKeys();
  const [tmNames, setTmNames] = useState<string[] | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [tab, setTab] = useState<'level' | 'machine'>('level');
  const [message, setMessage] = useState('');
  const [binding, setBinding] = useState<BattleKeyAction | null>(null);

  useEffect(() => {
    let active = true;
    setTmNames(null);
    void loadTmMoves(pokemon.species).then((names) => { if (active) setTmNames(names); }, () => { if (active) setTmNames([]); });
    return () => { active = false; };
  }, [pokemon.species]);

  // Ouve a próxima tecla para trocar um atalho; Esc cancela.
  useEffect(() => {
    if (!binding) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') { setBinding(null); return; }
      const problem = setBattleKey(binding, event.key);
      setMessage(problem ?? '');
      if (!problem) setBinding(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [binding]);

  const known = currentMoves(pokemon);
  const pending = (pokemon.pendingMoves ?? []).filter((name) => battleMoves.has(name) && !known.includes(name));
  const learnable: Learnable[] = tmNames ? learnableMoves(pokemon, tmNames) : [];
  const shown = learnable.filter((entry) => entry.source === tab);

  const run = (operation: Parameters<typeof onCollection>[0]) => setMessage(change(onCollection(operation)) ?? '');
  const free = known.length < maxMoves;

  function teach(name: string, slot: number) {
    const problem = change(onCollection((collection) => teachMove(collection, pokemon.uid, name, slot, learnable)));
    setMessage(problem ?? '');
    if (!problem) setPanel(null);
  }

  function settlePending(name: string, replace: number | null) {
    const problem = change(onCollection((collection) => resolvePending(collection, pokemon.uid, name, replace)));
    setMessage(problem ?? '');
    if (!problem) setPanel(null);
  }

  /** Escolha da vaga: vaga livre (se houver) ou golpe a esquecer. */
  function slotPicker(onPick: (slot: number) => void, title: string, extra?: React.ReactNode) {
    return (
      <div className="mv-picker" role="group" aria-label={title}>
        <p className="text-sm font-bold">{title}</p>
        {free && <Button variant="outline" size="sm" onClick={() => onPick(known.length)}><Plus /> Vaga livre ({known.length + 1})</Button>}
        {known.map((name, index) => (
          <Button key={name} variant="outline" size="sm" onClick={() => onPick(index)}>
            Esquecer {battleMoves.get(name)?.displayName ?? name} <span className="mv-stats">(vaga {index + 1})</span>
          </Button>
        ))}
        {extra}
        <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>Cancelar</Button>
      </div>
    );
  }

  const placing = typeof panel === 'object' && panel && 'place' in panel ? panel.place : null;
  const resolving = typeof panel === 'object' && panel && 'pending' in panel ? panel.pending : null;

  return (
    <section className="grid gap-3" aria-labelledby="panel-moves">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="panel-moves" className="game-section-title">Golpes</h3>
        <span className="mv-money"><Coins aria-hidden="true" /> {money(state.progress.money)}</span>
      </div>

      <ol className="mv-list" aria-label="Golpes que ele conhece, na ordem da batalha">
        {Array.from({ length: maxMoves }, (_, index) => {
          const name = known[index];
          const move = name ? battleMoves.get(name) : undefined;
          const action = battleKeyActions[index]!;
          if (!move) {
            return (
              <li key={`free-${index}`} className="mv-row mv-row-empty">
                <span className="mv-slot" aria-hidden="true">{index + 1}</span>
                <span className="text-sm text-muted-foreground">Vaga livre</span>
              </li>
            );
          }
          return (
            <li key={move.name} className="mv-row">
              <span className="mv-slot" aria-hidden="true">{index + 1}</span>
              <span className="min-w-0">
                <strong className="block truncate">{move.displayName}</strong>
                <Stats move={move} />
              </span>
              <TypeBadge type={move.type} />
              <kbd className="game-key" title="Atalho na batalha">{keys[action.id]}</kbd>
              <span className="mv-actions">
                <Button variant="outline" size="icon-sm" disabled={index === 0} aria-label={`Subir ${move.displayName}`}
                  onClick={() => run((collection) => reorderMoves(collection, pokemon.uid, index, index - 1))}><ArrowUp /></Button>
                <Button variant="outline" size="icon-sm" disabled={index >= known.length - 1} aria-label={`Descer ${move.displayName}`}
                  onClick={() => run((collection) => reorderMoves(collection, pokemon.uid, index, index + 1))}><ArrowDown /></Button>
                <Button variant="outline" size="icon-sm" className="text-destructive" disabled={known.length <= 1}
                  title={known.length <= 1 ? 'Ele precisa de pelo menos um golpe' : undefined} aria-label={`Esquecer ${move.displayName}`}
                  onClick={() => run((collection) => forgetMove(collection, pokemon.uid, index))}><Trash2 /></Button>
              </span>
            </li>
          );
        })}
      </ol>

      {pending.length > 0 && (
        <div className="mv-pending" role="group" aria-label="Golpes esperando uma vaga">
          <p className="text-sm font-bold">Querem ser aprendidos</p>
          {pending.map((name) => {
            const move = battleMoves.get(name)!;
            return (
              <div key={name} className="mv-row">
                <span className="min-w-0 grow"><strong className="block truncate">{move.displayName}</strong><Stats move={move} /></span>
                <TypeBadge type={move.type} />
                <Button size="sm" variant="outline" onClick={() => setPanel({ pending: name })}>Aprender</Button>
                <Button size="sm" variant="ghost" onClick={() => settlePending(name, null)}>Descartar</Button>
              </div>
            );
          })}
        </div>
      )}
      {resolving && slotPicker((slot) => settlePending(resolving, slot), `Onde guardar ${battleMoves.get(resolving)?.displayName ?? resolving}?`)}

      <div className="flex flex-wrap gap-2">
        <Button variant={panel === 'learn' ? 'default' : 'outline'} aria-expanded={panel === 'learn'}
          onClick={() => setPanel(panel === 'learn' ? null : 'learn')}><Plus /> Aprender golpe</Button>
      </div>

      {panel === 'learn' && (
        <div className="mv-learn">
          <div className="mv-tabs" role="tablist" aria-label="Origem do golpe">
            <button type="button" role="tab" aria-selected={tab === 'level'} onClick={() => setTab('level')}>Por nível</button>
            <button type="button" role="tab" aria-selected={tab === 'machine'} onClick={() => setTab('machine')}>TMs</button>
          </div>
          {tab === 'machine' && <p className="text-xs text-muted-foreground">Cada TM é comprada uma vez para este Pokémon e fica com ele para sempre.</p>}
          {tmNames === null && <p role="status" className="text-sm text-muted-foreground">Carregando…</p>}
          {tmNames !== null && shown.length === 0 && (
            <p className="text-sm text-muted-foreground">{tab === 'level' ? 'Nenhum golpe por nível disponível.' : 'Este Pokémon não aprende golpes por TM.'}</p>
          )}
          <ul className="mv-learn-list">
            {shown.map((entry) => (
              <li key={entry.move.name} className="mv-row">
                <span className="min-w-0 grow">
                  <strong className="block truncate">{entry.move.displayName}</strong>
                  <Stats move={entry.move} />
                </span>
                <TypeBadge type={entry.move.type} />
                <span className="mv-extra">{entry.source === 'level' ? `Nv ${entry.level}` : entry.owned ? 'TM comprada' : money(entry.price)}</span>
                {entry.known ? <span className="mv-known">Já sabe</span>
                  : entry.owned ? <Button size="sm" variant="outline" onClick={() => setPanel({ place: entry.move.name })}>Ensinar</Button>
                    : <Button size="sm" disabled={state.progress.money < entry.price} aria-label={`Comprar TM de ${entry.move.displayName} por ${money(entry.price)}`}
                      onClick={() => setMessage(change((current) => buyTm(current, pokemon.uid, entry.move.name, learnable)) ?? '')}>Comprar</Button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {placing && slotPicker((slot) => teach(placing, slot), `Onde guardar ${battleMoves.get(placing)?.displayName ?? placing}?`)}

      <details className="mv-keys">
        <summary><Keyboard aria-hidden="true" /> Atalhos de batalha</summary>
        <p className="text-xs text-muted-foreground">Os golpes seguem a ordem das vagas acima. Escolha “Alterar” e aperte a nova tecla; se ela já tiver dono, as duas trocam.</p>
        <dl className="mv-key-list">
          {battleKeyActions.map((action) => (
            <div key={action.id}>
              <dt>{action.label}</dt>
              <dd>
                <kbd className="game-key">{binding === action.id ? '…' : keys[action.id]}</kbd>
                <Button size="xs" variant="outline" aria-pressed={binding === action.id}
                  onClick={() => { setMessage(''); setBinding(binding === action.id ? null : action.id); }}>
                  {binding === action.id ? 'Aperte uma tecla (Esc cancela)' : 'Alterar'}
                </Button>
              </dd>
            </div>
          ))}
        </dl>
        <Button size="xs" variant="ghost" onClick={() => { setBinding(null); resetBattleKeys(); setMessage(''); }}><RotateCcw /> Restaurar padrão</Button>
      </details>

      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    </section>
  );
}
