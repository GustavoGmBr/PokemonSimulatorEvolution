import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChangeGame, GameState, GameUpdate } from '@/lib/game-state';
import { applyLineup, boxPokemon, createUid } from '@/lib/pokemon-collection';
import { itemName } from '@/lib/training';
import { claimMission, missionCount, missionDuration, missionList, missionsAt } from '@/lib/missions';
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
