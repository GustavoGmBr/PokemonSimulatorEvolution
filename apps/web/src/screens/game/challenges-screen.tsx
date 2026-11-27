import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Coins, Shield, Swords } from 'lucide-react';
import { defaultArena } from '@pokesim-evolution/data/arenas';
import { getPokemon } from '@pokesim-evolution/data/pokedex';
import { Button } from '@/components/ui/button';
import { TrainerSpritePreview } from '@/components/sprite-preview';
import { getTrainerSprite } from '@/lib/trainer-sprites';
import type { ChangeGame, GameState } from '@/lib/game-state';
import {
  availableTiers, averageLevel, bossesOf, bossCycle, circuits, circuitUnlocked, gymOpponents, randomTrainers, rescaleOpponent,
  tournamentOpponent, type ChallengeMode, type Opponent, type Tier,
} from '@/lib/battle/challenges';
import { speciesName } from '@/lib/battle/session';
import { earn } from '@/lib/rewards';
import { GameSprite } from './pokedex-media';
import '@/styles/pokedex.css';

const BattleScreen = lazy(() => import('./battle-screen'));
const money = (value: number) => `₽ ${value.toLocaleString('pt-BR')}`;

export default function ChallengesScreen({ mode, game, change }: { mode: ChallengeMode; game: GameState; change: ChangeGame }) {
  // Novo Jogo+ (jogo já zerado): adversários acompanham a média de nível da equipe, sem teto de nível.
  const postGame = game.progress.cycle > 0;
  const average = postGame ? averageLevel(game.collection.team) : undefined;
  const [trainers, setTrainers] = useState(() => mode === 'treinadores' ? randomTrainers(average) : []);
  const seenCycle = useRef(game.progress.cycle);
  const [circuitId, setCircuitId] = useState('kanto');
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  const progress = game.progress.challenges;
  const cycle = bossCycle(now);
  const circuit = circuits.find(({ id }) => id === circuitId) ?? circuits[0]!;
  const tournament = progress.tournament ? tournamentOpponent(progress.tournament, average) : null;

  useEffect(() => {
    // Novo Jogo+ recém-começado: sorteia de novo os treinadores, agora na média da equipe.
    if (game.progress.cycle > seenCycle.current && mode === 'treinadores') setTrainers(randomTrainers(averageLevel(game.collection.team)));
    seenCycle.current = game.progress.cycle;
  }, [game.progress.cycle]);

  useEffect(() => {
    if (mode !== 'chefes') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  let entries: Opponent[] = [];
  if (mode === 'treinadores') entries = average === undefined ? trainers : trainers.map((entry) => rescaleOpponent(entry, average));
  if (mode === 'ginasios' && circuitUnlocked(circuit, progress.defeated)) entries = gymOpponents(circuit, progress.defeated, average);
  if (mode === 'chefes') entries = bossesOf(cycle, average);
  if (mode === 'torneios' && tournament) entries = [tournament];

  function enter(tier: Tier) {
    const seed = Math.floor(Math.random() * 0x7fff_ffff);
    setError(change((state) => {
      if (state.progress.challenges.tournament) return 'Já há um torneio em andamento.';
      if (state.progress.money < tier.fee) return 'Você não tem dinheiro suficiente.';
      return { ...state, progress: { ...state.progress, money: state.progress.money - tier.fee,
        challenges: { ...state.progress.challenges, tournament: { tier: tier.id, round: 1, seed } } } };
    }) ?? '');
  }

  return (
    <section className="game-panel">
      {mode === 'treinadores' && <Button variant="outline" className="w-fit" onClick={() => setTrainers(randomTrainers(average))}>Sortear treinadores</Button>}
      {mode === 'ginasios' && (
        <div className="grid w-full max-w-sm gap-1">
          <label htmlFor="gym-circuit" className="text-sm font-bold">Circuito</label>
          <select id="gym-circuit" className="rounded-md border bg-background p-2 text-sm" value={circuit.id}
            onChange={(event) => setCircuitId(event.target.value)}>
            {circuits.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{circuitUnlocked(entry, progress.defeated) ? '' : ' · bloqueado'}</option>)}
          </select>
          {entries.length === 0 && <p className="text-sm text-muted-foreground">Vença o Campeão do circuito anterior para liberar este circuito.</p>}
        </div>
      )}
      {mode === 'chefes' && <p className="text-sm text-muted-foreground">Próxima rotação em {Math.ceil(((cycle + 1) * 600_000 - now) / 1000)} s. Cada chefe derrotado rende uma Grande Bola e dinheiro.</p>}
      {mode === 'torneios' && !tournament && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {availableTiers(postGame).map((tier) => (
            <article className="game-panel" key={tier.id}>
              <h2 className="game-section-title">{tier.name}</h2>
              <p className="text-sm text-muted-foreground">
                8 rodadas · {'cap' in tier ? `nível máximo ${tier.cap}` : 'níveis acompanham a média da sua equipe'} · prêmio de {money(earn(tier.prize))}
              </p>
              <Button onClick={() => enter(tier)} disabled={game.progress.money < tier.fee}>Inscrever-se · {money(tier.fee)}</Button>
            </article>
          ))}
        </div>
      )}
      {tournament && mode === 'torneios' && <p className="text-sm text-muted-foreground">A equipe começa cada rodada com HP cheio e é curada ao fim de cada luta. O prêmio é entregue ao vencer a final.</p>}

      {entries.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => {
            const sprite = entry.sprite ? getTrainerSprite(entry.sprite) : undefined;
            const partner = entry.partnerSprite ? getTrainerSprite(entry.partnerSprite) : undefined;
            const boss = mode === 'chefes' ? entry.team[0] : undefined;
            const bossSprite = boss ? getPokemon(boss.species)?.sprite : undefined;
            const defeated = mode === 'ginasios' ? progress.defeated.includes(entry.id) :
              mode === 'chefes' && progress.bosses?.cycle === cycle && progress.bosses.defeated.includes(entry.id);
            const underLevel = mode === 'chefes' && !postGame && game.collection.team.some(({ level }) => level < entry.team[0]!.level);
            return (
              <article key={entry.id} className="game-panel">
                <div className="flex items-center gap-3">
                  {boss && bossSprite ? (
                    <GameSprite sprite={bossSprite} shiny={boss.shiny} className="dex-thumb size-14"
                      label={`Sprite de ${entry.name}`} />
                  ) : sprite ? <TrainerSpritePreview sprite={sprite} /> : <Shield size={30} aria-hidden="true" />}
                  {partner && <TrainerSpritePreview sprite={partner} />}
                  <div>
                    <h2 className="game-section-title">{entry.name}</h2>
                    <p className="text-sm text-muted-foreground">{entry.note ?? entry.title}</p>
                  </div>
                </div>
                <p className="text-sm">{entry.team.map(({ species, level }) => `${speciesName(species)} Nv. ${level}`).join(' · ')}</p>
                {entry.reward > 0 && <p className="flex items-center gap-1 text-sm"><Coins size={15} aria-hidden="true" /> {money(entry.reward)}</p>}
                <Button onClick={() => { setError(''); setOpponent(entry); }}
                  disabled={defeated || underLevel || entry.team.length === 0 || game.collection.team.length === 0}>
                  <Swords /> {defeated ? 'Já derrotado' : underLevel ? 'Nível insuficiente' : 'Batalhar'}
                </Button>
              </article>
            );
          })}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {opponent && (
        <Suspense fallback={<div className="battle-overlay" role="status">Preparando a batalha…</div>}>
          <BattleScreen key={opponent.id} opponent={opponent} game={game} scene={defaultArena} onFinish={(settle) => {
            setError(change(settle) ?? '');
            setOpponent(null);
            if (mode === 'treinadores') setTrainers(randomTrainers(average));
          }} />
        </Suspense>
      )}
    </section>
  );
}
