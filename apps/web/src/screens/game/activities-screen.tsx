import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChangeGame, GameState, GameUpdate } from '@/lib/game-state';
import { applyLineup, boxPokemon, createUid } from '@/lib/pokemon-collection';
import { itemName } from '@/lib/training';
import { claimMission, missionCount, missionDuration, missionList, missionsAt } from '@/lib/missions';
import { casinoAction, casinoPrizes, stakeCandidates, startCasino } from '@/lib/casino';
import * as rules from '@/lib/battle/casino-rules';
import { pokemonName } from './pokemon-ui';

type Props = { game: GameState; change: ChangeGame };

export function MissionsScreen({ game, change }: Props) {
  const [now, setNow] = useState(Date.now);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const state = missionsAt(game, now);
  const rows = missionList(state.period);
  return <section className="game-panel">
    <p className="text-sm text-muted-foreground">Renovação em {Math.max(0, Math.ceil(((state.period + 1) * missionDuration - now) / 60000))} min.</p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map((goal) => {
      const count = Math.min(goal.target, missionCount(state, goal.kind));
      const claimed = state.claimed.includes(goal.index);
      return <article key={goal.index} className="game-panel">
        <h2 className="font-bold">{goal.label}</h2>
        <progress aria-label={goal.label} value={count} max={goal.target} className="w-full accent-green-800" />
        <p className="text-sm">{count} / {goal.target} · {goal.chips} fichas · ₽ {goal.money} · {itemName(goal.item)} e essência</p>
        <Button disabled={claimed || count < goal.target} onClick={() => setMessage(change(claimMission(goal.index, state.period)) ?? 'Prêmio resgatado.')}>
          {claimed ? 'Resgatado' : 'Resgatar prêmio'}
        </Button>
      </article>;
    })}</div>
    <Button variant="outline" disabled={state.claimed.length !== 10} onClick={() => setMessage(change(claimMission(10, state.period)) ?? 'Bônus resgatado.')}>
      {state.claimed.includes(10) ? 'Bônus resgatado' : 'Resgatar bônus das dez missões'}
    </Button>
    {message && <p role="status">{message}</p>}
  </section>;
}

export function LineupsScreen({ game, change }: Props) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string>();
  const [picked, setPicked] = useState(game.collection.team.map(({ uid }) => uid));
  const [message, setMessage] = useState('');
  const teams = game.progress.lineups ?? [];
  const roster = [...game.collection.team, ...boxPokemon(game.collection).map(({ pokemon }) => pokemon)];
  const names = new Map(roster.map((pokemon) => [pokemon.uid, pokemonName(pokemon)]));
  function apply(update: GameUpdate, success: string) { setMessage(change(update) ?? success); }

  return <section className="game-panel">
    <form className="grid gap-2" onSubmit={(event) => {
      event.preventDefault();
      const label = name.trim();
      if (!label || !picked.length || picked.some((uid) => !names.has(uid))) return;
      const id = editing ?? createUid();
      apply((state) => {
        const current = state.progress.lineups ?? [];
        if (current.length >= 20 && !current.some((team) => team.id === id)) return 'Limite de 20 equipes atingido.';
        const saved = { id, name: label, uids: picked };
        const lineups = editing ? current.map((team) => team.id === id ? saved : team) : [...current, saved];
        return { ...state, progress: { ...state.progress, lineups } };
      }, 'Equipe salva.');
      setEditing(undefined);
      setName('');
    }}>
      <label htmlFor="lineup-name" className="font-bold">Nome da equipe</label>
      <Input id="lineup-name" required maxLength={24} value={name} onChange={(event) => setName(event.target.value)} />
      <fieldset className="grid max-h-52 gap-1 overflow-auto rounded-lg border p-2 sm:grid-cols-2">
        <legend className="text-sm">Equipe e PC · {picked.length}/6 selecionados</legend>
        {roster.map((pokemon) => <label key={pokemon.uid} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={picked.includes(pokemon.uid)} disabled={!picked.includes(pokemon.uid) && picked.length >= 6}
            onChange={() => setPicked((previous) => previous.includes(pokemon.uid) ? previous.filter((id) => id !== pokemon.uid) : [...previous, pokemon.uid])} />
          {pokemonName(pokemon)} · Nv. {pokemon.level}
        </label>)}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!name.trim() || !picked.length || picked.some((uid) => !names.has(uid))}>{editing ? 'Atualizar equipe' : 'Salvar equipe'}</Button>
        <Button type="button" variant="outline" onClick={() => { setName(''); setEditing(undefined); setPicked(game.collection.team.map(({ uid }) => uid)); }}>Usar equipe atual</Button>
      </div>
    </form>
    {teams.map((team) => <article key={team.id} className="rounded-lg border p-3">
      <h2 className="font-bold">{team.name}</h2>
      <p className="mb-2 text-sm">{team.uids.map((uid) => names.get(uid) ?? 'Saiu da coleção').join(' · ')}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => apply((state) => {
          const collection = applyLineup(state.collection, team.uids);
          return typeof collection === 'string' ? collection : { ...state, collection };
        }, 'Equipe ativa atualizada.')}>Aplicar</Button>
        <Button size="sm" variant="outline" onClick={() => { setEditing(team.id); setName(team.name); setPicked(team.uids.filter((uid) => names.has(uid))); }}>Editar</Button>
        <Button size="sm" variant="outline" onClick={() => apply((state) => ({ ...state, progress: {
          ...state.progress, lineups: (state.progress.lineups ?? []).filter(({ id }) => id !== team.id),
        } }), 'Formação excluída.')}>Excluir formação</Button>
      </div>
    </article>)}
    {message && <p role="status">{message}</p>}
  </section>;
}

export function CasinoScreen({ game, change }: Props) {
  const [id, setId] = useState<rules.CasinoGame>('slots');
  const [chips, setChips] = useState('25');
  const [uid, setUid] = useState('');
  const [pick, setPick] = useState(0);
  const [roulette, setRoulette] = useState('color:red');
  const [message, setMessage] = useState('');
  const [grid, setGrid] = useState<rules.SlotCell[]>();
  const round = game.progress.casinoRound;
  const visible = round?.game ?? id;
  const candidates = stakeCandidates(game);
  function run(action: (current: GameState) => ReturnType<typeof startCasino>) {
    let feedback = '';
    let symbols: rules.SlotCell[] | undefined;
    const error = change((current) => {
      const result = action(current);
      if (typeof result === 'string') return result;
      feedback = result.message;
      symbols = result.grid;
      return result.state;
    });
    setMessage(error ?? feedback);
    setGrid(symbols);
  }
  const play = (action: Parameters<typeof casinoAction>[1], index?: number) => run((current) => casinoAction(current, action, index));
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,.6fr)]">
    <section className="game-panel self-start">
      <h2 className="game-section-title">{rules.CASINO_NAMES[visible]}</h2>
      <p className="font-bold">{game.progress.casinoChips.toLocaleString('pt-BR')} fichas</p>
      {!round && <>
        <label className="grid gap-1 text-sm">Jogo
          <select className="rounded-md border p-2" value={id} onChange={(event) => { setId(event.target.value as rules.CasinoGame); setPick(0); setGrid(undefined); setMessage(''); }}>
            {rules.CASINO_GAMES.map((gameId) => <option key={gameId} value={gameId}>{rules.CASINO_NAMES[gameId]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Apostar
          <select className="rounded-md border p-2" value={uid} onChange={(event) => setUid(event.target.value)}>
            <option value="">Fichas</option>
            {candidates.map((pokemon) => <option key={pokemon.uid} value={pokemon.uid}>{pokemonName(pokemon)} · Nv. {pokemon.level}</option>)}
          </select>
        </label>
        {uid ? <p className="text-sm text-destructive">Uma derrota remove o Pokémon apostado da coleção.</p> :
          <label className="grid gap-1 text-sm">Quantidade de fichas<Input type="number" min={1} max={rules.MAX_BET} value={chips} onChange={(event) => setChips(event.target.value)} /></label>}
        {id === 'roulette' && <label className="grid gap-1 text-sm">Aposta da roleta
          <select className="rounded-md border p-2" value={roulette} onChange={(event) => setRoulette(event.target.value)}>
            {['red:Vermelho', 'black:Preto', 'green:Verde'].map((entry) => { const [value, label] = entry.split(':'); return <option key={value} value={`color:${value}`}>{label}</option>; })}
            <option value="parity:odd">Ímpar</option><option value="parity:even">Par</option>
            <option value="half:low">1 a 18</option><option value="half:high">19 a 36</option>
            <option value="dozen:1">1ª dúzia</option><option value="dozen:2">2ª dúzia</option><option value="dozen:3">3ª dúzia</option>
            {Object.keys(rules.GROUP_SPECIES).map((value) => <option key={value} value={`group:${value}`}>Grupo {value}</option>)}
            {Array.from({ length: 37 }, (_, value) => <option key={value} value={`number:${value}`}>Número {value}</option>)}
          </select>
        </label>}
        {(['race', 'doors', 'duel'] as const).some((type) => type === id) && <label className="grid gap-1 text-sm">Escolha
          <select className="rounded-md border p-2" value={pick} onChange={(event) => setPick(Number(event.target.value))}>
            {(id === 'race' ? ['Pikachu', 'Rapidash', 'Arcanine', 'Jolteon', 'Ninjask'] :
              id === 'duel' ? rules.DUEL_TYPES.map(({ name }) => name) : ['Porta 1', 'Porta 2', 'Porta 3'])
              .map((label, i) => <option key={label} value={i}>{label}</option>)}
          </select>
        </label>}
        <Button disabled={!uid && game.progress.casinoChips < 1} onClick={() => {
          const [kind, value] = roulette.split(':');
          const bet = rules.parseRouletteBet({ kind, value: kind === 'number' || kind === 'dozen' ? Number(value) : value });
          run((current) => startCasino(current, id, Number(chips), uid, pick, bet));
        }}>Jogar</Button>
      </>}
      {grid && <div className="grid grid-cols-3 gap-1">{grid.map((symbol, i) => <span key={i} className="rounded-md border p-2 text-center text-xs">{symbol === 'empty' ? '—' : itemName(symbol)}</span>)}</div>}
      {round?.game === 'voltorb' && <div className="grid grid-cols-6 gap-1">{round.state.board.map((value, i) => {
        const revealed = round.state.revealed.includes(i);
        return <Button key={i} size="sm" variant="outline" className="px-0" aria-label={`Carta ${i + 1}`} disabled={revealed} onClick={() => play('play', i)}>{revealed ? `${value}×` : '?'}</Button>;
      })}</div>}
      {round?.game === 'jack' && <div className="grid gap-2">
        <p>Você: {round.state.player.map(({ rank, suit }) => rank + suit).join(' ')} · {rules.handValue(round.state.player).total}</p>
        <p>Banca: {round.state.dealer[0]?.rank}{round.state.dealer[0]?.suit} + ?</p>
        <Button variant="outline" disabled={Boolean(round.stake.uid) || round.state.player.length !== 2 || game.progress.casinoChips < round.stake.chips} onClick={() => play('double')}>Dobrar</Button>
      </div>}
      {round?.game === 'piplup' && <p>Saltos: {round.state.jumps} / {rules.PIPLUP_PAYS.length}</p>}
      {round && <div className="flex flex-wrap gap-2">
        {round.game !== 'voltorb' && <Button onClick={() => play('play')}>{round.game === 'jack' ? 'Pedir carta' : 'Pular'}</Button>}
        <Button disabled={round.game === 'piplup' && round.state.jumps === 0 || round.game === 'voltorb' && !round.state.revealed.length} variant="outline" onClick={() => play('take')}>{round.game === 'jack' ? 'Parar' : 'Resgatar'}</Button>
        <Button variant="destructive" onClick={() => play('abandon')}>Abandonar aposta</Button>
      </div>}
      {message && <p role="status">{message}</p>}
      {game.progress.casinoChips === 0 && !round && <p className="text-sm text-muted-foreground">Resgate missões para ganhar fichas.</p>}
    </section>
    <section className="game-panel">
      <h2 className="game-section-title">Loja de prêmios</h2>
      {casinoPrizes.map(([item, price]) => <Button key={item} variant="outline" className="justify-between whitespace-normal"
        disabled={game.progress.casinoChips < price || (game.progress.bag[item] ?? 0) >= 99}
        onClick={() => setMessage(change((current) => {
          if (current.progress.casinoChips < price || (current.progress.bag[item] ?? 0) >= 99) return 'Saldo insuficiente ou mochila cheia.';
          return { ...current, progress: { ...current.progress, casinoChips: current.progress.casinoChips - price,
            bag: { ...current.progress.bag, [item]: (current.progress.bag[item] ?? 0) + 1 } } };
        }) ?? 'Prêmio recebido.')}>{itemName(item)} <span>{price.toLocaleString('pt-BR')} fichas</span></Button>)}
    </section>
  </div>;
}
